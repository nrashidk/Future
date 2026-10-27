/**
 * The decision behind PATCH /api/superadmin/users/:id/email, extracted so it
 * can be tested directly.
 *
 * It lives here rather than inline in the route for the same reason
 * bulkExportSelection.ts does: the valuable property is a REFUSAL, and a
 * refusal that only exists inside a 200-line handler is verified by reading
 * rather than by running. Mounting superadmin.routes.ts in a test means
 * mocking Stripe, file storage and db.ts to assert that one string comparison
 * happens — so in practice nobody would, and the guard would be checked by
 * eye forever.
 *
 * WHY THESE GUARDS EXIST AT ALL. Superadmin is not a column on users. It is
 * recomputed on every privileged request by testing the account's email
 * against SUPERADMIN_EMAILS (server/middleware/auth.middleware.ts:7). An
 * endpoint that writes emails is therefore an endpoint that grants and revokes
 * platform administration, whatever the form around it is labelled.
 */

export type EmailChangeVerdict =
  | { ok: true; email: string; unchanged: boolean }
  | { ok: false; status: 400 | 403 | 409; code: string; message: string };

export interface EmailChangeInput {
  /** Raw address from the request body. */
  rawEmail: string;
  /** The account being edited. */
  targetId: string;
  targetEmail: string | null;
  /** SUPERADMIN_EMAILS, already lowercased by getSuperadminEmails(). */
  superadminEmails: string[];
  /** id of whichever account already holds the normalized address, or null. */
  conflictingUserId: string | null;
}

/**
 * Normalize to the one form everything else uses.
 *
 * Login looks an address up lowercased (auth.ts:166) and getSuperadminEmails
 * lowercases at read, so a guard that compared one spelling while the row
 * stored another would be checking a value that never exists. Every
 * comparison below, and the string actually written, come from here.
 */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function evaluateEmailChange(input: EmailChangeInput): EmailChangeVerdict {
  const email = normalizeEmail(input.rawEmail);

  // Guard 1 — escalation. Writing a reserved address into any row makes that
  // account a platform administrator from its next request. Granting that has
  // to stay an environment change made by someone who can deploy, never a
  // field an operator fills in.
  if (input.superadminEmails.includes(email)) {
    return {
      ok: false,
      status: 403,
      code: "RESERVED_EMAIL",
      message: "That address is reserved for platform administrators and cannot be assigned here.",
    };
  }

  // Guard 2 — the same door from the other side. If the TARGET currently holds
  // a reserved address, moving it off silently revokes their access with no
  // environment change to explain why. The likeliest victim is the operator
  // performing the edit, since they are the likeliest superadmin.
  if (input.targetEmail && input.superadminEmails.includes(normalizeEmail(input.targetEmail))) {
    return {
      ok: false,
      status: 403,
      code: "SUPERADMIN_EMAIL_IMMUTABLE",
      message: "This account's address is configured as a platform administrator. Change SUPERADMIN_EMAILS first.",
    };
  }

  // Checked before uniqueness: re-submitting an unchanged address would
  // otherwise collide with the account's own row and report EMAIL_TAKEN
  // against itself.
  if (input.targetEmail && normalizeEmail(input.targetEmail) === email) {
    return { ok: true, email, unchanged: true };
  }

  // Guard 3 — uniqueness. Two rows sharing an address makes getUserByEmail's
  // result arbitrary, and that result decides who a password reset reaches and
  // which account an email login authenticates as.
  if (input.conflictingUserId && input.conflictingUserId !== input.targetId) {
    return {
      ok: false,
      status: 409,
      code: "EMAIL_TAKEN",
      message: "Another account already uses that email address.",
    };
  }

  return { ok: true, email, unchanged: false };
}
