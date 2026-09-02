/**
 * THE FUTURE-READINESS GATE, end to end through generateRecommendations.
 *
 * Two things are pinned here:
 *
 *   1. The gate actually removes a 'declining' career from the recommendation
 *      list, and backfills from the next-ranked career rather than returning a
 *      shorter list.
 *   2. It removes NOTHING from a catalogue that looks like today's — the 'watch'
 *      careers (Journalist, both teachers, Nuclear Engineer, Graphic Designer)
 *      must all still be recommendable. A regression that turned 'watch' into a
 *      gating state would silently delete two school-teacher careers from a
 *      product sold to schools.
 *
 * The gate runs against real scored matches, so it also proves the placement:
 * filtering happens after calculateCareerMatch, so no career's score is
 * perturbed by which other careers are present.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {}, pool: {} }));

const { generateRecommendations } = await import("./matching");

import type { IStorage } from "../storage";

// ---------------------------------------------------------------------------
// Minimal fixtures — one weighted component (subjects at 100%), no country, so
// the vision/sector machinery stays out of the way and the only thing varying
// between careers is futureReadiness.
// ---------------------------------------------------------------------------

// The basic tier's hardcoded weights are subjects 35 / interests 35 / vision 30
// (server/services/tierWeights.ts). All three must be present or
// validateComponentWeights throws before the gate is ever reached.
const COMPONENTS = [
  { id: "comp-subjects", key: "subjects", displayName: "Favourite Subjects", weight: 35, isActive: true, requiresPremium: false },
  { id: "comp-interests", key: "interests", displayName: "Interests", weight: 35, isActive: true, requiresPremium: false },
  { id: "comp-vision", key: "vision", displayName: "National Vision", weight: 30, isActive: true, requiresPremium: false },
];

function career(title: string, futureReadiness: string) {
  return {
    id: `career-${title.toLowerCase().replace(/\W+/g, "-")}`,
    title,
    description: `${title} description`,
    category: "Technology",
    requiredSkills: ["Skill"],
    relatedSubjects: ["Mathematics", "Science", "Computer Science"],
    educationLevel: "Bachelor's degree",
    growthOutlook: "Good — 3–4% growth",
    onetGrowthBand: "average",
    onetGrowthSource: null,
    futureReadiness,
    futureReadinessSource: null,
    countryId: null,
    valuesProfile: null,
    onetCode: "15-1299.08",
    icon: null,
    titleAr: null,
    descriptionAr: null,
    requiredSkillsAr: null,
    educationLevelAr: null,
    averageSalary: null,
    createdAt: new Date(),
  } as any;
}

function makeStorage(careers: any[]): IStorage {
  return {
    getAssessmentWithCompetencies: async () => ({
      assessment: {
        id: "assessment-1",
        assessmentType: "basic",
        countryId: null,
        favoriteSubjects: ["Mathematics", "Science", "Computer Science"],
        interests: ["Technology"],
        riasecScores: null,
        cvqScores: null,
        careerAspirations: null,
      },
      competencyScores: {},
    }),
    getAllCareers: async () => careers,
    getAllAssessmentComponents: async () => COMPONENTS,
    getAllScoringTiers: async () => [],
    getAllTierComponentWeights: async () => [],
    getCareerAffinitiesBulk: async () => [],
    getJobTrendsByCareerIds: async () => [],
    getCountryById: async () => undefined,
    getSectorCategoryMap: async () => [],
  } as unknown as IStorage;
}

describe("future-readiness gate in generateRecommendations", () => {
  it("EXCLUDES a career marked declining", async () => {
    const careers = [
      career("Kept Career", "stable"),
      career("Dying Career", "declining"),
    ];
    const results = await generateRecommendations(makeStorage(careers), "assessment-1");
    const titles = results.map((r) => r.career.title);

    expect(titles).toContain("Kept Career");
    expect(titles).not.toContain("Dying Career");
  });

  it("backfills from the next career rather than returning a shorter list", async () => {
    // Six scoring careers, one of them declining. The gate runs BEFORE
    // .slice(0, 5), so five must still come back.
    const careers = [
      career("A", "declining"),
      career("B", "stable"),
      career("C", "growing"),
      career("D", "watch"),
      career("E", "stable"),
      career("F", "growing"),
    ];
    const results = await generateRecommendations(makeStorage(careers), "assessment-1");

    expect(results).toHaveLength(5);
    expect(results.map((r) => r.career.title)).not.toContain("A");
  });

  it("does NOT gate 'watch' — the single-source-decline careers stay recommendable", async () => {
    // The five real watch careers. If any of these disappears, the strict AND
    // rule has been broken somewhere.
    const careers = [
      career("Journalist", "watch"),
      career("Nuclear Engineer", "watch"),
      career("Primary School Teacher", "watch"),
      career("Teacher (Secondary Education)", "watch"),
      career("Graphic Designer", "watch"),
    ];
    const results = await generateRecommendations(makeStorage(careers), "assessment-1");

    expect(results.map((r) => r.career.title).sort()).toEqual(
      ["Graphic Designer", "Journalist", "Nuclear Engineer", "Primary School Teacher", "Teacher (Secondary Education)"],
    );
  });

  it("gates nothing when no career is declining — today's catalogue is a no-op", async () => {
    const careers = [
      career("Software Engineer", "growing"),
      career("Architect", "stable"),
      career("Journalist", "watch"),
    ];
    const before = careers.length;
    const results = await generateRecommendations(makeStorage(careers), "assessment-1");

    expect(results).toHaveLength(before);
  });

  it("keeps careers whose readiness is missing or unrecognised (fails safe)", async () => {
    const careers = [
      career("No Verdict", null as any),
      career("Weird Verdict", "something-else"),
    ];
    const results = await generateRecommendations(makeStorage(careers), "assessment-1");

    expect(results.map((r) => r.career.title).sort()).toEqual(["No Verdict", "Weird Verdict"]);
  });
});
