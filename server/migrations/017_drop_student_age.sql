-- Migration: drop organization_members.student_age.
--
-- The column is dead and has always been dead. It is NULL on every row, no form
-- has ever collected it, and nothing in scoring, matching or the report reads
-- it. 014 already established all three facts when it excluded student_age from
-- the demographics CHECK — "It is UNRECOVERABLE … It is also NOT LOAD-BEARING"
-- — and closed with "Revisit only if a DOB column is ever added". 015 added that
-- column and 016 made it required for students. This is the revisit's second
-- half: date_of_birth plus derivation supersedes student_age completely, so the
-- column goes rather than staying as a permanently-empty second opinion.
--
-- SCOPE — one column, dropped, and its every reference removed in the same
-- commit:
--   organization_members.student_age
--
-- WHY DROP RATHER THAN LEAVE IT NULLABLE AND IGNORED. A column that exists is a
-- column a writer can fill. Its presence was still being modelled all the way up
-- the stack — three create paths accepted a studentAge they were never given,
-- the JSON export emitted the field, and the bulk-CSV parser read a studentAge
-- column — so the schema kept advertising to schools that an age is something
-- they can supply, when the answer since 015 is that they supply a birth date
-- and the server derives the age. Leaving the column is not neutral: it is a
-- standing invitation to populate a field that would then disagree with the
-- derivation within twelve months. An age is wrong within a year of being
-- written; a birth date is not.
--
-- NO DATA IS LOST, and this was verified rather than assumed — see the
-- pre-flight below, which refuses to run if any row has a value. That check is
-- the whole reason this is safe: a DROP COLUMN is irreversible without a
-- restore, so the migration asserts its own precondition instead of trusting the
-- recon that established it.
--
-- WHY NOT `IF EXISTS`: the runner's schema_migrations ledger already prevents a
-- second run, and 016's header records the same reasoning for its ADD. More to
-- the point, IF EXISTS would mask the one case worth hearing about — the column
-- already gone from a database where nothing recorded dropping it.
--
-- NOTHING REFERENCES IT AFTER THIS COMMIT. Verified by grep across .ts/.tsx/.sql
-- before writing this. What remains are historical references that stay true in
-- the past tense and are deliberately not rewritten: migrations 014-016, the
-- SCHOOL_OWNED_ASSESSMENT_FIELDS doc comment in assessment.routes.ts, which
-- explains why `age` was absent from that list until a DOB existed, and the
-- recon documents under docs/. Those record why the column died; erasing them
-- would lose the reasoning that this migration is the conclusion of.
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: push reconciles the ENTIRE
-- schema and, against the current staging branch, plans to DROP the
-- schema_migrations table — this runner's own ledger. Goes through
-- server/migrations/runner.ts, which wraps this file in one transaction.

-- Pre-flight. Refuses the drop if the column holds a single value anywhere.
--
-- 014 recorded that student_age is NULL on every row, and it has had no writer
-- since — but 014's own writers passed a studentAge through three create paths,
-- so a database where someone once POSTed the field by hand is not impossible.
-- A DROP COLUMN cannot be undone without a restore, and unlike 016's pre-flight
-- (which only anticipates the constraint failing a moment later) this one is
-- load-bearing: without it, a row carrying an age is destroyed silently and the
-- migration reports success.
--
-- If this ever fires, the value is a fabricated age of unknown provenance in a
-- minor's record, not something to preserve — but that is a decision for a human
-- who can look at the row, which is why it names them.
DO $$
DECLARE
  offenders text;
  n integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'organization_members' AND column_name = 'student_age'
  ) THEN
    RAISE EXCEPTION
      '017: organization_members.student_age is already absent. Nothing recorded '
      'dropping it, so this database diverged from the migration ledger. '
      'Investigate before marking 017 applied.';
  END IF;

  SELECT count(*), string_agg(format('member=%s user=%s age=%s', id, user_id, student_age), E'\n  ')
    INTO n, offenders
    FROM organization_members
   WHERE student_age IS NOT NULL;

  IF n > 0 THEN
    RAISE EXCEPTION
      '017: % row(s) carry a student_age. 014 recorded the column as NULL '
      'everywhere, so this database disagrees with that finding and the drop is '
      'NOT safe to run unreviewed. Inspect these rows first:%  %',
      n, E'\n  ', offenders;
  END IF;

  RAISE NOTICE '017: student_age is NULL on every row; safe to drop.';
END $$;

ALTER TABLE organization_members
  DROP COLUMN student_age;
