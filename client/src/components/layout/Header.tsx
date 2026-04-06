import { Link, useRoute } from "wouter";
import { GraduationCap, User, LogOut, ClipboardCheck, Building2, BarChart, Shield, FileQuestion, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const isSuperadmin = user?.accountType === 'superadmin';
  const isOrgAdmin = user?.accountType === 'org_admin';

  const [onSuperadmin] = useRoute("/superadmin");
  const [onOrgs] = useRoute("/admin/organizations");
  const [onAdmin] = useRoute("/admin");
  const [onAnalytics] = useRoute("/analytics");
  const [onAssessment] = useRoute("/assessment");
  const [onProfile] = useRoute("/profile");

  const linkClass = "flex items-center gap-2";

  return (
    <>
      {isSuperadmin && (
        <>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
            <Link href="/superadmin" aria-current={onSuperadmin ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <Shield className="w-4 h-4" aria-hidden="true" />
              Super Admin
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
            <Link href="/admin/organizations" aria-current={onOrgs ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <Building2 className="w-4 h-4" aria-hidden="true" />
              Admin
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
            <Link href="/admin" aria-current={onAdmin ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <FileQuestion className="w-4 h-4" aria-hidden="true" />
              Quiz
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
            <Link href="/analytics" aria-current={onAnalytics ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <BarChart className="w-4 h-4" aria-hidden="true" />
              Analytics
            </Link>
          </Button>
        </>
      )}
      {isOrgAdmin && (
        <>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
            <Link href="/admin/organizations" aria-current={onOrgs ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <Building2 className="w-4 h-4" aria-hidden="true" />
              Admin
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
            <Link href="/assessment" aria-current={onAssessment ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
              Assessment
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
            <Link href="/analytics" aria-current={onAnalytics ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <BarChart className="w-4 h-4" aria-hidden="true" />
              Analytics
            </Link>
          </Button>
        </>
      )}
      {user && !isSuperadmin && !isOrgAdmin && (
        <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
          <Link href="/assessment" aria-current={onAssessment ? "page" : undefined} onClick={onNavigate} className={linkClass}>
            <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
            Assessment
          </Link>
        </Button>
      )}
      {user && (
        <>
          <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
            <Link href="/profile" aria-current={onProfile ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <User className="w-4 h-4" aria-hidden="true" />
              Profile
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { window.location.href = "/api/logout"; }}
            data-testid="button-logout"
            className={linkClass}
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Logout
          </Button>
        </>
      )}
    </>
  );
}

export function Header() {
  const { user } = useAuth();
  const isSuperadmin = user?.accountType === 'superadmin';
  const isOrgAdmin = user?.accountType === 'org_admin';

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:font-medium focus:shadow-lg"
        data-testid="link-skip-to-main"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" data-testid="link-home">
          <GraduationCap className="w-6 h-6 text-primary" aria-hidden="true" />
          <span className="font-bold text-lg">Future Pathways</span>
          {isSuperadmin && <Badge variant="secondary">Superadmin</Badge>}
          {isOrgAdmin && <Badge variant="secondary">School Admin</Badge>}
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden md:flex gap-2">
          <NavLinks />
        </nav>

        {/* Mobile nav — hamburger + Sheet */}
        {user && (
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-mobile-menu" aria-label="Open navigation menu">
                  <Menu className="w-5 h-5" aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <nav aria-label="Mobile navigation" className="flex flex-col gap-3 pt-6">
                  <NavLinks />
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        )}

        {/* Guest / logged-out state: show Login button on mobile too */}
        {!user && (
          <Button variant="outline" size="sm" asChild data-testid="button-nav-login">
            <Link href="/login" className="flex items-center gap-2">
              Login
            </Link>
          </Button>
        )}
      </div>
    </header>
    </>
  );
}
