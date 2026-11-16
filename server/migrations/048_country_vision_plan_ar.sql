-- 048: the national plan's name in Arabic.
--
-- countries.vision_plan held one English string, so the Arabic assessment's
-- country card printed "UAE Centennial 2071" inside Arabic text (student walk,
-- 2026-11-15). Mission, vision, sectors and goals already had an _ar column;
-- the plan's name did not. Owner said translate, 2026-11-16.
--
-- Nullable: a country without one falls back to the English name, as the
-- other _ar columns do. Only the UAE row is filled, and only when its plan is
-- still the seeded name and nobody has set an Arabic one.
--
-- IDEMPOTENT: IF NOT EXISTS, and the UPDATE matches nothing once filled.

ALTER TABLE countries ADD COLUMN IF NOT EXISTS vision_plan_ar text;

UPDATE countries
   SET vision_plan_ar = 'مئوية الإمارات 2071'
 WHERE id = 'uae'
   AND vision_plan = 'UAE Centennial 2071'
   AND vision_plan_ar IS NULL;

-- DOWN (manual, not run by the runner):
-- ALTER TABLE countries DROP COLUMN IF EXISTS vision_plan_ar;
