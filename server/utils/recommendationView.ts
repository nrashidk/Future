/**
 * The client-facing shape of a scored recommendation.
 *
 * WHY THIS EXISTS. A `recommendations` row carries two kinds of column that
 * happen to sit in one table: the report CONTENT a student reads (scores,
 * reasoning, action steps, componentBreakdown) and OPERATOR metadata about the
 * scoring run that produced it. `storage.getRecommendationsByAssessment` does a
 * bare `db.select()` — the whole row — and every student-facing handler then
 * spread it with `{ ...rec }`. So the operator metadata shipped to every student
 * on every report load, purely as a side effect of the spread. Nothing in
 * `client/` ever read it.
 *
 * STRIP, NOT ALLOWLIST, and that is a deliberate choice against the obvious
 * alternative of projecting the columns explicitly at each call site:
 *   - Thirteen of the fourteen columns ARE student-facing. An allowlist inverts
 *     the maintenance burden — you would list thirteen to hide one.
 *   - A forgotten entry in an allowlist silently DROPS report content, and a
 *     missing field is invisible until a reader notices a blank section. A
 *     forgotten entry here leaks metadata, which is what the test below catches.
 *   - Five separate `{ ...rec }` branches exist in the GET handler alone. An
 *     allowlist would have to be repeated at each; this is applied once, to the
 *     array, BEFORE the branches — so no branch can be missed and a sixth branch
 *     added later inherits it.
 * The cost of the choice is real and worth stating: a new operator-only column
 * added to the table leaks by default until its name is added below. That is
 * what OPERATOR_ONLY_RECOMMENDATION_FIELDS is for — one named, greppable place
 * where the next column forces the decision — and what
 * recommendationView.test.ts pins.
 */

import type { Recommendation } from "@shared/schema";

/**
 * Columns of `recommendations` that answer "why did this number move" for an
 * OPERATOR and have no student-facing meaning.
 *
 * `scoringProvenance` — { algorithm, configHash, tier, scoredAt }: which scoring
 * regime produced the row. See shared/schema.ts for the full reader's note. Two
 * reasons it must not reach the student: it is answering a question only an
 * operator asks, and `configHash` is not a digest — generateConfigVersion in
 * server/services/matching.ts base64-encodes a sorted `key:weight` join and
 * truncates it, so it is REVERSIBLE for the part it keeps and hands out the
 * tier weight table to anyone who decodes it.
 *
 * The operator surface keeps it: GET /api/superadmin/students/:userId/assessments
 * (server/routes/superadmin.routes.ts) returns rows verbatim, deliberately.
 */
export const OPERATOR_ONLY_RECOMMENDATION_FIELDS = ["scoringProvenance"] as const;

export type OperatorOnlyRecommendationField =
  typeof OPERATOR_ONLY_RECOMMENDATION_FIELDS[number];

/** A stored recommendation row with the operator-only columns removed. */
export type ClientRecommendation = Omit<Recommendation, OperatorOnlyRecommendationField>;

/**
 * Drop the operator-only columns from one stored row.
 *
 * Returns a new object; the input is not mutated, because callers hold rows that
 * other code (narrative generation, localization) still reads.
 */
export function toClientRecommendation<T extends Recommendation>(
  rec: T,
): Omit<T, OperatorOnlyRecommendationField> {
  const { scoringProvenance: _scoringProvenance, ...clientSafe } = rec;
  return clientSafe;
}

/** Array form. Apply this at the point rows enter a student-facing handler. */
export function toClientRecommendations<T extends Recommendation>(
  recs: T[],
): Omit<T, OperatorOnlyRecommendationField>[] {
  return recs.map(toClientRecommendation);
}

/**
 * The same removal for a FRESHLY SCORED match, which is a different type.
 *
 * POST /api/recommendations/generate answers with the `CareerMatch[]` the scorer
 * just produced rather than with stored rows, so it bypasses the row helper
 * above and leaks the same values under two names: `scoringProvenance`, and
 * `appliedConfigVersion` — which is the IDENTICAL string, assigned to
 * provenance's `configHash` one line later (server/services/matching.ts). Strip
 * only one of the two and the fix is cosmetic: the same reversible encoding of
 * the weight table is still in the same response body.
 *
 * Typed structurally rather than importing CareerMatch, so this stays usable for
 * the enriched objects the route builds around a match.
 */
export function toClientCareerMatch<
  T extends { scoringProvenance?: unknown; appliedConfigVersion?: unknown },
>(match: T): Omit<T, "scoringProvenance" | "appliedConfigVersion"> {
  const {
    scoringProvenance: _scoringProvenance,
    appliedConfigVersion: _appliedConfigVersion,
    ...clientSafe
  } = match;
  return clientSafe;
}
