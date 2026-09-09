/**
 * Pins the student/operator boundary on a `recommendations` row.
 *
 * The leak this guards against was not a wrong line of code — it was an absent
 * one. `storage.getRecommendationsByAssessment` selects the whole row and the
 * handlers answered with `{ ...rec }`, so a column added to the table reached
 * every student automatically, with nothing in the diff to notice. These tests
 * fail on the shape of the OUTPUT rather than on the implementation, so they
 * still bite if someone reintroduces a spread further down a handler.
 */

import { describe, it, expect } from "vitest";
import {
  toClientRecommendation,
  toClientRecommendations,
  toClientCareerMatch,
  OPERATOR_ONLY_RECOMMENDATION_FIELDS,
} from "./recommendationView";
import type { Recommendation } from "@shared/schema";

/** A row shaped like the real one, including every student-facing column. */
function row(overrides: Partial<Recommendation> = {}): Recommendation {
  return {
    id: "rec-1",
    assessmentId: "assess-1",
    careerId: "career-1",
    overallMatchScore: 82.5,
    subjectMatchScore: 100,
    interestMatchScore: 60,
    countryVisionAlignment: 70,
    futureMarketDemand: 0,
    componentBreakdown: [{ key: "subjects", displayName: "Subjects", score: 100, weight: 20 }],
    scoringProvenance: {
      algorithm: 3,
      configHash: "c3ViamVjdHM6MjB8",
      tier: "premium",
      scoredAt: "2026-09-08",
    },
    reasoning: "Subjects (20%): 100.0% - matched",
    actionSteps: ["Complete a Bachelor's degree"],
    requiredEducation: "Bachelor's degree",
    createdAt: new Date("2026-09-08T00:00:00Z"),
    ...overrides,
  } as unknown as Recommendation;
}

describe("toClientRecommendation", () => {
  it("removes every operator-only column", () => {
    const out = toClientRecommendation(row()) as Record<string, unknown>;
    for (const field of OPERATOR_ONLY_RECOMMENDATION_FIELDS) {
      expect(
        field in out,
        `${field} is operator-only and must not reach the student. ` +
          `See server/utils/recommendationView.ts.`,
      ).toBe(false);
    }
  });

  it("keeps every student-facing column, so stripping cannot blank the report", () => {
    const input = row();
    const out = toClientRecommendation(input) as Record<string, unknown>;
    const expected = Object.keys(input).filter(
      (k) => !(OPERATOR_ONLY_RECOMMENDATION_FIELDS as readonly string[]).includes(k),
    );
    expect(Object.keys(out).sort()).toEqual(expected.sort());
    // The fields the report is actually built from, named explicitly: a helper
    // that dropped one of these would still pass the key-count check above if
    // the fixture drifted.
    expect(out.reasoning).toBe(input.reasoning);
    expect(out.componentBreakdown).toEqual(input.componentBreakdown);
    expect(out.overallMatchScore).toBe(input.overallMatchScore);
    expect(out.actionSteps).toEqual(input.actionSteps);
  });

  it("does not mutate the input — callers still read the row afterwards", () => {
    const input = row();
    toClientRecommendation(input);
    expect(input.scoringProvenance).not.toBeUndefined();
  });

  it("survives a row that already has a null provenance (legacy, never backfilled)", () => {
    const out = toClientRecommendation(row({ scoringProvenance: null })) as Record<string, unknown>;
    expect("scoringProvenance" in out).toBe(false);
  });

  it("strips across an array", () => {
    const out = toClientRecommendations([row(), row({ id: "rec-2" })]);
    expect(out).toHaveLength(2);
    for (const r of out as Record<string, unknown>[]) {
      expect("scoringProvenance" in r).toBe(false);
    }
  });

  it("a spread of the stripped row cannot reintroduce the field", () => {
    // This is the shape the GET handler actually answers with.
    const enriched = { ...toClientRecommendation(row()), career: { id: "career-1" } };
    expect("scoringProvenance" in enriched).toBe(false);
  });
});

describe("toClientCareerMatch", () => {
  it("removes BOTH names the same string travels under", () => {
    const match = {
      career: { id: "career-1" },
      overallScore: 82.5,
      componentScores: [{ key: "subjects", score: 100, weight: 20 }],
      appliedConfigVersion: "c3ViamVjdHM6MjB8",
      scoringProvenance: { algorithm: 3, configHash: "c3ViamVjdHM6MjB8", tier: "premium", scoredAt: "2026-09-08" },
    };
    const out = toClientCareerMatch(match) as Record<string, unknown>;
    expect("scoringProvenance" in out).toBe(false);
    expect(
      "appliedConfigVersion" in out,
      "appliedConfigVersion is the SAME string as provenance.configHash — " +
        "stripping only one leaves the weight table in the response.",
    ).toBe(false);
    // Everything the response is for is untouched.
    expect(out.overallScore).toBe(82.5);
    expect(out.componentScores).toEqual(match.componentScores);
    expect(out.career).toEqual(match.career);
  });
});
