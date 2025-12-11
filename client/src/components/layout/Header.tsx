import { Link } from "wouter";
import { GraduationCap, User, LogOut, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
          <GraduationCap className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg">Future Pathways</span>
        </Link>
        <div className="flex gap-2">
          {user && (
            <>
              <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                <Link href="/assessment">
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Assessment
                </Link>
              </Button>
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
