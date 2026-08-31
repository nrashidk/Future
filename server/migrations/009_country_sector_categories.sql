-- Migration: Add country_sector_categories table (VISION ALIGNMENT)
-- Backs calculateVisionScore (server/services/matching.ts) and is written by the
-- vision-alignment block in server/seed.ts. Without this table the seed throws,
-- the sector-category map fails to load, and every career floors at 40 - i.e.
-- the 20%/30% vision weight cannot discriminate between careers at all.
--
-- Mirrors `countrySectorCategories` in shared/schema.ts. Keep the two in sync.

CREATE TABLE IF NOT EXISTS country_sector_categories (
  id              VARCHAR PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  sector_id       VARCHAR NOT NULL,
  career_category TEXT,
  career_id       VARCHAR,
  relevance       INTEGER NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  CONSTRAINT country_sector_categories_sector_id_country_priority_sectors_id_fk
    FOREIGN KEY (sector_id) REFERENCES country_priority_sectors(id),
  CONSTRAINT country_sector_categories_career_id_careers_id_fk
    FOREIGN KEY (career_id) REFERENCES careers(id),
  -- Exactly one of career_category / career_id must be set: a row is either a
  -- category rule or a per-career override, never both and never neither.
  CONSTRAINT sector_category_shape_check
    CHECK ((career_category IS NOT NULL) <> (career_id IS NOT NULL)),
  CONSTRAINT sector_category_relevance_range_check
    CHECK (relevance >= 0 AND relevance <= 100)
);

-- Postgres NULL trap: a single unique index on
-- (sector_id, career_category, career_id) would NOT work - Postgres treats NULLs
-- as distinct, so duplicate rows would slip through silently. Two PARTIAL unique
-- indexes are used instead. These are MANDATORY, not just for data integrity:
-- the seed's upserts (createOrUpdateSectorCategoryRule /
-- createOrUpdateSectorCareerOverride in server/storage.ts) use them as their
-- ON CONFLICT targets, WHERE predicate included. Without them the seed fails
-- with "no unique or exclusion constraint matching the ON CONFLICT specification".

-- Category rules: one relevance per (sector, category).
CREATE UNIQUE INDEX IF NOT EXISTS sector_category_rule_unique_idx
  ON country_sector_categories (sector_id, career_category)
  WHERE career_id IS NULL;

-- Per-career overrides: one relevance per (sector, career).
CREATE UNIQUE INDEX IF NOT EXISTS sector_category_override_unique_idx
  ON country_sector_categories (sector_id, career_id)
  WHERE career_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sector_category_sector_idx
  ON country_sector_categories (sector_id);

CREATE INDEX IF NOT EXISTS sector_category_category_idx
  ON country_sector_categories (career_category);

CREATE INDEX IF NOT EXISTS sector_category_career_idx
  ON country_sector_categories (career_id);
