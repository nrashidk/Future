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
    /**
     * THE LOOKUP ABOVE AND THIS INSERT ARE NOT ATOMIC, and the gap is real —
     * it was hit in production on 2026-11-09 with money on it.
     *
     * Both callers of this function run on the same payment: the interactive
     * `/api/checkout/complete` and the Stripe webhook. Stripe calls the webhook
     * the instant the card clears, while the browser still has to round-trip,
     * so the webhook usually wins. Both read "no such user", both try to create
     * one, and the loser hit `users_email_unique` and threw — surfacing to the
     * buyer as HTTP 500 "Checkout failed, please try again" for a purchase that
     * had completely succeeded. Retrying would have charged them a second time.
     *
     * The race cannot be removed by looking harder before inserting; any
     * check-then-act leaves the same window. The unique index is the real
     * arbiter, so the fix is to ACCEPT its verdict: if the insert lost, re-read
     * and carry on with whatever the winner created.
     *
     * Reported as `already_premium` rather than a new status, because that is
     * exactly what it is by the time we look — the account exists and the
     * payment has been honoured. That contract already means "grant nothing,
     * change nothing", which is precisely right: the winner granted the full
     * `studentCount`, so touching the licence figure here would double it.
     */
    try {
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
    } catch (error: any) {
      // 23505 = unique_violation. Narrowed by OUTCOME rather than by constraint
      // name: we only recover if re-reading actually finds the account the
      // other writer made. A unique violation on anything else — a username
      // collision, say — finds nothing and is rethrown untouched.
      const isUniqueViolation = error?.code === "23505" || error?.cause?.code === "23505";
      if (!isUniqueViolation) throw error;

      const raced = await storage.getUserByEmail(email);
      if (!raced) throw error;

      console.warn(
        `[premiumGrant] Lost the create race for ${email} — adopting the account ` +
        `created by the concurrent writer. This is expected when the Stripe ` +
        `webhook beats /api/checkout/complete.`,
      );
      return { status: "already_premium", user: raced };
    }
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
