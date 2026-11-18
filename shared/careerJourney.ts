import { CANONICAL_GRADES, toCanonicalGrade } from "./grade";

/**
 * Rules for the career-journey page (/progress), pure so they can be tested.
 *
 * "Career Path Clarity" used to count careers with persistenceScore >= 0.5,
 * i.e. "in at least half of your assessments". With two grades every career
 * that appeared ONCE is exactly half, so a student whose two reports shared one
 * career was told "5 careers ... showing strong consistency" (seen live,
 * 2026-11-18). A career is consistent only if it appeared in MORE THAN ONE
 * grade, and still in at least half of them.
 */
export function consistentCareers<T extends { gradesAppeared: readonly string[]; persistenceScore: number }>(
  trajectory: ReadonlyArray<T>,
): T[] {
  return trajectory.filter((c) => {
    const distinct = new Set(c.gradesAppeared.map((g) => toCanonicalGrade(g) ?? g));
    return distinct.size >= 2 && c.persistenceScore >= 0.5;
  });
}

export function countConsistentCareers(
  trajectory: ReadonlyArray<{ gradesAppeared: readonly string[]; persistenceScore: number }>,
): number {
  return consistentCareers(trajectory).length;
}

/**
 * The milestones the timeline draws: from the student's FIRST assessed grade
 * onward. Grades before it were drawn as "Pending" for a student who joined at
 * Grade 11, which can never be completed and is only clutter. Later grades stay
 * (they are what comes next). 'graduated' only when it has data.
 */
export function journeyGrades(assessedGrades: readonly string[]): string[] {
  const canon = new Set(
    assessedGrades.map((g) => toCanonicalGrade(g)).filter((g): g is NonNullable<typeof g> => !!g),
  );
  const first = CANONICAL_GRADES.findIndex((g) => canon.has(g));
  if (first === -1) return CANONICAL_GRADES.filter((g) => g !== "graduated");
  return CANONICAL_GRADES.slice(first).filter((g) => g !== "graduated" || canon.has(g));
}
