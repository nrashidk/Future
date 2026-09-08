/**
 * How many assessments a taker may COMPLETE, by population.
 *
 * TWO NUMBERS, NOT ONE, AND THEY ARE NOT THE SAME CONCEPT. They happen to share
 * a shape today — "a count of completed assessments this person is allowed" —
 * and collapsing them into a single constant would couple a pricing change to an
 * abuse-control change. They live together here so the relationship is visible
 * in one place rather than inferred from two literals in two files.
 *
 *   SCHOOL_ALLOCATIONS_PER_STUDENT is a PURCHASED LICENCE ALLOCATION. An
 *   organization paid for it, it is consumed at completion (the
 *   organizationMembers.hasCompletedAssessment flip in the generation
 *   transaction), and a school can in principle be sold more. It moves when
 *   PRICING moves. PD2 turns it into "allocations for the active period" rather
 *   than a lifetime count, at which point this constant stops being a plain
 *   number and this file is where that change starts.
 *
 *   FREE_ASSESSMENT_CAP is an ANTI-ABUSE CEILING on an unpaid tier. Nothing buys
 *   it, nothing revokes it, no period resets it, and no one can be sold more of
 *   it. It moves when ABUSE PATTERNS move.
 *
 * They are entangled — FOLLOWUP.md records that the free cap "changes what a
 * licence is consumed BY" — but entangled is not identical. If a future change
 * makes one of these depend on the other, write that dependency down here; do
 * not merge them.
 *
 * SELF-PAYING PREMIUM USERS ARE BOUND BY NEITHER. Their limit is
 * users.purchasedLicenses, a per-user consumable, and neither number above
 * applies to them. Anything guarding on these two must exclude them explicitly.
 */

/** School students: allocations granted per student by their school's licence. */
export const SCHOOL_ALLOCATIONS_PER_STUDENT = 1;

/** Free (authenticated, non-school, non-premium) accounts: lifetime completions. */
export const FREE_ASSESSMENT_CAP = 3;

/**
 * How many completed assessments this taker is allowed, by population.
 *
 * ONE function rather than the same three-way condition written at each guard.
 * It is currently needed in three places — the create guard
 * (server/routes/assessment.routes.ts), the generation guard
 * (server/routes/recommendations.routes.ts) and the client's availability hook —
 * and three hand-written copies of "school? premium? otherwise free" is exactly
 * the drift this codebase has been bitten by before: a control applied at one
 * site and not its siblings.
 *
 * Infinity for a self-paying premium account is NOT "unlimited". It means this
 * module does not model their limit, which is users.purchasedLicenses. A caller
 * that needs to bound a premium user must do it separately; a caller that only
 * needs to know whether the FREE cap applies gets the right answer from here.
 *
 * School students return their allocation, but note that the school guard on the
 * create path is enforced against organizationMembers.hasCompletedAssessment
 * rather than by counting rows — the number here is what the client renders.
 */
export function assessmentLimitFor(
  isSchoolStudent: boolean,
  isPremiumUser: boolean,
): number {
  if (isSchoolStudent) return SCHOOL_ALLOCATIONS_PER_STUDENT;
  if (isPremiumUser) return Infinity;
  return FREE_ASSESSMENT_CAP;
}

/**
 * Is this taker a free account that has spent its cap?
 *
 * FALSE for school students and premium accounts by construction, so callers
 * cannot accidentally apply the free ceiling to a population that did not earn
 * it. `completedCount` is a count of OTHER completed assessments at the
 * generation guard, and of all completed assessments at the create guard — the
 * two questions differ, which is why the count is passed in rather than fetched
 * here.
 */
export function isFreeTierCapReached(
  isSchoolStudent: boolean,
  isPremiumUser: boolean,
  completedCount: number,
): boolean {
  if (isSchoolStudent || isPremiumUser) return false;
  return completedCount >= FREE_ASSESSMENT_CAP;
}
