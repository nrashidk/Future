/**
 * How many assessments a taker may COMPLETE, by population.
 *
 * TWO POPULATIONS, AND ONLY ONE OF THEM IS A NUMBER IN THIS FILE.
 *
 *   POOLED TAKERS — school students and self-paying parents — are bounded by a
 *   LICENCE POOL, which is data, not a constant. A licence is spent when a
 *   report is generated, the ledger is the accounting record, and the balance
 *   can only be answered by the server. Nothing in this file can say what it
 *   is; callers pass it in.
 *
 *   FREE_ASSESSMENT_CAP is an ANTI-ABUSE CEILING on an unpaid tier. Nothing
 *   buys it, nothing revokes it, no period resets it, and no one can be sold
 *   more of it. It moves when ABUSE PATTERNS move, never when pricing does.
 *
 * WHAT THIS FILE USED TO SAY, AND WHY IT WAS WRONG. There was a constant here,
 * SCHOOL_ALLOCATIONS_PER_STUDENT = 1, and a self-paying account returned
 * Infinity. Both were load-bearing and both were false:
 *
 *   The 1 capped every school student at one assessment for life. Nothing
 *   anywhere could reset it, so a school could never buy a second year for a
 *   student it had already assessed -- which is why multi-year progression
 *   worked for every population except the one it was built for.
 *
 *   The Infinity meant a single purchase bought unlimited reports. The comment
 *   defending it said the real limit was users.purchasedLicenses, and that was
 *   true of the intent and false of the code: nothing counted consumption, so
 *   there was no second number doing the work this one declined to do.
 *
 * Both are gone. A pooled taker's limit is their balance, and there is now a
 * ledger that makes the balance a fact rather than an intention.
 */

/** Free (authenticated, non-school, non-premium) accounts: lifetime completions. */
export const FREE_ASSESSMENT_CAP = 3;

/**
 * How many more assessments this taker may complete.
 *
 * ONE function rather than the same condition written at each guard -- the
 * drift this codebase has repeatedly been bitten by is a control applied at one
 * site and not its siblings.
 *
 * `licensesAvailable` is the pool balance for a pooled taker, from the server:
 * a number, or null meaning an unlimited pool (the superadmin override used for
 * pilots and MOUs). It is ignored for free accounts, who are not on a pool.
 *
 * Passing undefined for a pooled taker returns 0, deliberately. An unknown
 * balance must not render as an entry point the server is about to refuse --
 * the same fail-closed rule the availability hook already applies while auth is
 * unresolved.
 */
export function assessmentLimitFor(
  isSchoolStudent: boolean,
  isPremiumUser: boolean,
  licensesAvailable?: number | null,
): number {
  if (isSchoolStudent || isPremiumUser) {
    if (licensesAvailable === null) return Infinity;
    return licensesAvailable ?? 0;
  }
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

/**
 * Zero assessments before payment, for a parent-registers account — decided
 * 2026-09-16, replacing FREE_ASSESSMENT_CAP for this population (that cap
 * modelled the allowance on the free tier being retired; a guest already
 * gets the identical free 2-match report with no registration at all, so a
 * pre-payment allowance on a durable, identified account served no purpose
 * the guest path does not already serve with less friction).
 *
 * A SEPARATE FUNCTION FROM isFreeTierCapReached, not a third argument to it:
 * the two rules are unrelated in shape (a threshold vs. an outright refusal)
 * and unrelated in what triggers them (a completed-assessment count vs. the
 * mere existence of a child profile) — collapsing them would make one
 * function answer two different questions.
 *
 * ONE FUNCTION, TWO CALL SITES — assessment.routes.ts's create guard and
 * recommendations.routes.ts's generation guard, the same two places
 * isFreeTierCapReached is checked, for the same reason: the create guard
 * bounds what gets STARTED, the generation guard is authoritative for what
 * gets COMPLETED, and an assessment created before this rule shipped must
 * not become completable by a still-unpaid account once it has.
 */
export function requiresPaymentBeforeAssessment(
  hasChildProfile: boolean,
  isPremiumUser: boolean,
): boolean {
  return hasChildProfile && !isPremiumUser;
}
