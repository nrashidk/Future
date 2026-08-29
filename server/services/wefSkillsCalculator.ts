/**
 * WEF Skills Calculator
 * 
 * Computes WEF 16 Skills scores from existing assessment data
 * without requiring students to answer additional questions.
 * 
 * Calculation approach:
 * 1. Extract scores from each assessment (CVQ, RIASEC, Subjects)
 * 2. Map to WEF skills using research-validated correlations
 * 3. Aggregate weighted scores for each of the 16 WEF skills
 * 4. Normalize to 0-100 scale for consistency
 */

import {
  CVQ_TO_WEF_MAPPING,
  RIASEC_TO_WEF_MAPPING,
  SUBJECT_TO_WEF_MAPPING,
  WEFSkillName,
} from './wefAssessmentMapping';

/**
 * Assessment data structure expected from database
 */
export interface AssessmentData {
  /** CVQ domain → normalized score, ALREADY 0-100 (cvq.routes.ts:103). */
  cvqScores?: Record<string, number>;
  /**
   * RIASEC theme → normalized score, ALREADY 0-100 (questionBanks/riasec.ts:46-53).
   * Keyed by Holland letter ("R", "I", …). The stored object also carries the
   * non-numeric `top3` / `ranking` arrays, which are skipped at runtime.
   */
  riasecScores?: Record<string, number>;
  /** Subject → quiz percentage 0-100, flattened by wefDataExtractor.ts. */
  subjectScores?: Record<string, number>;
}

/**
 * RIASEC scores are stored keyed by Holland letter, but RIASEC_TO_WEF_MAPPING is
 * keyed by full theme name. Accept either so the branch cannot silently no-op.
 */
const RIASEC_KEY_TO_THEME: Record<string, string> = {
  r: "realistic",     realistic: "realistic",
  i: "investigative", investigative: "investigative",
  a: "artistic",      artistic: "artistic",
  s: "social",        social: "social",
  e: "enterprising",  enterprising: "enterprising",
  c: "conventional",  conventional: "conventional",
};

/**
 * Individual WEF skill score with contributing evidence
 */
export interface WEFSkillScore {
  skillName: WEFSkillName;
  score: number; // 0-100
  sources: Array<{
    assessment: string;
    component: string;
    contribution: number;
  }>;
}

/**
 * Complete WEF skills profile
 */
export interface WEFSkillsProfile {
  scores: WEFSkillScore[];
  overallReadiness: number; // 0-100, average of all skills
  topSkills: WEFSkillName[]; // Top 5 skills
  growthAreas: WEFSkillName[]; // Bottom 5 skills
}

/**
 * Calculate WEF skills profile from assessment data
 */
export function calculateWEFSkills(assessmentData: AssessmentData): WEFSkillsProfile {
  const skillAccumulator: Map<
    string,
    {
      weightedSum: number;
      totalWeight: number;
      sources: Array<{ assessment: string; component: string; contribution: number }>;
    }
  > = new Map();

  // Initialize all 16 WEF skills
  const initSkill = (skillName: string) => {
    if (!skillAccumulator.has(skillName)) {
      skillAccumulator.set(skillName, {
        weightedSum: 0,
        totalWeight: 0,
        sources: [],
      });
    }
  };

  // Process CVQ scores
  if (assessmentData.cvqScores) {
    Object.entries(assessmentData.cvqScores).forEach(([domain, score]) => {
      const mappings = CVQ_TO_WEF_MAPPING[domain];
      if (!mappings) return;
      if (typeof score !== "number" || !Number.isFinite(score)) return;

      // cvq_results.normalizedScores is ALREADY 0-100 — cvq.routes.ts:103 does the
      // 1-5 → 0-100 conversion at the source. Re-normalizing here inflated ~24.75x
      // (a stored 80 became 1975). Identity.
      const normalizedScore = score;

      mappings.forEach(({ wefSkill, weight }) => {
        initSkill(wefSkill);
        const acc = skillAccumulator.get(wefSkill)!;
        const contribution = normalizedScore * weight;

        acc.weightedSum += contribution;
        acc.totalWeight += weight;
        acc.sources.push({
          assessment: "CVQ",
          component: domain,
          contribution,
        });
      });
    });
  }

  // Process RIASEC scores
  if (assessmentData.riasecScores) {
    Object.entries(assessmentData.riasecScores).forEach(([theme, score]) => {
      // Skips the `top3` / `ranking` arrays that share this object.
      if (typeof score !== "number" || !Number.isFinite(score)) return;

      const themeKey = RIASEC_KEY_TO_THEME[theme.toLowerCase()];
      if (!themeKey) return;

      const mappings = RIASEC_TO_WEF_MAPPING[themeKey];
      if (!mappings) return;

      // questionBanks/riasec.ts:46-53 already clamps to 0-100. Do not re-scale:
      // this branch was dead (letter key vs theme-name key), so the 100x below it
      // never fired. Both are fixed together, deliberately. Identity.
      const normalizedScore = score;

      mappings.forEach(({ wefSkill, weight }) => {
        initSkill(wefSkill);
        const acc = skillAccumulator.get(wefSkill)!;
        const contribution = normalizedScore * weight;

        acc.weightedSum += contribution;
        acc.totalWeight += weight;
        acc.sources.push({
          assessment: "RIASEC",
          component: theme,
          contribution,
        });
      });
    });
  }

  // Process Subject Competency scores
  if (assessmentData.subjectScores) {
    Object.entries(assessmentData.subjectScores).forEach(([subject, score]) => {
      const mappings = SUBJECT_TO_WEF_MAPPING[subject];
      if (!mappings) return;
      // wefDataExtractor.ts flattens { correct, total, percentage } → percentage.
      // Guard anyway: an object here produced NaN across 11 of 16 skills.
      if (typeof score !== "number" || !Number.isFinite(score)) return;

      // Subject scores are already 0-100 (quiz percentages)
      const normalizedScore = score;

      mappings.forEach(({ wefSkill, weight }) => {
        initSkill(wefSkill);
        const acc = skillAccumulator.get(wefSkill)!;
        const contribution = normalizedScore * weight;

        acc.weightedSum += contribution;
        acc.totalWeight += weight;
        acc.sources.push({
          assessment: "Subject Quiz",
          component: subject,
          contribution,
        });
      });
    });
  }

  // Calculate final scores
  const scores: WEFSkillScore[] = Array.from(skillAccumulator.entries()).map(
    ([skillName, data]) => ({
      skillName: skillName as WEFSkillName,
      // Clamp so no future input-contract drift can persist an out-of-range score
      // for a minor. Nothing downstream clamps.
      score:
        data.totalWeight > 0 && Number.isFinite(data.weightedSum)
          ? Math.max(0, Math.min(100, Math.round(data.weightedSum / data.totalWeight)))
          : 0,
      sources: data.sources,
    })
  );

  // Sort by score for ranking
  scores.sort((a, b) => b.score - a.score);

  // Calculate overall readiness
  const overallReadiness = Math.round(
    scores.reduce((sum, s) => sum + s.score, 0) / Math.max(scores.length, 1)
  );

  // Identify top and growth areas
  const topSkills = scores.slice(0, 5).map((s) => s.skillName);
  const growthAreas = scores.slice(-5).map((s) => s.skillName);

  return {
    scores,
    overallReadiness,
    topSkills,
    growthAreas,
  };
}

/**
 * Get detailed explanation for a specific skill score
 */
export function explainWEFSkillScore(skillScore: WEFSkillScore): string {
  const { skillName, score, sources } = skillScore;

  if (sources.length === 0) {
    return `${skillName}: No assessment data available yet.`;
  }

  // Group by assessment type
  const byAssessment = sources.reduce((acc, source) => {
    if (!acc[source.assessment]) {
      acc[source.assessment] = [];
    }
    acc[source.assessment].push(source);
    return acc;
  }, {} as Record<string, typeof sources>);

  const explanations = Object.entries(byAssessment).map(([assessment, srcs]) => {
    const components = srcs.map((s) => s.component).join(", ");
    return `${assessment} (${components})`;
  });

  return `${skillName} (${score}/100): Based on ${explanations.join("; ")}`;
}

/**
 * Map WEF skill names to database column names
 * Used for persisting WEF profile to database
 */
export const WEF_SKILL_TO_COLUMN: Record<WEFSkillName, string> = {
  "Literacy": "literacy",
  "Numeracy": "numeracy",
  "Scientific Literacy": "scientific_literacy",
  "ICT Literacy": "ict_literacy",
  "Financial Literacy": "financial_literacy",
  "Cultural and Civic Literacy": "cultural_civic_literacy",
  "Critical Thinking and Problem Solving": "critical_thinking",
  "Creativity": "creativity",
  "Communication": "communication",
  "Collaboration": "collaboration",
  "Curiosity": "curiosity",
  "Initiative": "initiative",
  "Persistence and Grit": "persistence_grit",
  "Adaptability": "adaptability",
  "Leadership": "leadership",
  "Social and Cultural Awareness": "social_cultural_awareness",
};

/**
 * Convert WEF Skills Profile to database column format
 */
export function mapWEFProfileToColumns(profile: WEFSkillsProfile): Record<string, number> {
  const columns: Record<string, number> = {};

  // Map each skill score to its database column
  profile.scores.forEach(({ skillName, score }) => {
    const columnName = WEF_SKILL_TO_COLUMN[skillName];
    if (columnName) {
      columns[columnName] = score;
    }
  });

  // Set overall readiness
  columns.overall_readiness = profile.overallReadiness;

  return columns;
}

/**
 * Extract source attribution text from profile
 */
export function getSourceAttribution(profile: WEFSkillsProfile): string {
  const assessments = new Set<string>();
  
  profile.scores.forEach(score => {
    score.sources.forEach(source => {
      assessments.add(source.assessment);
    });
  });

  const assessmentList = Array.from(assessments).join(", ");
  return assessmentList.length > 0
    ? `Calculated from ${assessmentList}`
    : "Calculated from assessment data";
}
