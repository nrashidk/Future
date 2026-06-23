import { StickyNote } from "@/components/StickyNote";
import { Progress } from "@/components/ui/progress";
import { 
  GraduationCap, 
  Target, 
  TrendingUp, 
  BookOpen, 
  Star,
  CheckCircle2,
  Brain,
  Lightbulb,
  Users,
  Wrench,
  Heart,
  Globe,
  Sparkles,
  Shield,
  Crown,
  Smile,
  User,
  Building2,
  MapPin,
} from "lucide-react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { isPremiumAssessment } from "@shared/assessmentTier";
import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
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
}

// Synchronous RTL bootstrap — runs before React mounts so Puppeteer captures
// html[dir="rtl"] and html[lang="ar"] (Cairo font) from the very first paint.
// Puppeteer starts a fresh browser with no localStorage, so the URL is canonical.
{
  const _lang = new URLSearchParams(window.location.search).get("lang") === "ar" ? "ar" : "en";
  document.documentElement.lang = _lang;
  document.documentElement.dir = _lang === "ar" ? "rtl" : "ltr";
  i18n.changeLanguage(_lang); // begins fetching locale JSON early
}

/**
 * Return the Arabic skill array when the report is in Arabic mode and the array
 * is non-empty, otherwise fall back to the English array.
 */
function localizeSkills(
  lang: string,
  arSkills: string[] | null | undefined,
  enSkills: string[] | null | undefined
): string[] {
  if (lang === 'ar' && arSkills && arSkills.length > 0) return arSkills;
  return enSkills || [];
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
  const standaloneKey = GROWTH_LEVEL_I18N[outlook.trim()];
  if (standaloneKey) return tFn(standaloneKey);
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

// Helper to map subjects to vision sectors
function mapSubjectsToVisionSectors(
  subjectScores: Record<string, { percentage: number }>,
  country: any,
  tFn: (key: string, opts?: any) => string,
  lang: string = 'en'
): string | null {
  if (!subjectScores || !country?.targets || typeof country.targets !== 'object') return null;

  const topSubjects = Object.entries(subjectScores)
    .sort(([, a], [, b]) => b.percentage - a.percentage)
    .slice(0, 2)
    .map(([subject]) => subject);

  if (topSubjects.length === 0) return null;

  // Extract vision categories from country.targets (jsonb object with keys like "tech","climate","economic")
  const visionCategories = Object.keys(country.targets);

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

export default function ResultsPrint() {
  const { t } = useTranslation('results');
  const { language } = useLanguage(); // ensure LanguageContext is subscribed (sets html[dir] globally)
  const urlParams = new URLSearchParams(window.location.search);
  const assessmentId = urlParams.get("assessmentId");
  const guestToken = urlParams.get("guestToken");
  // Short-lived token minted by the PDF route, scoped to this one assessment, so
  // the headless browser (no session cookie) can authorize the data fetches
  // below. Additive to the guest path — guest PDFs still use guestToken.
  const printToken = urlParams.get("printToken");
  const printTokenParam = printToken ? `&printToken=${encodeURIComponent(printToken)}` : "";
  const langParam = urlParams.get("lang") || "en";

  // Keep html[lang/dir] in sync if langParam changes at runtime (browser nav).
  useEffect(() => {
    const safeLang = langParam === "ar" ? "ar" : "en";
    document.documentElement.lang = safeLang;
    document.documentElement.dir = safeLang === "ar" ? "rtl" : "ltr";
    i18n.changeLanguage(safeLang);
  }, [langParam]);

  const { data: recommendations = [], isLoading } = useQuery<any[]>({
    queryKey: assessmentId
      ? [`/api/recommendations?assessmentId=${assessmentId}${guestToken ? `&guestToken=${guestToken}` : ''}&lang=${langParam}${printTokenParam}`]
      : guestToken
        ? [`/api/recommendations?guestToken=${guestToken}&lang=${langParam}`]
        : [`/api/recommendations?lang=${langParam}`],
    enabled: true,
  });

  const { data: quizData } = useQuery<any>({
    queryKey: [`/api/assessments/${assessmentId}/quiz${printToken ? `?printToken=${encodeURIComponent(printToken)}` : ''}`],
    enabled: !!assessmentId,
  });

  const { data: assessment } = useQuery<any>({
    queryKey: guestToken
      ? [`/api/assessments/${assessmentId}?guestToken=${guestToken}${printTokenParam}`]
      : [`/api/assessments/${assessmentId}${printToken ? `?printToken=${encodeURIComponent(printToken)}` : ''}`],
    enabled: !!assessmentId,
  });

  const { data: country } = useQuery<any>({
    queryKey: [`/api/countries/${assessment?.countryId}`],
    enabled: !!assessment?.countryId,
  });

  const { data: cvqResult } = useQuery<any>({
    queryKey: [`/api/cvq/result/${assessmentId}${printToken ? `?printToken=${encodeURIComponent(printToken)}` : ''}`],
    enabled: !!assessmentId && isPremiumAssessment(assessment?.assessmentType),
  });

  const { data: curriculum } = useQuery<any>({
    queryKey: [`/api/curricula/${assessment?.curriculumId}`],
    enabled: !!assessment?.curriculumId,
  });

  // /api/auth/user enriches the payload with predefined* fields sourced
  // from organizationMembers (studentName / studentAge / grade / studentGender)
  // for org_student users — this is the canonical source for school student demographics.
  const { data: user } = useQuery<any>({
    queryKey: ['/api/auth/user'],
    enabled: true,
  });

  const { data: organizationInfo } = useQuery<any>({
    queryKey: [`/api/organizations/${(user as any)?.organizationId}`],
    enabled: !!(user as any)?.organizationId,
  });

  const isPremium = isPremiumAssessment(assessment?.assessmentType);

  // Fetch LLM "Why This Career?" narrative for every premium career card in
  // parallel. guestToken is passed as a query param — Puppeteer starts a fresh
  // browser with no cookies, so cookie-based auth is unavailable here.
  const narrativeQueries = useQueries({
    queries: (isPremium && assessmentId && recommendations.length > 0)
      ? recommendations.map((rec: EnrichedRecommendation) => {
          const params = new URLSearchParams();
          // lang overrides the student's stored preference so the PDF language
          // matches the explicit download language chosen by the user.
          params.set('lang', langParam === 'ar' ? 'ar' : 'en');
          if (guestToken) params.set('guestToken', encodeURIComponent(guestToken));
          if (printToken) params.set('printToken', printToken);
          return {
            queryKey: [`/api/recommendations/${assessmentId}/career-reasoning/${rec.careerId}?${params.toString()}`],
            retry: false,
            staleTime: Infinity,
          };
        })
      : [],
  });

  // Build a fast careerId → narrative lookup for the render below.
  const narrativeMap = useMemo(() => {
    const map: Record<string, string> = {};
    narrativeQueries.forEach((q, i) => {
      const careerId = recommendations[i]?.careerId;
      if (careerId && (q.data as any)?.careerReasoning) {
        map[careerId] = (q.data as any).careerReasoning;
      }
    });
    return map;
  }, [narrativeQueries, recommendations]);

  // True once every narrative query has either resolved or errored.
  // Non-premium assessments have no narrative queries so this is immediately true.
  const allNarrativesSettled = narrativeQueries.every(q => !q.isLoading && !q.isFetching);

  useEffect(() => { document.title = t('printDocTitle'); }, [t]);

  // Safety-net timer ref — shared between the two effects below so the normal
  // path can cancel the timeout when it fires first.
  const reportReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 20-second safety net: if LLM insights (or any other async work) take too
  // long, set __REPORT_READY__ unconditionally so Puppeteer never hangs.
  // The timer is cleared by the normal-path effect below when data arrives
  // within the deadline, and by the cleanup function on unmount.
  useEffect(() => {
    reportReadyTimerRef.current = setTimeout(() => {
      if (!(window as any).__REPORT_READY__) {
        console.warn(
          "[ResultsPrint] Safety-net timeout fired — setting __REPORT_READY__ " +
          "without waiting for all AI insights (LLM may be slow or unavailable)."
        );
        (window as any).__REPORT_READY__ = true;
      }
    }, 20000);

    return () => {
      if (reportReadyTimerRef.current !== null) {
        clearTimeout(reportReadyTimerRef.current);
        reportReadyTimerRef.current = null;
      }
    };
  }, []); // intentionally runs once on mount

  // Signal Puppeteer only after translations are loaded, React has re-rendered,
  // AND all LLM narrative fetches have settled (hit or miss).
  // Awaiting changeLanguage() ensures locale JSON is fetched; the double rAF
  // gives React two frames to flush the translation state update into the DOM.
  useEffect(() => {
    if (!isLoading && recommendations.length > 0 && allNarrativesSettled) {
      const safeLang = langParam === "ar" ? "ar" : "en";
      i18n.changeLanguage(safeLang).then(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Cancel the safety-net timer — we beat the deadline.
            if (reportReadyTimerRef.current !== null) {
              clearTimeout(reportReadyTimerRef.current);
              reportReadyTimerRef.current = null;
            }
            (window as any).__REPORT_READY__ = true;
          });
        });
      });
    }
  }, [isLoading, recommendations, langParam, allNarrativesSettled]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <GraduationCap className="w-16 h-16 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <div className="print-container">
      <style>{`
        /* Cairo is served from /fonts/cairo/ (bundled locally in client/public/).
           This guarantees the Arabic font is available to Puppeteer even when the
           deployment environment has no internet egress. */
        @font-face {
          font-family: 'Cairo';
          font-style: normal;
          font-weight: 400 700;
          font-display: block;
          src: url('/fonts/cairo/cairo-arabic.woff2') format('woff2');
          unicode-range: U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891,
            U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41,
            U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E,
            U+10EC2-10EC4, U+10EFC-10EFF, U+1EE00-1EE03, U+1EE05-1EE1F,
            U+1EE21-1EE22, U+1EE24, U+1EE27, U+1EE29-1EE32, U+1EE34-1EE37,
            U+1EE39, U+1EE3B, U+1EE42, U+1EE47, U+1EE49, U+1EE4B, U+1EE4D-1EE4F,
            U+1EE51-1EE52, U+1EE54, U+1EE57, U+1EE59, U+1EE5B, U+1EE5D, U+1EE5F,
            U+1EE61-1EE62, U+1EE64, U+1EE67-1EE6A, U+1EE6C-1EE72, U+1EE74-1EE77,
            U+1EE79-1EE7C, U+1EE7E, U+1EE80-1EE89, U+1EE8B-1EE9B, U+1EEA1-1EEA3,
            U+1EEA5-1EEA9, U+1EEAB-1EEBB, U+1EEF0-1EEF1;
        }
        @font-face {
          font-family: 'Cairo';
          font-style: normal;
          font-weight: 400 700;
          font-display: block;
          src: url('/fonts/cairo/cairo-latin-ext.woff2') format('woff2');
          unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7,
            U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F,
            U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
            U+A720-A7FF;
        }
        @font-face {
          font-family: 'Cairo';
          font-style: normal;
          font-weight: 400 700;
          font-display: block;
          src: url('/fonts/cairo/cairo-latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
            U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122,
            U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
        }

        @page {
          size: A4 portrait;
          margin: 0;
        }
        
        @media print {
          body {
            margin: 0;
            padding: 0;
          }
          
          .print-page-1 {
            page-break-after: always;
            min-height: 100vh;
          }
          
          .print-page-career {
            page-break-before: always;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            padding: 2rem;
          }
          
          .print-page-career:not(:last-of-type) {
            page-break-after: always;
          }
          
          .no-print {
            display: none !important;
          }
        }
        
        .print-container {
          background: white;
        }

        /* RTL overrides: text/flex flow right-to-left, Cairo font applied */
        [dir="rtl"] .print-container {
          direction: rtl;
          font-family: 'Cairo', sans-serif;
        }
        [dir="rtl"] .flex { direction: rtl; }
        [dir="rtl"] p, [dir="rtl"] span, [dir="rtl"] div,
        [dir="rtl"] h1, [dir="rtl"] h2, [dir="rtl"] h3, [dir="rtl"] h4 {
          text-align: start;
        }
        [dir="rtl"] .text-center { text-align: center !important; }
        [dir="rtl"] .ml-auto { margin-inline-start: auto; margin-inline-end: 0; }
        [dir="rtl"] .mr-auto { margin-inline-end: auto; margin-inline-start: 0; }
      `}</style>

      {/* Page 1: Hero + Subject Competency */}
      <div className="print-page-1">
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

        {/* Student Info Section */}
        {(() => {
          const displayName = assessment?.name || (user as any)?.predefinedName;
          const displayAge = assessment?.age || (user as any)?.predefinedAge;
          const displayGrade = assessment?.grade || (user as any)?.predefinedGrade;
          const displayGender = assessment?.gender || (user as any)?.predefinedGender;
          const hasAnyField = displayName || displayAge || displayGrade || displayGender || country;
          if (!hasAnyField) return null;
          return (
            <div className="max-w-4xl mx-auto px-4 -mt-8 mb-6">
              <StickyNote color={assessment?.assessmentType === 'school' ? 'blue' : 'purple'} rotation="0" className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <User className="w-7 h-7 text-primary flex-shrink-0" />
                  <h2 className="text-xl font-bold">{t('studentProfile')}</h2>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {displayName && (
                    <div className="p-2 bg-primary/20 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">{t('profileName')}</p>
                      <p className="font-semibold text-sm leading-tight">{displayName}</p>
                    </div>
                  )}
                  {displayAge && (
                    <div className="p-2 bg-primary/20 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">{t('profileAge')}</p>
                      <p className="font-semibold text-sm">{displayAge} {t('yearsOld')}</p>
                    </div>
                  )}
                  {displayGrade && (
                    <div className="p-2 bg-primary/20 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">{t('profileGrade')}</p>
                      <p className="font-semibold text-sm">{t('gradeLabel')} {String(displayGrade).replace('grade', '')}</p>
                    </div>
                  )}
                  {displayGender && (
                    <div className="p-2 bg-primary/20 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">{t('profileGender')}</p>
                      <p className="font-semibold text-sm capitalize">
                        {(() => {
                          // Normalize "prefer_not_to_say" → "genderPreferNotToSay" etc.
                          const key = 'gender' + displayGender
                            .split(/[_\s]+/)
                            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join('');
                          return t(key, { defaultValue: displayGender });
                        })()}
                      </p>
                    </div>
                  )}
                  {country && (
                    <div className="p-2 bg-primary/20 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">{t('profileCountry')}</p>
                      <p className="font-semibold text-sm leading-tight">
                        {getCountryDisplayName(country, langParam, t)}
                      </p>
                    </div>
                  )}
                </div>
              </StickyNote>
            </div>
          );
        })()}

        {/* Subject Competency Spotlight */}
        {quizData?.completed && quizData?.subjectScores && Object.keys(quizData.subjectScores).length > 0 && (
          <div className="max-w-4xl mx-auto px-4 -mt-8 mb-8">
            <StickyNote color="purple" rotation="0" className="p-8">
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
                  <div className="text-6xl font-bold text-primary mb-2">
                    {quizData.totalScore}%
                  </div>
                  <div className="text-sm font-semibold">
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
                    <div key={subject} className="p-4 bg-background/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold font-body">{subject}</span>
                        <span className="text-lg font-bold text-primary">
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
              <div className="space-y-2 text-sm">
                {quizData.totalScore >= 70 ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body">{t('insightStrong')}</p>
                  </div>
                ) : quizData.totalScore >= 50 ? (
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body">{t('insightModerate')}</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Star className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body">{t('insightGrowth')}</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="font-body">{t('insightValidation')}</p>
                </div>
                {country && (() => {
                  const visionLinkage = mapSubjectsToVisionSectors(quizData.subjectScores, country, t, langParam);
                  return visionLinkage ? (
                    <div className="flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <p className="font-body">
                        <strong>{t('connectingVision')}</strong> {visionLinkage}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
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
      </div>

      {/* Page 2: CVQ Values Analysis (Individual Assessment Only) */}
      {cvqResult && isPremiumAssessment(assessment?.assessmentType) && (
        <div className="print-page-career">
          <StickyNote color="purple" rotation="0" className="p-6">
            <div className="space-y-4">
              {/* Header - Compact */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-1">{t('valuesTitle')}</h2>
                <p className="text-xs text-muted-foreground font-body">
                  {t('valuesSubtitle')}
                </p>
              </div>

              {/* Top 3 Values & Complete Profile - 2 Column Layout */}
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Top 3 Values */}
                <div className="p-3 bg-background/30 rounded-lg">
                  <h3 className="text-sm font-semibold mb-2">{t('top3Title')}</h3>
                  <div className="space-y-2">
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
                        
                        return (
                          <div key={domain} className="flex items-start gap-2">
                            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                              {index + 1}
                            </div>
                            <Icon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold truncate">{info.name}</span>
                                <span className="text-xs font-bold ms-1">{Math.round(score)}%</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{info.description}</p>
                              <Progress value={score} className="h-1 mt-1" />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Right: All Domain Scores */}
                <div className="p-3 bg-background/30 rounded-lg">
                  <h3 className="text-sm font-semibold mb-2">{t('allValuesTitle')}</h3>
                  <div className="space-y-1.5">
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
                          <div key={domain} className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium truncate">{info.name}</span>
                                <span className="text-xs font-bold ms-1">{Math.round(score)}%</span>
                              </div>
                              <Progress value={score} className="h-1 mt-0.5" />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

              {/* What This Means & Career Connection - Combined */}
              <div className="p-3 bg-background/30 rounded-lg">
                <div className="grid grid-cols-2 gap-3">
                  {/* Left: What This Means */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5" />
                      {t('whatMeansTitle')}
                    </h3>
                    <div className="space-y-1.5 text-xs font-body">
                      {(() => {
                        const scores = cvqResult.normalizedScores as Record<string, number>;
                        const top3 = Object.entries(scores)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3)
                          .map(([d]) => d);

                        const domainLabels: Record<string, string> = {
                          achievement: t('domainAchievement'),
                          benevolence: t('domainBenevolence'),
                          universalism: t('domainUniversalism'),
                          self_direction: t('domainSelfDirection'),
                          security: t('domainSecurity'),
                          power: t('domainPower'),
                          hedonism: t('domainHedonism'),
                        };
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
                          <p key={domain} className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                            <span><strong>{domainLabels[domain]}:</strong> {explanations[domain]}</span>
                          </p>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Right: Career Connection */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" />
                      {t('careerConnectionTitle')}
                    </h3>
                    <p className="text-xs font-body mb-2">
                      {t('careerConnectionDesc')}
                    </p>
                    <p className="text-xs text-muted-foreground font-body flex items-start gap-1">
                      <Star className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>{t('weightLabel', { pct: 20 })}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </StickyNote>

          {/* Footer */}
          <div className="mt-2 text-xs text-center text-muted-foreground">
            {t('generatedOn', { date: new Date().toLocaleDateString() })} | {t('footerBrandLine')}<br />
            {t('footerVisitLine')}
          </div>
        </div>
      )}

      {/* Personality Profile (school students without CVQ data) */}
      {isPremiumAssessment(assessment?.assessmentType) &&
        !cvqResult &&
        (assessment?.riasecScores?.top3?.length > 0 || assessment?.interests?.length > 0 || assessment?.personalityTraits) && (
        <div className="print-page-career">
          <StickyNote color="green" rotation="0" className="p-6">
            <div className="space-y-5">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
                  <Brain className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-1">{t('personalityProfileTitle')}</h2>
                <p className="text-sm text-muted-foreground font-body">
                  {t('personalityProfileSubtitle')}
                </p>
              </div>

              {/* RIASEC Top Types */}
              {assessment?.riasecScores?.top3?.length > 0 && (
                <div className="p-4 bg-background/30 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4" />
                    {t('hollandCodesTitle')}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {(() => {
                      const riasecInfo: Record<string, { icon: any; label: string; desc: string }> = {
                        R: { icon: Wrench, label: t('riasecRealistic'), desc: t('riasecRealisticDesc') },
                        I: { icon: Brain, label: t('riasecInvestigative'), desc: t('riasecInvestigativeDesc') },
                        A: { icon: Sparkles, label: t('riasecArtistic'), desc: t('riasecArtisticDesc') },
                        S: { icon: Users, label: t('riasecSocial'), desc: t('riasecSocialDesc') },
                        E: { icon: TrendingUp, label: t('riasecEnterprising'), desc: t('riasecEnterprisingDesc') },
                        C: { icon: Target, label: t('riasecConventional'), desc: t('riasecConventionalDesc') },
                      };
                      const scores = assessment.riasecScores as Record<string, any>;
                      return (assessment.riasecScores.top3 as string[]).map((code: string) => {
                        const info = riasecInfo[code];
                        if (!info) return null;
                        const Icon = info.icon;
                        const score = scores[code] ?? 0;
                        return (
                          <div key={code} className="p-3 bg-background/20 rounded-lg text-center">
                            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 mb-2">
                              <Icon className="w-5 h-5 text-primary" />
                            </div>
                            <div className="font-bold text-base text-primary mb-0.5">{code}</div>
                            <div className="text-xs font-semibold mb-1">{info.label}</div>
                            <div className="text-xs text-muted-foreground font-body leading-snug">{info.desc}</div>
                            <Progress value={(score / 40) * 100} className="h-1.5 mt-2" />
                            <span className="text-xs font-bold text-primary">{score}</span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* Interests */}
              {assessment?.interests?.length > 0 && (
                <div className="p-4 bg-background/30 rounded-lg">
                  <h3 className="font-semibold mb-2 flex items-center gap-2 text-sm">
                    <Star className="w-4 h-4" />
                    {t('keyInterestsTitle')}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {(assessment.interests as string[]).map((interest: string) => (
                      <span
                        key={interest}
                        className="inline-flex items-center gap-1 bg-primary/10 px-3 py-1 rounded-full text-xs font-medium"
                      >
                        <CheckCircle2 className="w-3 h-3 text-primary" />
                        {interest}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Personality Traits */}
              {assessment?.personalityTraits && Object.keys(assessment.personalityTraits).length > 0 && (
                <div className="p-4 bg-background/30 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <Lightbulb className="w-4 h-4" />
                    {t('personalityTraitsTitle')}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(assessment.personalityTraits as Record<string, number>)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 6)
                      .map(([trait, score]) => (
                        <div key={trait} className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium capitalize flex-1 truncate">
                            {trait.replace(/_/g, ' ')}
                          </span>
                          <Progress value={Number(score)} className="h-1.5 w-20 flex-shrink-0" />
                          <span className="text-xs font-bold w-8 text-right">{Math.round(Number(score))}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="p-3 bg-background/30 rounded-lg">
                <p className="text-xs text-muted-foreground font-body flex items-start gap-1.5">
                  <Target className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-primary" />
                  <span>{t('personalityMatchDesc')}</span>
                </p>
              </div>
            </div>
          </StickyNote>

          <div className="mt-4 text-xs text-center text-muted-foreground">
            {t('generatedOn', { date: new Date().toLocaleDateString() })} | {t('footerBrandLine')}<br />
            {t('footerVisitLine')}
          </div>
        </div>
      )}

      {/* Career Pages: Two careers side by side per page */}
      {(() => {
        const pairColors: Array<[string, string]> = [
          ["yellow", "pink"],
          ["blue", "green"],
          ["purple", "orange"],
        ];
        const pages: any[][] = [];
        for (let i = 0; i < recommendations.length; i += 2) {
          pages.push(recommendations.slice(i, i + 2));
        }
        return pages.map((pair, pageIdx) => (
          <div key={pageIdx} className="print-page-career">
            <div className="grid grid-cols-2 gap-4 h-full">
              {pair.map((rec: EnrichedRecommendation, colIdx: number) => {
                const color = pairColors[pageIdx % pairColors.length][colIdx] as any;
                return (
                  <StickyNote key={rec.id} color={color} rotation="0" className="p-4 flex flex-col gap-3">
                    {/* Career Header */}
                    <div>
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold leading-tight mb-1">{langParam === 'ar' && rec.career?.titleAr ? rec.career.titleAr : rec.career?.title}</h3>
                          <p className="text-xs text-muted-foreground font-body line-clamp-2">{langParam === 'ar' && rec.career?.descriptionAr ? rec.career.descriptionAr : rec.career?.description}</p>
                        </div>
                        <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-bold text-base flex-shrink-0">
                          {Math.round(rec.overallMatchScore)}%
                        </div>
                      </div>

                      {/* 2×2 Score Breakdown */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { label: t('subjectMatch'), Icon: BookOpen, value: rec.subjectMatchScore, weight: "30%" },
                          { label: t('interestMatch'), Icon: Star, value: rec.interestMatchScore, weight: "30%" },
                          { label: t('visionAlignment'), Icon: Target, value: rec.countryVisionAlignment, weight: "20%" },
                          { label: t('marketDemand'), Icon: TrendingUp, value: rec.futureMarketDemand, weight: "20%" },
                        ].map(({ label, Icon, value, weight }) => (
                          <div key={label} className="p-1.5 bg-background/30 rounded-lg">
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[11px] font-medium flex items-center gap-0.5">
                                <Icon className="w-2.5 h-2.5" />
                                {label}
                              </span>
                              <span className="text-[11px] font-bold">{Math.round(value)}%</span>
                            </div>
                            <Progress value={value} className="h-1" />
                            <span className="text-[10px] text-muted-foreground">{weight} {t('weightSuffix')}</span>
                          </div>
                        ))}
                      </div>

                      {/* Growth Outlook row */}
                      {rec.career?.growthOutlook && (
                        <div className="flex items-center gap-1.5 mt-1.5 p-1.5 bg-background/20 rounded-lg">
                          <TrendingUp className="w-3 h-3 text-primary flex-shrink-0" />
                          <span className="text-[10px] text-muted-foreground">{t('growthOutlook')}:</span>
                          <span className="text-[10px] font-semibold">{localizeGrowthOutlook(rec.career.growthOutlook, t)}</span>
                        </div>
                      )}
                    </div>

                    {/* WEF Framework Skill Tags — nameAr used when langParam is 'ar' */}
                    {rec.wefSkillTags && rec.wefSkillTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rec.wefSkillTags.map((tag) => (
                          <span
                            key={tag.name}
                            className="bg-accent/20 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            title={langParam === 'ar' ? (tag.descriptionAr ?? tag.description) : tag.description}
                          >
                            {langParam === 'ar' ? (tag.nameAr ?? tag.name) : tag.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Required Skills — requiredSkillsAr used when langParam is 'ar' */}
                    {(() => {
                      const skills = localizeSkills(langParam, rec.career?.requiredSkillsAr, rec.career?.requiredSkills);
                      return skills.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {skills.map((skill: string) => (
                            <span
                              key={skill}
                              className="bg-primary/10 px-2 py-0.5 rounded-full text-[10px] font-medium"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}

                    {/* Two-column content: Why+WorkStyle | Education+Strengths */}
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {/* Left: Why this Career? + Work Style Fit */}
                      <div className="flex flex-col gap-2">
                        <div className="p-2 bg-background/30 rounded-lg flex-1">
                          <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                            {t('whyThisCareer')}
                          </h4>
                          <div className="text-xs font-body text-foreground/90 whitespace-pre-line">
                            {narrativeMap[rec.careerId] || rec.premiumReasoning || rec.reasoning}
                          </div>
                        </div>
                        {rec.workStyleFit && (
                          <div className="p-2 bg-background/30 rounded-lg">
                            <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                              {t('workStyleFit')}
                            </h4>
                            <div className="text-xs font-body text-foreground/90 whitespace-pre-line">
                              {rec.workStyleFit}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Education Path + Personal Strengths & Growth */}
                      <div className="flex flex-col gap-2">
                        <div className="p-2 bg-background/30 rounded-lg">
                          <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                            <BookOpen className="w-3 h-3 flex-shrink-0" />
                            {t('educationPath')}
                          </h4>
                          <p className="text-xs font-body">
                            {langParam === 'ar' && rec.career?.educationLevelAr
                              ? rec.career.educationLevelAr
                              : rec.requiredEducation}
                          </p>
                        </div>
                        {rec.strengthsGrowth && (
                          <div className="p-2 bg-background/30 rounded-lg flex-1">
                            <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                              {t('strengthsGrowth')}
                            </h4>
                            <div className="text-xs font-body text-foreground/90 whitespace-pre-line">
                              {rec.strengthsGrowth}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </StickyNote>
                );
              })}
            </div>

            <div className="mt-4 text-xs text-center text-muted-foreground">
              {t('generatedOn', { date: new Date().toLocaleDateString() })} | {t('footerBrandLine')}<br />
              {t('footerVisitLine')}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}
