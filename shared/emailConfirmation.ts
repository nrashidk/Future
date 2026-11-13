/**
 * EMAIL CONFIRMATION — the rule, pure, because four places must agree about
 * it: registration (which sets the due date), the sweep (which erases), the
 * banner (which warns) and the superadmin's list.
 *
 * An account a parent registered must have its address confirmed within
 * EMAIL_CONFIRMATION_WINDOW_HOURS or it is erased. Seventy-two hours on
 * purpose: it is the one retention figure the privacy policy already states,
 * for a guest's assessment, and an unconfirmed account is the same thing in
 * law -- a minor's data that no reachable adult stands behind.
 *
 * `dueAt` NULL MEANS "NEVER ASKED", NOT "UNCONFIRMED". Every school student,
 * school admin, buyer and pre-existing account has NULL, and none of them may
 * ever be swept or shown the banner. That is the dangerous direction, so
 * every function here tests it first.
 *
 * A PAID account is never erased by this rule: a card payment is stronger
 * evidence of a real person than a clicked link, and erasing a customer over
 * an unread mail is not a mistake that can be taken back. It still sees the
 * banner.
 */
export const EMAIL_CONFIRMATION_WINDOW_HOURS = 72;

export interface ConfirmationFacts {
  emailConfirmationDueAt?: string | Date | null;
  emailConfirmedAt?: string | Date | null;
  isPremium?: boolean | null;
}

export type ConfirmationState = "not_required" | "confirmed" | "pending" | "overdue";

function time(v: string | Date | null | undefined): number | null {
  if (v == null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

export function confirmationDueAt(registeredAt: Date): Date {
  return new Date(registeredAt.getTime() + EMAIL_CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000);
}

export function confirmationState(u: ConfirmationFacts | null | undefined, now: Date): ConfirmationState {
  const due = time(u?.emailConfirmationDueAt);
  if (due === null) return "not_required";
  if (time(u?.emailConfirmedAt) !== null) return "confirmed";
  return now.getTime() >= due ? "overdue" : "pending";
}

/** Should the "confirm your email" banner show? Pending or overdue, paid or not. */
export function needsConfirmation(u: ConfirmationFacts | null | undefined, now: Date): boolean {
  const s = confirmationState(u, now);
  return s === "pending" || s === "overdue";
}

/** May the sweep erase this account? Overdue AND unpaid, nothing else. */
export function isErasableUnconfirmed(u: ConfirmationFacts | null | undefined, now: Date): boolean {
  return confirmationState(u, now) === "overdue" && !u?.isPremium;
}

/** Whole hours left before erasure, never negative; null when nothing is pending. */
export function hoursLeftToConfirm(u: ConfirmationFacts | null | undefined, now: Date): number | null {
  if (!needsConfirmation(u, now)) return null;
  const due = time(u?.emailConfirmationDueAt)!;
  return Math.max(0, Math.ceil((due - now.getTime()) / (60 * 60 * 1000)));
}
