-- Migration: Remove Kolb Learning Style assessment type
-- Executed: 2026-04-28
-- Migrates legacy 'kolb' and 'kolb_premium' assessment_type values to 'premium'
-- Also drops the kolb_scores column (handled by drizzle db:push --force)

UPDATE assessments
SET assessment_type = 'premium'
WHERE assessment_type IN ('kolb', 'kolb_premium');

-- Note: kolb_scores column was dropped via `npx drizzle-kit push --force`
-- 13 records were migrated in production
