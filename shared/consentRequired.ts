/**
 * THE CONSENT-BLOCK CODE, DEFINED ONCE FOR BOTH ENDS.
 *
 * The three paths that enrol a school student answer 409 with this code when
 * the school has not recorded its consent (server/utils/consentGate.ts). The
 * client recognises the code and renders its own translated sentence, rather
 * than displaying the server's `message` — which is an English string literal
 * in server code and cannot be localized.
 *
 * IT LIVES IN shared/ BECAUSE THE FAILURE IS SILENT. A client-side literal that
 * drifted from the server's string would not throw and would not show up in a
 * test: it would simply stop matching, and the admin would be shown the English
 * fallback again. That is the exact defect this pair exists to remove, and the
 * one least likely to be caught in review, so the two ends share a definition
 * instead of agreeing by convention.
 */
export const CONSENT_REQUIRED_CODE = "CONSENT_REQUIRED";
