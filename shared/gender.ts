/**
 * A STUDENT'S GENDER IS STORED AS 'male' OR 'female', LOWERCASE, AND NOTHING
 * ELSE.
 *
 * The Add Student form has always sent those two values. The CSV import
 * stored whatever the cell held: a school that typed "Male" (which is how a
 * person writes it, and how the roster itself displays it) got a student
 * whose gender every screen then showed as "-", because every reader compares
 * against the lowercase word. Found on production 2026-11-13 by uploading
 * three rows as a superadmin. Accepted at creation, wrong for ever, visible
 * only as a dash.
 *
 * Arabic is accepted because the product is bilingual and a school's own
 * spreadsheet may be too.
 */
export type StudentGender = "male" | "female";

const MALE = new Set(["male", "m", "boy", "ذكر", "ولد"]);
const FEMALE = new Set(["female", "f", "girl", "أنثى", "انثى", "بنت"]);

/** The canonical value, or null when the text names neither. */
export function normalizeGender(raw: unknown): StudentGender | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (MALE.has(v)) return "male";
  if (FEMALE.has(v)) return "female";
  return null;
}

export const GENDER_MESSAGE = "Student gender must be male or female";
