/**
 * Postgres error recognition, in the one place that knows how the driver wraps.
 *
 * Lived in quiz.routes.ts (a1a8878) until cvq.routes.ts needed the identical
 * check. Two copies of "how do I recognise a unique violation" is exactly the
 * kind of duplication that drifts silently — the failure mode of getting it
 * wrong is not an error but a missed convergence, which surfaces to a student
 * as an opaque 500 for work that was in fact saved.
 */

/**
 * SQLSTATE 23505, unique_violation — seen through whatever wrapped it.
 *
 * neon-serverless does not always surface the pg error itself: it is frequently
 * re-thrown with the original as `cause`, so a check on `error.code` alone
 * misses half the cases. Both are tested, following the precedent already in
 * seed.ts:2834 and country.routes.ts:532, which check the same two places.
 *
 * Deliberately narrow. It answers one question, so a caller that converges on a
 * true result cannot accidentally converge on a foreign-key (23503) or check
 * (23514) violation, which mean something has gone wrong rather than something
 * has already happened.
 */
export function isUniqueViolation(error: any): boolean {
  return error?.code === "23505" || error?.cause?.code === "23505";
}
