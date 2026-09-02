/**
 * Drift guard: the relatedSubjects backfill vs the careers seed array.
 *
 * The same field is written from two places on purpose — the seed array covers a
 * from-scratch database, the backfill covers the rows that already exist (the
 * careers seed loop at seed.ts:807-808 is INSERT-only and skips existing titles).
 * Two writers of one field is exactly what rots, so this fails the suite the
 * moment they disagree.
 *
 * It also pins the property the whole fix rests on: every corrected tag must be a
 * member of the umbrella-6, because normalizeCareerSubjects() drops anything else
 * and a career whose tags all drop is back at the flat-20 floor.
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, vi } from "vitest";
import { DEFAULT_CANONICAL_SUBJECTS, normalizeCareerSubjects } from "../utils/subjectMap";

// The module imports ../db for its backfill function, and server/db.ts opens a
// Neon pool (and throws without DATABASE_URL) at import time. Only the DATA is
// under test here, so stub the db module out.
vi.mock("../db", () => ({ db: {}, pool: {} }));

const { CAREER_RELATED_SUBJECTS } = await import("./career-related-subjects");

/** Pull `title` -> `relatedSubjects` straight out of the seed array's source text. */
function seededRelatedSubjects(): Map<string, string[]> {
  const src = readFileSync(path.resolve(import.meta.dirname, "../seed.ts"), "utf-8");
  const re = /title:\s*"([^"]+)",[\s\S]{0,1200}?relatedSubjects:\s*\[([^\]]*)\]/g;
  const out = new Map<string, string[]>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (out.has(m[1])) continue;
    out.set(
      m[1],
      m[2].split(",").map(t => t.trim().replace(/^"|"$/g, "")).filter(Boolean),
    );
  }
  return out;
}

describe("CAREER_RELATED_SUBJECTS vs the seed.ts careers array", () => {
  const seeded = seededRelatedSubjects();

  it("parses the seed array (sanity check on the regex above)", () => {
    expect(seeded.size).toBe(68); // 37 + Phase 3 step 1 (2 Space) + Phase 3 Stage 1 (29 derived)
  });

  it.each(CAREER_RELATED_SUBJECTS.map(c => [c.title, c] as const))(
    "%s: the backfill and the seed array agree",
    (title, item) => {
      expect(seeded.get(title)).toEqual(item.relatedSubjects);
    },
  );
});

describe("CAREER_RELATED_SUBJECTS is actually corrective", () => {
  it.each(CAREER_RELATED_SUBJECTS.map(c => [c.title, c] as const))(
    "%s: every tag survives normalization, so the career can never sit at the floor",
    (_title, item) => {
      const canonical = new Set<string>(DEFAULT_CANONICAL_SUBJECTS);
      for (const tag of item.relatedSubjects) expect(canonical.has(tag)).toBe(true);
      expect(normalizeCareerSubjects(item.relatedSubjects)).toEqual(item.relatedSubjects);
    },
  );

  it("covers Teacher, the one career whose seeded tags projected to nothing", () => {
    expect(CAREER_RELATED_SUBJECTS.map(c => c.title)).toContain("Teacher (Secondary Education)");
  });
});
