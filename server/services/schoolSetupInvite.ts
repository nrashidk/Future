import { storage } from "../storage";
import { sendSchoolSetupEmail } from "./email";
import { toMajor } from "@shared/pricing";

/**
 * ISSUE AND SEND THE FIRST-SIGN-IN LINK — one helper, because two callers act
 * on the same payment.
 *
 * `/api/checkout/complete` and the Stripe webhook both run on a group
 * purchase, and Stripe calls the webhook the instant the card clears while the
 * browser still has to round-trip. Either may get here first, and sometimes
 * both do. Duplicated logic in two routes is how this repo produced the volume
 * tiers twice and the price in six places; here the failure would be two
 * sign-in links in one inbox, or none.
 *
 * IDEMPOTENT ON THE TOKEN, not on a flag. `issueSchoolSetupToken` returns a
 * live unused token rather than minting a second, so the loser of the race
 * sees `created: false` and sends nothing. The alternative — a "setup email
 * sent" boolean on the user — is check-then-act with a window in it, which is
 * the family that produced the 2026-11-09 double-insert.
 *
 * NEVER THROWS. A failure here must not fail the purchase: the buyer has been
 * charged, the school exists, and the licences are granted. What a failure
 * costs is a buyer who cannot sign in, which is recoverable by a superadmin
 * resend — while a thrown error inside the webhook would release the event
 * claim and have Stripe retry a grant that already succeeded.
 */
export async function sendSchoolSetupInvite(args: {
  userId: string;
  email: string;
  username: string;
  firstName?: string | null;
  organizationId: string | null;
  organizationName: string;
  licenseCount: number;
  /** Minor units as Stripe charged them, or null for a grant with no money. */
  amountMinor?: number | null;
  currency?: string | null;
  language?: string | null;
  /**
   * A DELIBERATE RESEND, which is the one case that must send for a token it
   * did not just mint.
   *
   * The default is the opposite: on a purchase, both /api/checkout/complete
   * and the webhook reach this, and the second must send nothing. A resend
   * inverts that — the superadmin is pressing the button precisely because the
   * existing link never got through. Without this flag the resend route would
   * return success having sent no mail, which is the silent-success shape this
   * repo keeps producing.
   */
  resend?: boolean;
}): Promise<{ sent: boolean; reason?: string }> {
  try {
    const { token, created } = await storage.issueSchoolSetupToken(
      args.userId,
      args.organizationId,
    );

    if (!created && !args.resend) {
      console.log(
        `[SetupInvite] A live setup link already exists for ${args.email} — not sending a second.`,
      );
      return { sent: false, reason: "already_issued" };
    }

    // The live token is REUSED, never replaced: a buyer who finally opens the
    // first mail must not find it dead because a resend minted a new one.
    if (!created && args.resend) {
      console.log(`[SetupInvite] Resending the existing setup link to ${args.email}.`);
    }

    // toMajor, never `/ 100`: a three-decimal Gulf charge read as hundredths
    // overstates the receipt tenfold, and this figure is the buyer's only
    // record of what they paid.
    const amountLabel =
      args.amountMinor != null && args.currency
        ? `${args.currency.toUpperCase()} ${toMajor(args.amountMinor, args.currency).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 3,
          })}`
        : null;

    const result = await sendSchoolSetupEmail({
      to: args.email,
      token,
      userName: args.firstName ?? undefined,
      username: args.username,
      organizationName: args.organizationName,
      licenseCount: args.licenseCount,
      amountLabel,
      language: args.language ?? "en",
    });

    if (!result.success) {
      // The token stays live and unsent: sentAt is null, which is exactly what
      // the superadmin setup column reads as "never sent", and a resend picks
      // up this same token rather than minting another.
      console.error(
        `[SetupInvite] Could not send the setup link to ${args.email} for "${args.organizationName}": ` +
        `${result.error}. The buyer has paid and cannot sign in. Needs a resend.`,
      );
      return { sent: false, reason: result.error };
    }

    // The provider's message id is what Resend's delivery webhook joins back
    // on. Without it every later bounce or delivery event matches no row and
    // the column stays null — indistinguishable from "the webhook is not
    // configured", which is the exact ambiguity this was built to end.
    await storage.markSchoolSetupTokenSent(token, result.messageId ?? null);
    console.log(`[SetupInvite] Setup link sent to ${args.email} for "${args.organizationName}".`);
    return { sent: true };
  } catch (error: any) {
    console.error(
      `[SetupInvite] Failed to issue a setup link for ${args.email}: ${error?.message ?? error}. ` +
      `The purchase is unaffected; the buyer needs a resend.`,
    );
    return { sent: false, reason: String(error?.message ?? error) };
  }
}
