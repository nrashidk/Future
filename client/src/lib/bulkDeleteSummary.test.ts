/**
 * The bulk school-delete toast must say why each school was not deleted.
 *
 * THE DEFECT THIS PINS. The toast rendered "N schools deleted, M failed" and
 * dropped every per-school reason the server returned, including
 * ORGANIZATION_HAS_STUDENTS and the count — the one failure an operator can act
 * on. The last describe block checks that both locales actually carry the keys,
 * so the Arabic is present to be reviewed rather than assumed; its wording is
 * listed in docs/arabic-review-pack.md.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  summarizeBulkDelete,
  MAX_LISTED_FAILURES,
  BULK_DELETE_SUMMARY_KEYS,
  type BulkDeleteResult,
} from "./bulkDeleteSummary";

/** Echoes the key and its values, so assertions read what would be translated. */
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key} ${JSON.stringify(options)}` : key;

const ok = (orgId: string): BulkDeleteResult => ({ orgId, name: `School ${orgId}`, success: true });
const hasStudents = (orgId: string, count: number): BulkDeleteResult => ({
  orgId, name: `School ${orgId}`, success: false, code: "ORGANIZATION_HAS_STUDENTS", studentCount: count,
  error: "School still has students.",
});

describe("summarizeBulkDelete", () => {
  it("is the count alone when everything was deleted", () => {
    expect(summarizeBulkDelete([ok("a"), ok("b")], t)).toEqual({
      lines: ['superadmin.bulkDeleteResult {"success":2,"fail":0}'],
      hasFailures: false,
    });
  });

  // The failure an operator can act on, and the reason this exists.
  it("names a school that still has students, with the count", () => {
    const { lines, hasFailures } = summarizeBulkDelete([ok("a"), hasStudents("s", 6)], t);
    expect(hasFailures).toBe(true);
    expect(lines).toEqual([
      'superadmin.bulkDeleteResult {"success":1,"fail":1}',
      'superadmin.bulkDeleteHasStudents {"school":"School s","count":6}',
    ]);
  });

  it("says a missing school no longer exists", () => {
    const { lines } = summarizeBulkDelete(
      [{ orgId: "x", name: null, success: false, code: "ORGANIZATION_NOT_FOUND", error: "Organization not found" }],
      t,
    );
    expect(lines[1]).toBe("superadmin.bulkDeleteNotFound");
  });

  it("never shows a raw server error to the operator", () => {
    const { lines } = summarizeBulkDelete(
      [{ orgId: "x", name: null, success: false, error: 'update or delete on table "organizations" violates foreign key' }],
      t,
    );
    expect(lines[1]).toBe("superadmin.bulkDeleteFailedUnexpected");
    expect(lines.join(" ")).not.toMatch(/foreign key/);
  });

  it("lists at most a few reasons and counts the rest", () => {
    const failures = Array.from({ length: MAX_LISTED_FAILURES + 2 }, (_, i) => hasStudents(`s${i}`, 1));
    const { lines } = summarizeBulkDelete(failures, t);
    expect(lines).toHaveLength(1 + MAX_LISTED_FAILURES + 1);
    expect(lines.at(-1)).toBe('superadmin.bulkDeleteMoreFailures {"count":2}');
  });
});

describe("the locales", () => {
  for (const locale of ["en", "ar"]) {
    it(`${locale}/admin.json carries every key the summary reads`, () => {
      const path = fileURLToPath(new URL(`../../public/locales/${locale}/admin.json`, import.meta.url));
      const superadmin = JSON.parse(readFileSync(path, "utf8")).superadmin;
      for (const key of BULK_DELETE_SUMMARY_KEYS) {
        expect(typeof superadmin[key], `${locale} superadmin.${key}`).toBe("string");
        expect(superadmin[key].length, `${locale} superadmin.${key}`).toBeGreaterThan(0);
      }
    });
  }
});
