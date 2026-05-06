-- Migration 002: Remove legacy Kolb Learning Style assessment component
-- The Kolb key is no longer used in any scoring logic; remove orphaned DB records.

DELETE FROM career_component_affinities
WHERE component_id IN (
  SELECT id FROM assessment_components WHERE key = 'kolb'
);

DELETE FROM assessment_components
WHERE key = 'kolb';
