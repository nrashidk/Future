-- 043: A CHARGED REPORT'S LEDGER ROW MUST SURVIVE THE STUDENT'S ERASURE.
--
-- license_consumptions.student_user_id and .assessment_id were NOT NULL
-- foreign keys with no cascade. So from the day the ledger arrived (029), a
-- student with a generated, charged report could not be erased at all: the
-- delete of their assessment hit the foreign key. A school's "Delete record
-- permanently" answered 500, and so did the student's own erasure -- for a
-- minor, the right to erasure blocked by an accounting row. Found on
-- production 2026-11-13 on a test student.
--
-- The row cannot simply be deleted with the student: used licences are
-- COUNTED from this table, so deleting it would hand the school its licence
-- back. "A student who leaves takes nothing" is the rule. What goes is the
-- pointer to the person and to their report; what stays is that this school
-- spent one licence, at this grade, on this date.
--
-- So both columns become nullable, and accountErasure.ts sets them to NULL
-- for a school's row (and deletes an individual's own rows, whose pool goes
-- with the account). The UNIQUE on assessment_id is untouched: NULLs are
-- distinct, so any number of erased rows coexist.

ALTER TABLE license_consumptions ALTER COLUMN student_user_id DROP NOT NULL;
ALTER TABLE license_consumptions ALTER COLUMN assessment_id   DROP NOT NULL;

-- DOWN (paste by hand). Fails, correctly, once any erased row exists: those
-- rows cannot be given a student back.
--
-- ALTER TABLE license_consumptions ALTER COLUMN student_user_id SET NOT NULL;
-- ALTER TABLE license_consumptions ALTER COLUMN assessment_id   SET NOT NULL;
