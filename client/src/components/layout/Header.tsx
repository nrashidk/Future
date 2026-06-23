import { Link, useRoute } from "wouter";
import { GraduationCap, User, LogOut, ClipboardCheck, Building2, BarChart, Shield, FileQuestion, Menu, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import { useAssessmentAvailability } from "@/hooks/useAssessmentAvailability";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const { t } = useTranslation("common");
  const isSuperadmin = user?.accountType === 'superadmin';
  const isOrgAdmin = user?.accountType === 'org_admin';
  const { isOrgStudent, hasAvailable, hasInProgress, completedReportId } = useAssessmentAvailability();
  // Org_student who has used their one allocation (nothing in progress) → no new assessment.
  const orgStudentUsedUp = isOrgStudent && !hasAvailable && !hasInProgress;

  const [onSuperadmin] = useRoute("/superadmin");
  const [onOrgs] = useRoute("/admin/organizations");
  const [onAdmin] = useRoute("/admin");
  const [onAnalytics] = useRoute("/analytics");
  const [onAssessment] = useRoute("/assessment");
  const [onProfile] = useRoute("/profile");

  const linkClass = "flex items-center gap-2";
  const navBtnClass = "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none";

  return (
    <>
      {isSuperadmin && (
        <>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-superadmin">
            <Link href="/superadmin" aria-current={onSuperadmin ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <Shield className="w-4 h-4" aria-hidden="true" />
              {t("nav.superadmin")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-admin">
            <Link href="/admin/organizations" aria-current={onOrgs ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <Building2 className="w-4 h-4" aria-hidden="true" />
              {t("nav.admin")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-questions">
            <Link href="/admin" aria-current={onAdmin ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <FileQuestion className="w-4 h-4" aria-hidden="true" />
              {t("nav.quiz")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-analytics">
            <Link href="/analytics" aria-current={onAnalytics ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <BarChart className="w-4 h-4" aria-hidden="true" />
              {t("nav.analytics")}
            </Link>
          </Button>
        </>
      )}
      {isOrgAdmin && (
        <>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-admin">
            <Link href="/admin/organizations" aria-current={onOrgs ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <Building2 className="w-4 h-4" aria-hidden="true" />
              {t("nav.admin")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-assessment">
            <Link href="/assessment" aria-current={onAssessment ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
              {t("nav.assessment")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-analytics">
            <Link href="/analytics" aria-current={onAnalytics ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <BarChart className="w-4 h-4" aria-hidden="true" />
              {t("nav.analytics")}
            </Link>
          </Button>
        </>
      )}
      {user && !isSuperadmin && !isOrgAdmin && (
        orgStudentUsedUp ? (
          // Allocation consumed: route to their existing report instead of a dead "Assessment" link.
          completedReportId && (
            <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-view-report">
              <Link href={`/results?assessmentId=${completedReportId}`} onClick={onNavigate} className={linkClass}>
                <FileText className="w-4 h-4" aria-hidden="true" />
                {t("nav.viewReport")}
              </Link>
            </Button>
          )
        ) : (
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-assessment">
            <Link href="/assessment" aria-current={onAssessment ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <ClipboardCheck className="w-4 h-4" aria-hidden="true" />
              {t("nav.assessment")}
            </Link>
          </Button>
        )
      )}
      {user && (
        <>
          <Button variant="outline" size="sm" asChild className={navBtnClass} data-testid="button-nav-profile">
            <Link href="/profile" aria-current={onProfile ? "page" : undefined} onClick={onNavigate} className={linkClass}>
              <User className="w-4 h-4" aria-hidden="true" />
              {t("nav.profile")}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { window.location.href = "/api/logout"; }}
            data-testid="button-logout"
            className={`${linkClass} ${navBtnClass}`}
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            {t("nav.logout")}
          </Button>
        </>
      )}
    </>
  );
}

export function Header() {
  const { user } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { t } = useTranslation("common");
  const isSuperadmin = user?.accountType === 'superadmin';
  const isOrgAdmin = user?.accountType === 'org_admin';

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "ar" : "en");
  };

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:font-medium focus:shadow-lg"
        data-testid="link-skip-to-main"
      >
        {t("common.skipToMain")}
      </a>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" data-testid="link-home">
          <GraduationCap className="w-6 h-6 text-primary" aria-hidden="true" />
          <span className="font-bold text-lg">{t("header.brandName")}</span>
          {isSuperadmin && <Badge variant="secondary">{t("header.badgeSuperadmin")}</Badge>}
          {isOrgAdmin && <Badge variant="secondary">{t("header.badgeSchoolAdmin")}</Badge>}
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Main navigation" className="hidden md:flex items-center gap-2">
          <NavLinks />
          <Button
            variant="outline"
            size="sm"
            onClick={toggleLanguage}
            data-testid="button-language-toggle"
            aria-label={language === "en" ? t("language.switchToArabic") : t("language.switchToEnglish")}
            className="font-medium min-w-[3rem]"
          >
            {t("language.toggle")}
          </Button>
        </nav>

        {/* Mobile nav — hamburger + Sheet */}
        {user && (
          <div className="md:hidden flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              data-testid="button-language-toggle-mobile"
              aria-label={language === "en" ? t("language.switchToArabic") : t("language.switchToEnglish")}
              className="font-medium"
            >
              {t("language.toggle")}
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" data-testid="button-mobile-menu" aria-label={t("nav.openMenu")}>
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

        {/* Guest / logged-out state: show Login + language toggle on mobile */}
        {!user && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleLanguage}
              data-testid="button-language-toggle-guest"
              aria-label={language === "en" ? t("language.switchToArabic") : t("language.switchToEnglish")}
              className="font-medium md:hidden"
            >
              {t("language.toggle")}
            </Button>
            <Button variant="outline" size="sm" asChild data-testid="button-nav-login">
              <Link href="/login" className="flex items-center gap-2">
                {t("nav.login")}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </header>
    </>
  );
}
