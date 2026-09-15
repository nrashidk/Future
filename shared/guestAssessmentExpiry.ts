/**
 * How long a completed, unclaimed guest assessment survives before
 * server/services/guestAssessmentExpiry.ts deletes it.
 *
 * Shared rather than server-only so the client can show the same deadline
 * the server will actually hold to — Results.tsx computes the same date
 * from the same constant instead of the server owning a number the UI
 * merely guesses at.
 *
 * 72 hours, not 24: the population is a 13-18 year old who may want to show
 * a parent or counsellor before registering, which is the whole reason this
 * exists — a 24-hour window can be entirely eaten by one weekend.
 */
export const GUEST_ASSESSMENT_TTL_HOURS = 72;

/**
 * When a guest assessment expires, anchored on WHEN IT WAS COMPLETED, not
 * when it was created. A guest can resume an in-progress draft across
 * multiple visits, and anchoring on creation would risk deleting work still
 * being actively done — worse than the "report silently gone" failure this
 * window exists to bound. Only a finished report (completedAt set) has a
 * deadline under this function; an unfinished draft has none (see
 * FOLLOWUP.md, "Option C only closes the exposure for finished reports").
 */
export function guestAssessmentExpiresAt(completedAt: string | Date): Date {
  const completed = typeof completedAt === "string" ? new Date(completedAt) : completedAt;
  return new Date(completed.getTime() + GUEST_ASSESSMENT_TTL_HOURS * 60 * 60 * 1000);
}
