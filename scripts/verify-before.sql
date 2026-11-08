-- BASELINE, TO RUN **BEFORE** MIGRATIONS 029-033.
--
-- Paste the whole file into any SQL console. It writes nothing.
--
-- WHY THIS IS A SEPARATE FILE FROM verify-after.sql: before the migrations
-- run, license_consumptions, license_grants, contribution_reviews and the two
-- countries.license_* columns DO NOT EXIST. SQL resolves table and column
-- names when it parses, so a single script that mentions them fails outright
-- on the "before" run — you would get "relation does not exist" and no
-- baseline at all. This file touches only what is already there.
--
-- Save the output. After the migrations, run verify-after.sql and compare:
-- query 1's used_licenses column must be UNCHANGED for every school, and
-- query 3's curricula arrays must keep their ORDER.

-- ============================================================
-- QUERY 1 — licence usage per school, as it stands today. KEEP THIS OUTPUT.
--
-- 029 RECOMPUTES used_licenses from a new ledger, so these numbers WILL
-- change for any school whose old counter had drifted. That is the migration
-- working, not failing — but every change needs a reason.
--
-- Compare this against query 2 of verify-after.sql school by school. A small
-- change, or none, is expected. A school that jumps by a lot means its old
-- counter disagreed with what its students actually consumed: send both
-- outputs before going near production.
-- ============================================================
SELECT
  o.name,
  o.total_licenses,
  o.used_licenses,
  o.reward_credits_used,
  o.is_unlimited_licenses AS unlimited
FROM organizations o
ORDER BY o.name;

-- ============================================================
-- QUERY 2 — how many completed assessments exist.
-- 029 creates one ledger row per completed assessment. After the migration,
-- "covered" in verify-after.sql should equal this number.
-- ============================================================
-- is_completed is the marker the migration actually joins on. completed_at is
-- reported beside it because the two CAN disagree, and the difference is
-- exactly how many licences the backfill will or will not create.
SELECT
  count(*) FILTER (WHERE is_completed) AS completed_by_flag,
  count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed_by_timestamp,
  count(*) FILTER (WHERE is_completed AND completed_at IS NULL) AS flagged_no_timestamp,
  count(*) FILTER (WHERE NOT is_completed AND completed_at IS NOT NULL) AS timestamped_not_flagged,
  count(DISTINCT user_id) FILTER (WHERE is_completed) AS distinct_students
FROM assessments;

-- ============================================================
-- QUERY 3 — curricula per country, in their current ORDER.
-- 030 rewrites these arrays to drop empty curricula. The FIRST entry is the
-- default a new school gets, so a reordered array silently changes it.
-- Compare this list element by element afterwards.
-- ============================================================
SELECT
  id, code, name,
  curricula,
  curricula[1] AS default_curriculum,
  array_length(curricula, 1) AS how_many
FROM countries
ORDER BY id;

-- ============================================================
-- QUERY 4 — which migrations are already applied.
-- Expect NOTHING from 029 upward. Anything listed here means part of this
-- batch has already run: stop and say so before going further.
-- ============================================================
SELECT name, applied_at
FROM schema_migrations
ORDER BY name DESC
LIMIT 10;
