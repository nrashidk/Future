-- 020: randomise stored option order in the quiz question bank.
--
-- 239 of the 240 questions were authored with the correct answer at options[0].
-- Runtime presentation order (transformQuizQuestionForFrontend) is shuffled per
-- quiz, but that permutation is derived from the quiz id, so it is recomputable
-- by anyone with the source. As long as the DATABASE order is also predictable —
-- and "the correct answer is first" is as predictable as it gets — the correct
-- answer stays recoverable end to end. This removes the predictable half.
--
-- From here on new rows are normalised on insert by
-- storage.createQuizQuestion -> permuteOptionsForStorage, so this migration is
-- a one-time catch-up for rows that predate that. It is recorded in
-- schema_migrations by the runner and therefore applies exactly once; re-running
-- it would be harmless but would needlessly re-permute.
--
-- options_ar IS PERMUTED WITH THE SAME PERMUTATION, not separately. The two are
-- parallel arrays: options_ar[i] is the translation of options[i], and the
-- client stores the canonical ENGLISH text for whichever label the student
-- clicked (QuizStep.tsx:290-295). Permuting one without the other would mean an
-- Arabic-reading student reads one option and submits a different one. All 240
-- rows currently carry a matching-length options_ar, so this is not a rare path.
--
-- Rows whose options_ar is absent, non-array, or a different length are left
-- with options_ar untouched: a mismatched length means the two were never
-- aligned, and reordering it would invent a pairing rather than preserve one.

WITH perm AS (
  SELECT q.id,
         array_agg(i ORDER BY random()) AS idx
  FROM quiz_questions q
  CROSS JOIN generate_series(0, jsonb_array_length(q.options) - 1) AS i
  WHERE jsonb_typeof(q.options) = 'array'
    AND jsonb_array_length(q.options) > 1
  GROUP BY q.id
)
UPDATE quiz_questions q
SET options = (
      SELECT jsonb_agg(q.options -> o.i ORDER BY o.ord)
      FROM unnest(p.idx) WITH ORDINALITY AS o(i, ord)
    ),
    options_ar = CASE
      WHEN jsonb_typeof(q.options_ar) = 'array'
       AND jsonb_array_length(q.options_ar) = jsonb_array_length(q.options)
      THEN (
        SELECT jsonb_agg(q.options_ar -> o.i ORDER BY o.ord)
        FROM unnest(p.idx) WITH ORDINALITY AS o(i, ord)
      )
      ELSE q.options_ar
    END
FROM perm p
WHERE p.id = q.id;
