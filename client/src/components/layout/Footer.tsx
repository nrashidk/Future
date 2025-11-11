import { GraduationCap } from "lucide-react";

export function Footer() {
  return (
    <footer className="py-12 px-4 text-center text-muted-foreground">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <GraduationCap className="w-6 h-6 text-primary" />
          <span className="font-bold text-foreground" data-testid="text-brand">Future Pathways</span>
        </div>
        <p className="text-sm font-body" data-testid="text-tagline">
          Empowering students to build meaningful careers that shape the future
        </p>
      </div>
    </footer>
  );
}
