/**
 * Where a sign-in lands (owner, 2026-11-25, revising 2026-11-20).
 *
 * Staff go straight to their own screen: a superadmin to the dashboard, a
 * school admin to their school. Everyone else lands on the home page, which
 * asks a student or parent with an assessment in progress whether to continue
 * or start over -- the reason the home page was made the landing at all, and a
 * question staff never have. `accountType` is the one /api/auth/user answers,
 * which reports a superadmin as "superadmin" whatever the stored column says.
 */
export function signInDestination(accountType: string | null | undefined): string {
  if (accountType === "superadmin") return "/superadmin";
  if (accountType === "org_admin") return "/admin/organizations";
  return "/";
}
