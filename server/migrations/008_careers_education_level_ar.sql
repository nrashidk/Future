-- Add Arabic education level to careers table
ALTER TABLE careers ADD COLUMN IF NOT EXISTS education_level_ar TEXT;
