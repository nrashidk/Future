-- Migration: Add required_skills_ar column to careers table
-- This column stores Arabic translations of the required skills array
-- Executed: 2026-05-07

ALTER TABLE careers ADD COLUMN IF NOT EXISTS required_skills_ar text[];
