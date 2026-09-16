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
  // Account STATUS, in the same family as the two above and decided on purpose
  // when the columns were added rather than left to default. Neither is
  // credential, billing or lockout material — the four categories the exclusion
  // list is actually about. The client needs them to explain a detached account
  // in its own UI instead of only discovering the state from a 403 when the
  // student tries to start an assessment.
  "detachedAt",
  "detachedFromOrganizationName",
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
 * Fields GET /api/auth/user attaches to the user it returns which are NOT
 * `users` columns — decorations read from the caller's organization_members row
 * and their school (server/routes/auth.routes.ts). toPublicUser preserves any
 * key that is not a column, which is what lets them through.
 *
 * Declared here so the client can read them without an `as any`. The cast is
 * what let `!!(user as any)?.isOrgStudent` look safe: it hid that the property
 * may be absent, and `!!undefined` silently answers "no" to a question that had
 * no answer yet.
 *
 * Every field is optional and all of them are absent for a caller who is not a
 * school student, so ABSENCE HERE DOES NOT MEAN "NOT LOADED" — it means "not an
 * org student", but only once the request has actually resolved. A caller that
 * needs to distinguish the two must take that from its own loading state, not
 * from these.
 */
export interface AuthUserOrgFields {
  /** True only when the caller holds an organization_members row with role 'student'. */
  isOrgStudent?: boolean;
  predefinedName?: string | null;
  predefinedGrade?: string | null;
  predefinedAge?: number | null;
  predefinedGender?: string | null;
  organizationName?: string | null;
  organizationLogoUrl?: string | null;
  organizationCountryId?: string | null;
  organizationCurriculum?: string | null;
}

/**
 * A parent-registers account's child_profiles row, decorated the same way
 * AuthUserOrgFields is for a school student — same absence-means-not-loaded
 * caveat. Kept as its own interface rather than folded into
 * AuthUserOrgFields: a parent-registers account is not an org student, and
 * the two never both apply to one account.
 *
 * childProfileCreatedAt exists for one reader today: Profile.tsx excludes an
 * account's own pre-registration assessments from the child's Career
 * Journey (docs/parent-registers-scoping.md item 1's residual conflation) by
 * comparing each assessment's createdAt against this. It is deliberately the
 * child profile's own createdAt, not the consent record's — see
 * assessmentIsChildOwned (shared/childOwnership.ts) for why the two are not
 * interchangeable.
 */
export interface AuthUserChildFields {
  childProfileCreatedAt?: string | null;
}

/** The user shape a client actually receives from GET /api/auth/user. */
export type AuthUser = PublicUser & AuthUserOrgFields & AuthUserChildFields;

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
