/**
 * GOLDEN SCORING FIXTURES — a change detector, not a correctness assertion.
 *
 * These two are different tools and this file is deliberately the second kind.
 * server/services/subjectsScore.test.ts asserts that the scorer produces the
 * RIGHT answers; it was written by 221d496 ("Piece D", 2026-08-31) and it
 * asserts that commit's new numbers. It could not have caught what that commit
 * actually did, because it was written after the decision: Piece D changed a
 * denominator, silently re-based the subjects score for every pre-existing
 * assessment, and nothing recorded that two students with identical answers now
 * get different numbers depending on when their report was last generated.
 *
 * This file exists so that cannot happen unnoticed again. It pins a small table
 * of (student subjects x career tags) -> score. Change any calculator in a way
 * that moves a score and these fail, with a message that states the rule rather
 * than assuming the reader knows it.
 *
 * THE FIXTURES' PROOF OF WORK. Five of the six below were verified to produce
 * DIFFERENT scores under the pre-Piece-D algorithm (raw-string tag match, raw
 * tag count as denominator) than under today's. Measured, not assumed:
 *
 *   fixture                                        pre-221d496   today
 *   A  business student vs Business-tagged career        66.7     50.0
 *   B  health cluster (the case Piece D fixed)           20.0    100.0
 *   C  raw tag count != normalized count (dedupe)        50.0    100.0
 *   D  art-axis career, tags project to empty            33.3     20.0
 *   E  competency blend over a normalized match          20.0     88.0
 *   F  control: student-side value never normalized      20.0     20.0  (same)
 *
 * F is deliberately unchanged and is the one that documents a gap that is still
 * open: the STUDENT side is not normalized at read time, so a stored "Physics"
 * never meets a career's normalized "Science". It is here so that if someone
 * ever closes that gap, this file notices.
 */

import { describe, it, expect } from "vitest";
import {
  calculateSubjectsScore,
  calculateVisionScore,
  SCORING_ALGORITHM_VERSION,
  type MatchingContext,
  type SectorCategoryMap,
  type SectorWefSkillMap,
} from "./matching";
import type { AssessmentComponent, Career, Country } from "../../shared/schema";

const COMPONENT = { key: "subjects", weight: 25 } as unknown as AssessmentComponent;

function career(relatedSubjects: string[]): Career {
  return { id: "fixture", title: "fixture", relatedSubjects } as unknown as Career;
}

function context(
  favoriteSubjects: string[],
  competencyScores?: Record<string, number>,
): MatchingContext {
  return {
    assessment: { assessmentType: "premium", favoriteSubjects },
    careers: [],
    activeComponents: [COMPONENT],
    careerAffinities: new Map(),
    competencyScores,
  } as unknown as MatchingContext;
}

interface Fixture {
  id: string;
  what: string;
  subjects: string[];
  tags: string[];
  competency?: Record<string, number>;
  /** Locked score. Moving this REQUIRES bumping SCORING_ALGORITHM_VERSION. */
  expected: number;
  /** Score the pre-221d496 algorithm gave, so the proof of work stays checkable. */
  prePieceD: number;
}

const GOLDEN: Fixture[] = [
  {
    id: "A",
    what: "student subject that self-maps on their side but is dropped on the career side",
    subjects: ["Business", "Mathematics"],
    tags: ["Business", "Economics", "Mathematics"],
    expected: 50,
    prePieceD: 66.7,
  },
  {
    id: "B",
    what: "health cluster — career tags collapse to one umbrella subject",
    subjects: ["Science"],
    tags: ["Biology", "Chemistry", "Health Science"],
    expected: 100,
    prePieceD: 20,
  },
  {
    id: "C",
    what: "raw tag count differs from normalized count (Statistics folds into Mathematics)",
    subjects: ["Mathematics"],
    tags: ["Mathematics", "Statistics"],
    expected: 100,
    prePieceD: 50,
  },
  {
    id: "D",
    what: "career whose tags project to nothing — the flat-20 floor",
    subjects: ["Art", "English"],
    tags: ["Art", "Design", "Business"],
    expected: 20,
    prePieceD: 33.3,
  },
  {
    id: "E",
    what: "competency blend (40/60) over a normalized match",
    subjects: ["Science"],
    tags: ["Biology", "Chemistry", "Health Science"],
    competency: { Science: 80 },
    expected: 88,
    prePieceD: 20,
  },
  {
    id: "F",
    what: "CONTROL — student side is not normalized, so Physics never meets Science",
    subjects: ["Physics"],
    tags: ["Biology", "Chemistry", "Health Science"],
    expected: 20,
    prePieceD: 20,
  },
];

// ---------------------------------------------------------------------------
// VISION FIXTURES — added 2026-09-10 with SCORING_ALGORITHM_VERSION 4.
//
// WHY THEY DID NOT EXIST, which is the more useful half. Until this commit this
// file pinned SIX fixtures and all six were calculateSubjectsScore. The rule
// stated in matching.ts is "bump SCORING_ALGORITHM_VERSION when the golden
// fixtures move" — and the vision saturation defect, which collapsed 27 of 68
// careers onto a single relevance and gave five different space careers the same
// 99.0, moved NOT ONE of them. The change detector was pointed at one of five
// calculators, and the defect landed in one of the other four.
//
// interests, riasec and cvq still have no fixtures. For those three the bump
// rule remains unenforceable and a scoring change to them will pass this file in
// silence. That is a known, recorded gap, not an oversight — see FOLLOWUP.md.
//
// THE FIXTURES' PROOF OF WORK, same shape as the subjects table above: five of
// the six produce a DIFFERENT score under the pre-version-4 algorithm (additive
// swing onto raw relevance, clamped at 100; alignment band ±12).
//
//   fixture                                        pre-v4    today
//   V1 seeded 85, perfect fit                       100.0     93.7
//   V2 seeded 95, perfect fit                       100.0     97.9
//   V3 seeded 85, catalog-average fit                91.0     84.7
//   V4 seeded 95, catalog-average fit                97.0     88.9
//   V5 seeded 100, perfect fit — CONTROL            100.0    100.0  (same)
//   V6 seeded 100, no skill data                    100.0     91.0
//
// V1 and V2 are the pair this file exists for. Pre-v4 they are BOTH 100.0: two
// careers the seed deliberately separated by ten relevance points, scoring
// identically. A fixture table containing them would have failed on the day the
// saturation shipped. V5 is the control that shows the ceiling was not simply
// lowered — 100 is still reachable, but now only by a career that is both
// maximally seeded AND maximally aligned, which no real career is.
// ---------------------------------------------------------------------------

const VISION_COMPONENT = { key: "vision", weight: 30 } as unknown as AssessmentComponent;
const SECTOR_ID = "sector-fixture";
const SKILL_ID = "skill-fixture";
/** Catalog mean for the single synthetic skill. Alignment is centred on this. */
const SKILL_MEAN = 50;

/**
 * One sector, so rankFactor is 1 and score reduces to 40 + 0.6 * relevance.
 *
 * `affinity` drives the alignment: raw = affinity - SKILL_MEAN, and
 * alignment = (raw - LO) / (HI - LO). So affinity 66 => raw +16 => alignment 1.0
 * under the current ±16 band (and >1, clamped to 1.0, under the old ±12 one —
 * which is what makes the pre-v4 column above directly comparable). affinity 50
 * => raw 0 => alignment 0.5, exactly catalog-average.
 */
function visionContext(relevance: number, affinity: number | null): MatchingContext {
  const sectorCategoryMap: SectorCategoryMap = {
    sectors: new Map([[SECTOR_ID, { name: "Fixture Sector", rankFactor: 1 }]]),
    byCategory: new Map([["fixture", [{ sectorId: SECTOR_ID, relevance }]]]),
    byCareer: new Map(),
  };
  const careerWefAffinities = affinity === null
    ? undefined
    : new Map([["fixture", [{ wefSkillId: SKILL_ID, affinityScore: affinity }]]]);
  const sectorWefSkillMap: SectorWefSkillMap | undefined = affinity === null
    ? undefined
    : {
        bySector: new Map([[SECTOR_ID, [{ wefSkillId: SKILL_ID, importance: 100 }]]]),
        catalogMeans: new Map([[SKILL_ID, SKILL_MEAN]]),
      };

  return {
    assessment: { assessmentType: "basic" },
    careers: [],
    activeComponents: [VISION_COMPONENT],
    careerAffinities: new Map(),
    userCountry: { name: "Fixture Country" } as unknown as Country,
    sectorCategoryMap,
    sectorWefSkillMap,
    careerWefAffinities,
  } as unknown as MatchingContext;
}

const visionCareer = { id: "fixture", title: "fixture", category: "Fixture" } as unknown as Career;

interface VisionFixture {
  id: string;
  what: string;
  /** Seeded relevance, as a country_sector_categories row states it. */
  relevance: number;
  /** Career affinity for the single synthetic skill; null = no skill data at all. */
  affinity: number | null;
  /** Locked score. Moving this REQUIRES bumping SCORING_ALGORITHM_VERSION. */
  expected: number;
  /** Score the pre-version-4 algorithm gave, so the proof of work stays checkable. */
  preV4: number;
}

const GOLDEN_VISION: VisionFixture[] = [
  {
    id: "V1",
    what: "seeded 85 with perfect fit — half of the pair that used to collapse",
    relevance: 85,
    affinity: 66,
    expected: 93.7,
    preV4: 100,
  },
  {
    id: "V2",
    what: "seeded 95 with perfect fit — the other half; ten seeded points must survive",
    relevance: 95,
    affinity: 66,
    expected: 97.9,
    preV4: 100,
  },
  {
    id: "V3",
    what: "seeded 85 at catalog-average fit — the rebase, with no modulation applied",
    relevance: 85,
    affinity: SKILL_MEAN,
    expected: 84.7,
    preV4: 91,
  },
  {
    id: "V4",
    what: "seeded 95 at catalog-average fit",
    relevance: 95,
    affinity: SKILL_MEAN,
    expected: 88.9,
    preV4: 97,
  },
  {
    id: "V5",
    what: "CONTROL — 100 is still reachable, by maximal membership AND maximal fit",
    relevance: 100,
    affinity: 66,
    expected: 100,
    preV4: 100,
  },
  {
    id: "V6",
    what: "no skill data — degrades to the rebased membership, not to the raw seeded value",
    relevance: 100,
    affinity: null,
    expected: 91,
    preV4: 100,
  },
];

const RULE =
  "\n\n  A golden scoring fixture moved." +
  "\n  If you changed a calculator on purpose: bump SCORING_ALGORITHM_VERSION in" +
  "\n  server/services/matching.ts and update the fixtures in the SAME commit." +
  "\n  If you did not: you have changed scoring by accident — every report" +
  "\n  generated from now on will disagree with every report already stored." +
  `\n  Current SCORING_ALGORITHM_VERSION = ${SCORING_ALGORITHM_VERSION}.\n`;

describe("golden scoring fixtures", () => {
  for (const f of GOLDEN) {
    it(`[${f.id}] ${f.what}`, () => {
      const actual = calculateSubjectsScore(
        context(f.subjects, f.competency),
        career(f.tags),
        COMPONENT,
      )?.score;
      expect(
        actual !== undefined ? Math.round(actual * 10) / 10 : actual,
        `fixture ${f.id} (${f.what})${RULE}`,
      ).toBe(f.expected);
    });
  }

  it("the fixtures would have caught 221d496 — five of six move across it", () => {
    // The test's own proof of work. If someone reduces this set to fixtures that
    // agree with the pre-Piece-D algorithm, the suite would still pass while
    // detecting nothing, so the count is pinned rather than left implicit.
    const movers = GOLDEN.filter((f) => Math.abs(f.expected - f.prePieceD) > 0.05);
    expect(
      movers.length,
      "Fixtures must include cases that DIFFER under the pre-221d496 algorithm, " +
        "otherwise this file cannot detect the class of change it exists for.",
    ).toBe(5);
    expect(movers.map((f) => f.id)).toEqual(["A", "B", "C", "D", "E"]);
  });

  for (const f of GOLDEN_VISION) {
    it(`[${f.id}] ${f.what}`, () => {
      const actual = calculateVisionScore(
        visionContext(f.relevance, f.affinity),
        visionCareer,
        VISION_COMPONENT,
      )?.score;
      expect(
        actual !== undefined ? Math.round(actual * 10) / 10 : actual,
        `fixture ${f.id} (${f.what})${RULE}`,
      ).toBe(f.expected);
    });
  }

  it("[V1/V2] two careers ten seeded relevance points apart do not score the same", () => {
    // THE REGRESSION. Under version 3 these were both 100.0 — a career the seed
    // pitched at 85 ("the claim is a research one", server/seed.ts:256) and one
    // pitched at 95 ("the research half of the sector", :224) reached the student
    // as one number. Asserted separately from the table because a table can be
    // edited into agreement without anyone noticing what was lost.
    const [v1, v2] = ["V1", "V2"].map((id) => {
      const f = GOLDEN_VISION.find((g) => g.id === id)!;
      return calculateVisionScore(
        visionContext(f.relevance, f.affinity),
        visionCareer,
        VISION_COMPONENT,
      )!.score;
    });
    expect(v1).not.toBe(v2);
    expect(v2).toBeGreaterThan(v1); // and in the direction the seed asked for
  });

  it("the vision fixtures would have caught the saturation — five of six move across version 4", () => {
    // Same proof of work as the subjects assertion above. A vision table whose
    // fixtures all agree with the pre-v4 algorithm would pass forever while
    // detecting nothing, so the count is pinned rather than left implicit.
    const movers = GOLDEN_VISION.filter((f) => Math.abs(f.expected - f.preV4) > 0.05);
    expect(
      movers.length,
      "Vision fixtures must include cases that DIFFER under the pre-version-4 " +
        "algorithm, otherwise this file cannot detect the class of change it exists for.",
    ).toBe(5);
    expect(movers.map((f) => f.id)).toEqual(["V1", "V2", "V3", "V4", "V6"]);
  });

  it("RECORDED GAP — three of the five calculators still have no fixtures", () => {
    // Not an assertion about scoring; an assertion about this file's coverage, so
    // that "the golden fixtures did not move" keeps meaning something. subjects
    // and vision are covered. interests, riasec and cvq are not: a change to any
    // of them moves no fixture here and the bump rule cannot be enforced for it.
    // When one gains fixtures, shorten this list in the same commit.
    const UNCOVERED = ["interests", "riasec", "cvq"];
    expect(UNCOVERED).toEqual(["interests", "riasec", "cvq"]);
  });

  it("SCORING_ALGORITHM_VERSION is a positive integer that only ever moves forward", () => {
    expect(Number.isInteger(SCORING_ALGORITHM_VERSION)).toBe(true);
    // 3 is the first recorded version (2026-09-08). A lower value means someone
    // reused a number that a stored row may already carry.
    expect(SCORING_ALGORITHM_VERSION).toBeGreaterThanOrEqual(3);
  });
});
