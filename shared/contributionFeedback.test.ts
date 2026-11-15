import { describe, it, expect } from "vitest";
import { authorFeedbackDetail } from "./contributionFeedback";

const base = {
  subject: "mathematics", grade: 10, curriculum: "MOE National", countryId: "uae",
  questions: [{ question: "q1" }, { question: "q2" }], reviewFeedback: "Fix question 2.",
  reviewedAt: new Date("2026-11-13T20:03:06Z"), createdAt: new Date("2026-11-13T20:00:22Z"),
  llmVerificationStatus: "verified",
  llmVerificationFeedback: [
    { index: 1, score: 25, issues: ["prefix looks like test text"], isValid: false },
    { index: 2, score: 65, issues: ["two options are correct"], isValid: false },
  ],
};

describe("authorFeedbackDetail", () => {
  it("carries the reviewer's note and the check's issues, indexed from 0", () => {
    const d = authorFeedbackDetail(base);
    expect(d.reviewerNote).toBe("Fix question 2.");
    expect(d.checkNotes).toEqual([
      { questionIndex: 0, issues: ["prefix looks like test text"] },
      { questionIndex: 1, issues: ["two options are correct"] },
    ]);
  });
  it("never sends the check's scores (owner's decision)", () => {
    const json = JSON.stringify(authorFeedbackDetail(base));
    expect(json).not.toContain("score");
    expect(json).not.toContain("isValid");
  });
  it("sends no check notes when the check did not run", () => {
    expect(authorFeedbackDetail({ ...base, llmVerificationStatus: "unavailable" }).checkNotes).toEqual([]);
    expect(authorFeedbackDetail({ ...base, llmVerificationStatus: "pending" }).checkNotes).toEqual([]);
  });
  it("sends no check notes once the questions are approved (owner's decision)", () => {
    expect(authorFeedbackDetail({ ...base, status: "approved" }).checkNotes).toEqual([]);
    expect(authorFeedbackDetail({ ...base, status: "claimed" }).checkNotes).toEqual([]);
    // Control: still sent while there is something to fix.
    expect(authorFeedbackDetail({ ...base, status: "needs_changes" }).checkNotes).toHaveLength(2);
  });
  it("drops malformed entries rather than guessing which question they meant", () => {
    const d = authorFeedbackDetail({ ...base, llmVerificationFeedback: [{ issues: ["x"] }, { index: 2, issues: [] }, { index: 1, issues: [5, "ok"] }] });
    expect(d.checkNotes).toEqual([{ questionIndex: 0, issues: ["ok"] }]);
  });
});
