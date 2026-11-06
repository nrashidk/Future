-- REMOVE CURRICULA THAT CANNOT BE USED.
--
-- A country lists its curricula in countries.curricula, and a student picks
-- their subjects from the `subjects` table keyed by (country, curriculum). The
-- two were never checked against each other, so a curriculum could be offered
-- in the dropdown with no subjects behind it. UAE offers four and only
-- MOE National has any: British, American and IB each have zero.
--
-- The effect is not degradation, it is a dead end. The assessment makes a
-- student choose three subjects (MIN_SUBJECTS in SubjectsStep), so a
-- curriculum with none cannot be got past the first step at all. Nothing
-- refuses the choice, so it is only discovered by a student sitting in front
-- of an empty list.
--
-- CONSERVATIVE BY CONSTRUCTION. This removes a curriculum only when all three
-- are true:
--
--   1. it has NO subject rows -- so nobody could ever have completed an
--      assessment under it;
--   2. no organization is set to it;
--   3. no assessment records it.
--
-- Conditions 2 and 3 matter because an earlier migration added validation that
-- refuses an organization or assessment whose curriculum its country does not
-- offer. Removing a curriculum still in use would turn existing rows into
-- permanently invalid ones -- trading a dead end for a lockout. If a
-- curriculum IS in use, it is left alone and its subjects need seeding
-- instead; that is a content decision, not a migration.
--
-- REVERSIBLE: the down statement at the foot restores UAE's original list.

WITH in_use AS (
  SELECT DISTINCT country_id, curriculum FROM organizations
  WHERE curriculum IS NOT NULL AND country_id IS NOT NULL
  UNION
  SELECT DISTINCT country_id, curriculum FROM assessments
  WHERE curriculum IS NOT NULL AND country_id IS NOT NULL
),
has_subjects AS (
  SELECT DISTINCT country_id, curriculum FROM subjects WHERE is_active = TRUE
),
removable AS (
  SELECT c.id AS country_id, x.curriculum
  FROM countries c
  CROSS JOIN LATERAL unnest(COALESCE(c.curricula, ARRAY[]::text[])) AS x(curriculum)
  WHERE NOT EXISTS (
          SELECT 1 FROM has_subjects s
          WHERE s.country_id = c.id AND s.curriculum = x.curriculum)
    AND NOT EXISTS (
          SELECT 1 FROM in_use u
          WHERE u.country_id = c.id AND u.curriculum = x.curriculum)
),
kept AS (
  -- WITH ORDINALITY and an explicit ORDER BY, because the surviving list must
  -- keep the order it was authored in. Without them the anti-join is free to
  -- return the elements in any order, and it does: a first run turned
  -- ['MOE National','British',...] into ['British','MOE National']. The UI
  -- treats the first entry as the default curriculum, so a reorder silently
  -- changes which curriculum a new school is created under.
  SELECT c.id AS country_id,
         ARRAY(
           SELECT x.curriculum
           FROM unnest(COALESCE(c.curricula, ARRAY[]::text[])) WITH ORDINALITY AS x(curriculum, ord)
           WHERE NOT EXISTS (
             SELECT 1 FROM removable r
             WHERE r.country_id = c.id AND r.curriculum = x.curriculum)
           ORDER BY x.ord
         ) AS curricula
  FROM countries c
)
UPDATE countries c
SET curricula = k.curricula,
    updated_at = NOW()
FROM kept k
WHERE k.country_id = c.id
  AND k.curricula IS DISTINCT FROM COALESCE(c.curricula, ARRAY[]::text[]);

-- DOWN (manual, not run by the runner). Restores the list UAE shipped with.
-- Only do this alongside seeding the subjects, or the dead end comes back:
--   UPDATE countries
--   SET curricula = ARRAY['MOE National','British','American','IB']
--   WHERE id = 'uae';
