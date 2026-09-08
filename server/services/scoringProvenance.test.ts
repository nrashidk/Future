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
  SCORING_ALGORITHM_VERSION,
  type MatchingContext,
} from "./matching";
import type { AssessmentComponent, Career } from "../../shared/schema";

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
    jobMarketTrends: new Map(),
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

  it("SCORING_ALGORITHM_VERSION is a positive integer that only ever moves forward", () => {
    expect(Number.isInteger(SCORING_ALGORITHM_VERSION)).toBe(true);
    // 3 is the first recorded version (2026-09-08). A lower value means someone
    // reused a number that a stored row may already carry.
    expect(SCORING_ALGORITHM_VERSION).toBeGreaterThanOrEqual(3);
  });
});
