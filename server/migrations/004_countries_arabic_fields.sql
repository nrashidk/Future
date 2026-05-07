-- Migration: Add Arabic content columns to countries table
-- Supports i18n for mission, vision, priority sectors, national goals, and country name
-- Executed: 2026-05-07

ALTER TABLE countries ADD COLUMN IF NOT EXISTS name_ar text;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS mission_ar text;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS vision_ar text;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS priority_sectors_ar text[];
ALTER TABLE countries ADD COLUMN IF NOT EXISTS national_goals_ar text[];
