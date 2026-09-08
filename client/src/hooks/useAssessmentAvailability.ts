import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Assessment } from "@shared/schema";

// Org students get one assessment per allocated seat. Today that's a single
// lifetime allocation, so availability = max(0, ALLOCATIONS_PER_STUDENT - completed).
// PD2: when per-period re-assessment ships, this becomes
// allocations-for-active-period minus completions-in-that-period.
const ALLOCATIONS_PER_STUDENT = 1;

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

  // Only org students are allocation-limited; skip the fetch for everyone else.
  // `=== true`, not truthiness: firing this while membership is unknown would
  // ask for the allocation of a caller we have not identified.
  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<Assessment[]>({
    queryKey: ["/api/assessments/my"],
    enabled: isOrgStudent === true,
  });

  const completed = assessments.filter((a) => a.isCompleted);
  const hasInProgress = assessments.some((a) => !a.isCompleted && a.currentStep > 1);

  // Array comes back ordered by createdAt desc, so the first completed is the latest.
  const completedReportId = completed[0]?.id ?? null;

  // Infinity is the "not allocation-limited" answer, so it needs a positive
  // `=== false` — handing it out for a caller we have not identified yet would
  // be the same fail-open 15203ec removed from the field lock, offering an entry
  // point the server's license guard is going to 403. Unknown falls to the
  // limited branch instead.
  //
  // That branch is computed from an empty list while the query is disabled, so
  // the number is not meaningful until isLoading clears. Consumers must gate on
  // isLoading, which is why it now covers the auth request too — a caller who
  // read availableCount during the unknown window would otherwise be told
  // "1 available" on the strength of no data at all.
  const availableCount = isOrgStudent === false
    ? Infinity
    : Math.max(0, ALLOCATIONS_PER_STUDENT - completed.length);

  return {
    isOrgStudent,
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
