import { describe, it, expect } from "vitest";
import { permuteOptionsForStorage } from "./quiz";
import { measureCorrectAnswerSkew } from "../../shared/questionTypes";
import { uaeQuestionBank } from "../questionBanks/uae";
import { flattenQuestionBank } from "../../shared/questionTypes";
import { alignArabicOptions } from "../migrations/alignArabicOptions";

describe("permuteOptionsForStorage", () => {
  const EN = ["CORRECT", "w1", "w2", "w3"];
  const AR = ["صحيح", "خ1", "خ2", "خ3"];

  it("preserves the option set exactly", () => {
    const out = permuteOptionsForStorage(EN, undefined);
    expect([...(out.options as string[])].sort()).toEqual([...EN].sort());
  });

  it("does not leave the correct answer pinned at index 0", () => {
    const positions = Array.from({ length: 80 }, () => {
      const out = permuteOptionsForStorage(EN, undefined).options as string[];
      return out.indexOf("CORRECT");
    });
    expect(new Set(positions).size).toBeGreaterThan(1);
    // Uniform would be ~20/80. Anything near 80 means no permutation happened.
    expect(positions.filter((p) => p === 0).length).toBeLessThan(55);
  });

  it("is NOT derivable — repeated calls on identical input differ", () => {
    // A deterministic permutation over question content would be recomputable
    // from the repo and would leave the exploit intact. This pins randomness.
    const orders = new Set(
      Array.from({ length: 40 }, () =>
        (permuteOptionsForStorage(EN, undefined).options as string[]).join("|"),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("keeps optionsAr paired with options under the SAME permutation", () => {
    const pairs: Record<string, string> = {
      CORRECT: "صحيح",
      w1: "خ1",
      w2: "خ2",
      w3: "خ3",
    };
    for (let i = 0; i < 50; i++) {
      const out = permuteOptionsForStorage(EN, AR);
      const en = out.options as string[];
      const ar = out.optionsAr as string[];
      expect(ar).toHaveLength(en.length);
      en.forEach((text, idx) => expect(ar[idx]).toBe(pairs[text]));
    }
  });

  it("leaves optionsAr untouched when it is not genuinely parallel", () => {
    const short = ["صحيح", "خ1"];
    const out = permuteOptionsForStorage(EN, short);
    expect(out.optionsAr).toBe(short);
  });

  it("moves ids with their option for {id,text} shaped options", () => {
    // seed.ts domain questions store correctAnswer as an option id, so the id
    // must travel with the option it labels.
    const objs = [
      { id: "a", text: "CORRECT" },
      { id: "b", text: "w1" },
      { id: "c", text: "w2" },
      { id: "d", text: "w3" },
    ];
    for (let i = 0; i < 30; i++) {
      const out = permuteOptionsForStorage(objs, undefined).options as typeof objs;
      for (const opt of out) {
        expect(opt.text).toBe(objs.find((o) => o.id === opt.id)!.text);
      }
    }
  });

  it("no-ops on absent, empty or single-element options", () => {
    expect(permuteOptionsForStorage(undefined, undefined).options).toBeUndefined();
    expect(permuteOptionsForStorage([], undefined).options).toEqual([]);
    expect(permuteOptionsForStorage(["only"], undefined).options).toEqual(["only"]);
  });
});

describe("measureCorrectAnswerSkew", () => {
  const q = (options: string[], correctAnswer: string) =>
    ({ options, correctAnswer }) as any;

  it("flags the UAE bank as authored — 239 of 240 correct-answer-first", () => {
    const skew = measureCorrectAnswerSkew(flattenQuestionBank(uaeQuestionBank));
    expect(skew).toHaveLength(1);
    expect(skew[0].optionCount).toBe(4);
    expect(skew[0].questions).toBe(240);
    expect(skew[0].positions[0]).toBe(239);
    expect(skew[0].tested).toBe(true);
    expect(skew[0].skewed).toBe(true);
    // Far past the line, not marginally over it.
    expect(skew[0].chiSquare).toBeGreaterThan(500);
  });

  it("does not flag a permuted bank of the same size", () => {
    // The false-positive case the threshold exists to avoid.
    const questions = Array.from({ length: 240 }, () => {
      const opts = permuteOptionsForStorage(["CORRECT", "w1", "w2", "w3"], undefined)
        .options as string[];
      return q(opts, "CORRECT");
    });
    const skew = measureCorrectAnswerSkew(questions);
    expect(skew[0].skewed).toBe(false);
  });

  it("refuses to test below the expected-count floor rather than guessing", () => {
    // 12 questions over 4 positions: expected 3, under the floor of 5.
    const questions = Array.from({ length: 12 }, () => q(["CORRECT", "w1", "w2", "w3"], "CORRECT"));
    const skew = measureCorrectAnswerSkew(questions);
    expect(skew[0].tested).toBe(false);
    expect(skew[0].skewed).toBe(false);
  });

  it("groups by option count so mixed banks are tested against their own uniform", () => {
    const four = Array.from({ length: 40 }, () => q(["CORRECT", "w1", "w2", "w3"], "CORRECT"));
    const three = Array.from({ length: 30 }, () => q(["CORRECT", "w1", "w2"], "CORRECT"));
    const skew = measureCorrectAnswerSkew([...four, ...three]);
    expect(skew.map((s) => s.optionCount)).toEqual([3, 4]);
    expect(skew.every((s) => s.skewed)).toBe(true);
  });

  it("ignores questions whose correct answer is not among the options", () => {
    const skew = measureCorrectAnswerSkew([q(["a", "b", "c", "d"], "not-an-option")]);
    expect(skew).toHaveLength(0);
  });
});

describe("alignArabicOptions", () => {
  // A real bank question, so the source lookup is exercised for real.
  const QUESTION = "Solve for x: 3x + 7 = 22";
  const SOURCE_EN = ["x = 3", "x = 5", "x = 7", "x = 9"];
  const SOURCE_AR = ["x = 3", "x = 5", "x = 7", "x = 9"];

  it("returns the Arabic array reordered to match stored order", () => {
    const stored = ["x = 9", "x = 3", "x = 7", "x = 5"];
    const aligned = alignArabicOptions(QUESTION, stored, SOURCE_AR)!;
    expect(aligned).not.toBeNull();
    stored.forEach((en, idx) => {
      const sourceIdx = SOURCE_EN.indexOf(en);
      expect(aligned[idx]).toBe(SOURCE_AR[sourceIdx]);
    });
  });

  it("is a no-op when stored order already equals source order", () => {
    expect(alignArabicOptions(QUESTION, SOURCE_EN, SOURCE_AR)).toEqual(SOURCE_AR);
  });

  it("survives an arbitrary permutation of the stored array", () => {
    for (let i = 0; i < 30; i++) {
      const stored = permuteOptionsForStorage(SOURCE_EN, undefined).options as string[];
      const aligned = alignArabicOptions(QUESTION, stored, SOURCE_AR)!;
      stored.forEach((en, idx) => {
        expect(aligned[idx]).toBe(SOURCE_AR[SOURCE_EN.indexOf(en)]);
      });
    }
  });

  it("returns null rather than guessing when the pairing cannot be established", () => {
    expect(alignArabicOptions("not a bank question", SOURCE_EN, SOURCE_AR)).toBeNull();
    expect(alignArabicOptions(QUESTION, ["x = 3", "unknown", "x = 7", "x = 9"], SOURCE_AR)).toBeNull();
    expect(alignArabicOptions(QUESTION, SOURCE_EN, ["only", "two"])).toBeNull();
    expect(alignArabicOptions(QUESTION, "not-an-array", SOURCE_AR)).toBeNull();
  });
});
