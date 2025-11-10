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
import { CountryStep } from "@/components/assessment/CountryStep";
import { AspirationsStep } from "@/components/assessment/AspirationsStep";
import { QuizStep } from "@/components/assessment/QuizStep";
import { GraduationCap, ArrowLeft, LogIn } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AssessmentData {
  name: string;
  age: number | null;
  grade: string;
  gender: string;
  favoriteSubjects: string[];
  interests: string[];
  personalityTraits: Record<string, number>;
  kolbResponses: Record<string, number>; // Kolb ELT responses (premium users only)
  riasecResponses: Record<string, number>; // RIASEC responses (premium users only)
  countryId: string;
  careerAspirations: string[];
  strengths: string[];
}

export default function Assessment() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGuest, setIsGuest] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  const isPremiumUser = user?.isPremium || false;
  
  // Premium users have 8 steps (includes Kolb + RIASEC), free users have 7 steps
  const totalSteps = isPremiumUser ? 8 : 7;

  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    name: "",
    age: null,
    grade: "",
    gender: "",
    favoriteSubjects: [],
    interests: [],
    personalityTraits: {},
    kolbResponses: {},
    riasecResponses: {},
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

  const updateAssessmentData = (field: string, value: any) => {
    setAssessmentData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = async () => {
    const aspirationsStep = isPremiumUser ? 7 : 6;
    const quizStep = isPremiumUser ? 8 : 7;
    
    if (currentStep < aspirationsStep) {
      // Before aspirations: Just advance to next step
      setCurrentStep((prev) => prev + 1);
    } else if (currentStep === aspirationsStep) {
      // Aspirations step: Save assessment and move to quiz
      try {
        const { apiRequest } = await import("@/lib/queryClient");
        
        // Map frontend fields to backend schema
        const backendData: any = {
          name: assessmentData.name,
          age: assessmentData.age,
          educationLevel: assessmentData.grade,
          favoriteSubjects: assessmentData.favoriteSubjects,
          interests: assessmentData.interests,
          personalityTraits: Object.keys(assessmentData.personalityTraits).filter(
            k => assessmentData.personalityTraits[k]
          ),
          countryId: assessmentData.countryId,
          careerAspirations: assessmentData.careerAspirations || [],
          strengths: assessmentData.strengths || [],
        };
        
        // Include Kolb responses if premium user completed Kolb assessment
        if (isPremiumUser && Object.keys(assessmentData.kolbResponses).length > 0) {
          backendData.kolbResponses = assessmentData.kolbResponses;
        }
        
        // Include RIASEC scores if premium user completed RIASEC assessment
        if (isPremiumUser && assessmentData.riasecResponses) {
          backendData.riasecResponses = assessmentData.riasecResponses;
        }
        
        console.log("Saving assessment before quiz:", backendData);
        
        // Create or update assessment (idempotent)
        let assessment;
        if (assessmentId) {
          // Update existing assessment
          const response = await apiRequest("PATCH", `/api/assessments/${assessmentId}`, backendData);
          assessment = await response.json();
        } else {
          // Create new assessment
          const response = await apiRequest("POST", "/api/assessments", backendData);
          assessment = await response.json();
          
          // Store guest token if needed (for subsequent API calls)
          if (assessment.guestToken && !isAuthenticated) {
            localStorage.setItem("guestToken", assessment.guestToken);
          }
        }
        
        console.log("Assessment saved:", assessment);
        setAssessmentId(assessment.id);
        
        // Move to quiz step (don't generate recommendations yet)
        setCurrentStep(quizStep);
      } catch (error) {
        console.error("Error saving assessment:", error);
        toast({
          title: "Error",
          description: `Failed to save assessment: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive",
        });
      }
    }
  };

  const handleQuizComplete = async () => {
    if (!assessmentId) {
      console.error("No assessmentId for quiz completion");
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
    window.location.href = "/api/login";
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 pb-12">
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
          {currentStep > 1 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              data-testid="button-back"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
        </div>
      </div>

      {/* Progress Tracker */}
      <ProgressTracker currentStep={currentStep} totalSteps={totalSteps} />

      {/* Step Content */}
      <div className="max-w-4xl mx-auto px-4">
        {currentStep === 1 && (
          <DemographicsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
          />
        )}
        {currentStep === 2 && (
          <SubjectsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
          />
        )}
        {currentStep === 3 && (
          <InterestsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
          />
        )}
        {currentStep === 4 && (
          <>
            {isPremiumUser ? (
              <KolbStep
                responses={assessmentData.kolbResponses}
                onUpdate={(responses) => updateAssessmentData("kolbResponses", responses)}
                onNext={handleNext}
                onBack={() => setCurrentStep(3)}
              />
            ) : (
              <PersonalityStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
              />
            )}
          </>
        )}
        {currentStep === 5 && (
          <>
            {isPremiumUser ? (
              <RiasecStep
                onComplete={(scores) => {
                  // Convert RIASEC scores to responses format for backend
                  const responses: Record<string, number> = {};
                  // Store the computed scores directly
                  updateAssessmentData("riasecResponses", scores);
                  handleNext();
                }}
                onBack={() => setCurrentStep(4)}
              />
            ) : (
              <CountryStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
              />
            )}
          </>
        )}
        {currentStep === 6 && (
          <>
            {isPremiumUser ? (
              <CountryStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
              />
            ) : (
              <AspirationsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
              />
            )}
          </>
        )}
        {currentStep === 7 && (
          <>
            {isPremiumUser ? (
              <AspirationsStep
                data={assessmentData}
                onUpdate={updateAssessmentData}
                onNext={handleNext}
              />
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
        {currentStep === 8 && assessmentId && (
          <QuizStep
            assessmentId={assessmentId}
            onComplete={handleQuizComplete}
          />
        )}
        {currentStep === 8 && !assessmentId && (
          <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
            <p className="text-lg text-destructive font-semibold">Error: Assessment not found</p>
            <p className="text-muted-foreground">Please go back and complete the previous steps.</p>
            <Button onClick={() => setCurrentStep(isPremiumUser ? 7 : 6)} data-testid="button-back-to-assessment">
              Go Back
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
