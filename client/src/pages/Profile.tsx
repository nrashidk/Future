import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, Crown, Users, ClipboardCheck, Home, User, LogOut, BarChart, Shield, Building2, FileQuestion, TrendingUp, ClipboardList, Cake, Users2, FileText, Mail, Clock } from "lucide-react";
import { StickyNote } from "@/components/StickyNote";
import type { LucideIcon } from "lucide-react";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "react-i18next";
import { isPremiumAssessment } from "@shared/assessmentTier";
import { SCHOOL_ALLOCATIONS_PER_STUDENT, FREE_ASSESSMENT_CAP } from "@shared/assessmentLimits";
import { collapseToLatestPerGrade, toCanonicalGrade } from "@shared/grade";
import { isResumableDraft } from "@shared/assessmentFlow";

/**
 * One field of the merged profile block, as a sticky-note card.
 *
 * Module scope, not inside Profile: a component defined in a render body is a
 * new type on every render and remounts its subtree, which for nine cards would
 * throw away the DOM on every state change on this page.
 */
function ProfileNote({
  icon: Icon,
  label,
  color,
  rotation,
  testId,
  children,
}: {
  icon: LucideIcon;
  label: string;
  color: "yellow" | "pink" | "blue" | "green" | "purple" | "orange";
  rotation: "-2" | "-1" | "0" | "1" | "2";
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <StickyNote color={color} rotation={rotation}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      </div>
      <div className="font-bold text-lg leading-snug" data-testid={testId}>{children}</div>
    </StickyNote>
  );
}

interface Assessment {
  id: string;
  name: string;
  age: number | null;
  grade: string | null;
  gender: string | null;
  createdAt: string;
  // The COLUMN is assessments.assessment_type (shared/schema.ts:676). This
  // interface declared `tier`, a field the API has never sent, so every read of
  // it was undefined — see the tier label below, which silently rendered
  // nothing. Renamed rather than added alongside, so the phantom cannot be
  // reached again.
  assessmentType: string;
  isCompleted: boolean;
  // Read by the history list to decide whether a draft is RESUMABLE. It has to
  // be here because Assessment.tsx resumes on `currentStep > 1` and nothing
  // else: a row created by the step-3 save but abandoned before the auto-save
  // PATCH still holds the default 1, and offering "Continue" on it lands the
  // student in a fresh assessment.
  currentStep: number;
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
  // MEMBERSHIP COMES FROM THE MEMBER ROW, not from accountType. isOrgStudent is
  // decorated onto /api/auth/user from the caller's organization_members row with
  // role 'student' (auth.routes.ts) — the same test the server's field lock uses
  // (14459a4), the assessment's steps read (15203ec) and useAssessmentAvailability
  // was moved to (e9f8d81).
  //
  // This was the LAST accountType-keyed membership test in the codebase. The
  // comment in useAssessmentAvailability claimed that distinction for the one
  // e9f8d81 moved; it was one file early, and is corrected in this same change.
  // This is the one that actually ends the list. The five before it were moved for a reason this file was the live
  // example of: the two sources can disagree, and when they do the app disagrees
  // with itself. A student with a member row but a stale accountType got the
  // school-owned field lock in the assessment and the INDIVIDUAL layout here — no
  // school, no grade, and the upgrade prompt at :256 offered to sell them a licence
  // their school had already bought. The converse now resolves correctly too: a
  // student removed from their organization keeps accountType 'org_student' but
  // loses the member row, and is no longer shown a school they are not in.
  //
  // COERCED WITH `!!`, DELIBERATELY, and this is the one file where that is not
  // the fail-open shape 15203ec removed from the assessment steps. There it
  // mattered because both steps read the value while the auth query was still in
  // flight, and `!!undefined` answered "not a school student" — unlocking five
  // fields the server was about to overwrite. Two things stop the unknown state
  // from ever reaching a use site here:
  //
  //   1. UNKNOWN NEVER RENDERS. The early return at :115 shows a spinner while
  //      isLoading, and :126 returns before the body when there is no user.
  //      Nothing below either guard runs until the auth query has settled and
  //      `user` is non-null, so undefined is not a state this value is read in.
  //      The only reads above the guards are useQuery `enabled` flags, and they
  //      already gate on `!!user` — disabled through the same window.
  //   2. NOTHING HERE IS LOCKED ON IT. Every use site is layout or a link target:
  //      the two-column school block (:282), the school-access counter (:589),
  //      the individual licence rows (:547), the announcement banner (:256), the
  //      first-assessment CTA destination (:686). A false answer shows a student
  //      LESS of what their school holds and points them at /tier-selection —
  //      wrong, and undone by the next render. No editable field on this page
  //      has its lock derived from this value, which is the difference between
  //      here and the assessment steps.
  //
  // (1) is the load-bearing reason; (2) is why a miss would have been cosmetic
  // rather than a bug. If the isLoading guard at :115 is ever removed, this must
  // become the three-state `isLoading ? undefined : !!user?.isOrgStudent` that
  // useAssessmentAvailability uses.
  const isOrgStudent = !!user?.isOrgStudent;
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

  // FILTERED ON TIER, and it must be. A licence is consumed by a PREMIUM
  // completion; a free assessment costs nothing and consumes nothing. This was
  // the unfiltered `completed`, which was correct only for as long as an
  // authenticated free user could not complete anything — /assessment redirected
  // them to pricing before they could start. Once free accounts are allowed to
  // take the assessment, that count charges a user for assessments they were
  // never sold: complete three free ones, then buy a licence, and the profile
  // opens showing three already spent.
  //
  // isPremiumAssessment on the ROW, not user.isPremium: the question is what
  // this assessment was, not what the account is now. A premium assessment taken
  // before a downgrade still consumed its licence.
  const individualUsedLicenses = assessments.filter(
    a => a.isCompleted && isPremiumAssessment(a.assessmentType)
  ).length;
  const individualRemainingLicenses = Math.max(0, individualAvailableLicenses - individualUsedLicenses);

  // WHICH REPORT IS "THE" REPORT. With retakes every history row reads alike, and
  // the report a link without an id resolves to is the most recent completed one
  // — /api/recommendations answers with the latest assessment, and the Career
  // Journey's per-grade links resolve through pickLatestForGrade. Marking that row
  // is what stops three identical-looking cards being three coin flips.
  //
  // `find`, not a sort: the list arrives ordered by createdAt desc, so the first
  // completed row IS the most recently completed one.
  const latestCompletedAssessmentId = assessments.find(a => a.isCompleted)?.id ?? null;

  // HOW MANY GRADES THIS STUDENT HAS, which is what the Career Journey plots —
  // not how many assessments they have taken. a9b33cc collapses same-grade
  // retakes to one row per grade, so three Grade 11 attempts are one milestone
  // and there is no trajectory to show.
  //
  // collapseToLatestPerGrade rather than a local Set over grades: it is the same
  // function the evolution endpoint counts totalGrades with, so the button and
  // the page it opens cannot disagree about how many grades exist. It drops
  // drafts itself (isCompleted === false) and buckets every ungraded row
  // together. Only the bucket COUNT is read here — these rows carry no
  // completedAt, so which row wins a bucket is arbitrary and unused.
  const journeyGradeCount = collapseToLatestPerGrade(assessments).length;

  // ONE grade label for the page. It was local to the merged profile block,
  // where it labelled a single value; the history list needs the same map and a
  // second copy of it would drift from the first the moment a grade is added.
  //
  // CANONICALISED FIRST, which the local copy did not do. A legacy row still
  // holding '10' misses every key of a map keyed 'grade10' and fell through to
  // the raw string, so the profile printed a bare "10" for exactly the school
  // students whose rows the old admin select wrote that way.
  const getGradeLabel = (gradeCode: string): string => {
    const gradeMap: Record<string, string> = {
      grade8: t("details.grade8"), grade9: t("details.grade9"), grade10: t("details.grade10"),
      grade11: t("details.grade11"), grade12: t("details.grade12"), graduated: t("details.graduated"),
    };
    return gradeMap[toCanonicalGrade(gradeCode) ?? gradeCode] || gradeCode;
  };

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
          {/* ONE BLOCK, not two. Account Holder and Assessment Details were split
              by 24aff62 on the strength of a prod row where the holder was
              "Nasser Rashid" and the subject "Khaled" — a testing artifact, not
              the common case. A real account holder registers under their own
              name, so the split showed the same person twice under two headings
              that promised a contrast the data did not contain.

              The case that survives the merge is a guardian registering for a
              child. It is handled by VALUE, not by heading: the account fields
              show the account, the assessment fields show the subject, and the
              subject's name appears ONLY when it actually differs (see
              subjectNameDiffers). In the common case there is one name card; in
              the guardian case there are two, distinctly labelled, so the reader
              meets the difference where it exists instead of being warned about
              it everywhere it does not. */}
          {(() => {
            const latestAssessment = [...assessments]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .find(a => a.name || a.age || a.grade || a.gender);

            // predefinedName, NOT the account holder's name — see 0f4155b. An org
            // student who has not taken an assessment gets their school-recorded
            // values; falling back to the holder here would describe one person
            // by name and a different one by every other field.
            const demoName = latestAssessment?.name ?? (user as any).predefinedName ?? null;
            const demoAge = latestAssessment?.age ?? (user as any).predefinedAge ?? null;
            const demoGrade = latestAssessment?.grade ?? (user as any).predefinedGrade ?? null;
            const demoGender = latestAssessment?.gender ?? (user as any).predefinedGender ?? null;

            const accountName = user.firstName || user.lastName
              ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
              : '';

            // THE ONLY REASON A SECOND NAME CARD EXISTS. Compared case- and
            // whitespace-insensitively, because "the same person" is a question
            // about who the name refers to, not about how it was typed. When they
            // match — the overwhelming majority — the card does not render and the
            // block shows one name, which is the whole point of the merge.
            //
            // AN EMPTY accountName COUNTS AS DIFFERING, and must. A bulk-imported
            // school account frequently has no first/last name on its users row at
            // all — its only name is organization_members.studentName, which
            // reaches here as demoName. Requiring accountName to be non-empty would
            // then drop the student's name off the page entirely: "Name: Not
            // provided" above, and the name the school recorded nowhere. That is
            // the same information loss 0f4155b fixed from the other direction.
            const subjectNameDiffers =
              !!demoName &&
              demoName.trim().toLowerCase() !== accountName.trim().toLowerCase();

            // Assessment fields belong to students. An org admin or superadmin has
            // no assessment subject, so those cards are absent for them entirely
            // rather than rendered empty.
            const showsSubjectFields =
              !isOrgAdmin && !isSuperadmin && !!(demoName || demoAge || demoGrade || demoGender);

            // The source credit 24aff62 added, kept and narrowed. It used to caption
            // a whole block; with no separate heading it would appear to describe
            // the account fields too, which come from the users row. Scoped to the
            // assessment fields, it stays true.
            const subjectSource = latestAssessment
              ? t("details.sourceAssessment")
              : t("details.sourceSchool");

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

            const notProvided = (
              <span className="text-muted-foreground font-normal text-base">{t("account.notProvided")}</span>
            );
            const orgName = (user as any).organizationName || organization?.name;

            return (
              <div>
                <div className="mb-4 text-center">
                  <h2 className="text-xl font-bold">{t("account.title")}</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ProfileNote icon={User} label={t("account.name")} color="yellow" rotation="-1" testId="text-user-name">
                    {accountName || notProvided}
                  </ProfileNote>

                  {user.email && (
                    <ProfileNote icon={Mail} label={t("account.email")} color="blue" rotation="1" testId="text-user-email">
                      <span className="break-all">{user.email}</span>
                    </ProfileNote>
                  )}

                  {user.username && (
                    <ProfileNote icon={FileText} label={t("account.username")} color="purple" rotation="2" testId="text-user-username">
                      {user.username}
                    </ProfileNote>
                  )}

                  {orgName && (
                    <ProfileNote
                      icon={Building2}
                      label={isOrgStudent ? t("account.school") : t("account.organization")}
                      color="orange"
                      rotation="-2"
                      testId="text-organization-name"
                    >
                      <span className="flex items-center gap-3">
                        {(user as any).organizationLogoUrl && (
                          <img
                            src={(user as any).organizationLogoUrl}
                            alt={t("account.schoolLogoAlt")}
                            className="h-8 w-8 object-contain rounded"
                            data-testid="img-org-logo-profile"
                          />
                        )}
                        <span className="text-primary">{orgName}</span>
                      </span>
                    </ProfileNote>
                  )}

                  <ProfileNote icon={Shield} label={t("account.accountType")} color="green" rotation="1" testId="text-account-type">
                    {getAccountTypeBadge()}
                  </ProfileNote>

                  {(user as any).lastLoginAt && (
                    <ProfileNote icon={Clock} label={t("account.lastLogin")} color="pink" rotation="-1" testId="text-last-login">
                      <span className="text-base">
                        {new Date((user as any).lastLoginAt).toLocaleString(language === 'ar' ? 'ar-AE' : 'en-US')}
                      </span>
                    </ProfileNote>
                  )}

                  {showsSubjectFields && (
                    <>
                      {subjectNameDiffers && (
                        <ProfileNote icon={Users2} label={t("details.studentName")} color="yellow" rotation="2" testId="text-demo-name">
                          {demoName}
                        </ProfileNote>
                      )}

                      <ProfileNote icon={Cake} label={t("details.age")} color="pink" rotation="1" testId="text-demo-age">
                        {demoAge ? t("details.yearsOld", { age: demoAge }) : notProvided}
                      </ProfileNote>

                      <ProfileNote icon={GraduationCap} label={t("details.grade")} color="blue" rotation="2" testId="text-demo-grade">
                        {demoGrade ? getGradeLabel(demoGrade) : notProvided}
                      </ProfileNote>

                      <ProfileNote icon={Users2} label={t("details.gender")} color="green" rotation="-2" testId="text-demo-gender">
                        {demoGender ? getGenderLabel(demoGender) : notProvided}
                      </ProfileNote>
                    </>
                  )}
                </div>

                {showsSubjectFields && (
                  <p className="mt-3 text-sm text-muted-foreground text-center" data-testid="text-details-source">
                    {subjectSource}
                  </p>
                )}
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
              {/* FOUR SHAPES, FOUR ANSWERS. This row used to force all of them
                  through premium/free, and got two of the four wrong.

                  THE CROWN NOW MEANS "YOU BOUGHT THIS" AND NOTHING ELSE. An org
                  student was shown "Premium" with a crown, because isPremium is a
                  response-only decoration auth.routes.ts adds so the client
                  renders the premium flow — not a purchase they made. It
                  advertised to a 13-year-old a licence their school bought, and
                  it contradicted the sentence directly below it
                  (premium.studentAccess, "…through your school"). The badge and
                  that sentence now agree.

                  ORG ADMIN NO LONGER READS orgStats. The old branch derived
                  "Premium"/"Free" from totalLicenses > 0, so a school admin whose
                  school had not bought licences yet was labelled Free
                  PERSONALLY — a statement about the organization printed as a
                  statement about them. "School account" is true the moment we
                  know who they are, which is why the loading and error states are
                  gone from this row: it no longer waits on a request whose answer
                  it does not use. The licence rows below still gate on orgStats
                  and still show both states. */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("premium.access")}</p>
                {isOrgAdmin ? (
                  <Badge variant="outline" data-testid="badge-premium-status">{t("premium.accessSchoolAdmin")}</Badge>
                ) : isOrgStudent ? (
                  <Badge variant="outline" data-testid="badge-premium-status">{t("premium.accessSchoolStudent")}</Badge>
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
                      {Math.max(0, SCHOOL_ALLOCATIONS_PER_STUDENT - assessments.filter(a => a.isCompleted).length)}
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
                {/* "2 of 3" ONLY WHERE A CEILING EXISTS, and it is a different
                    ceiling per population — see shared/assessmentLimits.ts:
                      org student  -> the school's allocation (SCHOOL_ALLOCATIONS_PER_STUDENT)
                      free account -> the anti-abuse cap (FREE_ASSESSMENT_CAP)
                      premium      -> NEITHER. Their bound is purchasedLicenses, a
                                      consumable already shown as purchased/used/
                                      remaining above. A denominator here would
                                      either duplicate that or contradict it, since
                                      this count includes free completions and the
                                      licence count deliberately does not.
                    An org admin never reaches this block (it is inside
                    !isOrgAdmin && !isSuperadmin); their figure is a roll-up of
                    their students' completions, which has no per-person ceiling.

                    `completed`, NOT `count`: `count` is i18next's reserved plural
                    selector. It resolves correctly today only by falling back to
                    the unsuffixed key, and would silently start selecting forms the
                    moment anyone added completedOf_one — in Arabic, six of them.
                    SuperadminDashboard's own completedOf already avoids it. */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b">
                  <p className="text-sm text-muted-foreground">{t("assessment.completed")}</p>
                  <p className="font-bold text-2xl text-green-600" data-testid="text-completed-assessments-count">
                    {isOrgStudent
                      ? t("assessment.completedOf", {
                          completed: individualCompletedAssessments,
                          cap: SCHOOL_ALLOCATIONS_PER_STUDENT,
                        })
                      : !user.isPremium
                        ? t("assessment.completedOf", {
                            completed: individualCompletedAssessments,
                            cap: FREE_ASSESSMENT_CAP,
                          })
                        : individualCompletedAssessments}
                  </p>
                </div>
                {assessments.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">{t("assessment.noAssessments")}</p>
                  <Button asChild data-testid="button-start-first-assessment">
                    {/* Free accounts go to the assessment, not to pricing. They may
                        take it, capped at FREE_ASSESSMENT_CAP completions, and the
                        cap is shown as a terminal screen on that page rather than
                        as a redirect to buy. Sending them here to /tier-selection
                        while /assessment lets them start is the inconsistency this
                        removes: told to buy in one place, allowed in the other. */}
                    <Link href="/assessment">
                      <ClipboardCheck className="w-4 h-4 me-2" />
                      {t("assessment.startFirst")}
                    </Link>
                  </Button>
                </div>
              ) : (
                <div>
                  {/* ONE CARD PER ASSESSMENT. This block sorted the list and
                      rendered `[0]`, with a comment calling the single row a
                      placeholder "for future per-year history" — written when a
                      user could hold exactly one assessment. 261b85f (free
                      retakes, capped at FREE_ASSESSMENT_CAP) made that false:
                      the counter above already says "2 of 3" while one card
                      renders, and every hidden report was unreachable from here.

                      NO CLIENT SORT. /api/assessments/my is ORDER BY created_at
                      DESC server-side (storage.ts:973-978), so index 0 is the
                      newest already; re-sorting here could only ever disagree
                      with the order the rest of the app resolves against.

                      IN-PROGRESS ROWS RENDER TOO. They are part of the history —
                      hiding them would put the card count back out of step with
                      the counter, which is the bug being fixed. Only the report
                      button is guarded on isCompleted, as before. */}
                  <div className="space-y-3">
                    {assessments.map((assessment) => {
                      // GRADE, NOT NAME. `name` is per-assessment demographics and
                      // holds the same string on every retake, so three rows would
                      // print one heading three times. Grade is what a retake
                      // changes, and 029e678 settled that a name earns display only
                      // where it differs from the account holder's — which the
                      // merged block above already handles.
                      const gradeLabel = assessment.grade
                        ? getGradeLabel(assessment.grade)
                        : t("assessment.gradeUnknown");

                      // createdAt, NOT completedAt, and deliberately: the list is
                      // ordered by createdAt, and a draft started in January but
                      // finished in March would print out of sequence against the
                      // row above it. This is when the student took it.
                      //
                      // WITH THE TIME, because the date alone does not separate
                      // two retakes taken on one day: same grade, same date, same
                      // buttons — two cards distinguishable only by which one
                      // carries the Latest badge, and no way at all to tell the
                      // second from the third. A sequence marker ("#2 of 3") was
                      // the alternative and is worse: it invents an ordinal the
                      // system does not store, it has to be recomputed whenever
                      // the list is filtered, and it would compete with the
                      // Latest badge for the same job. The timestamp is a fact
                      // already on the row.
                      const takenOn = new Date(assessment.createdAt)
                        .toLocaleString(language === 'ar' ? 'ar-AE' : 'en-US', {
                          year: 'numeric', month: 'numeric', day: 'numeric',
                          hour: 'numeric', minute: '2-digit',
                        });

                      // THE SAME PREDICATE THE ASSESSMENT PAGE RESUMES ON, imported
                      // rather than restated — the old list-wide button gated on
                      // `some(a => !a.isCompleted)`, a strictly wider set, and
                      // offered Continue on rows that resumed as a blank
                      // assessment. See isResumableDraft.
                      const isResumable = isResumableDraft(assessment);

                      return (
                        <div key={assessment.id} className="p-3 border rounded-lg" data-testid={`assessment-item-${assessment.id}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium">{gradeLabel}</p>
                            {assessment.id === latestCompletedAssessmentId && (
                              <Badge variant="secondary" data-testid={`badge-latest-${assessment.id}`}>
                                {t("assessment.latest")}
                              </Badge>
                            )}
                            {!assessment.isCompleted && (
                              <Badge variant="outline" data-testid={`badge-in-progress-${assessment.id}`}>
                                {t("assessment.inProgress")}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {takenOn}
                            {assessment.assessmentType && ` • ${isPremiumAssessment(assessment.assessmentType) ? t("premium.premium") : t("premium.free")}`}
                          </p>
                          {assessment.isCompleted && (
                            <Button asChild size="sm" className="w-full mt-3 bg-green-50 hover:bg-green-100 text-green-800 border border-green-200" data-testid={`button-view-report-${assessment.id}`}>
                              <Link href={`/results?assessmentId=${assessment.id}`}>
                                <FileText className="w-4 h-4 me-2" />
                                {t("assessment.viewReport")}
                              </Link>
                            </Button>
                          )}
                          {/* THE ID TRAVELS. A bare /assessment resumes whichever
                              draft is newest, so with two drafts the button on the
                              older row opened the other one. Assessment.tsx reads
                              this param and resumes that row or none. */}
                          {isResumable && (
                            <Button asChild size="sm" className="w-full mt-3" data-testid={`button-continue-assessment-${assessment.id}`}>
                              <Link href={`/assessment?assessmentId=${assessment.id}`}>
                                <ClipboardCheck className="w-4 h-4 me-2" />
                                {t("assessment.continueThis")}
                              </Link>
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* MORE THAN ONE GRADE, not more than one completed assessment.
                      The gate was `completed > 0`, which offered a "journey" to
                      a student who had nothing to journey through: a timeline
                      with one milestone and four Pending, and a consistency list
                      scoring careers against a denominator of one. Two
                      assessments do not fix that either — both may be retakes at
                      the same grade, which the journey collapses into the single
                      milestone it already was. The threshold is distinct grades.

                      /progress states the same condition for a student who
                      arrives without the button, since the route is reachable
                      directly. */}
                  {journeyGradeCount > 1 && (
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
