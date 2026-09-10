/**
 * Migration: Populate Arabic translations for Grade 9–12 quiz questions
 * Covers all 6 UAE curriculum subjects for Grades 9, 10, 11, 12
 * Matches on (question, subject, grade) — quiz_questions has no stable external
 * ID, and question text alone collides across subjects.
 */

import { db } from '../db';
import { quizQuestions } from '../../shared/schema';
import { and, eq } from 'drizzle-orm';
import { alignArabicOptions } from './alignArabicOptions';
import { GRADES9_12_ARABIC_CONTENT } from './quiz-arabic-content-grades9-12.data';

/**
 * Apply Arabic translations to Grade 9–12 quiz questions already in the DB.
 * Matches by (question, subject, grade) — question text alone is not a unique
 * key across the bank (see alignArabicOptions for the Grade 8 collision that
 * proved it), and `.limit(1)` on a text-only match silently picked a row rather
 * than reporting the ambiguity.
 *
 * questionAr and explanationAr stay outside the alignment guard on purpose: they
 * carry no positional meaning, so a correctly matched row should still receive
 * them when its options cannot be paired. What must never happen is writing them
 * to the WRONG row, and that is prevented by the match key, not by the guard.
 */
export async function applyGrades9to12ArabicContent(): Promise<void> {
  console.log('Applying Arabic content for Grades 9–12 quiz questions...');
  let updated = 0;
  let notFound = 0;
  let unaligned = 0;
  let ambiguous = 0;

  for (const item of GRADES9_12_ARABIC_CONTENT) {
    const results = await db
      .select({ id: quizQuestions.id, options: quizQuestions.options })
      .from(quizQuestions)
      .where(
        and(
          eq(quizQuestions.question, item.question),
          eq(quizQuestions.subject, item.subject),
          eq(quizQuestions.grade, item.grade),
        ),
      );

    if (results.length === 0) {
      console.warn(`  ⚠ Not found: "${item.question.substring(0, 60)}..."`);
      notFound++;
      continue;
    }

    if (results.length > 1) {
      ambiguous++;
      console.warn(
        `  ⚠ ${results.length} rows share (question, subject, grade), writing nothing: "${item.question.substring(0, 60)}"`,
      );
      continue;
    }

    const row = results[0];
    // optionsAr is positional against the BANK SOURCE order; the stored row is
    // permuted. Realign before writing, and on failure write only the fields
    // that carry no positional meaning.
    const aligned = alignArabicOptions(item, row.options, item.optionsAr);
    if (aligned === null) {
      unaligned++;
      console.warn(
        `  ⚠ Could not align Arabic options, leaving options_ar untouched: "${item.question.substring(0, 60)}"`,
      );
    }

    await db
      .update(quizQuestions)
      .set({
        questionAr: item.questionAr,
        ...(aligned !== null ? { optionsAr: aligned } : {}),
        explanationAr: item.explanationAr,
      })
      .where(eq(quizQuestions.id, row.id));
    updated++;
  }

  console.log(
    `Grades 9–12 Arabic content: ${updated} updated, ${notFound} not found` +
      (ambiguous > 0 ? `, ${ambiguous} ambiguous (skipped entirely)` : '') +
      (unaligned > 0 ? `, ${unaligned} with options_ar left untouched (unalignable)` : ''),
  );
}
