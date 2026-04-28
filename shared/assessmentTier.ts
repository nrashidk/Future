/**
 * Assessment tier detection utilities
 * Shared between client and server for consistent tier detection
 */

const PREMIUM_ASSESSMENT_TYPES = ['premium', 'school'] as const;

export type PremiumAssessmentType = typeof PREMIUM_ASSESSMENT_TYPES[number];

/**
 * Determines if an assessment is a premium tier assessment
 * Premium assessments use RIASEC and CVQ assessments
 * Free assessments use Interests and Personality questions
 */
export function isPremiumAssessment(assessmentType: string | null | undefined): boolean {
  if (!assessmentType) return false;
  return PREMIUM_ASSESSMENT_TYPES.includes(assessmentType.toLowerCase() as PremiumAssessmentType);
}
