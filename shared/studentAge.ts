/**
 * THE AGE A STUDENT MAY TYPE: 13 to 18.
 *
 * The product is for students aged 13-18 (Terms). The assessment's own age
 * field accepted 45 on the individual's path (premium walk 2026-11-12, again
 * 2026-11-15); the owner decided 13-18 on 2026-11-16.
 *
 * TYPED AGES ONLY. A school student's age is derived from the school's date of
 * birth and a parent-registered child's from the child profile; both overwrite
 * whatever the client sends, and neither is judged here — refusing a school's
 * own record would strand a student on step 1 with a locked field.
 */
export const STUDENT_MIN_AGE = 13;
export const STUDENT_MAX_AGE = 18;

export function isAllowedStudentAge(age: unknown): boolean {
  return (
    typeof age === "number" &&
    Number.isInteger(age) &&
    age >= STUDENT_MIN_AGE &&
    age <= STUDENT_MAX_AGE
  );
}

export const AGE_OUT_OF_RANGE_MESSAGE =
  `Age must be a whole number from ${STUDENT_MIN_AGE} to ${STUDENT_MAX_AGE}.`;
