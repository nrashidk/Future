-- 041: put the premium reports of individual buyers on the licence ledger.
--
-- A premium account that bought for itself through the public checkout has no
-- child profile and no school. The licence model knew two pools -- a school's
-- and a child profile's -- so this account was on neither: its reports were
-- never charged and never refused, and one licence bought any number of them.
-- The code now treats it as its own pool (shared/licensePool.ts). This is the
-- other half: the reports such an account ALREADY generated have no ledger
-- row, so its balance would read as untouched while its profile -- which
-- counts completed premium assessments -- says some are used. Two screens,
-- two answers, about money.
--
-- Mirrors 029's parent-pool backfill, for the population 029's join on
-- child_profiles left out. Only PREMIUM assessments: a free report taken
-- before the purchase cost nothing and consumed nothing.
--
-- An account that already took more than it bought ends up with more rows
-- than licences. That is the truth, and the balance is floored at zero.
--
-- A superadmin recognised only by SUPERADMIN_EMAILS (not by role) cannot be
-- told apart here and may gain rows. Nothing reads them: the code keeps a
-- superadmin off every pool.
--
-- IDEMPOTENT: assessment_id is unique on the ledger.

INSERT INTO license_consumptions
  (pool_owner_type, guardian_user_id, student_user_id, assessment_id, grade, currency, consumed_at)
SELECT
  'user',
  u.id,
  u.id,
  a.id,
  a.grade,
  'paid',
  COALESCE(a.completed_at, NOW())
FROM users u
JOIN assessments a
  ON a.user_id = u.id
 AND a.is_completed = TRUE
 AND a.assessment_type = 'premium'
WHERE u.is_premium = TRUE
  AND COALESCE(u.role, '') <> 'superadmin'
  AND NOT EXISTS (SELECT 1 FROM organization_members om WHERE om.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM child_profiles cp WHERE cp.guardian_user_id = u.id)
ON CONFLICT (assessment_id) DO NOTHING;

-- DOWN (manual, not run by the runner):
--   DELETE FROM license_consumptions lc
--    WHERE lc.pool_owner_type = 'user'
--      AND NOT EXISTS (SELECT 1 FROM child_profiles cp WHERE cp.guardian_user_id = lc.guardian_user_id);
--   -- Removes EVERY charge on an individual buyer's own pool, including ones
--   -- made after this migration by the code that goes with it. Only run it
--   -- together with reverting that code, which returns these accounts to
--   -- being unmetered.
