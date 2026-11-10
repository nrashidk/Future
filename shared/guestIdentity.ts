/**
 * WHAT A GUEST IS ASKED FOR, AND WHAT IS NEVER STORED ABOUT ONE.
 *
 * A guest is an anonymous visitor with no account, taking the free assessment.
 * Until now they were required to enter their NAME, AGE, GRADE and GENDER
 * before they could continue — so a thirteen-year-old could type their real
 * name and age into a public web form, with nobody's permission, and it was
 * written to the database.
 *
 * The Terms said the opposite: "a parent or legal guardian, or the student's
 * school, must give consent before a student takes an assessment." On the
 * guest path neither does. What exists is a tick confirming the STUDENT agrees
 * to the Terms — which is a terms acceptance, not a guardian's consent, and a
 * minor cannot give the second by making the first.
 *
 * THE FIX IS TO ASK FOR LESS, not to add a checkbox. A tick saying "my parent
 * agreed" is unverifiable: it would store evidence of a click and change
 * nothing about who actually decided. Removing the identity fields removes the
 * thing consent would have been needed FOR, and costs the product nothing —
 * nothing is addressed to a guest, they cannot download the PDF (it is
 * tier-gated), and the row is deleted within 72 hours either way.
 *
 * GRADE STAYS, and is not optional. It selects the question pool
 * (`quiz_questions.grade`), so without it the quiz cannot be built at all. It
 * is also not identifying on its own: "someone in Grade 10" names nobody.
 *
 * AGE WAS NEVER USED FOR ANYTHING. Grep for `assessment.age` outside storage
 * and the only reads are this gate and the results card that displays it back.
 * It fed no score, no prompt and no recommendation.
 *
 * THE SERVER DOES THE WITHHOLDING, not the form. Hiding three inputs is UX; a
 * crafted POST would still store whatever it liked. `withholdGuestIdentity` is
 * applied on the create and update routes, which is the control — the same
 * rule as "never ask the client to claim something the server derives",
 * pointing the other way.
 */

/**
 * The fields a guest assessment never holds. Named once so the form, the two
 * gates and the two routes cannot drift — this repo's recurring failure is the
 * same list written out in several places and quietly disagreeing.
 */
export const GUEST_WITHHELD_FIELDS = ["name", "age", "gender"] as const;

export type GuestWithheldField = (typeof GUEST_WITHHELD_FIELDS)[number];

/** The shape both gates inspect. `Assessment` satisfies it as-is. */
export interface IdentityFields {
  name?: string | null;
  age?: number | null;
  grade?: string | null;
  gender?: string | null;
}

/**
 * Strips the identity fields from a payload when the caller is a guest.
 *
 * Returns a NEW object; the input is not mutated, because both call sites pass
 * a validated payload that other code reads afterwards.
 *
 * Sets them to `null` rather than deleting the keys. A deleted key on a PATCH
 * means "leave the column alone", which would let a guest set a name on the
 * first request and keep it for ever by omitting it on the second. An explicit
 * null overwrites, so the column is cleared on every write.
 */
export function withholdGuestIdentity<T extends Record<string, any>>(
  payload: T,
  isGuest: boolean,
): T {
  if (!isGuest) return payload;
  const out: Record<string, any> = { ...payload };
  for (const field of GUEST_WITHHELD_FIELDS) {
    if (field in out) out[field] = null;
  }
  return out as T;
}

/**
 * Has the basic-info step collected what it needs?
 *
 * A guest needs GRADE and nothing else. Anyone with an account still needs all
 * four: a school student's name, age and gender come from the record the
 * school already holds with consent attached, and a parent-registered child's
 * from the guardian who registered them. Those are pre-filled and locked in
 * the form, so this is not extra typing for anybody — it is the difference
 * between data someone consented to and data nobody did.
 *
 * `isGuest` is a REQUIRED argument rather than an optional one, and is not
 * derived from a `userId` on the assessment. Deriving it would read an
 * absent-because-not-selected column as "guest", and the direction of that
 * mistake is the dangerous one: an authenticated student would skip the step
 * that collects their own details. A required argument makes the compiler ask
 * every caller.
 */
export function basicInfoComplete(a: IdentityFields, isGuest: boolean): boolean {
  if (!a.grade) return false;
  if (isGuest) return true;
  return (
    !!a.name &&
    a.age !== null &&
    a.age !== undefined &&
    !!a.gender
  );
}
