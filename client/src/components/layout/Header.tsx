import { Link } from "wouter";
import { GraduationCap, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
          <GraduationCap className="w-6 h-6 text-primary" />
          <span className="font-bold text-lg">Future Pathways</span>
        </Link>
        <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
          <Link href="/analytics">
            <BarChart3 className="w-4 h-4 mr-2" />
            Analytics
          </Link>
        </Button>
      </div>
    </header>
  );
}
