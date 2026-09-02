-- Migration: add the future-readiness verdict to careers.
--
-- THE GATE. A career whose future_readiness is 'declining' is excluded from a
-- student's recommendations entirely (server/services/matching.ts, step 3d) —
-- not scored down, not shown. Excluding a career means a 15-year-old never
-- learns the option existed, so the bar for setting this value is deliberately
-- high: BOTH the WEF Future of Jobs 2025 fastest-declining list AND the O*NET
-- 'decline' band must agree. A single source yields 'watch', which is a
-- human-review state and never gates.
--
--   'growing' | 'stable' | 'watch' | 'declining'
--
-- Derived by deriveReadiness() in server/services/futureReadiness.ts and
-- backfilled by server/migrations/career-future-readiness.ts.
-- See docs/future-readiness-plan.md B1 and docs/future-readiness-recon.md §1e.
--
-- Occupation-level and COUNTRY-INDEPENDENT, in the same class as
-- careers.values_profile — not the class of job_market_trends. There is no
-- per-country readiness and no countryId anywhere in the derivation.
--
-- Mirrors `careers.futureReadiness` / `careers.futureReadinessSource` in
-- shared/schema.ts. Keep the two in sync.
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: Part A established that push
-- reconciles the ENTIRE schema and, against the current staging branch, plans to
-- DROP the playing_with_neon and schema_migrations tables — the second of which
-- is this runner's own ledger. Additive DDL goes through
-- server/migrations/runner.ts. See docs/future-readiness-partA-done.md §1.

-- 'stable' is the safety default: a row that never receives a computed verdict
-- reads as ordinary and PASSES the gate. A failed backfill, a legacy row or an
-- un-refreshed new-country career must never be silently hidden from a student.
ALTER TABLE careers
  ADD COLUMN IF NOT EXISTS future_readiness TEXT NOT NULL DEFAULT 'stable';

-- Provenance: which source said what, so an adult can answer "why did my
-- student never see this career?" without reading code.
ALTER TABLE careers
  ADD COLUMN IF NOT EXISTS future_readiness_source JSONB;

-- Domain guard, for the same reason onet_growth_band has one: a bare text column
-- with several writers is how growth_outlook ended up with four incompatible
-- vocabularies. The set of values that can gate a career is closed.
ALTER TABLE careers
  DROP CONSTRAINT IF EXISTS careers_future_readiness_check;

ALTER TABLE careers
  ADD CONSTRAINT careers_future_readiness_check
  CHECK (future_readiness IN ('growing', 'stable', 'watch', 'declining'));

-- The gate reads this column for every career on every recommendation run.
CREATE INDEX IF NOT EXISTS careers_future_readiness_idx
  ON careers (future_readiness);
