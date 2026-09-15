/**
 * Regression guard for BUG #3 — school students silently received the FREE quiz
 * distribution server-side.
 *
 * The old derivation gated everything on `user.isPremium`:
 *   isPremium ? (isSchoolUser ? 'school' : 'premium') : 'free'
 * A school student's `users.isPremium` column is FALSE — createUserWithCredentials
 * (storage.ts) never sets it — and the `true` the client sees comes from a
 * response-only decoration in auth.routes.ts that is never persisted. So the
 * expression's outer condition failed and every school student fell through to
 * 'free', getting 4 questions per priority subject instead of 5, while the client
 * showed them the premium flow.
 *
 * The assertion that matters is the first one in "BUG #3": a school user with
 * isPremium === false must NOT resolve to the free tier. That is the exact state
 * every org_student row is in today.
 */

import { describe, it, expect, vi } from "vitest";

// Mock storage so importing quiz.routes.ts does not pull in db.ts (which throws
// at import when DATABASE_URL is unset). Same pattern as
// superadmin.reconciliation.test.ts. Both helpers under test are pure, so the
// mock only has to satisfy module-level imports, not any handler.
vi.mock("../storage", () => ({ storage: {} }));

const { resolveQuizTier, calculateQuizDistribution } = await import("./quiz.routes");

const total = (d: Map<string, number>) => [...d.values()].reduce((a, b) => a + b, 0);

describe("resolveQuizTier — BUG #3", () => {
  it("gives a school user the school tier even when isPremium is false (the regression)", () => {
    // The exact DB state of every org_student row today.
    expect(resolveQuizTier(true, false)).toBe("school");
  });

  it("still gives a school user the school tier when isPremium is true", () => {
    // org_admins are enrolled as members AND carry isPremium=true; unchanged.
    expect(resolveQuizTier(true, true)).toBe("school");
  });

  it("treats null/undefined isPremium as not-premium for a non-school user", () => {
    expect(resolveQuizTier(false, null)).toBe("free");
    expect(resolveQuizTier(false, undefined)).toBe("free");
  });

  it("still gives a self-paying individual the premium tier", () => {
    expect(resolveQuizTier(false, true)).toBe("premium");
  });

  it("still gives an anonymous/free taker the free tier", () => {
    expect(resolveQuizTier(false, false)).toBe("free");
  });
});

describe("quiz distribution — fixed 15 total, identical across tiers", () => {
  // The umbrella-6 minimum selection: 3 subjects, all 3 marked priority.
  const subjects = ["Mathematics", "Science", "English"];

  it("is a fixed 15 questions split by subject count, priority subjects first, the same for every tier", () => {
    // TIER_CONFIGS is gone; calculateQuizDistribution no longer takes a tier
    // argument at all — there is nothing left for a tier to change.
    const threeSubj = calculateQuizDistribution(subjects, subjects);
    for (const s of subjects) expect(threeSubj.get(s)).toBe(5);
    expect(total(threeSubj)).toBe(15);

    const fourSubj = ["Mathematics", "Science", "English", "Arabic"];
    const fourDist = calculateQuizDistribution(fourSubj, subjects);
    expect(fourDist.get("Mathematics")).toBe(4);
    expect(fourDist.get("Science")).toBe(4);
    expect(fourDist.get("English")).toBe(4);
    expect(fourDist.get("Arabic")).toBe(3); // the one non-priority subject
    expect(total(fourDist)).toBe(15);

    const fiveSubj = [...fourSubj, "Social Studies"];
    const fiveDist = calculateQuizDistribution(fiveSubj, subjects);
    for (const s of fiveSubj) expect(fiveDist.get(s)).toBe(3);
    expect(total(fiveDist)).toBe(15);
  });

  it("puts priority subjects first regardless of where they sit in favoriteSubjects", () => {
    // Arabic is the sole non-priority subject but listed FIRST — the 3-only-3
    // count still has to land on it, not on whichever subject happens to be
    // first in the array.
    const fourSubj = ["Arabic", "Mathematics", "Science", "English"];
    const priorities = ["Mathematics", "Science", "English"];
    const dist = calculateQuizDistribution(fourSubj, priorities);
    expect(dist.get("Arabic")).toBe(3);
    expect(dist.get("Mathematics")).toBe(4);
    expect(dist.get("Science")).toBe(4);
    expect(dist.get("English")).toBe(4);
  });

  it("no longer distinguishes tiers — there is no third argument to pass one", () => {
    // Guards the claim that free/premium/school are now identical. Before this
    // fix, school vs premium being identical was the thing worth pinning
    // (TIER_CONFIGS parity); now all three are the same function call.
    expect(calculateQuizDistribution.length).toBe(2);
  });

  it("never asks for more questions per subject than the thinnest bank cell holds", () => {
    // Live bank depth (checked against staging, not just the seed source) is
    // 10/10/7/7/6 per subject for grades 8/9/10/11/12, so the thinnest
    // subject-grade cell is 6 (grade 12). The widest ask in the table is 5 (the
    // 3-subject row); 5 <= 6, so it introduces no shortfall, with one to spare.
    // If a future distribution raises any row past 6 this test fails before
    // students do.
    const THINNEST_BANK_CELL = 6;
    // 5 subjects = the max selectable, 3 of them priority (the widest spread).
    const wide = ["Mathematics", "Science", "English", "Arabic", "Social Studies"];
    const priorities = wide.slice(0, 3);
    for (const [, count] of calculateQuizDistribution(wide, priorities)) {
      expect(count).toBeLessThanOrEqual(THINNEST_BANK_CELL);
    }
  });

  it("returns nothing for a subject count outside the 3-5 table (pre-umbrella-6 legacy rows)", () => {
    // MIN/MAX_FAVORITE_SUBJECTS (assessmentValidation.ts) keep every new
    // assessment inside 3-5, and a row from before that cap already has a
    // quiz — it never reaches this function again (the existingQuiz
    // short-circuit in quiz.routes.ts). An empty distribution here is exactly
    // what falls through to the route's existing MIN_QUESTIONS backfill
    // rather than a crash or an invented number.
    expect(calculateQuizDistribution(["Mathematics"], []).size).toBe(0);
    const seven = ["Mathematics", "Science", "English", "Arabic", "Social Studies", "Computer Science", "Mathematics2"];
    expect(calculateQuizDistribution(seven, []).size).toBe(0);
  });
});
