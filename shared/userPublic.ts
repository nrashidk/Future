import { getTableColumns } from "drizzle-orm";
import { users, type User } from "./schema";

/**
 * Fields of `users` that are safe to send to a client.
 *
 * This is an ALLOWLIST, deliberately — not a denylist of known secrets. A
 * column added to the `users` table later is excluded from client responses
 * until someone adds it here on purpose, so the default for new columns is
 * "private" rather than "leaked until noticed".
 *
 * Excluded on purpose:
 *   passwordHash        — bcrypt hash; credential material
 *   stripeCustomerId    — billing identifier
 *   paymentDate         — billing metadata; no client reads it
 *   failedLoginAttempts — lockout state; enables lockout probing
 *   lockedUntil         — lockout state; enables lockout probing
 *   oauthProvider       — account-linkage detail
 *   oauthProviderId     — provider-side subject identifier
 */
export const PUBLIC_USER_FIELDS = [
  "id",
  "email",
  "firstName",
  "lastName",
  "phone",
  "profileImageUrl",
  "role",
  "username",
  "accountType",
  "isOrgGenerated",
  "isPremium",
  "purchasedLicenses",
  "preferredLanguage",
  "lastLoginAt",
  "createdAt",
  "updatedAt",
] as const;

export type PublicUserField = (typeof PUBLIC_USER_FIELDS)[number];
export type PublicUser = Pick<User, PublicUserField>;

/**
 * Every column name on `users`, read from the table definition so it cannot
 * drift out of sync with the schema. Keys that are NOT columns are caller-added
 * decorations (predefinedGrade, organizationName, …) and are preserved as-is.
 */
const USER_COLUMN_NAMES: ReadonlySet<string> = new Set(
  Object.keys(getTableColumns(users))
);

/**
 * Shape a user row for a client response.
 *
 * Keeps the allowlisted columns, drops every other `users` column, and
 * preserves any non-`users` keys the caller decorated the object with.
 */
export function toPublicUser<T extends Partial<User>>(
  user: T
): PublicUser & Omit<T, keyof User> {
  const source = user as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const field of PUBLIC_USER_FIELDS) {
    if (field in source) {
      result[field] = source[field];
    }
  }

  // Preserve decorations the caller attached (anything not a `users` column).
  for (const key of Object.keys(source)) {
    if (!USER_COLUMN_NAMES.has(key)) {
      result[key] = source[key];
    }
  }

  return result as PublicUser & Omit<T, keyof User>;
}
