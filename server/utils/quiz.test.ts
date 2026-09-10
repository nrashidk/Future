import { describe, it, expect } from "vitest";
import { transformQuizQuestionForFrontend, seededPermutation } from "./quiz";

/**
 * These pin the fix for the constant-score bug documented in
 * docs/quiz-constant-score-recon.md.
 *
 * Option order used to be shuffled only in the /quiz/generate response and was
 * never persisted, so every re-read served raw database order — in which 239 of
 * the bank's 240 questions have the correct answer at options[0]. Reloading the
 * quiz page handed the student an answer key.
 *
 * The two properties that matter are in tension, which is why both are pinned
 * here: the order must be STABLE for a given quiz (or a reload changes the
 * paper) and must NOT be the database order (or it is an answer key).
 */

/** A question in the shape the bank actually stores: options as plain strings. */
const question = (id: string, correctFirst = true) => ({
  id,
  question: `Q${id}?`,
  questionType: "multiple_choice",
  options: correctFirst
    ? ["CORRECT", "wrong-1", "wrong-2", "wrong-3"]
    : ["wrong-1", "CORRECT", "wrong-2", "wrong-3"],
  correctAnswer: "CORRECT",
  subject: "Mathematics",
});

const texts = (q: any) => q.options.map((o: any) => o.text);
const indexOfCorrect = (q: any) => texts(q).indexOf("CORRECT");

describe("seededPermutation", () => {
  it("is deterministic for a given seed", () => {
    const items = ["a", "b", "c", "d", "e", "f"];
    expect(seededPermutation(items, "seed-1")).toEqual(seededPermutation(items, "seed-1"));
  });

  it("gives unrelated orders for different seeds", () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const a = seededPermutation(items, "seed-1");
    const b = seededPermutation(items, "seed-2");
    expect(a).not.toEqual(b);
  });

  it("permutes rather than mutates — same members, input untouched", () => {
    const items = ["a", "b", "c", "d"];
    const out = seededPermutation(items, "s");
    expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
    expect(items).toEqual(["a", "b", "c", "d"]);
  });

  it("handles empty and single-element arrays", () => {
    expect(seededPermutation([], "s")).toEqual([]);
    expect(seededPermutation(["only"], "s")).toEqual(["only"]);
  });
});

describe("transformQuizQuestionForFrontend — option order", () => {
  it("returns the SAME order for the same quiz id across repeated calls", () => {
    // This is the generate/re-read divergence: generate, buildExistingQuizPayload
    // and GET /quiz all call this, and all three must agree.
    const q = question("q1");
    const a = transformQuizQuestionForFrontend(q, "quiz-abc");
    const b = transformQuizQuestionForFrontend(q, "quiz-abc");
    const c = transformQuizQuestionForFrontend(q, "quiz-abc");
    expect(texts(a)).toEqual(texts(b));
    expect(texts(b)).toEqual(texts(c));
  });

  it("gives different quizzes different orders for the same question", () => {
    const q = question("q1");
    const orders = new Set(
      ["quiz-a", "quiz-b", "quiz-c", "quiz-d", "quiz-e", "quiz-f"].map((seed) =>
        texts(transformQuizQuestionForFrontend(q, seed)).join("|"),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("varies order across questions within one quiz", () => {
    const orders = new Set(
      ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"].map((id) =>
        texts(transformQuizQuestionForFrontend(question(id), "quiz-abc")).join("|"),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("does not leave the correct answer pinned at index 0", () => {
    // The regression itself. Every input here has the correct answer first,
    // exactly like the real bank; the output must not.
    const positions = Array.from({ length: 60 }, (_, i) =>
      indexOfCorrect(transformQuizQuestionForFrontend(question(`q${i}`), "quiz-abc")),
    );
    const atZero = positions.filter((p) => p === 0).length;
    expect(new Set(positions).size).toBeGreaterThan(1);
    // Uniform would be ~15/60. Anything near 60 means the shuffle is absent.
    expect(atZero).toBeLessThan(40);
  });

  it("preserves the option text set exactly — scoring compares by text", () => {
    const out = transformQuizQuestionForFrontend(question("q1"), "quiz-abc");
    expect([...texts(out)].sort()).toEqual(["CORRECT", "wrong-1", "wrong-2", "wrong-3"]);
  });
});

describe("transformQuizQuestionForFrontend — ids and translations", () => {
  it("assigns ids by DISPLAY position, never carrying the database index", () => {
    // If ids carried the DB index, id "0" would still mark the correct answer
    // on 239/240 bank questions even with the visible order shuffled.
    for (const seed of ["quiz-a", "quiz-b", "quiz-c"]) {
      const out = transformQuizQuestionForFrontend(question("q1"), seed);
      expect(out.options.map((o: any) => o.id)).toEqual(["0", "1", "2", "3"]);
    }
  });

  it("does not let id 0 track the correct answer across questions", () => {
    const idsOfCorrect = Array.from({ length: 40 }, (_, i) => {
      const out = transformQuizQuestionForFrontend(question(`q${i}`), "quiz-abc");
      return out.options.find((o: any) => o.text === "CORRECT").id;
    });
    expect(new Set(idsOfCorrect).size).toBeGreaterThan(1);
  });

  it("keeps each Arabic translation with its English text through the permutation", () => {
    const q = {
      ...question("q1"),
      optionsAr: ["صحيح", "خطأ-1", "خطأ-2", "خطأ-3"],
    };
    const pairs: Record<string, string> = {
      CORRECT: "صحيح",
      "wrong-1": "خطأ-1",
      "wrong-2": "خطأ-2",
      "wrong-3": "خطأ-3",
    };
    for (const seed of ["quiz-a", "quiz-b", "quiz-c", "quiz-d"]) {
      const out = transformQuizQuestionForFrontend(q, seed);
      for (const opt of out.options) {
        expect(opt.textAr).toBe(pairs[opt.text]);
      }
    }
  });

  it("still hides correctAnswer for multiple choice", () => {
    const out = transformQuizQuestionForFrontend(question("q1"), "quiz-abc");
    expect(out.correctAnswer).toBeUndefined();
  });

  it("still exposes correctAnswer for rating questions, and tolerates absent options", () => {
    const rating = {
      id: "r1",
      question: "Rate this",
      questionType: "rating",
      options: null,
      correctAnswer: "3",
    };
    const out = transformQuizQuestionForFrontend(rating, "quiz-abc");
    expect(out.correctAnswer).toBe("3");
    expect(out.options).toEqual([]);
  });

  it("handles options already stored as {id,text} objects without double-wrapping", () => {
    const q = {
      id: "q1",
      questionType: "multiple_choice",
      options: [
        { id: "a", text: "CORRECT" },
        { id: "b", text: "wrong-1" },
      ],
      correctAnswer: "CORRECT",
    };
    const out = transformQuizQuestionForFrontend(q, "quiz-abc");
    expect([...texts(out)].sort()).toEqual(["CORRECT", "wrong-1"]);
    expect(out.options.map((o: any) => o.id).sort()).toEqual(["0", "1"]);
  });
});
