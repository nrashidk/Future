/**
 * Pins the two things most likely to silently regress in
 * guestAssessmentExpiry.ts:
 *
 * 1. Delete ORDER. Same shape of bug erasure-dependent-list.md documents for
 *    eraseUserData: deleting a parent before its NO ACTION children throws
 *    23503 in real Postgres. This suite cannot exercise real FK enforcement
 *    (no DB in this test environment — storage is mocked so importing this
 *    file does not pull in db.ts, which throws at import when DATABASE_URL
 *    is unset, same pattern as assessment.school-owned-fields.test.ts), so
 *    it pins the ORDER of tx.delete() calls instead: quiz_responses before
 *    assessment_quizzes before recommendations before wef_competency_results
 *    before assessments — the same order the real FK graph requires.
 *
 * 2. The sweep must never throw. Nothing at its call site
 *    (assessment.routes.ts) awaits or catches it — `void
 *    sweepExpiredGuestAssessmentsIfDue()` — so an uncaught rejection there
 *    would be a silent unhandled rejection, not a loud failure. The failure
 *    case below asserts the promise resolves even when every DB call inside
 *    throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assessments, assessmentQuizzes, quizResponses, recommendations, wefCompetencyResults,
} from "@shared/schema";

const getSystemConfig = vi.fn();
const upsertSystemConfig = vi.fn();

vi.mock("../storage", () => ({
  storage: { getSystemConfig, upsertSystemConfig },
}));

let fakeTx: any;
let dbTransactionCalls = 0;
vi.mock("../db", () => ({
  db: {
    transaction: async (cb: any) => {
      dbTransactionCalls++;
      return cb(fakeTx);
    },
  },
}));

const { deleteExpiredGuestAssessments, shouldRunSweep, sweepExpiredGuestAssessmentsIfDue } =
  await import("./guestAssessmentExpiry");

function makeFakeTx(opts: { expiredIds: string[]; quizIds: string[]; throwOnSelect?: boolean }) {
  const calls: string[] = [];
  return {
    calls,
    select: () => ({
      from: (table: any) => ({
        where: async () => {
          if (opts.throwOnSelect) throw new Error("db unavailable");
          if (table === assessments) {
            calls.push("select:assessments");
            return opts.expiredIds.map((id) => ({ id }));
          }
          if (table === assessmentQuizzes) {
            calls.push("select:assessment_quizzes");
            return opts.quizIds.map((id) => ({ id }));
          }
          throw new Error("unexpected select target in test fake");
        },
      }),
    }),
    delete: (table: any) => ({
      where: async () => {
        if (table === quizResponses) calls.push("delete:quiz_responses");
        else if (table === assessmentQuizzes) calls.push("delete:assessment_quizzes");
        else if (table === recommendations) calls.push("delete:recommendations");
        else if (table === wefCompetencyResults) calls.push("delete:wef_competency_results");
        else if (table === assessments) calls.push("delete:assessments");
        else calls.push("delete:unknown");
        return { rowCount: 0 };
      },
    }),
  };
}

beforeEach(() => {
  getSystemConfig.mockReset();
  upsertSystemConfig.mockReset();
  dbTransactionCalls = 0;
});

describe("deleteExpiredGuestAssessments", () => {
  it("deletes nothing, and issues no delete at all, when no assessment is expired", async () => {
    const tx = makeFakeTx({ expiredIds: [], quizIds: [] });
    const result = await deleteExpiredGuestAssessments(tx, new Date());
    expect(result).toEqual({ deletedCount: 0, assessmentIds: [] });
    expect(tx.calls).toEqual(["select:assessments"]);
  });

  it("deletes children before the parent, in FK-safe order, when a quiz exists", async () => {
    const tx = makeFakeTx({ expiredIds: ["a1"], quizIds: ["q1"] });
    const result = await deleteExpiredGuestAssessments(tx, new Date());

    expect(result).toEqual({ deletedCount: 1, assessmentIds: ["a1"] });
    expect(tx.calls).toEqual([
      "select:assessments",
      "select:assessment_quizzes",
      "delete:quiz_responses",
      "delete:assessment_quizzes",
      "delete:recommendations",
      "delete:wef_competency_results",
      "delete:assessments",
    ]);
  });

  it("skips the quiz_responses delete when the expired assessment never generated a quiz", async () => {
    const tx = makeFakeTx({ expiredIds: ["a1"], quizIds: [] });
    await deleteExpiredGuestAssessments(tx, new Date());

    expect(tx.calls).toEqual([
      "select:assessments",
      "select:assessment_quizzes",
      "delete:assessment_quizzes",
      "delete:recommendations",
      "delete:wef_competency_results",
      "delete:assessments",
    ]);
  });
});

describe("shouldRunSweep", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");

  it("runs when there is no record of a prior attempt", () => {
    expect(shouldRunSweep(null, now, 30 * 60 * 1000)).toBe(true);
  });

  it("runs when the stored timestamp is unparseable, rather than never running again", () => {
    expect(shouldRunSweep("not-a-date", now, 30 * 60 * 1000)).toBe(true);
  });

  it("does not run again inside the throttle window", () => {
    const lastRunAt = new Date(now.getTime() - 10 * 60 * 1000).toISOString(); // 10 min ago
    expect(shouldRunSweep(lastRunAt, now, 30 * 60 * 1000)).toBe(false);
  });

  it("runs again once the throttle window has elapsed", () => {
    const lastRunAt = new Date(now.getTime() - 31 * 60 * 1000).toISOString(); // 31 min ago
    expect(shouldRunSweep(lastRunAt, now, 30 * 60 * 1000)).toBe(true);
  });
});

describe("sweepExpiredGuestAssessmentsIfDue", () => {
  it("does not touch the database at all inside the throttle window", async () => {
    getSystemConfig.mockResolvedValueOnce({
      value: JSON.stringify({ lastRunAt: new Date().toISOString(), lastSuccessAt: null, lastDeletedCount: null, lastError: null }),
    });

    await sweepExpiredGuestAssessmentsIfDue();

    expect(dbTransactionCalls).toBe(0);
    expect(upsertSystemConfig).not.toHaveBeenCalled();
  });

  it("runs, deletes, and records a successful status when due", async () => {
    getSystemConfig.mockResolvedValueOnce(undefined); // never run before
    fakeTx = makeFakeTx({ expiredIds: ["a1", "a2"], quizIds: [] });

    await sweepExpiredGuestAssessmentsIfDue();

    expect(dbTransactionCalls).toBe(1);
    expect(upsertSystemConfig).toHaveBeenCalledTimes(1);
    const [key, value] = upsertSystemConfig.mock.calls[0];
    expect(key).toBe("guest_assessment_sweep_status");
    const status = JSON.parse(value);
    expect(status.lastDeletedCount).toBe(2);
    expect(status.lastError).toBeNull();
    expect(status.lastSuccessAt).toBe(status.lastRunAt);
  });

  it("never rejects when every DB call fails, and records the failure instead", async () => {
    getSystemConfig.mockResolvedValueOnce(undefined);
    fakeTx = makeFakeTx({ expiredIds: ["a1"], quizIds: [], throwOnSelect: true });

    await expect(sweepExpiredGuestAssessmentsIfDue()).resolves.toBeUndefined();

    expect(upsertSystemConfig).toHaveBeenCalledTimes(1);
    const [, value] = upsertSystemConfig.mock.calls[0];
    const status = JSON.parse(value);
    expect(status.lastError).toContain("db unavailable");
    expect(status.lastSuccessAt).toBeNull(); // carried forward from the empty prior status, not set on failure
  });

  it("never rejects even when writing the failure status also fails", async () => {
    getSystemConfig.mockResolvedValueOnce(undefined);
    upsertSystemConfig.mockRejectedValue(new Error("status write also down"));
    fakeTx = makeFakeTx({ expiredIds: ["a1"], quizIds: [], throwOnSelect: true });

    await expect(sweepExpiredGuestAssessmentsIfDue()).resolves.toBeUndefined();
  });
});
