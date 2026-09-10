/**
 * Migration: Populate Arabic translations for Grade 8 quiz questions
 * Covers all 6 UAE curriculum subjects for Grade 8
 * Matches on (question, subject, grade) — quiz_questions has no stable external
 * ID, and question text alone collides across subjects.
 */

import { db } from '../db';
import { quizQuestions } from '../../shared/schema';
import { and, eq } from 'drizzle-orm';
import { alignArabicOptions } from './alignArabicOptions';
import { GRADE8_ARABIC_CONTENT } from './quiz-arabic-content.data';

/**
 * Apply Arabic translations to Grade 8 quiz questions already in the DB.
 * Matches by (question, subject, grade), then UPDATEs questionAr / optionsAr /
 * explanationAr.
 *
 * The match key is deliberately narrower than the question text. questionAr and
 * explanationAr stay OUTSIDE the alignment guard, because their corruption was
 * never an alignment failure — it was a wrong-row match. Gating them on
 * `aligned !== null` would have masked this particular case by coincidence (the
 * wrong row also happened to fail alignment) while still writing the wrong
 * Arabic text to any wrong row whose options DID align. Precision in the WHERE
 * clause is the control; the alignment guard only ever protected positional
 * data, and a correctly matched row should still get the two fields that carry
 * no positional meaning even when its options cannot be paired.
 *
 * A key that still matches more than one row writes nothing at all: an ambiguous
 * match means we cannot know which row the content belongs to, and the cost of
 * guessing is a student reading one question and being scored on another.
 */
export async function applyGrade8ArabicContent(): Promise<void> {
  console.log('🌐 Applying Arabic translations to Grade 8 quiz questions...');
  let updated = 0;
  let skipped = 0;
  let unaligned = 0;
  let ambiguous = 0;

  for (const item of GRADE8_ARABIC_CONTENT) {
    try {
      const rows = await db
        .select({ id: quizQuestions.id, options: quizQuestions.options })
        .from(quizQuestions)
        .where(
          and(
            eq(quizQuestions.question, item.question),
            eq(quizQuestions.subject, item.subject),
            eq(quizQuestions.grade, item.grade),
          ),
        );

      if (rows.length === 0) {
        skipped++;
        continue;
      }

      if (rows.length > 1) {
        ambiguous++;
        console.warn(
          `  ⚠ ${rows.length} rows share (question, subject, grade), writing nothing: "${item.question.slice(0, 60)}"`,
        );
        continue;
      }

      const row = rows[0];
      // optionsAr is positional against the BANK SOURCE order; the stored row
      // is permuted. Realign before writing, and on failure write only the
      // fields that carry no positional meaning.
      const aligned = alignArabicOptions(item, row.options, item.optionsAr);
      if (aligned === null) {
        unaligned++;
        console.warn(
          `  ⚠ Could not align Arabic options, leaving options_ar untouched: "${item.question.slice(0, 60)}"`,
        );
      }

      await db
        .update(quizQuestions)
        .set({
          questionAr: item.questionAr,
          ...(aligned !== null ? { optionsAr: aligned as any } : {}),
          explanationAr: item.explanationAr,
        })
        .where(eq(quizQuestions.id, row.id));
      updated++;
    } catch (err) {
      console.error(`  ⚠ Failed to update question: "${item.question.slice(0, 60)}"`, err);
    }
  }

  console.log(
    `✓ Grade 8 Arabic quiz content: ${updated} updated, ${skipped} not found` +
      (ambiguous > 0 ? `, ${ambiguous} ambiguous (skipped entirely)` : '') +
      (unaligned > 0 ? `, ${unaligned} with options_ar left untouched (unalignable)` : ''),
  );
}
