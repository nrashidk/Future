import { Link } from "wouter";
import { GraduationCap, User, LogOut, ClipboardCheck, Building2, BarChart, Shield, FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user } = useAuth();
  const isSuperadmin = user?.accountType === 'superadmin';
  const isOrgAdmin = user?.accountType === 'org_admin';

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
          <GraduationCap className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg">Future Pathways</span>
          {isSuperadmin && <Badge variant="secondary">Superadmin</Badge>}
          {isOrgAdmin && <Badge variant="secondary">School Admin</Badge>}
        </Link>
        <div className="flex gap-2">
          {isSuperadmin && (
            <>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
                <Link href="/superadmin">
                  <Shield className="w-4 h-4 mr-2" />
                  Super Admin
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                <Link href="/admin/organizations">
                  <Building2 className="w-4 h-4 mr-2" />
                  Admin
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
                <Link href="/admin">
                  <FileQuestion className="w-4 h-4 mr-2" />
                  Quiz
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                <Link href="/analytics">
                  <BarChart className="w-4 h-4 mr-2" />
                  Analytics
                </Link>
              </Button>
            </>
          )}
          {isOrgAdmin && (
            <>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                <Link href="/admin/organizations">
                  <Building2 className="w-4 h-4 mr-2" />
                  Admin
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                <Link href="/assessment">
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Assessment
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                <Link href="/analytics">
                  <BarChart className="w-4 h-4 mr-2" />
                  Analytics
                </Link>
              </Button>
            </>
          )}
          {user && !isSuperadmin && !isOrgAdmin && (
            <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
              <Link href="/assessment">
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Assessment
              </Link>
            </Button>
          )}
          {user && (
            <>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
                <Link href="/profile">
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Link>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleLogout}
                data-testid="button-logout"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
