-- 021: repair the Grade 8 English row corrupted by matching on question text alone.
--
-- "Which sentence is grammatically correct?" is TWO questions in the bank: one
-- under English (subject-pronoun agreement, English answer options) and one
-- under Arabic (word order, Arabic answer options). The Arabic-content migration
-- matched rows on question text alone, so both content entries updated both
-- rows. The Arabic row survived by ordering luck — its own entry ran last and
-- wrote correctly. The English row did not:
--
--   options_ar     = the Arabic question's four Arabic sentences
--   question_ar    = the Arabic question's stem (about Arabic word order)
--   explanation_ar = the Arabic question's explanation
--
-- above its own four English options and scored against the English
-- correct_answer. An Arabic-reading student was served a question about Arabic
-- word order, four Arabic sentences, and an explanation for a different
-- question, while the scorer compared their submission to "She and I went to the
-- market." No option they could read maps to a correct answer: the question was
-- unanswerable, not merely mislabelled.
--
-- The code path is fixed in the same commit — quiz-arabic-content.ts now matches
-- on (question, subject, grade) and alignArabicOptions keys its source map the
-- same way. This migration repairs the row that is already live, because the
-- Arabic-content migrations only run from seed.ts and a deploy is not a reseed.
--
-- options_ar is set to the row's CURRENT options rather than to a literal array.
-- That is not a shortcut: for this question the bank's optionsAr ARE the English
-- sentences (you cannot translate the answer choices of an English-grammar
-- question without destroying it), so the correct Arabic array is the English
-- one — and taking it from `options` aligns it to whatever permutation migration
-- 020 left this row in, which a hardcoded array could not.
--
-- The WHERE clause is the new match key, so this repairs the right row in any
-- environment without depending on a per-environment row id. The Arabic row is
-- untouched: it is correct.

UPDATE quiz_questions
SET options_ar = options,
    question_ar = 'أيّ الجمل صحيحة نحوياً؟',
    explanation_ar = 'تُستخدم الضمائر الفاعلية (I, she) في موقع الفاعل. ''She and I'' هو الشكل الصحيح'
WHERE question = 'Which sentence is grammatically correct?'
  AND subject = 'English'
  AND grade = 8
  AND jsonb_typeof(options) = 'array'
  AND jsonb_array_length(options) = 4;
