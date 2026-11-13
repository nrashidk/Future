/**
 * EMAIL CONFIRMATION for an account a parent registered themselves.
 * shared/emailConfirmation.ts is the rule; this file is the three acts:
 * issue a link, spend a link, and erase the accounts whose link was never
 * spent.
 *
 * `db` is imported dynamically for the reason guestAssessmentExpiry.ts gives:
 * db.ts throws at import when DATABASE_URL is unset, and this file is reached
 * from routes that unit tests import.
 */
import { createHash, randomBytes } from "crypto";
import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { emailConfirmationTokens, organizationMembers, users } from "@shared/schema";
import { EMAIL_CONFIRMATION_WINDOW_HOURS } from "@shared/emailConfirmation";
import { sendEmailConfirmationEmail } from "./email";
import { eraseUserData } from "./accountErasure";

export function hashConfirmationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mint a link and mail it. NEVER THROWS: by the time this runs the account
 * exists and the parent is signed in, and a mail that could not be sent must
 * not turn a successful registration into an error. The banner's Resend is
 * the remedy.
 *
 * Earlier unused links for the same account are deleted first, so exactly one
 * link is live and "Resend" does not leave a trail of working credentials in
 * an inbox.
 */
export async function issueEmailConfirmation(args: {
  userId: string;
  email: string;
  name?: string;
  language: string;
}): Promise<{ sent: boolean }> {
  try {
    const { db } = await import("../db");
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_WINDOW_HOURS * 60 * 60 * 1000);
    await db.delete(emailConfirmationTokens).where(and(
      eq(emailConfirmationTokens.userId, args.userId),
      isNull(emailConfirmationTokens.usedAt),
    ));
    await db.insert(emailConfirmationTokens).values({
      userId: args.userId,
      tokenHash: hashConfirmationToken(token),
      expiresAt,
    });
    const result = await sendEmailConfirmationEmail(
      args.email, token, args.name, args.language, EMAIL_CONFIRMATION_WINDOW_HOURS,
    );
    if (!result.success) {
      console.error("[emailConfirmation] mail not sent for user", args.userId, result.error);
    }
    return { sent: result.success };
  } catch (error) {
    console.error("[emailConfirmation] could not issue a link for user", args.userId, error);
    return { sent: false };
  }
}

export type ConfirmOutcome = "confirmed" | "already_confirmed" | "expired" | "invalid";

/**
 * Spend a link.
 *
 * A link opened twice answers `already_confirmed`, not an error: mail
 * clients and the parent's own second click both do this, and "invalid link"
 * shown to someone who has just confirmed sends them to support for nothing.
 *
 * The claim is ONE UPDATE with its conditions in the WHERE clause, so two
 * simultaneous opens are arbitrated by the database, not by a read before
 * the write.
 */
export async function confirmEmailByToken(token: string): Promise<ConfirmOutcome> {
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return "invalid";
  const { db } = await import("../db");
  const tokenHash = hashConfirmationToken(token);

  return await db.transaction(async (tx: any) => {
    const [row] = await tx
      .select({ id: emailConfirmationTokens.id, userId: emailConfirmationTokens.userId,
        expiresAt: emailConfirmationTokens.expiresAt, usedAt: emailConfirmationTokens.usedAt })
      .from(emailConfirmationTokens)
      .where(eq(emailConfirmationTokens.tokenHash, tokenHash));
    if (!row) return "invalid" as const;
    if (row.usedAt) return "already_confirmed" as const;
    if (new Date(row.expiresAt).getTime() <= Date.now()) return "expired" as const;

    const claimed = await tx
      .update(emailConfirmationTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(emailConfirmationTokens.id, row.id), isNull(emailConfirmationTokens.usedAt)))
      .returning({ id: emailConfirmationTokens.id });
    if (claimed.length === 0) return "already_confirmed" as const;

    await tx
      .update(users)
      .set({ emailConfirmedAt: new Date() })
      .where(and(eq(users.id, row.userId), isNull(users.emailConfirmedAt)));
    return "confirmed" as const;
  });
}

/**
 * ERASE THE ACCOUNTS WHOSE ADDRESS WAS NEVER CONFIRMED.
 *
 * The conditions are in the SELECT, and each one is a population that must
 * never be touched:
 *   - a due date that is SET (NULL is every account that was never asked);
 *   - past it; not confirmed; NOT PAID (shared/emailConfirmation.ts);
 *   - role 'user' and no school row, so nothing a superadmin or a school
 *     created can be reached even if a due date were ever written to it.
 *
 * eraseUserData is the same implementation the account's own "delete my
 * account" runs. One account per transaction, and one failure does not stop
 * the rest: a single row that cannot be erased must not leave every other
 * unconfirmed child's record in place behind it.
 */
export async function eraseUnconfirmedAccounts(now: Date = new Date()): Promise<{ erased: number; failed: number }> {
  const { db } = await import("../db");
  const due = await db
    .select({ id: users.id })
    .from(users)
    .leftJoin(organizationMembers, eq(organizationMembers.userId, users.id))
    .where(and(
      isNotNull(users.emailConfirmationDueAt),
      lt(users.emailConfirmationDueAt, now),
      isNull(users.emailConfirmedAt),
      eq(users.isPremium, false),
      eq(users.role, "user"),
      isNull(organizationMembers.id),
    ));

  let erased = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      await db.transaction((tx: any) => eraseUserData(tx, id));
      erased++;
    } catch (error) {
      failed++;
      console.error("[emailConfirmation] could not erase unconfirmed account", id, error);
    }
  }
  if (erased > 0 || failed > 0) {
    console.log(`SECURITY: Unconfirmed accounts erased: ${erased}, failed: ${failed}`);
  }
  return { erased, failed };
}
