-- Migration: canonicalize STUDENT grade to 'grade8'..'grade12' | 'graduated'.
--
-- Student grade was written in three incompatible formats, so one grade denoted
-- up to three distinct stored values:
--
--   'grade10'  the assessment Demographics step (the bulk of rows)
--   '10'       the admin add-student select, inherited into assessments.grade
--              for every school student
--   'NaN'      a parseInt() on a text column in the member PATCH handler
--
-- That is the single root cause of the analytics "Grade 10 twice" bar, the
-- broken per-grade Career Journey link, and the blocked next-grade
-- re-assessment path. See docs/v2-phase2-recon.md §1a and §5.
--
-- SCOPE — exactly two columns, both `text` and both nullable:
--   assessments.grade            (shared/schema.ts:596)
--   organization_members.grade   (shared/schema.ts:158)
--
-- DO NOT WIDEN THIS. `quiz_questions.grade` is `integer NOT NULL` and means
-- which grade a QUESTION targets, not which grade a student is in. It is
-- already single-format and is not touched here. Same for
-- `countries.grade_levels`.
--
-- WHY A .sql MIGRATION AND NOT `npm run db:push`: push reconciles the ENTIRE
-- schema and, against the current staging branch, plans to DROP the
-- schema_migrations table — this runner's own ledger. It is also the wrong tool
-- regardless: this is a DATA rewrite with no DDL at all. Goes through
-- server/migrations/runner.ts, which wraps the file in one transaction.
--
-- ORDERING — this migration MUST land after the write-site fixes (the admin
-- select, the member PATCH parseInt, the CSV paths). Canonicalizing rows while
-- a writer still emits '10' just re-dirties the table. Those fixes are in the
-- same change as this file.
--
-- NO DDL ON PURPOSE: no CHECK constraint and no enum. A CHECK would reject the
-- `ELSE raw` rows this normalizer deliberately preserves. Enforcement lives in
-- shared/grade.ts at the write sites, where it can return a 400 with a useful
-- message. Revisit a constraint once production is confirmed clean.

-- The normalizer, inlined rather than kept in a pg_temp function: the runner
-- takes its connection from a pool, and a temp function would outlive this
-- migration on that pooled connection. Applied identically to both tables.
--
-- Semantics, each line deliberate:
--   * already canonical  -> unchanged. This is what makes the whole migration
--     idempotent: a second run matches zero rows.
--   * NULL / empty       -> NULL. Absent stays absent; empty was never a grade.
--   * 'NaN'              -> NULL. The parseInt artifact. The original grade is
--     already destroyed and nothing in the row recovers it, so NULL is the
--     honest answer; inventing one would put a wrong grade in a minor's record.
--   * digits naming a supported grade -> 'gradeN'. This is the real work: the
--     bare-numeric rows from the admin select. The \D strip matches the
--     tolerance already shipped in the quiz and narrative readers, so a row this
--     accepts is a row those already understood.
--   * anything else      -> LEFT ALONE and reported by the post-check below.
--     A digit core outside 8-12 ('7', '13') is never coerced to a neighbour.
--
-- This mirrors shared/grade.ts toCanonicalGrade for every bucket that CONVERTS.
-- The one deliberate divergence is the fall-through: the TypeScript function
-- returns null so a write can be REJECTED at the API boundary, while this
-- migration returns the row unchanged so no stored data is destroyed. Different
-- jobs, same conversions.

UPDATE organization_members       -- upstream table first: it feeds assessments.grade
   SET grade = CASE
         WHEN grade ~ '^grade(8|9|10|11|12)$'                    THEN grade
         WHEN grade = 'graduated'                                THEN grade
         WHEN grade IS NULL                                      THEN NULL
         WHEN btrim(grade) = ''                                  THEN NULL
         WHEN grade = 'NaN'                                      THEN NULL
         WHEN regexp_replace(grade, '\D', '', 'g') IN ('8','9','10','11','12')
              THEN 'grade' || regexp_replace(grade, '\D', '', 'g')
         ELSE grade
       END,
       updated_at = now()
 WHERE grade IS DISTINCT FROM CASE
         WHEN grade ~ '^grade(8|9|10|11|12)$'                    THEN grade
         WHEN grade = 'graduated'                                THEN grade
         WHEN grade IS NULL                                      THEN NULL
         WHEN btrim(grade) = ''                                  THEN NULL
         WHEN grade = 'NaN'                                      THEN NULL
         WHEN regexp_replace(grade, '\D', '', 'g') IN ('8','9','10','11','12')
              THEN 'grade' || regexp_replace(grade, '\D', '', 'g')
         ELSE grade
       END;

-- `IS DISTINCT FROM`, not `<>`, so a NULL grade compares correctly and is
-- skipped rather than being silently excluded by three-valued logic. This WHERE
-- is what makes the UPDATE both idempotent (a second run touches 0 rows) and
-- countable (the row count IS the number of rows actually repaired).

UPDATE assessments
   SET grade = CASE
         WHEN grade ~ '^grade(8|9|10|11|12)$'                    THEN grade
         WHEN grade = 'graduated'                                THEN grade
         WHEN grade IS NULL                                      THEN NULL
         WHEN btrim(grade) = ''                                  THEN NULL
         WHEN grade = 'NaN'                                      THEN NULL
         WHEN regexp_replace(grade, '\D', '', 'g') IN ('8','9','10','11','12')
              THEN 'grade' || regexp_replace(grade, '\D', '', 'g')
         ELSE grade
       END,
       updated_at = now()
 WHERE grade IS DISTINCT FROM CASE
         WHEN grade ~ '^grade(8|9|10|11|12)$'                    THEN grade
         WHEN grade = 'graduated'                                THEN grade
         WHEN grade IS NULL                                      THEN NULL
         WHEN btrim(grade) = ''                                  THEN NULL
         WHEN grade = 'NaN'                                      THEN NULL
         WHEN regexp_replace(grade, '\D', '', 'g') IN ('8','9','10','11','12')
              THEN 'grade' || regexp_replace(grade, '\D', '', 'g')
         ELSE grade
       END;

-- Post-condition, logged as a NOTICE rather than raised as an error.
--
-- Rows left non-canonical here are the `ELSE raw` fall-through — values the
-- normalizer refused to guess at. They are a triage list for a human, NOT a
-- failure: aborting the transaction over one weird spreadsheet cell would roll
-- back every legitimate repair. The runner already rolls back on a real error.
DO $$
DECLARE
  leftovers text;
BEGIN
  SELECT string_agg(format('%s.grade=%L (%s rows)', tbl, grade, n), ', ')
    INTO leftovers
    FROM (
      SELECT 'assessments' AS tbl, grade, count(*) AS n
        FROM assessments
       WHERE grade IS NOT NULL
         AND grade !~ '^grade(8|9|10|11|12)$'
         AND grade <> 'graduated'
       GROUP BY grade
      UNION ALL
      SELECT 'organization_members', grade, count(*)
        FROM organization_members
       WHERE grade IS NOT NULL
         AND grade !~ '^grade(8|9|10|11|12)$'
         AND grade <> 'graduated'
       GROUP BY grade
    ) s;

  IF leftovers IS NULL THEN
    RAISE NOTICE '013: student grade is fully canonical in both tables.';
  ELSE
    RAISE NOTICE '013: values left unconverted for human triage: %', leftovers;
  END IF;
END $$;
