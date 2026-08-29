/**
 * WEF Skills Calculator — unit smoke tests.
 *
 * These guard the four input-unit bugs that were silently corrupting the stored
 * wef_competency_results profile (minors' data). Each assertion names the value it
 * would have produced before the fix.
 */

import { describe, it, expect } from "vitest";
import { calculateWEFSkills } from "./wefSkillsCalculator";

describe("calculateWEFSkills — input unit contracts", () => {
  it("treats CVQ scores as already 0-100 (was ~24.75x: 80 -> 1975)", () => {
    const profile = calculateWEFSkills({ cvqScores: { achievement: 80 } });

    expect(profile.scores.length).toBeGreaterThan(0);
    for (const skill of profile.scores) {
      expect(skill.score).toBeGreaterThanOrEqual(0);
      expect(skill.score).toBeLessThanOrEqual(100);
    }
    // Single source at identity: every mapped skill is the input itself.
    expect(profile.scores.every((s) => s.score === 80)).toBe(true);
  });

  it("maps RIASEC letter keys and treats them as 0-100 (was dead, then 100x)", () => {
    const profile = calculateWEFSkills({
      riasecScores: {
        R: 90, I: 70, A: 40, S: 50, E: 60, C: 30,
        top3: ["R"], ranking: ["R"],
      } as any,
    });

    const ict = profile.scores.find((s) => s.skillName === "ICT Literacy");
    expect(ict).toBeDefined();
    expect(ict!.score).toBeGreaterThanOrEqual(0);
    expect(ict!.score).toBeLessThanOrEqual(100);
    // The non-numeric top3 / ranking entries must not become sources.
    expect(
      profile.scores.every((s) =>
        s.sources.every((src) => src.component !== "top3" && src.component !== "ranking")
      )
    ).toBe(true);
  });

  it("produces finite scores from subject percentages, flattened or raw (was NaN)", () => {
    const flattened = calculateWEFSkills({ subjectScores: { Mathematics: 80 } });

    const numeracy = flattened.scores.find((s) => s.skillName === "Numeracy");
    expect(numeracy).toBeDefined();
    expect(numeracy!.score).toBe(80);
    expect(Number.isFinite(flattened.overallReadiness)).toBe(true);

    // The un-flattened shape the extractor used to pass straight through:
    // `object * weight` made every score NaN. The guard must reject it outright
    // rather than emit NaN.
    const rawObjects = calculateWEFSkills({
      subjectScores: { Mathematics: { correct: 8, total: 10, percentage: 80 } },
    } as any);
    for (const skill of rawObjects.scores) {
      expect(Number.isFinite(skill.score)).toBe(true);
    }
    expect(Number.isFinite(rawObjects.overallReadiness)).toBe(true);
  });

  it("never emits a score outside 0-100, even on a malformed input contract", () => {
    const profile = calculateWEFSkills({
      cvqScores: { achievement: 100000, benevolence: -500 },
      // The pre-fix shape the extractor used to pass straight through.
      subjectScores: { Mathematics: { correct: 8, total: 10, percentage: 80 } } as any,
    });

    for (const skill of profile.scores) {
      expect(Number.isFinite(skill.score)).toBe(true);
      expect(skill.score).toBeGreaterThanOrEqual(0);
      expect(skill.score).toBeLessThanOrEqual(100);
    }
    expect(Number.isFinite(profile.overallReadiness)).toBe(true);
  });
});
