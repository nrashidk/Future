import { describe, it, expect } from "vitest";
import { careerMatchingGaps } from "./careerMatchingGaps";

describe("careerMatchingGaps", () => {
  it("a seeded career with all three profiles has no gaps (control)", () => {
    expect(careerMatchingGaps({ valuesProfile: { achievement: 70 }, hasPersonalityProfile: true, hasFutureSkillsProfile: true, hasSectorPlacement: true })).toEqual([]);
  });
  it("a career added from the form has all three gaps", () => {
    expect(careerMatchingGaps({ valuesProfile: null, hasPersonalityProfile: false, hasFutureSkillsProfile: false, hasSectorPlacement: false }))
      .toEqual(["personality", "values", "futureSkills", "sectorPlacement"]);
  });
  it("placement alone missing is reported alone", () => {
    expect(careerMatchingGaps({ valuesProfile: { a: 1 }, hasPersonalityProfile: true, hasFutureSkillsProfile: true, hasSectorPlacement: false })).toEqual(["sectorPlacement"]);
  });
  it("an empty values object counts as missing", () => {
    expect(careerMatchingGaps({ valuesProfile: {}, hasPersonalityProfile: true, hasFutureSkillsProfile: true, hasSectorPlacement: true })).toEqual(["values"]);
  });
});
