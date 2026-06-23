import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Assessment } from "@shared/schema";

// Org students get one assessment per allocated seat. Today that's a single
// lifetime allocation, so availability = max(0, ALLOCATIONS_PER_STUDENT - completed).
// PD2: when per-period re-assessment ships, this becomes
// allocations-for-active-period minus completions-in-that-period.
const ALLOCATIONS_PER_STUDENT = 1;

/**
 * Single source of truth for an org_student's remaining assessment allocation.
 * Mirrors the server-side license guard on POST /api/assessments. The server 403
 * is authoritative; this hook is for hiding dead entry points client-side.
 */
export function useAssessmentAvailability() {
  const { user } = useAuth();
  const isOrgStudent = user?.accountType === "org_student";

  // Only org_students are allocation-limited; skip the fetch for everyone else.
  const { data: assessments = [], isLoading } = useQuery<Assessment[]>({
    queryKey: ["/api/assessments/my"],
    enabled: isOrgStudent,
  });

  const completed = assessments.filter((a) => a.isCompleted);
  const hasInProgress = assessments.some((a) => !a.isCompleted && a.currentStep > 1);

  // Array comes back ordered by createdAt desc, so the first completed is the latest.
  const completedReportId = completed[0]?.id ?? null;

  // Non-org_students are not gated here → effectively unlimited.
  const availableCount = isOrgStudent
    ? Math.max(0, ALLOCATIONS_PER_STUDENT - completed.length)
    : Infinity;

  return {
    isOrgStudent,
    isLoading,
    availableCount,
    hasAvailable: availableCount > 0,
    hasInProgress,
    completedReportId,
  };
}
