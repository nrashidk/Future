import { GraduationCap } from "lucide-react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="py-12 px-4 text-center text-muted-foreground">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <GraduationCap className="w-6 h-6 text-primary" />
          <span className="font-bold text-foreground" data-testid="text-brand">Future Pathways</span>
        </div>
        <p className="text-sm font-body mb-4" data-testid="text-tagline">
          Empowering students to build meaningful careers that shape the future
        </p>
        
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs mb-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">
            Privacy Policy
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">
            Terms of Use
          </Link>
          <span>•</span>
          <Link href="/disclaimer" className="hover:text-foreground transition-colors" data-testid="link-disclaimer">
            Disclaimer
          </Link>
        </div>
        
        <p className="text-xs">
          © {new Date().getFullYear()} Future Pathways. All Rights Reserved.
        </p>
        <p className="text-xs mt-2">
          Research-based Career & Learning Platform | Built on validated models by Holland, Kolb, and others
        </p>
      </div>
    </footer>
  );
}
