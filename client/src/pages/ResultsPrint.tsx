import { StickyNote } from "@/components/StickyNote";
import { Progress } from "@/components/ui/progress";
import { 
  GraduationCap, 
  Target, 
  TrendingUp, 
  BookOpen, 
  Star,
  CheckCircle2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

// Helper to get display name
function getCountryDisplayName(country: any): string {
  return country?.name || "your country";
}

// Helper to map subjects to vision sectors
function mapSubjectsToVisionSectors(
  subjectScores: Record<string, { percentage: number }>,
  country: any
): string | null {
  if (!subjectScores || !country?.visionPlan) return null;

  const topSubjects = Object.entries(subjectScores)
    .sort(([, a], [, b]) => b.percentage - a.percentage)
    .slice(0, 2)
    .map(([subject]) => subject);

  if (topSubjects.length === 0) return null;

  const visionCategories = Object.keys(country.visionPlan);
  
  const subjectKeywords: Record<string, string[]> = {
    Mathematics: ["technology", "innovation", "economic", "industry"],
    "Computer Science": ["technology", "innovation", "digital"],
    Science: ["climate", "environment", "technology", "innovation", "energy"],
    "Social Studies": ["social", "progress", "economic", "development"],
    Arabic: ["social", "progress", "cultural"],
    English: ["economic", "development", "global"],
  };

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

  const subjectsText = topSubjects.join(" and ");
  const categoriesArray = Array.from(matchedCategories).slice(0, 2);
  const categoriesText = categoriesArray.length === 1
    ? categoriesArray[0]
    : categoriesArray[0] + " and " + categoriesArray[1];

  return `Your top strengths in ${subjectsText} directly align with ${getCountryDisplayName(country)}'s ${categoriesText} priorities in their national vision.`;
}

export default function ResultsPrint() {
  const urlParams = new URLSearchParams(window.location.search);
  const assessmentId = urlParams.get("assessmentId");

  const { data: recommendations = [], isLoading } = useQuery<any[]>({
    queryKey: assessmentId ? [`/api/recommendations?assessmentId=${assessmentId}`] : ["/api/recommendations"],
    enabled: true,
  });

  const { data: quizData } = useQuery<any>({
    queryKey: [`/api/assessments/${assessmentId}/quiz`],
    enabled: !!assessmentId,
  });

  const { data: assessment } = useQuery<any>({
    queryKey: [`/api/assessments/${assessmentId}`],
    enabled: !!assessmentId,
  });

  const { data: country } = useQuery<any>({
    queryKey: [`/api/countries/${assessment?.countryId}`],
    enabled: !!assessment?.countryId,
  });

  // Signal when data is ready for PDF capture
  useEffect(() => {
    if (!isLoading && recommendations.length > 0) {
      (window as any).__REPORT_READY__ = true;
    }
  }, [isLoading, recommendations]);

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
            page-break-after: always;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: flex-start;
            padding: 2rem;
          }
          
          .no-print {
            display: none !important;
          }
        }
        
        .print-container {
          background: white;
        }
      `}</style>

      {/* Page 1: Hero + Subject Competency */}
      <div className="print-page-1">
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
            <StickyNote color="purple" rotation="0" className="p-8">
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
                  <div className="text-6xl font-bold text-primary mb-2">
                    {quizData.totalScore}%
                  </div>
                  <div className="text-sm font-semibold">
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
                    <div key={subject} className="p-4 bg-background/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold font-body">{subject}</span>
                        <span className="text-lg font-bold text-primary">
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
              <div className="space-y-2 text-sm">
                {quizData.totalScore >= 70 ? (
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body">Your strong subject performance validates your favorite subjects align with your actual skills!</p>
                  </div>
                ) : quizData.totalScore >= 50 ? (
                  <div className="flex items-start gap-2">
                    <BookOpen className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body">You have a good foundation. The recommendations below focus on careers that match your strongest subjects.</p>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Star className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="font-body">Don't worry! The recommendations highlight careers where you can build on your interests while developing your skills.</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Target className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <p className="font-body">Your career recommendations below consider both your interests AND demonstrated competencies to ensure the best matches.</p>
                </div>
                {country && (() => {
                  const visionLinkage = mapSubjectsToVisionSectors(quizData.subjectScores, country);
                  return visionLinkage ? (
                    <div className="flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                      <p className="font-body">
                        <strong>Connecting to National Vision:</strong> {visionLinkage} The careers recommended below leverage your proven strengths to contribute to these priorities.
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
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
      </div>

      {/* Subsequent Pages: One Career Per Page */}
      {recommendations.map((rec: any, index: number) => (
        <div key={rec.id} className="print-page-career">
          <StickyNote
            color={["yellow", "pink", "blue", "green", "purple"][index % 5] as any}
            rotation="0"
            className="p-8 h-full"
          >
            <div className="flex flex-col gap-6">
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
                      <span className="text-sm font-medium font-body flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        Subject Match
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.subjectMatchScore)}%</span>
                    </div>
                    <Progress value={rec.subjectMatchScore} className="h-2" />
                    <span className="text-xs text-muted-foreground">30% weight • Validated by quiz</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium font-body flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        Interest Match
                      </span>
                      <span className="text-sm font-bold">{Math.round(rec.interestMatchScore)}%</span>
                    </div>
                    <Progress value={rec.interestMatchScore} className="h-2" />
                    <span className="text-xs text-muted-foreground">30% weight</span>
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
                    <span className="text-xs text-muted-foreground">20% weight</span>
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
                    <span className="text-xs text-muted-foreground">20% weight</span>
                  </div>
                </div>

                {/* Validated Competencies & Vision Priorities */}
                {(rec.matchedSubjects?.length > 0 || rec.supportingVisionPriorities?.length > 0) && (
                  <div className="mb-6 p-4 bg-background/30 rounded-lg space-y-3">
                    {rec.matchedSubjects?.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2">✓ Validated by Your Competencies</h4>
                        <div className="flex flex-wrap gap-2">
                          {rec.matchedSubjects.map((item: any) => (
                            <span
                              key={item.subject}
                              className="inline-flex items-center gap-1 bg-primary/10 px-3 py-1 rounded-full text-xs font-medium"
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
                        <h4 className="text-xs font-semibold text-muted-foreground mb-2">🎯 Supports National Vision</h4>
                        <div className="flex flex-wrap gap-2">
                          {rec.supportingVisionPriorities.map((priority: string, idx: number) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 bg-accent/20 px-3 py-1 rounded-full text-xs font-medium"
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

                {/* Why This Career */}
                <div className="mb-6 p-4 bg-background/30 rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Why This Career?
                  </h4>
                  <p className="text-sm font-body text-foreground/90">{rec.reasoning}</p>
                </div>

                {/* Education Required */}
                <div className="mb-6">
                  <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Education Path
                  </h4>
                  <p className="text-sm font-body">{rec.requiredEducation}</p>
                </div>

                {/* Next Steps */}
                {rec.actionSteps && rec.actionSteps.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2 text-sm">Next Steps</h4>
                    <ul className="space-y-2 text-sm font-body">
                      {rec.actionSteps.slice(0, 3).map((step: string, idx: number) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-primary font-bold">{idx + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </StickyNote>

          {/* Footer */}
          <div className="mt-4 text-xs text-center text-muted-foreground">
            Generated on {new Date().toLocaleDateString()} | Future Pathways Career Guidance System
          </div>
        </div>
      ))}
    </div>
  );
}
