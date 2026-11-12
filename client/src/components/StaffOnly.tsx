import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";

/**
 * A page for school admins and superadmins, closed at the PAGE as well as
 * the API.
 *
 * Seen on production 2026-11-12, signed in as a student: /admin/organizations
 * drew "0 schools" with an Add School button, and /analytics drew a full
 * dashboard of zeros. Every request behind them was correctly refused, so
 * nothing leaked — but a refusal rendered as an empty school, with controls
 * that could not work. The routes are the control; this only stops the page
 * pretending.
 *
 * A wrapper, not an early return inside the page: the pages call hooks all
 * the way down.
 */
export function StaffOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" replace />;
  if (user.accountType !== "superadmin" && user.accountType !== "org_admin") {
    return <Redirect to="/" replace />;
  }
  return <>{children}</>;
}
