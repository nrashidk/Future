import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, Crown, Users, ClipboardCheck, Home, User, LogOut, BarChart, Shield, Building2, FileQuestion, TrendingUp, ClipboardList, Cake, Users2, FileText } from "lucide-react";
import { StickyNote } from "@/components/StickyNote";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";

interface Assessment {
  id: string;
  name: string;
  age: number | null;
  grade: string | null;
  gender: string | null;
  createdAt: string;
  tier: string;
  isCompleted: boolean;
}

interface Organization {
  id: string;
  name: string;
  adminUserId: string;
  totalLicenses: number;
  usedLicenses: number;
}

interface OrgStats {
  totalLicenses: number;
  usedLicenses: number;
  remainingLicenses: number;
  totalMembers: number;
  completedAssessments: number;
  pendingAssessments: number;
}

export default function Profile() {
  const { t } = useTranslation("profile");
  useEffect(() => { document.title = `${t("pageTitle")} | ${t("appName")}`; }, [t]);

  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  const isOrgAdmin = user?.accountType === 'org_admin';
  const isOrgStudent = user?.accountType === 'org_student';
  const isSuperadmin = user?.accountType === 'superadmin';

  // For individual users and org students: fetch their own assessments
  const { data: assessments = [] } = useQuery<Assessment[]>({
    queryKey: ['/api/assessments/my'],
    enabled: !!user && !isOrgAdmin,
  });

  // For org admins AND org students: fetch organization details
  const { data: organization, isLoading: isOrgLoading } = useQuery<Organization>({
    queryKey: ['/api/my-organization'],
    enabled: !!user && (isOrgAdmin || isOrgStudent),
  });

  // For org admins: fetch organization-wide statistics
  const { data: orgStats, isLoading: isOrgStatsLoading, error: orgStatsError } = useQuery<OrgStats>({
    queryKey: ['/api/my-organization/stats'],
    enabled: !!user && isOrgAdmin,
  });

  if (isLoading || (isOrgAdmin && isOrgLoading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate("/");
    return null;
  }

  // Calculate license information for individual users only
  // Org admin stats are handled separately when orgStats is available
  const completed = assessments.filter(a => a.isCompleted).length;
  const individualCompletedAssessments = completed;
  const individualAvailableLicenses = user.purchasedLicenses || 0;
  const individualUsedLicenses = completed;
  const individualRemainingLicenses = Math.max(0, individualAvailableLicenses - individualUsedLicenses);

  const getAccountTypeBadge = () => {
    switch (user.accountType) {
      case 'superadmin':
        return <Badge className="bg-red-500 hover:bg-red-600" data-testid="badge-account-type"><Shield className="w-3 h-3 me-1" /> {t("account.badge.superadmin")}</Badge>;
      case 'org_admin':
        return <Badge className="bg-purple-500 hover:bg-purple-600" data-testid="badge-account-type"><Users className="w-3 h-3 me-1" /> {t("account.badge.schoolAdmin")}</Badge>;
      case 'org_student':
        return <Badge variant="secondary" data-testid="badge-account-type"><User className="w-3 h-3 me-1" /> {t("account.badge.member")}</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-account-type"><User className="w-3 h-3 me-1" /> {t("account.badge.individual")}</Badge>;
    }
  };

  const { language, setLanguage } = useLanguage();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <main id="main-content" className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
            {isSuperadmin && <Badge variant="secondary">{t("account.badge.superadmin")}</Badge>}
            {isOrgAdmin && <Badge variant="secondary">{t("account.badge.schoolAdmin")}</Badge>}
          </Link>
          <div className="flex gap-2">
            {isSuperadmin && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
                  <Link href="/superadmin">
                    <Shield className="w-4 h-4 me-2" />
                    {t("nav.superadmin")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 me-2" />
                    {t("nav.admin")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
                  <Link href="/admin">
                    <FileQuestion className="w-4 h-4 me-2" />
                    {t("nav.quiz")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 me-2" />
                    {t("nav.analytics")}
                  </Link>
                </Button>
              </>
            )}
            {isOrgAdmin && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 me-2" />
                    {t("nav.admin")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                  <Link href="/assessment">
                    <ClipboardCheck className="w-4 h-4 me-2" />
                    {t("nav.assessment")}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 me-2" />
                    {t("nav.analytics")}
                  </Link>
                </Button>
              </>
            )}
            {!isOrgAdmin && !isSuperadmin && (
              <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                <Link href="/assessment">
                  <ClipboardCheck className="w-4 h-4 me-2" />
                  {t("nav.assessment")}
                </Link>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
              <Link href="/profile">
                <User className="w-4 h-4 me-2" />
                {t("nav.profile")}
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLanguage(language === "en" ? "ar" : "en")}
              data-testid="button-language-toggle-profile"
              aria-label={language === "en" ? "Switch to Arabic" : "Switch to English"}
            >
              {language === "en" ? "العربية" : "English"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLogout}
              data-testid="button-logout-profile"
            >
              <LogOut className="w-4 h-4 me-2" />
              {t("nav.logout")}
            </Button>
          </div>
        </div>
      </header>

      {/* Show announcement banner only for non-premium individual users */}
      {!user?.isPremium && !isOrgStudent && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <AnnouncementBanner />
        </div>
      )}

      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <User className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">{t("title")}</h1>
          </div>
          <p className="text-muted-foreground text-lg">{t("subtitle")}</p>
        </div>

        <div className="grid gap-6">
          {/* Account Information */}
          <StickyNote rotation="-1" color="yellow">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                {t("account.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Two-column layout for org students: name/username on left, school/grade on right */}
              {isOrgStudent ? (
                <>
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left column: Name and Username */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("account.name")}</p>
                        <p className="font-medium" data-testid="text-user-name">
                          {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : t("account.notProvided")}
                        </p>
                      </div>
                      {user.username && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t("account.username")}</p>
                          <p className="font-medium" data-testid="text-user-username">{user.username}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Right column: School and Grade */}
                    <div className="space-y-4">
                      {((user as any).organizationName || organization) && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-2">{t("account.school")}</p>
                          <div className="flex items-center gap-3">
                            {(user as any).organizationLogoUrl && (
                              <img 
                                src={(user as any).organizationLogoUrl} 
                                alt={t("account.schoolLogoAlt")}
                                className="h-10 w-10 object-contain rounded"
                                data-testid="img-org-logo-profile"
                              />
                            )}
                            <p className="font-medium text-primary" data-testid="text-organization-name">
                              {(user as any).organizationName || organization?.name}
                            </p>
                          </div>
                        </div>
                      )}
                      {(user as any).predefinedGrade && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t("account.grade")}</p>
                          <p className="font-medium" data-testid="text-student-grade">{(user as any).predefinedGrade}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Third line: Account Type */}
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">{t("account.accountType")}</p>
                    {getAccountTypeBadge()}
                  </div>
                </>
              ) : isOrgAdmin ? (
                <>
                  {/* Two-column layout for org admins: name/email on left, username/organization on right */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Left column: Name and Email */}
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t("account.name")}</p>
                        <p className="font-medium" data-testid="text-user-name">
                          {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : t("account.notProvided")}
                        </p>
                      </div>
                      {user.email && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t("account.email")}</p>
                          <p className="font-medium" data-testid="text-user-email">{user.email}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Right column: Username and Organization */}
                    <div className="space-y-4">
                      {user.username && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t("account.username")}</p>
                          <p className="font-medium" data-testid="text-user-username">{user.username}</p>
                        </div>
                      )}
                      {((user as any).organizationName || organization) && (
                        <div>
                          <p className="text-sm text-muted-foreground">{t("account.organization")}</p>
                          <p className="font-medium text-primary" data-testid="text-organization-name">
                            {(user as any).organizationName || organization?.name}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Third line: Account Type */}
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">{t("account.accountType")}</p>
                    {getAccountTypeBadge()}
                  </div>
                </>
              ) : (
                <>
                  {/* Regular layout for individual users */}
                  <div>
                    <p className="text-sm text-muted-foreground">{t("account.name")}</p>
                    <p className="font-medium" data-testid="text-user-name">
                      {user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : t("account.notProvided")}
                    </p>
                  </div>
                  {user.email && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("account.email")}</p>
                      <p className="font-medium" data-testid="text-user-email">{user.email}</p>
                    </div>
                  )}
                  {user.username && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("account.username")}</p>
                      <p className="font-medium" data-testid="text-user-username">{user.username}</p>
                    </div>
                  )}
                  {(user as any).lastLoginAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">{t("account.lastLogin")}</p>
                      <p className="font-medium" data-testid="text-last-login">
                        {new Date((user as any).lastLoginAt).toLocaleString(language === 'ar' ? 'ar-AE' : 'en-US')}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">{t("account.accountType")}</p>
                    {getAccountTypeBadge()}
                  </div>
                </>
              )}
            </CardContent>
          </StickyNote>

          {/* Student Details - Shown for students (individual and org) */}
          {!isOrgAdmin && !isSuperadmin && (() => {
            // Get demographics from latest assessment or predefined org student data
            const latestAssessment = [...assessments]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .find(a => a.name || a.age || a.grade || a.gender);

            const demoName = latestAssessment?.name || 
              (user.firstName || user.lastName ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : null);
            const demoAge = latestAssessment?.age ?? (user as any).predefinedAge ?? null;
            const demoGrade = latestAssessment?.grade ?? (user as any).predefinedGrade ?? null;
            const demoGender = latestAssessment?.gender ?? (user as any).predefinedGender ?? null;

            const getGradeLabel = (gradeCode: string): string => {
              const gradeMap: Record<string, string> = {
                grade8: t("details.grade8"), grade9: t("details.grade9"), grade10: t("details.grade10"),
                grade11: t("details.grade11"), grade12: t("details.grade12"), graduated: t("details.graduated"),
              };
              return gradeMap[gradeCode] || gradeCode;
            };

            const getGenderLabel = (g: string): string => {
              const genderMap: Record<string, string> = {
                male: t("details.genderMale"),
                female: t("details.genderFemale"),
                other: t("details.genderOther"),
                prefernottoSay: t("details.genderPreferNotToSay"),
                preferNotToSay: t("details.genderPreferNotToSay"),
              };
              return genderMap[g.toLowerCase()] || genderMap[g] || (g.charAt(0).toUpperCase() + g.slice(1));
            };

            if (!demoName && !demoAge && !demoGrade && !demoGender) return null;

            return (
              <div>
                <div className="mb-4 text-center">
                  <h2 className="text-xl font-bold">{t("details.title")}</h2>
                  <p className="text-sm text-muted-foreground">{t("details.subtitle")}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <StickyNote color="yellow" rotation="-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("details.name")}</p>
                    </div>
                    <p className="font-bold text-lg leading-snug" data-testid="text-demo-name">
                      {demoName || <span className="text-muted-foreground font-normal text-base">{t("account.notProvided")}</span>}
                    </p>
                  </StickyNote>

                  <StickyNote color="pink" rotation="1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Cake className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("details.age")}</p>
                    </div>
                    <p className="font-bold text-lg" data-testid="text-demo-age">
                      {demoAge ? t("details.yearsOld", { age: demoAge }) : <span className="text-muted-foreground font-normal text-base">{t("account.notProvided")}</span>}
                    </p>
                  </StickyNote>

                  <StickyNote color="blue" rotation="2">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <GraduationCap className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("details.grade")}</p>
                    </div>
                    <p className="font-bold text-lg" data-testid="text-demo-grade">
                      {demoGrade ? getGradeLabel(demoGrade) : <span className="text-muted-foreground font-normal text-base">{t("account.notProvided")}</span>}
                    </p>
                  </StickyNote>

                  <StickyNote color="green" rotation="-2">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users2 className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t("details.gender")}</p>
                    </div>
                    <p className="font-bold text-lg" data-testid="text-demo-gender">
                      {demoGender ? getGenderLabel(demoGender) : <span className="text-muted-foreground font-normal text-base">{t("account.notProvided")}</span>}
                    </p>
                  </StickyNote>
                </div>
              </div>
            );
          })()}

          {/* Premium Status - Hidden for superadmins */}
          {!isSuperadmin && (
          <StickyNote rotation="1" color="blue">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                {t("premium.title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("premium.status")}</p>
                {isOrgAdmin ? (
                  isOrgStatsLoading ? (
                    <Badge variant="outline" data-testid="badge-premium-status">{t("premium.loading")}</Badge>
                  ) : orgStatsError ? (
                    <Badge variant="outline" data-testid="badge-premium-status">{t("premium.unavailable")}</Badge>
                  ) : orgStats && orgStats.totalLicenses > 0 ? (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-premium-status">
                      <Crown className="w-3 h-3 me-1" />
                      {t("premium.premium")}
                    </Badge>
                  ) : (
                    <Badge variant="outline" data-testid="badge-premium-status">{t("premium.free")}</Badge>
                  )
                ) : user.isPremium ? (
                  <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-premium-status">
                    <Crown className="w-3 h-3 me-1" />
                    {t("premium.premium")}
                  </Badge>
                ) : (
                  <Badge variant="outline" data-testid="badge-premium-status">{t("premium.free")}</Badge>
                )}
              </div>

              {user.isPremium && !isOrgAdmin && !isOrgStudent && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{t("premium.purchasedLicenses")}</p>
                    <p className="font-bold text-2xl" data-testid="text-purchased-licenses">{individualAvailableLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{t("premium.usedLicenses")}</p>
                    <p className="font-bold text-2xl" data-testid="text-used-licenses">{individualUsedLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{t("premium.remainingLicenses")}</p>
                    <p className="font-bold text-2xl text-primary" data-testid="text-remaining-licenses">{individualRemainingLicenses}</p>
                  </div>

                  {individualRemainingLicenses > 0 && (
                    <div className="pt-4 border-t">
                      <Button asChild className="w-full" data-testid="button-start-assessment">
                        <Link href="/assessment">
                          <ClipboardCheck className="w-4 h-4 me-2" />
                          {t("premium.startPremium")}
                        </Link>
                      </Button>
                    </div>
                  )}

                  {individualRemainingLicenses === 0 && (
                    <div className="pt-4 border-t">
                      <p className="text-sm text-muted-foreground text-center">
                        {t("premium.allUsed")}
                      </p>
                      <Button asChild variant="outline" className="w-full mt-2" data-testid="button-purchase-more">
                        <Link href="/tier-selection">
                          {t("premium.purchaseMore")}
                        </Link>
                      </Button>
                    </div>
                  )}
                </>
              )}

              {/* Organization Students - Show available assessments */}
              {isOrgStudent && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground text-center mb-2">
                    {t("premium.studentAccess")}
                  </p>
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-sm text-muted-foreground">{t("premium.availableAssessments")}</p>
                    <p className="font-bold text-2xl text-primary" data-testid="text-student-available-assessments">
                      {Math.max(0, 1 - assessments.filter(a => a.isCompleted).length)}
                    </p>
                  </div>
                </div>
              )}

              {isOrgAdmin && isOrgStatsLoading && (
                <div className="py-8 text-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p>{t("premium.loadingStats")}</p>
                </div>
              )}

              {isOrgAdmin && orgStatsError && (
                <div className="py-8 text-center text-destructive">
                  <p className="font-medium">{t("premium.statsError")}</p>
                  <p className="text-sm mt-2">{t("premium.statsErrorRetry")}</p>
                </div>
              )}

              {isOrgAdmin && orgStats && !isOrgStatsLoading && (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{t("premium.totalLicenses")}</p>
                    <p className="font-bold text-2xl" data-testid="text-purchased-licenses">{orgStats.totalLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{t("premium.usedLicensesOrg")}</p>
                    <p className="font-bold text-2xl" data-testid="text-used-licenses">{orgStats.usedLicenses}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{t("premium.remainingLicensesOrg")}</p>
                    <p className="font-bold text-2xl text-primary" data-testid="text-remaining-licenses">{orgStats.remainingLicenses}</p>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">{t("premium.totalStudents")}</p>
                      <p className="font-bold text-xl" data-testid="text-total-members">{orgStats.totalMembers}</p>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">{t("premium.completedAssessments")}</p>
                      <p className="font-bold text-xl text-green-600" data-testid="text-completed-assessments">{orgStats.completedAssessments}</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">{t("premium.pendingAssessments")}</p>
                      <p className="font-bold text-xl text-orange-500" data-testid="text-pending-assessments">{orgStats.pendingAssessments}</p>
                    </div>
                  </div>
                </>
              )}

              {!user.isPremium && !isOrgAdmin && (
                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    {t("premium.upgradePrompt")}
                  </p>
                  <Button asChild className="w-full" data-testid="button-upgrade-premium">
                    <Link href="/tier-selection">
                      <Crown className="w-4 h-4 me-2" />
                      {t("premium.upgrade")}
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </StickyNote>
          )}

          {/* Assessment History - Only show for non-admin users */}
          {!isOrgAdmin && !isSuperadmin && (
            <StickyNote rotation="-1" color="pink">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5" />
                  {t("assessment.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                  <p className="text-sm text-muted-foreground">{t("assessment.completed")}</p>
                  <p className="font-bold text-2xl text-green-600" data-testid="text-completed-assessments-count">
                    {individualCompletedAssessments}
                  </p>
                </div>
                {assessments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">{t("assessment.noAssessments")}</p>
                  <Button asChild data-testid="button-start-first-assessment">
                    <Link href={isOrgStudent ? "/assessment" : "/tier-selection"}>
                      <ClipboardCheck className="w-4 h-4 me-2" />
                      {t("assessment.startFirst")}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div>
                  {/* Show Continue button if there's an in-progress assessment */}
                  {assessments.some(a => !a.isCompleted) && (
                    <div className="mb-4">
                      <Button asChild className="w-full" data-testid="button-continue-assessment">
                        <Link href="/assessment">
                          <ClipboardCheck className="w-4 h-4 me-2" />
                          {t("assessment.continueAssessment")}
                        </Link>
                      </Button>
                    </div>
                  )}
                  {(() => {
                    // Get the latest assessment (most recent by createdAt)
                    const latestAssessment = [...assessments].sort((a, b) => 
                      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                    )[0];
                    
                    return latestAssessment && (
                      <div className="p-3 border rounded-lg" data-testid={`assessment-item-${latestAssessment.id}`}>
                        <p className="font-medium">{latestAssessment.name || t("assessment.assessment")}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(latestAssessment.createdAt).toLocaleDateString(language === 'ar' ? 'ar-AE' : 'en-US')}
                          {latestAssessment.tier && ` • ${latestAssessment.tier === 'premium' || latestAssessment.tier === 'school' ? t("premium.premium") : t("premium.free")}`}
                        </p>
                        {/* Completed assessment: link to its report by assessmentId (kept ID-parameterized for future per-year history) */}
                        {latestAssessment.isCompleted && (
                          <Button asChild size="sm" className="w-full mt-3 bg-green-50 hover:bg-green-100 text-green-800 border border-green-200" data-testid={`button-view-report-${latestAssessment.id}`}>
                            <Link href={`/results?assessmentId=${latestAssessment.id}`}>
                              <FileText className="w-4 h-4 me-2" />
                              {t("assessment.viewReport")}
                            </Link>
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                  
                  {/* View Progress Journey button - shows career evolution across grades */}
                  {assessments.filter(a => a.isCompleted).length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <Button asChild variant="outline" className="w-full" data-testid="button-view-progress">
                        <Link href="/progress">
                          <TrendingUp className="w-4 h-4 me-2" />
                          {t("assessment.viewJourney")}
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              )}
              </CardContent>
            </StickyNote>
          )}

          {/* Organization Admin Link */}
          {isOrgAdmin && (
            <StickyNote rotation="1" color="green">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  {t("organization.title")}
                </CardTitle>
                <CardDescription>
                  {t("organization.subtitle")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full" variant="outline" data-testid="button-manage-organization">
                  <Link href="/admin/organizations">
                    <Users className="w-4 h-4 me-2" />
                    {t("organization.goToAdmin")}
                  </Link>
                </Button>
              </CardContent>
            </StickyNote>
          )}
        </div>
      </div>
    </main>
  );
}
