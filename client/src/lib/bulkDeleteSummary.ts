/**
 * What a superadmin is told after a bulk school delete.
 *
 * The toast used to say only "N schools deleted, M failed". The server already
 * returned each school's reason — since 3fc4656 including
 * ORGANIZATION_HAS_STUDENTS and the student count — and none of it reached the
 * operator, who was told a school had failed but not that it still had students
 * to remove first.
 *
 * Every failure is also a true one now: the delete runs in one transaction per
 * school, so a school reported as failed was left exactly as it was. That is
 * what the unexpected-error line can honestly say.
 *
 * Pure, so it runs under the node-only vitest config.
 */

export type BulkDeleteResult = {
  orgId: string;
  name: string | null;
  success: boolean;
  code?: string;
  studentCount?: number;
  error?: string;
};

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Beyond this many, the rest are counted rather than listed — a toast is not a report. */
export const MAX_LISTED_FAILURES = 3;

/** Every key this reads, so the test can check both locales carry them. */
export const BULK_DELETE_SUMMARY_KEYS = [
  "bulkDeleteResult",
  "bulkDeleteHasStudents",
  "bulkDeleteNotFound",
  "bulkDeleteFailedUnexpected",
  "bulkDeleteMoreFailures",
] as const;

export function summarizeBulkDelete(
  results: BulkDeleteResult[],
  t: Translate,
): { lines: string[]; hasFailures: boolean } {
  const failures = results.filter((r) => !r.success);
  const lines = [
    t("superadmin.bulkDeleteResult", { success: results.length - failures.length, fail: failures.length }),
  ];
  for (const failure of failures.slice(0, MAX_LISTED_FAILURES)) {
    lines.push(reasonFor(failure, t));
  }
  if (failures.length > MAX_LISTED_FAILURES) {
    lines.push(t("superadmin.bulkDeleteMoreFailures", { count: failures.length - MAX_LISTED_FAILURES }));
  }
  return { lines, hasFailures: failures.length > 0 };
}

function reasonFor(result: BulkDeleteResult, t: Translate): string {
  switch (result.code) {
    case "ORGANIZATION_HAS_STUDENTS":
      return t("superadmin.bulkDeleteHasStudents", { school: result.name, count: result.studentCount });
    case "ORGANIZATION_NOT_FOUND":
      return t("superadmin.bulkDeleteNotFound");
    default:
      // Deliberately NOT result.error. For an unexpected failure that is a raw
      // database or runtime message, in English, untranslatable, and not something
      // to put in front of an operator. The server logs it. What is known, and
      // true, is that nothing was changed.
      return t("superadmin.bulkDeleteFailedUnexpected");
  }
}
