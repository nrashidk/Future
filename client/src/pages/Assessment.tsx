import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ProgressTracker } from "@/components/ProgressTracker";
import { Button } from "@/components/ui/button";
import { DemographicsStep } from "@/components/assessment/DemographicsStep";
import { SubjectsStep } from "@/components/assessment/SubjectsStep";
import { InterestsStep } from "@/components/assessment/InterestsStep";
import { PersonalityStep } from "@/components/assessment/PersonalityStep";
import RiasecStep, { type RiasecScores } from "@/components/RiasecStep";
import CVQStep from "@/components/CVQStep";
import { CountryStep } from "@/components/assessment/CountryStep";
import { AspirationsStep } from "@/components/assessment/AspirationsStep";
import { QuizStep } from "@/components/assessment/QuizStep";
import { GraduationCap, LogIn, LogOut, User, ClipboardCheck, Building2, BarChart, Shield, FileQuestion, RotateCcw, PlayCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Assessment as AssessmentRecord } from "@shared/schema";

const DRAFT_KEY = "fp_assessment_draft";

// Maps each PersonalityStep question ID + numeric answer to a locale trait key.
// e.g. { teamwork: "2" } → "teamwork_2" → t('traits.teamwork_2') → "Flexible" / "مرن"
const TRAIT_KEY_MAP: Record<string, Record<string, string>> = {
  teamwork: { "1": "teamwork_1", "2": "teamwork_2", "3": "teamwork_3" },
  learning:  { "1": "learning_1",  "2": "learning_2",  "3": "learning_3"  },
  planning:  { "1": "planning_1",  "2": "planning_2",  "3": "planning_3"  },
  problem:   { "1": "problem_1",   "2": "problem_2",   "3": "problem_3"   },
};

// Reverse of TRAIT_KEY_MAP — converts a stored trait key back to { questionId, answer }
// so cross-device resume can restore PersonalityStep radio-button state.
// e.g. "teamwork_2" → { questionId: "teamwork", answer: "2" }
const TRAIT_KEY_REVERSE: Record<string, { questionId: string; answer: string }> =
  Object.fromEntries(
    Object.entries(TRAIT_KEY_MAP).flatMap(([questionId, answers]) =>
      Object.entries(answers).map(([answer, traitKey]) => [traitKey, { questionId, answer }])
    )
  );

interface AssessmentData {
  name: string;
  age: number | null;
  grade: string;
  gender: string;
  consentGiven: boolean;
  favoriteSubjects: string[];
  prioritySubjects: string[]; // Up to 3 subjects marked as priority (get more quiz questions)
  interests: string[];
  personalityTraits: Record<string, number>;
  riasecResponses: Record<string, number>; // RIASEC responses (premium users only)
  cvqResponses: Record<string, number>; // CVQ values responses (premium users only)
  countryId: string;
  careerAspirations: string[];
  strengths: string[];
}

export default function Assessment() {
  const { t } = useTranslation("assessment");
  const tCommon = useTranslation("common").t;
  useEffect(() => { document.title = `${t("pageTitle")} | Future Pathways`; }, [t]);

  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGuest, setIsGuest] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [aspirationsError, setAspirationsError] = useState<string | null>(null);
  const [resumePrompt, setResumePrompt] = useState<{
    assessmentId: string;
    currentStep: number;
    assessmentData: AssessmentData;
  } | null>(null);
  const [apiResumeChecked, setApiResumeChecked] = useState(false);

  const isPremiumUser = user?.isPremium || false;

  // True when the student has started filling in data and hasn't finished yet
  const isInProgress = currentStep > 1 && !resumePrompt;

  // Guard 1 — hard navigations (refresh, tab-close, address-bar, external link, full-page redirect)
  useEffect(() => {
    if (!isInProgress) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // triggers the browser's built-in "Leave site?" dialog
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isInProgress]);

  // Guard 2 — browser back/forward (popstate).
  // We push a sentinel history entry so the first Back press stays on /assessment
  // and fires popstate rather than immediately leaving. On confirmation we step back
  // two entries (sentinel + the original /assessment entry) to reach the real prev page.
  useEffect(() => {
    if (!isInProgress) return;

    // Sentinel: one extra /assessment entry in the history stack
    history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      // Re-push so the URL stays on /assessment while the dialog is open
      history.pushState(null, "", window.location.href);
      if (window.confirm(t("leaveConfirm"))) {
        // Confirmed: remove this guard and jump back past both pushed entries
        window.removeEventListener("popstate", handlePopState);
        history.go(-2);
      }
      // Cancelled: the re-push already keeps us on /assessment — nothing else needed
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isInProgress, t]);

  // Guard 3 — SPA header nav buttons.
  // Intentional setLocation("/results…") calls bypass this by using setLocation directly.
  const guardedNavigate = useCallback((path: string) => {
    if (!isInProgress || window.confirm(t("leaveConfirm"))) {
      setLocation(path);
    }
  }, [isInProgress, setLocation, t]);

  // Guard 4 — logout (full-page redirect to /api/logout).
  // beforeunload would also catch this, but an explicit prompt gives a clearer UX.
  const guardedLogout = useCallback(() => {
    if (!isInProgress || window.confirm(t("leaveConfirm"))) {
      window.location.href = "/api/logout";
    }
  }, [isInProgress, t]);
  
  // Premium users have 7 steps, free users have 7 steps
  const totalSteps = 7;

  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    name: "",
    age: null,
    grade: "",
    gender: "",
    consentGiven: false,
    favoriteSubjects: [],
    prioritySubjects: [],
    interests: [],
    personalityTraits: {},
    riasecResponses: {},
    cvqResponses: {},
    countryId: "",
    careerAspirations: [],
    strengths: [],
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("guest") === "true") {
      setIsGuest(true);
    }
  }, []);

  // On mount (after auth resolves): check sessionStorage for a saved draft and offer resume
  useEffect(() => {
    if (isLoading) return;
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { assessmentId: string; currentStep: number; assessmentData: AssessmentData };
      if (draft.assessmentId && typeof draft.currentStep === "number" && draft.currentStep > 1) {
        setResumePrompt(draft);
      }
    } catch {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    }
  }, [isLoading]);

  // Cross-device resume: check the backend for an in-progress assessment.
  // Only runs for authenticated users when sessionStorage has no draft
  // (sessionStorage takes priority as it also holds richer RIASEC/CVQ raw drafts).
  useEffect(() => {
    if (isLoading || !isAuthenticated || apiResumeChecked) return;

    setApiResumeChecked(true);

    // sessionStorage draft takes priority — skip server check if one exists
    if (sessionStorage.getItem(DRAFT_KEY)) return;

    const checkServerDraft = async () => {
      try {
        const { apiRequest } = await import("@/lib/queryClient");
        // apiRequest throws on non-OK responses, so no need for a res.ok guard
        const res = await apiRequest("GET", "/api/assessments/my");
        const allAssessments: AssessmentRecord[] = await res.json();

        // Most recent in-progress assessment (array is already ordered by createdAt desc)
        const inProgress = allAssessments.find(a => !a.isCompleted && a.currentStep > 1);
        if (!inProgress) return;

        // Resolve personalityTraits: the DB stores this as JSONB (unknown at the type level).
        // Free-tier: stored as string[] (trait keys like "teamwork_2" after Task #59, or
        // legacy question-ID keys like "teamwork"). We convert back to { questionId: answer }
        // so PersonalityStep can pre-select the correct radio button on resume.
        // Premium: stored as Record<string,number> (RIASEC/CVQ scores) — passed through as-is.
        const rawPt = inProgress.personalityTraits;
        const personalityTraits: Record<string, number> = (() => {
          if (Array.isArray(rawPt)) {
            const entries: Array<[string, string | number]> = (rawPt as string[]).map(item => {
              const rev = TRAIT_KEY_REVERSE[item];
              // New format: "teamwork_2" → restore { teamwork: "2" } for PersonalityStep
              // Old format: "teamwork"   → store as truthy placeholder { teamwork: 1 }
              return rev ? [rev.questionId, rev.answer] : [item, 1];
            });
            return Object.fromEntries(entries) as Record<string, number>;
          }
          if (rawPt !== null && typeof rawPt === "object") {
            return rawPt as Record<string, number>;
          }
          return {};
        })();

        // Map backend assessment fields to the AssessmentData shape.
        // Raw RIASEC/CVQ item responses are not persisted (only computed scores are
        // stored as riasecScores/cvqScores), so those fields start empty. Steps that
        // were already completed before the save don't need to be re-submitted.
        const hydratedData: AssessmentData = {
          name: inProgress.name ?? "",
          age: inProgress.age ?? null,
          grade: inProgress.grade ?? "",
          gender: inProgress.gender ?? "",
          consentGiven: true,
          favoriteSubjects: inProgress.favoriteSubjects ?? [],
          prioritySubjects: inProgress.prioritySubjects ?? [],
          interests: inProgress.interests ?? [],
          personalityTraits,
          riasecResponses: {},
          cvqResponses: {},
          countryId: inProgress.countryId ?? "",
          careerAspirations: inProgress.careerAspirations ?? [],
          strengths: inProgress.strengths ?? [],
        };

        setResumePrompt({
          assessmentId: inProgress.id,
          currentStep: inProgress.currentStep,
          assessmentData: hydratedData,
        });
      } catch (err) {
        // Non-fatal — student can always start fresh
        console.error("Server draft check failed:", err);
      }
    };

    checkServerDraft();
  }, [isLoading, isAuthenticated, apiResumeChecked]);

  // Persist draft to sessionStorage whenever assessmentId / step / data changes
  // Guards: only save once an assessment has been created (assessmentId set) and past step 1
  useEffect(() => {
    if (!assessmentId || currentStep <= 1) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ assessmentId, currentStep, assessmentData }));
    } catch {}
  }, [assessmentId, currentStep, assessmentData]);

  // Routing guard: Redirect authenticated non-premium users to tier selection
  useEffect(() => {
    if (!isLoading && isAuthenticated && !isPremiumUser && !isGuest) {
      setLocation("/tier-selection");
    }
  }, [isLoading, isAuthenticated, isPremiumUser, isGuest, setLocation]);

  // Smart skip logic: Auto-populate demographics and skip to Subjects if all fields pre-filled
  useEffect(() => {
    if (!user || currentStep !== 1) return;

    const predefinedGrade = (user as any)?.predefinedGrade;
    const predefinedName = (user as any)?.predefinedName;
    const predefinedAge = (user as any)?.predefinedAge;
    const predefinedGender = (user as any)?.predefinedGender;

    // Check if all demographics fields are pre-filled for org student (explicit null/undefined checks to handle age=0)
    const allFieldsPreFilled = 
      predefinedGrade && 
      predefinedName && 
      predefinedAge !== null && predefinedAge !== undefined && 
      predefinedGender;

    if (allFieldsPreFilled && !assessmentData.name) {
      // Auto-populate demographics data
      setAssessmentData((prev) => ({
        ...prev,
        name: predefinedName,
        age: predefinedAge,
        grade: predefinedGrade,
        gender: predefinedGender,
        consentGiven: true, // Institutional consent
      }));

      // Skip to Subjects step (step 2) after state update
      setTimeout(() => setCurrentStep(2), 0);
    }
  }, [user, currentStep, assessmentData.name]);

  // Country auto-populate logic: Pre-fill countryId if org has predefined country
  // This runs when assessment data loads, not when visiting the step
  useEffect(() => {
    if (!user) return;
    
    const predefinedCountryId = (user as any)?.organizationCountryId;
    
    // Auto-populate country as soon as assessment loads if org has default country
    // Only populate if not already set (respects user overrides and existing drafts)
    if (predefinedCountryId && !assessmentData.countryId) {
      setAssessmentData((prev) => ({
        ...prev,
        countryId: predefinedCountryId,
      }));
    }
  }, [user, assessmentData.countryId]);

  // Auto-save: Save progress whenever assessment data changes (for authenticated users)
  useEffect(() => {
    if (!isAuthenticated || !assessmentId || currentStep <= 1) {
      return; // Don't auto-save on first step or before assessment is created
    }

    const timeoutId = setTimeout(async () => {
      try {
        const { apiRequest } = await import("@/lib/queryClient");
        
        // Map frontend fields to backend schema
        const backendData: any = {
          name: assessmentData.name,
          age: assessmentData.age,
          grade: assessmentData.grade,
          gender: assessmentData.gender,
          favoriteSubjects: assessmentData.favoriteSubjects,
          prioritySubjects: assessmentData.prioritySubjects || [],
          interests: assessmentData.interests,
          countryId: assessmentData.countryId,
          careerAspirations: assessmentData.careerAspirations || [],
          strengths: assessmentData.strengths || [],
          currentStep,
        };
        
        // Only include personalityTraits for free users
        if (!isPremiumUser) {
          backendData.personalityTraits = Object.entries(assessmentData.personalityTraits)
            .filter(([, v]) => v)
            .map(([k, v]) => TRAIT_KEY_MAP[k]?.[String(v)] ?? k);
        }
        
        // Include premium assessment scores if available
        if (isPremiumUser) {
          if (Object.keys(assessmentData.riasecResponses).length > 0) {
            backendData.riasecResponses = assessmentData.riasecResponses;
          }
          if (Object.keys(assessmentData.cvqResponses).length > 0) {
            backendData.cvqResponses = assessmentData.cvqResponses;
          }
        }
        
        // Silently auto-save in background
        await apiRequest("PATCH", `/api/assessments/${assessmentId}`, backendData);
      } catch (error) {
        // Silently fail - don't disturb user with auto-save errors
        console.error("Auto-save failed:", error);
      }
    }, 2000); // Debounce: save 2 seconds after last change

    return () => clearTimeout(timeoutId);
  }, [assessmentData, assessmentId, currentStep, isAuthenticated, isPremiumUser]);

  const updateAssessmentData = (field: string, value: any) => {
    setAssessmentData((prev) => ({ ...prev, [field]: value }));
  };

  const handleResume = () => {
    if (!resumePrompt) return;
    setAssessmentId(resumePrompt.assessmentId);
    setCurrentStep(resumePrompt.currentStep);

    // Merge RIASEC and CVQ drafts from their own sessionStorage keys into parent state
    // so that step 5 (RIASEC) and step 6 (CVQ) re-render with the correct data even
    // when the main draft's cvqResponses/riasecResponses are empty (mid-step refresh).
    let merged = { ...resumePrompt.assessmentData };

    // CVQ: raw item responses (Record<string, number>) match assessmentData.cvqResponses type
    if (Object.keys(merged.cvqResponses).length === 0) {
      try {
        const cvqRaw = sessionStorage.getItem("cvq_draft");
        if (cvqRaw) merged = { ...merged, cvqResponses: JSON.parse(cvqRaw) };
      } catch {}
    }

    // RIASEC: raw item responses are in riasec_draft; computed scores live in
    // assessmentData.riasecResponses (set after handleRiasecComplete).
    // If scores are absent (mid-step refresh at step 5), store the raw draft so
    // the final Aspirations save has the best available data while RiasecStep
    // self-restores its UI from riasec_draft independently.
    if (Object.keys(merged.riasecResponses).length === 0) {
      try {
        const riasecRaw = sessionStorage.getItem("riasec_draft");
        if (riasecRaw) merged = { ...merged, riasecResponses: JSON.parse(riasecRaw) };
      } catch {}
    }

    setAssessmentData(merged);
    setResumePrompt(null);
  };

  const handleStartFresh = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    try { sessionStorage.removeItem("riasec_draft"); } catch {}
    try { sessionStorage.removeItem("cvq_draft"); } catch {}
    setResumePrompt(null);
  };

  const handleNext = async () => {
    // Re-entry guard: prevent double-submission while generation is in progress
    if (isGenerating) return;

    // Premium: Save after Country (step 3), before Quiz (step 4)
    // Free: Save after Aspirations (step 6), before Quiz (step 7)
    const needsSaveBeforeQuiz = 
      (isPremiumUser && currentStep === 3) || // Premium: Save after Country, before Quiz
      (!isPremiumUser && currentStep === 6);  // Free: Save after Aspirations, before Quiz
    
    const isAspirationsStepPremium = isPremiumUser && currentStep === 7;
    
    if (needsSaveBeforeQuiz || isAspirationsStepPremium) {
      // Show loading state from the very start of the premium pipeline (save + generate)
      if (isAspirationsStepPremium) setIsGenerating(true);

      try {
        const { apiRequest } = await import("@/lib/queryClient");
        
        // Map frontend fields to backend schema
        const backendData: any = {
          name: assessmentData.name,
          age: assessmentData.age,
          grade: assessmentData.grade,
          gender: assessmentData.gender,
          favoriteSubjects: assessmentData.favoriteSubjects,
          prioritySubjects: assessmentData.prioritySubjects || [],
          interests: assessmentData.interests,
          countryId: assessmentData.countryId,
          careerAspirations: assessmentData.careerAspirations || [],
          strengths: assessmentData.strengths || [],
        };
        
        // Only include personalityTraits for free users (who complete PersonalityStep)
        if (!isPremiumUser) {
          backendData.personalityTraits = Object.entries(assessmentData.personalityTraits)
            .filter(([, v]) => v)
            .map(([k, v]) => TRAIT_KEY_MAP[k]?.[String(v)] ?? k);
        }
        
        // Include RIASEC scores if premium user completed RIASEC assessment
        if (isPremiumUser && Object.keys(assessmentData.riasecResponses).length > 0) {
          backendData.riasecResponses = assessmentData.riasecResponses;
        }
        
        // Include CVQ responses if premium user completed CVQ assessment
        if (isPremiumUser && Object.keys(assessmentData.cvqResponses).length > 0) {
          backendData.cvqResponses = assessmentData.cvqResponses;
        }
        
        // Clear any previous inline error before retrying
        if (isAspirationsStepPremium) setAspirationsError(null);

        // Save assessment — distinct error handling so the user gets the right message
        let assessment;
        try {
          if (assessmentId) {
            // Update existing assessment
            const response = await apiRequest("PATCH", `/api/assessments/${assessmentId}`, backendData);
            assessment = await response.json();
          } else {
            // Create new assessment (guest token is now stored in httpOnly cookie automatically)
            const response = await apiRequest("POST", "/api/assessments", backendData);
            assessment = await response.json();
          }
        } catch (saveError) {
          console.error("Error saving assessment:", saveError);
          const msg = t("errors.saveFailedDesc", { message: saveError instanceof Error ? saveError.message : t("errors.unknownError") });
          toast({ title: t("errors.saveFailed"), description: msg, variant: "destructive" });
          if (isAspirationsStepPremium) setAspirationsError(msg);
          return; // stop here; finally will clear isGenerating
        }
        
        // Set assessmentId immediately after save
        setAssessmentId(assessment.id);
        
        if (isAspirationsStepPremium) {
          // Premium: Generate recommendations and redirect
          try {
            await apiRequest("POST", `/api/recommendations/generate/${assessment.id}`, {});
            try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
            setLocation("/results?assessmentId=" + assessment.id);
          } catch (genError) {
            console.error("Error generating recommendations:", genError);
            const msg = t("errors.generateFailedDesc");
            toast({ title: t("errors.generateFailed"), description: msg, variant: "destructive" });
            setAspirationsError(msg);
          }
        } else {
          // Advance to quiz step - React batches state updates so assessmentId will be available
          setCurrentStep((prev) => prev + 1);
        }
      } finally {
        // Always clear loading state when the full pipeline finishes (success, save error, or generate error)
        if (isAspirationsStepPremium) setIsGenerating(false);
      }
    } else {
      // For all other steps: Just advance
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleQuizComplete = async () => {
    if (!assessmentId) {
      console.error("No assessmentId for quiz completion");
      return;
    }
    
    // Free users only: Generate recommendations after quiz (step 7)
    // Premium users complete quiz at step 4 and continue to RIASEC → CVQ → Aspirations
    // Premium recommendation generation is handled by handleNext at the Aspirations step (step 7)
    try {
      const { apiRequest } = await import("@/lib/queryClient");
      
      // Generate recommendations based on assessment + quiz
      await apiRequest("POST", `/api/recommendations/generate/${assessmentId}`, {});
      
      // Navigate to results (clear draft so resume prompt doesn't appear on next visit)
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
      setLocation("/results?assessmentId=" + assessmentId);
    } catch (error) {
      console.error("Error generating recommendations:", error);
      toast({
        title: t("errors.generateFailed"),
        description: t("errors.generateFailedDesc"),
        variant: "destructive",
      });
    }
  };

  // Save RIASEC scores immediately to the backend and advance to CVQ (step 6)
  // We cannot rely on auto-save or state settling before the final Aspirations save,
  // because React state updates are async and the closure at step 7 could miss the data.
  const handleRiasecComplete = async (scores: RiasecScores) => {
    updateAssessmentData("riasecResponses", scores);

    if (!assessmentId) {
      console.error("No assessmentId when RIASEC completed — cannot save scores");
      setCurrentStep(6);
      return;
    }

    try {
      const { apiRequest } = await import("@/lib/queryClient");
      await apiRequest("PATCH", `/api/assessments/${assessmentId}`, {
        riasecResponses: scores,
      });
    } catch (error) {
      // Non-fatal: RIASEC data is still in local state and will be included in the
      // final Aspirations save (step 7).  Log for debugging but don't block the user.
      console.error("Failed to save RIASEC scores immediately, will retry at step 7:", error);
    }

    setCurrentStep(6);
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSaveAndLogin = () => {
    sessionStorage.setItem("pendingAssessment", JSON.stringify({
      ...assessmentData,
      currentStep,
    }));
    // Redirect back to assessment after login
    window.location.href = "/api/login?returnTo=/assessment";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <main id="main-content" className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 pb-12">
      {/* Guest Banner */}
      {isGuest && !isAuthenticated && (
        <div className="bg-accent border-b border-accent-border sticky top-0 z-50 backdrop-blur-sm bg-accent/80">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-body text-accent-foreground">
                {t("guestBanner.text")}
              </span>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={handleSaveAndLogin}
              data-testid="button-save-login"
            >
              <LogIn className="w-4 h-4 me-2" aria-hidden="true" />
              {t("guestBanner.signUp")}
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-background border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-primary" aria-hidden="true" />
            <div>
              <h1 className="text-xl font-bold">{tCommon("header.brandName")}</h1>
              <p className="text-sm text-muted-foreground font-body">{t("header.subtitle")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            {user?.accountType === 'superadmin' && (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/superadmin")}
                  data-testid="button-nav-superadmin"
                >
                  <Shield className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.superadmin")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/admin/organizations")}
                  data-testid="button-nav-admin"
                >
                  <Building2 className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.admin")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/admin")}
                  data-testid="button-nav-questions"
                >
                  <FileQuestion className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.quiz")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/analytics")}
                  data-testid="button-nav-analytics"
                >
                  <BarChart className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.analytics")}
                </Button>
              </>
            )}
            {user?.accountType === 'org_admin' && (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/admin/organizations")}
                  data-testid="button-nav-admin"
                >
                  <Building2 className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.admin")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/assessment")}
                  data-testid="button-nav-assessment"
                >
                  <ClipboardCheck className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.assessment")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/analytics")}
                  data-testid="button-nav-analytics"
                >
                  <BarChart className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.analytics")}
                </Button>
              </>
            )}
            {user?.accountType !== 'superadmin' && user?.accountType !== 'org_admin' && (
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => guardedNavigate("/assessment")}
                data-testid="button-nav-assessment"
              >
                <ClipboardCheck className="w-4 h-4 me-2" aria-hidden="true" />
                {tCommon("nav.assessment")}
              </Button>
            )}
            {isAuthenticated && (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => guardedNavigate("/profile")}
                  data-testid="button-nav-profile"
                >
                  <User className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.profile")}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={guardedLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 me-2" aria-hidden="true" />
                  {tCommon("nav.logout")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress Tracker */}
      <ProgressTracker currentStep={currentStep} totalSteps={totalSteps} isPremium={isPremiumUser} />

      {/* Resume Prompt — shown instead of step content when a saved draft is detected */}
      {resumePrompt && (
        <div className="max-w-2xl mx-auto px-4 py-16 flex items-center justify-center min-h-[60vh]">
          <div className="bg-card rounded-xl border shadow-md p-8 space-y-6 text-center w-full">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <PlayCircle className="w-8 h-8 text-primary" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">{t("resume.title")}</h2>
              <p className="text-muted-foreground font-body">
                {t("resume.subtitle", { step: resumePrompt.currentStep, total: totalSteps })}
              </p>
              <p className="text-sm text-muted-foreground font-body">{t("resume.info")}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                size="lg"
                onClick={handleResume}
                className="flex-1 sm:flex-none"
                data-testid="button-resume-assessment"
              >
                <PlayCircle className="w-4 h-4 me-2" aria-hidden="true" />
                {t("resume.continueBtn", { step: resumePrompt.currentStep })}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleStartFresh}
                className="flex-1 sm:flex-none"
                data-testid="button-start-fresh"
              >
                <RotateCcw className="w-4 h-4 me-2" aria-hidden="true" />
                {t("resume.freshBtn")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div
        className={resumePrompt ? "hidden" : "max-w-4xl mx-auto px-4"}
        role="region"
        aria-labelledby="assessment-step-heading"
      >
        <h2 id="assessment-step-heading" className="sr-only">
          {t("progress.stepOf", { current: currentStep, total: totalSteps })}
        </h2>
        {/* Step 1: Demographics (both tiers) */}
        {currentStep === 1 && (
          <DemographicsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
            predefinedGrade={(user as any)?.predefinedGrade}
            predefinedName={(user as any)?.predefinedName}
            predefinedAge={(user as any)?.predefinedAge}
            predefinedGender={(user as any)?.predefinedGender}
          />
        )}
        
        {/* Step 2: Subjects (both tiers) */}
        {currentStep === 2 && (
          <SubjectsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
            onBack={() => setCurrentStep(1)}
          />
        )}
        
        {/* Step 3: Country (premium) | Interests (free) */}
        {currentStep === 3 && (
          <>
            {isPremiumUser ? (
              <CountryStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(2)}
              />
            ) : (
              <InterestsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(2)}
              />
            )}
          </>
        )}
        
        {/* Step 4: Quiz (premium) | Personality (free) */}
        {currentStep === 4 && (
          <>
            {isPremiumUser ? (
              assessmentId ? (
                <QuizStep
                  assessmentId={assessmentId}
                  onComplete={() => setCurrentStep(5)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                  <p className="text-lg text-destructive font-semibold">{t("errors.loadingQuiz")}</p>
                  <p className="text-muted-foreground">{t("errors.loadingQuizDesc")}</p>
                </div>
              )
            ) : (
              <PersonalityStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(3)}
              />
            )}
          </>
        )}
        
        {/* Step 5: RIASEC (premium) | Country (free) */}
        {currentStep === 5 && (
          <>
            {isPremiumUser ? (
              <RiasecStep
                onComplete={handleRiasecComplete}
                onBack={() => setCurrentStep(4)}
              />
            ) : (
              <CountryStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(4)}
              />
            )}
          </>
        )}
        
        {/* Step 6: CVQ (premium) | Aspirations (free) */}
        {currentStep === 6 && (
          <>
            {isPremiumUser ? (
              assessmentId ? (
                <CVQStep
                  assessmentId={assessmentId}
                  responses={assessmentData.cvqResponses}
                  onUpdate={(responses) => updateAssessmentData("cvqResponses", responses)}
                  onNext={handleNext}
                  onBack={() => setCurrentStep(5)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                  <p className="text-lg text-destructive font-semibold">{t("errors.notFound")}</p>
                  <p className="text-muted-foreground">{t("errors.notFoundDesc")}</p>
                  <Button onClick={() => setCurrentStep(5)} data-testid="button-back-to-assessment">
                    {t("errors.goBack")}
                  </Button>
                </div>
              )
            ) : (
              <AspirationsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(5)}
                isGenerating={isGenerating}
                submitError={aspirationsError}
              />
            )}
          </>
        )}
        
        {/* Step 7: Aspirations (premium) | Quiz (free) */}
        {currentStep === 7 && (
          <>
            {isPremiumUser ? (
              <AspirationsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(6)}
                isGenerating={isGenerating}
                submitError={aspirationsError}
              />
            ) : (
              assessmentId ? (
                <QuizStep
                  assessmentId={assessmentId}
                  onComplete={handleQuizComplete}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                  <p className="text-lg text-destructive font-semibold">{t("errors.notFound")}</p>
                  <p className="text-muted-foreground">{t("errors.notFoundDesc")}</p>
                  <Button onClick={() => setCurrentStep(6)} data-testid="button-back-to-assessment">
                    {t("errors.goBack")}
                  </Button>
                </div>
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
