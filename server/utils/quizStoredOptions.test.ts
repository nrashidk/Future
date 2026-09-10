import { describe, it, expect } from "vitest";
import { permuteOptionsForStorage } from "./quiz";
import { measureCorrectAnswerSkew } from "../../shared/questionTypes";
import { uaeQuestionBank } from "../questionBanks/uae";
import { flattenQuestionBank } from "../../shared/questionTypes";
import { alignArabicOptions } from "../migrations/alignArabicOptions";
import { GRADE8_ARABIC_CONTENT } from "../migrations/quiz-arabic-content.data";
import { GRADES9_12_ARABIC_CONTENT } from "../migrations/quiz-arabic-content-grades9-12.data";

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
  const QUESTION = { question: "Solve for x: 3x + 7 = 22", subject: "Mathematics", grade: 8 };
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
    expect(alignArabicOptions({ ...QUESTION, question: "not a bank question" }, SOURCE_EN, SOURCE_AR)).toBeNull();
    expect(alignArabicOptions(QUESTION, ["x = 3", "unknown", "x = 7", "x = 9"], SOURCE_AR)).toBeNull();
    expect(alignArabicOptions(QUESTION, SOURCE_EN, ["only", "two"])).toBeNull();
    expect(alignArabicOptions(QUESTION, "not-an-array", SOURCE_AR)).toBeNull();
  });

  it("does not match a question from a different subject or grade", () => {
    expect(alignArabicOptions({ ...QUESTION, subject: "Science" }, SOURCE_EN, SOURCE_AR)).toBeNull();
    expect(alignArabicOptions({ ...QUESTION, grade: 9 }, SOURCE_EN, SOURCE_AR)).toBeNull();
  });

  // The collision that caused the live desync: one stem, two subjects, two
  // different option sets. Keyed by text alone the later subject won and the
  // English row aligned against Arabic sentences.
  describe("the shared stem 'Which sentence is grammatically correct?'", () => {
    const STEM = "Which sentence is grammatically correct?";
    const ENGLISH_OPTIONS = [
      "She and I went to the market.",
      "Me and her went to the market.",
      "Her and me went to the market.",
      "I and she went to the market.",
    ];
    const ARABIC_OPTIONS = [
      "الطالب يدرس في المدرسة",
      "يدرس الطالب المدرسة في",
      "في المدرسة الطالب يدرس",
      "المدرسة في يدرس الطالب",
    ];

    it("resolves the English row against the English options", () => {
      const key = { question: STEM, subject: "English", grade: 8 };
      const stored = [...ENGLISH_OPTIONS].reverse();
      const aligned = alignArabicOptions(key, stored, ENGLISH_OPTIONS)!;
      expect(aligned).toEqual(stored);
      // and never against the other subject's options
      expect(alignArabicOptions(key, ARABIC_OPTIONS, ENGLISH_OPTIONS)).toBeNull();
    });

    it("resolves the Arabic row against the Arabic options", () => {
      const key = { question: STEM, subject: "Arabic", grade: 8 };
      const stored = [...ARABIC_OPTIONS].reverse();
      const aligned = alignArabicOptions(key, stored, ARABIC_OPTIONS)!;
      expect(aligned).toEqual(stored);
      expect(alignArabicOptions(key, ENGLISH_OPTIONS, ARABIC_OPTIONS)).toBeNull();
    });
  });
});

describe("Arabic content entries address exactly one bank question", () => {
  const bank = flattenQuestionBank(uaeQuestionBank);
  const keyOf = (q: { question: string; subject: string; grade: string | number }) =>
    `${q.question} ${q.subject} ${String(q.grade)}`;

  it("has no duplicate (question, subject, grade) in the bank itself", () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const q of bank) {
      const k = keyOf(q);
      if (seen.has(k)) dupes.push(k);
      seen.add(k);
    }
    expect(dupes).toEqual([]);
  });

  it("resolves every content entry to exactly one bank question", () => {
    const counts = new Map<string, number>();
    for (const q of bank) counts.set(keyOf(q), (counts.get(keyOf(q)) ?? 0) + 1);

    const unresolved: string[] = [];
    for (const item of [...GRADE8_ARABIC_CONTENT, ...GRADES9_12_ARABIC_CONTENT]) {
      const n = counts.get(keyOf(item)) ?? 0;
      if (n !== 1) unresolved.push(`${n} matches: ${item.subject}/G${item.grade} ${item.question}`);
    }
    expect(unresolved).toEqual([]);
  });

  it("gives every content entry an optionsAr of the bank question's length", () => {
    const byKey = new Map(bank.map((q) => [keyOf(q), q]));
    const mismatched: string[] = [];
    for (const item of [...GRADE8_ARABIC_CONTENT, ...GRADES9_12_ARABIC_CONTENT]) {
      const q = byKey.get(keyOf(item));
      if (q && q.options.length !== item.optionsAr.length) {
        mismatched.push(`${item.subject}/G${item.grade} ${item.question}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});
