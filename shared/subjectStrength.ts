/**
 * WHICH QUIZ SUBJECTS MAY BE CALLED A STRENGTH.
 *
 * Below the threshold a subject is not a strength (owner, 2026-11-14). That
 * rule was applied to the "Build on your strength" next step only; the
 * results page and the PDF still opened the national-vision sentence with
 * "Your top strengths in English and Science" for a student who scored 20% in
 * both, directly under the same page's "13% Room to Grow". Seen live on
 * `salm.alktby`'s report, 2026-11-15. One rule, here, for all three.
 */
export const STRENGTH_THRESHOLD = 50;

/** The best two subjects that clear the threshold, best first. Possibly none. */
export function strengthSubjects(
  subjectScores: Record<string, { percentage?: number } | null | undefined> | null | undefined,
  limit = 2,
): string[] {
  if (!subjectScores) return [];
  return Object.entries(subjectScores)
    .map(([subject, s]) => [subject, typeof s?.percentage === "number" ? s.percentage : NaN] as const)
    .filter(([, p]) => Number.isFinite(p) && p >= STRENGTH_THRESHOLD)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([subject]) => subject);
}
