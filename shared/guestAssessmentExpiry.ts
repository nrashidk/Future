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

/**
 * How long the guest_token cookie itself lives
 * (server/routes/assessment.routes.ts, the res.cookie("guest_token", ...)
 * call). This is the real ceiling on a guest's ability to ever resume an
 * unfinished draft: with no login, that cookie is the only thing that lets
 * a later request be matched back to its assessment row (guestSessionId
 * equality checks throughout assessment.routes.ts). It is set once at
 * creation and never refreshed, so once it expires the student has no path
 * back to the draft at all — not "harder to resume," genuinely impossible.
 */
export const GUEST_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Slack added on top of GUEST_COOKIE_MAX_AGE_MS before an unfinished draft
 * becomes eligible for deletion. This is not "how long to be lenient" —
 * the cookie already ends resumability at GUEST_COOKIE_MAX_AGE_MS regardless
 * of what this sweep does — it only covers the sweep's own throttle
 * (SWEEP_THROTTLE_MS, 30 minutes, server/services/guestAssessmentExpiry.ts)
 * and clock skew between when the cookie was minted and when the sweep next
 * runs, so a draft is never deleted before the cookie guarding it has
 * actually lapsed.
 */
export const GUEST_DRAFT_SWEEP_BUFFER_MS = 60 * 60 * 1000;

/**
 * When an unfinished (never-completed) guest draft becomes eligible for
 * deletion. DERIVED from GUEST_COOKIE_MAX_AGE_MS, not a separately chosen
 * number: that cookie is the actual ceiling on a guest's ability to reach
 * their own draft, so a shorter window would delete drafts a student could
 * still return to, and a longer one only keeps a minor's PII around past
 * the point anyone can retrieve it. If the cookie's lifetime ever changes,
 * this changes with it, so the sweep can't be silently stranded relative to
 * a cookie duration chosen independently. See FOLLOWUP.md, "Option C only
 * closes the exposure for finished reports".
 */
export const GUEST_DRAFT_SWEEP_MS = GUEST_COOKIE_MAX_AGE_MS + GUEST_DRAFT_SWEEP_BUFFER_MS;
