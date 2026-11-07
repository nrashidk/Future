/**
 * THE SCHOOL-SETUP BLOCK CODE, DEFINED ONCE FOR BOTH ENDS.
 *
 * Paired with shared/consentRequired.ts and for the same reason: the client
 * branches on this code to render a translated sentence rather than showing the
 * server's English `message`, and a literal that drifted between the two ends
 * would not throw, would not fail a test, and would simply stop matching —
 * leaving the admin looking at the English fallback.
 */
export const SCHOOL_SETUP_REQUIRED_CODE = "SCHOOL_SETUP_REQUIRED";
