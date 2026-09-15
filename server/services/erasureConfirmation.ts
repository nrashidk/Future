/**
 * Asking again before an account is erased.
 *
 * DELETE /api/users/me is the one act in the product that cannot be undone, and
 * the person clicking it may be on a shared school computer where the last
 * student never signed out. A live session proves a browser, not a person, so
 * the route asks for something the session does not carry.
 *
 * TWO CHECKS, AND THEY ARE NOT THE SAME STRENGTH.
 *
 *   password      Accounts that have one — every school-issued account and
 *                 every email registration. Verified against the hash. This is
 *                 re-authentication.
 *
 *   confirmEmail  Accounts without one (Google or Microsoft sign-in). The
 *                 account's email address must be typed. That address is shown
 *                 on Profile, so this proves DELIBERATE INTENT, NOT IDENTITY:
 *                 someone at an unattended session can read it and type it.
 *                 Proving identity would need a fresh round-trip to the
 *                 provider, which the OAuth flow does not offer today.
 *
 * An account with a password may not use the email path. The weaker check
 * exists only for accounts that have nothing stronger.
 *
 * An account with neither is refused, not waved through. upsertOAuthUser
 * creates the user with no email when the provider supplies none, so this is a
 * reachable state, and "nothing to confirm with" must not read as "confirmed".
 */

import { z } from "zod";
import type { User } from "@shared/schema";
import type { ErasureConfirmationMethod } from "@shared/dataRights";
import { verifyPassword } from "../utils/passwordHash";

/** What this account would be asked for. Null: it cannot be confirmed at all. */
export function erasureConfirmationMethod(
  user: Pick<User, "passwordHash" | "email">,
): ErasureConfirmationMethod | null {
  if (user.passwordHash) return "password";
  if (user.email) return "email";
  return null;
}

const confirmationBody = z.object({
  password: z.string().max(1024).optional(),
  confirmEmail: z.string().max(320).optional(),
});

export interface ErasureConfirmationRefusal {
  status: 400 | 403 | 409;
  code:
    | "ERASURE_CONFIRMATION_INVALID"
    | "ERASURE_PASSWORD_REQUIRED"
    | "ERASURE_PASSWORD_INCORRECT"
    | "ERASURE_EMAIL_REQUIRED"
    | "ERASURE_EMAIL_MISMATCH"
    | "ERASURE_CONFIRMATION_UNAVAILABLE";
  message: string;
}

/** Null when the request confirms the erasure; otherwise why it does not. */
export async function refuseErasureConfirmation(
  user: Pick<User, "passwordHash" | "email">,
  body: unknown,
): Promise<ErasureConfirmationRefusal | null> {
  const parsed = confirmationBody.safeParse(body ?? {});
  if (!parsed.success) {
    return { status: 400, code: "ERASURE_CONFIRMATION_INVALID", message: "Invalid confirmation." };
  }
  const { password, confirmEmail } = parsed.data;

  switch (erasureConfirmationMethod(user)) {
    case "password":
      if (!password) {
        return { status: 400, code: "ERASURE_PASSWORD_REQUIRED", message: "Enter your password to delete your account." };
      }
      if (!(await verifyPassword(password, user.passwordHash!))) {
        return { status: 403, code: "ERASURE_PASSWORD_INCORRECT", message: "That password is not correct. Nothing was deleted." };
      }
      return null;

    case "email":
      if (!confirmEmail?.trim()) {
        return { status: 400, code: "ERASURE_EMAIL_REQUIRED", message: "Type your email address to delete your account." };
      }
      // Case and surrounding spaces are how a person types an address, not a
      // different address. upsertOAuthUser stores it lowercased.
      if (confirmEmail.trim().toLowerCase() !== user.email!.trim().toLowerCase()) {
        return { status: 403, code: "ERASURE_EMAIL_MISMATCH", message: "That email address does not match this account. Nothing was deleted." };
      }
      return null;

    default:
      return {
        status: 409,
        code: "ERASURE_CONFIRMATION_UNAVAILABLE",
        message: "This account has no password or email address to confirm with, so it cannot be deleted here.",
      };
  }
}
