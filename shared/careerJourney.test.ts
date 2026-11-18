import { describe, it, expect } from "vitest";
import { countConsistentCareers, journeyGrades } from "./careerJourney";

describe("countConsistentCareers", () => {
  it("does not count a career seen once out of two grades (the live 5)", () => {
    const t = [
      { gradesAppeared: ["grade11", "grade12"], persistenceScore: 1 },
      { gradesAppeared: ["grade11"], persistenceScore: 0.5 },
      { gradesAppeared: ["grade12"], persistenceScore: 0.5 },
      { gradesAppeared: ["grade12"], persistenceScore: 0.5 },
      { gradesAppeared: ["grade11"], persistenceScore: 0.5 },
    ];
    expect(countConsistentCareers(t)).toBe(1);
  });
  it("needs at least half as well as two grades", () => {
    expect(countConsistentCareers([{ gradesAppeared: ["grade9", "grade10"], persistenceScore: 0.4 }])).toBe(0);
    expect(countConsistentCareers([{ gradesAppeared: ["grade9", "grade10"], persistenceScore: 0.5 }])).toBe(1);
  });
  it("treats legacy and canonical spellings of one grade as one grade", () => {
    expect(countConsistentCareers([{ gradesAppeared: ["11", "grade11"], persistenceScore: 1 }])).toBe(0);
  });
});

describe("journeyGrades", () => {
  it("starts at the first assessed grade", () => {
    expect(journeyGrades(["grade11", "grade12"])).toEqual(["grade11", "grade12"]);
  });
  it("keeps later grades still to come", () => {
    expect(journeyGrades(["grade9", "10"])).toEqual(["grade9", "grade10", "grade11", "grade12"]);
  });
  it("shows graduated only with data", () => {
    expect(journeyGrades(["grade12", "graduated"])).toEqual(["grade12", "graduated"]);
  });
  it("falls back to every school grade with nothing assessed", () => {
    expect(journeyGrades([])).toEqual(["grade8", "grade9", "grade10", "grade11", "grade12"]);
  });
});
