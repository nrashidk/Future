/**
 * LLM Narrative Service
 *
 * Generates personalized premium report narratives using Anthropic Claude API.
 * Supports configurable prompts and multiple narrative types.
 */

import type { IStorage } from "../storage";
import type { Assessment, Career, LlmPromptTemplate } from "../../shared/schema";

interface StudentContext {
  gradeLevel: string;
  favoriteSubjects: string[];
  riasecTop3: string[];
  cvqTop3: string[];
  overallScore: number;
}

interface CareerContext {
  title: string;
  category: string;
  description: string;
  educationLevel: string;
  requiredSkills: string[];
  relatedSubjects: string[];
  salaryRange: string;
}

interface NarrativeResult {
  success: boolean;
  narrative?: string;
  error?: string;
  promptKey: string;
  model: string;
  tokensUsed?: number;
  fromCache?: boolean;
}

const DEFAULT_MODEL = "claude-sonnet-4-6";
const DEFAULT_MAX_TOKENS = 1000;
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Replace template variables with actual values
 */
function replaceTemplateVariables(
  template: string,
  studentContext: StudentContext,
  careerContext: CareerContext,
  language: string = "en"
): string {
  return template
    .replace(/\{\{gradeLevel\}\}/g, studentContext.gradeLevel)
    .replace(/\{\{favoriteSubjects\}\}/g, studentContext.favoriteSubjects.join(", "))
    .replace(/\{\{riasecTop3\}\}/g, studentContext.riasecTop3.join(", "))
    .replace(/\{\{cvqTop3\}\}/g, studentContext.cvqTop3.join(", "))
    .replace(/\{\{overallScore\}\}/g, studentContext.overallScore.toString())
    .replace(/\{\{careerTitle\}\}/g, careerContext.title)
    .replace(/\{\{careerCategory\}\}/g, careerContext.category)
    .replace(/\{\{careerDescription\}\}/g, careerContext.description)
    .replace(/\{\{educationLevel\}\}/g, careerContext.educationLevel)
    .replace(/\{\{requiredSkills\}\}/g, careerContext.requiredSkills.join(", "))
    .replace(/\{\{relatedSubjects\}\}/g, careerContext.relatedSubjects.join(", "))
    .replace(/\{\{salaryRange\}\}/g, careerContext.salaryRange)
    .replace(/\{\{language\}\}/g, language === "ar" ? "Arabic" : "English");
}

/**
 * Call Anthropic Claude API to generate narrative
 */
async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  model: string,
  maxTokens: number,
  temperature: number
): Promise<{ content: string; tokensUsed: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      `Anthropic API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`
    );
  }

  const data = await response.json();
  const content = data.content?.[0]?.text || "";
  const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

  return { content, tokensUsed };
}

/**
 * Generate a narrative for a specific prompt template
 */
export async function generateNarrative(
  storage: IStorage,
  promptKey: string,
  studentContext: StudentContext,
  careerContext: CareerContext,
  language: string = "en"
): Promise<NarrativeResult> {
  try {
    const credential = await storage.getApiCredential("anthropic");
    if (!credential || !credential.apiKey || !credential.isActive) {
      return {
        success: false,
        error: "Anthropic API key not configured or inactive",
        promptKey,
        model: DEFAULT_MODEL,
      };
    }

    const template = await storage.getLlmPromptTemplateByKey(promptKey);
    if (!template || !template.isActive) {
      return {
        success: false,
        error: `Prompt template "${promptKey}" not found or inactive`,
        promptKey,
        model: DEFAULT_MODEL,
      };
    }

    const userPrompt = replaceTemplateVariables(
      template.userPromptTemplate,
      studentContext,
      careerContext,
      language
    );

    const model = template.model || DEFAULT_MODEL;
    const { content, tokensUsed } = await callAnthropic(
      credential.apiKey,
      template.systemPrompt,
      userPrompt,
      model,
      template.maxTokens || DEFAULT_MAX_TOKENS,
      template.temperature ?? DEFAULT_TEMPERATURE
    );

    return {
      success: true,
      narrative: content,
      promptKey,
      model,
      tokensUsed,
    };
  } catch (error) {
    console.error(`[LLM] Error generating narrative for ${promptKey}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      promptKey,
      model: DEFAULT_MODEL,
    };
  }
}

/**
 * Generate "Why This Career?" narrative for premium reports.
 * Returns the cached result if available; calls the LLM and stores the
 * result on a cache miss.
 */
export async function generateCareerReasoningNarrative(
  storage: IStorage,
  assessment: Assessment,
  career: Career,
  overallScore: number,
  language: string = "en"
): Promise<NarrativeResult> {
  const promptKey = "career_reasoning";

  // Cache hit — return instantly without an LLM call
  try {
    const cached = await storage.getLlmNarrativeCache(assessment.id, career.id, promptKey, language);
    if (cached) {
      return { success: true, narrative: cached, promptKey, model: DEFAULT_MODEL, fromCache: true };
    }
  } catch (cacheErr) {
    console.warn("[LLM Cache] Read error (career_reasoning), proceeding without cache:", cacheErr);
  }

  const studentContext = buildStudentContext(assessment, overallScore);
  const careerContext = buildCareerContext(career);
  const result = await generateNarrative(storage, promptKey, studentContext, careerContext, language);

  // Persist successful result so subsequent calls skip the LLM
  if (result.success && result.narrative) {
    try {
      await storage.setLlmNarrativeCache(assessment.id, career.id, promptKey, language, result.narrative);
    } catch (cacheErr) {
      console.warn("[LLM Cache] Write error (career_reasoning), continuing without cache:", cacheErr);
    }
  }

  return result;
}

/**
 * Generate "Education Pathways" narrative for premium reports.
 * Returns the cached result if available; calls the LLM and stores the
 * result on a cache miss.
 */
export async function generateEducationPathwaysNarrative(
  storage: IStorage,
  assessment: Assessment,
  career: Career,
  overallScore: number,
  language: string = "en"
): Promise<NarrativeResult> {
  const promptKey = "education_pathways";

  // Cache hit — return instantly without an LLM call
  try {
    const cached = await storage.getLlmNarrativeCache(assessment.id, career.id, promptKey, language);
    if (cached) {
      return { success: true, narrative: cached, promptKey, model: DEFAULT_MODEL, fromCache: true };
    }
  } catch (cacheErr) {
    console.warn("[LLM Cache] Read error (education_pathways), proceeding without cache:", cacheErr);
  }

  const studentContext = buildStudentContext(assessment, overallScore);
  const careerContext = buildCareerContext(career);
  const result = await generateNarrative(storage, promptKey, studentContext, careerContext, language);

  // Persist successful result so subsequent calls skip the LLM
  if (result.success && result.narrative) {
    try {
      await storage.setLlmNarrativeCache(assessment.id, career.id, promptKey, language, result.narrative);
    } catch (cacheErr) {
      console.warn("[LLM Cache] Write error (education_pathways), continuing without cache:", cacheErr);
    }
  }

  return result;
}

/**
 * Build student context from assessment data
 */
function buildStudentContext(assessment: Assessment, overallScore: number): StudentContext {
  const riasecData = assessment.riasecScores as any;
  const cvqData = assessment.cvqScores as any;
  const assessmentData = assessment as any;

  let riasecTop3: string[] = [];
  if (riasecData?.top3) {
    riasecTop3 = riasecData.top3;
  } else if (riasecData?.ranking) {
    riasecTop3 = riasecData.ranking.slice(0, 3).map((r: any) => r.code);
  }

  let cvqTop3: string[] = [];
  if (cvqData?.top3) {
    cvqTop3 = cvqData.top3.slice(0, 3);
  } else if (cvqData?.ranking) {
    cvqTop3 = cvqData.ranking.slice(0, 3).map((r: any) => r.value || r.name);
  }

  const favoriteSubjects: string[] = Array.isArray(assessment.favoriteSubjects)
    ? assessment.favoriteSubjects.slice(0, 3)
    : [];

  return {
    gradeLevel: assessmentData.gradeLevel || assessmentData.grade || "Unknown",
    favoriteSubjects,
    riasecTop3,
    cvqTop3,
    overallScore: Math.round(overallScore),
  };
}

/**
 * Build career context from career data
 */
function buildCareerContext(career: Career): CareerContext {
  return {
    title: career.title,
    category: career.category,
    description: career.description || "",
    educationLevel: career.educationLevel || "Bachelor's degree",
    requiredSkills: career.requiredSkills || [],
    relatedSubjects: career.relatedSubjects || [],
    salaryRange: career.averageSalary || "Varies by experience",
  };
}

/**
 * Check if LLM service is available (API key configured and active)
 */
export async function isLlmServiceAvailable(storage: IStorage): Promise<boolean> {
  try {
    const credential = await storage.getApiCredential("anthropic");
    return Boolean(credential?.apiKey && credential?.isActive);
  } catch {
    return false;
  }
}

/**
 * Generate all premium narratives for a career recommendation
 */
export async function generateAllPremiumNarratives(
  storage: IStorage,
  assessment: Assessment,
  career: Career,
  overallScore: number,
  language: string = "en"
): Promise<{
  careerReasoning: NarrativeResult;
  educationPathways: NarrativeResult;
}> {
  const [careerReasoning, educationPathways] = await Promise.all([
    generateCareerReasoningNarrative(storage, assessment, career, overallScore, language),
    generateEducationPathwaysNarrative(storage, assessment, career, overallScore, language),
  ]);

  return { careerReasoning, educationPathways };
}
