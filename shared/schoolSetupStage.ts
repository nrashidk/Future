/**
 * WHERE A SCHOOL IS STUCK, AND THEREFORE WHAT TO DO ABOUT IT.
 *
 * A yes/no "setup complete" flag cannot tell "the email never arrived" from
 * "they got in and stopped", and those need opposite actions: the first wants
 * a resend, the second wants a phone call. Resending a link to someone who is
 * already signed in achieves nothing and teaches them to ignore the mail.
 *
 * So this returns a STAGE, and the one action that follows from it.
 *
 * Pure and tested here rather than assembled in the route, for the same reason
 * `shared/licenseGrants.ts` is: it decides what a human does next, and a
 * subtly wrong branch would send that human to the wrong place with no error
 * anywhere.
 *
 * DELIVERY IS NOW PART OF IT, and it changes the recommended action rather
 * than decorating it. Migration 036 records what Resend reports about the
 * invite, and a hard bounce means the ADDRESS is wrong: resending to it is a
 * second mail to the same dead inbox, and the superadmin watches nothing
 * happen twice. So an undeliverable invite is its own stage, ranked above
 * "never signed in", and the action it implies is "check the address, then
 * resend" rather than "resend".
 *
 * NULL DELIVERY STILL MEANS UNKNOWN, NOT FAILED. An unregistered webhook, an
 * unset `RESEND_WEBHOOK_SECRET` and Resend being down all produce nulls, and
 * so does every invite sent before 036. Rendering any of those as "did not
 * arrive" would be the same confident-but-wrong claim the old single null
 * made, pointing the other way — so `delivery` has three values and the
 * middle one is the default.
 */

import { isUndeliverable, isDelivered } from "./emailDelivery";

export type SchoolSetupStage =
  /**
   * The invite bounced or was marked as spam, and nobody has signed in. The
   * address is the problem; another copy of the link is not the fix.
   */
  | "invite_undeliverable"
  /** No password was ever chosen: the link is unused, so nobody has signed in. */
  | "never_signed_in"
  /** Signed in, but a gate is still unsatisfied — enrolment is refused. */
  | "setup_incomplete"
  /** Every gate cleared, and nobody enrolled long after the purchase. */
  | "ready_no_students"
  /** Every gate cleared. */
  | "ready";

export interface SchoolSetupInputs {
  /** The admin has a password, which only the setup link or a reset can set. */
  hasPassword: boolean;
  /** A setup link exists and has been used. */
  linkUsed: boolean;
  countryId: string | null | undefined;
  curriculum: string | null | undefined;
  /** The school's own guardian-consent attestation exists. */
  hasConsent: boolean;
  studentCount: number;
  createdAt: Date | string | null | undefined;
  /**
   * What Resend last reported about the invite — the raw column, so this
   * module owns the interpretation. Null for every invite sent before
   * migration 036, and for every one where the webhook is not wired.
   */
  deliveryStatus?: string | null;
  /** Evaluation time, injected so the 30-day rule is testable. */
  now?: Date;
}

/**
 * Three values, because two cannot carry "we do not know". The whole defect
 * this replaces was one null standing for a bounce, a spam folder and an
 * unopened inbox at once.
 */
export type SetupDelivery = "unknown" | "delivered" | "undeliverable";

export interface SchoolSetupStatus {
  stage: SchoolSetupStage;
  /** Which gates are still unsatisfied. Empty once the school can enrol. */
  missing: Array<"country" | "curriculum" | "consent">;
  /**
   * Whether resending the setup link is the right move.
   *
   * TRUE for never_signed_in AND for invite_undeliverable — in the second case
   * because correcting the address and then resending is the actual remedy,
   * and a flag that forbade it would leave the superadmin with no way to
   * finish the job. The STAGE is what tells them to fix the address first;
   * this only says the button should exist.
   *
   * FALSE for a school that is already in: another copy of a link they have
   * used achieves nothing and teaches them to ignore the mail.
   */
  canResend: boolean;
  /**
   * What is known about the invite reaching an inbox. Informational — it
   * never contradicts `stage`, it explains it. `delivered` alongside
   * never_signed_in is the genuinely useful combination: the mail arrived and
   * they have simply not acted, so the next move is a telephone call rather
   * than a resend.
   */
  delivery: SetupDelivery;
}

/** A school with nobody enrolled this long after creation is a sales follow-up. */
export const DORMANT_AFTER_DAYS = 30;

/**
 * An empty string counts as missing, the same rule `schoolSetupGate` applies.
 * A cleared field can write "" rather than NULL, which satisfies a NOT NULL
 * while failing every `!org.countryId` check downstream.
 */
const unset = (v: string | null | undefined): boolean =>
  v === null || v === undefined || v.trim() === "";

export function schoolSetupStage(input: SchoolSetupInputs): SchoolSetupStatus {
  const missing: SchoolSetupStatus["missing"] = [];
  if (unset(input.countryId)) missing.push("country");
  if (unset(input.curriculum)) missing.push("curriculum");
  // Consent is a gate in its own right: a school with both columns set is
  // STILL refused every enrolment without it. Leaving it out of this status
  // would report a school as ready while every enrolment 409s.
  if (!input.hasConsent) missing.push("consent");

  /**
   * NEVER SIGNED IN is decided by the PASSWORD, not by the link.
   *
   * A link can be unused because the buyer signed in another way — a
   * superadmin set a password for them, say — and reporting that school as
   * "never signed in" would offer a resend nobody needs. The password is the
   * thing that actually gates entry, so it is what this branch reads;
   * `linkUsed` only sharpens the label.
   */
  const delivery: SetupDelivery = isUndeliverable(input.deliveryStatus)
    ? "undeliverable"
    : isDelivered(input.deliveryStatus)
      ? "delivered"
      : "unknown";

  if (!input.hasPassword) {
    /**
     * A BOUNCE OUTRANKS "never signed in", because the two imply different
     * actions and only one of them works. Resending to an address that hard
     * bounced produces a second bounce and no progress, and the superadmin has
     * no way to tell that from a buyer who is simply slow.
     *
     * Deliberately NOT applied once they have a password: a bounce on an old
     * invite is irrelevant to a school that got in some other way, and
     * reporting it would send someone chasing a problem that resolved itself.
     */
    if (delivery === "undeliverable") {
      return { stage: "invite_undeliverable", missing, canResend: true, delivery };
    }
    return { stage: "never_signed_in", missing, canResend: true, delivery };
  }

  if (missing.length > 0) {
    // They are IN. Another copy of the link changes nothing.
    return { stage: "setup_incomplete", missing, canResend: false, delivery };
  }

  const created = input.createdAt ? new Date(input.createdAt) : null;
  const now = input.now ?? new Date();
  const dormant =
    input.studentCount === 0 &&
    created !== null &&
    !Number.isNaN(created.getTime()) &&
    now.getTime() - created.getTime() >= DORMANT_AFTER_DAYS * 24 * 60 * 60 * 1000;

  // Nothing is broken here, which is the point of separating it: mixing a
  // dormant school in with the stuck ones means chasing support tickets that
  // do not exist.
  return { stage: dormant ? "ready_no_students" : "ready", missing: [], canResend: false, delivery };
}
