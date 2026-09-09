/**
 * Partial (pre-submit) answer saves — the row selection.
 *
 * The defect this closes: quiz_responses rows were created with answer: "" and
 * only ever written by the submit handler, so in-progress answers lived solely
 * in QuizStep's React state. Step 4 is a conditional render, so the Back button
 * added in 43ec3e6 unmounted it and destroyed them; a reload did the same.
 *
 * What matters here is what the partial save is allowed to touch. It resolves
 * rows through the quiz's OWN responses, writes `answer` alone, and never
 * carries isCorrect or score — scoring stays the submit handler's.
 *
 * Storage is mocked so importing quiz.routes.ts does not pull in db.ts, which
 * throws at import when DATABASE_URL is unset (same pattern as
 * quiz.tier.test.ts). The helper under test is pure, so the mock only has to
 * satisfy module-level imports.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

const { selectPartialAnswerUpdates } = await import("./quiz.routes");

const rows = [
  { id: "row-1", questionId: "q1", answer: "" },
  { id: "row-2", questionId: "q2", answer: "Photosynthesis" },
  { id: "row-3", questionId: "q3", answer: null },
];

describe("selectPartialAnswerUpdates", () => {
  it("writes a newly answered question against its own row id", () => {
    const { updates, invalidIds } = selectPartialAnswerUpdates(rows, [
      { questionId: "q1", answer: "Mitochondria" },
    ]);

    expect(updates).toEqual([{ id: "row-1", answer: "Mitochondria" }]);
    expect(invalidIds).toEqual([]);
  });

  it("skips an answer already stored, so a full-set resend writes nothing", () => {
    // The client sends every answer on every debounce. Without this, answering
    // the twelfth question would issue twelve UPDATEs.
    const { updates } = selectPartialAnswerUpdates(rows, [
      { questionId: "q2", answer: "Photosynthesis" },
    ]);

    expect(updates).toEqual([]);
  });

  it("treats a null stored answer as blank rather than as a difference", () => {
    const { updates } = selectPartialAnswerUpdates(rows, [{ questionId: "q3", answer: "" }]);

    expect(updates).toEqual([]);
  });

  it("rejects a questionId that is not one of this quiz's rows", () => {
    // The id belongs to some other quiz, or to nothing. It must not become a
    // write — this is what makes a cross-quiz write structurally impossible.
    const { updates, invalidIds } = selectPartialAnswerUpdates(rows, [
      { questionId: "q1", answer: "Mitochondria" },
      { questionId: "someone-elses-question", answer: "x" },
    ]);

    expect(invalidIds).toEqual(["someone-elses-question"]);
    expect(updates.every((u) => u.id !== "someone-elses-question")).toBe(true);
  });

  it("never produces isCorrect or score — scoring belongs to submit alone", () => {
    const { updates } = selectPartialAnswerUpdates(rows, [
      { questionId: "q1", answer: "Mitochondria" },
      { questionId: "q2", answer: "Respiration" },
    ]);

    for (const update of updates) {
      expect(Object.keys(update).sort()).toEqual(["answer", "id"]);
    }
  });

  it("is a no-op on an empty set", () => {
    expect(selectPartialAnswerUpdates(rows, [])).toEqual({ updates: [], invalidIds: [] });
  });
});
