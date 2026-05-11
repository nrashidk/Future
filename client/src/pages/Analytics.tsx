import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StickyNote } from "@/components/StickyNote";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { 
  Users, 
  TrendingUp, 
  Target,
  CheckCircle,
  BarChart3,
  BarChart,
  Sparkles,
  GraduationCap,
  Home,
  Award,
  Briefcase,
  User,
  LogOut,
  Building2,
  Download,
  FileDown,
  Shield,
  FileQuestion,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface AnalyticsOverview {
  totalStudents: number;
  completedAssessments: number;
  countriesBreakdown: Array<{ countryId: string; countryName: string; count: number }>;
  gradeDistribution: Array<{ grade: string; count: number }>;
}

interface CareerTrend {
  careerId: string;
  careerTitle: string;
  recommendationCount: number;
  avgMatchScore: number;
}

interface WefSkillRef {
  name: string;
  nameAr: string | null;
}

interface SectorData {
  sector: string;
  sectorAr: string | null;
  studentCount: number;
  avgAlignment: number;
  prioritySkills: WefSkillRef[];
}

interface Organization {
  id: string;
  name: string;
  totalLicenses: number;
  usedLicenses: number;
}

export default function Analytics() {
  const { user } = useAuth();
  const { t } = useTranslation('admin');
  const { language } = useLanguage();
  const { toast } = useToast();
  useEffect(() => { document.title = t('pageTitles.analytics'); }, [t]);
  const [activeCountryId, setActiveCountryId] = useState<string | null>(null);
  const [expandedSectors, setExpandedSectors] = useState<Set<string>>(new Set());

  const toggleSectorSkills = (sectorName: string) => {
    setExpandedSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sectorName)) next.delete(sectorName);
      else next.add(sectorName);
      return next;
    });
  };
  const isOrgAdmin = user?.accountType === 'org_admin';
  const isSuperadmin = user?.accountType === 'superadmin';

  const { data: organization } = useQuery<Organization>({
    queryKey: ['/api/my-organization'],
    enabled: !!user && isOrgAdmin,
  });

  const { data: countries, isLoading: countriesLoading } = useQuery<Array<{ countryId: string; countryName: string; studentCount: number }>>({
    queryKey: ['/api/analytics/countries'],
  });

  const displayCountries = useMemo(() => 
    countries?.filter(c => c.studentCount > 0) ?? [], 
    [countries]
  );

  useEffect(() => {
    if (displayCountries.length > 0 && !activeCountryId) {
      const uaeCountry = displayCountries.find(c => c.countryName.toLowerCase().includes('emirates')) || displayCountries[0];
      if (uaeCountry) {
        setActiveCountryId(uaeCountry.countryId);
      }
    }
  }, [displayCountries, activeCountryId]);

  const { data: overview, isLoading: overviewLoading } = useQuery<AnalyticsOverview>({
    queryKey: ['/api/analytics/overview', activeCountryId],
    queryFn: async () => {
      const url = activeCountryId 
        ? `/api/analytics/overview?countryId=${activeCountryId}`
        : '/api/analytics/overview';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
  });

  const { data: careers, isLoading: careersLoading } = useQuery<CareerTrend[]>({
    queryKey: ['/api/analytics/careers', activeCountryId],
    queryFn: async () => {
      const url = activeCountryId 
        ? `/api/analytics/careers?countryId=${activeCountryId}`
        : '/api/analytics/careers';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch careers');
      return res.json();
    },
  });

  const { data: sectors, isLoading: sectorsLoading } = useQuery<SectorData[]>({
    queryKey: ['/api/analytics/sectors', activeCountryId],
    queryFn: async () => {
      const url = activeCountryId 
        ? `/api/analytics/sectors?countryId=${activeCountryId}`
        : '/api/analytics/sectors';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch sectors');
      return res.json();
    },
  });

  const completionRate = overview && overview.totalStudents > 0
    ? Math.round((overview.completedAssessments / overview.totalStudents) * 100)
    : 0;

  const topCareer = careers?.[0];

  const topGradeRaw = overview?.gradeDistribution && overview.gradeDistribution.length > 0
    ? overview.gradeDistribution.reduce((prev, current) => 
        (current.count > prev.count) ? current : prev
      ).grade
    : null;
  const topGradeFormatted = topGradeRaw 
    ? topGradeRaw.replace(/^grade/i, '').trim()
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">{t('nav.futurePathways')}</span>
            {isSuperadmin && <Badge variant="secondary">{t('badges.superadmin')}</Badge>}
            {isOrgAdmin && <Badge variant="secondary">{t('badges.schoolAdmin')}</Badge>}
          </Link>
          <div className="flex gap-2">
            {isSuperadmin && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-superadmin">
                  <Link href="/superadmin">
                    <Shield className="w-4 h-4 me-2" />
                    {t('nav.superAdmin')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 me-2" />
                    {t('nav.admin')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-questions">
                  <Link href="/admin">
                    <FileQuestion className="w-4 h-4 me-2" />
                    {t('nav.quiz')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 me-2" />
                    {t('nav.analytics')}
                  </Link>
                </Button>
              </>
            )}
            {isOrgAdmin && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-admin">
                  <Link href="/admin/organizations">
                    <Building2 className="w-4 h-4 me-2" />
                    {t('nav.admin')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-assessment">
                  <Link href="/assessment">
                    <ClipboardCheck className="w-4 h-4 me-2" />
                    {t('nav.assessment')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-analytics">
                  <Link href="/analytics">
                    <BarChart className="w-4 h-4 me-2" />
                    {t('nav.analytics')}
                  </Link>
                </Button>
              </>
            )}
            {user && (
              <>
                <Button variant="outline" size="sm" asChild data-testid="button-nav-profile">
                  <Link href="/profile">
                    <User className="w-4 h-4 me-2" />
                    {t('nav.profile')}
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.location.href = "/api/logout"}
                  data-testid="button-logout-analytics"
                >
                  <LogOut className="w-4 h-4 me-2" />
                  {t('nav.logout')}
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4">
        <AnnouncementBanner />
      </div>

      <div className="max-w-7xl mx-auto py-12 px-4">
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <BarChart3 className="w-12 h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold">{t('analytics.title')}</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            {t('analytics.subtitle')}
          </p>
        </div>

        {isOrgAdmin && organization && (
          <div className="mb-8 flex justify-center gap-3">
            <Button 
              variant="outline" 
              size="default" 
              data-testid="button-export-reports-analytics"
              onClick={() => {
                window.open(`/api/admin/organizations/${organization.id}/export/reports`, '_blank');
                toast({
                  title: t('orgs.exportReportsSummaryHintTitle'),
                  description: t('orgs.exportReportsSummaryHintDesc'),
                });
              }}
            >
              <FileDown className="w-4 h-4 me-2" />
              {t('analytics.exportReports')}
            </Button>
            <Button 
              variant="outline" 
              size="default" 
              data-testid="button-export-csv-analytics"
              onClick={() => {
                window.open(`/api/admin/organizations/${organization.id}/export/csv`, '_blank');
              }}
            >
              <Download className="w-4 h-4 me-2" />
              {t('analytics.exportCSV')}
            </Button>
          </div>
        )}

        <div className="mb-12">
          {displayCountries.length > 0 ? (
            <div className="flex flex-wrap gap-4 items-center">
              {displayCountries.map((country, index) => {
                const colors = ['yellow', 'pink', 'blue', 'green', 'purple'] as const;
                const rotations = ['-2', '-1', '1', '2', '-1'] as const;
                const color = colors[index % colors.length];
                const rotation = rotations[index % rotations.length];

                return (
                  <button
                    key={country.countryId}
                    onClick={() => setActiveCountryId(country.countryId)}
                    className="focus:outline-none transition-transform hover:scale-105"
                    data-testid={`filter-country-${country.countryId}`}
                  >
                    <StickyNote 
                      color={color} 
                      rotation={rotation}
                      className={`w-72 h-36 ${activeCountryId === country.countryId ? "ring-4 ring-primary ring-offset-2" : ""}`}
                    >
                      <div className="text-center h-full flex flex-col justify-center px-2">
                        <p className="text-base font-bold mb-2 whitespace-nowrap">{country.countryName}</p>
                        <p className="text-3xl font-bold text-primary">{country.studentCount}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('analytics.studentsAssessed')}</p>
                      </div>
                    </StickyNote>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              {t('analytics.noCountries')}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <StickyNote color="yellow" rotation="-1">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">{t('analytics.totalStudents')}</p>
                <p className="text-2xl font-bold" data-testid="metric-total-students">
                  {overviewLoading ? "..." : overview?.totalStudents.toLocaleString() || 0}
                </p>
              </div>
              <Users className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>

          <StickyNote color="pink" rotation="1">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">{t('analytics.completionRate')}</p>
                <p className="text-2xl font-bold" data-testid="metric-completion-rate">
                  {overviewLoading ? "..." : `${completionRate}%`}
                </p>
              </div>
              <CheckCircle className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>

          <StickyNote color="blue" rotation="-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">{t('analytics.topGrade')}</p>
                <p className="text-2xl font-bold" data-testid="metric-top-grade">
                  {overviewLoading ? "..." : topGradeFormatted ? t('analytics.gradeN', { n: topGradeFormatted }) : t('analytics.na')}
                </p>
              </div>
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>

          <StickyNote color="green" rotation="2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-muted-foreground text-sm mb-1">{t('analytics.topCareer')}</p>
                <p className="text-2xl font-bold line-clamp-2" data-testid="metric-top-career">
                  {careersLoading ? "..." : topCareer?.careerTitle || t('analytics.na')}
                </p>
              </div>
              <Sparkles className="w-8 h-8 text-primary" />
            </div>
          </StickyNote>
        </div>

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <GraduationCap className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">{t('analytics.gradeDistributionTitle')}</h2>
          </div>
          {overviewLoading ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              {t('analytics.gradeDistributionLoading')}
            </div>
          ) : overview?.gradeDistribution && overview.gradeDistribution.length > 0 ? (
            <Card>
              <CardContent className="pt-6">
                <ResponsiveContainer width="100%" height={280}>
                  <RechartsBarChart
                    data={overview.gradeDistribution.map(d => ({
                      ...d,
                      label: t('analytics.gradeN', { n: d.grade.replace(/^grade\s*/i, '') }),
                    }))}
                    margin={{ top: 8, right: 24, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 13 }}
                      label={{
                        value: t('analytics.chartAxisGrade'),
                        position: 'insideBottom',
                        offset: -2,
                        fontSize: 13,
                      }}
                      height={48}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 13 }}
                      label={{
                        value: t('analytics.chartAxisStudents'),
                        angle: -90,
                        position: 'insideLeft',
                        offset: 10,
                        fontSize: 13,
                      }}
                      width={52}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        `${value} ${t('analytics.chartTooltipStudents')}`,
                        t('analytics.chartAxisStudents'),
                      ]}
                      labelFormatter={(label: string) => label}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              {t('analytics.gradeDistributionNoData')}
            </div>
          )}
        </div>

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">{t('analytics.topCareers')}</h2>
          </div>
          
          {careersLoading ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              {t('analytics.loadingCareers')}
            </div>
          ) : careers && careers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {careers.slice(0, 12).map((career, index) => {
                const colors: Array<"yellow" | "pink" | "blue" | "green" | "purple"> = ["yellow", "pink", "blue", "green", "purple"];
                const rotations: Array<"-1" | "1" | "-2" | "2"> = ["-1", "1", "-2", "2"];
                
                return (
                  <StickyNote 
                    key={career.careerId}
                    color={colors[index % 5]}
                    rotation={rotations[index % 4]}
                    className="aspect-[3/4]"
                  >
                    <div className="flex flex-col h-full p-1">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="secondary" className="text-xs">
                          #{index + 1}
                        </Badge>
                        <Award className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm mb-2 line-clamp-3" data-testid={`career-${index}`}>
                        {career.careerTitle}
                      </h4>
                      <div className="mt-auto space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>{career.recommendationCount} {t('analytics.recommendations')}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <TrendingUp className="w-3 h-3 text-primary" />
                          <span className="text-xs font-semibold text-primary">
                            {career.avgMatchScore.toFixed(1)}% {t('analytics.avgMatch')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </StickyNote>
                );
              })}
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              {t('analytics.noCareers')}
            </div>
          )}
        </div>

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <BarChart className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">{t('analytics.careerTrendsTitle')}</h2>
          </div>
          {careersLoading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {t('analytics.loadingCareers')}
            </div>
          ) : careers && careers.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-center">{t('analytics.colRank')}</TableHead>
                      <TableHead>{t('analytics.colCareer')}</TableHead>
                      <TableHead className="text-end">{t('analytics.colRecommendations')}</TableHead>
                      <TableHead className="text-end">{t('analytics.colAvgMatch')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {careers.map((career, index) => (
                      <TableRow key={career.careerId} data-testid={`career-row-${career.careerId}`}>
                        <TableCell className="text-center font-medium text-muted-foreground">
                          #{index + 1}
                        </TableCell>
                        <TableCell className="font-medium">{career.careerTitle}</TableCell>
                        <TableCell className="text-end">{career.recommendationCount}</TableCell>
                        <TableCell className="text-end font-semibold text-primary">
                          {career.avgMatchScore.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground">
              {t('analytics.noCareers')}
            </div>
          )}
        </div>

        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <Target className="w-6 h-6 text-primary" />
            <h2 className="text-2xl font-bold">{t('analytics.talentPipeline')}</h2>
          </div>
          
          {sectorsLoading ? (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              {t('analytics.loadingSectors')}
            </div>
          ) : sectors && sectors.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sectors.slice(0, 12).map((sector, index) => {
                const colors: Array<"yellow" | "pink" | "blue" | "green" | "purple"> = ["blue", "green", "pink", "yellow", "purple"];
                const rotations: Array<"-1" | "1" | "-2" | "2"> = ["1", "-1", "2", "-2"];
                
                const isExpanded = expandedSectors.has(sector.sector);
                const allSkills = sector.prioritySkills ?? [];
                const visibleSkills = isExpanded ? allSkills : allSkills.slice(0, 3);
                const hiddenCount = allSkills.length - 3;

                return (
                  <StickyNote 
                    key={sector.sector}
                    color={colors[index % 5]}
                    rotation={rotations[index % 4]}
                    className={isExpanded ? undefined : "aspect-[3/4]"}
                  >
                    <div className="flex flex-col h-full p-1">
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-xs">
                          {t('analytics.sectorN', { n: index + 1 })}
                        </Badge>
                        <Briefcase className="w-4 h-4 text-primary" />
                      </div>
                      <h4 className="font-bold text-sm mb-2 line-clamp-3" data-testid={`sector-${index}`}>
                        {language === 'ar' && sector.sectorAr ? sector.sectorAr : sector.sector}
                      </h4>
                      {allSkills.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-muted-foreground mb-1">{t('analytics.prioritySkills')}</p>
                          <div className="flex flex-wrap gap-1">
                            {visibleSkills.map((skill) => (
                              <Badge
                                key={skill.name}
                                variant="secondary"
                                className="text-xs"
                                data-testid={`badge-sector-skill-${skill.name.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                {language === 'ar' && skill.nameAr ? skill.nameAr : skill.name}
                              </Badge>
                            ))}
                          </div>
                          {allSkills.length > 3 && (
                            <button
                              type="button"
                              onClick={() => toggleSectorSkills(sector.sector)}
                              className="mt-1.5 flex items-center gap-0.5 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                              data-testid={`button-sector-skills-toggle-${index}`}
                            >
                              {isExpanded ? (
                                <>
                                  <ChevronUp className="w-3 h-3" aria-hidden="true" />
                                  {t('analytics.skillsShowLess')}
                                </>
                              ) : (
                                <>
                                  <ChevronDown className="w-3 h-3" aria-hidden="true" />
                                  {t('analytics.skillsShowMore', { n: hiddenCount })}
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      <div className="mt-auto space-y-2">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>{sector.studentCount} {t('analytics.students')}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{t('analytics.visionAlignment')}</span>
                            <span className="font-semibold text-primary">
                              {sector.avgAlignment.toFixed(1)}%
                            </span>
                          </div>
                          <Progress value={sector.avgAlignment} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </StickyNote>
                );
              })}
            </div>
          ) : (
            <div className="h-60 flex items-center justify-center text-muted-foreground">
              {t('analytics.noSectors')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
