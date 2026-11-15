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

/**
 * The favourite subjects as the AI narrative prompt is given them, each with
 * its measured quiz score and whether that score may be called a strength.
 *
 * The prompt used to receive the bare names, so the model had nothing to
 * tell a favourite from a strength and wrote "your existing strengths in
 * Maths and Computer Science" over 20% in both (salm.alktby, 2026-11-15).
 * The template is stored in the database and is not reseeded, so the
 * evidence goes into the value of the variable the template already uses.
 * A subject the quiz did not score is left bare: unknown is not weak.
 */
export function describeFavouriteSubjects(
  favourites: string[],
  subjectScores: Record<string, unknown> | null | undefined,
): string[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const scores = new Map<string, number>();
  if (subjectScores && typeof subjectScores === "object") {
    for (const [name, s] of Object.entries(subjectScores)) {
      const v = typeof s === "number" ? s
        : (s && typeof s === "object" ? (s as { percentage?: unknown }).percentage : undefined);
      if (typeof v === "number" && Number.isFinite(v)) scores.set(key(name), v);
    }
  }
  return favourites.map((subject) => {
    const p = scores.get(key(subject));
    if (p === undefined) return subject;
    const verdict = p >= STRENGTH_THRESHOLD ? "a strength" : "NOT yet a strength; do not call it one";
    return `${subject} (quiz score ${Math.round(p)}%, ${verdict})`;
  });
}

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
