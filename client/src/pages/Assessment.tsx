import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ProgressTracker } from "@/components/ProgressTracker";
import { Button } from "@/components/ui/button";
import { DemographicsStep } from "@/components/assessment/DemographicsStep";
import { SubjectsStep } from "@/components/assessment/SubjectsStep";
import { InterestsStep } from "@/components/assessment/InterestsStep";
import RiasecStep, { type RiasecScores } from "@/components/RiasecStep";
import CVQStep from "@/components/CVQStep";
import { CountryStep } from "@/components/assessment/CountryStep";
import { AspirationsStep } from "@/components/assessment/AspirationsStep";
import { QuizStep } from "@/components/assessment/QuizStep";
import { GraduationCap, LogIn, LogOut, User, ClipboardCheck, Building2, BarChart, Shield, FileQuestion, RotateCcw, PlayCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Assessment as AssessmentRecord } from "@shared/schema";
import { useAssessmentAvailability } from "@/hooks/useAssessmentAvailability";
import { PageLayout } from "@/components/layout/PageLayout";
import { deriveFreeResumeStep, finalInputStep, totalStepsForTier } from "@shared/assessmentFlow";

// v2 — Phase 3 renumbered the FREE step order (Country and Interests swapped
// sides of the Quiz; Personality was removed). A v1 draft encodes the OLD
// numbering, and a step number from one order cannot be translated into the
// other: resuming v1 at its stored step drops the student into a step whose
// prerequisites were never collected, and generation then 400s on a component
// they were never shown. Bumping the key means a v1 draft is DISCARDED rather
// than misinterpreted; LEGACY_DRAFT_KEYS evicts it so it cannot linger.
//
// This covers sessionStorage only. The same hazard in the DATABASE
// (assessments.currentStep, read by cross-device resume) cannot be fixed by a
// key bump — see deriveFreeResumeStep in shared/assessmentFlow.ts.
const DRAFT_KEY = "fp_assessment_draft_v2";
const LEGACY_DRAFT_KEYS = ["fp_assessment_draft"];

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 45; // ~90 s — generous ceiling for slow generation under load

interface AssessmentData {
  name: string;
  age: number | null;
  grade: string;
  gender: string;
  consentGiven: boolean;
  favoriteSubjects: string[];
  prioritySubjects: string[]; // Up to 3 subjects marked as priority (get more quiz questions)
  interests: string[];
  riasecResponses: Record<string, number>; // RIASEC responses (premium users only)
  cvqResponses: Record<string, number>; // CVQ values responses (premium users only)
  countryId: string;
  careerAspirations: string[];
  strengths: string[];
}

export default function Assessment() {
  const { t } = useTranslation("assessment");
  const tCommon = useTranslation("common").t;
  useEffect(() => { document.title = `${t("pageTitle")} | ${t("appName")}`; }, [t]);

  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const {
    isOrgStudent,
    isLoading: availLoading,
    hasAvailable,
    hasInProgress,
    completedReportId,
  } = useAssessmentAvailability();
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
  // Polling state: true while we're waiting for an in-flight generation to complete
  const [isPollingForResults, setIsPollingForResults] = useState(false);
  const pollingAssessmentIdRef = useRef<string | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingAttemptsRef = useRef(0);
  // Keep a copy of the draft so we can restore the resume prompt on poll timeout
  const pollingDraftRef = useRef<{ assessmentId: string; currentStep: number; assessmentData: AssessmentData } | null>(null);

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
  
  // 7 free (Basic, Subjects, Country, Quiz, Interests, Aspirations, Results),
  // 8 premium (… RIASEC, CVQ, Aspirations, Results). Both counts INCLUDE
  // Results, which this page never renders — completion redirects to /results.
  // Before Phase 3 both tiers were hardcoded to 7 and the two 7s disagreed:
  // premium's excluded Results while free's included it, which is how the free
  // progress labels came to be off by one step. See shared/assessmentFlow.ts.
  const totalSteps = totalStepsForTier(isPremiumUser);

  // The last step that collects input — Aspirations for both tiers, so 6 free
  // and 7 premium. Report generation fires here, so a reload at this step means
  // "generation may be in flight" (poll) rather than "resume the form".
  // This was a module-level constant of 7, correct for premium and wrong for
  // free the moment free's last step became 6.
  const finalGenerationStep = finalInputStep(isPremiumUser);

  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    name: "",
    age: null,
    grade: "",
    gender: "",
    consentGiven: false,
    favoriteSubjects: [],
    prioritySubjects: [],
    interests: [],
    riasecResponses: {},
    cvqResponses: {},
    countryId: "",
    careerAspirations: [],
    strengths: [],
  });

  // Guest mode is driven by `?guest=true` (set by the Landing CTAs). Gated on
  // !isAuthenticated so an authenticated visitor arriving with the param still
  // follows the normal authenticated routing below: `isGuest` suppresses the
  // non-premium redirect to /tier-selection, and lifting that block for free
  // accounts is Phase 5 (Bug #7), not this change.
  useEffect(() => {
    if (isLoading) return;
    const params = new URLSearchParams(window.location.search);
    setIsGuest(params.get("guest") === "true" && !isAuthenticated);
  }, [isLoading, isAuthenticated]);

  // On mount (after auth resolves): check sessionStorage for a saved draft.
  // If the draft is at the final generation step (6 free / 7 premium) we first silently check
  // whether recommendations already exist.  If they do we redirect immediately;
  // if they don't we show a polling "Generating…" screen rather than the resume
  // prompt, because the POST /api/recommendations/generate call was likely still
  // in-flight when the page was reloaded.
  useEffect(() => {
    if (isLoading) return;
    try {
      // Evict pre-Phase-3 drafts BEFORE reading, so the first mount after deploy
      // cannot resume one. Their step numbers refer to the old free order.
      for (const legacyKey of LEGACY_DRAFT_KEYS) {
        try { sessionStorage.removeItem(legacyKey); } catch {}
      }

      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as { assessmentId: string; currentStep: number; assessmentData: AssessmentData };
      if (!draft.assessmentId || typeof draft.currentStep !== "number" || draft.currentStep <= 1) return;

      if (draft.currentStep >= finalGenerationStep) {
        // Async path: check if recommendations are already there
        const checkAndRoute = async () => {
          try {
            const { apiRequest } = await import("@/lib/queryClient");
            const res = await apiRequest("GET", `/api/recommendations?assessmentId=${draft.assessmentId}`);
            const recs = await res.json();
            if (Array.isArray(recs) && recs.length > 0) {
              // Generation already completed — redirect straight to results
              try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
              setLocation("/results?assessmentId=" + draft.assessmentId);
            } else {
              // No results yet — start polling (generation may still be running)
              pollingAssessmentIdRef.current = draft.assessmentId;
              pollingDraftRef.current = draft;
              pollingAttemptsRef.current = 0;
              setIsPollingForResults(true);
            }
          } catch {
            // Network error — fall back to resume prompt so student isn't stuck
            setResumePrompt(draft);
          }
        };
        checkAndRoute();
      } else {
        // Normal resume path — generation hasn't started yet
        setResumePrompt(draft);
      }
    } catch {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Polling effect: fires every POLL_INTERVAL_MS while isPollingForResults is true.
  // Clears itself and redirects when recommendations appear, or falls back to the
  // resume prompt after MAX_POLL_ATTEMPTS attempts (~30 s).
  useEffect(() => {
    if (!isPollingForResults) return;
    const aid = pollingAssessmentIdRef.current;
    if (!aid) return;

    const poll = async () => {
      pollingAttemptsRef.current += 1;
      try {
        const { apiRequest } = await import("@/lib/queryClient");
        const res = await apiRequest("GET", `/api/recommendations?assessmentId=${aid}`);
        const recs = await res.json();
        if (Array.isArray(recs) && recs.length > 0) {
          if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
          try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
          setIsPollingForResults(false);
          setLocation("/results?assessmentId=" + aid);
          return;
        }
      } catch {
        // ignore transient errors, keep polling
      }

      if (pollingAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
        setIsPollingForResults(false);
        // Restore resume prompt so the student can continue from where they were
        if (pollingDraftRef.current) {
          setResumePrompt(pollingDraftRef.current);
        }
      }
    };

    // Run immediately then repeat
    poll();
    pollingTimerRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [isPollingForResults]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // No in-progress assessment to resume. The locked-state UI (rendered below)
        // explains a consumed allocation — we no longer redirect to the report on mount.
        if (!inProgress) return;

        // personalityTraits is deliberately NOT hydrated. The free flow no longer
        // has a PersonalityStep, so nothing would render it. Rows written before
        // Phase 3 still hold the value in the DB and are still displayed on the
        // report (Results.tsx / ResultsPrint.tsx render it when non-empty) —
        // this page just stops carrying it through the form.

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
          riasecResponses: {},
          cvqResponses: {},
          countryId: inProgress.countryId ?? "",
          careerAspirations: inProgress.careerAspirations ?? [],
          strengths: inProgress.strengths ?? [],
        };

        // WHERE TO RESUME — the server-side half of the Phase 3 renumbering.
        //
        // Versioning DRAFT_KEY discards stale sessionStorage drafts, but this
        // path reads assessments.currentStep, a DATABASE column: it survives the
        // session, the browser and the device, and every free assessment in
        // flight at deploy time holds a number in the OLD free order (where 3
        // was Interests and 5 was Country). Trusting it would resume a student
        // into a step whose prerequisites were never collected.
        //
        // For FREE we therefore ignore the stored number entirely and derive the
        // step from the data actually present, which is correct under either
        // numbering. PREMIUM's order is unchanged by Phase 3, so its stored
        // currentStep stays valid and is used as-is.
        const resumeStep = isPremiumUser
          ? inProgress.currentStep
          : deriveFreeResumeStep(inProgress);

        setResumePrompt({
          assessmentId: inProgress.id,
          currentStep: resumeStep,
          assessmentData: hydratedData,
        });
      } catch (err) {
        // Non-fatal — student can always start fresh
        console.error("Server draft check failed:", err);
      }
    };

    checkServerDraft();
  }, [isLoading, isAuthenticated, apiResumeChecked, isPremiumUser]);

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
        
        // No personalityTraits: the free PersonalityStep was removed in Phase 3.
        // Leaving this in would PATCH an empty array over whatever the column
        // held, and the generation gate used to reject exactly that value.
        
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

    // Save after Country (step 3), before Quiz (step 4) — BOTH TIERS.
    // The save exists only because QuizStep needs a persisted assessmentId to
    // call /api/assessments/:id/quiz/generate. Now that the Quiz sits at step 4
    // of the shared spine for everyone, the tier branch this condition used to
    // carry is gone: free's quiz was step 7, so free used to save after step 6.
    const needsSaveBeforeQuiz = currentStep === 3;

    // Aspirations is the last input step for both tiers (L3) — 6 free, 7 premium.
    // Report generation fires from here for BOTH tiers now; free used to
    // generate from handleQuizComplete, which no longer exists.
    const isAspirationsStep = currentStep === finalGenerationStep;

    if (needsSaveBeforeQuiz || isAspirationsStep) {
      // Show loading state from the very start of the pipeline (save + generate)
      if (isAspirationsStep) setIsGenerating(true);

      try {
        const { apiRequest, queryClient } = await import("@/lib/queryClient");
        
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
        
        // No personalityTraits — see the auto-save effect above.
        
        // Include RIASEC scores if premium user completed RIASEC assessment
        if (isPremiumUser && Object.keys(assessmentData.riasecResponses).length > 0) {
          backendData.riasecResponses = assessmentData.riasecResponses;
        }
        
        // Include CVQ responses if premium user completed CVQ assessment
        if (isPremiumUser && Object.keys(assessmentData.cvqResponses).length > 0) {
          backendData.cvqResponses = assessmentData.cvqResponses;
        }
        
        // Clear any previous inline error before retrying
        if (isAspirationsStep) setAspirationsError(null);

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
          const msg = t("errors.saveFailedDesc");
          if (isAspirationsStep) {
            setAspirationsError(msg);
          } else {
            toast({ title: t("errors.saveFailed"), description: msg, variant: "destructive" });
          }
          return; // stop here; finally will clear isGenerating
        }
        
        // Set assessmentId immediately after save
        setAssessmentId(assessment.id);
        
        if (isAspirationsStep) {
          // Generate recommendations and redirect — one path for both tiers.
          try {
            await apiRequest("POST", `/api/recommendations/generate/${assessment.id}`, {});
            try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
            // Completion consumes the org_student's allocation — refresh the cached
            // assessments list so availability (header link, "Start New Assessment")
            // reflects 0 immediately rather than after the 5-min staleTime.
            queryClient.invalidateQueries({ queryKey: ["/api/assessments/my"] });
            setLocation("/results?assessmentId=" + assessment.id);
          } catch (genError) {
            console.error("Error generating recommendations:", genError);
            setAspirationsError(t("errors.generateFailedDesc"));
          }
        } else {
          // Advance to quiz step - React batches state updates so assessmentId will be available
          setCurrentStep((prev) => prev + 1);
        }
      } finally {
        // Always clear loading state when the full pipeline finishes (success, save error, or generate error)
        if (isAspirationsStep) setIsGenerating(false);
      }
    } else {
      // For all other steps: Just advance
      setCurrentStep((prev) => prev + 1);
    }
  };

  // handleQuizComplete is gone. The quiz is now step 4 of the shared spine for
  // both tiers, i.e. mid-flow, so finishing it just advances to step 5. Free's
  // report generation moved to the Aspirations branch of handleNext, alongside
  // premium's — one generation call site instead of two.
  //
  // This also closed a double-generation surface: QuizStep calls onComplete from
  // four paths (already-completed auto-advance, submit success, the
  // QUIZ_ALREADY_SUBMITTED recovery, and the two skip buttons), and each of them
  // used to be able to fire a free generation.

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
    // The "pendingAssessment" sessionStorage write that used to live here is
    // gone: nothing in the codebase ever read that key, and it stored a bare
    // currentStep — a third encoding of the step order, which Phase 3 would have
    // silently invalidated along with the other two. Progress is preserved by
    // DRAFT_KEY (sessionStorage) and by assessments.currentStep (the server),
    // both of which survive this redirect.
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

  // Shown when the page is reloaded mid-generation: poll until results arrive.
  if (isPollingForResults) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="text-center space-y-6 px-4 max-w-md mx-auto">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-2">
            <GraduationCap className="w-10 h-10 text-primary animate-pulse" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t("polling.title")}</h2>
            <p className="text-muted-foreground font-body">{t("polling.subtitle")}</p>
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground font-body">{t("polling.hint")}</p>
        </div>
      </div>
    );
  }

  // Org_student availability still loading: show the spinner rather than briefly
  // flashing the form (or the lock) before we know which to render.
  if (isOrgStudent && availLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  // LOCKED: org_student who has used their one allocation and has nothing in
  // progress. Individuals/guests (isOrgStudent === false) and mid-assessment or
  // fresh students never reach this branch.
  if (isOrgStudent && !hasAvailable && !hasInProgress) {
    return (
      <PageLayout variant="gradient">
        <div className="flex items-center justify-center px-4 py-12 min-h-[calc(100vh-12rem)]">
          <div className="max-w-md w-full text-center space-y-6 rounded-xl p-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
              <ClipboardCheck className="w-8 h-8 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl md:text-5xl font-bold">{t("lock.title")}</h1>
              <p className="text-lg text-muted-foreground">{t("lock.orgStudentBody")}</p>
            </div>
            {completedReportId && (
              <Button asChild size="lg" className="w-full text-lg px-8 py-6 rounded-full shadow-xl">
                <a href={`/results?assessmentId=${completedReportId}`}>{t("lock.viewReport")}</a>
              </Button>
            )}
          </div>
        </div>
      </PageLayout>
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
        
        {/* Step 3: Country — SHARED SPINE (L2). Was premium-only here; free
            used to reach Country at step 5, after Interests and Personality.
            The isPremiumUser ternary this branch carried is gone. */}
        {currentStep === 3 && (
          <CountryStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
            onBack={() => setCurrentStep(2)}
          />
        )}
        
        {/* Step 4: Quiz — SHARED SPINE (L2). Was premium-only here; free used to
            take the quiz LAST, at step 7, where finishing it also fired report
            generation. It is now mid-flow for both tiers and simply advances.
            handleNext saved at step 3, so assessmentId is set by the time we
            get here — the fallback below is for a save that silently failed. */}
        {currentStep === 4 && (
          <>
            {assessmentId ? (
              <QuizStep
                assessmentId={assessmentId}
                onComplete={() => setCurrentStep(5)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <p className="text-lg text-destructive font-semibold">{t("errors.loadingQuiz")}</p>
                <p className="text-muted-foreground">{t("errors.loadingQuizDesc")}</p>
              </div>
            )}
          </>
        )}
        
        {/* Step 5: RIASEC (premium) | Interests (free) — divergence begins */}
        {currentStep === 5 && (
          <>
            {isPremiumUser ? (
              <RiasecStep
                onComplete={handleRiasecComplete}
                onBack={() => setCurrentStep(4)}
              />
            ) : (
              <InterestsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(4)}
              />
            )}
          </>
        )}
        
        {/* Step 6: CVQ (premium) | Aspirations (free — LAST INPUT STEP, generates) */}
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
        
        {/* Step 7: Aspirations (premium — LAST INPUT STEP, generates).
            Free has no step 7: its step 7 is Results, which is a separate page. */}
        {currentStep === 7 && isPremiumUser && (
          <AspirationsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
            onBack={() => setCurrentStep(6)}
            isGenerating={isGenerating}
            submitError={aspirationsError}
          />
        )}
      </div>
    </main>
  );
}
