-- THE LICENCE LEDGER.
--
-- Creates license_consumptions and backfills it from history, so that every
-- licence already spent is represented before any code starts counting rows
-- here. See the block comment on the table in shared/schema.ts for why the
-- model changed; this file is only concerned with getting existing data into
-- the new shape without losing or inventing a charge.
--
-- REVERSIBLE. Nothing is dropped, nothing is rewritten. organization_members
-- .has_completed_assessment, .license_source and .assessment_completed_at all
-- stay exactly as they are -- they stop being READ as the gate, but they keep
-- their values, so the down migration below is a plain DROP TABLE and the old
-- code path still has everything it needs if it has to come back.

CREATE TABLE IF NOT EXISTS license_consumptions (
  id                VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_owner_type   TEXT NOT NULL,
  organization_id   VARCHAR REFERENCES organizations(id),
  guardian_user_id  VARCHAR REFERENCES users(id),
  student_user_id   VARCHAR NOT NULL REFERENCES users(id),
  assessment_id     VARCHAR NOT NULL UNIQUE REFERENCES assessments(id),
  grade             TEXT,
  currency          TEXT NOT NULL,
  consumed_at       TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT license_consumptions_pool_owner_check CHECK (
       (pool_owner_type = 'organization' AND organization_id IS NOT NULL AND guardian_user_id IS NULL)
    OR (pool_owner_type = 'user'         AND guardian_user_id IS NOT NULL AND organization_id IS NULL)
  ),
  CONSTRAINT license_consumptions_currency_check CHECK (currency IN ('paid', 'reward'))
);

CREATE INDEX IF NOT EXISTS license_consumptions_org_idx      ON license_consumptions (organization_id);
CREATE INDEX IF NOT EXISTS license_consumptions_guardian_idx ON license_consumptions (guardian_user_id);
CREATE INDEX IF NOT EXISTS license_consumptions_student_idx  ON license_consumptions (student_user_id, grade);

-- ---------------------------------------------------------------- BACKFILL 1
-- School students.
--
-- The historical charge was the ENROLMENT, and organization_members.license_
-- source records which currency paid for it. A student who enrolled but never
-- finished was charged under the old model and is NOT charged here: that is
-- the whole point of the change, and those licences return to the school's
-- pool when this lands. Schools gain capacity; none is taken away.
--
-- So one row per COMPLETED assessment, carrying forward the currency the
-- enrolment was booked against.
--
-- DISTINCT ON picks one assessment per student even where history holds more
-- than one completed row for a student the old single-allocation rule should
-- have prevented (a detach/re-add cycle could produce this). Charging the
-- earliest is the conservative reading: it never bills a school twice for a
-- student the old model only ever billed once.
INSERT INTO license_consumptions
  (pool_owner_type, organization_id, student_user_id, assessment_id, grade, currency, consumed_at)
SELECT DISTINCT ON (om.user_id)
  'organization',
  om.organization_id,
  om.user_id,
  a.id,
  a.grade,
  COALESCE(om.license_source, 'paid'),
  COALESCE(a.completed_at, om.assessment_completed_at, NOW())
FROM organization_members om
JOIN assessments a
  ON a.user_id = om.user_id
 AND a.is_completed = TRUE
WHERE om.role = 'student'
ORDER BY om.user_id, a.completed_at NULLS LAST, a.id
ON CONFLICT (assessment_id) DO NOTHING;

-- ---------------------------------------------------------------- BACKFILL 2
-- Self-payers (a parent account with a child profile).
--
-- EVERY completed assessment, not one: this population was never metered at
-- all, so the ledger has to show what was actually taken. This is the half
-- that was unbounded, and the backfill is what makes the new limit honest --
-- an account that already ran four reports on one purchase starts with four
-- rows against it, not zero.
--
-- The pool owner is the GUARDIAN account, which is also the student account
-- here: child_profiles.guardian_user_id is .unique(), one child per account,
-- so these are the same user id in both columns by construction.
--
-- Reward credits are a school mechanism; a parent pool is always 'paid'.
INSERT INTO license_consumptions
  (pool_owner_type, guardian_user_id, student_user_id, assessment_id, grade, currency, consumed_at)
SELECT
  'user',
  cp.guardian_user_id,
  a.user_id,
  a.id,
  a.grade,
  'paid',
  COALESCE(a.completed_at, NOW())
FROM child_profiles cp
JOIN assessments a
  ON a.user_id = cp.guardian_user_id
 AND a.is_completed = TRUE
ON CONFLICT (assessment_id) DO NOTHING;

-- Free-tier and guest assessments are deliberately absent: neither spends a
-- licence. The free cap counts completed assessments directly and is unchanged.

-- ------------------------------------------------------------------- RESYNC
-- Bring the two derived counters onto the ledger in the same transaction that
-- fills it, so no deployment window exists in which they disagree. From here
-- on storage.recomputeOrganizationLicenseUsage recomputes them exactly this
-- way, counting ledger rows instead of counting enrolments.
UPDATE organizations o
SET used_licenses = COALESCE(c.paid, 0),
    reward_credits_used = COALESCE(c.reward, 0),
    updated_at = NOW()
FROM (
  SELECT organization_id,
         COUNT(*) FILTER (WHERE currency = 'paid')   AS paid,
         COUNT(*) FILTER (WHERE currency = 'reward') AS reward
  FROM license_consumptions
  WHERE pool_owner_type = 'organization'
  GROUP BY organization_id
) c
WHERE c.organization_id = o.id;

-- A school with no completed assessments now has nothing spent. Under the old
-- enrolment-counting rule its counter read the number of students on its roll,
-- so this is the row that actually hands the unused licences back.
UPDATE organizations o
SET used_licenses = 0,
    reward_credits_used = 0,
    updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM license_consumptions lc
  WHERE lc.organization_id = o.id
);

-- DOWN (manual, not run by the runner):
--   DROP TABLE license_consumptions;
--   -- then re-run storage.recomputeOrganizationLicenseUsage for every org, or:
--   UPDATE organizations o SET used_licenses = COALESCE(c.paid, 0),
--                              reward_credits_used = COALESCE(c.reward, 0)
--   FROM (SELECT organization_id,
--                COUNT(*) FILTER (WHERE license_source = 'paid')   AS paid,
--                COUNT(*) FILTER (WHERE license_source = 'reward') AS reward
--         FROM organization_members WHERE role = 'student'
--         GROUP BY organization_id) c
--   WHERE c.organization_id = o.id;
