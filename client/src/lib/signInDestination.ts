/**
 * Each signed-in person's own home (owner, 2026-11-25).
 *
 * Used for where a sign-in lands AND where the logo goes, so the two cannot
 * disagree. A superadmin's home is the dashboard, a school admin's is their
 * school, and a student's is /assessment, which asks whether to continue an
 * assessment in progress or start over (or says the report for this grade is
 * ready). Nobody signed in -- or a role this cannot read -- goes to the public
 * home page. Every account that signs in other than staff is a student's:
 * there is no parent login.
 *
 * `accountType` is the one /api/auth/user answers, which reports a superadmin
 * as "superadmin" whatever the stored column says.
 */
export function homePathFor(accountType: string | null | undefined): string {
  if (accountType === "superadmin") return "/superadmin";
  if (accountType === "org_admin") return "/admin/organizations";
  if (accountType) return "/assessment";
  return "/";
}
