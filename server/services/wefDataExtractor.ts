/**
 * WEF Data Extractor
 * 
 * Extracts assessment data from database models and transforms it into
 * the format required by the WEF Skills Calculator.
 */

import type { Assessment, CvqResult, AssessmentQuiz, QuizResponse } from "@shared/schema";
import type { AssessmentData } from "./wefSkillsCalculator";
import type { IStorage } from "../storage";

/**
 * Build WEF assessment data from database records
 * 
 * Orchestrates data extraction from multiple sources:
 * - CVQ domain scores from cvq_results table
 * - RIASEC scores from assessment JSONB fields
 * - Subject-level quiz scores from quiz responses
 */
export async function buildWEFAssessmentData(
  storage: IStorage,
  assessment: Assessment
): Promise<AssessmentData> {
  const data: AssessmentData = {};

  // Extract CVQ domain scores
  const cvqResult = await storage.getCvqResultByAssessmentId(assessment.id);
  if (cvqResult) {
    data.cvqScores = extractCVQDomainScores(cvqResult);
  }

  // Extract RIASEC scores (already normalized 0-100 by questionBanks/riasec.ts:46-53).
  // Keyed by Holland letter, and also carries top3 / ranking arrays; the calculator
  // maps the letters and skips the non-numeric entries.
  if (assessment.riasecScores && typeof assessment.riasecScores === 'object') {
    data.riasecScores = assessment.riasecScores as Record<string, number>;
  }


  // Extract subject-level quiz scores
  const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
  if (quiz) {
    data.subjectScores = await extractSubjectScores(storage, quiz);
  }

  return data;
}

/**
 * Extract domain scores from CVQ result
 * Uses pre-calculated normalized scores (0-100 scale)
 */
function extractCVQDomainScores(cvqResult: CvqResult): Record<string, number> {
  if (!cvqResult.normalizedScores || typeof cvqResult.normalizedScores !== 'object') {
    return {};
  }

  // normalizedScores already contains domain scores (0-100 scale)
  // e.g., { achievement: 80, honesty: 100, kindness: 65, ... }
  return cvqResult.normalizedScores as Record<string, number>;
}

/**
 * Extract per-subject quiz scores.
 *
 * assessment_quizzes.subjectScores is { subject: { correct, total, percentage } }
 * (quiz.routes.ts:415-453) — NOT a bare number, despite the schema comment. Passing
 * the objects through made the calculator compute `object * weight` = NaN across 11
 * of 16 skills. Flatten to the percentage here so the calculator keeps its
 * Record<string, number> contract; tolerate a bare number for compatibility with any
 * older rows.
 */
async function extractSubjectScores(
  storage: IStorage,
  quiz: AssessmentQuiz
): Promise<Record<string, number>> {
  if (!quiz.subjectScores || typeof quiz.subjectScores !== 'object') {
    return {};
  }

  const raw = quiz.subjectScores as Record<string, unknown>;
  const flattened: Record<string, number> = {};

  for (const [subject, value] of Object.entries(raw)) {
    let percentage: number | null = null;

    if (typeof value === 'number') {
      percentage = value;
    } else if (value && typeof value === 'object' && typeof (value as any).percentage === 'number') {
      percentage = (value as any).percentage;
    }

    if (percentage !== null && Number.isFinite(percentage)) {
      flattened[subject] = percentage;
    }
  }

  return flattened;
}

/**
 * Validate that assessment has sufficient data for WEF calculation
 */
export function hasWEFData(data: AssessmentData): boolean {
  return !!(
    (data.cvqScores && Object.keys(data.cvqScores).length > 0) ||
    (data.riasecScores && Object.keys(data.riasecScores).length > 0) ||
    (data.subjectScores && Object.keys(data.subjectScores).length > 0)
  );
}
