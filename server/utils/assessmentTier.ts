/**
 * Assessment tier detection utilities
 * Re-exports from shared module for server-side usage
 */

export { isPremiumAssessment, type PremiumAssessmentType } from '@shared/assessmentTier';

const FREE_ASSESSMENT_TYPES = ['basic', 'free'] as const;
export type FreeAssessmentType = typeof FREE_ASSESSMENT_TYPES[number];
export type AssessmentType = import('@shared/assessmentTier').PremiumAssessmentType | FreeAssessmentType;

/**
 * Determines if an assessment is a free tier assessment
 */
export function isFreeAssessment(assessmentType: string | null | undefined): boolean {
  if (!assessmentType) return true;
  return FREE_ASSESSMENT_TYPES.includes(assessmentType.toLowerCase() as FreeAssessmentType);
}
