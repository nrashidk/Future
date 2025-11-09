import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { ProgressTracker } from "@/components/ProgressTracker";
import { Button } from "@/components/ui/button";
import { DemographicsStep } from "@/components/assessment/DemographicsStep";
import { SubjectsStep } from "@/components/assessment/SubjectsStep";
import { InterestsStep } from "@/components/assessment/InterestsStep";
import { PersonalityStep } from "@/components/assessment/PersonalityStep";
import { CountryStep } from "@/components/assessment/CountryStep";
import { AspirationsStep } from "@/components/assessment/AspirationsStep";
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
  countryId: string;
  careerAspirations: string[];
  strengths: string[];
}

const TOTAL_STEPS = 6; // 6 steps total (Demographics, Subjects, Interests, Personality, Country, Aspirations)

export default function Assessment() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [isGuest, setIsGuest] = useState(false);

  const [assessmentData, setAssessmentData] = useState<AssessmentData>({
    name: "",
    age: null,
    grade: "",
    gender: "",
    favoriteSubjects: [],
    interests: [],
    personalityTraits: {},
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

  const updateAssessmentData = (field: string, value: any) => {
    setAssessmentData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = async () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // Save assessment and generate recommendations
      try {
        const { apiRequest } = await import("@/lib/queryClient");
        
        // Map frontend fields to backend schema
        const backendData = {
          name: assessmentData.name,
          age: assessmentData.age,
          educationLevel: assessmentData.grade, // Map grade -> educationLevel
          favoriteSubjects: assessmentData.favoriteSubjects,
          interests: assessmentData.interests,
          personalityTraits: Object.keys(assessmentData.personalityTraits).filter(
            k => assessmentData.personalityTraits[k]
          ), // Convert object to array
          countryId: assessmentData.countryId,
          careerAspirations: assessmentData.careerAspirations || [], // Keep as array
          strengths: assessmentData.strengths || [], // Include strengths field
        };
        
        console.log("Submitting assessment:", backendData);
        
        const response = await apiRequest("POST", "/api/assessments", backendData);
        const assessment = await response.json();
        
        console.log("Assessment created:", assessment);
        
        // Store guest session ID
        if (assessment.guestSessionId && !isAuthenticated) {
          localStorage.setItem("guestSessionId", assessment.guestSessionId);
        }
        
        await apiRequest("POST", `/api/recommendations/generate/${assessment.id}`, {});
        setLocation("/results?assessmentId=" + assessment.id);
      } catch (error) {
        console.error("Error saving assessment:", error, "Data was:", assessmentData);
        toast({
          title: "Error",
          description: `Failed to save assessment: ${error instanceof Error ? error.message : 'Unknown error'}`,
          variant: "destructive",
        });
      }
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
      <ProgressTracker currentStep={currentStep} totalSteps={TOTAL_STEPS} />

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
          <PersonalityStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
          />
        )}
        {currentStep === 5 && (
          <CountryStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
          />
        )}
        {currentStep === 6 && (
          <AspirationsStep
            data={assessmentData}
            onUpdate={updateAssessmentData}
            onNext={handleNext}
          />
        )}
      </div>
    </div>
  );
}
