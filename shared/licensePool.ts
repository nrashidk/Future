/**
 * WHO IS ON A PERSONAL LICENCE POOL.
 *
 * A pool is what bounds how many reports a taker may generate. A school
 * student's is the school's; a parent's is their own purchase. This file is
 * the rule for the second kind, and it exists because the rule used to be
 * "has a child profile" -- which left out everyone who bought through the
 * public checkout as an individual. That account is premium, holds
 * `purchased_licenses`, has no child profile and no school, and was on NO
 * pool: nothing was charged and nothing was refused. One licence bought any
 * number of premium reports. Found 2026-11-12 on production (an account with
 * three licences generated a report and the balance route answered
 * `onPool: false`), then proved in the harness: one licence, three reports,
 * no ledger row.
 *
 * Pure, because two callers must agree and one of them runs inside the
 * report-generation transaction (storage.consumeLicense) while the other
 * reads outside it (storage.getLicenseCapacityForStudent).
 *
 * - A CHILD PROFILE is a personal pool whether or not the account has paid:
 *   an unpaid one has a balance of zero, which is the payment gate's business.
 * - A PREMIUM account with no school row is a personal pool.
 * - A school row means a premium flag is not a personal purchase: a student
 *   is on the school's pool (the callers test that first) and a school
 *   admin's premium flag comes from buying for the school.
 * - A SUPERADMIN is on no pool. Their premium flag is not a purchase.
 * - Everyone else (free accounts) is on no pool and is bounded by the free cap.
 */
export interface PersonalPoolInput {
  hasChildProfile: boolean;
  hasSchoolRow: boolean;
  isPremium: boolean;
  isSuperadmin: boolean;
}

export function isOnPersonalPool(i: PersonalPoolInput): boolean {
  if (i.hasChildProfile) return true;
  if (i.hasSchoolRow) return false;
  if (i.isSuperadmin) return false;
  return i.isPremium;
}

/** Superadmin by role or by configured email -- the same two tests the middleware makes. */
export function isSuperadminAccount(
  user: { role?: string | null; email?: string | null } | null | undefined,
  superadminEmails: string[],
): boolean {
  if (!user) return false;
  if (user.role === "superadmin") return true;
  return !!user.email && superadminEmails.includes(user.email.toLowerCase());
}
