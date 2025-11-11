/**
 * Tier-specific weight overrides for assessment components
 * 
 * Each tier's weights must sum to 100%
 */

export type AssessmentTier = 'basic' | 'kolb' | 'group';

/**
 * Weight overrides per tier per component
 * undefined means component is not used in that tier
 */
export const TIER_WEIGHT_OVERRIDES: Record<AssessmentTier, Record<string, number | undefined>> = {
  // Free tier: Uses only non-premium components
  basic: {
    subjects: 35,      // Subject competency + preferences
    interests: 35,     // Interest keyword matching
    vision: 30,        // Country vision alignment
    riasec: undefined, // Not available
    cvq: undefined,    // Not available
    kolb: undefined,   // Not available
    market: undefined, // Deprecated
  },
  
  // Premium tier (Kolb/Individual assessment): Uses all components
  kolb: {
    subjects: 20,      // Reduced weight, premium components take priority
    interests: 0,      // Not used in premium tier
    vision: 20,        // Reduced weight
    riasec: 30,        // Primary personality assessment
    cvq: 20,           // Values assessment
    kolb: 10,          // Learning style assessment
    market: undefined, // Deprecated
  },
  
  // Group assessment tier: Same as kolb for now
  group: {
    subjects: 20,
    interests: 0,
    vision: 20,
    riasec: 30,
    cvq: 20,
    kolb: 10,
    market: undefined,
  },
};

/**
 * Validate that all tier configurations sum to 100%
 * Should be called during app startup
 */
export function validateTierWeights(): void {
  const errors: string[] = [];
  
  for (const [tier, weights] of Object.entries(TIER_WEIGHT_OVERRIDES)) {
    const total = Object.values(weights)
      .filter((w): w is number => w !== undefined)
      .reduce((sum, w) => sum + w, 0);
    
    if (Math.abs(total - 100) > 0.01) {
      errors.push(
        `Tier "${tier}" weights sum to ${total}% instead of 100%. ` +
        `Components: ${JSON.stringify(weights)}`
      );
    }
  }
  
  if (errors.length > 0) {
    throw new Error(
      `Tier weight configuration validation failed:\n${errors.join('\n')}`
    );
  }
}

/**
 * Get effective weight for a component in a given tier
 * Returns the override if defined, otherwise falls back to database weight
 */
export function getEffectiveWeight(
  tier: AssessmentTier,
  componentKey: string,
  dbWeight: number
): number {
  const override = TIER_WEIGHT_OVERRIDES[tier]?.[componentKey];
  return override !== undefined ? override : dbWeight;
}
