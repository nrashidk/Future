/**
 * The duplicate-title decision, pinned before the constraint that triggers it.
 *
 * careers.title becomes UNIQUE in migration 020. A violation that fell through
 * to the route's generic catch would reach the superadmin as `500 Failed to
 * create career`: no mention of a title, no mention of which career it collided
 * with, and no way to converge — the same request retried fails identically
 * forever. These pin the 409 that replaces it.
 *
 * Storage is mocked so importing the route module does not pull in db.ts, which
 * throws at import when DATABASE_URL is unset — same pattern as
 * organization.consent.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {}, CurriculumRenameError: class {} }));

const { careerTitleConflict } = await import("./superadmin.routes");

const CATALOGUE = [
  { id: "career-1", title: "Data Scientist" },
  { id: "career-2", title: "Software Engineer" },
  { id: "career-3", title: "Doctor (General Practitioner)" },
];

describe("careerTitleConflict", () => {
  it("names the colliding title and points at the existing career", () => {
    const conflict = careerTitleConflict(CATALOGUE, "Software Engineer");

    expect(conflict).not.toBeNull();
    // The title has to appear in the message: the admin's next action is to
    // rename this one or go and edit that one, and they can do neither without
    // knowing which career they hit.
    expect(conflict!.message).toContain("Software Engineer");
    expect(conflict!.conflictingCareerId).toBe("career-2");
  });

  it("returns null when the title is free", () => {
    expect(careerTitleConflict(CATALOGUE, "Marine Biologist")).toBeNull();
  });

  it("does not report a career as conflicting with itself", () => {
    // The rename path. PATCHing a career without touching its title re-writes
    // the same value; finding itself is not a collision, and reporting one
    // would make every ordinary edit of an existing career fail.
    expect(careerTitleConflict(CATALOGUE, "Data Scientist", "career-1")).toBeNull();
  });

  it("still reports a rename ONTO another career's title", () => {
    // The case that is easy to miss, because the collision is with a career the
    // admin is not looking at.
    const conflict = careerTitleConflict(CATALOGUE, "Data Scientist", "career-2");

    expect(conflict).not.toBeNull();
    expect(conflict!.conflictingCareerId).toBe("career-1");
  });

  it("matches exactly, and says nothing about near-duplicates", () => {
    // NOT a gap in this function — it is the gap in the CONSTRAINT, mirrored
    // faithfully. UNIQUE is exact-match, so "Data scientist" and "Data
    // Scientist " are both accepted by Postgres and must be accepted here too;
    // reporting a conflict the database would not raise would block a write
    // that is going to succeed. The near-duplicate hole is recorded in FOLLOWUP,
    // and closing it means a normalized key, not a stricter comparison here.
    expect(careerTitleConflict(CATALOGUE, "Data scientist")).toBeNull();
    expect(careerTitleConflict(CATALOGUE, "Data Scientist ")).toBeNull();
    expect(careerTitleConflict(CATALOGUE, "DATA SCIENTIST")).toBeNull();
  });

  it("returns null for a missing or blank title rather than guessing", () => {
    // A 23505 raised by something other than the title — a constraint added
    // later — must fall through to the generic handler rather than be reported
    // as a title collision.
    expect(careerTitleConflict(CATALOGUE, undefined)).toBeNull();
    expect(careerTitleConflict(CATALOGUE, null)).toBeNull();
    expect(careerTitleConflict(CATALOGUE, "")).toBeNull();
    expect(careerTitleConflict(CATALOGUE, "   ")).toBeNull();
    expect(careerTitleConflict(CATALOGUE, 42)).toBeNull();
  });

  it("returns null on an empty catalogue", () => {
    expect(careerTitleConflict([], "Data Scientist")).toBeNull();
  });
});
