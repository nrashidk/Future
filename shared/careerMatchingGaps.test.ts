import { describe, it, expect } from "vitest";
import { careerMatchingGaps } from "./careerMatchingGaps";

describe("careerMatchingGaps", () => {
  it("a seeded career with all three profiles has no gaps (control)", () => {
    expect(careerMatchingGaps({ valuesProfile: { achievement: 70 }, hasPersonalityProfile: true, hasFutureSkillsProfile: true })).toEqual([]);
  });
  it("a career added from the form has all three gaps", () => {
    expect(careerMatchingGaps({ valuesProfile: null, hasPersonalityProfile: false, hasFutureSkillsProfile: false }))
      .toEqual(["personality", "values", "futureSkills"]);
  });
  it("an empty values object counts as missing", () => {
    expect(careerMatchingGaps({ valuesProfile: {}, hasPersonalityProfile: true, hasFutureSkillsProfile: true })).toEqual(["values"]);
  });
});
