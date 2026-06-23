import { useAuth } from "@/hooks/useAuth";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MasonryGrid, MasonryItem } from "@/components/MasonryGrid";
import { isPremiumAssessment } from "@shared/assessmentTier";
import { 
  GraduationCap, 
  Target, 
  TrendingUp, 
  BookOpen, 
  Download, 
  Share2,
  Star,
  CheckCircle2,
  ArrowRight,
  Heart,
  Globe,
  Sparkles,
  Shield,
  Crown,
  Smile,
  DollarSign,
  Loader2
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAssessmentAvailability } from "@/hooks/useAssessmentAvailability";
import type { Recommendation, Career } from "@shared/schema";

interface WefSkillTag {
  name: string;
  nameAr: string | null;
  description: string;
  descriptionAr: string | null;
}

interface EnrichedRecommendation extends Recommendation {
  career?: Career;
  wefSkillTags?: WefSkillTag[];
  premiumReasoning?: string;
  workStyleFit?: string;
  strengthsGrowth?: string;
  premiumActionSteps?: string[];
  matchedSubjects?: Array<{ subject: string; competency: number }>;
  supportingVisionPriorities?: string[];
}

/**
 * Return the Arabic variant when the UI is in Arabic mode and the field is
 * non-empty, otherwise fall back to the English value.
 */
function localizeField(ar: string | null | undefined, en: string | null | undefined): string {
  return (ar && ar.trim()) ? ar : (en || '');
}

/**
 * Return the Arabic skill array when the UI is in Arabic mode and the array is
 * non-empty, otherwise fall back to the English array.
 */
function localizeSkills(
  language: string,
  arSkills: string[] | null | undefined,
  enSkills: string[] | null | undefined
): string[] {
  if (language === 'ar' && arSkills && arSkills.length > 0) return arSkills;
  return enSkills || [];
}

// LLM-powered "Why This Career?" for premium users — fetches per career card
function CareerReasoningText({
  assessmentId,
  careerId,
  fallback,
}: {
  assessmentId: string;
  careerId: string;
  fallback: string;
}) {
  const { t } = useTranslation('results');
  const { language } = useLanguage();
  const { data, isLoading, isError } = useQuery<any>({
    queryKey: [`/api/recommendations/${assessmentId}/career-reasoning/${careerId}?lang=${language}`],
    retry: false,
    staleTime: Infinity,
  });

  if (isLoading) {
    return (
      <span className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
        {t('generatingInsights', 'Generating AI insights...')}
      </span>
    );
  }

  if (isError || !data?.careerReasoning) {
    return <span className="whitespace-pre-line">{fallback}</span>;
  }

  return <span className="whitespace-pre-line">{data.careerReasoning}</span>;
}

// Helper to get display name — returns Arabic name when lang==='ar' and available.
// tFn is used only for the "your country" fallback string.
function getCountryDisplayName(
  country: any,
  lang: string,
  tFn: (key: string) => string
): string {
  if (!country) return tFn('countryFallback');
  return (lang === 'ar' && country.nameAr) ? country.nameAr : (country.name || tFn('countryFallback'));
}

// Map DB growth outlook prefix words to their results.json i18n keys
const GROWTH_LEVEL_I18N: Record<string, string> = {
  "Excellent": "growthExcellent",
  "Very Good": "growthVeryGood",
  "Good": "growthGood",
  "Moderate": "growthModerate",
  "Depends on venture": "growthDepends",
};

function localizeGrowthOutlook(outlook: string, tFn: (key: string, opts?: any) => string): string {
  // Standalone match (no percentage): "Depends on venture"
  const standaloneKey = GROWTH_LEVEL_I18N[outlook.trim()];
  if (standaloneKey) return tFn(standaloneKey);
  // Pattern: "Excellent (25% growth)"
  const match = outlook.match(/^([^(]+?)\s*\((\d+)%\s*growth\)$/i);
  if (match) {
    const prefix = match[1].trim();
    const pct = match[2];
    const levelKey = GROWTH_LEVEL_I18N[prefix];
    if (levelKey) return tFn('growthPctPattern', { level: tFn(levelKey), pct });
  }
  return outlook;
}

// Map raw country.targets keys to results-namespace i18n keys for localized display
const CATEGORY_I18N_KEY: Record<string, string> = {
  tech: 'visionCategoryTech',
  technology: 'visionCategoryTech',
  climate: 'visionCategoryClimate',
  environment: 'visionCategoryClimate',
  economic: 'visionCategoryEconomic',
  economy: 'visionCategoryEconomic',
};

function localizeCategory(raw: string, tFn: (key: string, opts?: any) => string): string {
  const i18nKey = CATEGORY_I18N_KEY[raw.toLowerCase()];
  return i18nKey ? tFn(i18nKey) : raw;
}

/**
 * Translate a vision priority string (a country priority-sector name stored in
 * English) to its Arabic equivalent by looking it up in the country's
 * prioritySectors / prioritySectorsAr parallel arrays.  Falls back to the
 * original English string when a match cannot be found.
 */
function localizePriorityString(
  priority: string,
  country: any,
  language: string
): string {
  if (language !== 'ar') return priority;
  const sectorsEn = country?.prioritySectors as string[] | undefined;
  const sectorsAr = country?.prioritySectorsAr as string[] | undefined;
  if (!sectorsEn || !sectorsAr) return priority;
  const idx = sectorsEn.findIndex(
    (s) => s.toLowerCase() === priority.toLowerCase()
  );
  return idx >= 0 && sectorsAr[idx] ? sectorsAr[idx] : priority;
}

// Helper to map subjects to vision sectors using actual country vision data
function mapSubjectsToVisionSectors(
  subjectScores: Record<string, { percentage: number }>,
  country: any,
  tFn: (key: string, opts?: any) => string,
  lang: string = 'en'
): string | null {
  if (!subjectScores || !country?.targets || typeof country.targets !== 'object') return null;

  // Get top 2 subjects
  const topSubjects = Object.entries(subjectScores)
    .sort(([, a], [, b]) => b.percentage - a.percentage)
    .slice(0, 2)
    .map(([subject]) => subject);

  if (topSubjects.length === 0) return null;

  // Extract vision categories from country.targets (jsonb object with keys like "tech","climate","economic")
  const visionCategories = Object.keys(country.targets);

  // Map subjects to vision category keywords
  const subjectKeywords: Record<string, string[]> = {
    Mathematics: ["technology", "innovation", "economic", "industry"],
    "Computer Science": ["technology", "innovation", "digital"],
    Science: ["climate", "environment", "technology", "innovation", "energy"],
    "Social Studies": ["social", "progress", "economic", "development"],
    Arabic: ["social", "progress", "cultural"],
    English: ["economic", "development", "global"],
  };

  // Find matching vision categories for top subjects (store raw keys for matching)
  const matchedRawCategories = new Set<string>();
  topSubjects.forEach((subject) => {
    const keywords = subjectKeywords[subject] || [];
    visionCategories.forEach((category) => {
      const categoryLower = category.toLowerCase();
      if (keywords.some(keyword => categoryLower.includes(keyword))) {
        matchedRawCategories.add(category);
      }
    });
  });

  if (matchedRawCategories.size === 0) return null;

  // Translate raw category keys to localized display labels
  const andWord = tFn('and');
  const subjectsText = topSubjects.join(` ${andWord} `);
  const rawArray = Array.from(matchedRawCategories).slice(0, 2);
  const localizedArray = rawArray.map(raw => localizeCategory(raw, tFn));
  const categoriesText = localizedArray.length === 1
    ? localizedArray[0]
    : `${localizedArray[0]} ${andWord} ${localizedArray[1]}`;

  return tFn('visionLinkageText', {
    subjects: subjectsText,
    country: getCountryDisplayName(country, lang, tFn),
    categories: categoriesText,
  });
}

export default function Results() {
  const { t } = useTranslation('results');
  const { language } = useLanguage();
  useEffect(() => { document.title = t('pageDocTitle'); }, [t]);

  const { isAuthenticated, user } = useAuth();
  const { isOrgStudent, hasAvailable } = useAssessmentAvailability();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get assessmentId from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const urlAssessmentId = urlParams.get("assessmentId");
  const [assessmentId, setAssessmentId] = useState<string | null>(urlAssessmentId);

  // Guest token is now sent via httpOnly cookie automatically
  const { data: recommendations = [], isLoading, isError: isRecommendationsError } = useQuery<any[]>({
    queryKey: urlAssessmentId 
      ? [`/api/recommendations?assessmentId=${urlAssessmentId}&lang=${language}`]
      : [`/api/recommendations?lang=${language}`],
    enabled: true,
  });

  // Determine active assessment ID (URL param or extracted from recommendations)
  const activeAssessmentId = urlAssessmentId || assessmentId;

  // Fetch quiz data to get subject competency scores
  const { data: quizData } = useQuery<any>({
    queryKey: [`/api/assessments/${activeAssessmentId}/quiz`],
    enabled: !!activeAssessmentId,
  });

  // Fetch assessment to get country data
  const { data: assessment } = useQuery<any>({
    queryKey: [`/api/assessments/${activeAssessmentId}`],
    enabled: !!activeAssessmentId,
  });

  // Fetch country data for vision linkage
  const { data: country } = useQuery<any>({
    queryKey: [`/api/countries/${assessment?.countryId}`],
    enabled: !!assessment?.countryId,
  });

  // Fetch CVQ result for premium users
  const { data: cvqResult } = useQuery<any>({
    queryKey: [`/api/cvq/result/${activeAssessmentId}`],
    enabled: !!activeAssessmentId && isPremiumAssessment(assessment?.assessmentType),
  });

  // Extract assessment ID from recommendations
  useEffect(() => {
    if (recommendations.length > 0 && recommendations[0].assessmentId) {
      setAssessmentId(recommendations[0].assessmentId);
      
      // Store in localStorage for guest migration
      if (!isAuthenticated) {
        const guestAssessments = JSON.parse(localStorage.getItem("guestAssessments") || "[]");
        if (!guestAssessments.includes(recommendations[0].assessmentId)) {
          guestAssessments.push(recommendations[0].assessmentId);
          localStorage.setItem("guestAssessments", JSON.stringify(guestAssessments));
        }
      }
    }
  }, [recommendations, isAuthenticated]);

  const migrateMutation = useMutation({
    mutationFn: async () => {
      const guestAssessmentIds = JSON.parse(localStorage.getItem("guestAssessments") || "[]");
      return await apiRequest("POST", "/api/assessments/migrate", { guestAssessmentIds });
    },
    onSuccess: (data: any) => {
      toast({
        title: t('migrateSuccessTitle'),
        description: t('migrateSuccessDesc'),
      });
      localStorage.removeItem("guestAssessments");
    },
  });

  const handleDownloadPDF = () => {
    if (assessmentId) {
      try {
        // Use anchor tag approach to prevent navigation and state update issues
        const link = document.createElement('a');
        link.href = `/api/recommendations/pdf/${assessmentId}?lang=${language}`;
        link.download = `career-report-${assessmentId}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: t('downloadStarted'),
          description: t('downloadDesc'),
        });
      } catch (error) {
        console.error("PDF download error:", error);
        // Fallback to window.location
        window.location.href = `/api/recommendations/pdf/${assessmentId}?lang=${language}`;
      }
    }
  };

  const handleSignUp = async () => {
    // Trigger migration after sign-up, redirect back to results page
    window.location.href = "/api/login?returnTo=/results";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    );
  }

  if (isRecommendationsError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
        <div className="text-center max-w-md">
          <GraduationCap className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">{t('errorTitle')}</h1>
          <p className="text-muted-foreground mb-6">
            {t('errorDesc')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => window.location.reload()} data-testid="button-retry">
              {t('retry')}
            </Button>
            <Button variant="outline" onClick={() => window.history.back()} data-testid="button-go-back">
              {t('goBack')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 mb-4">
            <Star className="w-10 h-10" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{t('pageTitle')}</h1>
          <p className="text-xl text-primary-foreground/90 font-body">
            {t('pageSubtitle')}
          </p>
        </div>
      </div>

      {/* Subject Competency Spotlight */}
      {quizData?.completed && quizData?.subjectScores && Object.keys(quizData.subjectScores).length > 0 && (
        <div className="max-w-4xl mx-auto px-4 -mt-8 mb-8">
          <StickyNote color="purple" rotation="1" className="p-8">
            <div className="text-center mb-6">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-3xl font-bold mb-2">{t('subjectStrengthsTitle')}</h2>
              <p className="text-muted-foreground font-body">
                {t('subjectStrengthsSubtitle')}
              </p>
            </div>

            {/* Overall Competency */}
            <div className="mb-6 text-center">
              <div className="inline-block">
                <div className="text-6xl font-bold text-primary mb-2" data-testid="text-overall-competency">
                  {quizData.totalScore}%
                </div>
                <div className="text-sm font-semibold" data-testid="text-competency-level">
                  {quizData.totalScore >= 80 ? t('masteryExcellent') : 
                   quizData.totalScore >= 60 ? t('masteryStrong') :
                   quizData.totalScore >= 40 ? t('masteryGood') : 
                   t('masteryGrow')}
                </div>
              </div>
            </div>

            {/* Subject-by-Subject Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {Object.entries(quizData.subjectScores)
                .sort(([, a]: any, [, b]: any) => b.percentage - a.percentage)
                .map(([subject, score]: [string, any]) => (
                  <div key={subject} className="p-4 bg-background/30 rounded-lg" data-testid={`card-subject-${subject.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold font-body">{subject}</span>
                      <span className="text-lg font-bold text-primary" data-testid={`text-score-${subject.toLowerCase().replace(/\s+/g, '-')}`}>
                        {score.percentage}%
                      </span>
                    </div>
                    <Progress value={score.percentage} className="h-2 mb-1" />
                    <p className="text-xs text-muted-foreground font-body">
                      {t('correctOfTotal', { correct: score.correct, total: score.total })}
                    </p>
                  </div>
              ))}
            </div>

            {/* Insights */}
            <div className="space-y-2 text-sm" data-testid="section-competency-insights">
              {quizData.totalScore >= 70 ? (
                <div className="flex items-start gap-2" data-testid="insight-strong-competency">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body">{t('insightStrong')}</p>
                </div>
              ) : quizData.totalScore >= 50 ? (
                <div className="flex items-start gap-2" data-testid="insight-moderate-competency">
                  <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body">{t('insightModerate')}</p>
                </div>
              ) : (
                <div className="flex items-start gap-2" data-testid="insight-growth-competency">
                  <Star className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body">{t('insightGrowth')}</p>
                </div>
              )}
              <div className="flex items-start gap-2" data-testid="insight-competency-validation">
                <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="font-body">{t('insightValidation')}</p>
              </div>
              {country && (() => {
                const visionLinkage = mapSubjectsToVisionSectors(quizData.subjectScores, country, t, language);
                return visionLinkage ? (
                  <div className="flex items-start gap-2" data-testid="insight-vision-linkage">
                    <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="font-body">
                      <strong>{t('connectingVision')}</strong> {visionLinkage}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2" data-testid="insight-vision-linkage-generic">
                    <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="font-body">
                      <strong>{t('connectingVision')}</strong> {t('visionGeneric')}
                    </p>
                  </div>
                );
              })()}
            </div>
          </StickyNote>
        </div>
      )}

      {/* CVQ Values Insights (Premium Users Only) */}
      {cvqResult && isPremiumAssessment(assessment?.assessmentType) && (
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <StickyNote color="purple" rotation="1" className="p-8">
            <div className="text-center mb-6">
              <Heart className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-3xl font-bold mb-2">{t('valuesTitle')}</h2>
              <p className="text-muted-foreground font-body">
                {t('valuesSubtitle')}
              </p>
            </div>

            {/* Top 3 Values */}
            <div className="mb-6">
              <h3 className="font-semibold mb-4 text-center">{t('top3Title')}</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {(() => {
                  const domainNames: Record<string, { name: string; icon: any; description: string }> = {
                    achievement: { name: t('domainAchievement'), icon: Target, description: t('domainAchievementDesc') },
                    benevolence: { name: t('domainBenevolence'), icon: Heart, description: t('domainBenevolenceDesc') },
                    universalism: { name: t('domainUniversalism'), icon: Globe, description: t('domainUniversalismDesc') },
                    self_direction: { name: t('domainSelfDirection'), icon: Sparkles, description: t('domainSelfDirectionDesc') },
                    security: { name: t('domainSecurity'), icon: Shield, description: t('domainSecurityDesc') },
                    power: { name: t('domainPower'), icon: Crown, description: t('domainPowerDesc') },
                    hedonism: { name: t('domainHedonism'), icon: Smile, description: t('domainHedonismDesc') },
                  };

                  const scores = cvqResult.normalizedScores as Record<string, number>;
                  const sorted = Object.entries(scores)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3);

                  return sorted.map(([domain, score], index) => {
                    const info = domainNames[domain];
                    if (!info) return null;
                    const Icon = info.icon;
                    const rank = index + 1;
                    
                    return (
                      <div 
                        key={domain} 
                        className="p-4 bg-background/30 rounded-lg border-2 border-primary/20"
                        data-testid={`value-rank-${rank}`}
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                            {rank}
                          </div>
                          <Icon className="w-6 h-6 text-primary" />
                        </div>
                        <h4 className="font-semibold mb-1">{info.name}</h4>
                        <p className="text-xs text-muted-foreground mb-2">{info.description}</p>
                        <div className="flex items-center gap-2">
                          <Progress value={score} className="h-2 flex-1" />
                          <span className="text-sm font-semibold">{Math.round(score)}%</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* All Domain Scores */}
            <div className="mb-6 p-4 bg-background/30 rounded-lg">
              <h4 className="font-semibold mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                {t('allValuesTitle')}
              </h4>
              <div className="space-y-3">
                {(() => {
                  const domainNames: Record<string, { name: string; icon: any }> = {
                    achievement: { name: t('domainAchievement'), icon: Target },
                    benevolence: { name: t('domainBenevolence'), icon: Heart },
                    universalism: { name: t('domainUniversalism'), icon: Globe },
                    self_direction: { name: t('domainSelfDirection'), icon: Sparkles },
                    security: { name: t('domainSecurity'), icon: Shield },
                    power: { name: t('domainPower'), icon: Crown },
                    hedonism: { name: t('domainHedonism'), icon: Smile },
                  };

                  const scores = cvqResult.normalizedScores as Record<string, number>;
                  return Object.entries(domainNames).map(([domain, info]) => {
                    const score = scores[domain] || 0;
                    const Icon = info.icon;

                    return (
                      <div key={domain} className="flex items-center gap-3">
                        <Icon className="w-5 h-5 text-primary flex-shrink-0" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{info.name}</span>
                            <span className="text-sm font-semibold">{Math.round(score)}%</span>
                          </div>
                          <Progress value={score} className="h-2" />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* What This Means */}
            <div className="mb-6 p-4 bg-background/30 rounded-lg">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                {t('whatMeansTitle')}
              </h4>
              <div className="space-y-3 text-sm font-body">
                {(() => {
                  const scores = cvqResult.normalizedScores as Record<string, number>;
                  const top3 = Object.entries(scores)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([d]) => d);

                  const explanations: Record<string, string> = {
                    achievement: t('explanationAchievement'),
                    benevolence: t('explanationBenevolence'),
                    universalism: t('explanationUniversalism'),
                    self_direction: t('explanationSelfDirection'),
                    security: t('explanationSecurity'),
                    power: t('explanationPower'),
                    hedonism: t('explanationHedonism'),
                  };

                  return top3.map(domain => (
                    <p key={domain} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>{t(`domain${domain.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`)}:</strong> {explanations[domain]}</span>
                    </p>
                  ));
                })()}
              </div>
            </div>

            {/* Career Connection */}
            <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <div className="flex items-start gap-2">
                <Target className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-2 text-primary">{t('careerConnectionTitle')}</h4>
                  <p className="text-sm font-body">
                    {t('careerConnectionDesc')}
                  </p>
                </div>
              </div>
            </div>
          </StickyNote>
        </div>
      )}

      {/* Personality Profile – Holland Codes (premium) or Personality Traits (free) */}
      {assessment && (
        (isPremiumAssessment(assessment?.assessmentType) && assessment.riasecScores) ||
        (!isPremiumAssessment(assessment?.assessmentType) && assessment.personalityTraits &&
          (Array.isArray(assessment.personalityTraits)
            ? assessment.personalityTraits.length > 0
            : Object.keys(assessment.personalityTraits as object).length > 0))
      ) && (
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <StickyNote color="blue" rotation="-1" className="p-8">
            <div className="text-center mb-6">
              <Star className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-3xl font-bold mb-2">{t('personalityProfileTitle')}</h2>
              <p className="text-muted-foreground font-body">
                {t('personalityProfileSubtitle')}
              </p>
            </div>

            {/* Holland Code bars (Premium – RIASEC assessment) */}
            {isPremiumAssessment(assessment?.assessmentType) && assessment.riasecScores && (() => {
              const RIASEC_MAP: Record<string, { nameKey: string; descKey: string }> = {
                R: { nameKey: 'riasecRealistic',     descKey: 'riasecRealisticDesc'     },
                I: { nameKey: 'riasecInvestigative', descKey: 'riasecInvestigativeDesc' },
                A: { nameKey: 'riasecArtistic',      descKey: 'riasecArtisticDesc'      },
                S: { nameKey: 'riasecSocial',        descKey: 'riasecSocialDesc'        },
                E: { nameKey: 'riasecEnterprising',  descKey: 'riasecEnterprisingDesc'  },
                C: { nameKey: 'riasecConventional',  descKey: 'riasecConventionalDesc'  },
              };
              const scores = assessment.riasecScores as Record<string, number>;
              const maxScore = Math.max(...Object.values(scores));
              const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
              return (
                <>
                  <h3 className="font-semibold mb-4">{t('hollandCodesTitle')}</h3>
                  <div className="space-y-3 mb-4">
                    {sorted.map(([theme, score]) => {
                      const meta = RIASEC_MAP[theme];
                      if (!meta) return null;
                      const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
                      return (
                        <div key={theme} data-testid={`riasec-bar-${theme.toLowerCase()}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{t(meta.nameKey)}</span>
                            <span className="text-xs text-muted-foreground">{t(meta.descKey)}</span>
                          </div>
                          <Progress value={pct} className="h-2" />
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* Personality Traits (Free tier) */}
            {!isPremiumAssessment(assessment?.assessmentType) && assessment.personalityTraits && (
              <>
                <h3 className="font-semibold mb-3">{t('personalityTraitsTitle')}</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(Array.isArray(assessment.personalityTraits)
                    ? assessment.personalityTraits
                    : Object.keys(assessment.personalityTraits as object)
                  ).map((trait: string) => (
                    <span
                      key={trait}
                      className="bg-primary/10 px-3 py-1 rounded-full text-sm font-medium"
                      data-testid={`badge-trait-${trait.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {t(`traits.${trait}`, { defaultValue: trait })}
                    </span>
                  ))}
                </div>
              </>
            )}

            <p className="text-sm text-muted-foreground font-body">{t('personalityMatchDesc')}</p>
          </StickyNote>
        </div>
      )}

      {/* Upgrade Prompt (Free Users Only - hide for premium users and premium assessments) */}
      {!isPremiumAssessment(assessment?.assessmentType) && !user?.isPremium && (
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <StickyNote color="purple" rotation="1" className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Star className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">{t('upgradeTitle')}</h2>
              <p className="text-muted-foreground font-body">
                {t('upgradeSubtitle')}
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">{t('featureLearning')}</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      {t('featureLearningDesc')}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">{t('featureTips')}</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      {t('featureTipsDesc')}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">{t('featureMatching')}</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      {t('featureMatchingDesc')}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">{t('featureReport')}</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      {t('featureReportDesc')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="bg-primary/10 rounded-lg p-6 text-center border-2 border-primary/20">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-lg px-8"
                onClick={() => setLocation('/tier-selection')}
                data-testid="button-upgrade-premium"
              >
                <Star className="w-5 h-5 me-2" />
                {t('btnUnlock')}
                <ArrowRight className="w-5 h-5 ms-2" />
              </Button>
            </div>
          </StickyNote>
        </div>
      )}

      {/* Recommendations */}
      <div className="max-w-7xl mx-auto px-4 -mt-8" role="region" aria-labelledby="recommendations-heading">
        <h2 id="recommendations-heading" className="sr-only">{t('recommendationsHeading')}</h2>
        <MasonryGrid>
          {recommendations.map((rec: EnrichedRecommendation, index: number) => (
            <MasonryItem key={rec.id} className="animate-in fade-in duration-500" style={{ animationDelay: `${index * 100}ms` }}>
              <StickyNote
                color={["yellow", "pink", "blue", "green", "purple"][index % 5] as any}
                rotation={index % 2 === 0 ? "1" : "-1"}
                className="p-6 lg:p-8"
              >
                {/* Header: Title and Match Score */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold mb-1" data-testid={`text-career-title-${rec.careerId}`}>
                      {language === 'ar'
                        ? localizeField(rec.career?.titleAr, rec.career?.title)
                        : (rec.career?.title || '')}
                    </h3>
                    <p className="text-muted-foreground font-body text-sm" data-testid={`text-career-desc-${rec.careerId}`}>
                      {language === 'ar'
                        ? localizeField(rec.career?.descriptionAr, rec.career?.description)
                        : (rec.career?.description || '')}
                    </p>
                  </div>
                  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-bold text-lg flex-shrink-0">
                    {Math.round(rec.overallMatchScore)}%
                  </div>
                </div>

                {/* Match Breakdown - Vertical Stack */}
                <div className="space-y-2 mb-4">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4" />
                        {t('subjectMatch')}
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.subjectMatchScore)}%</span>
                    </div>
                    <Progress value={rec.subjectMatchScore} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{t('weightLabel', { pct: 30 })}</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Star className="w-4 h-4" />
                        {t('interestMatch')}
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.interestMatchScore)}%</span>
                    </div>
                    <Progress value={rec.interestMatchScore} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{t('weightLabel', { pct: 30 })}</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Target className="w-4 h-4" />
                        {t('visionAlignment')}
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.countryVisionAlignment)}%</span>
                    </div>
                    <Progress value={rec.countryVisionAlignment} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{t('weightLabel', { pct: 20 })}</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4" />
                        {t('marketDemand')}
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.futureMarketDemand)}%</span>
                    </div>
                    <Progress value={rec.futureMarketDemand} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{t('weightLabel', { pct: 20 })}</p>
                  </div>
                </div>

                {/* Salary & Growth Info */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-background/30 rounded-lg text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs text-muted-foreground mb-1">{t('growthOutlook')}</p>
                    <p className="font-bold text-sm">{localizeGrowthOutlook(rec.career?.growthOutlook || '', t)}</p>
                  </div>
                  {rec.career?.averageSalary && (
                    <div className="p-3 bg-background/30 rounded-lg text-center">
                      <DollarSign className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground mb-1">{t('avgSalary')}</p>
                      <p className="font-bold text-sm">{t('typical')} {rec.career.averageSalary}</p>
                    </div>
                  )}
                </div>

                {/* Validated Competencies & Vision Priorities */}
                {((rec.matchedSubjects && rec.matchedSubjects.length > 0) || (rec.supportingVisionPriorities && rec.supportingVisionPriorities.length > 0)) && (
                  <div className="p-3 bg-background/30 rounded-lg space-y-2 mb-4">
                        {rec.matchedSubjects && rec.matchedSubjects.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">✓ {t('validatedCompetencies')}</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {rec.matchedSubjects.map((item) => (
                                <span
                                  key={item.subject}
                                  className="inline-flex items-center gap-1 bg-primary/10 px-2 py-0.5 rounded-full text-xs font-medium"
                                  data-testid={`badge-competency-${item.subject.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <CheckCircle2 className="w-3 h-3 text-primary" />
                                  {item.subject}: {item.competency}%
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {rec.supportingVisionPriorities && rec.supportingVisionPriorities.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">🎯 {t('supportsVision')}</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {rec.supportingVisionPriorities.map((priority, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 bg-accent/20 px-2 py-0.5 rounded-full text-xs font-medium"
                                  data-testid={`badge-vision-${idx}`}
                                >
                                  <Target className="w-3 h-3" />
                                  {localizePriorityString(priority, country, language)}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                {/* Required Skills — Arabic labels via requiredSkillsAr with English fallback */}
                {(() => {
                  const skills = localizeSkills(language, rec.career?.requiredSkillsAr, rec.career?.requiredSkills);
                  return skills.length > 0 ? (
                  <div className="mb-4">
                    <h4 className="font-semibold mb-2 text-sm">{t('requiredSkills')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {skills.map((skill: string) => (
                          <span
                            key={skill}
                            className="bg-primary/10 px-3 py-1 rounded-full text-sm font-medium"
                            data-testid={`badge-skill-${skill.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {skill}
                          </span>
                        ))}
                    </div>
                  </div>
                  ) : null;
                })()}

                {/* WEF Framework Skills — nameAr/descriptionAr used when language is Arabic */}
                {rec.wefSkillTags && rec.wefSkillTags.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-semibold mb-2 text-sm flex items-center gap-1.5">
                      <Globe className="w-4 h-4" />
                      {t('wefSkillsTitle', 'Future Skills (WEF)')}
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {rec.wefSkillTags.map((tag) => {
                        const label = language === 'ar' ? (tag.nameAr ?? tag.name) : tag.name;
                        const desc = language === 'ar' ? (tag.descriptionAr ?? tag.description) : tag.description;
                        return (
                          <Tooltip key={tag.name}>
                            <TooltipTrigger asChild>
                              <span
                                className="bg-accent/20 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-default"
                                data-testid={`badge-wef-${tag.name.toLowerCase().replace(/\s+/g, '-')}`}
                              >
                                {label}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-center">
                              {desc}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Why This Career - LLM (Premium) or Basic */}
                <div className="p-3 bg-background/30 rounded-lg mb-3">
                  <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    {t('whyThisCareer')}
                  </h4>
                  <div className="text-sm font-body text-foreground/90">
                    {isPremiumAssessment(assessment?.assessmentType) && activeAssessmentId && rec.careerId ? (
                      <CareerReasoningText
                        assessmentId={activeAssessmentId}
                        careerId={rec.careerId}
                        fallback={rec.premiumReasoning || rec.reasoning}
                      />
                    ) : (
                      <span className="whitespace-pre-line">{rec.premiumReasoning || rec.reasoning}</span>
                    )}
                  </div>
                </div>

                {/* Work Style Fit - Premium Only */}
                {rec.workStyleFit && (
                  <div className="p-3 bg-primary/10 rounded-lg border-2 border-primary/20 mb-3">
                    <h4 className="font-semibold mb-2 text-sm flex items-center gap-2 text-primary">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('workStyleFit')}
                    </h4>
                    <div className="text-sm font-body text-foreground/90 whitespace-pre-line">
                      {rec.workStyleFit}
                    </div>
                  </div>
                )}

                {/* Personal Strengths & Growth Areas - Premium Only */}
                {rec.strengthsGrowth && (
                  <div className="p-3 bg-primary/10 rounded-lg border-2 border-primary/20 mb-3">
                    <h4 className="font-semibold mb-2 text-sm flex items-center gap-2 text-primary">
                      <CheckCircle2 className="w-4 h-4" />
                      {t('strengthsGrowth')}
                    </h4>
                    <div className="text-sm font-body text-foreground/90 whitespace-pre-line">
                      {rec.strengthsGrowth}
                    </div>
                  </div>
                )}

                {/* Education Required */}
                <div className="p-3 bg-background/30 rounded-lg mb-3">
                  <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    {t('educationPath')}
                  </h4>
                  <p className="text-sm font-body">
                    {language === 'ar' && rec.career?.educationLevelAr
                      ? rec.career.educationLevelAr
                      : rec.requiredEducation}
                  </p>
                </div>

                {/* Action Steps - Premium (7-8 steps) or Basic (2-3 steps) */}
                {((rec.premiumActionSteps && rec.premiumActionSteps.length > 0) || (rec.actionSteps && rec.actionSteps.length > 0)) && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                      <ArrowRight className="w-4 h-4" />
                      {t('nextSteps')}
                    </h4>
                    <ul className="space-y-2">
                      {(rec.premiumActionSteps || rec.actionSteps).map((step: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-sm font-body">
                          <span className="text-primary font-bold flex-shrink-0">{i + 1}.</span>
                          <span className="whitespace-pre-line">{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </StickyNote>
            </MasonryItem>
          ))}
        </MasonryGrid>

        {/* Actions */}
        <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button 
            size="lg" 
            className="rounded-full shadow-lg px-8" 
            data-testid="button-download-report"
            onClick={handleDownloadPDF}
            disabled={!assessmentId}
          >
            <Download className="w-5 h-5 me-2" />
            {t('downloadPdf')}
          </Button>
        </div>

        {!isAuthenticated && (
          <div className="mt-8">
            <StickyNote color="yellow" rotation="1" className="max-w-2xl mx-auto text-center p-6">
              <h4 className="font-bold text-lg mb-2">{t('saveResultsTitle')}</h4>
              <p className="text-sm font-body mb-4 text-muted-foreground">
                {t('saveResultsDesc')}
              </p>
              <Button
                size="lg"
                onClick={handleSignUp}
                className="rounded-full"
                data-testid="button-signup-results"
              >
                {t('createAccount')}
              </Button>
            </StickyNote>
          </div>
        )}

        {isAuthenticated && (
          <div className="mt-8">
            <StickyNote color="green" rotation="-1" className="max-w-2xl mx-auto text-center p-6">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold text-lg mb-2">{t('resultsSavedTitle')}</h4>
              <p className="text-sm font-body text-muted-foreground mb-4">
                {t('resultsSavedDesc')}
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Button
                  variant="default"
                  onClick={() => window.location.href = "/profile"}
                  data-testid="button-go-to-profile"
                >
                  {t('viewProfile')}
                </Button>
                {/* Org_students with no remaining allocation can't start another (server 403s) */}
                {!(isOrgStudent && !hasAvailable) && (
                  <Button
                    variant="outline"
                    onClick={() => window.location.href = "/assessment"}
                    data-testid="button-start-new-assessment"
                  >
                    {t('newAssessment')}
                  </Button>
                )}
              </div>
            </StickyNote>
          </div>
        )}
      </div>
    </main>
  );
}
