-- Migration: make date_of_birth REQUIRED on organization_members rows that
-- describe a student.
--
-- This is the migration 015 named and deferred. Its header set out the sequence:
-- "add the column, make the write paths require it, get the existing student
-- rows filled BY THEIR SCHOOLS, and only then add
--   organization_members_student_dob_check
--     CHECK (role <> 'student' OR date_of_birth IS NOT NULL)
-- as its own migration, with the same pre-flight RAISE EXCEPTION block 014 uses."
-- The column landed in 015, the write paths (M1 single create, M2 bulk, M3 CSV
-- import, the member PATCH) require it via studentDemographicsSchema at the sink,
-- and the existing student rows now carry a DOB. This is that last step, written
-- to that spec.
--
-- It is also the "revisit" 014 named. 014 excluded student_age from its
-- constraint because the field was UNRECOVERABLE — "no form has ever collected it
-- and there is no date-of-birth column anywhere in the schema to derive it from"
-- — and closed with "Revisit only if a DOB column is ever added." One has been.
-- The answer is NOT to require student_age: it is being dropped in the next
-- commit, because a derived age has no business being stored beside the date it
-- derives from. What the DOB column earns is this constraint, on itself.
--
-- SCOPE — one constraint, no backfill, no data touched:
--   organization_members.date_of_birth   (shared/schema.ts:180)
--
-- NO BACKFILL, BECAUSE NONE IS NEEDED AND NONE WOULD BE HONEST. Production was
-- verified before writing this: all 7 student rows carry a date_of_birth (7/7),
-- filled by their schools through the write paths, which is exactly the
-- precondition 015 set. That is the only way these rows could have been filled —
-- 015 was explicit that nothing in the row derives a DOB, that grade implies an
-- age BAND rather than a birth date, and that a fabricated DOB "is strictly
-- worse: it is more identifying, and it silently produces a wrong derived age on
-- every future assessment." Where 014 could open with an UPDATE, this migration
-- has nothing to write and asserts instead.
--
-- WHY THE CONSTRAINT IS ROLE-SCOPED AND NOT `SET NOT NULL` — unchanged from 014
-- and 015: this table holds both students and school admins, and the four
-- admin-creating write sites have no DOB to supply:
--   server/routes/superadmin.routes.ts:453   (add admin to org)
--   server/routes/superadmin.routes.ts:835   (create-with-admin primary admin)
--   server/storage.ts:2283                   (Stripe group purchase, enrols buyer)
--   server/seed.ts:3258                      (seeded schooladmin)
-- A blanket NOT NULL would break every one of them for a rule that only ever
-- applied to students. The CHECK below keys on `role`, so admin rows are
-- untouched.
--
-- A SEPARATE CONSTRAINT, NOT A WIDENING OF
-- organization_members_student_demographics_check. Widening means DROP + ADD on a
-- constraint that is already applied and convalidated=true in production, and the
-- DROP is the risky half: for the duration of this transaction the existing
-- name/gender/grade guarantee would be off, and a failed re-add leaves the
-- question "which constraints does prod actually have?" — the question 014 went
-- out of its way to make answerable. A second constraint is purely additive, and
-- costs nothing at read time. See docs/v2-phase4-step4-recon.md §1c, and 015's
-- header, which committed to this shape in advance.
--
-- PRESENCE ONLY — NO RANGE BOUND, AND NOT AS AN OVERSIGHT. A plausibility bound
-- on a birth date wants to be relative to today, and Postgres will not have it:
-- CURRENT_DATE and now() are STABLE, not IMMUTABLE, and a CHECK constraint may
-- contain only immutable expressions. A static literal bound is legal but ages
-- badly and puts policy in DDL. Plausibility is enforced at the write boundary
-- instead, in shared/dateOfBirth.ts (MIN_STUDENT_AGE_YEARS /
-- MAX_STUDENT_AGE_YEARS), where a bad value becomes a 400 an admin can read
-- rather than a raw 23514 wearing a 500. That is the same split 013 chose for
-- grade — "NO DDL ON PURPOSE … Enforcement lives in shared/grade.ts at the write
-- sites" — and 015 pre-committed to it here. The database's job is that the field
-- is not missing; the application's job is that it is sane.
--
-- ADDED VALID, NOT `NOT VALID` + VALIDATE: production is clean (7/7 above), so
-- the two-step buys nothing but a second migration and a window in which the
-- constraint exists without being enforced on the existing rows. Matches 014.
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: push reconciles the ENTIRE
-- schema and, against the current staging branch, plans to DROP the
-- schema_migrations table — this runner's own ledger. Goes through
-- server/migrations/runner.ts, which wraps this whole file in one transaction.
--
-- IDEMPOTENT ONLY VIA THE LEDGER, deliberately. ADD CONSTRAINT has no
-- IF NOT EXISTS in Postgres, and the alternatives (a DO block that catches
-- duplicate_object, or DROP IF EXISTS then ADD) each reintroduce the drop this
-- migration exists to avoid, or swallow a real error. The runner records applied
-- migrations in schema_migrations and skips them, which is the mechanism 013, 014
-- and 015 all relied on regardless of their own re-runnability.

-- Pre-flight, so a failure names the rows instead of just the constraint.
--
-- This SHOULD no-op: prod was verified 7/7 before this was written. It is here
-- for the databases that were not verified — dev, staging, a colleague's local,
-- any restored snapshot predating the write-path fixes — where a student row may
-- still predate the DOB requirement. Without it, Postgres aborts with
-- `violates check constraint "organization_members_student_dob_check"` and no row
-- identities, and finding the offenders means writing this query by hand against
-- a database that just failed to boot. With it, the failure is actionable.
--
-- RAISE EXCEPTION rather than a NOTICE, matching 014 and unlike 013: this
-- migration adds a constraint the offending rows cannot satisfy, so the
-- transaction is going to abort either way. This one aborts it with a list.
DO $$
DECLARE
  offenders text;
  n integer;
BEGIN
  SELECT count(*), string_agg(format('member=%s user=%s', om.id, om.user_id), E'\n  ')
    INTO n, offenders
    FROM organization_members om
   WHERE om.role = 'student' AND om.date_of_birth IS NULL;

  IF n > 0 THEN
    RAISE EXCEPTION
      '016: % student row(s) have no date_of_birth and cannot be constrained. '
      'A DOB is NOT derivable from the row — it must come from the school, via '
      'the student edit form. Repair these rows, then re-run:%  %',
      n, E'\n  ', offenders;
  END IF;

  RAISE NOTICE '016: all student rows carry a date_of_birth.';
END $$;

-- The constraint. Role-scoped: `role <> 'student'` short-circuits every admin row
-- to true, so this says nothing about admins.
--
-- Presence only, and student_age is not mentioned — see the header for both.
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_student_dob_check CHECK (
    role <> 'student' OR date_of_birth IS NOT NULL
  );
