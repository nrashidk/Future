/**
 * Assessment tier detection utilities
 * Centralizes the logic for determining if an assessment is premium or free tier
 */

// Assessment types that are considered premium (require Kolb/RIASEC/CVQ steps)
const PREMIUM_ASSESSMENT_TYPES = ['kolb', 'kolb_premium', 'premium', 'school'] as const;

// Assessment types that are considered free (require Interests/Personality steps)
const FREE_ASSESSMENT_TYPES = ['basic', 'free'] as const;

export type PremiumAssessmentType = typeof PREMIUM_ASSESSMENT_TYPES[number];
export type FreeAssessmentType = typeof FREE_ASSESSMENT_TYPES[number];
export type AssessmentType = PremiumAssessmentType | FreeAssessmentType;

/**
 * Determines if an assessment is a premium tier assessment
 * Premium assessments use Kolb, RIASEC, and CVQ assessments
 * Free assessments use Interests and Personality questions
 * 
 * @param assessmentType - The assessment type from the assessment record
 * @returns true if the assessment is premium tier, false otherwise
 */
export function isPremiumAssessment(assessmentType: string | null | undefined): boolean {
  if (!assessmentType) return false;
  return PREMIUM_ASSESSMENT_TYPES.includes(assessmentType.toLowerCase() as PremiumAssessmentType);
}

/**
 * Determines if an assessment is a free tier assessment
 * 
 * @param assessmentType - The assessment type from the assessment record
 * @returns true if the assessment is free tier, false otherwise
 */
export function isFreeAssessment(assessmentType: string | null | undefined): boolean {
  if (!assessmentType) return true; // Default to free if not specified
  return FREE_ASSESSMENT_TYPES.includes(assessmentType.toLowerCase() as FreeAssessmentType);
}
