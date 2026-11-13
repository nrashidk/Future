import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Assessment } from "@shared/schema";
import { assessmentLimitFor, isFreeTierCapReached } from "@shared/assessmentLimits";

/**
 * Single source of truth for a school student's remaining assessment allocation,
 * and for whether the caller is a school student at all.
 *
 * Mirrors the server-side license guard on POST /api/assessments. The server 403
 * is authoritative; this hook is for hiding dead entry points client-side.
 */
export function useAssessmentAvailability() {
  const { user, isLoading: authLoading } = useAuth();

  // MEMBERSHIP COMES FROM THE MEMBER ROW. isOrgStudent is decorated onto
  // /api/auth/user from the caller's organization_members row with role
  // 'student' (e9f8d81) — the same test the server's field lock uses (14459a4)
  // and the same one the assessment's steps read (15203ec). This was
  // `user?.accountType === "org_student"`: a student whose flag was wrong got
  // the correct field lock and, from here, the wrong availability answer.
  //
  // This note used to call itself the last accountType-keyed membership test in
  // the codebase. It was one file early — Profile.tsx still keyed on
  // accountType and was moved after this one, so the copy of this note in that
  // file is the one that actually ends the list.
  //
  // THREE-STATE, matching 15203ec: undefined while auth is unresolved. A guest,
  // a self-paid student and a student still being identified all lack the
  // decoration, so `user` alone cannot separate "no" from "not yet" — authLoading
  // is what does.
  const isOrgStudent: boolean | undefined = authLoading ? undefined : !!user?.isOrgStudent;

  // Self-paying premium accounts are bound by purchasedLicenses, not by either
  // number in shared/assessmentLimits.ts. Resolved here so the availability
  // branch below can exclude them by name rather than by omission.
  const isPremiumUser: boolean | undefined = authLoading ? undefined : !!user?.isPremium;

  // WHO IS LIMITED, and it is no longer only org students. A free account is
  // capped at FREE_ASSESSMENT_CAP completions, so it needs the same fetch. This
  // query used to be `enabled: isOrgStudent === true`, which was correct while
  // the only limited population was school students and became wrong the moment
  // free accounts were allowed onto /assessment at all.
  //
  // `=== false` on both, not truthiness: firing this while membership or tier is
  // unknown would ask for the allocation of a caller we have not identified, and
  // the three-state reasoning below depends on not doing that.
  const isCapCounted =
    isOrgStudent === undefined || isPremiumUser === undefined
      ? undefined
      : isOrgStudent === true || isPremiumUser === false;

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<Assessment[]>({
    queryKey: ["/api/assessments/my"],
    // Premium accounts too: an individual buyer's own pool can run out, and
    // the screen that says so needs to know whether a draft is still open
    // (which may be finished) and which report to offer instead.
    enabled: isCapCounted === true || isPremiumUser === true,
  });

  /**
   * THE POOL BALANCE, from the server, for anyone who is on a pool.
   *
   * This hook used to derive the number locally: a school student was shown a
   * hardcoded 1, and a paying account was shown unlimited. Neither is a fact
   * about the account -- a licence belongs to a pool, is spent when a report is
   * generated, and only the server can say what is left in it.
   *
   * Fetched for pooled populations only. A free account has no pool and is
   * still bounded by the cap arithmetic below.
   */
  const isPooled =
    isOrgStudent === undefined || isPremiumUser === undefined
      ? undefined
      : isOrgStudent === true || isPremiumUser === true;

  const { data: licenseBalance, isLoading: licenseLoading } = useQuery<{
    onPool: boolean;
    available: number | null;
    isUnlimited: boolean;
    sameGradeAlreadyCharged: boolean;
    repeatBlocked?: boolean;
    currentGrade: string | null;
  }>({
    queryKey: ["/api/licenses/me"],
    enabled: isPooled === true,
  });

  const completed = assessments.filter((a) => a.isCompleted);
  const hasInProgress = assessments.some((a) => !a.isCompleted && a.currentStep > 1);

  // Array comes back ordered by createdAt desc, so the first completed is the latest.
  const completedReportId = completed[0]?.id ?? null;

  // WHICH LIMIT APPLIES. Two shapes, not three populations:
  //   pooled (school student or self-payer) -> the pool's remaining balance,
  //                                            fetched above; null = unlimited
  //   free account                          -> FREE_ASSESSMENT_CAP, an
  //                                            anti-abuse ceiling, counted
  //                                            against completions
  //
  // Unknown still falls to a LIMITED branch rather than Infinity, for the
  // reason it always did: a hook that says "unlimited" while the server refuses
  // offers an entry point that is going to be rejected. Consumers must gate on
  // isLoading, which covers the auth and balance requests too.
  // Shared with the server guards, so the two cannot drift apart.
  const limit = assessmentLimitFor(
    isOrgStudent === true,
    isPremiumUser === true,
    licenseBalance?.isUnlimited ? null : licenseBalance?.available,
  );

  // A POOL BALANCE IS ALREADY REMAINING, NOT A TOTAL. Subtracting completions
  // from it would charge every past assessment twice -- once in the ledger that
  // produced the balance, once here. The free cap is a total and still needs
  // the arithmetic.
  const availableCount = limit === Infinity
    ? Infinity
    : isPooled === true
      ? limit
      : Math.max(0, limit - completed.length);

  /**
   * Has this grade already been charged for? Drives the warning before a
   * repeat -- a warning, not a refusal: repeating a year happens, and it costs
   * another licence rather than being forbidden.
   */
  const sameGradeAlreadyCharged = licenseBalance?.sameGradeAlreadyCharged ?? false;

  // An unpaid account with a child profile used to be "payment required
  // before any assessment" here (2026-09-16). Reversed 2026-11-13: it is a
  // free account, bounded by the cap like any other.
  return {
    isOrgStudent,
    // True only for a free account that has spent its cap. Distinguishes the
    // free ceiling from the school allocation lock, which the assessment page
    // renders as a different screen with different copy and a different remedy.
    isFreeCapReached:
      isOrgStudent === false &&
      isPremiumUser === false &&
      isFreeTierCapReached(false, false, completed.length),
    // Covers ALL THREE requests. Each query is disabled until membership is
    // known, and a disabled query does not report as loading, so without
    // authLoading this would claim the answer was ready before there was one.
    // The balance query joined this list when the pool replaced the hardcoded
    // allocation: a pooled caller's availableCount is meaningless until it
    // lands, and reporting ready early would briefly render "0 left".
    isLoading: authLoading || assessmentsLoading || licenseLoading,
    availableCount,
    hasAvailable: availableCount > 0,
    hasInProgress,
    completedReportId,
    // For the "this will use another licence" warning before a repeat.
    sameGradeAlreadyCharged,
    // A school student with a report for this grade whose school has not
    // allowed a repeat. The server refuses the create; this is so the page can
    // say so first.
    repeatBlocked: licenseBalance?.repeatBlocked === true,
    // A buyer's OWN pool (a parent's, or an individual's) with nothing left.
    // Read from the server's answer and nothing else: `onPool` must be true,
    // so an account the server keeps off every pool is never locked out by a
    // balance it does not have.
    personalPoolEmpty:
      isOrgStudent === false &&
      licenseBalance?.onPool === true &&
      licenseBalance.isUnlimited !== true &&
      licenseBalance.available === 0,
  };
}
