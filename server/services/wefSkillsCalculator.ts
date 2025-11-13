/**
 * WEF Skills Calculator
 * 
 * Computes WEF 16 Skills scores from existing assessment data
 * without requiring students to answer additional questions.
 * 
 * Calculation approach:
 * 1. Extract scores from each assessment (CVQ, RIASEC, Kolb, Subjects)
 * 2. Map to WEF skills using research-validated correlations
 * 3. Aggregate weighted scores for each of the 16 WEF skills
 * 4. Normalize to 0-100 scale for consistency
 */

import {
  CVQ_TO_WEF_MAPPING,
  RIASEC_TO_WEF_MAPPING,
  KOLB_TO_WEF_MAPPING,
  SUBJECT_TO_WEF_MAPPING,
  WEFSkillName,
} from './wefAssessmentMapping';

/**
 * Assessment data structure expected from database
 */
export interface AssessmentData {
  cvqScores?: Record<string, number>; // Domain → average score (1-5)
  riasecScores?: Record<string, number>; // Theme → normalized score (0-1)
  kolbScores?: Record<string, number>; // Style → score
  subjectScores?: Record<string, number>; // Subject → quiz percentage (0-100)
}

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

      // CVQ scores are 1-5, normalize to 0-100
      const normalizedScore = ((score - 1) / 4) * 100;

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
      const mappings = RIASEC_TO_WEF_MAPPING[theme.toLowerCase()];
      if (!mappings) return;

      // RIASEC scores already normalized 0-1, scale to 0-100
      const normalizedScore = score * 100;

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

  // Process Kolb scores
  if (assessmentData.kolbScores) {
    // Find dominant learning style (highest score)
    const dominantStyle = Object.entries(assessmentData.kolbScores).reduce((prev, curr) =>
      curr[1] > prev[1] ? curr : prev
    );

    const [style, score] = dominantStyle;
    const mappings = KOLB_TO_WEF_MAPPING[style.toLowerCase()];
    if (mappings) {
      // Use dominant style score (already 0-100 typically)
      const normalizedScore = score;

      mappings.forEach(({ wefSkill, weight }) => {
        initSkill(wefSkill);
        const acc = skillAccumulator.get(wefSkill)!;
        const contribution = normalizedScore * weight;

        acc.weightedSum += contribution;
        acc.totalWeight += weight;
        acc.sources.push({
          assessment: "Kolb",
          component: style,
          contribution,
        });
      });
    }
  }

  // Process Subject Competency scores
  if (assessmentData.subjectScores) {
    Object.entries(assessmentData.subjectScores).forEach(([subject, score]) => {
      const mappings = SUBJECT_TO_WEF_MAPPING[subject];
      if (!mappings) return;

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
      score: data.totalWeight > 0 ? Math.round(data.weightedSum / data.totalWeight) : 0,
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
