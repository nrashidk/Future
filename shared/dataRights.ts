/**
 * What the data-rights endpoints say in codes, for the client to translate.
 *
 * ONE DEFINITION FOR BOTH ENDS. The server sends these — DELETE /api/users/me's
 * 409, GET /api/users/me/data-summary's `erasure` — and the Profile screen turns
 * each into a sentence in the reader's language. A code kept in two lists is
 * the drift this codebase keeps producing, so both ends import it from here, and
 * dataRights.locales.test.ts fails for a code without a label in either locale.
 */

/** Records naming this person as having acted on other people's data. Each one blocks erasure. */
export const ERASURE_BLOCK_CODES = [
  "school_administrator",
  "school_activity_performed",
  "school_activity_affected",
  "files_uploaded",
  "contributions_submitted",
  "contributions_reviewed",
  "contribution_rewards_awarded",
  "scoring_config_changes",
  "system_announcements",
  "system_settings",
] as const;
export type ErasureBlockCode = (typeof ERASURE_BLOCK_CODES)[number];

/** Records naming this person that survive their erasure. */
export const ERASURE_KEPT_CODES = [
  "school_removal_record",
  "consent_attestation",
  "school_deletion_record",
] as const;
export type ErasureKeptCode = (typeof ERASURE_KEPT_CODES)[number];

/** What erasure asks for: the password, or the typed email for an account without one. */
export type ErasureConfirmationMethod = "password" | "email";

/** GET /api/users/me/data-summary -> `erasure`, built by summarizeErasure (server/services/subjectAccess.ts). */
export interface ErasureStatus {
  blocked: boolean;
  blockingRecords: ErasureBlockCode[];
  administeredSchools: string[];
  confirmWith: ErasureConfirmationMethod | null;
  keptAfterErasure: Array<{ code: ErasureKeptCode; organizationName: string | null }>;
}
