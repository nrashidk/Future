/**
 * LLM Country Service
 *
 * Auto-populates country data using Anthropic Claude API.
 * Generates vision, strategic objectives, priority sectors, and curriculum-aligned quiz questions.
 *
 * PRIORITY-SECTOR GENERATION lives at the bottom of this file. It is the
 * generated-country equivalent of what server/seed.ts authors by hand for UAE:
 * a priority sector is only real once it has (a) a sparse, contrastive WEF skill
 * vector in country_sector_wef_skills and (b) category rules in
 * country_sector_categories. Without (b) calculateVisionScore returns the floor
 * for every career (server/services/matching.ts) - an inert vision component.
 * See docs/priority-alignment-plan.md section 7.
 */

import type { IStorage } from "../storage";
import { normalizeCareerSubjects } from "../utils/subjectMap";
import { deriveReadiness } from "./futureReadiness";
import { isOnetGrowthBand } from "@shared/growthBands";

interface CountryResearchResult {
  success: boolean;
  data?: CountryData;
  error?: string;
  tokensUsed?: number;
}

interface CountryData {
  mission: string;
  vision: string;
  visionPlan: string;
  prioritySectors: string[];
  nationalGoals: string[];
  educationSystem: string;
  universitiesLink: string;
  universitiesLinkLabel: string;
  curricula: string[];
  subjects: string[];
  gradeLevels: string[];
  targets: {
    year: number;
    description: string;
  }[];
}

interface QuizGenerationResult {
  success: boolean;
  questions?: GeneratedQuestion[];
  error?: string;
  tokensUsed?: number;
}

interface GeneratedQuestion {
  question: string;
  questionType: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  subject: string;
  grade: number;
  curriculum: string;
  topic: string;
  difficulty: string;
  cognitiveLevel: string;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_RESEARCH = 2000;
const MAX_TOKENS_QUESTIONS = 3000;
const TEMPERATURE = 0.7;
const API_TIMEOUT_MS = 60000;
// A server-tool turn is far slower than a plain completion: every web_search
// round-trips to Anthropic's search infrastructure before the model resumes.
const TOOL_TIMEOUT_MS = 240000;
// Hard ceiling on pause_turn continuations, so a model that keeps searching
// cannot spin one HTTP exchange forever.
const MAX_TOOL_ROUNDS = 8;

interface AnthropicCallOptions {
  /**
   * Server-side tools to expose. Used only by the priority-sector generator,
   * which passes WEB_SEARCH_TOOL so the model sources from live pages instead
   * of recall. Anything here runs on Anthropic's side - there is no local
   * tool-execution loop in this file.
   */
  tools?: unknown[];
}

interface AnthropicCallResult {
  content: string;
  tokensUsed: number;
  /**
   * Every URL the server-side web-search tool actually returned, de-duplicated
   * and in order. Empty when no tool ran - which is how the caller knows the
   * answer came from recall rather than from live pages.
   */
  citations: string[];
}

/**
 * The Anthropic server-side web-search tool.
 *
 * Owner requirement (docs/priority-alignment-plan.md section 7): country data must
 * be sourced from live official government pages, not model recall. This is the
 * mechanism. `web_search_20260209` is the dynamic-filtering variant supported by
 * the model this file targets; older models take `web_search_20250305`, and on
 * Vertex AI only the older variant exists. `allowed_domains` accepts plain
 * hostnames (subdomains included) and is the hard half of the "official sources
 * only" rule - the prompt and the provenance gate are the soft halves.
 */
export const WEB_SEARCH_TOOL_TYPE = "web_search_20260209";

export function buildWebSearchTool(allowedDomains?: string[]): Record<string, unknown> {
  return {
    type: WEB_SEARCH_TOOL_TYPE,
    name: "web_search",
    max_uses: 12,
    ...(allowedDomains && allowedDomains.length > 0
      ? { allowed_domains: allowedDomains }
      : {}),
  };
}

/**
 * URLs the server-side tool actually returned.
 *
 * Two shapes carry them: the `web_search_tool_result` block (its `content` is a
 * LIST of results on success and a single error OBJECT on failure - hence the
 * Array.isArray guard, since a tool error arrives as HTTP 200, not an
 * exception), and `citations` attached to text blocks.
 */
function extractCitationUrls(blocks: any[]): string[] {
  const urls: string[] = [];
  for (const block of blocks) {
    if (block?.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const result of block.content) {
        if (typeof result?.url === "string") urls.push(result.url);
      }
    }
    if (block?.type === "text" && Array.isArray(block.citations)) {
      for (const citation of block.citations) {
        if (typeof citation?.url === "string") urls.push(citation.url);
      }
    }
  }
  return Array.from(new Set(urls));
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  options: AnthropicCallOptions = {}
): Promise<AnthropicCallResult> {
  const hasTools = !!options.tools && options.tools.length > 0;
  const timeoutMs = hasTools ? TOOL_TIMEOUT_MS : API_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // A transcript, not a single message: a server-tool turn can come back with
  // stop_reason "pause_turn", and resuming it means handing the assistant
  // blocks we just received straight back. Without this the searching turn is
  // abandoned and the JSON answer never arrives.
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: userPrompt },
  ];

  let tokensUsed = 0;
  const citations: string[] = [];

  try {
    for (let round = 1; ; round++) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: maxTokens,
          temperature: TEMPERATURE,
          system: systemPrompt,
          messages,
          ...(hasTools ? { tools: options.tools } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMessage = "Unknown error";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(`Anthropic API error: ${response.status} - ${errorMessage}`);
      }

      const data = await response.json();
      const blocks: any[] = Array.isArray(data.content) ? data.content : [];
      tokensUsed += (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);
      citations.push(...extractCitationUrls(blocks));

      if (data.stop_reason === "pause_turn" && round < MAX_TOOL_ROUNDS) {
        messages.push({ role: "assistant", content: data.content });
        continue;
      }

      clearTimeout(timeoutId);
      // Join the text blocks of the FINAL turn only. Concatenating every round
      // would feed safeParseJSON a string whose greedy `\{[\s\S]*\}` fallback
      // spans from the first brace of the model's search narration to the last
      // brace of the answer - and parses neither. Within one turn the join is
      // still needed: with a server tool in play the JSON answer is the LAST
      // text block, not the first.
      const content = blocks
        .filter(b => b?.type === "text" && typeof b.text === "string")
        .map(b => b.text)
        .join("");

      return { content, tokensUsed, citations: Array.from(new Set(citations)) };
    }
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Anthropic API request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
    }
    throw error;
  }
}

function safeParseJSON<T>(content: string, defaultValue: T): T {
  if (!content || content.trim() === "") {
    return defaultValue;
  }

  try {
    const result = JSON.parse(content);
    if (result && typeof result === "object") {
      return result as T;
    }
    return defaultValue;
  } catch (error) {
    console.error("Failed to parse LLM JSON response:", error);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  }
}

/**
 * Research country data using LLM
 */
export async function researchCountryData(
  storage: IStorage,
  countryName: string,
  countryCode: string
): Promise<CountryResearchResult> {
  try {
    const credential = await storage.getApiCredential("anthropic");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "Anthropic API key not configured or inactive",
      };
    }

    const systemPrompt = `You are an expert researcher on education systems and national development strategies. 
You provide accurate, well-researched information about countries' education systems, national visions, and development goals.
Always respond with valid JSON only — no markdown fences, no explanatory text before or after the JSON object.`;

    const userPrompt = `Research and provide comprehensive information about ${countryName} (${countryCode}) for a career guidance platform targeting students aged 13-18.

Provide the following information in JSON format:
{
  "mission": "The country's national mission statement or core purpose (2-3 sentences)",
  "vision": "The country's national vision statement, like 'UAE Vision 2071' (2-3 sentences)",
  "visionPlan": "The main national development plan name, e.g., 'Vision 2030', 'National Development Plan 2024'",
  "prioritySectors": ["Array of 5-8 key priority economic sectors for national development"],
  "nationalGoals": ["Array of 5-8 key national strategic goals related to economy, education, innovation"],
  "educationSystem": "Brief description of the education system (grade levels, structure, key features) in 2-3 sentences",
  "universitiesLink": "URL to the official higher education accreditation body or ministry website",
  "universitiesLinkLabel": "Display name for the link, e.g., 'Ministry of Education' or 'Higher Education Commission'",
  "curricula": ["Array of curricula used in the country, e.g., 'National Curriculum', 'CBSE', 'IB', 'Cambridge', 'American'"],
  "subjects": ["Array of 6-8 core school subjects commonly taught, e.g., 'Mathematics', 'Science', 'English', 'History'"],
  "gradeLevels": ["8", "9", "10", "11", "12"],
  "targets": [
    {"year": 2030, "description": "Key development target for this year"},
    {"year": 2040, "description": "Key development target for this year if applicable"}
  ]
}

Focus on accurate, verifiable information. For subjects, use the actual names used in that country's education system.`;

    const { content, tokensUsed } = await callAnthropic(
      credential.apiKey,
      systemPrompt,
      userPrompt,
      MAX_TOKENS_RESEARCH
    );

    const defaultData: CountryData = {
      mission: "",
      vision: "",
      visionPlan: "",
      prioritySectors: [],
      nationalGoals: [],
      educationSystem: "",
      universitiesLink: "",
      universitiesLinkLabel: "",
      curricula: [],
      subjects: ["Mathematics", "Science", "English", "Social Studies", "Computer Science"],
      gradeLevels: ["8", "9", "10", "11", "12"],
      targets: [],
    };

    const data = safeParseJSON<CountryData>(content, defaultData);

    if (!data.mission && !data.vision && !data.visionPlan) {
      return {
        success: false,
        error: "Failed to parse country data from AI response",
        tokensUsed,
      };
    }

    return {
      success: true,
      data,
      tokensUsed,
    };
  } catch (error) {
    console.error("Error researching country data:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Generate curriculum-aligned quiz questions for a country
 */
export async function generateCountryQuizQuestions(
  storage: IStorage,
  countryId: string,
  countryName: string,
  subject: string,
  grade: number,
  curriculum: string,
  count: number = 10
): Promise<QuizGenerationResult> {
  try {
    const credential = await storage.getApiCredential("anthropic");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "Anthropic API key not configured or inactive",
      };
    }

    const systemPrompt = `You are an expert curriculum developer specializing in creating high-quality assessment questions aligned with national curricula.
Your questions must be:
- Age-appropriate for the specified grade level
- Aligned with the specified curriculum standards
- Varied in difficulty and cognitive levels (Bloom's Taxonomy)
- Culturally relevant to the specified country
Always respond with valid JSON only — no markdown fences, no explanatory text before or after the JSON object.`;

    const userPrompt = `Generate ${count} multiple-choice quiz questions for:
- Country: ${countryName}
- Subject: ${subject}
- Grade: ${grade}
- Curriculum: ${curriculum}

Requirements:
1. Questions should be curriculum-aligned and grade-appropriate
2. Include a mix of difficulties: 30% easy, 50% medium, 20% hard
3. Cover different cognitive levels: knowledge, comprehension, application, analysis
4. Make questions culturally relevant where appropriate
5. Each question must have exactly 4 options
6. Provide clear explanations for correct answers

Respond with JSON in this format:
{
  "questions": [
    {
      "question": "The question text",
      "questionType": "multiple_choice",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "The correct option text exactly as written in options",
      "explanation": "Why this is the correct answer",
      "subject": "${subject}",
      "grade": ${grade},
      "curriculum": "${curriculum}",
      "topic": "Specific topic within the subject (e.g., 'Algebra - Linear Equations')",
      "difficulty": "easy|medium|hard",
      "cognitiveLevel": "knowledge|comprehension|application|analysis"
    }
  ]
}`;

    const { content, tokensUsed } = await callAnthropic(
      credential.apiKey,
      systemPrompt,
      userPrompt,
      MAX_TOKENS_QUESTIONS
    );

    const parsed = safeParseJSON<{ questions: GeneratedQuestion[] }>(content, { questions: [] });

    if (!parsed.questions || parsed.questions.length === 0) {
      return {
        success: false,
        error: "Failed to parse quiz questions from AI response",
        tokensUsed,
      };
    }

    return {
      success: true,
      questions: parsed.questions,
      tokensUsed,
    };
  } catch (error) {
    console.error("Error generating quiz questions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

// ===========================================================================
// PRIORITY-SECTOR GENERATION - docs/priority-alignment-plan.md section 7
// ===========================================================================
//
// What a generated sector must carry before it is worth writing (the
// per-sector generation contract, section 7 of the plan):
//
//   1. A name byte-identical to its countries.prioritySectors entry, and
//      \b-safe, because recommendations.routes.ts localises the rationale by
//      \b-substituting that exact string for its Arabic counterpart.
//   2. A SPARSE 5-7 skill vector with PER-SKILL importance 0-100
//      (country_sector_wef_skills.importance, shared/schema.ts) - not one
//      importance for the whole sector.
//   3. Category rules with 0-100 relevance (country_sector_categories), each
//      carrying provenance in `notes`. Without these calculateVisionScore
//      returns VISION_FLOOR for every career and the whole component is inert.
//   4. At least one career in the live catalog that the sector actually claims.
//
// Skills are chosen for CONTRAST, not relevance. Relevance-only selection is
// what produced the six UAE sector vectors correlating at r = 0.989: every
// sector wants "Critical Thinking" and "Communication", so every sector ends up
// pointing the same direction and the winning sector is decided by rounding.
// The geometric gate below is the enforcement; the prompt is the instruction.

/** The WEF 16-skill vocabulary, verbatim from server/wefSkillsData.ts. */
export const WEF_SKILL_NAMES = [
  "Literacy", "Numeracy", "Scientific Literacy", "ICT Literacy",
  "Financial Literacy", "Cultural and Civic Literacy",
  "Critical Thinking and Problem Solving", "Creativity",
  "Communication", "Collaboration", "Curiosity", "Initiative",
  "Persistence and Grit", "Adaptability", "Leadership",
  "Social and Cultural Awareness",
] as const;

/**
 * The skill columns that carry real information across the career catalog,
 * by per-skill sd over the 37 live careers (plan section 2). Only ~7 of the 16
 * discriminate at all, which is the structural constraint on how many sectors
 * a country can have before their vectors collapse onto each other. A sector
 * SHOULD lead on one of these, and on a DIFFERENT one from its neighbours.
 */
export const DISCRIMINATING_WEF_SKILLS = [
  "Scientific Literacy",        // sd 19.3
  "Financial Literacy",         // sd 15.0
  "Numeracy",                   // sd 14.0
  "Cultural and Civic Literacy",// sd 13.7
  "Social and Cultural Awareness", // sd 13.0
  "ICT Literacy",               // sd 12.7
  "Creativity",                 // sd 12.0
] as const;

/**
 * Dropped from every generated vector. sd 6.9 across the catalog and present in
 * 5 of the 6 original UAE sectors: weight without information, and the single
 * largest contributor to the r = 0.989 collapse (plan section 2).
 */
export const EXCLUDED_WEF_SKILLS = ["Critical Thinking and Problem Solving"] as const;

export const MIN_SKILLS_PER_SECTOR = 5;
export const MAX_SKILLS_PER_SECTOR = 7;

/** Geometric gate: two sectors pointing this much alike are one sector. */
export const GEOMETRIC_GATE_MAX_R = 0.8;

/** Coverage gate: the Technology-catch-all shape, detectable before writing. */
export const MAX_HEADLINE_CATEGORIES = 3;

// Ten sectors x (7 skills + up to 4 category rules + overrides + citations) does
// not fit in the 1500 tokens the old sector call used - it truncated mid-JSON.
const MAX_TOKENS_SECTORS = 8000;

export interface GeneratedSkillWeight {
  skill: string;      // must be one of WEF_SKILL_NAMES
  importance: number; // 0-100, per skill
}

export interface GeneratedCategoryRule {
  category: string;   // must be an existing career.category
  relevance: number;  // 0-100
  notes: string;      // provenance - carries the citation URL
}

export interface GeneratedSector {
  sector: string;
  skills: GeneratedSkillWeight[];
  categoryRules: GeneratedCategoryRule[];
  /** Titles of live careers this sector claims. Empty = an empty label. */
  servingCareers: string[];
  /** Official government URLs the claim rests on. */
  sources: string[];
}

export type GateName = "shape" | "provenance" | "geometric" | "coverage";

export interface GateRejection {
  sector: string;
  gate: GateName;
  reason: string;
}

export interface SectorGenerationResult {
  success: boolean;
  /** Sectors that passed every gate, in the order they should be seeded. */
  mappings?: GeneratedSector[];
  rejected?: GateRejection[];
  warnings?: string[];
  /** True only when the model actually cited live pages. */
  sourcedLive?: boolean;
  error?: string;
  tokensUsed?: number;
}

/** The subset of a career row the gates read. */
export interface CareerLike {
  id?: string;
  title: string;
  description?: string | null;
  category: string;
  requiredSkills?: string[] | null;
  relatedSubjects?: string[] | null;
  educationLevel?: string | null;
  growthOutlook?: string | null;
  /** O*NET projected-growth band, when the generator supplies one. Optional:
   *  deriveReadiness falls back to the WEF role's own pinned O*NET occupation. */
  onetGrowthBand?: string | null;
  onetCode?: string | null;
  valuesProfile?: unknown;
}

export interface SectorGenerationOptions {
  /** Live career catalog. Without it the coverage gate cannot run. */
  careerCatalog?: CareerLike[];
  /** WEF skill names as seeded in this database. Defaults to WEF_SKILL_NAMES. */
  skillNames?: string[];
  /** Official domains to restrict web search to, e.g. ["gov.ae", "u.ae"]. */
  officialDomains?: string[];
  /**
   * Allow the model to answer from recall when the web-search tool is
   * unavailable. Default false: the owner requirement is live, cited,
   * official-government sourcing, so an un-sourced generation is a failure,
   * not a degraded success.
   */
  allowModelRecall?: boolean;
}

// ---------------------------------------------------------------------------
// Skill-name normalisation
// ---------------------------------------------------------------------------

/**
 * "Social & Cultural Awareness" and "social and cultural awareness" are one key.
 * Exported so the persistence layer resolves generated skill names against the
 * seeded wef_skills rows with exactly the same rule the generator used.
 */
export function skillKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildSkillLookup(names: string[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const name of names) lookup.set(skillKey(name), name);
  return lookup;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * A sector's sparse skill list as a dense vector over the 16 WEF skills.
 * An omitted skill is a real 0, not a missing value: that is what makes a
 * sparse vector contrastive in the first place.
 */
export function toSkillVector(
  skills: GeneratedSkillWeight[],
  names: readonly string[] = WEF_SKILL_NAMES,
): number[] {
  const byKey = new Map(skills.map(s => [skillKey(s.skill), s.importance]));
  return names.map(name => byKey.get(skillKey(name)) ?? 0);
}

/** Pearson r. Returns 0 for a degenerate (zero-variance) vector. */
export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let num = 0, devA = 0, devB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    devA += da * da;
    devB += db * db;
  }
  if (devA === 0 || devB === 0) return 0;
  return num / Math.sqrt(devA * devB);
}

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------

/**
 * Exported so the prompt contract is testable without spending a token.
 *
 * The three things this prompt has to get right, all of which the previous
 * version got wrong: per-skill importance (not one score per sector), sparse
 * and contrastive selection (not "the most relevant skills"), and category
 * rules at all (they were never asked for, so they were never written).
 */
export function buildSectorGenerationPrompt(input: {
  countryName: string;
  prioritySectors: string[];
  skillNames: string[];
  categories: string[];
  careersByCategory: Map<string, string[]>;
  officialDomains?: string[];
}): string {
  const { countryName, prioritySectors, skillNames, categories, careersByCategory } = input;

  const catalog = Array.from(careersByCategory.entries())
    .map(([category, titles]) => `- ${category}: ${titles.join(", ")}`)
    .join("\n");

  const domainRule = input.officialDomains && input.officialDomains.length > 0
    ? `Search ONLY these domains: ${input.officialDomains.join(", ")}.`
    : `Search ONLY official ${countryName} government domains — ministries, the national vision/strategy portal, the statistics authority, the central bank, and government-owned sector authorities. Do not use news sites, consultancies, Wikipedia, or encyclopaedic sources.`;

  return `Build the priority-sector scoring configuration for ${countryName}.

SOURCING (hard requirement)
${domainRule}
Use the web_search tool before answering. Every sector must carry at least one URL you actually opened, and every category rule's "notes" must end with the citation it rests on, in the form [source: https://...]. Do not answer from memory: if you cannot find an official source for a sector, omit that sector.

PRIORITY SECTORS (use these names EXACTLY as written, byte for byte)
${prioritySectors.map(s => `- ${s}`).join("\n")}

PART 1 — the WEF skill vector, per sector
Available WEF skills: ${skillNames.join(", ")}

Rules, all of them binding:
1. Give each sector ${MIN_SKILLS_PER_SECTOR} to ${MAX_SKILLS_PER_SECTOR} skills — a SPARSE vector. Skills you omit count as 0.
2. Give EVERY listed skill its own "importance" from 0 to 100. There is no single score for a sector.
3. Choose skills for CONTRAST, not for relevance. Nearly every sector "needs" communication and teamwork; saying so about all of them makes every sector identical and the scoring engine can then no longer tell them apart. Ask instead: which skills does THIS sector need MORE than the other sectors on the list?
4. Each sector must be LED (highest importance) by a DIFFERENT skill from every other sector. Prefer these high-variance skills as leads: ${DISCRIMINATING_WEF_SKILLS.join(", ")}.
5. Never include ${EXCLUDED_WEF_SKILLS.join(", ")} — it applies equally to every sector, so it carries no information.
6. Two sectors whose vectors point the same way will be rejected. Make each one distinct.

PART 2 — category rules, per sector
These decide which careers a sector actually claims. Use ONLY these career categories:
${categories.join(", ")}

The careers in each category:
${catalog}

Rules:
1. Give each sector 1 to 4 category rules, with "relevance" 0-100.
2. Bands: core 90-100, strong 70-85, moderate 50-65, weak below 50.
3. A category's headline (highest-relevance) sector must beat the runner-up by at least 10 points. Sector rank modifies scores by up to 15%, so a smaller gap makes the student-facing rationale hostage to sector ordering.
4. No sector may be the headline for more than ${MAX_HEADLINE_CATEGORIES} categories. A sector that headlines everything is a catch-all, not a sector.
5. If no sector genuinely serves a category, leave that category out. A career scoring the floor is an honest answer, not a gap to be filled.
6. "notes" states WHY in one sentence and ends with [source: URL].

PART 3 — serving careers
List, in "servingCareers", the careers from the catalog above that this sector actually employs. A sector with no serving career is an empty label and will be rejected.

Respond with JSON only — no markdown fences, no prose:
{
  "sectors": [
    {
      "sector": "exact name from the list above",
      "skills": [{ "skill": "ICT Literacy", "importance": 95 }],
      "categoryRules": [{ "category": "Technology", "relevance": 95, "notes": "Why, in one sentence. [source: https://...]" }],
      "servingCareers": ["Software Engineer"],
      "sources": ["https://..."]
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Gate 0 - shape
// ---------------------------------------------------------------------------

/**
 * Coerce whatever the model returned into the shape the storage layer needs,
 * and reject what cannot be coerced.
 *
 * The sector NAME is canonicalised back to the requested spelling rather than
 * trusted: it has to be byte-identical to the countries.prioritySectors entry
 * or the Arabic \b substitution in recommendations.routes.ts will not match it
 * and the Arabic report leaks English.
 */
export function normalizeGeneratedSectors(
  raw: unknown,
  input: {
    prioritySectors: string[];
    skillNames?: string[];
    categories: string[];
    careerTitles: string[];
  },
): { sectors: GeneratedSector[]; rejected: GateRejection[]; warnings: string[] } {
  const skillLookup = buildSkillLookup(input.skillNames ?? [...WEF_SKILL_NAMES]);
  const excluded = new Set(EXCLUDED_WEF_SKILLS.map(skillKey));
  const sectorLookup = new Map(input.prioritySectors.map(s => [s.trim().toLowerCase(), s]));
  const categoryLookup = new Map(input.categories.map(c => [c.trim().toLowerCase(), c]));
  const titleLookup = new Map(input.careerTitles.map(t => [t.trim().toLowerCase(), t]));

  const sectors: GeneratedSector[] = [];
  const rejected: GateRejection[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  const list: any[] = Array.isArray(raw) ? raw : [];

  for (const entry of list) {
    const rawName = typeof entry?.sector === "string" ? entry.sector.trim() : "";
    if (!rawName) {
      rejected.push({ sector: "(unnamed)", gate: "shape", reason: "no sector name" });
      continue;
    }

    const name = sectorLookup.get(rawName.toLowerCase());
    if (!name) {
      rejected.push({
        sector: rawName,
        gate: "shape",
        reason: "not one of the country's priority sectors",
      });
      continue;
    }
    if (seen.has(name)) {
      rejected.push({ sector: name, gate: "shape", reason: "duplicate sector" });
      continue;
    }
    // \b-safety: the Arabic substitution is a word-boundary regex over this
    // exact string (server/seed.ts, recommendations.routes.ts).
    if (!/^[A-Za-z0-9؀-ۿ][A-Za-z0-9؀-ۿ &'\-,]*[A-Za-z0-9؀-ۿ]$/.test(name)) {
      rejected.push({
        sector: name,
        gate: "shape",
        reason: "name is not \\b-safe for the Arabic substitution (trailing punctuation or stray characters)",
      });
      continue;
    }

    // --- skills -----------------------------------------------------------
    const skills: GeneratedSkillWeight[] = [];
    const usedSkills = new Set<string>();
    for (const item of Array.isArray(entry.skills) ? entry.skills : []) {
      const key = typeof item?.skill === "string" ? skillKey(item.skill) : "";
      const canonical = skillLookup.get(key);
      if (!canonical) continue;                 // unknown skill: drop
      if (excluded.has(key)) continue;          // no-information skill: drop
      if (usedSkills.has(key)) continue;
      const importance = Math.round(Number(item.importance));
      if (!Number.isFinite(importance) || importance <= 0) continue;
      usedSkills.add(key);
      skills.push({ skill: canonical, importance: Math.min(100, importance) });
    }
    skills.sort((a, b) => b.importance - a.importance);
    const trimmed = skills.slice(0, MAX_SKILLS_PER_SECTOR);

    if (trimmed.length < MIN_SKILLS_PER_SECTOR) {
      rejected.push({
        sector: name,
        gate: "shape",
        reason: `only ${trimmed.length} usable skills (need ${MIN_SKILLS_PER_SECTOR}-${MAX_SKILLS_PER_SECTOR} with per-skill importance 0-100)`,
      });
      continue;
    }
    if (skills.length > MAX_SKILLS_PER_SECTOR) {
      warnings.push(`${name}: kept the top ${MAX_SKILLS_PER_SECTOR} of ${skills.length} skills — the vector must stay sparse.`);
    }
    const lead = trimmed[0].skill;
    if (!(DISCRIMINATING_WEF_SKILLS as readonly string[]).includes(lead)) {
      warnings.push(`${name}: led by "${lead}", which is low-variance across the career catalog — it will separate this sector from few others.`);
    }

    // --- category rules ---------------------------------------------------
    const categoryRules: GeneratedCategoryRule[] = [];
    const usedCategories = new Set<string>();
    for (const item of Array.isArray(entry.categoryRules) ? entry.categoryRules : []) {
      const key = typeof item?.category === "string" ? item.category.trim().toLowerCase() : "";
      const canonical = categoryLookup.get(key);
      if (!canonical || usedCategories.has(key)) continue;
      const relevance = Math.round(Number(item.relevance));
      if (!Number.isFinite(relevance) || relevance <= 0) continue;
      usedCategories.add(key);
      const notes = typeof item.notes === "string" ? item.notes.trim() : "";
      if (!/https?:\/\//i.test(notes)) {
        warnings.push(`${name} / ${canonical}: category rule carries no citation in its notes.`);
      }
      categoryRules.push({
        category: canonical,
        relevance: Math.min(100, relevance),
        notes,
      });
    }
    if (categoryRules.length === 0) {
      rejected.push({
        sector: name,
        gate: "shape",
        reason: "no usable category rules — without them every career floors on vision alignment",
      });
      continue;
    }

    // --- serving careers + sources ---------------------------------------
    const servingCareers: string[] = [];
    for (const title of Array.isArray(entry.servingCareers) ? entry.servingCareers : []) {
      if (typeof title !== "string") continue;
      const canonical = titleLookup.get(title.trim().toLowerCase());
      if (canonical && !servingCareers.includes(canonical)) servingCareers.push(canonical);
    }

    const sources: string[] = [];
    for (const url of Array.isArray(entry.sources) ? entry.sources : []) {
      if (typeof url === "string" && /^https?:\/\//i.test(url.trim()) && !sources.includes(url.trim())) {
        sources.push(url.trim());
      }
    }

    seen.add(name);
    sectors.push({ sector: name, skills: trimmed, categoryRules, servingCareers, sources });
  }

  return { sectors, rejected, warnings };
}

// ---------------------------------------------------------------------------
// Gate 1 - provenance
// ---------------------------------------------------------------------------

/**
 * Best-effort test for "an official in-country government site".
 *
 * A heuristic cannot decide this on its own — the UAE's own national portal is
 * u.ae, which carries no .gov label — so a failure here is a WARNING and only a
 * total absence of sources is a rejection. Pass `officialDomains` when the
 * deployment knows the country's real domains and this becomes exact.
 */
export function looksOfficialGovDomain(url: string, officialDomains?: string[]): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (officialDomains && officialDomains.length > 0) {
    return officialDomains.some(d => {
      const domain = d.trim().toLowerCase().replace(/^\*\./, "");
      return host === domain || host.endsWith(`.${domain}`);
    });
  }
  return /(^|\.)(gov|gob|gouv|govt|mil)(\.|$)/.test(host);
}

export function applyProvenanceGate(
  sectors: GeneratedSector[],
  options: { officialDomains?: string[]; required: boolean },
): { accepted: GeneratedSector[]; rejected: GateRejection[]; warnings: string[] } {
  const accepted: GeneratedSector[] = [];
  const rejected: GateRejection[] = [];
  const warnings: string[] = [];

  for (const sector of sectors) {
    if (sector.sources.length === 0) {
      if (options.required) {
        rejected.push({
          sector: sector.sector,
          gate: "provenance",
          reason: "no source URL — generation must cite live official government pages, not model recall",
        });
        continue;
      }
      warnings.push(`${sector.sector}: no source URL.`);
    } else if (!sector.sources.some(u => looksOfficialGovDomain(u, options.officialDomains))) {
      warnings.push(
        `${sector.sector}: no source looks like an official government domain (${sector.sources.join(", ")}) — needs human review.`,
      );
    }
    accepted.push(sector);
  }

  return { accepted, rejected, warnings };
}

// ---------------------------------------------------------------------------
// Gate 2 - geometric
// ---------------------------------------------------------------------------

/**
 * Reject a sector whose skill vector correlates above the threshold with an
 * ALREADY-ACCEPTED sector. Greedy and order-dependent by design: the sectors
 * arrive in national-priority order, so the higher-priority sector keeps the
 * direction and the later one is the duplicate.
 *
 * This is the gate that would have caught the live r = 0.989 pair.
 */
export function applyGeometricGate(
  sectors: GeneratedSector[],
  maxR: number = GEOMETRIC_GATE_MAX_R,
  skillNames: readonly string[] = WEF_SKILL_NAMES,
): { accepted: GeneratedSector[]; rejected: GateRejection[]; warnings: string[] } {
  const accepted: GeneratedSector[] = [];
  const rejected: GateRejection[] = [];
  const warnings: string[] = [];
  const vectors: Array<{ sector: string; vector: number[] }> = [];
  const leads = new Map<string, string>();

  for (const sector of sectors) {
    const vector = toSkillVector(sector.skills, skillNames);
    let worst: { sector: string; r: number } | null = null;
    for (const other of vectors) {
      const r = pearson(vector, other.vector);
      if (!worst || r > worst.r) worst = { sector: other.sector, r };
    }
    if (worst && worst.r > maxR) {
      rejected.push({
        sector: sector.sector,
        gate: "geometric",
        reason: `skill vector correlates r=${worst.r.toFixed(3)} with "${worst.sector}" (max ${maxR}) — the two sectors point the same way and the engine cannot tell them apart`,
      });
      continue;
    }

    const lead = sector.skills[0]?.skill;
    if (lead) {
      const owner = leads.get(lead);
      if (owner) {
        warnings.push(`${sector.sector}: shares its lead skill "${lead}" with "${owner}" (r=${worst ? worst.r.toFixed(3) : "n/a"}).`);
      } else {
        leads.set(lead, sector.sector);
      }
    }

    vectors.push({ sector: sector.sector, vector });
    accepted.push(sector);
  }

  return { accepted, rejected, warnings };
}

// ---------------------------------------------------------------------------
// Gate 3 - coverage
// ---------------------------------------------------------------------------

/**
 * Errors that would stop a career from scoring properly (plan section 4).
 *
 * The relatedSubjects check is the Piece D defect: a career whose tags project
 * onto zero umbrella-6 subjects scores a flat 20 on subjects for every student,
 * whatever else is right about it. Such a career does not count towards a
 * sector's coverage — it is a career the sector cannot really be served by.
 */
export function careerScoringErrors(career: CareerLike): string[] {
  const errors: string[] = [];
  if (!career.title?.trim()) errors.push("missing title");
  if (!career.category?.trim()) errors.push("missing category");
  if (normalizeCareerSubjects(career.relatedSubjects ?? []).length === 0) {
    errors.push("relatedSubjects normalize to zero umbrella-6 subjects (flat-20 on the subjects component)");
  }
  return errors;
}

/**
 * Full completeness gate for a GENERATED career (plan section 4).
 *
 * Not reachable from the country-creation route yet — careers are authored in
 * server/seed.ts and their values profiles come from the O*NET pipeline, both
 * outside this module. It is exported and tested here so the career-generation
 * step has its gate ready, and so the rule that valuesProfile is COMPUTED and
 * never authored is enforced at the boundary where an LLM could break it.
 */
export function validateGeneratedCareer(career: CareerLike): { ok: boolean; errors: string[] } {
  const errors = careerScoringErrors(career);
  if (!career.description?.trim()) errors.push("missing description");
  if (!career.requiredSkills || career.requiredSkills.length === 0) errors.push("missing requiredSkills");
  if (!career.relatedSubjects || career.relatedSubjects.length === 0) errors.push("missing relatedSubjects");
  if (!career.educationLevel?.trim()) errors.push("missing educationLevel");
  if (!career.growthOutlook?.trim()) errors.push("missing growthOutlook (notNull in schema)");
  if (!career.onetCode?.trim()) errors.push("missing onetCode (prerequisite for the O*NET values pipeline)");

  // FUTURE-READINESS GATE at the catalogue boundary.
  //
  // THIS is where the gate earns its keep. Our seeded 68 are all professional
  // occupations, so the gate excludes none of them — but a model asked to
  // enumerate "careers serving country X's priority sectors" will cheerfully
  // return Bank Teller, Data Entry Clerk and Administrative Assistant, which is
  // exactly the WEF fastest-declining list. Rejecting them here is far better
  // than admitting them and hiding them from students afterwards.
  //
  // Same STRICT AND rule as the recommendation gate, and deliberately so: WEF
  // alone must not reject a career either. A generated career usually arrives
  // with no growth band, so deriveReadiness falls back to the O*NET occupation
  // pinned to the matched WEF role (WEF_DECLINING_ROLE_ONET) — both sources are
  // still consulted. That is why a generated "Graphic Designer" is NOT rejected:
  // O*NET bands it 'slower', i.e. still growing, so the AND never closes.
  const readiness = deriveReadiness(
    career.title ?? "",
    isOnetGrowthBand(career.onetGrowthBand) ? career.onetGrowthBand : null,
  );
  if (readiness.readiness === "declining") {
    errors.push(
      `"${career.title}" is a declining occupation and is not admissible to the ` +
        `career catalogue: ${readiness.why}`,
    );
  }
  if (career.valuesProfile !== undefined && career.valuesProfile !== null) {
    errors.push("valuesProfile must be derived by scripts/compute_profiles.py from O*NET, never authored by the model");
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Reject a sector that claims zero careers; warn when one sector headlines more
 * than MAX_HEADLINE_CATEGORIES categories.
 *
 * A sector with no serving career is an empty label AND a collinear column: it
 * contributes a direction to the geometry that no career can ever be scored
 * against. That is the finding the whole plan is built on (section 0).
 */
export function applyCoverageGate(
  sectors: GeneratedSector[],
  careers: CareerLike[],
  maxHeadlineCategories: number = MAX_HEADLINE_CATEGORIES,
): { accepted: GeneratedSector[]; rejected: GateRejection[]; warnings: string[] } {
  const accepted: GeneratedSector[] = [];
  const rejected: GateRejection[] = [];
  const warnings: string[] = [];

  const scorable = careers.filter(c => careerScoringErrors(c).length === 0);
  for (const career of careers) {
    const errors = careerScoringErrors(career);
    if (errors.length > 0) {
      warnings.push(`Career "${career.title}" does not count towards coverage: ${errors.join("; ")}.`);
    }
  }

  const byCategory = new Map<string, CareerLike[]>();
  for (const career of scorable) {
    const key = career.category.trim().toLowerCase();
    const list = byCategory.get(key) ?? [];
    list.push(career);
    byCategory.set(key, list);
  }
  const titles = new Set(scorable.map(c => c.title.trim().toLowerCase()));

  for (const sector of sectors) {
    const claimed = new Set<string>();
    for (const rule of sector.categoryRules) {
      for (const career of byCategory.get(rule.category.trim().toLowerCase()) ?? []) {
        claimed.add(career.title);
      }
    }
    for (const title of sector.servingCareers) {
      if (titles.has(title.trim().toLowerCase())) claimed.add(title);
    }

    if (claimed.size === 0) {
      rejected.push({
        sector: sector.sector,
        gate: "coverage",
        reason: "claims zero careers in the catalog — an empty label and a collinear column",
      });
      continue;
    }
    accepted.push(sector);
  }

  // Headline = the highest-relevance accepted sector for a category. Computed
  // over the accepted set, since a rejected sector cannot headline anything.
  const headlineCount = new Map<string, string[]>();
  const categories = new Set<string>();
  for (const sector of accepted) {
    for (const rule of sector.categoryRules) categories.add(rule.category.trim().toLowerCase());
  }
  for (const category of categories) {
    let best: { sector: string; relevance: number } | null = null;
    for (const sector of accepted) {
      for (const rule of sector.categoryRules) {
        if (rule.category.trim().toLowerCase() !== category) continue;
        if (!best || rule.relevance > best.relevance) {
          best = { sector: sector.sector, relevance: rule.relevance };
        }
      }
    }
    if (best) {
      const list = headlineCount.get(best.sector) ?? [];
      list.push(category);
      headlineCount.set(best.sector, list);
    }
  }
  for (const [sector, headlined] of headlineCount) {
    if (headlined.length > maxHeadlineCategories) {
      warnings.push(
        `${sector} headlines ${headlined.length} categories (${headlined.join(", ")}) — that is the catch-all shape; re-point the weaker ones.`,
      );
    }
  }

  return { accepted, rejected, warnings };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

/** A 400 that names the tool, rather than a real API failure. */
function isToolUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /400/.test(message) && /tool|web_search/i.test(message);
}

/**
 * Generate the full scoring configuration for a country's priority sectors:
 * a sparse contrastive WEF skill vector AND category rules per sector, gated.
 *
 * The caller persists the result — see persistGeneratedSectors in
 * server/routes/country.routes.ts. Nothing here writes to the database.
 */
export async function generateSectorWefMappings(
  storage: IStorage,
  countryName: string,
  prioritySectors: string[],
  options: SectorGenerationOptions = {},
): Promise<SectorGenerationResult> {
  try {
    const credential = await storage.getApiCredential("anthropic");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "Anthropic API key not configured or inactive",
      };
    }

    const careerCatalog = options.careerCatalog ?? [];
    const skillNames = options.skillNames?.length ? options.skillNames : [...WEF_SKILL_NAMES];

    const careersByCategory = new Map<string, string[]>();
    for (const career of careerCatalog) {
      const category = career.category?.trim();
      if (!category || !career.title?.trim()) continue;
      const list = careersByCategory.get(category) ?? [];
      list.push(career.title.trim());
      careersByCategory.set(category, list);
    }
    const categories = Array.from(careersByCategory.keys());

    if (categories.length === 0) {
      return {
        success: false,
        error: "No career catalog supplied — category rules cannot be generated, and without them every career floors on vision alignment",
      };
    }

    const systemPrompt = `You are a workforce-planning analyst configuring a career-guidance scoring engine for students aged 13-18.
You work only from official government sources you have actually opened in this conversation, and you cite every one of them.
You understand that the skill vectors you produce are compared to each other: a set of sectors that all "need critical thinking and communication" is useless, because it cannot separate one career from another.
Always respond with valid JSON only - no markdown fences, no explanatory text before or after the JSON object.`;

    const userPrompt = buildSectorGenerationPrompt({
      countryName,
      prioritySectors,
      skillNames,
      categories,
      careersByCategory,
      officialDomains: options.officialDomains,
    });

    let content: string;
    let citations: string[];
    let tokensUsed: number;
    let sourcedLive = true;

    try {
      ({ content, citations, tokensUsed } = await callAnthropic(
        credential.apiKey,
        systemPrompt,
        userPrompt,
        MAX_TOKENS_SECTORS,
        { tools: [buildWebSearchTool(options.officialDomains)] },
      ));
    } catch (error) {
      if (!isToolUnsupportedError(error)) throw error;
      if (!options.allowModelRecall) {
        return {
          success: false,
          sourcedLive: false,
          error:
            "Live web search is unavailable for this API key, and country generation must cite official government sources rather than model recall. " +
            "Enable the web-search server tool for the key, or re-run with allowModelRecall to accept an unsourced draft.",
        };
      }
      sourcedLive = false;
      ({ content, citations, tokensUsed } = await callAnthropic(
        credential.apiKey,
        systemPrompt,
        userPrompt,
        MAX_TOKENS_SECTORS,
      ));
    }

    if (citations.length === 0) {
      sourcedLive = false;
      if (!options.allowModelRecall) {
        return {
          success: false,
          sourcedLive: false,
          tokensUsed,
          error: "The model answered without opening any page — the result is recall, not sourced research. Nothing was written.",
        };
      }
    }

    const parsed = safeParseJSON<{ sectors?: unknown; mappings?: unknown }>(content, {});
    const rawSectors = Array.isArray(parsed.sectors)
      ? parsed.sectors
      : Array.isArray(parsed.mappings)
        ? parsed.mappings
        : [];

    if (rawSectors.length === 0) {
      return {
        success: false,
        sourcedLive,
        tokensUsed,
        error: "Failed to parse sector mappings from AI response",
      };
    }

    const shape = normalizeGeneratedSectors(rawSectors, {
      prioritySectors,
      skillNames,
      categories,
      careerTitles: careerCatalog.map(c => c.title).filter(Boolean),
    });

    const provenance = applyProvenanceGate(shape.sectors, {
      officialDomains: options.officialDomains,
      required: sourcedLive,
    });
    const geometric = applyGeometricGate(provenance.accepted, GEOMETRIC_GATE_MAX_R, skillNames);
    const coverage = applyCoverageGate(geometric.accepted, careerCatalog);

    const warnings = [
      ...shape.warnings,
      ...provenance.warnings,
      ...geometric.warnings,
      ...coverage.warnings,
    ];
    if (!sourcedLive) {
      warnings.unshift("Sectors were generated from model recall, not from live official sources — every claim needs human review.");
    }

    const rejected = [
      ...shape.rejected,
      ...provenance.rejected,
      ...geometric.rejected,
      ...coverage.rejected,
    ];

    if (coverage.accepted.length === 0) {
      return {
        success: false,
        rejected,
        warnings,
        sourcedLive,
        tokensUsed,
        error: "Every generated sector was rejected by the gates",
      };
    }

    return {
      success: true,
      mappings: coverage.accepted,
      rejected,
      warnings,
      sourcedLive,
      tokensUsed,
    };
  } catch (error) {
    console.error("Error generating sector mappings:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
