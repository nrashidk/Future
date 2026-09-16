import { apiRequest } from "@/lib/queryClient";

/**
 * THE ONLY THING THAT BINDS A GUEST'S COMPLETED ASSESSMENT TO AN ACCOUNT JUST
 * CREATED. Extracted from AuthCallback.tsx, where this logic previously lived
 * as the only call site — RegisterParent.tsx needed the identical behavior
 * and copying it would have been the second instance of exactly the bug class
 * this file's own git history already contains: AuthCallback.tsx's claim was
 * dead for a real stretch of this product's life because the guard it used
 * to gate the POST read a localStorage key nothing ever wrote. A second,
 * independently-maintained copy is a second place that mistake — or the next
 * one — can happen in and only get caught once.
 *
 * CALL THIS FROM EVERY PLACE A GUEST CAN BECOME AN ACCOUNT HOLDER, not just
 * the two that exist today. Results.tsx's "Create Free Account" button and
 * Assessment.tsx's mid-assessment guest banner both currently point at the
 * pre-parent-registers pipeline (plain /register, /api/login) and will be
 * repointed at /register/parent as part of retiring the free tier
 * (docs/free-tier-retirement-recon.md §2) — each would silently reintroduce
 * this exact bug on its own if it read localStorage and called
 * /api/assessments/migrate itself instead of calling this function.
 *
 * BEST-EFFORT, DELIBERATELY. The caller has just created (or logged the user
 * into) a real account; a failed claim must never block or fail that outcome.
 * Failures are swallowed and logged, matching AuthCallback.tsx's original
 * behavior — the ids are left in localStorage so a later attempt (a page
 * reload, a future login) can still succeed.
 */
export interface ClaimGuestAssessmentsResult {
  /**
   * True iff this browser held any guest assessment ids at all, regardless
   * of whether the claim succeeded — this is what a caller's redirect logic
   * should branch on (AuthCallback.tsx originally routed to /results
   * whenever there was something to claim, not only on confirmed success:
   * the guest cookie can still authorize viewing the report even when the
   * migrate call itself failed to reassign ownership).
   */
  hadCandidates: boolean;
  /** Number of guest assessments actually re-owned by this account, 0 on any failure or when there was nothing to claim. */
  migratedCount: number;
}

export async function claimGuestAssessments(): Promise<ClaimGuestAssessmentsResult> {
  // The session id is never read or sent from here. The server verifies the
  // claim against the guest_token cookie, which the browser sends on its own
  // and which no client-side code can read — it is httpOnly by design.
  let guestAssessmentIds: string[] = [];
  try {
    guestAssessmentIds = JSON.parse(localStorage.getItem("guestAssessments") || "[]");
  } catch {
    return { hadCandidates: false, migratedCount: 0 };
  }

  if (guestAssessmentIds.length === 0) {
    return { hadCandidates: false, migratedCount: 0 };
  }

  try {
    const res = await apiRequest("POST", "/api/assessments/migrate", { guestAssessmentIds });
    const result = await res.json();
    const migratedCount = typeof result?.migratedCount === "number" ? result.migratedCount : 0;

    // Only clear the local id list when the server confirms a claim. Clearing
    // it on any response would discard the ids after a failure, and they are
    // the only record this browser keeps of what the guest did — losing them
    // makes a retry impossible.
    if (migratedCount > 0) {
      localStorage.removeItem("guestAssessments");
    }
    return { hadCandidates: true, migratedCount };
  } catch (error) {
    // Deliberately silent to the caller's user. Whatever just happened for
    // them (account created, logged in) is not undone by this failing.
    console.error("Guest assessment claim failed:", error);
    return { hadCandidates: true, migratedCount: 0 };
  }
}
