/**
 * Migration: Correct `relatedSubjects` on careers whose seeded tags do not
 * project onto any student-selectable subject.
 *
 * Uses career English title as the match key, matching career-arabic-content.ts
 * and career-values-profiles.ts.
 *
 * WHY THIS EXISTS
 * Career `relatedSubjects` are matched against a student's favoriteSubjects via
 * normalizeCareerSubjects() (server/utils/subjectMap.ts), which projects each tag
 * onto the umbrella-6 the subject picker offers (Mathematics, Science, English,
 * Arabic, Social Studies, Computer Science) and drops anything with no home
 * there. A career whose ENTIRE tag set drops has an empty match target, so
 * calculateSubjectsScore returns the flat 20 for every student forever — the
 * subjects component contributes nothing while still holding its weight.
 *
 * Teacher was tagged with `Education` and `Subject Specialization`. Neither is a
 * school subject: both name the profession, so neither can ever be selected by a
 * student and both drop. Retagging with the core subjects a secondary teacher
 * actually teaches restores the component.
 *
 * WHY A BACKFILL AND NOT JUST THE SEED ARRAY
 * The careers loop in seed.ts:807-808 is INSERT-only (`if
 * (!existingCareerTitles.has(career.title))`), so edits to the seed array reach a
 * from-scratch database only. This is what updates the rows that already exist on
 * staging/prod. Both are kept in sync deliberately — see docs/teacher-fix-done.md.
 *
 * Idempotent: a plain UPDATE ... SET to a constant. Re-running on an
 * already-corrected row is a no-op write. Add further careers to the array below
 * if another one is ever found to project to nothing.
 */

import { db } from '../db';
import { careers } from '../../shared/schema';
import { eq } from 'drizzle-orm';

export interface CareerRelatedSubjects {
  title: string;
  relatedSubjects: string[];
  /** Why this career needed correcting — kept next to the data, not in a commit message. */
  reason: string;
}

export const CAREER_RELATED_SUBJECTS: CareerRelatedSubjects[] = [
  {
    title: 'Teacher (Secondary Education)',
    relatedSubjects: ['English', 'Mathematics', 'Science'],
    reason:
      'Was ["Education", "Subject Specialization"] — both name the profession, not a school ' +
      'subject, so both drop in normalizeCareerSubjects() and the career sat at the flat-20 ' +
      'floor for every student. A secondary teacher relates broadly to the core subjects.',
  },
];

export async function applyCareerRelatedSubjects(): Promise<void> {
  console.log('Applying career relatedSubjects corrections...');
  let updated = 0;
  let notFound = 0;

  for (const item of CAREER_RELATED_SUBJECTS) {
    const results = await db
      .select({ id: careers.id })
      .from(careers)
      .where(eq(careers.title, item.title))
      .limit(1);

    if (results.length === 0) {
      console.warn(`  ⚠ Career not found: "${item.title}"`);
      notFound++;
      continue;
    }

    await db
      .update(careers)
      .set({ relatedSubjects: item.relatedSubjects })
      .where(eq(careers.id, results[0].id));
    updated++;
  }

  console.log(`Career relatedSubjects: ${updated} updated, ${notFound} not found`);
}
