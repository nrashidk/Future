import { describe, it, expect } from "vitest";
import { strongestSubject, generateEnhancedActionSteps } from "./premiumNarratives";

/**
 * "Build on your strength" named the FIRST favourite ticked, not the one the
 * quiz showed to be strongest. Seen on a live report 2026-11-12: Mathematics
 * (80%) named over Computer Science (100%).
 */
describe("strongestSubject", () => {
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
