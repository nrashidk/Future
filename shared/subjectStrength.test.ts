import { describe, it, expect } from "vitest";
import { strengthSubjects, STRENGTH_THRESHOLD, describeFavouriteSubjects } from "./subjectStrength";

describe("strengthSubjects", () => {
  it("calls nothing a strength when every score is below the threshold (the live report)", () => {
    expect(strengthSubjects({ English: { percentage: 20 }, Science: { percentage: 20 }, Mathematics: { percentage: 0 } })).toEqual([]);
  });
  it("keeps only subjects at or above the threshold, best first, two at most", () => {
    expect(strengthSubjects({ A: { percentage: 49 }, B: { percentage: 50 }, C: { percentage: 100 }, D: { percentage: 80 } }))
      .toEqual(["C", "D"]);
  });
  it("the boundary: 50 is a strength, 49 is not", () => {
    expect(STRENGTH_THRESHOLD).toBe(50);
    expect(strengthSubjects({ X: { percentage: 50 } })).toEqual(["X"]);
    expect(strengthSubjects({ X: { percentage: 49 } })).toEqual([]);
  });
  it("ignores missing or malformed scores rather than treating them as zero or as a strength", () => {
    expect(strengthSubjects({ X: null, Y: {}, Z: { percentage: 90 } })).toEqual(["Z"]);
    expect(strengthSubjects(null)).toEqual([]);
  });
});

describe("describeFavouriteSubjects (what the AI narrative prompt is told)", () => {
  it("marks a 20% favourite as NOT a strength, in the stored quiz shape (the live report)", () => {
    const out = describeFavouriteSubjects(["Mathematics", "Computer Science"], {
      Mathematics: { total: 5, correct: 1, percentage: 20 },
      "Computer Science": { total: 5, correct: 1, percentage: 20 },
    });
    expect(out[0]).toBe("Mathematics (quiz score 20%, NOT yet a strength; do not call it one)");
    expect(out[1]).toContain("Computer Science (quiz score 20%, NOT yet");
  });
  it("CONTROL: a score at the threshold is called a strength", () => {
    expect(describeFavouriteSubjects(["Science"], { Science: { percentage: 50 } }))
      .toEqual(["Science (quiz score 50%, a strength)"]);
  });
  it("an unscored favourite, or no quiz at all, is left bare (unknown is not weak)", () => {
    expect(describeFavouriteSubjects(["Arabic", "Science"], { Science: { percentage: 80 } }))
      .toEqual(["Arabic", "Science (quiz score 80%, a strength)"]);
    expect(describeFavouriteSubjects(["Arabic"], null)).toEqual(["Arabic"]);
  });
});
