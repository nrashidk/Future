-- Migration: make student demographics REQUIRED on organization_members rows
-- that describe a student.
--
-- Students are minors (13-18). Their name, gender and grade are the fields the
-- report and the analytics rollups are keyed on, and all three have been
-- nullable since the table was created: the admin add-student form never sent
-- student_name at all, and student_gender sat behind an optional select. See
-- docs/v2-phase4-step1-recon.md SS1b and SS2c.
--
-- SCOPE — one table, one backfill, one constraint:
--   organization_members.student_name    (shared/schema.ts:155)
--   organization_members.student_gender  (shared/schema.ts:157)
--   organization_members.grade           (shared/schema.ts:158)
--
-- WHY THE CONSTRAINT IS ROLE-SCOPED AND NOT `SET NOT NULL`: this table holds
-- both students and school admins. Admin rows legitimately have all of these
-- NULL — see the four admin-creating write sites, none of which has a name,
-- gender or grade to supply:
--   server/routes/superadmin.routes.ts:453   (add admin to org)
--   server/routes/superadmin.routes.ts:835   (create-with-admin primary admin)
--   server/storage.ts:2283                   (Stripe group purchase, enrols buyer)
--   server/seed.ts:3258                      (seeded schooladmin)
-- A blanket NOT NULL would break every one of them. The CHECK below keys on
-- `role`, so admin rows are untouched.
--
-- student_age IS DELIBERATELY NOT IN THIS CONSTRAINT.
--   It is UNRECOVERABLE. No form has ever collected it (the add-student form has
--   no age input at all — client/src/pages/AdminOrganizations.tsx:1486-1493), and
--   there is no date-of-birth column anywhere in the schema to derive it from, so
--   every existing student row has student_age IS NULL and no backfill exists
--   that would not be an invention. Putting a fabricated age in a minor's record
--   is worse than leaving it absent.
--   It is also NOT LOAD-BEARING. Nothing in scoring, matching or the report reads
--   student_age; `grade` is the field the age-appropriate content is keyed on, and
--   grade IS required here. Age stays nullable and stays out of the constraint.
--   Revisit only if a DOB column is ever added.
--
-- organizations.country_id / .curriculum ARE NOT TOUCHED HERE — deliberately, and
-- this is not an oversight. Adding NOT NULL to either would break the Stripe
-- group-purchase path (server/storage.ts:2270-2281), which inserts the
-- organization INSIDE the payment transaction, at a point where neither value is
-- available and there is nowhere in the flow to ask for them. A DB failure there
-- rolls back a PAID purchase. That requirement is enforced at student-create
-- instead, in a separate step.
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: push reconciles the ENTIRE
-- schema and, against the current staging branch, plans to DROP the
-- schema_migrations table — this runner's own ledger. Goes through
-- server/migrations/runner.ts, which wraps this whole file in one transaction:
-- if the constraint is rejected, the backfill rolls back with it.
--
-- ORDERING — this migration MUST land after the write-site fixes that make the
-- three fields mandatory at student-create. Constraining the table while a
-- writer can still omit student_name just moves the failure from the form to a
-- 500 at the DB.
--
-- ADDED VALID, NOT `NOT VALID`: production was verified clean before writing
-- this (5 student rows, all three fields present on all of them), so the
-- NOT VALID / VALIDATE CONSTRAINT two-step buys nothing. The backfill below
-- covers the non-production databases, where the seed and older test rows live.

-- (a) Backfill student_name from the user record.
--
-- The add-student form collects a single `fullName`, which
-- server/storage.ts:2640-2642 splits into users.first_name / users.last_name and
-- then never writes back to the member row. This reassembles it. That makes the
-- name recovered, not invented — the exact opposite of the student_age case
-- above, which is why one is backfilled and the other is dropped from the
-- constraint.
--
-- Idempotent: `student_name IS NULL` means a second run matches zero rows, and
-- a row that already has a name is never overwritten from the users table.
-- `updated_at = now()` on the rows it repairs, matching 013's convention: a
-- touched row reports as touched.
UPDATE organization_members om
SET student_name = trim(u.first_name || ' ' || coalesce(u.last_name, '')),
    updated_at = now()
FROM users u
WHERE u.id = om.user_id AND om.role = 'student' AND om.student_name IS NULL;

-- Pre-flight, so a failure names the rows instead of just the constraint.
--
-- Two ways a student row can still violate the CHECK after the backfill:
--   * users.first_name IS NULL — both name columns are nullable
--     (shared/schema.ts:34-35), and `NULL || ' ' || ''` is NULL in Postgres, so
--     the UPDATE above sets NULL and the row is no better off.
--   * student_gender or grade was never captured (the gender select is optional
--     on the form; grade is server-required only on the newer write paths).
--
-- RAISE EXCEPTION rather than a NOTICE: unlike 013, which preserved rows it
-- could not convert, this migration adds a constraint those rows cannot satisfy.
-- Postgres would abort anyway with `violates check constraint` and no row
-- identities; this aborts the same transaction with a list a human can act on.
DO $$
DECLARE
  offenders text;
  n integer;
BEGIN
  SELECT count(*), string_agg(
           format('member=%s user=%s [%s]', om.id, om.user_id,
                  concat_ws(', ',
                    CASE WHEN om.student_name   IS NULL THEN 'student_name'   END,
                    CASE WHEN om.student_gender IS NULL THEN 'student_gender' END,
                    CASE WHEN om.grade          IS NULL THEN 'grade'          END)),
           E'\n  ')
    INTO n, offenders
    FROM organization_members om
   WHERE om.role = 'student'
     AND (om.student_name IS NULL OR om.student_gender IS NULL OR om.grade IS NULL);

  IF n > 0 THEN
    RAISE EXCEPTION
      '014: % student row(s) are missing required demographics and cannot be '
      'constrained. Repair these rows, then re-run:%  %',
      n, E'\n  ', offenders;
  END IF;

  RAISE NOTICE '014: all student rows carry name, gender and grade.';
END $$;

-- (b) The constraint. Role-scoped: `role <> 'student'` short-circuits every
-- admin row to true, so this says nothing about admins.
--
-- student_age is absent by design — see the header.
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_student_demographics_check CHECK (
    role <> 'student' OR (
      student_name   IS NOT NULL AND
      student_gender IS NOT NULL AND
      grade          IS NOT NULL
    )
  );
