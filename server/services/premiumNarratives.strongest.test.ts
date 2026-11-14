import { describe, it, expect } from "vitest";
import { strongestSubject, generateEnhancedActionSteps } from "./premiumNarratives";

/**
 * "Build on your strength" named the FIRST favourite ticked, not the one the
 * quiz showed to be strongest. Seen on a live report 2026-11-12: Mathematics
 * (80%) named over Computer Science (100%).
 */
describe("strongestSubject", () => {
  // The shape the quiz actually stores, copied from a production row. The
  // first version of this function read bare numbers only and so never ran
  // against real data: every subject was unscored and the first favourite won.
  it("reads the stored { total, correct, percentage } shape", () => {
    expect(strongestSubject(["Mathematics", "Science", "English"], {
      English: { total: 5, correct: 3, percentage: 60 },
      Science: { total: 5, correct: 1, percentage: 20 },
      Mathematics: { total: 5, correct: 0, percentage: 0 },
    })).toBe("English");
  });

  it("picks the highest quiz score among the favourites", () => {
    expect(strongestSubject(["Mathematics", "Computer Science"], { Mathematics: 80, "Computer Science": 100 }))
      .toBe("Computer Science");
  });

  it("matches a subject id against a subject name", () => {
    expect(strongestSubject(["mathematics", "computer_science"], { Mathematics: 60, "Computer Science": 90 }))
      .toBe("computer_science");
  });

  // THE CONTROLS: without scores, or on a tie, the order chosen still decides,
  // so a student with no quiz is not left with no subject at all.
  it("falls back to the first favourite with no quiz", () => {
    expect(strongestSubject(["Mathematics", "Science"], null)).toBe("Mathematics");
    expect(strongestSubject(["Mathematics", "Science"], {})).toBe("Mathematics");
  });

  it("keeps the first favourite on a tie", () => {
    expect(strongestSubject(["Science", "Mathematics"], { Mathematics: 80, Science: 80 })).toBe("Science");
  });

  it("ignores a high score in a subject they did not choose", () => {
    expect(strongestSubject(["Science"], { Mathematics: 100, Science: 40 })).toBe("Science");
  });

  it("is null with no favourites", () => {
    expect(strongestSubject([], { Mathematics: 100 })).toBeNull();
    expect(strongestSubject(undefined, null)).toBeNull();
  });
});

describe("the grade-12 action steps read as sentences", () => {
  const career: any = {
    title: "Entrepreneur", titleAr: null, category: "Business",
    requiredSkills: ["Leadership", "Finance"],
    educationLevel: "Varies (business education helpful but not required)",
  };
  const steps = generateEnhancedActionSteps({
    assessment: { grade: "grade12", favoriteSubjects: ["Mathematics", "Computer Science"] } as any,
    career, overallScore: 80, language: "en",
    subjectScores: { Mathematics: 80, "Computer Science": 100 },
  }).join("\n");

  it("no longer builds 'Entrepreneur programs' or 'documents for Varies'", () => {
    expect(steps).not.toContain("for Entrepreneur programs");
    expect(steps).not.toContain("documents for Varies");
    expect(steps).not.toContain("**Next Steps:**");
    expect(steps).toContain("**Plan B:**");
  });

  it("names the strongest subject", () => {
    expect(steps).toContain("Computer Science");
    expect(steps).not.toContain("Mathematics");
  });
});

/**
 * The best of a student's favourites can still be a weak score. Seen live
 * 2026-11-14: Science at 20% under "Build on your strength". A measured score
 * under 50% is called a subject they enjoy, not a strength.
 */
describe("a weak best subject is not called a strength", () => {
  const career: any = {
    title: "Dentist", titleAr: null, category: "Healthcare",
    requiredSkills: ["Patient Care", "Precision"], educationLevel: "Dental degree",
  };
  const stepsFor = (subjectScores: any, language = "en") => generateEnhancedActionSteps({
    assessment: { grade: "grade11", favoriteSubjects: ["Mathematics", "Science", "English"] } as any,
    career, overallScore: 80, language, subjectScores,
  }).join("\n");
  const stored = (m: number, s: number, e: number) => ({
    Mathematics: { total: 5, correct: 0, percentage: m },
    Science: { total: 5, correct: 1, percentage: s },
    English: { total: 5, correct: 1, percentage: e },
  });

  it("20% is a subject they enjoy", () => {
    const steps = stepsFor(stored(0, 20, 20));
    expect(steps).toContain("**Build On A Subject You Enjoy:** Keep working at Science");
    expect(steps).not.toContain("Build On Your Strength");
  });

  it("control: 80% is still a strength", () => {
    const steps = stepsFor(stored(0, 80, 20));
    expect(steps).toContain("**Build On Your Strength:** Take Science further");
  });

  it("the boundary: exactly 50% is a strength, 49% is not", () => {
    expect(stepsFor(stored(0, 50, 0))).toContain("Build On Your Strength");
    expect(stepsFor(stored(0, 49, 0))).toContain("Build On A Subject You Enjoy");
  });

  it("no quiz is unknown, not weak", () => {
    expect(stepsFor(null)).toContain("Build On Your Strength");
  });

  it("Arabic says the same", () => {
    expect(stepsFor(stored(0, 20, 20), "ar")).toContain("**ابنِ على مادة تحبها:**");
    expect(stepsFor(stored(0, 80, 20), "ar")).toContain("**ابنِ على نقطة قوتك:**");
  });
});
