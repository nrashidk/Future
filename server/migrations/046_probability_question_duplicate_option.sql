-- 046: a quiz question offered the correct answer twice.
--
-- "A box contains 5 red balls and 3 blue balls. If two balls are drawn without
-- replacement, what is the probability both are red?" listed "5/14" (marked
-- correct) and "10/28" — the same number. A Grade 10 student who chose 10/28
-- was right and was marked wrong. Seen on the first student walk, 2026-11-12.
--
-- The second option becomes 15/56: the probability of red THEN blue
-- (5/8 x 3/7), which is the mistake the distractor ought to catch and is not
-- equal to any other option.
--
-- The bank file (server/questionBanks/uae/mathematics.ts) and its Arabic
-- content are changed in the same commit; this is for the row that already
-- exists, which the seed never rewrites. The options are digits and a slash in
-- both languages, so the two arrays are the same.
--
-- IDEMPOTENT: matched on the old option, which is gone after one run.

UPDATE quiz_questions
   SET options    = '["5/14", "15/56", "5/8", "25/64"]'::jsonb,
       options_ar = '["5/14", "15/56", "5/8", "25/64"]'::jsonb
 WHERE question = 'A box contains 5 red balls and 3 blue balls. If two balls are drawn without replacement, what is the probability both are red?'
   AND options @> '["10/28"]'::jsonb;

-- DOWN (manual, not run by the runner):
--   UPDATE quiz_questions
--      SET options    = '["5/14", "10/28", "5/8", "25/64"]'::jsonb,
--          options_ar = '["5/14", "10/28", "5/8", "25/64"]'::jsonb
--    WHERE question = 'A box contains 5 red balls and 3 blue balls. If two balls are drawn without replacement, what is the probability both are red?'
--      AND options @> '["15/56"]'::jsonb;
