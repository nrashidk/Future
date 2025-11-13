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
 * - RIASEC/Kolb scores from assessment JSONB fields
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

  // Extract RIASEC scores (already normalized 0-1 in database)
  if (assessment.riasecScores && typeof assessment.riasecScores === 'object') {
    data.riasecScores = assessment.riasecScores as Record<string, number>;
  }

  // Extract Kolb scores
  if (assessment.kolbScores && typeof assessment.kolbScores === 'object') {
    data.kolbScores = assessment.kolbScores as Record<string, number>;
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
 * Extract per-subject quiz scores
 * Uses pre-calculated subject scores from quiz (0-100 scale)
 */
async function extractSubjectScores(
  storage: IStorage,
  quiz: AssessmentQuiz
): Promise<Record<string, number>> {
  // subjectScores already contains per-subject percentages
  // e.g., { "Mathematics": 85, "Science": 72, "English": 90 }
  if (!quiz.subjectScores || typeof quiz.subjectScores !== 'object') {
    return {};
  }

  return quiz.subjectScores as Record<string, number>;
}

/**
 * Validate that assessment has sufficient data for WEF calculation
 */
export function hasWEFData(data: AssessmentData): boolean {
  return !!(
    (data.cvqScores && Object.keys(data.cvqScores).length > 0) ||
    (data.riasecScores && Object.keys(data.riasecScores).length > 0) ||
    (data.kolbScores && Object.keys(data.kolbScores).length > 0) ||
    (data.subjectScores && Object.keys(data.subjectScores).length > 0)
  );
}
