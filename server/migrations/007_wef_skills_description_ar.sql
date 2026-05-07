-- Add Arabic description column to wef_skills table
ALTER TABLE wef_skills ADD COLUMN IF NOT EXISTS description_ar TEXT;
