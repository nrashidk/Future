-- Scoring provenance on recommendations.
--
-- WHY: on 2026-08-31, 221d496 ("Piece D") changed calculateSubjectsScore to
-- normalize career relatedSubjects before matching AND to use the normalized set
-- as the denominator. Correct for new reports; it also silently re-based the
-- subjects score for every pre-existing assessment, so two students with
-- identical answers now get different numbers depending on when their report was
-- last generated. Nothing recorded which scoring regime produced a stored row.
--
-- NULLABLE AND NOT BACKFILLED, deliberately. We cannot know what produced the
-- existing rows, and a guessed value wearing the costume of provenance is worse
-- than an absent one — the next reader trusts it. NULL means "scored before
-- provenance was recorded; vintage unknown". See shared/schema.ts for the full
-- reader's note and the dates a NULL row can be dated against.
ALTER TABLE recommendations
  ADD COLUMN IF NOT EXISTS scoring_provenance jsonb;

COMMENT ON COLUMN recommendations.scoring_provenance IS
  'Which scoring regime produced this row: {algorithm, configHash, tier, scoredAt}. NULL = scored before provenance was recorded (pre-2026-09-08); such a row may predate 221d496 (2026-08-31) and is not necessarily reproducible from current code.';
