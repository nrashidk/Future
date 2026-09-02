-- Migration: add the O*NET projected-growth band to careers.
--
-- careers.growth_outlook was a hand-authored display string with four different
-- writers and four different vocabularies (the seed's "Excellent (25% growth)",
-- the superadmin form's "high"/"medium"/"low", the LLM path's "High"/"Steady",
-- and the client localiser's five known tiers). It was stale or mis-banded on
-- 22 of 68 rows, and it could not express DECLINE at all: the localiser's regex
-- matched only an unsigned percentage and had no declining tier, so two
-- O*NET-declining careers were recorded as "Moderate (0% growth)".
--
-- onet_growth_band replaces it as the source of truth. growth_outlook stays for
-- backwards compatibility but is now DERIVED from the band by
-- growthOutlookFor() in shared/growthBands.ts and must never be authored.
-- See docs/future-readiness-plan.md A1 and docs/future-readiness-recon.md §1a.
--
-- Mirrors `careers.onetGrowthBand` / `careers.onetGrowthSource` in
-- shared/schema.ts. Keep the two in sync.
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: push reconciles the ENTIRE
-- schema and, against the current staging branch, plans to DROP the
-- playing_with_neon and schema_migrations tables and rebuild four foreign-key
-- constraints — none of which this change needs. Additive DDL goes through the
-- tracked runner (server/migrations/runner.ts) instead.

-- 'average' is the safe default: a row that never gets a real band reads as
-- ordinary, never as declining. The backfill
-- (server/migrations/career-growth-bands.ts) overwrites all 68 immediately.
ALTER TABLE careers
  ADD COLUMN IF NOT EXISTS onet_growth_band TEXT NOT NULL DEFAULT 'average';

ALTER TABLE careers
  ADD COLUMN IF NOT EXISTS onet_growth_source JSONB;

-- Domain guard. The whole point of this column is that it cannot become a fifth
-- free-text vocabulary, so the constraint lives in the database and not only in
-- shared/growthBands.ts.
ALTER TABLE careers
  DROP CONSTRAINT IF EXISTS careers_onet_growth_band_check;

ALTER TABLE careers
  ADD CONSTRAINT careers_onet_growth_band_check
  CHECK (onet_growth_band IN (
    'much_faster', 'faster', 'average', 'slower', 'decline', 'not_applicable'
  ));
