/**
 * Deleting expired, unclaimed guest assessments — Option C of the guest
 * no-persistence project (docs/guest-no-persistence-recon.md,
 * docs/guest-ttl-option-c-recon.md). A guest assessment that finished
 * (completedAt set) and was never claimed by an account is deleted
 * GUEST_ASSESSMENT_TTL_HOURS after it finished; one that never finished is
 * deleted GUEST_DRAFT_SWEEP_MS after its last edit — either way, an
 * unaccompanied minor's name, age, grade, gender and career-personality
 * profile do not sit in the database indefinitely just because they never
 * registered, whether or not they ever finished the assessment.
 *
 * SAME SHAPE AS eraseUserData (accountErasure.ts) and
 * deleteOrganizationWithDependents (organizationDeletion.ts): explicit,
 * ordered deletes inside one transaction, not a schema cascade. Both of
 * those already solve this exact problem — a row with a multi-table
 * dependent graph, most of it NO ACTION — the same way; adding
 * ON DELETE CASCADE here instead would make this the only place in the
 * codebase solving it differently, which is the "same bug class,
 * reintroduced one file over" shape docs/erasure-dependent-list.md warns
 * against.
 *
 * THE DEPENDENT LIST, verified against shared/schema.ts directly (not
 * assumed from the erasure list, because that one is keyed by userId and
 * this one is keyed by assessmentId — see below):
 *   quiz_responses.assessment_quiz_id  NOT NULL, NO ACTION
 *   assessment_quizzes.assessment_id   NOT NULL, NO ACTION
 *   recommendations.assessment_id      NOT NULL, NO ACTION
 *   wef_competency_results.assessment_id  NOT NULL, UNIQUE, NO ACTION —
 *     user_id is nullable "for guest assessments" (schema.ts comment), so a
 *     guest CAN have one of these; must be deleted before assessments.
 *   llm_narrative_cache.assessment_id  NOT NULL, CASCADE — nothing to write.
 * cvq_results is NOT in this list: cvq_results.user_id is NOT NULL
 * REFERENCES users.id, so a guest (no users row) cannot own one — the table
 * is structurally unreachable here, unlike in eraseUserData where the owner
 * already has a users row.
 *
 * TWO INDEPENDENT CONDITIONS ARE SELECTED, OR'd together, because they
 * anchor on different columns for different reasons:
 *   - completedAt IS NOT NULL AND completedAt < completedCutoff — a
 *     finished report, unclaimed GUEST_ASSESSMENT_TTL_HOURS after finishing.
 *   - completedAt IS NULL AND updatedAt < draftCutoff — an unfinished
 *     draft, abandoned. Anchored on updatedAt (bumped by every PATCH to the
 *     draft, storage.ts updateAssessment) rather than createdAt, so a draft
 *     still being actively edited is never swept out from under the person
 *     editing it. draftCutoff (GUEST_DRAFT_SWEEP_MS, shared/
 *     guestAssessmentExpiry.ts) is derived from the guest_token cookie's own
 *     lifetime, not chosen independently — see that constant's comment for
 *     why. See FOLLOWUP.md, "Option C only closes the exposure for finished
 *     reports" for the incident this closes.
 * Both conditions feed the SAME cascade below: it deletes by assessmentId,
 * not by why the id was selected, so a mid-flight quiz's assessment_quizzes/
 * quiz_responses rows are removed the same way regardless of which
 * condition matched the parent assessment.
 */

import {
  assessments, assessmentQuizzes, quizResponses, recommendations, wefCompetencyResults,
} from "@shared/schema";
import { and, eq, inArray, isNull, isNotNull, lt, or } from "drizzle-orm";
import { storage } from "../storage";
import { GUEST_ASSESSMENT_TTL_HOURS, GUEST_DRAFT_SWEEP_MS } from "@shared/guestAssessmentExpiry";

/**
 * Finds every expired, unclaimed guest assessment — completed and past
 * `completedCutoff`, OR still a draft and past `draftCutoff` — and deletes
 * it and everything hanging off it, in FK-safe order. Runs entirely against
 * `tx` so the caller controls the transaction boundary — mirrors
 * eraseUserData's signature for the same reason.
 */
export async function deleteExpiredGuestAssessments(
  tx: any,
  completedCutoff: Date,
  draftCutoff: Date,
): Promise<{ deletedCount: number; assessmentIds: string[] }> {
  const expired = await tx
    .select({ id: assessments.id })
    .from(assessments)
    .where(
      and(
        isNull(assessments.userId),
        eq(assessments.isGuest, true),
        or(
          and(isNotNull(assessments.completedAt), lt(assessments.completedAt, completedCutoff)),
          and(isNull(assessments.completedAt), lt(assessments.updatedAt, draftCutoff)),
        ),
      ),
    );
  const assessmentIds: string[] = expired.map((a: { id: string }) => a.id);
  if (assessmentIds.length === 0) {
    return { deletedCount: 0, assessmentIds: [] };
  }

  const quizzes = await tx
    .select({ id: assessmentQuizzes.id })
    .from(assessmentQuizzes)
    .where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
  const quizIds: string[] = quizzes.map((q: { id: string }) => q.id);

  if (quizIds.length > 0) {
    await tx.delete(quizResponses).where(inArray(quizResponses.assessmentQuizId, quizIds));
  }
  await tx.delete(assessmentQuizzes).where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
  await tx.delete(recommendations).where(inArray(recommendations.assessmentId, assessmentIds));
  await tx.delete(wefCompetencyResults).where(inArray(wefCompetencyResults.assessmentId, assessmentIds));
  await tx.delete(assessments).where(inArray(assessments.id, assessmentIds));

  return { deletedCount: assessmentIds.length, assessmentIds };
}

/**
 * Whether enough time has passed since the last attempt (success OR
 * failure) to try again. Pure, so the throttle logic is testable without a
 * database — the only part of this file that is.
 */
export function shouldRunSweep(lastRunAt: string | null, now: Date, throttleMs: number): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= throttleMs;
}

/**
 * Throttle interval between sweep ATTEMPTS, not between successful runs — a
 * failing sweep still waits this long before retrying, so a persistent
 * failure logs at a bounded rate instead of once per request. 30 minutes:
 * frequent enough that the 72h window is a real promise, infrequent enough
 * that no guest-facing request pays for this on every call.
 */
const SWEEP_THROTTLE_MS = 30 * 60 * 1000;

/** Single system_config row holding this process-independent, cross-instance status — see readSweepStatus. */
const SWEEP_STATUS_CONFIG_KEY = "guest_assessment_sweep_status";

export interface GuestSweepStatus {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastDeletedCount: number | null;
  lastError: string | null;
}

const EMPTY_STATUS: GuestSweepStatus = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastDeletedCount: null,
  lastError: null,
};

/**
 * Stored in system_config, not in-process memory. Unlike seedStatus.ts
 * (deliberately in-memory, because it describes THIS process's boot and the
 * database may be the thing that failed), a sweep failure is a database
 * operation failing against a database that is, by definition, reachable
 * enough to have answered the throttle check — so recording the outcome in
 * that same database is strictly more useful here: it is durable across
 * restarts and visible from every instance, not just whichever one last ran
 * a sweep. Exported so /health can report it — see registerPublicRoutes.
 */
export async function readSweepStatus(): Promise<GuestSweepStatus> {
  const row = await storage.getSystemConfig(SWEEP_STATUS_CONFIG_KEY);
  if (!row) return EMPTY_STATUS;
  try {
    return { ...EMPTY_STATUS, ...JSON.parse(row.value) };
  } catch {
    return EMPTY_STATUS;
  }
}

async function writeSweepStatus(status: GuestSweepStatus): Promise<void> {
  await storage.upsertSystemConfig(SWEEP_STATUS_CONFIG_KEY, JSON.stringify(status));
}

/**
 * The request-triggered sweep itself (Option B of
 * docs/guest-ttl-option-c-recon.md §3): called from a guest-facing route
 * without being awaited, so it never adds latency to that request. Every
 * branch of this function is inside its own try/catch — it must never
 * reject, because nothing at any call site awaits or catches it.
 *
 * OBSERVABILITY, not just a log line nobody reads: outcome and count are
 * logged at info, failures at error (both console-based, matching this
 * codebase's convention elsewhere), AND every attempt — success or failure —
 * is recorded to system_config so `/health` can report staleness. "Has the
 * sweep stopped running" is answered by that endpoint, not by grepping logs.
 */
export async function sweepExpiredGuestAssessmentsIfDue(): Promise<void> {
  let status: GuestSweepStatus = EMPTY_STATUS;
  try {
    status = await readSweepStatus();
    if (!shouldRunSweep(status.lastRunAt, new Date(), SWEEP_THROTTLE_MS)) return;

    const startedAt = new Date();
    const completedCutoff = new Date(startedAt.getTime() - GUEST_ASSESSMENT_TTL_HOURS * 60 * 60 * 1000);
    const draftCutoff = new Date(startedAt.getTime() - GUEST_DRAFT_SWEEP_MS);

    // Dynamic import, not a module-level one: db.ts throws at IMPORT TIME
    // when DATABASE_URL is unset (server/db.ts:9), so a static `import { db }
    // from "../db"` here would pull a real DB connection attempt into every
    // test that transitively imports this file — including every test that
    // imports assessment.routes.ts, which calls this function. Same reason
    // /health dynamically imports readSweepStatus below and seedStatus.ts
    // above it.
    const { db } = await import("../db");
    const { deletedCount } = await db.transaction((tx: any) =>
      deleteExpiredGuestAssessments(tx, completedCutoff, draftCutoff),
    );

    console.log(
      `[guestAssessmentSweep] ran: deleted ${deletedCount} expired guest assessment(s) ` +
        `(completed cutoff ${completedCutoff.toISOString()}, draft cutoff ${draftCutoff.toISOString()})`,
    );
    await writeSweepStatus({
      lastRunAt: startedAt.toISOString(),
      lastSuccessAt: startedAt.toISOString(),
      lastDeletedCount: deletedCount,
      lastError: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[guestAssessmentSweep] sweep failed:", error);
    // Best-effort: if the status write also fails (the database itself may
    // be down), the console.error above is the only signal for this
    // attempt, and the next request will retry once the throttle elapses.
    await writeSweepStatus({
      ...status,
      lastRunAt: new Date().toISOString(),
      lastError: message,
    }).catch(() => {});
  }
}
