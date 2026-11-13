import { GraduationCap } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

/**
 * Translated since 2026-11-13. Every string here was English in the source
 * while landing.json already held the Arabic for each one, so an Arabic
 * report ended in three English lines.
 */
export function Footer() {
  const { t } = useTranslation("landing");
  const { t: tc } = useTranslation("common");
  return (
    <footer className="py-12 px-4 text-center text-muted-foreground">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center gap-2 mb-4">
          <GraduationCap className="w-6 h-6 text-primary" />
          <span className="font-bold text-foreground" data-testid="text-brand">{tc("nav.home")}</span>
        </div>
        <p className="text-sm font-body mb-4" data-testid="text-tagline">
          {t("footer.tagline")}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 text-xs mb-4">
          <Link href="/privacy" className="hover:text-foreground transition-colors" data-testid="link-privacy">
            {t("footer.privacy")}
          </Link>
          <span>•</span>
          <Link href="/terms" className="hover:text-foreground transition-colors" data-testid="link-terms">
            {t("footer.terms")}
          </Link>
          <span>•</span>
          <Link href="/disclaimer" className="hover:text-foreground transition-colors" data-testid="link-disclaimer">
            {t("footer.disclaimer")}
          </Link>
        </div>

        <p className="text-xs">
          {t("footer.copyright", { year: new Date().getFullYear() })}
        </p>
        <p className="text-xs mt-2">
          {t("footer.poweredBy")}
        </p>
      </div>
    </footer>
  );
}
