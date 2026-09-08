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
    enabled: isCapCounted === true,
  });

  const completed = assessments.filter((a) => a.isCompleted);
  const hasInProgress = assessments.some((a) => !a.isCompleted && a.currentStep > 1);

  // Array comes back ordered by createdAt desc, so the first completed is the latest.
  const completedReportId = completed[0]?.id ?? null;

  // WHICH LIMIT APPLIES. Three populations, and only one of them is unbounded
  // here:
  //   school student  -> SCHOOL_ALLOCATIONS_PER_STUDENT (the school bought it)
  //   free account    -> FREE_ASSESSMENT_CAP            (anti-abuse ceiling)
  //   premium self-payer -> Infinity from this hook; their real bound is
  //                         users.purchasedLicenses, which this hook does not
  //                         model and must not pretend to.
  //
  // Infinity used to be returned for every `isOrgStudent === false` caller. That
  // was the honest answer while free accounts could not reach /assessment at
  // all, and it became a lie the moment they could: this hook's own docblock
  // calls it the mirror of the server guard, and the server now 403s a free
  // account's fourth create. A hook that says "unlimited" while the server
  // refuses is the fail-open 15203ec removed from the field lock — it offers an
  // entry point that is going to be rejected.
  //
  // Unknown still falls to a LIMITED branch rather than Infinity, for the same
  // reason as before. That branch is computed from an empty list while the query
  // is disabled, so the number is not meaningful until isLoading clears;
  // consumers must gate on isLoading, which covers the auth request too.
  // Shared with both server guards, so the three cannot drift apart.
  const limit = assessmentLimitFor(isOrgStudent === true, isPremiumUser === true);

  const availableCount = limit === Infinity
    ? Infinity
    : Math.max(0, limit - completed.length);

  return {
    isOrgStudent,
    // True only for a free account that has spent its cap. Distinguishes the
    // free ceiling from the school allocation lock, which the assessment page
    // renders as a different screen with different copy and a different remedy.
    isFreeCapReached:
      isOrgStudent === false &&
      isPremiumUser === false &&
      isFreeTierCapReached(false, false, completed.length),
    // Covers BOTH requests. The assessments query is disabled until membership
    // is known, and a disabled query does not report as loading, so without
    // authLoading this would claim the answer was ready before there was one.
    isLoading: authLoading || assessmentsLoading,
    availableCount,
    hasAvailable: availableCount > 0,
    hasInProgress,
    completedReportId,
  };
}
