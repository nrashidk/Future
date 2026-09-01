/**
 * LLM country generation — the gates and the prompt contract.
 *
 * These pin the three defects in docs/priority-alignment-plan.md section 7 and the
 * three gates that stop them coming back:
 *   1. per-skill importance 0-100 (the old shape carried ONE importanceScore
 *      for a whole sector, which the schema has nowhere to put);
 *   2. category rules exist at all (without them calculateVisionScore returns
 *      the floor for every career);
 *   3. skills chosen for CONTRAST — the geometric gate is what would have
 *      caught the live r = 0.989 pair.
 *
 * Everything here is pure: no database, no network. llmCountryService imports
 * storage only as a type, so importing it never touches db.ts.
 */

import { describe, it, expect } from "vitest";
import {
  applyCoverageGate,
  applyGeometricGate,
  applyProvenanceGate,
  buildSectorGenerationPrompt,
  looksOfficialGovDomain,
  normalizeGeneratedSectors,
  pearson,
  toSkillVector,
  validateGeneratedCareer,
  type CareerLike,
  type GeneratedSector,
} from "./llmCountryService";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SECTORS = ["Advanced Technology & AI", "Financial Services & FinTech", "Healthcare & Life Sciences"];

const CATEGORIES = ["Technology", "Finance", "Healthcare"];

const CAREERS: CareerLike[] = [
  {
    id: "c1",
    title: "Software Engineer",
    description: "Builds software.",
    category: "Technology",
    requiredSkills: ["Programming"],
    relatedSubjects: ["Computer Science", "Mathematics"],
    educationLevel: "Bachelor's",
    growthOutlook: "High",
    onetCode: "15-1252.00",
  },
  {
    id: "c2",
    title: "Financial Analyst",
    description: "Analyses investments.",
    category: "Finance",
    requiredSkills: ["Modelling"],
    relatedSubjects: ["Mathematics", "Economics"],
    educationLevel: "Bachelor's",
    growthOutlook: "Steady",
    onetCode: "13-2051.00",
  },
  {
    id: "c3",
    title: "Doctor",
    description: "Treats patients.",
    category: "Healthcare",
    requiredSkills: ["Diagnosis"],
    relatedSubjects: ["Biology", "Chemistry"],
    educationLevel: "Doctorate",
    growthOutlook: "High",
    onetCode: "29-1210.00",
  },
];

const TECH_SKILLS = [
  { skill: "ICT Literacy", importance: 95 },
  { skill: "Numeracy", importance: 80 },
  { skill: "Creativity", importance: 75 },
  { skill: "Adaptability", importance: 70 },
  { skill: "Curiosity", importance: 65 },
];

const FINANCE_SKILLS = [
  { skill: "Financial Literacy", importance: 95 },
  { skill: "Numeracy", importance: 90 },
  { skill: "ICT Literacy", importance: 75 },
  { skill: "Leadership", importance: 60 },
  { skill: "Literacy", importance: 55 },
];

const HEALTH_SKILLS = [
  { skill: "Scientific Literacy", importance: 95 },
  { skill: "Social and Cultural Awareness", importance: 80 },
  { skill: "Curiosity", importance: 75 },
  { skill: "Collaboration", importance: 70 },
  { skill: "Numeracy", importance: 65 },
];

function sector(over: Partial<GeneratedSector> = {}): GeneratedSector {
  return {
    sector: "Advanced Technology & AI",
    skills: TECH_SKILLS,
    categoryRules: [{ category: "Technology", relevance: 95, notes: "Core. [source: https://u.ae/x]" }],
    servingCareers: ["Software Engineer"],
    sources: ["https://u.ae/x"],
    ...over,
  };
}

/** One well-formed LLM sector object, before any gating. */
function rawSector(over: Record<string, unknown> = {}) {
  return {
    sector: "Advanced Technology & AI",
    skills: TECH_SKILLS,
    categoryRules: [{ category: "Technology", relevance: 95, notes: "Core. [source: https://u.ae/x]" }],
    servingCareers: ["Software Engineer"],
    sources: ["https://u.ae/x"],
    ...over,
  };
}

function normalize(raw: unknown[]) {
  return normalizeGeneratedSectors(raw, {
    prioritySectors: SECTORS,
    categories: CATEGORIES,
    careerTitles: CAREERS.map(c => c.title),
  });
}

// ---------------------------------------------------------------------------
// Vector geometry
// ---------------------------------------------------------------------------

describe("skill vectors", () => {
  it("treats an omitted skill as a real 0 — that is what makes a sparse vector contrastive", () => {
    const vector = toSkillVector(TECH_SKILLS);
    expect(vector).toHaveLength(16);
    expect(vector.filter(v => v > 0)).toHaveLength(5);
  });

  it("scores identical directions at r = 1 and unrelated ones well below the gate", () => {
    expect(pearson(toSkillVector(TECH_SKILLS), toSkillVector(TECH_SKILLS))).toBeCloseTo(1, 6);
    expect(pearson(toSkillVector(TECH_SKILLS), toSkillVector(HEALTH_SKILLS))).toBeLessThan(0.8);
  });

  it("returns 0 for a degenerate vector rather than NaN", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Shape gate
// ---------------------------------------------------------------------------

describe("normalizeGeneratedSectors", () => {
  it("keeps per-skill importance 0-100", () => {
    const { sectors } = normalize([rawSector()]);
    expect(sectors[0].skills).toEqual(TECH_SKILLS);
  });

  it("rejects the OLD shape — one importanceScore for a whole sector carries no per-skill weight", () => {
    const { sectors, rejected } = normalize([
      {
        sector: "Advanced Technology & AI",
        wefSkills: ["ICT Literacy", "Numeracy", "Creativity", "Adaptability", "Curiosity"],
        importanceScore: 0.8,
        categoryRules: [{ category: "Technology", relevance: 95, notes: "x https://u.ae" }],
      },
    ]);
    expect(sectors).toHaveLength(0);
    expect(rejected[0].gate).toBe("shape");
    expect(rejected[0].reason).toMatch(/usable skills/);
  });

  it("drops Critical Thinking — it applies equally to every sector, so it carries no information", () => {
    const { sectors } = normalize([
      rawSector({
        skills: [...TECH_SKILLS, { skill: "Critical Thinking and Problem Solving", importance: 90 }],
      }),
    ]);
    expect(sectors[0].skills.map(s => s.skill)).not.toContain("Critical Thinking and Problem Solving");
    expect(sectors[0].skills).toHaveLength(5);
  });

  it("matches skill names through '&' and casing, and drops unknown ones", () => {
    const { sectors } = normalize([
      rawSector({
        skills: [
          { skill: "social & cultural awareness", importance: 95 },
          { skill: "SCIENTIFIC LITERACY", importance: 80 },
          { skill: "Vibes", importance: 100 },
          { skill: "Curiosity", importance: 70 },
          { skill: "Collaboration", importance: 65 },
          { skill: "Numeracy", importance: 60 },
        ],
      }),
    ]);
    expect(sectors[0].skills.map(s => s.skill)).toEqual([
      "Social and Cultural Awareness",
      "Scientific Literacy",
      "Curiosity",
      "Collaboration",
      "Numeracy",
    ]);
  });

  it("keeps the vector sparse: 8 skills are trimmed to the top 7, with a warning", () => {
    const eight = [
      { skill: "ICT Literacy", importance: 95 },
      { skill: "Numeracy", importance: 90 },
      { skill: "Creativity", importance: 85 },
      { skill: "Adaptability", importance: 80 },
      { skill: "Curiosity", importance: 75 },
      { skill: "Leadership", importance: 70 },
      { skill: "Communication", importance: 65 },
      { skill: "Initiative", importance: 60 },
    ];
    const { sectors, warnings } = normalize([rawSector({ skills: eight })]);
    expect(sectors[0].skills).toHaveLength(7);
    expect(sectors[0].skills.at(-1)!.skill).toBe("Communication");
    expect(warnings.some(w => /sparse/.test(w))).toBe(true);
  });

  it("canonicalises the sector name back to the countries.prioritySectors spelling", () => {
    // The Arabic report substitutes this string with a \b regex — a differently
    // cased copy would leak English into the Arabic rationale.
    const { sectors } = normalize([rawSector({ sector: "advanced technology & ai " })]);
    expect(sectors[0].sector).toBe("Advanced Technology & AI");
  });

  it("rejects a sector that is not on the country's priority list, and duplicates", () => {
    const { sectors, rejected } = normalize([
      rawSector({ sector: "Widget Manufacturing" }),
      rawSector(),
      rawSector(),
    ]);
    expect(sectors).toHaveLength(1);
    expect(rejected.map(r => r.reason)).toEqual([
      "not one of the country's priority sectors",
      "duplicate sector",
    ]);
  });

  it("rejects a sector with no usable category rules — the whole vision component would floor", () => {
    const { sectors, rejected } = normalize([
      rawSector({ categoryRules: [{ category: "Underwater Basket Weaving", relevance: 90, notes: "x" }] }),
    ]);
    expect(sectors).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/category rules/);
  });

  it("warns when a category rule carries no citation", () => {
    const { warnings } = normalize([
      rawSector({ categoryRules: [{ category: "Technology", relevance: 95, notes: "Because it is." }] }),
    ]);
    expect(warnings.some(w => /no citation/.test(w))).toBe(true);
  });

  it("keeps only serving careers that exist in the catalog", () => {
    const { sectors } = normalize([
      rawSector({ servingCareers: ["Software Engineer", "Starship Captain"] }),
    ]);
    expect(sectors[0].servingCareers).toEqual(["Software Engineer"]);
  });
});

// ---------------------------------------------------------------------------
// Provenance gate
// ---------------------------------------------------------------------------

describe("provenance gate", () => {
  it("recognises government domains, and honours an explicit allowlist", () => {
    expect(looksOfficialGovDomain("https://mohap.gov.ae/en")).toBe(true);
    expect(looksOfficialGovDomain("https://en.wikipedia.org/wiki/UAE")).toBe(false);
    expect(looksOfficialGovDomain("https://u.ae/en/about-the-uae", ["u.ae"])).toBe(true);
    expect(looksOfficialGovDomain("https://consultancy.example/report", ["u.ae"])).toBe(false);
  });

  it("rejects an un-sourced sector when sourcing is required", () => {
    const { accepted, rejected } = applyProvenanceGate([sector({ sources: [] })], { required: true });
    expect(accepted).toHaveLength(0);
    expect(rejected[0].gate).toBe("provenance");
  });

  it("warns rather than rejects when the source is not obviously governmental", () => {
    const { accepted, warnings } = applyProvenanceGate(
      [sector({ sources: ["https://u.ae/en/about-the-uae"] })],
      { required: true },
    );
    expect(accepted).toHaveLength(1);
    expect(warnings.some(w => /human review/.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Geometric gate
// ---------------------------------------------------------------------------

describe("geometric gate", () => {
  it("rejects a sector pointing the same way as one already accepted (the r = 0.989 defect)", () => {
    const twin = [
      { skill: "ICT Literacy", importance: 90 },
      { skill: "Numeracy", importance: 85 },
      { skill: "Creativity", importance: 70 },
      { skill: "Adaptability", importance: 65 },
      { skill: "Curiosity", importance: 60 },
    ];
    const { accepted, rejected } = applyGeometricGate([
      sector(),
      sector({ sector: "Financial Services & FinTech", skills: twin }),
    ]);
    expect(accepted.map(s => s.sector)).toEqual(["Advanced Technology & AI"]);
    expect(rejected[0].gate).toBe("geometric");
    expect(rejected[0].reason).toMatch(/r=0\.99/);
  });

  it("keeps sectors that genuinely differ", () => {
    const { accepted, rejected } = applyGeometricGate([
      sector(),
      sector({ sector: "Financial Services & FinTech", skills: FINANCE_SKILLS }),
      sector({ sector: "Healthcare & Life Sciences", skills: HEALTH_SKILLS }),
    ]);
    expect(accepted).toHaveLength(3);
    expect(rejected).toHaveLength(0);
  });

  it("warns when two sectors share a lead skill without correlating enough to reject", () => {
    const alsoIctLed = [
      { skill: "ICT Literacy", importance: 85 },
      { skill: "Persistence and Grit", importance: 70 },
      { skill: "Cultural and Civic Literacy", importance: 70 },
      { skill: "Social and Cultural Awareness", importance: 60 },
      { skill: "Literacy", importance: 60 },
    ];
    const { accepted, warnings } = applyGeometricGate([
      sector(),
      sector({ sector: "Financial Services & FinTech", skills: alsoIctLed }),
    ]);
    expect(accepted).toHaveLength(2);
    expect(warnings.some(w => /shares its lead skill "ICT Literacy"/.test(w))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Coverage gate
// ---------------------------------------------------------------------------

describe("coverage gate", () => {
  it("rejects a sector that claims zero careers — an empty label and a collinear column", () => {
    const { accepted, rejected } = applyCoverageGate(
      [
        sector(),
        sector({
          sector: "Healthcare & Life Sciences",
          skills: HEALTH_SKILLS,
          categoryRules: [{ category: "Finance", relevance: 90, notes: "x" }],
          servingCareers: [],
        }),
      ],
      // Catalog with no Finance career at all.
      CAREERS.filter(c => c.category !== "Finance"),
    );
    expect(accepted.map(s => s.sector)).toEqual(["Advanced Technology & AI"]);
    expect(rejected[0].gate).toBe("coverage");
    expect(rejected[0].reason).toMatch(/zero careers/);
  });

  it("does not count a career whose relatedSubjects normalize to zero umbrella-6 subjects", () => {
    // Fashion Designer's tags (Art, Design) have no umbrella-6 home, so the
    // career scores a flat 20 on subjects and cannot serve a sector.
    const catalog: CareerLike[] = [
      { id: "c9", title: "Fashion Designer", category: "Creative Arts", relatedSubjects: ["Art", "Design"] },
    ];
    const { accepted, rejected, warnings } = applyCoverageGate(
      [sector({ categoryRules: [{ category: "Creative Arts", relevance: 90, notes: "x" }], servingCareers: ["Fashion Designer"] })],
      catalog,
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].gate).toBe("coverage");
    expect(warnings.some(w => /Fashion Designer/.test(w) && /umbrella-6/.test(w))).toBe(true);
  });

  it("warns when one sector headlines more than three categories (the Technology catch-all)", () => {
    const catchAll = sector({
      categoryRules: [
        { category: "Technology", relevance: 95, notes: "x" },
        { category: "Finance", relevance: 90, notes: "x" },
        { category: "Healthcare", relevance: 90, notes: "x" },
        { category: "Creative Arts", relevance: 90, notes: "x" },
      ],
    });
    const catalog = [...CAREERS, { id: "c4", title: "Graphic Designer", category: "Creative Arts", relatedSubjects: ["Computer Science"] }];
    const { accepted, warnings } = applyCoverageGate([catchAll], catalog);
    expect(accepted).toHaveLength(1);
    expect(warnings.some(w => /headlines 4 categories/.test(w))).toBe(true);
  });

  it("lets a lower-relevance sector keep the category it does not headline", () => {
    const { accepted, warnings } = applyCoverageGate(
      [
        sector(),
        sector({
          sector: "Financial Services & FinTech",
          skills: FINANCE_SKILLS,
          categoryRules: [
            { category: "Finance", relevance: 95, notes: "x" },
            { category: "Technology", relevance: 55, notes: "secondary" },
          ],
          servingCareers: ["Financial Analyst"],
        }),
      ],
      CAREERS,
    );
    expect(accepted).toHaveLength(2);
    expect(warnings.filter(w => /headlines/.test(w))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Completeness gate
// ---------------------------------------------------------------------------

describe("completeness gate", () => {
  it("passes a career complete on every field in plan section 4", () => {
    expect(validateGeneratedCareer(CAREERS[0])).toEqual({ ok: true, errors: [] });
  });

  it("rejects a career whose relatedSubjects normalize to zero umbrella-6 subjects", () => {
    const { ok, errors } = validateGeneratedCareer({ ...CAREERS[0], relatedSubjects: ["Art", "Design"] });
    expect(ok).toBe(false);
    expect(errors.join(" ")).toMatch(/umbrella-6/);
  });

  it("rejects a career missing any required field", () => {
    const { ok, errors } = validateGeneratedCareer({
      title: "Astronaut",
      category: "Science",
      relatedSubjects: ["Physics"],
    });
    expect(ok).toBe(false);
    expect(errors).toEqual([
      "missing description",
      "missing requiredSkills",
      "missing educationLevel",
      "missing growthOutlook (notNull in schema)",
      "missing onetCode (prerequisite for the O*NET values pipeline)",
    ]);
  });

  it("rejects an AUTHORED valuesProfile — values are computed from O*NET, never written by the model", () => {
    const { ok, errors } = validateGeneratedCareer({
      ...CAREERS[0],
      valuesProfile: { achievement: 80, security: 70 },
    });
    expect(ok).toBe(false);
    expect(errors.join(" ")).toMatch(/O\*NET/);
  });
});

// ---------------------------------------------------------------------------
// Prompt contract
// ---------------------------------------------------------------------------

describe("buildSectorGenerationPrompt", () => {
  const prompt = buildSectorGenerationPrompt({
    countryName: "Testland",
    prioritySectors: SECTORS,
    skillNames: ["ICT Literacy", "Numeracy", "Critical Thinking and Problem Solving"],
    categories: CATEGORIES,
    careersByCategory: new Map([["Technology", ["Software Engineer"]], ["Finance", ["Financial Analyst"]]]),
  });

  it("asks for a sparse 5-7 skill vector with per-skill importance 0-100", () => {
    expect(prompt).toMatch(/5 to 7 skills/);
    expect(prompt).toMatch(/SPARSE/);
    expect(prompt).toMatch(/own "importance" from 0 to 100/);
    expect(prompt).toMatch(/no single score for a sector/);
  });

  it("asks for CONTRAST and a distinct lead skill per sector", () => {
    expect(prompt).toMatch(/for CONTRAST, not for relevance/);
    expect(prompt).toMatch(/LED \(highest importance\) by a DIFFERENT skill/);
    expect(prompt).toMatch(/Never include Critical Thinking and Problem Solving/);
  });

  it("asks for category rules over the real category list, with the calibration margin", () => {
    expect(prompt).toMatch(/PART 2 — category rules/);
    expect(prompt).toMatch(/Technology, Finance, Healthcare/);
    expect(prompt).toMatch(/at least 10 points/);
    expect(prompt).toMatch(/more than 3 categories/);
  });

  it("names the sectors verbatim and forbids inventing careers", () => {
    expect(prompt).toMatch(/use these names EXACTLY as written, byte for byte/);
    expect(prompt).toMatch(/- Technology: Software Engineer/);
  });

  it("demands live, cited, official-government sourcing", () => {
    expect(prompt).toMatch(/Use the web_search tool before answering/);
    expect(prompt).toMatch(/official Testland government domains/);
    expect(prompt).toMatch(/\[source: https:\/\/\.\.\.\]/);
    expect(prompt).toMatch(/Do not answer from memory/);
  });

  it("uses an explicit domain allowlist when the deployment supplies one", () => {
    const scoped = buildSectorGenerationPrompt({
      countryName: "Testland",
      prioritySectors: SECTORS,
      skillNames: ["ICT Literacy"],
      categories: CATEGORIES,
      careersByCategory: new Map([["Technology", ["Software Engineer"]]]),
      officialDomains: ["gov.ae", "u.ae"],
    });
    expect(scoped).toMatch(/Search ONLY these domains: gov\.ae, u\.ae/);
  });
});
