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
 *
 * The file has since grown two more end-to-end properties of the same function,
 * because they need this same fake storage: the per-tier match cap, and the
 * tie-break that makes the order reproducible. Header widened rather than the
 * harness duplicated.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {}, pool: {} }));

const { generateRecommendations, compareMatches, MAX_MATCHES_FREE, MAX_MATCHES_PREMIUM } = await import("./matching");

import type { IStorage } from "../storage";

// ---------------------------------------------------------------------------
// Minimal fixtures — one weighted component (subjects at 100%), no country, so
// the vision/sector machinery stays out of the way and the only thing varying
// between careers is futureReadiness.
// ---------------------------------------------------------------------------

// The basic tier's hardcoded weights are subjects 35 / interests 35 / vision 30;
// premium's are subjects 20 / interests 0 / vision 20 / riasec 35 / cvq 25
// (server/services/tierWeights.ts). Every component a tier weights must be
// present or validateComponentWeights throws before the gate is ever reached, so
// all five are listed and hydrateMatchingContext drops the two premium-only ones
// for a 'basic' assessment.
//
// The premium pair carry no data in these fixtures (riasecScores/cvqScores are
// null), so their calculators return null and calculateCareerMatch normalises
// over the applied weight. That is fine here: this file is about WHICH careers
// come back, not what they score.
const COMPONENTS = [
  { id: "comp-subjects", key: "subjects", displayName: "Favourite Subjects", weight: 35, isActive: true, requiresPremium: false },
  { id: "comp-interests", key: "interests", displayName: "Interests", weight: 35, isActive: true, requiresPremium: false },
  { id: "comp-vision", key: "vision", displayName: "National Vision", weight: 30, isActive: true, requiresPremium: false },
  { id: "comp-riasec", key: "riasec", displayName: "RIASEC (Holland Code)", weight: 35, isActive: true, requiresPremium: true },
  { id: "comp-cvq", key: "cvq", displayName: "Personal Values (CVQ)", weight: 25, isActive: true, requiresPremium: true },
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

// Tier matters here beyond weights: generateRecommendations caps the list at
// MAX_MATCHES_FREE (2) for 'basic' and MAX_MATCHES_PREMIUM (5) for 'premium'.
// The gate assertions below need more headroom than the free cap allows — with a
// 2-wide list, "the gate backfills instead of shortening the list" is true
// vacuously — so they run on premium, where the quota is wide enough for the
// property to be observable. The cap itself is pinned separately at the bottom.
function makeStorage(careers: any[], assessmentType: string = "premium"): IStorage {
  return {
    getAssessmentWithCompetencies: async () => ({
      assessment: {
        id: "assessment-1",
        assessmentType,
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
    // Six scoring careers, one of them declining. The gate runs BEFORE the
    // tier slice, so the full premium quota must still come back.
    const careers = [
      career("A", "declining"),
      career("B", "stable"),
      career("C", "growing"),
      career("D", "watch"),
      career("E", "stable"),
      career("F", "growing"),
    ];
    const results = await generateRecommendations(makeStorage(careers), "assessment-1");

    expect(results).toHaveLength(MAX_MATCHES_PREMIUM);
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

/**
 * THE TIER MATCH CAP (L5).
 *
 * Free reports offer two matches, premium five. Free is narrower on purpose: it
 * scores on three signals (subjects / interests / vision), which do not separate
 * the 4th-best career from the 8th with any confidence. Premium adds RIASEC and
 * CVQ, and that extra signal is what earns the wider list.
 */
describe("per-tier match cap in generateRecommendations", () => {
  const SIX = [
    career("A", "stable"),
    career("B", "stable"),
    career("C", "growing"),
    career("D", "growing"),
    career("E", "stable"),
    career("F", "growing"),
  ];

  it("gives a FREE assessment exactly two matches", async () => {
    const results = await generateRecommendations(makeStorage(SIX, "basic"), "assessment-1");
    expect(results).toHaveLength(MAX_MATCHES_FREE);
    expect(MAX_MATCHES_FREE).toBe(2);
  });

  it("gives a PREMIUM assessment five", async () => {
    const results = await generateRecommendations(makeStorage(SIX, "premium"), "assessment-1");
    expect(results).toHaveLength(MAX_MATCHES_PREMIUM);
    expect(MAX_MATCHES_PREMIUM).toBe(5);
  });

  it("returns the HIGHEST scoring matches, not the first N in catalogue order", async () => {
    // The cap must be applied after the sort. Give one career a subject profile
    // nothing else can beat and confirm it survives the 2-wide free cut.
    const strong = career("Best Match", "growing");
    const weak = (title: string) => {
      const c = career(title, "growing");
      c.relatedSubjects = ["Art"]; // no overlap with the student's subjects
      return c;
    };
    const careers = [weak("W1"), weak("W2"), weak("W3"), strong, weak("W4")];
    const results = await generateRecommendations(makeStorage(careers, "basic"), "assessment-1");

    expect(results).toHaveLength(MAX_MATCHES_FREE);
    expect(results[0].career.title).toBe("Best Match");
  });

  it("never returns more than the catalogue holds", async () => {
    const results = await generateRecommendations(
      makeStorage([career("Only One", "stable")], "premium"),
      "assessment-1",
    );
    expect(results).toHaveLength(1);
  });
});

/**
 * THE TIE-BREAK — the property that the same catalogue, in any order, produces
 * the same report.
 *
 * These fixtures are the ideal instrument for it by accident: every career built
 * by career() carries identical relatedSubjects, category and skills, so every
 * one scores IDENTICALLY. The whole catalogue is one tie. Before the second sort
 * key that meant the result was whatever order getAllCareers() happened to
 * return — here the array literal, in production the heap.
 *
 * The shuffle cases are the point. A stable sort with no tie-break passes any
 * single-order test trivially; only re-running the SAME careers in a DIFFERENT
 * input order can tell the two implementations apart.
 */
describe("tie-break in generateRecommendations", () => {
  // Deliberately not alphabetical, and deliberately not Math.random(): a test for
  // determinism that is itself non-deterministic can only fail confusingly. These
  // are fixed permutations of one catalogue.
  const TIED = ["Zoologist", "Architect", "Marine Biologist", "Botanist", "Civil Engineer", "Astronomer"];
  const EXPECTED_FREE = ["Architect", "Astronomer"];

  const permutations = [
    TIED,
    [...TIED].reverse(),
    [TIED[3], TIED[0], TIED[5], TIED[1], TIED[4], TIED[2]],
    [TIED[2], TIED[4], TIED[1], TIED[5], TIED[0], TIED[3]],
  ];

  it("orders an all-tied catalogue by title, ascending", async () => {
    const results = await generateRecommendations(
      makeStorage(TIED.map((t) => career(t, "stable")), "premium"),
      "assessment-1",
    );

    expect(results.map((r) => r.career.title)).toEqual(
      ["Architect", "Astronomer", "Botanist", "Civil Engineer", "Marine Biologist"],
    );
  });

  it("returns the SAME report for every input order of the same catalogue", async () => {
    const runs: string[][] = [];
    for (const order of permutations) {
      const results = await generateRecommendations(
        makeStorage(order.map((t) => career(t, "stable")), "premium"),
        "assessment-1",
      );
      runs.push(results.map((r) => r.career.title));
    }

    // Every run identical — not merely the same SET, the same sequence. A set
    // comparison would pass on a shuffled list and miss the whole defect.
    for (const run of runs) {
      expect(run).toEqual(runs[0]);
    }
    expect(runs[0]).toHaveLength(MAX_MATCHES_PREMIUM);
  });

  it("picks the same two careers for a FREE report regardless of input order", async () => {
    // The sharpest form: the free tier shows two of six equal careers, so four
    // are dropped by the tie-break alone. This is the case where heap order
    // decided what a student never saw.
    for (const order of permutations) {
      const results = await generateRecommendations(
        makeStorage(order.map((t) => career(t, "stable")), "basic"),
        "assessment-1",
      );
      expect(results.map((r) => r.career.title)).toEqual(EXPECTED_FREE);
    }
  });

  it("does NOT let the title outrank the score", async () => {
    // The failure mode of a careless fix: comparing titles first, or comparing
    // them when the scores differ. "Zoologist" sorts last alphabetically and
    // must still come first on score.
    const strong = career("Zoologist", "growing");
    const weak = (title: string) => {
      const c = career(title, "growing");
      c.relatedSubjects = ["Art"]; // no overlap with the student's subjects
      return c;
    };
    const results = await generateRecommendations(
      makeStorage([weak("Architect"), strong, weak("Botanist")], "basic"),
      "assessment-1",
    );

    expect(results[0].career.title).toBe("Zoologist");
  });

  it("compares bytewise, so ordering cannot follow the runtime locale", async () => {
    // localeCompare would place "apiarist" before "Zoologist" under most ICU
    // collations, and the point of the second key is that it cannot depend on
    // which Node build or locale the server happens to run under. Uppercase
    // sorts before lowercase in code-unit order; that is arbitrary, and being
    // arbitrary-but-fixed is the entire property.
    const results = await generateRecommendations(
      makeStorage([career("apiarist", "stable"), career("Zoologist", "stable")], "basic"),
      "assessment-1",
    );

    expect(results.map((r) => r.career.title)).toEqual(["Zoologist", "apiarist"]);
  });
});

/**
 * THE ORDERING KEY IS THE UNROUNDED SCORE — pinned directly on the comparator,
 * because the difference it exists to see is smaller than the fixtures above can
 * express. Two careers 0.04 apart both print 72.1, and no arrangement of
 * relatedSubjects reliably lands two scored careers that close.
 *
 * These cases are the whole argument for carrying overallScoreRaw: without it
 * the first case below resolves alphabetically, which reverses the scorer.
 */
describe("compareMatches orders on the unrounded score", () => {
  const match = (title: string, rounded: number, raw?: number) =>
    ({ career: { title }, overallScore: rounded, overallScoreRaw: raw } as any);

  it("prefers the higher RAW score when both round to the same tenth", () => {
    // Same printed 72.1. "Zoologist" sorts last alphabetically and must still
    // win, because it actually scored higher.
    const a = match("Architect", 72.1, 72.06);
    const z = match("Zoologist", 72.1, 72.14);

    expect([a, z].sort(compareMatches).map((m) => m.career.title)).toEqual(["Zoologist", "Architect"]);
    expect([z, a].sort(compareMatches).map((m) => m.career.title)).toEqual(["Zoologist", "Architect"]);
  });

  it("falls back to the title only when the RAW scores are genuinely equal", () => {
    const z = match("Zoologist", 72.1, 72.1);
    const a = match("Architect", 72.1, 72.1);

    expect([z, a].sort(compareMatches).map((m) => m.career.title)).toEqual(["Architect", "Zoologist"]);
  });

  it("uses the rounded score when no raw score is present, rather than NaN", () => {
    // A CareerMatch built by hand — a test double, or a caller that predates the
    // field. Reading undefined into arithmetic gives NaN, and a NaN comparator
    // does not throw: it silently returns an arbitrary order, which is the exact
    // failure this comparator exists to remove.
    const high = match("Zoologist", 80);
    const low = match("Architect", 60);

    expect([low, high].sort(compareMatches).map((m) => m.career.title)).toEqual(["Zoologist", "Architect"]);
  });

  it("still ranks a real score gap above the title", () => {
    const strong = match("Zoologist", 90, 90.4);
    const weak = match("Architect", 60, 60.2);

    expect([weak, strong].sort(compareMatches).map((m) => m.career.title)).toEqual(["Zoologist", "Architect"]);
  });
});
