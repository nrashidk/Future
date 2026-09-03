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

describe("quiz distribution consequences of the fix", () => {
  // The umbrella-6 minimum selection: 3 subjects, all 3 marked priority.
  const subjects = ["Mathematics", "Science", "English"];

  it("school tier yields 5 questions per priority subject, free tier only 4", () => {
    const school = calculateQuizDistribution(subjects, subjects, "school");
    const free = calculateQuizDistribution(subjects, subjects, "free");

    for (const s of subjects) {
      expect(school.get(s)).toBe(5);
      expect(free.get(s)).toBe(4);
    }
    // This 15-vs-12 gap is what a school student was losing.
    expect(total(school)).toBe(15);
    expect(total(free)).toBe(12);
  });

  it("school and premium distributions are identical (TIER_CONFIGS parity)", () => {
    // Guards the claim that 'school' vs 'premium' is presentational today: if
    // these ever diverge, the fix above starts changing self-payer behaviour too.
    const school = calculateQuizDistribution(subjects, subjects, "school");
    const premium = calculateQuizDistribution(subjects, subjects, "premium");
    expect([...school.entries()]).toEqual([...premium.entries()]);
  });

  it("never asks for more questions per subject than the thinnest bank cell holds", () => {
    // Staging bank depth is 10/10/7/7/6 per subject for grades 8/9/10/11/12, so
    // the thinnest subject-grade cell is 6 (grade 12). The fix raises the ask from
    // 4 to 5 per priority subject; 5 <= 6, so it introduces no shortfall. If a
    // future tier config raises the cap past 6 this test fails before students do.
    const THINNEST_BANK_CELL = 6;
    // 5 subjects = the max selectable, 3 of them priority (the widest spread).
    const wide = ["Mathematics", "Science", "English", "Arabic", "Social Studies"];
    const priorities = wide.slice(0, 3);
    for (const tier of ["free", "premium", "school"] as const) {
      for (const [, count] of calculateQuizDistribution(wide, priorities, tier)) {
        expect(count).toBeLessThanOrEqual(THINNEST_BANK_CELL);
      }
    }
  });
});
