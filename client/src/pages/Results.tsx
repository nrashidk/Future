import { useAuth } from "@/hooks/useAuth";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MasonryGrid, MasonryItem } from "@/components/MasonryGrid";
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
  DollarSign
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";

// Helper to get display name
function getCountryDisplayName(country: any): string {
  return country?.name || "your country";
}

// Helper to map subjects to vision sectors using actual country vision data
function mapSubjectsToVisionSectors(
  subjectScores: Record<string, { percentage: number }>,
  country: any
): string | null {
  if (!subjectScores || !country?.visionPlan) return null;

  // Get top 2 subjects
  const topSubjects = Object.entries(subjectScores)
    .sort(([, a], [, b]) => b.percentage - a.percentage)
    .slice(0, 2)
    .map(([subject]) => subject);

  if (topSubjects.length === 0) return null;

  // Extract actual vision categories from country data
  const visionCategories = Object.keys(country.visionPlan);
  
  // Map subjects to vision category keywords
  const subjectKeywords: Record<string, string[]> = {
    Mathematics: ["technology", "innovation", "economic", "industry"],
    "Computer Science": ["technology", "innovation", "digital"],
    Science: ["climate", "environment", "technology", "innovation", "energy"],
    "Social Studies": ["social", "progress", "economic", "development"],
    Arabic: ["social", "progress", "cultural"],
    English: ["economic", "development", "global"],
  };

  // Find matching vision categories for top subjects
  const matchedCategories = new Set<string>();
  topSubjects.forEach((subject) => {
    const keywords = subjectKeywords[subject] || [];
    visionCategories.forEach((category) => {
      const categoryLower = category.toLowerCase();
      if (keywords.some(keyword => categoryLower.includes(keyword))) {
        matchedCategories.add(category);
      }
    });
  });

  if (matchedCategories.size === 0) return null;

  // Build message with actual country vision categories
  const subjectsText = topSubjects.join(" and ");
  const categoriesArray = Array.from(matchedCategories).slice(0, 2); // Limit to 2 categories
  const categoriesText = categoriesArray.length === 1
    ? categoriesArray[0]
    : categoriesArray[0] + " and " + categoriesArray[1];

  return `Your top strengths in ${subjectsText} directly align with ${getCountryDisplayName(country)}'s ${categoriesText} priorities in their national vision.`;
}

export default function Results() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Get assessmentId from URL query params
  const urlParams = new URLSearchParams(window.location.search);
  const urlAssessmentId = urlParams.get("assessmentId");
  const [assessmentId, setAssessmentId] = useState<string | null>(urlAssessmentId);

  // Get guest token for non-authenticated users
  const guestToken = !isAuthenticated ? localStorage.getItem("guestSessionId") : null;
  
  const { data: recommendations = [], isLoading } = useQuery<any[]>({
    queryKey: urlAssessmentId 
      ? [`/api/recommendations?assessmentId=${urlAssessmentId}${guestToken ? `&guestToken=${guestToken}` : ''}`]
      : guestToken 
        ? [`/api/recommendations?guestToken=${guestToken}`]
        : ["/api/recommendations"],
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
    enabled: !!activeAssessmentId && assessment?.assessmentType === 'kolb',
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
        title: "Success!",
        description: data.message,
      });
      localStorage.removeItem("guestAssessments");
    },
  });

  const handleDownloadPDF = () => {
    if (assessmentId) {
      try {
        // Use anchor tag approach to prevent navigation and state update issues
        const link = document.createElement('a');
        link.href = `/api/recommendations/pdf/${assessmentId}`;
        link.download = `career-report-${assessmentId}.pdf`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast({
          title: "Download Started",
          description: "Your career report is being downloaded.",
        });
      } catch (error) {
        console.error("PDF download error:", error);
        // Fallback to window.location
        window.location.href = `/api/recommendations/pdf/${assessmentId}`;
      }
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

      {/* Subject Competency Spotlight */}
      {quizData?.completed && quizData?.subjectScores && Object.keys(quizData.subjectScores).length > 0 && (
        <div className="max-w-4xl mx-auto px-4 -mt-8 mb-8">
          <StickyNote color="purple" rotation="1" className="p-8">
            <div className="text-center mb-6">
              <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-3xl font-bold mb-2">Your Subject Strengths</h2>
              <p className="text-muted-foreground font-body">
                We tested your skills in your favorite subjects to validate your career matches
              </p>
            </div>

            {/* Overall Competency */}
            <div className="mb-6 text-center">
              <div className="inline-block">
                <div className="text-6xl font-bold text-primary mb-2" data-testid="text-overall-competency">
                  {quizData.totalScore}%
                </div>
                <div className="text-sm font-semibold" data-testid="text-competency-level">
                  {quizData.totalScore >= 80 ? "Excellent Mastery" : 
                   quizData.totalScore >= 60 ? "Strong Understanding" :
                   quizData.totalScore >= 40 ? "Good Foundation" : 
                   "Room to Grow"}
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
                      {score.correct} of {score.total} correct
                    </p>
                  </div>
              ))}
            </div>

            {/* Insights */}
            <div className="space-y-2 text-sm" data-testid="section-competency-insights">
              {quizData.totalScore >= 70 ? (
                <div className="flex items-start gap-2" data-testid="insight-strong-competency">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body">Your strong subject performance validates your favorite subjects align with your actual skills!</p>
                </div>
              ) : quizData.totalScore >= 50 ? (
                <div className="flex items-start gap-2" data-testid="insight-moderate-competency">
                  <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body">You have a good foundation. The recommendations below focus on careers that match your strongest subjects.</p>
                </div>
              ) : (
                <div className="flex items-start gap-2" data-testid="insight-growth-competency">
                  <Star className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <p className="font-body">Don't worry! The recommendations highlight careers where you can build on your interests while developing your skills.</p>
                </div>
              )}
              <div className="flex items-start gap-2" data-testid="insight-competency-validation">
                <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                <p className="font-body">Your career recommendations below consider both your interests AND demonstrated competencies to ensure the best matches.</p>
              </div>
              {country && (() => {
                const visionLinkage = mapSubjectsToVisionSectors(quizData.subjectScores, country);
                return visionLinkage ? (
                  <div className="flex items-start gap-2" data-testid="insight-vision-linkage">
                    <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="font-body">
                      <strong>Connecting to National Vision:</strong> {visionLinkage} The careers recommended below leverage your proven strengths to contribute to these priorities.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2" data-testid="insight-vision-linkage-generic">
                    <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <p className="font-body">
                      <strong>Connecting to National Vision:</strong> Each recommendation shows how your subject strengths enable you to contribute to national development priorities and future goals.
                    </p>
                  </div>
                );
              })()}
            </div>
          </StickyNote>
        </div>
      )}

      {/* Learning Style Insights (Premium Users Only) */}
      {assessment?.assessmentType === 'kolb' && assessment?.kolbScores && (
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <StickyNote color="blue" rotation="-1" className="p-8">
            <div className="text-center mb-6">
              <GraduationCap className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-3xl font-bold mb-2">Your Learning Style</h2>
              <p className="text-muted-foreground font-body">
                Based on our proprietary assessment methodology
              </p>
            </div>

            {/* Learning Style Badge */}
            <div className="mb-6 text-center">
              <div className="inline-block bg-primary/10 px-6 py-3 rounded-full">
                <span className="text-2xl font-bold text-primary" data-testid="text-learning-style">
                  {(assessment.kolbScores as any).learningStyle}
                </span>
              </div>
            </div>

            {/* Learning Style Description */}
            <div className="mb-6 p-4 bg-background/30 rounded-lg">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Star className="w-4 h-4 text-primary" />
                What This Means
              </h4>
              <p className="text-sm font-body mb-4" data-testid="text-style-description">
                {(assessment.kolbScores as any).learningStyle === 'Diverging' && 
                  "You excel at viewing situations from many perspectives and prefer to watch and observe rather than take action. You have strong imagination and are excellent at brainstorming. You prefer to work in groups, listening with an open mind, and receiving personalized feedback."}
                {(assessment.kolbScores as any).learningStyle === 'Assimilating' && 
                  "You prefer a concise, logical approach and excel at understanding a wide range of information. You're great at organizing information into clear, logical formats and prefer reading, lectures, and exploring analytical models. You value precision and logical soundness."}
                {(assessment.kolbScores as any).learningStyle === 'Converging' && 
                  "You're excellent at finding practical uses for ideas and theories. You prefer technical tasks and solving problems through experimentation. You excel at simulations, laboratory work, and practical applications, and you like working independently on technical problems."}
                {(assessment.kolbScores as any).learningStyle === 'Accommodating' && 
                  "You prefer hands-on, practical experiences and rely on intuition rather than logic. You're adaptable, excel at carrying out plans, and enjoy new challenges. You prefer field work, testing out different approaches, and working in teams to complete tasks."}
              </p>
            </div>

            {/* Study Tips */}
            <div className="mb-6 p-4 bg-background/30 rounded-lg">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                Study Tips for You
              </h4>
              <ul className="space-y-2 text-sm font-body" data-testid="list-study-tips">
                {(assessment.kolbScores as any).learningStyle === 'Diverging' && (<>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Brainstorm ideas before starting assignments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Join study groups to discuss different viewpoints</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Use mind maps and visual organizers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Reflect on lessons by journaling or discussing with peers</span>
                  </li>
                </>)}
                {(assessment.kolbScores as any).learningStyle === 'Assimilating' && (<>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Create detailed notes and outlines from lectures</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Read textbooks and research papers thoroughly</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Build theoretical models to understand concepts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Work independently to analyze and organize information</span>
                  </li>
                </>)}
                {(assessment.kolbScores as any).learningStyle === 'Converging' && (<>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Focus on practical applications of theories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Use simulations and lab experiments to learn</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Practice problem-solving with real-world scenarios</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Work on projects that have clear goals and outcomes</span>
                  </li>
                </>)}
                {(assessment.kolbScores as any).learningStyle === 'Accommodating' && (<>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Engage in hands-on projects and field work</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Try different approaches until you find what works</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Work in teams on practical challenges</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                    <span>Learn by doing rather than just reading or listening</span>
                  </li>
                </>)}
              </ul>
            </div>

            {/* Career Connection */}
            <div className="p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
              <div className="flex items-start gap-2">
                <Target className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-2 text-primary">How This Affects Your Career Matches (10% Weight)</h4>
                  <p className="text-sm font-body" data-testid="text-career-connection">
                    {(assessment.kolbScores as any).learningStyle === 'Diverging' && 
                      "Your reflective and imaginative approach makes you well-suited for careers in creative fields, counseling, and roles that require understanding diverse perspectives. Your learning style contributes 10% to each career match score, favoring careers that align with your preferred way of learning."}
                    {(assessment.kolbScores as any).learningStyle === 'Assimilating' && 
                      "Your analytical and theoretical thinking makes you well-suited for careers in research, science, and roles that require systematic planning. Your learning style contributes 10% to each career match score, favoring careers that align with your preferred way of learning."}
                    {(assessment.kolbScores as any).learningStyle === 'Converging' && 
                      "Your practical problem-solving skills make you well-suited for careers in engineering, technology, and roles that require technical expertise. Your learning style contributes 10% to each career match score, favoring careers that align with your preferred way of learning."}
                    {(assessment.kolbScores as any).learningStyle === 'Accommodating' && 
                      "Your hands-on and adaptive approach makes you well-suited for careers in business, sales, and roles that require flexibility and action. Your learning style contributes 10% to each career match score, favoring careers that align with your preferred way of learning."}
                  </p>
                </div>
              </div>
            </div>
          </StickyNote>
        </div>
      )}

      {/* CVQ Values Insights (Premium Users Only) */}
      {cvqResult && assessment?.assessmentType === 'kolb' && (
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <StickyNote color="purple" rotation="1" className="p-8">
            <div className="text-center mb-6">
              <Heart className="w-12 h-12 text-primary mx-auto mb-3" />
              <h2 className="text-3xl font-bold mb-2">What Matters Most to You</h2>
              <p className="text-muted-foreground font-body">
                Based on the Children's Values Questionnaire (CVQ)
              </p>
            </div>

            {/* Top 3 Values */}
            <div className="mb-6">
              <h3 className="font-semibold mb-4 text-center">Your Top 3 Core Values</h3>
              <div className="grid md:grid-cols-3 gap-4">
                {(() => {
                  const domainNames: Record<string, { name: string; icon: any; description: string }> = {
                    achievement: { name: "Achievement", icon: Target, description: "Success and competence" },
                    benevolence: { name: "Benevolence", icon: Heart, description: "Caring for others" },
                    universalism: { name: "Universalism", icon: Globe, description: "Fairness and equality" },
                    self_direction: { name: "Self-Direction", icon: Sparkles, description: "Independence and creativity" },
                    security: { name: "Security", icon: Shield, description: "Safety and stability" },
                    power: { name: "Power", icon: Crown, description: "Influence and authority" },
                    hedonism: { name: "Hedonism", icon: Smile, description: "Pleasure and enjoyment" },
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
                Your Complete Values Profile
              </h4>
              <div className="space-y-3">
                {(() => {
                  const domainNames: Record<string, { name: string; icon: any }> = {
                    achievement: { name: "Achievement", icon: Target },
                    benevolence: { name: "Benevolence", icon: Heart },
                    universalism: { name: "Universalism", icon: Globe },
                    self_direction: { name: "Self-Direction", icon: Sparkles },
                    security: { name: "Security", icon: Shield },
                    power: { name: "Power", icon: Crown },
                    hedonism: { name: "Hedonism", icon: Smile },
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
                What Your Values Mean
              </h4>
              <div className="space-y-3 text-sm font-body">
                {(() => {
                  const scores = cvqResult.normalizedScores as Record<string, number>;
                  const top3 = Object.entries(scores)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([d]) => d);

                  const explanations: Record<string, string> = {
                    achievement: "You're driven by success and recognition. You want to demonstrate competence and be admired for your accomplishments.",
                    benevolence: "You deeply care about others' well-being. Helping people and maintaining harmonious relationships is important to you.",
                    universalism: "You believe in fairness and equality for all. Social justice and understanding diverse perspectives matter greatly to you.",
                    self_direction: "You value independence and creativity. You prefer thinking for yourself and exploring new ideas in your own unique way.",
                    security: "You prioritize safety and stability. A secure environment and predictable outcomes make you feel comfortable.",
                    power: "You're motivated by influence and authority. Having control over resources and decisions is important to you.",
                    hedonism: "You value pleasure and enjoying life. Having fun and experiencing gratification matters to you.",
                  };

                  return top3.map(domain => (
                    <p key={domain} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <span><strong>{domain.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}:</strong> {explanations[domain]}</span>
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
                  <h4 className="font-semibold mb-2 text-primary">How Your Values Shape Your Career Matches (20% Weight)</h4>
                  <p className="text-sm font-body">
                    Your values profile is matched against each career's work values using scientific O*NET data. 
                    Careers that align with what matters most to you receive higher match scores. This ensures 
                    you're not just skilled for a career, but that it fulfills what you truly care about.
                  </p>
                </div>
              </div>
            </div>
          </StickyNote>
        </div>
      )}

      {/* Upgrade Prompt (Free Users Only) */}
      {assessment?.assessmentType !== 'kolb' && (
        <div className="max-w-4xl mx-auto px-4 mb-8">
          <StickyNote color="purple" rotation="1" className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <Star className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Want Even Better Career Matches?</h2>
              <p className="text-muted-foreground font-body">
                Unlock our advanced Individual Assessment for deeper insights
              </p>
            </div>

            {/* Features Grid */}
            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Discover Your Learning Style</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      Take our scientifically-validated 24-question assessment to understand how you learn best
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Personalized Study Tips</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      Get customized study strategies that match your unique learning preferences
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Enhanced Career Matching</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      Your learning style adds 10% to career match scores, ensuring better alignment
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="p-4 bg-background/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Detailed PDF Report</h4>
                    <p className="text-sm text-muted-foreground font-body">
                      Comprehensive report including your learning style insights and study strategies
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing & CTA */}
            <div className="bg-primary/10 rounded-lg p-6 text-center border-2 border-primary/20">
              <div className="mb-4">
                <div className="text-4xl font-bold text-primary mb-1">$10</div>
                <div className="text-sm text-muted-foreground">per student</div>
                <div className="text-xs text-muted-foreground mt-1">
                  School bulk discounts available
                </div>
              </div>
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-lg px-8"
                onClick={() => setLocation('/tier-selection')}
                data-testid="button-upgrade-premium"
              >
                <Star className="w-5 h-5 mr-2" />
                Unlock Premium Assessment
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          </StickyNote>
        </div>
      )}

      {/* Recommendations */}
      <div className="max-w-7xl mx-auto px-4 -mt-8">
        <MasonryGrid>
          {recommendations.map((rec: any, index: number) => (
            <MasonryItem key={rec.id} className="animate-in fade-in duration-500" style={{ animationDelay: `${index * 100}ms` }}>
              <StickyNote
                color={["yellow", "pink", "blue", "green", "purple"][index % 5] as any}
                rotation={index % 2 === 0 ? "1" : "-1"}
                className="p-6 lg:p-8"
              >
                {/* Header: Title and Match Score */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold mb-1">{rec.career?.title}</h3>
                    <p className="text-muted-foreground font-body text-sm">{rec.career?.description}</p>
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
                        Subject Match
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.subjectMatchScore)}%</span>
                    </div>
                    <Progress value={rec.subjectMatchScore} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">30% weight</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Star className="w-4 h-4" />
                        Interest Match
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.interestMatchScore)}%</span>
                    </div>
                    <Progress value={rec.interestMatchScore} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">30% weight</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Target className="w-4 h-4" />
                        Vision Alignment
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.countryVisionAlignment)}%</span>
                    </div>
                    <Progress value={rec.countryVisionAlignment} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">20% weight</p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <TrendingUp className="w-4 h-4" />
                        Market Demand
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.futureMarketDemand)}%</span>
                    </div>
                    <Progress value={rec.futureMarketDemand} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">20% weight</p>
                  </div>
                </div>

                {/* Salary & Growth Info */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 bg-background/30 rounded-lg text-center">
                    <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
                    <p className="text-xs text-muted-foreground mb-1">Growth Outlook</p>
                    <p className="font-bold text-sm">{rec.career?.growthOutlook}</p>
                  </div>
                  {rec.career?.averageSalary && (
                    <div className="p-3 bg-background/30 rounded-lg text-center">
                      <DollarSign className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground mb-1">Average Salary</p>
                      <p className="font-bold text-sm">Typical {rec.career.averageSalary}</p>
                    </div>
                  )}
                </div>

                {/* Validated Competencies & Vision Priorities */}
                {(rec.matchedSubjects?.length > 0 || rec.supportingVisionPriorities?.length > 0) && (
                  <div className="p-3 bg-background/30 rounded-lg space-y-2 mb-4">
                        {rec.matchedSubjects?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">✓ Validated by Your Competencies</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {rec.matchedSubjects.map((item: any) => (
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
                        {rec.supportingVisionPriorities?.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">🎯 Supports National Vision</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {rec.supportingVisionPriorities.map((priority: string, idx: number) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 bg-accent/20 px-2 py-0.5 rounded-full text-xs font-medium"
                                  data-testid={`badge-vision-${idx}`}
                                >
                                  <Target className="w-3 h-3" />
                                  {priority}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                {/* Required Skills */}
                {rec.career?.requiredSkills && rec.career.requiredSkills.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-semibold mb-2 text-sm">Required Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {rec.career.requiredSkills.map((skill: string) => (
                        <span
                          key={skill}
                          className="bg-primary/10 px-3 py-1 rounded-full text-sm font-medium"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Why This Career */}
                <div className="p-3 bg-background/30 rounded-lg mb-3">
                  <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Why This Career?
                  </h4>
                  <p className="text-sm font-body text-foreground/90">{rec.reasoning}</p>
                </div>

                {/* Education Required */}
                <div className="p-3 bg-background/30 rounded-lg mb-3">
                  <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Education Path
                  </h4>
                  <p className="text-sm font-body">{rec.requiredEducation}</p>
                </div>

                {/* Action Steps */}
                {rec.actionSteps && rec.actionSteps.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
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
