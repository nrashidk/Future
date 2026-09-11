-- Migration: record WHICH FUND paid for each student's enrolment, so the licence
-- counters can be derived from the roster instead of incremented and
-- decremented.
--
-- WHY. organizations.used_licenses and organizations.reward_credits_used were
-- maintained by arithmetic: +1 somewhere, -1 somewhere else. Four independent
-- paths could move them out of agreement with the roster they are supposed to
-- describe, and one of them ran on every ordinary removal:
--
--   1. consumeLicenseWithRewardPriority spends a REWARD credit when one is
--      available (reward_credits_used + 1, used_licenses untouched) and a PAID
--      licence otherwise. Removal did a flat updateOrganizationQuota(-1) on
--      used_licenses regardless. So removing a reward-funded student refunded a
--      paid seat the school never spent, while the reward credit stayed spent
--      forever. The member row recorded neither, so nothing could tell the two
--      apart after the fact — including this migration, which is why the
--      pre-flight below refuses to guess.
--   2. Enrolment was not transactional with consumption: createUserWithCredentials
--      committed its own transaction and consumeLicenseWithRewardPriority ran
--      afterwards as a separate statement. A failure between them left a student
--      enrolled against no licence.
--   3. The capacity check was check-then-act with no lock, so two concurrent
--      bulk imports could both pass it.
--   4. DELETE /api/users/me removed the membership row and decremented nothing.
--
-- A counter that is SET from a COUNT cannot drift. That is the whole change:
-- after this, used_licenses and reward_credits_used are always recomputed from
-- organization_members, never adjusted. But a COUNT cannot distinguish a paid
-- enrolment from a reward-funded one, and nothing in the row said which — hence
-- this column. It is written in the same transaction as the member row, which
-- also closes (2) and, with the org row locked, (3).
--
-- SCOPE — one column, one backfill, one constraint:
--   organization_members.license_source   ('paid' | 'reward', students only)
--
-- THIS MIGRATION DOES NOT RECOMPUTE ANYTHING. It records provenance and stops.
-- No counter is read or written here, so it cannot rewrite a real counter to
-- match a roster. The first recompute for a given school happens on that
-- school's next enrolment or removal, at which point the roster is authoritative
-- by design.
--
-- THE BACKFILL IS 'paid' FOR EVERY EXISTING STUDENT, AND THAT IS EXACT RATHER
-- THAN A DEFAULT. Production was verified before this was written: no
-- organization has ever spent a reward credit
-- (SELECT count(*) FROM organizations WHERE COALESCE(reward_credits_used,0) > 0
--  returns 0), across 2 organizations, and used_licenses agreed with the student
-- roster for every one of them (0 drifting). If no reward credit has ever been
-- spent then every existing student enrolment took the paid branch — there was
-- no other branch to take — so 'paid' is reconstructed, not assumed. The
-- pre-flight below asserts that precondition rather than trusting this comment,
-- because it is the ONLY thing that makes the backfill honest, and it is false
-- on any database where a reward credit has been spent.
--
-- WHY ROLE-SCOPED AND NOT `SET NOT NULL` — the same reason as 014, 015 and 016:
-- this table holds school admins as well as students, and admin rows consume no
-- licence at all (superadmin.routes.ts:501 and :903 create them via
-- createOrganizationMember, which never touched the counters). A blanket NOT NULL
-- would break both for a rule that only ever applied to students. Admin rows keep
-- license_source NULL, and the CHECK short-circuits on `role <> 'student'` exactly
-- as organization_members_student_dob_check does.
--
-- ADDED VALID, NOT `NOT VALID` + VALIDATE: the backfill immediately above it
-- makes every student row satisfy the constraint within this same transaction,
-- so the two-step buys only a second migration. Matches 014 and 016.
--
-- IDEMPOTENT ONLY VIA THE LEDGER, as with every migration here: ADD CONSTRAINT
-- has no IF NOT EXISTS, and the workarounds either reintroduce a DROP or swallow
-- a real error. runner.ts records applied migrations in schema_migrations and
-- skips them, and wraps this whole file in one transaction.

-- Pre-flight. RAISE EXCEPTION rather than NOTICE, and not out of caution: if any
-- organization has spent a reward credit, then some existing student row was
-- reward-funded, NOTHING RECORDS WHICH ONE, and a blanket 'paid' backfill would
-- fabricate provenance — writing a specific false fact into a column whose entire
-- purpose is to be trusted by the counter that derives from it. There is no
-- recovery from that by inspection afterwards, because the evidence it would be
-- recovered from is the thing being overwritten. Better to abort and decide.
DO $$
DECLARE
  offenders text;
  n integer;
BEGIN
  SELECT count(*), string_agg(format('org=%s name=%s reward_credits_used=%s', o.id, o.name, o.reward_credits_used), E'\n  ')
    INTO n, offenders
    FROM organizations o
   WHERE COALESCE(o.reward_credits_used, 0) > 0;

  IF n > 0 THEN
    RAISE EXCEPTION
      '024: % organization(s) have spent reward credits, so a blanket ''paid'' '
      'backfill would fabricate provenance. Nothing on organization_members '
      'records which enrolments were reward-funded. Decide per organization how '
      'to attribute them, backfill by hand, then mark this migration applied:%  %',
      n, E'\n  ', offenders;
  END IF;

  RAISE NOTICE '024: no reward credits have ever been spent; ''paid'' is exact for every student row.';
END $$;

-- Informational only. Drift here is not fatal to THIS migration, which derives
-- nothing — but it is worth naming, because the counters become roster-derived
-- from the next enrolment or removal onward and any disagreement is silently
-- resolved in the roster's favour at that point. Production was 0-drifting when
-- this was written; a dev or staging database may not be.
DO $$
DECLARE
  drifting text;
  n integer;
BEGIN
  SELECT count(*), string_agg(format('org=%s name=%s used_licenses=%s students=%s', o.id, o.name, o.used_licenses, s.cnt), E'\n  ')
    INTO n, drifting
    FROM organizations o
    JOIN LATERAL (
      SELECT count(*) AS cnt FROM organization_members m
       WHERE m.organization_id = o.id AND m.role = 'student'
    ) s ON true
   WHERE o.used_licenses <> s.cnt;

  IF n > 0 THEN
    RAISE NOTICE
      '024: % organization(s) already disagree with their student roster. The '
      'roster wins from the next recompute onward:%  %', n, E'\n  ', drifting;
  ELSE
    RAISE NOTICE '024: used_licenses agrees with the student roster for every organization.';
  END IF;
END $$;

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS license_source text;

-- Exact, per the pre-flight above: with no reward credit ever spent, every
-- existing student enrolment took the paid branch.
UPDATE organization_members
   SET license_source = 'paid'
 WHERE role = 'student'
   AND license_source IS NULL;

-- Role-scoped, so admin rows (license_source NULL) are untouched. The value
-- domain is enforced for students only, matching the shape of
-- organization_members_student_dob_check.
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_student_license_source_check CHECK (
    role <> 'student' OR license_source IN ('paid', 'reward')
  );
