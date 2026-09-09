/**
 * Concurrent quiz generation — the convergence path.
 *
 * Migration 019 made assessment_quizzes.assessment_id unique, which closes the
 * duplicate-quiz defect and, on its own, opens a worse one: the losing half of a
 * double-clicked generate takes a 23505 into the route's generic catch and gets
 * an opaque 500, which QuizStep renders as "unable to generate" beside a button
 * that skips the quiz entirely — while a perfectly good quiz row exists for that
 * assessment. The route now catches the violation and returns the winner's quiz.
 *
 * These cover the three pieces that path is built from. The route body itself
 * needs an Express app and a live-ish storage to exercise end to end; these are
 * the pieces where the logic actually lives, and they are pure enough to pin
 * without either.
 *
 * Storage is mocked so importing quiz.routes.ts does not pull in db.ts, which
 * throws at import when DATABASE_URL is unset — same pattern as
 * quiz.partialSave.test.ts and quiz.tier.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getQuizResponsesByQuizId = vi.fn();
const getAllQuizQuestions = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getQuizResponsesByQuizId: (...args: any[]) => getQuizResponsesByQuizId(...args),
    getAllQuizQuestions: (...args: any[]) => getAllQuizQuestions(...args),
  },
}));

const { isUniqueViolation, buildExistingQuizPayload, awaitQuizResponses } = await import("./quiz.routes");

beforeEach(() => {
  getQuizResponsesByQuizId.mockReset();
  getAllQuizQuestions.mockReset();
});

describe("isUniqueViolation", () => {
  it("recognises the pg error itself", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognises it through the wrapper neon-serverless throws", () => {
    // The reason this helper exists rather than an inline `error.code` check:
    // the driver frequently re-throws with the pg error as `cause`, and a
    // check on the outer code alone silently misses those. Same two places
    // seed.ts:2834 and country.routes.ts:532 look.
    expect(isUniqueViolation({ message: "insert failed", cause: { code: "23505" } })).toBe(true);
  });

  it("does not swallow other database errors", () => {
    // 23503 is a foreign-key violation and 23514 a check violation. Converging
    // on either would return a quiz for an error that has nothing to do with a
    // race, so they must reach the generic catch.
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23514" } })).toBe(false);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("buildExistingQuizPayload", () => {
  const quiz = { id: "quiz-1", completedAt: null };

  beforeEach(() => {
    getQuizResponsesByQuizId.mockResolvedValue([
      { questionId: "q1", answer: "Mitochondria" },
      { questionId: "q2", answer: "" },
    ]);
    getAllQuizQuestions.mockResolvedValue([
      { id: "q1", question: "Powerhouse?", questionAr: "مصنع الطاقة؟", questionType: "multiple_choice", options: ["a", "b"], subject: "Science" },
      { id: "q2", question: "2 + 2?", questionAr: "٢ + ٢؟", questionType: "multiple_choice", options: ["a", "b"], subject: "Mathematics" },
      { id: "q3", question: "Not on this paper", questionAr: null, questionType: "multiple_choice", options: ["a", "b"], subject: "Science" },
    ]);
  });

  it("returns the stored answers, so a converged caller resumes rather than restarts", () => {
    return expect(buildExistingQuizPayload(quiz, "en")).resolves.toMatchObject({
      quizId: "quiz-1",
      responses: [
        { questionId: "q1", answer: "Mitochondria" },
        { questionId: "q2", answer: "" },
      ],
      completed: false,
    });
  });

  it("derives the paper from the stored rows, not from a fresh selection", async () => {
    // q3 exists in the bank and is deliberately not among this quiz's rows.
    // Re-selecting questions here would hand the student a different paper from
    // the one whose rows submit will score.
    const payload = await buildExistingQuizPayload(quiz, "en");
    expect(payload.questions.map((q: any) => q.id)).toEqual(["q1", "q2"]);
  });

  it("honours the requested language", async () => {
    const payload = await buildExistingQuizPayload(quiz, "ar");
    expect(payload.questions.map((q: any) => q.question)).toEqual(["مصنع الطاقة؟", "٢ + ٢؟"]);
  });

  it("reports a submitted quiz as completed", async () => {
    const payload = await buildExistingQuizPayload({ id: "quiz-1", completedAt: new Date() }, "en");
    expect(payload.completed).toBe(true);
  });
});

describe("awaitQuizResponses", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns as soon as the winner's rows are all there", async () => {
    getQuizResponsesByQuizId.mockResolvedValue([{ questionId: "q1" }, { questionId: "q2" }]);

    await awaitQuizResponses("quiz-1", 2);

    // One read, no waiting: the common case is that the winner finished first.
    expect(getQuizResponsesByQuizId).toHaveBeenCalledTimes(1);
  });

  it("waits while the winner is still writing, then returns", async () => {
    // The winner inserts its response rows one at a time, so a loser that reads
    // immediately can see a half-written paper. Returning that would give the
    // student a short quiz they cannot submit.
    getQuizResponsesByQuizId
      .mockResolvedValueOnce([{ questionId: "q1" }])
      .mockResolvedValueOnce([{ questionId: "q1" }, { questionId: "q2" }]);

    vi.useFakeTimers();
    const waiting = awaitQuizResponses("quiz-1", 2);
    await vi.advanceTimersByTimeAsync(200);
    await waiting;

    expect(getQuizResponsesByQuizId).toHaveBeenCalledTimes(2);
  });

  it("is bounded: it gives up rather than holding the request open", async () => {
    // A winner that died mid-write leaves rows that never arrive. The wait ends
    // at 10 attempts x 100ms and the caller returns what exists — the same
    // damaged state the pre-insert check has always returned for such a row.
    getQuizResponsesByQuizId.mockResolvedValue([{ questionId: "q1" }]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.useFakeTimers();
    const waiting = awaitQuizResponses("quiz-1", 12);
    await vi.advanceTimersByTimeAsync(10 * 100);
    await waiting;

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("1/12"));
    warn.mockRestore();
  });
});
