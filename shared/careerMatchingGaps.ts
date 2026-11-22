/**
 * WHICH OF A CAREER'S MATCHING PROFILES ARE MISSING.
 *
 * A seeded career carries matching data beside its subjects: a personality
 * (RIASEC) profile, a values profile, a future-skills (WEF) profile and a
 * national-sector placement. A
 * career added from the superadmin form gets none of them, and matching
 * handles each absence differently:
 *  - personality and values: the component is SKIPPED and the weights
 *    rebalance, so the career is scored on less evidence than its neighbours;
 *  - sector placement: with no per-career placement and no rule for its
 *    category, the country-vision score falls to its FLOOR (40) -- the real
 *    penalty. 32 of the 68 seeded careers are placed per career (Chef's
 *    "Culinary Arts" has no category rule). Measured 2026-11-22 in the
 *    harness: Chef 68.9, the same career added through the form about 46.
 *  - future skills: modulates vision within a placed sector.
 * Nothing said so anywhere. This rule feeds the badge on the careers list.
 */
export type CareerMatchingGap = "personality" | "values" | "futureSkills" | "sectorPlacement";

export function careerMatchingGaps(input: {
  valuesProfile: unknown;
  hasPersonalityProfile: boolean;
  hasFutureSkillsProfile: boolean;
  /** A per-career sector placement, or a category rule covering its category. */
  hasSectorPlacement: boolean;
}): CareerMatchingGap[] {
  const gaps: CareerMatchingGap[] = [];
  if (!input.hasPersonalityProfile) gaps.push("personality");
  const v = input.valuesProfile;
  if (!v || typeof v !== "object" || Object.keys(v as object).length === 0) gaps.push("values");
  if (!input.hasFutureSkillsProfile) gaps.push("futureSkills");
  if (!input.hasSectorPlacement) gaps.push("sectorPlacement");
  return gaps;
}
