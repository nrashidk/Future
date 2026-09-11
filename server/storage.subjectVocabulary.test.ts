/**
 * ONE VOCABULARY FOR quiz_questions.subject, ENFORCED WHERE EVERY WRITER PASSES.
 *
 * Six writers reached this column and they did not agree: the seeded bank stored
 * the NAME, contribution approval stored the CODE, the admin routes stored the
 * name while validating it against subjects.code (a guard that only stayed quiet
 * because the admin form sends no curriculum), and the LLM importer stored
 * whatever the model echoed. Serving compares the stored value exactly and
 * case-sensitively, so anything but the name is invisible to students with no
 * error on any path.
 *
 * Four separate guards kept in step is what had already failed. These pin the
 * single resolve instead — at storage, which every write goes through.
 *
 * TWO SCOPES, TWO CATALOGUES. subjects.countryId/.curriculum are notNull while
 * the same columns on quiz_questions are nullable, so a row with either unset has
 * no catalogue row to match and the catalogue invariant cannot be stated for it.
 * That row is global, students only ever pick from the umbrella-6, so SUBJECT_IDS
 * is the only vocabulary a global row can match — not a weaker fallback.
 *
 * No database: ./db is mocked, as in storage.quizQuestionOrder.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { subjects as subjectsTable } from "@shared/schema";

let subjectRows: any[] = [];
let questionRows: any[] = [];
const inserted: any[] = [];
const updatedWith: any[] = [];

function selectChain(): any {
  let table: unknown;
  const chain: any = {
    from: (t: unknown) => { table = t; return chain; },
    where: () => chain,
    orderBy: () => chain,
    then: (resolve: (rows: unknown[]) => unknown) =>
      resolve(table === subjectsTable ? subjectRows : questionRows),
  };
  return chain;
}

vi.mock("./db", () => ({
  db: {
    select: () => selectChain(),
    insert: () => ({
      values: (v: any) => ({ returning: () => Promise.resolve([{ id: "q1", ...v }]) , then: (r: any) => r([{ id: "q1", ...v }]) }),
    }),
    update: () => ({
      set: (v: any) => ({ where: () => ({ returning: () => Promise.resolve([{ id: "q1", ...v }]) }) }),
    }),
  },
  pool: {},
}));

const { storage, SubjectNotInCatalogueError } = await import("./storage");

const CATALOGUE = [
  { name: "Mathematics", code: "mathematics", aliases: ["Math", "Maths", "Algebra"] },
  { name: "Science", code: "science", aliases: ["Physics", "Chemistry"] },
  { name: "Robotics", code: "robotics", aliases: null }, // catalogue-only, outside the umbrella-6
];

beforeEach(() => {
  subjectRows = [...CATALOGUE];
  questionRows = [];
  inserted.length = 0;
  updatedWith.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

const scoped = (input: string) => storage.resolveSubjectName("uae", "MOE National", input);

describe("scoped rows resolve against the catalogue", () => {
  it("accepts the canonical name unchanged", async () => {
    await expect(scoped("Mathematics")).resolves.toBe("Mathematics");
  });

  // The original defect, in one assertion.
  it("accepts the code form and stores the name", async () => {
    await expect(scoped("mathematics")).resolves.toBe("Mathematics");
  });

  it("accepts either form in any casing", async () => {
    await expect(scoped("MATHEMATICS")).resolves.toBe("Mathematics");
    await expect(scoped("  Science  ")).resolves.toBe("Science");
  });

  it("accepts a catalogue alias, because the reader already does", async () => {
    await expect(scoped("Physics")).resolves.toBe("Science");
    await expect(scoped("algebra")).resolves.toBe("Mathematics");
  });

  it("logs the rewrite whenever the stored value differs from the input", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await scoped("Physics");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("'Physics' -> 'Science'"));

    log.mockClear();
    await scoped("Science");
    expect(log).not.toHaveBeenCalled();
  });

  // Catalogue, NOT SUBJECT_IDS: a subject outside the umbrella-6 is a real
  // catalogue entry and storable. That it is then unservable is a separate,
  // still-open divergence (FOLLOWUP.md), not this invariant's business.
  it("accepts a catalogue subject outside the umbrella-6", async () => {
    await expect(scoped("Robotics")).resolves.toBe("Robotics");
  });

  it("refuses what resolves to nothing, as a 400 rather than a throw to the void", async () => {
    await expect(scoped("Astrophysics")).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
    await expect(scoped("Astrophysics")).rejects.toMatchObject({ status: 400, subject: "Astrophysics" });
  });

  it("refuses an empty subject", async () => {
    await expect(scoped("   ")).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
  });
});

describe("unscoped rows resolve against the umbrella-6", () => {
  const global = (input: string) => storage.resolveSubjectName(null, null, input);

  it("resolves regardless of which scope field is missing", async () => {
    await expect(storage.resolveSubjectName("uae", null, "Mathematics")).resolves.toBe("Mathematics");
    await expect(storage.resolveSubjectName(null, "MOE National", "Mathematics")).resolves.toBe("Mathematics");
  });

  it("accepts the six, in name, casing and code form", async () => {
    await expect(global("Mathematics")).resolves.toBe("Mathematics");
    await expect(global("mathematics")).resolves.toBe("Mathematics");
    await expect(global("social_studies")).resolves.toBe("Social Studies");
    await expect(global("COMPUTER SCIENCE")).resolves.toBe("Computer Science");
  });

  it("accepts a static alias whose target is one of the six", async () => {
    await expect(global("Physics")).resolves.toBe("Science");
    await expect(global("Geography")).resolves.toBe("Social Studies");
  });

  // Art/Music/Business self-map in DEFAULT_SUBJECT_MAP and are outside the six.
  // A global question under a subject no student can pick is exactly the
  // unservable row this whole change exists to prevent.
  it("refuses an alias whose target is outside the six", async () => {
    await expect(global("Visual Arts")).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
    await expect(global("Business Studies")).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
  });

  // The catalogue is not consulted, so a catalogue-only subject cannot be stored
  // on a row that has no scope to reach that catalogue by.
  it("refuses a catalogue subject that is not one of the six", async () => {
    await expect(global("Robotics")).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
  });
});

describe("the resolve is wired into both writers", () => {
  const row = {
    question: "Q", questionType: "multiple_choice", options: ["a", "b", "c", "d"],
    correctAnswer: "a", grade: 9, topic: "Algebra", difficulty: "easy",
    cognitiveLevel: "knowledge", countryId: "uae", curriculum: "MOE National",
  };

  it("createQuizQuestion stores the resolved name, not what it was handed", async () => {
    const created = await storage.createQuizQuestion({ ...row, subject: "mathematics" } as any);
    expect(created.subject).toBe("Mathematics");
  });

  it("createQuizQuestion refuses rather than storing something unservable", async () => {
    await expect(
      storage.createQuizQuestion({ ...row, subject: "Astrophysics" } as any),
    ).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
  });

  it("updateQuizQuestion resolves a subject it is given", async () => {
    const out = await storage.updateQuizQuestion("q1", { subject: "science" } as any);
    expect(out?.subject).toBe("Science");
  });

  it("leaves an update that touches neither subject nor scope alone", async () => {
    const out = await storage.updateQuizQuestion("q1", { explanation: "clearer" } as any);
    expect(out?.subject).toBeUndefined(); // the column was not in the SET at all
  });

  /**
   * The C-full case. A payload carrying only `curriculum` moves the row into a
   * different catalogue, under which its untouched subject may resolve to
   * nothing — the same defect one field along, and invisible if the resolve only
   * fires when `subject` is named.
   */
  it("re-resolves an untouched subject when the payload moves the row's scope", async () => {
    questionRows = [{ id: "q1", subject: "Mathematics", countryId: "uae", curriculum: "MOE National" }];
    subjectRows = [{ name: "Mathematics", code: "math", aliases: null }]; // the destination catalogue
    const out = await storage.updateQuizQuestion("q1", { curriculum: "British" } as any);
    expect(out?.subject).toBe("Mathematics");
  });

  it("refuses a scope move that would strand the untouched subject", async () => {
    questionRows = [{ id: "q1", subject: "Mathematics", countryId: "uae", curriculum: "MOE National" }];
    subjectRows = []; // the destination curriculum has no such subject
    await expect(
      storage.updateQuizQuestion("q1", { curriculum: "British" } as any),
    ).rejects.toBeInstanceOf(SubjectNotInCatalogueError);
  });

  it("reports a missing row as not-found rather than as a subject failure", async () => {
    questionRows = [];
    await expect(storage.updateQuizQuestion("nope", { curriculum: "British" } as any)).resolves.toBeUndefined();
  });
});
