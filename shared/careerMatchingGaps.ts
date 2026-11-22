/**
 * WHICH OF A CAREER'S MATCHING PROFILES ARE MISSING.
 *
 * A seeded career carries three profiles beside its subjects: a personality
 * (RIASEC) profile, a values profile and a future-skills (WEF) profile. A
 * career added from the superadmin form gets none of them, and matching
 * handles each absence differently:
 *  - personality and values: the component is SKIPPED and the weights
 *    rebalance, so the career is scored on less evidence than its neighbours;
 *  - future skills: the country-vision score falls to its FLOOR (40), a real
 *    penalty. Measured 2026-11-22 in the harness: Chef 68.9, the same career
 *    added through the form about 46 -- out of every top five.
 * Nothing said so anywhere. This rule feeds the badge on the careers list.
 */
export type CareerMatchingGap = "personality" | "values" | "futureSkills";

export function careerMatchingGaps(input: {
  valuesProfile: unknown;
  hasPersonalityProfile: boolean;
  hasFutureSkillsProfile: boolean;
}): CareerMatchingGap[] {
  const gaps: CareerMatchingGap[] = [];
  if (!input.hasPersonalityProfile) gaps.push("personality");
  const v = input.valuesProfile;
  if (!v || typeof v !== "object" || Object.keys(v as object).length === 0) gaps.push("values");
  if (!input.hasFutureSkillsProfile) gaps.push("futureSkills");
  return gaps;
}
