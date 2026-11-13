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
 * THERE USED TO BE A THIRD RULE HERE: requiresPaymentBeforeAssessment, "zero
 * assessments before payment for an account with a child profile" (decided
 * 2026-09-16). REVERSED BY THE OWNER ON 2026-11-13: a parent may register a
 * student account, stay free, and take the free assessment, because the one
 * thing the guest path cannot do is KEEP the report (a guest row is deleted
 * within 72 hours). An unpaid account with a child profile is therefore an
 * ordinary free account: no pool (shared/licensePool.ts), bounded by
 * FREE_ASSESSMENT_CAP, basic report, no PDF.
 */
