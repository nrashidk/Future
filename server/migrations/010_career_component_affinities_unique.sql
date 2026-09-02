-- Migration: de-duplicate career_component_affinities and make (career_id, component_id) unique.
--
-- THE DEFECT. This table has only a primary key on `id`. The RIASEC block in
-- server/seed.ts calls storage.createCareerComponentAffinity() unconditionally
-- for every career on every boot and catches SQLSTATE 23505 to "silently
-- continue" if the row already exists — but 23505 can never be raised, because
-- there is no unique constraint for an insert to violate. So every boot inserted
-- one more identical row per career, and the table grew linearly with the number
-- of times the app had ever started.
--
-- Measured on staging before this migration: 358 rows for 68 careers — 37
-- careers x 8 copies and 31 careers x 2. Zero careers had more than one distinct
-- affinity_data payload, so the duplicates were byte-identical and
-- calculateRiasecScore (which does .find(), taking the first match) always
-- returned the right answer. The bug was invisible in the product and unbounded
-- in the table.
--
-- Mirrors `careerComponentAffinities` in shared/schema.ts. Keep the two in sync.
-- Compare career_wef_skill_affinities, which has had
-- career_wef_skill_unique_idx (career_id, wef_skill_id) from the start and is
-- exactly 68 x 16 = 1088 rows with no duplicates — that index is why its seed
-- loop is safe and this one was not.

-- 1. Collapse each (career_id, component_id) group to a single row.
--    The survivor is the OLDEST row: created_at ascending, id ascending as a
--    deterministic tie-break for rows written in the same transaction. Keeping
--    the oldest preserves the original row id and its created_at, so anything
--    that ever referenced it still resolves. Safe regardless of which copy wins
--    here because every duplicate carries identical affinity_data — but the
--    ordering is pinned rather than left to the planner, so re-running this on
--    another environment removes the same rows.
DELETE FROM career_component_affinities a
USING career_component_affinities b
WHERE a.career_id = b.career_id
  AND a.component_id = b.component_id
  AND (
        a.created_at > b.created_at
     OR (a.created_at IS NOT DISTINCT FROM b.created_at AND a.id > b.id)
  );

-- 2. One affinity row per career per component, forever.
--    Both columns are NOT NULL, so a plain (non-partial) unique index is correct
--    here — unlike country_sector_categories, which needed two partial indexes
--    to work around Postgres treating NULLs as distinct.
--
--    This index is not only an integrity guard: it is the ON CONFLICT target for
--    storage.createOrUpdateCareerComponentAffinity(), which the seed's RIASEC
--    loop now uses. Drop the index and that upsert fails with "no unique or
--    exclusion constraint matching the ON CONFLICT specification".
CREATE UNIQUE INDEX IF NOT EXISTS career_component_affinity_unique_idx
  ON career_component_affinities (career_id, component_id);

-- 3. Lookup index for the per-component read path
--    (getCareerComponentAffinitiesByComponent, used to hydrate the matching
--    context). The unique index above already covers career_id-leading lookups.
CREATE INDEX IF NOT EXISTS career_component_affinity_component_idx
  ON career_component_affinities (component_id);
