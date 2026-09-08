/**
 * The coverage gate for the .ts content migrations.
 *
 * The defect this pins: each apply* module logs "<n> updated, <m> not found" and
 * returns void, so a module that reached zero rows was indistinguishable from one
 * that reached all of them. careers.title_ar and education_level_ar sat NULL in
 * production for months on exactly that basis.
 *
 * The case worth the most here is DUPLICATE_TITLE. careers.title has no unique
 * constraint and every title-matched module takes .limit(1), so two rows sharing
 * a title means one is updated and the other silently keeps stale content — while
 * the module's own notFound counter stays 0 and reports full coverage. A gate
 * built on counters cannot see it; this one is built on rows, and can.
 *
 * evaluateContentCoverage is pure, so no DB or mocking is needed.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateContentCoverage,
  type CareerCoverageRow,
  type CoverageInput,
} from "./contentCoverage";

function career(title: string, over: Partial<CareerCoverageRow> = {}): CareerCoverageRow {
  return {
    title,
    titleAr: "عنوان",
    descriptionAr: "وصف",
    requiredSkillsAr: ["مهارة"],
    educationLevelAr: "بكالوريوس",
    valuesProfile: { achievement: 50 },
    onetGrowthSource: { onetCode: "15-1221.00" },
    futureReadinessSource: { rule: "strict-AND" },
    ...over,
  };
}

function input(over: Partial<CoverageInput> = {}): CoverageInput {
  const careerRows = over.careerRows ?? [career("Software Engineer")];
  return {
    careerRows,
    quizRows: [{ question: "Solve 3x + 7 = 22", questionAr: "حل المعادلة" }],
    arabicTitles: new Set(["Software Engineer"]),
    valuesTitles: new Set(["Software Engineer"]),
    growthTitles: new Set(["Software Engineer"]),
    quizQuestions: new Set(["Solve 3x + 7 = 22"]),
    ...over,
  };
}

describe("content coverage gate", () => {
  it("passes when every migration landed", () => {
    expect(evaluateContentCoverage(input())).toEqual([]);
  });

  it("catches a duplicate title, which the notFound counters cannot see", () => {
    // Both rows exist and .limit(1) updated one of them, so every module would
    // have reported "1 updated, 0 not found" — full coverage, stale data.
    const problems = evaluateContentCoverage(
      input({ careerRows: [career("Software Engineer"), career("Software Engineer")] }),
    );
    const dup = problems.find((p) => p.check === "DUPLICATE_TITLE");
    expect(dup).toBeDefined();
    expect(dup!.detail).toContain("Software Engineer (×2)");
  });

  it("ignores duplicates among titles no migration keys on", () => {
    const problems = evaluateContentCoverage(
      input({
        careerRows: [career("Software Engineer"), career("Rogue Test Career"), career("Rogue Test Career")],
      }),
    );
    expect(problems.filter((p) => p.check === "DUPLICATE_TITLE")).toEqual([]);
  });

  it("names career-arabic-content.ts when the Arabic columns are unwritten", () => {
    // The actual production incident.
    const problems = evaluateContentCoverage(
      input({
        careerRows: [
          career("Software Engineer", {
            titleAr: null,
            descriptionAr: null,
            requiredSkillsAr: null,
            educationLevelAr: null,
          }),
        ],
      }),
    );
    const p = problems.find((x) => x.module === "career-arabic-content.ts");
    expect(p?.check).toBe("MISSING_CONTENT");
    expect(p?.detail).toContain("Software Engineer");
  });

  it("treats an empty requiredSkillsAr array as unwritten, not as covered", () => {
    const problems = evaluateContentCoverage(
      input({ careerRows: [career("Software Engineer", { requiredSkillsAr: [] })] }),
    );
    expect(problems.some((p) => p.module === "career-arabic-content.ts")).toBe(true);
  });

  it("attributes each provenance column to the one migration that writes it", () => {
    const problems = evaluateContentCoverage(
      input({
        careerRows: [
          career("Software Engineer", {
            valuesProfile: null,
            onetGrowthSource: null,
            futureReadinessSource: null,
          }),
        ],
      }),
    );
    const modules = problems.map((p) => p.module);
    expect(modules).toContain("career-values-profiles.ts");
    expect(modules).toContain("career-growth-bands.ts");
    expect(modules).toContain("career-future-readiness.ts");
    expect(modules).not.toContain("career-arabic-content.ts");
  });

  it("reports a career the migration expects but the database does not have", () => {
    const problems = evaluateContentCoverage(
      input({ careerRows: [], arabicTitles: new Set(["Aerospace Engineer"]) }),
    );
    const p = problems.find((x) => x.check === "MISSING_ROW");
    expect(p?.detail).toContain("Aerospace Engineer");
  });

  it("expects future-readiness on every row, not only the title-keyed ones", () => {
    // career-future-readiness.ts rewrites whatever it finds, so a career outside
    // every payload list is still expected to carry its provenance.
    const problems = evaluateContentCoverage(
      input({
        careerRows: [
          career("Software Engineer"),
          career("Some Later Career", { futureReadinessSource: null }),
        ],
      }),
    );
    const p = problems.find((x) => x.module === "career-future-readiness.ts");
    expect(p?.detail).toContain("Some Later Career");
  });

  it("catches quiz questions present but untranslated", () => {
    const problems = evaluateContentCoverage(
      input({ quizRows: [{ question: "Solve 3x + 7 = 22", questionAr: null }] }),
    );
    const p = problems.find((x) => x.module.startsWith("quiz-arabic-content"));
    expect(p?.check).toBe("MISSING_CONTENT");
  });

  it("caps the listing so one systemic failure cannot flood the log", () => {
    const titles = Array.from({ length: 68 }, (_, i) => `Career ${i}`);
    const problems = evaluateContentCoverage(
      input({
        careerRows: titles.map((t) => career(t, { titleAr: null })),
        arabicTitles: new Set(titles),
        valuesTitles: new Set(titles),
        growthTitles: new Set(titles),
      }),
    );
    const p = problems.find((x) => x.module === "career-arabic-content.ts")!;
    expect(p.detail).toContain("and 58 more");
  });
});
