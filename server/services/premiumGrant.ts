import type { User } from "@shared/schema";
import { storage } from "../storage";

/**
 * Shared premium-grant path for individual (non-organization) purchases.
 *
 * Used by both the interactive checkout and the Stripe webhook backstop, so a
 * buyer who pays but never reaches /api/checkout/complete (tab closed, network
 * drop, browser crash) still receives what they paid for.
 *
 * Resolution is by email. Idempotent: an account that is already premium is a
 * no-op - this never double-grants and never clobbers an existing account.
 */

export interface GrantIndividualPremiumInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  studentCount: number;
  stripeCustomerId?: string | null;
}

export type GrantIndividualPremiumResult =
  | { status: "granted"; user: User; credentials?: { username: string; password: string; email: string } }
  | { status: "already_premium"; user: User }
  | { status: "skipped_oauth" };

export async function grantIndividualPremium(
  input: GrantIndividualPremiumInput
): Promise<GrantIndividualPremiumResult> {
  const { email, firstName, lastName, phone, studentCount, stripeCustomerId } = input;

  const existingUser = await storage.getUserByEmail(email);

  if (!existingUser) {
    // No account yet - create one, already premium, with generated credentials
    const result = await storage.createStandaloneUser({
      firstName,
      lastName,
      email,
      ...(phone ? { phone } : {}),
      isPremium: true,
      purchasedLicenses: studentCount,
      stripeCustomerId: stripeCustomerId ?? null
    });

    return {
      status: "granted",
      user: result.user,
      credentials: {
        username: result.username,
        password: result.password,
        email: result.user.email!
      }
    };
  }

  // OAuth accounts have no password to hand back and cannot be safely matched
  // on email alone - leave them to the authenticated checkout path.
  if (!existingUser.passwordHash) {
    return { status: "skipped_oauth" };
  }

  // IDEMPOTENCY: already premium means this payment was already honoured.
  // Grant nothing, change nothing.
  if (existingUser.isPremium) {
    return { status: "already_premium", user: existingUser };
  }

  const user = await storage.updateUserFields(existingUser.id, {
    ...(phone ? { phone } : {}),
    isPremium: true,
    purchasedLicenses: studentCount,
    stripeCustomerId: stripeCustomerId ?? existingUser.stripeCustomerId
  });

  return { status: "granted", user };
}
