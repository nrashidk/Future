-- Migration: Remove Kolb Learning Style assessment type
-- Executed: 2026-04-28
-- Migrates legacy 'kolb' and 'kolb_premium' assessment_type values to 'premium'
-- Drops the kolb_scores column from the assessments table

-- Step 1: Backfill assessment_type (13 records migrated)
UPDATE assessments
SET assessment_type = 'premium'
WHERE assessment_type IN ('kolb', 'kolb_premium');

-- Step 2: Drop the Kolb scores column
ALTER TABLE assessments DROP COLUMN IF EXISTS kolb_scores;
