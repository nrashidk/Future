-- Migration: add organization_members.date_of_birth.
--
-- Schools record a student's date of birth at student-create; the assessment
-- derives age from it and locks it, the same way name/grade/gender/country/
-- curriculum are locked (14459a4, extended to create in 4bf2d02). Self-paid
-- students keep entering age directly — there is no school to supply a DOB.
--
-- SCOPE — one column, no constraint, no backfill, no data touched:
--   organization_members.date_of_birth   (shared/schema.ts, alongside student_age)
--
-- Nothing writes it yet and nothing reads it. The write paths (M1 single create,
-- M2 bulk, M3 CSV import, the member PATCH), the zod requirement at the sink and
-- the assessment's age derivation are separate commits in this step. This
-- migration is additive and reversible on its own: an unwritten nullable column
-- changes no behaviour.
--
-- WHY `date` AND NOT `timestamp`: a birth date has no time and no timezone. As a
-- timestamp, 2010-03-14 becomes an instant that renders as 13 March anywhere west
-- of Greenwich, moving a student's birthday — and therefore the age derived from
-- it — by a day. The application side matches: the Drizzle column is declared
-- date(..., { mode: "string" }) and shared/dateOfBirth.ts compares 'YYYY-MM-DD'
-- strings part by part, constructing no Date at all.
--
-- WHY NULLABLE, AND WHY NO CHECK YET — the two are the same decision:
--
--   * NOT NULL is wrong here for the reason 014 spells out at length: this table
--     holds school admins as well as students, and the four admin-creating write
--     sites have no DOB to supply (superadmin.routes.ts:453 and :835,
--     storage.ts:2283, seed.ts:3258). The requirement is student-only, so when it
--     comes it comes as a role-scoped CHECK, not a column constraint.
--
--   * The role-scoped CHECK cannot land in the same change, because the existing
--     student rows have no date of birth and NONE IS DERIVABLE. 014 could
--     backfill student_name because the name was recoverable from users.first_name
--     / last_name — it had merely never been written back. There is no equivalent
--     here: grade implies an age BAND, not a birth date, and 013 already refused
--     to coerce an unrecognised grade to a neighbour on exactly this principle —
--     "inventing one would put a wrong grade in a minor's record". A fabricated
--     DOB is strictly worse: it is more identifying, and it silently produces a
--     wrong derived age on every future assessment.
--
-- So the sequence is the one 014's own ordering rule prescribes, with a data
-- dependency where 014 had a code one: add the column, make the write paths
-- require it, get the existing student rows filled BY THEIR SCHOOLS, and only
-- then add
--   organization_members_student_dob_check
--     CHECK (role <> 'student' OR date_of_birth IS NOT NULL)
-- as its own migration, with the same pre-flight RAISE EXCEPTION block 014 uses
-- so a failure names the offending rows instead of just the constraint. Until
-- that migration lands, the constraint is VISIBLY absent rather than silently
-- assumed. See docs/v2-phase4-step4-recon.md §2.
--
-- A SEPARATE CONSTRAINT, NOT A WIDENED ONE. When it comes, it will be a second
-- CHECK rather than an extension of organization_members_student_demographics_check.
-- Widening means DROP + ADD on a constraint that is already applied and
-- convalidated in production; for the duration of that transaction the existing
-- name/gender/grade guarantee is off, and a failed re-add leaves the question
-- "which constraints does prod actually have?" — which 014 went out of its way to
-- make answerable. A second constraint is purely additive.
--
-- NO RANGE CHECK, EVER, AND NOT AS AN OVERSIGHT. A plausibility bound on a birth
-- date wants to be relative to today, and Postgres will not have it: CURRENT_DATE
-- and now() are STABLE, not IMMUTABLE, and a CHECK constraint may only contain
-- immutable expressions. A static literal bound is legal but ages badly and puts
-- policy in DDL. Plausibility is enforced at the write boundary instead, in
-- shared/dateOfBirth.ts (MIN_STUDENT_AGE_YEARS / MAX_STUDENT_AGE_YEARS), where a
-- bad value becomes a 400 an admin can read rather than a raw 23514 wearing a
-- 500. That is the same split migration 013 chose for grade: "NO DDL ON PURPOSE …
-- Enforcement lives in shared/grade.ts at the write sites."
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: push reconciles the ENTIRE
-- schema and, against the current staging branch, plans to DROP the
-- schema_migrations table — this runner's own ledger. Goes through
-- server/migrations/runner.ts, which wraps this file in one transaction.
--
-- IDEMPOTENT: IF NOT EXISTS, so a second run is a no-op. The runner's ledger
-- already prevents that, but 013 and 014 are both re-runnable and this matches.

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Post-condition, as a NOTICE rather than an assertion: this migration cannot
-- fail meaningfully, but the count is the number a human will want when deciding
-- when the CHECK above can land. It is the size of the fill-these-in list.
DO $$
DECLARE
  pending integer;
BEGIN
  SELECT count(*) INTO pending
    FROM organization_members
   WHERE role = 'student' AND date_of_birth IS NULL;

  RAISE NOTICE
    '015: date_of_birth added. % student row(s) have no DOB and need one before '
    'the role-scoped CHECK can be applied.', pending;
END $$;
