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
 * WHAT IT CANNOT KNOW: whether the mail was DELIVERED. `linkUsed` proves the
 * link was clicked and `hasPassword` proves they got in; a link neither sent
 * nor used covers a bounce, a spam folder and an unopened inbox alike. Telling
 * those apart needs Resend's delivery webhooks, which are not wired. Every
 * label here says "not used", never "not delivered".
 */

export type SchoolSetupStage =
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
  /** Evaluation time, injected so the 30-day rule is testable. */
  now?: Date;
}

export interface SchoolSetupStatus {
  stage: SchoolSetupStage;
  /** Which gates are still unsatisfied. Empty once the school can enrol. */
  missing: Array<"country" | "curriculum" | "consent">;
  /**
   * Whether resending the setup link is the right move. TRUE only for
   * never_signed_in: a school that is already in does not need another copy
   * of a link it has used.
   */
  canResend: boolean;
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
  if (!input.hasPassword) {
    return { stage: "never_signed_in", missing, canResend: true };
  }

  if (missing.length > 0) {
    // They are IN. Another copy of the link changes nothing.
    return { stage: "setup_incomplete", missing, canResend: false };
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
  return { stage: dormant ? "ready_no_students" : "ready", missing: [], canResend: false };
}
