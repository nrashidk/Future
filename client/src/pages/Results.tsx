import { useAuth } from "@/hooks/useAuth";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  GraduationCap, 
  Target, 
  TrendingUp, 
  BookOpen, 
  Download, 
  Share2,
  Star,
  CheckCircle2,
  ArrowRight
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

export default function Results() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get assessmentId from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const urlAssessmentId = urlParams.get("assessmentId");
  const [assessmentId, setAssessmentId] = useState<string | null>(urlAssessmentId);

  const { data: recommendations = [], isLoading } = useQuery<any[]>({
    queryKey: urlAssessmentId ? [`/api/recommendations?assessmentId=${urlAssessmentId}`] : ["/api/recommendations"],
    enabled: true,
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
      return await apiRequest("/api/assessments/migrate", {
        method: "POST",
        body: JSON.stringify({ guestAssessmentIds }),
        headers: { "Content-Type": "application/json" },
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Success!",
        description: data.message,
      });
      localStorage.removeItem("guestAssessments");
    },
  });

  const handleDownloadPDF = () => {
    if (assessmentId) {
      // Use location.href to maintain session cookie for guest users
      window.location.href = `/api/recommendations/pdf/${assessmentId}`;
    }
  };

  const handleSignUp = async () => {
    // Trigger migration after sign-up
    window.location.href = "/api/login";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <div className="text-center">
          <GraduationCap className="w-16 h-16 text-primary mx-auto mb-4 animate-pulse" />
          <p className="text-lg text-muted-foreground">Analyzing your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 pb-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary to-primary/80 text-primary-foreground py-12 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white/20 mb-4">
            <Star className="w-10 h-10" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Your Career Pathways!</h1>
          <p className="text-xl text-primary-foreground/90 font-body">
            Based on your interests, skills, and country's vision, here are your perfect matches
          </p>
        </div>
      </div>

      {/* Recommendations */}
      <div className="max-w-6xl mx-auto px-4 -mt-8">
        <div className="space-y-6">
          {recommendations.map((rec: any, index: number) => (
            <div key={rec.id} className="animate-in fade-in duration-500" style={{ animationDelay: `${index * 100}ms` }}>
              <StickyNote
                color={["yellow", "pink", "blue", "green", "purple"][index % 5] as any}
                rotation={index % 2 === 0 ? "1" : "-1"}
                className="p-8"
              >
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Career Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-2xl font-bold mb-2">{rec.career?.title}</h3>
                        <p className="text-muted-foreground font-body">{rec.career?.description}</p>
                      </div>
                      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full font-bold text-lg ml-4 flex-shrink-0">
                        {Math.round(rec.overallMatchScore)}%
                      </div>
                    </div>

                    {/* Match Breakdown */}
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium font-body">Subject Match</span>
                          <span className="text-sm font-bold">{Math.round(rec.subjectMatchScore)}%</span>
                        </div>
                        <Progress value={rec.subjectMatchScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium font-body">Interest Match</span>
                          <span className="text-sm font-bold">{Math.round(rec.interestMatchScore)}%</span>
                        </div>
                        <Progress value={rec.interestMatchScore} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium font-body flex items-center gap-1">
                            <Target className="w-3 h-3" />
                            Vision Alignment
                          </span>
                          <span className="text-sm font-bold">{Math.round(rec.countryVisionAlignment)}%</span>
                        </div>
                        <Progress value={rec.countryVisionAlignment} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium font-body flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            Market Demand
                          </span>
                          <span className="text-sm font-bold">{Math.round(rec.futureMarketDemand)}%</span>
                        </div>
                        <Progress value={rec.futureMarketDemand} className="h-2" />
                      </div>
                    </div>

                    {/* Why This Career */}
                    <div className="mb-6 p-4 bg-background/30 rounded-lg">
                      <h4 className="font-semibold mb-2 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                        Why This Career?
                      </h4>
                      <p className="text-sm font-body text-foreground/90">{rec.reasoning}</p>
                    </div>

                    {/* Required Skills */}
                    {rec.career?.requiredSkills && rec.career.requiredSkills.length > 0 && (
                      <div className="mb-6">
                        <h4 className="font-semibold mb-2 text-sm">Required Skills</h4>
                        <div className="flex flex-wrap gap-2">
                          {rec.career.requiredSkills.map((skill: string) => (
                            <span
                              key={skill}
                              className="bg-primary/10 px-3 py-1 rounded-full text-xs font-medium font-body"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Education Required */}
                    <div className="mb-6">
                      <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Education Path
                      </h4>
                      <p className="text-sm font-body">{rec.requiredEducation}</p>
                    </div>

                    {/* Action Steps */}
                    {rec.actionSteps && rec.actionSteps.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-3 text-sm flex items-center gap-2">
                          <ArrowRight className="w-4 h-4" />
                          Next Steps
                        </h4>
                        <ul className="space-y-2">
                          {rec.actionSteps.map((step: string, i: number) => (
                            <li key={i} className="flex items-start gap-2 text-sm font-body">
                              <span className="text-primary font-bold">{i + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Salary & Growth */}
                  <div className="md:w-48 space-y-4">
                    <div className="p-4 bg-background/30 rounded-lg text-center">
                      <TrendingUp className="w-6 h-6 mx-auto mb-2 text-primary" />
                      <p className="text-xs text-muted-foreground mb-1 font-body">Growth Outlook</p>
                      <p className="font-bold">{rec.career?.growthOutlook}</p>
                    </div>
                    {rec.career?.averageSalary && (
                      <div className="p-4 bg-background/30 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground mb-1 font-body">Avg. Salary</p>
                        <p className="font-bold text-sm">{rec.career.averageSalary}</p>
                      </div>
                    )}
                  </div>
                </div>
              </StickyNote>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button 
            size="lg" 
            className="rounded-full shadow-lg px-8" 
            data-testid="button-download-report"
            onClick={handleDownloadPDF}
            disabled={!assessmentId}
          >
            <Download className="w-5 h-5 mr-2" />
            Download PDF Report
          </Button>
        </div>

        {!isAuthenticated && (
          <div className="mt-8">
            <StickyNote color="yellow" rotation="1" className="max-w-2xl mx-auto text-center p-6">
              <h4 className="font-bold text-lg mb-2">Save Your Results!</h4>
              <p className="text-sm font-body mb-4 text-muted-foreground">
                Create an account to save your career recommendations and track your progress
              </p>
              <Button
                size="lg"
                onClick={handleSignUp}
                className="rounded-full"
                data-testid="button-signup-results"
              >
                Create Free Account
              </Button>
            </StickyNote>
          </div>
        )}

        {isAuthenticated && (
          <div className="mt-8">
            <StickyNote color="green" rotation="-1" className="max-w-2xl mx-auto text-center p-6">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-primary" />
              <h4 className="font-bold text-lg mb-2">Your Results are Saved!</h4>
              <p className="text-sm font-body text-muted-foreground">
                Come back anytime to review your career recommendations and track your progress
              </p>
            </StickyNote>
          </div>
        )}
      </div>
    </div>
  );
}
