import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ProgressTracker } from "@/components/ProgressTracker";
import { Button } from "@/components/ui/button";
import { DemographicsStep } from "@/components/assessment/DemographicsStep";
import { SubjectsStep } from "@/components/assessment/SubjectsStep";
import { InterestsStep } from "@/components/assessment/InterestsStep";
import { PersonalityStep } from "@/components/assessment/PersonalityStep";
import KolbStep from "@/components/KolbStep";
import RiasecStep from "@/components/RiasecStep";
import CVQStep from "@/components/CVQStep";
import { CountryStep } from "@/components/assessment/CountryStep";
import { AspirationsStep } from "@/components/assessment/AspirationsStep";
import { QuizStep } from "@/components/assessment/QuizStep";
import { GraduationCap, LogIn, LogOut, User, ClipboardCheck, Building2, BarChart, Shield, FileQuestion } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  kolbResponses: Record<string, number>; // Kolb ELT responses (premium users only)
  riasecResponses: Record<string, number>; // RIASEC responses (premium users only)
  cvqResponses: Record<string, number>; // CVQ values responses (premium users only)
  countryId: string;
  careerAspirations: string[];
  strengths: string[];
}

export default function Assessment() {
  useEffect(() => { document.title = "Career Assessment | Future Pathways"; }, []);

  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGuest, setIsGuest] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  const isPremiumUser = user?.isPremium || false;
  
  // Premium users have 8 steps, free users have 7 steps
  const totalSteps = isPremiumUser ? 8 : 7;

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
    kolbResponses: {},
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
          backendData.personalityTraits = Object.keys(assessmentData.personalityTraits).filter(
            k => assessmentData.personalityTraits[k]
          );
        }
        
        // Include premium assessment scores if available
        if (isPremiumUser) {
          if (Object.keys(assessmentData.kolbResponses).length > 0) {
            backendData.kolbResponses = assessmentData.kolbResponses;
          }
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

  const handleNext = async () => {
    // Premium: Save after Country (step 3), before Quiz (step 4)
    // Free: Save after Aspirations (step 6), before Quiz (step 7)
    const needsSaveBeforeQuiz = 
      (isPremiumUser && currentStep === 3) || // Premium: Save after Country, before Quiz
      (!isPremiumUser && currentStep === 6);  // Free: Save after Aspirations, before Quiz
    
    const isAspirationsStepPremium = isPremiumUser && currentStep === 8;
    
    if (needsSaveBeforeQuiz || isAspirationsStepPremium) {
      // Save assessment before quiz (for both tiers) or after Aspirations (premium only)
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
          backendData.personalityTraits = Object.keys(assessmentData.personalityTraits).filter(
            k => assessmentData.personalityTraits[k]
          );
        }
        
        // Include Kolb responses if premium user completed Kolb assessment
        if (isPremiumUser && Object.keys(assessmentData.kolbResponses).length > 0) {
          backendData.kolbResponses = assessmentData.kolbResponses;
        }
        
        // Include RIASEC scores if premium user completed RIASEC assessment
        if (isPremiumUser && Object.keys(assessmentData.riasecResponses).length > 0) {
          backendData.riasecResponses = assessmentData.riasecResponses;
        }
        
        // Include CVQ responses if premium user completed CVQ assessment
        if (isPremiumUser && Object.keys(assessmentData.cvqResponses).length > 0) {
          backendData.cvqResponses = assessmentData.cvqResponses;
        }
        
        // Create or update assessment (idempotent)
        let assessment;
        if (assessmentId) {
          // Update existing assessment
          const response = await apiRequest("PATCH", `/api/assessments/${assessmentId}`, backendData);
          assessment = await response.json();
        } else {
          // Create new assessment (guest token is now stored in httpOnly cookie automatically)
          const response = await apiRequest("POST", "/api/assessments", backendData);
          assessment = await response.json();
        }
        
        // Set assessmentId immediately after save
        setAssessmentId(assessment.id);
        
        if (isAspirationsStepPremium) {
          // Premium: After Aspirations, generate recommendations and redirect
          await apiRequest("POST", `/api/recommendations/generate/${assessment.id}`, {});
          setLocation("/results?assessmentId=" + assessment.id);
        } else {
          // Advance to quiz step - React batches state updates so assessmentId will be available
          setCurrentStep((prev) => prev + 1);
        }
      } catch (error) {
        console.error("Error saving assessment:", error);
        toast({
          title: "Error",
          description: `Failed to save assessment: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive",
        });
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
    
    // Premium users: Continue to next step (Kolb at step 5)
    // Free users: Generate recommendations and go to results
    if (isPremiumUser) {
      setCurrentStep(5);
      return;
    }
    
    try {
      const { apiRequest } = await import("@/lib/queryClient");
      
      // Generate recommendations based on assessment + quiz
      await apiRequest("POST", `/api/recommendations/generate/${assessmentId}`, {});
      
      // Navigate to results
      setLocation("/results?assessmentId=" + assessmentId);
    } catch (error) {
      console.error("Error generating recommendations:", error);
      toast({
        title: "Error",
        description: "Failed to generate recommendations. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSaveAndLogin = () => {
    localStorage.setItem("pendingAssessment", JSON.stringify({
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
          <p className="text-lg text-muted-foreground">Loading...</p>
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
                You're in guest mode. Create an account to save your progress!
              </span>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={handleSaveAndLogin}
              data-testid="button-save-login"
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign Up
            </Button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-background border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Future Pathways</h1>
              <p className="text-sm text-muted-foreground font-body">Career Assessment</p>
            </div>
          </div>
          <div className="flex gap-2">
            {user?.accountType === 'superadmin' && (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/superadmin")}
                  data-testid="button-nav-superadmin"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Super Admin
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/admin/organizations")}
                  data-testid="button-nav-admin"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Admin
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/admin")}
                  data-testid="button-nav-questions"
                >
                  <FileQuestion className="w-4 h-4 mr-2" />
                  Quiz
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/analytics")}
                  data-testid="button-nav-analytics"
                >
                  <BarChart className="w-4 h-4 mr-2" />
                  Analytics
                </Button>
              </>
            )}
            {user?.accountType === 'org_admin' && (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/admin/organizations")}
                  data-testid="button-nav-admin"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Admin
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/assessment")}
                  data-testid="button-nav-assessment"
                >
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  Assessment
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/analytics")}
                  data-testid="button-nav-analytics"
                >
                  <BarChart className="w-4 h-4 mr-2" />
                  Analytics
                </Button>
              </>
            )}
            {user?.accountType !== 'superadmin' && user?.accountType !== 'org_admin' && (
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setLocation("/assessment")}
                data-testid="button-nav-assessment"
              >
                <ClipboardCheck className="w-4 h-4 mr-2" />
                Assessment
              </Button>
            )}
            {isAuthenticated && (
              <>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => setLocation("/profile")}
                  data-testid="button-nav-profile"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[44px]"
                  onClick={() => window.location.href = "/api/logout"}
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Progress Tracker */}
      <ProgressTracker currentStep={currentStep} totalSteps={totalSteps} isPremium={isPremiumUser} />

      {/* Step Content */}
      <div
        className="max-w-4xl mx-auto px-4"
        role="region"
        aria-labelledby="assessment-step-heading"
      >
        <h2 id="assessment-step-heading" className="sr-only">
          Step {currentStep} of {totalSteps}
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
                  <p className="text-lg text-destructive font-semibold">Loading quiz...</p>
                  <p className="text-muted-foreground">Please wait while we prepare your assessment.</p>
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
        
        {/* Step 5: Kolb (premium) | Country (free) */}
        {currentStep === 5 && (
          <>
            {isPremiumUser ? (
              <KolbStep
                responses={assessmentData.kolbResponses}
                onUpdate={(responses) => updateAssessmentData("kolbResponses", responses)}
                onNext={handleNext}
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
        
        {/* Step 6: RIASEC (premium) | Aspirations (free) */}
        {currentStep === 6 && (
          <>
            {isPremiumUser ? (
              <RiasecStep
                onComplete={(scores) => {
                  updateAssessmentData("riasecResponses", scores);
                  handleNext();
                }}
                onBack={() => setCurrentStep(5)}
              />
            ) : (
              <AspirationsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
                onBack={() => setCurrentStep(5)}
              />
            )}
          </>
        )}
        
        {/* Step 7: CVQ (premium) | Quiz (free) */}
        {currentStep === 7 && (
          <>
            {isPremiumUser ? (
              assessmentId ? (
                <CVQStep
                  assessmentId={assessmentId}
                  responses={assessmentData.cvqResponses}
                  onUpdate={(responses) => updateAssessmentData("cvqResponses", responses)}
                  onNext={handleNext}
                  onBack={() => setCurrentStep(6)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                  <p className="text-lg text-destructive font-semibold">Error: Assessment not found</p>
                  <p className="text-muted-foreground">Please go back and complete the previous steps.</p>
                  <Button onClick={() => setCurrentStep(6)} data-testid="button-back-to-assessment">
                    Go Back
                  </Button>
                </div>
              )
            ) : (
              assessmentId ? (
                <QuizStep
                  assessmentId={assessmentId}
                  onComplete={handleQuizComplete}
                />
              ) : (
                <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                  <p className="text-lg text-destructive font-semibold">Error: Assessment not found</p>
                  <p className="text-muted-foreground">Please go back and complete the previous steps.</p>
                  <Button onClick={() => setCurrentStep(6)} data-testid="button-back-to-assessment">
                    Go Back
                  </Button>
                </div>
              )
            )}
          </>
        )}
        
        {/* Step 8: Aspirations (premium only - free tier ends at step 7) */}
        {currentStep === 8 && isPremiumUser && (
          <AspirationsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
            onBack={() => setCurrentStep(7)}
          />
        )}
      </div>
    </main>
  );
}
