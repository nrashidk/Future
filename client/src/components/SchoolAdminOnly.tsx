import type { ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/useAuth";

/**
 * A page for a SCHOOL's administrator only — not a superadmin. The pages
 * behind it act as "my school" (the school comes from the session on the
 * server), so a superadmin opening one would be acting as no school at all.
 * The routes are the control; this only stops the page pretending.
 */
export function SchoolAdminOnly({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <Redirect to="/login" replace />;
  if (user.accountType !== "org_admin") return <Redirect to="/" replace />;
  return <>{children}</>;
}
