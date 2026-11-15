import { describe, it, expect } from "vitest";
import { strengthSubjects, STRENGTH_THRESHOLD } from "./subjectStrength";

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
