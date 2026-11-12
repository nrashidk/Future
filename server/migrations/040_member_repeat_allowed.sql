-- 040: a school decides whether a student may repeat a grade's assessment.
--
-- Owner's decision, 2026-11-12. One licence is one report, and since the
-- licence moved from the student to the school's POOL nothing has stood
-- between one student and the whole balance: a student with a finished report
-- could start another, and another, each spending a licence. Repeating a
-- grade is still possible — a student does repeat a year — but it is the
-- SCHOOL's call, per student, and it is spent by use: starting the repeat
-- clears it, so one permission is one more attempt and not a standing licence
-- to drain the pool.
--
-- A BOOLEAN ON THE MEMBER ROW. It is a fact about a student's membership of
-- a school, it references no person, and it has no history worth keeping —
-- who allowed it is in the security log. FALSE by default, so every existing
-- student is blocked from repeating until their school says otherwise, which
-- is the safe direction.
--
-- ADDITIVE AND REVERSIBLE. No backfill.

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS repeat_allowed BOOLEAN NOT NULL DEFAULT false;

-- DOWN (manual, not run by the runner):
--   ALTER TABLE organization_members DROP COLUMN IF EXISTS repeat_allowed;
--   -- Safe: nothing references it. What is lost is any permission a school
--   -- had granted and a student had not yet used.
