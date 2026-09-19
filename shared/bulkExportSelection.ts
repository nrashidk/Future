/**
 * THE SELECTION-EMPTY-404 CODE, DEFINED ONCE FOR BOTH ENDS.
 *
 * POST /api/admin/organizations/:id/export/reports answers 404 with this code
 * when the admin selected specific students but none of them has a completed
 * assessment. The client recognises the code and renders its own translated
 * sentence naming the selection ("None of the 3 selected students..."),
 * rather than displaying the server's `message` — an English string literal
 * in server code that cannot be localized and, read on its own, is easy to
 * mistake for "this organization has no completed assessments at all" (the
 * org-wide 404, which keeps its own untranslated message unchanged).
 *
 * Lives in shared/ for the same reason as CONSENT_REQUIRED_CODE (see
 * shared/consentRequired.ts): a client-side literal that drifted from the
 * server's string would fail silently, falling back to a generic message
 * with no test catching it.
 */
export const NO_COMPLETED_ASSESSMENTS_IN_SELECTION_CODE = "NO_COMPLETED_ASSESSMENTS_IN_SELECTION";
