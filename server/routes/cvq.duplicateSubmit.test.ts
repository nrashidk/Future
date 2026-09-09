/**
 * Duplicate CVQ submission — the convergence path.
 *
 * cvq_results.assessment_id has been UNIQUE since the table existed, the insert
 * carries no ON CONFLICT, and the route has no pre-check of any kind — so a
 * second submission for the same assessment raised 23505 into the generic catch
 * and returned 500 "Failed to submit CVQ" for work that HAD been saved. Unlike
 * the quiz race this needs no concurrency at all: a network retry on a slow
 * connection is enough.
 *
 * The create-or-converge decision is extracted as persistCvqResult so this can
 * call the real thing rather than a copy of it — storage is mocked, as in
 * quiz.partialSave.test.ts, so importing the route module does not pull in
 * db.ts (which throws at import when DATABASE_URL is unset).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const createCvqResult = vi.fn();
const getCvqResultByAssessmentId = vi.fn();
const updateAssessment = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    createCvqResult: (...args: any[]) => createCvqResult(...args),
    getCvqResultByAssessmentId: (...args: any[]) => getCvqResultByAssessmentId(...args),
    updateAssessment: (...args: any[]) => updateAssessment(...args),
  },
}));

vi.mock("../auth", () => ({ isAuthenticated: () => {} }));

const { persistCvqResult } = await import("./cvq.routes");

const STORED = {
  id: "cvq-1",
  assessmentId: "assessment-1",
  normalizedScores: { achievement: 80, benevolence: 60, self_direction: 40, security: 20, power: 10 },
  topValues: ["achievement", "benevolence", "self_direction"],
};

const COMPUTED = {
  rawScores: { achievement: 12, benevolence: 12, self_direction: 12, security: 12, power: 12 },
  normalizedScores: { achievement: 55, benevolence: 55, self_direction: 55, security: 55, power: 55 },
  topValues: ["achievement", "benevolence", "self_direction"],
  itemResponses: {},
  completionSeconds: 240,
  avgResponseVariance: 0.9,
  lowVariance: false,
  rushedCompletion: false,
};

const submit = () => persistCvqResult("assessment-1", "user-1", COMPUTED);

beforeEach(() => {
  createCvqResult.mockReset();
  getCvqResultByAssessmentId.mockReset();
  updateAssessment.mockReset().mockResolvedValue({});
});

describe("persistCvqResult — create or converge", () => {
  it("creates, and reports it created, when nothing is stored yet", async () => {
    createCvqResult.mockResolvedValue({ ...STORED, id: "cvq-new" });

    const { result, created } = await submit();

    expect(created).toBe(true);
    expect(result.id).toBe("cvq-new");
    expect(getCvqResultByAssessmentId).not.toHaveBeenCalled();
  });

  it("returns the stored result instead of a 500 when the submission is a duplicate", async () => {
    // The defect: this is what a retried submit used to turn into an opaque
    // "Failed to submit CVQ" for a student whose answers were already saved.
    // The wrapped shape, which is the one neon-serverless actually throws.
    createCvqResult.mockRejectedValue({ cause: { code: "23505" } });
    getCvqResultByAssessmentId.mockResolvedValue(STORED);

    const { result, created } = await submit();

    expect(created).toBe(false);
    expect(result).toBe(STORED);
  });

  it("updates the assessment from the STORED result, not the losing submission", async () => {
    // The stored row is the canonical one — "one canonical result per
    // assessment" — so assessment.cvqScores, which is what matching reads,
    // must agree with it rather than with a resubmission that changed answers.
    createCvqResult.mockRejectedValue({ code: "23505" });
    getCvqResultByAssessmentId.mockResolvedValue(STORED);

    await submit();

    expect(updateAssessment).toHaveBeenCalledWith("assessment-1", {
      cvqScores: { ...STORED.normalizedScores, top3: STORED.topValues },
    });
  });

  it("still writes cvqScores on the converged path, so a half-finished first attempt self-heals", async () => {
    // An attempt that inserted the row and died before the assessment update
    // leaves cvqScores null, and matching reads that field rather than the
    // cvq_results table. Repeating the write is idempotent and closes that gap.
    createCvqResult.mockRejectedValue({ code: "23505" });
    getCvqResultByAssessmentId.mockResolvedValue(STORED);

    await submit();

    expect(updateAssessment).toHaveBeenCalledTimes(1);
  });

  it("does not convert other database failures into a result", async () => {
    // A foreign-key violation means something is wrong, not that something has
    // already happened. It must reach the generic catch and 500.
    createCvqResult.mockRejectedValue({ code: "23503" });

    await expect(submit()).rejects.toMatchObject({ code: "23503" });
    expect(updateAssessment).not.toHaveBeenCalled();
  });

  it("rethrows when the constraint fired but the row is gone", async () => {
    // Something deleted it between the insert and the read. Exceptional, and
    // not to be papered over with a second insert attempt.
    createCvqResult.mockRejectedValue({ code: "23505" });
    getCvqResultByAssessmentId.mockResolvedValue(undefined);

    await expect(submit()).rejects.toMatchObject({ code: "23505" });
  });
});
