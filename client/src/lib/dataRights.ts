/**
 * The client half of the data-rights surface: the data-summary response and the
 * export download. Profile's "Your data" section and the deletion page both read
 * them from here, so they read one response the same way.
 */

import type { ErasureStatus } from "@shared/dataRights";

export const DATA_SUMMARY_QUERY_KEY = ["/api/users/me/data-summary"];

/**
 * GET /api/users/me/data-summary. The counts are of the records in the export
 * file (summarizeSubjectAccess), and `erasure` says whether deleting would run.
 */
export interface DataSummary {
  accountCreated: string | null;
  dataCategories: {
    profileData: true;
    assessments: number;
    careerRecommendations: number;
    quizzes: number;
    quizResponses: number;
    careerNarratives: number;
    cvqResults: number;
    wefCompetencyResults: number;
    schoolEnrolment: number;
    schoolConsentCoveringYou: number;
    schoolRemovalRecords: number;
    passwordResetRequests: number;
    consentAttestationsYouMade: number;
    organizationDeletionsYouPerformed: number;
  };
  totalRecords: number;
  erasure: ErasureStatus;
}

/**
 * "started", not "downloaded": the page can see that the browser was handed the
 * file, not that the file was saved. The string it maps to says so.
 */
export type ExportOutcome = "started" | "rateLimited" | "failed";

/** Fetch the subject-access export and hand it to the browser as a file. */
export async function downloadDataExport(): Promise<ExportOutcome> {
  let res: Response;
  try {
    res = await fetch("/api/users/me/export", { credentials: "include" });
  } catch {
    return "failed";
  }
  if (res.status === 429) return "rateLimited";
  if (!res.ok) return "failed";

  const blob = await res.blob();
  const filename =
    /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
    "future-pathways-data.json";
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "started";
}

/**
 * Wrap an interpolated value in Unicode bidi isolates (FSI ... PDI), the text
 * equivalent of <bdi>. A school name in Latin script inside an Arabic sentence
 * otherwise pulls the neighbouring punctuation into its own direction run.
 * This is a claim about rendering, so it is checked rendered — see
 * docs/arabic-review-pack.md §6.
 */
export const isolate = (value: string) => `\u2068${value}\u2069`;

/**
 * The account's email as a hint for the deletion page's typed-email check:
 * the domain in full, the first character of the local part, then a fixed
 * "\u2022\u2022\u2022" whatever the real length. A local part of one or two characters shows
 * no letter, because one letter would be half of it.
 *
 * HYGIENE, NOT A CONTROL. The full address is on /api/auth/user for every page
 * load and printed on Profile. This stops the page printing the answer beside
 * the question it asks. It does not stop anyone who looks. The domain stays
 * whole because it is what tells the owner which of their accounts this is.
 */
export function maskEmail(email: string): string {
  const address = email.trim();
  const at = address.lastIndexOf("@");
  if (at <= 0) return "\u2022\u2022\u2022";
  // Code points, so an address starting with an astral character is not split.
  const local = Array.from(address.slice(0, at));
  const head = local.length >= 3 ? local[0] : "";
  return `${head}\u2022\u2022\u2022@${address.slice(at + 1)}`;
}
