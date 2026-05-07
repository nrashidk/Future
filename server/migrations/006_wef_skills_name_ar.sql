-- Add Arabic name column to wef_skills table
ALTER TABLE wef_skills ADD COLUMN IF NOT EXISTS name_ar TEXT;
