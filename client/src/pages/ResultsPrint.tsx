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
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { isPremiumAssessment } from "@shared/assessmentTier";

// Helper to get display name
function getCountryDisplayName(country: any): string {
  return country?.name || "your country";
}

// Helper to get learning style info
function getLearningStyleInfo(learningStyle: string): {
  icon: any;
  title: string;
  description: string;
  studyTips: string[];
  careerConnection: string;
} {
  const styles: Record<string, any> = {
    "Diverging": {
      icon: Brain,
      title: "Diverging Learner",
      description: "You're creative and imaginative! You love looking at things from different angles and coming up with unique ideas. You enjoy working in groups and learning through discussions.",
      studyTips: [
        "Use mind maps and visual diagrams to organize your thoughts",
        "Study in groups where you can discuss and share ideas",
        "Connect what you're learning to real-world examples you care about",
        "Keep a journal to reflect on what you've learned"
      ],
      careerConnection: "Your creative thinking and people skills make you great for careers in design, counseling, arts, and social work."
    },
    "Assimilating": {
      icon: Lightbulb,
      title: "Assimilating Learner",
      description: "You're a logical thinker who loves understanding how things work! You enjoy reading, researching, and organizing information into clear patterns. You like working independently on challenging problems.",
      studyTips: [
        "Create detailed notes and summaries to organize concepts",
        "Use logic diagrams and flowcharts to see connections",
        "Research topics deeply using books and online resources",
        "Break complex problems into smaller, logical steps"
      ],
      careerConnection: "Your analytical skills and love of research make you perfect for careers in science, technology, research, and engineering."
    },
    "Converging": {
      icon: Wrench,
      title: "Converging Learner",
      description: "You're practical and solution-focused! You love applying what you learn to solve real problems. You enjoy hands-on activities, experiments, and finding the best way to get things done.",
      studyTips: [
        "Practice problems and work through examples yourself",
        "Use simulations and hands-on activities when possible",
        "Focus on practical applications of what you're learning",
        "Set specific goals and track your progress"
      ],
      careerConnection: "Your practical problem-solving makes you excel in careers like engineering, medicine, IT, and business management."
    },
    "Accommodating": {
      icon: Users,
      title: "Accommodating Learner",
      description: "You're action-oriented and love new experiences! You learn best by trying things yourself and aren't afraid to take risks. You enjoy working with others on exciting projects.",
      studyTips: [
        "Get hands-on experience through projects and activities",
        "Work on team challenges that let you try new approaches",
        "Learn from trial and error - mistakes help you grow",
        "Stay flexible and open to changing your plans"
      ],
      careerConnection: "Your adventurous spirit and hands-on approach suit careers in entrepreneurship, sales, performing arts, and emergency services."
    }
  };

  return styles[learningStyle] || styles["Diverging"];
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
  const guestToken = urlParams.get("guestToken");

  const { data: recommendations = [], isLoading } = useQuery<any[]>({
    queryKey: assessmentId 
      ? [`/api/recommendations?assessmentId=${assessmentId}${guestToken ? `&guestToken=${guestToken}` : ''}`] 
      : guestToken 
        ? [`/api/recommendations?guestToken=${guestToken}`]
        : ["/api/recommendations"],
    enabled: true,
  });

  const { data: quizData } = useQuery<any>({
    queryKey: [`/api/assessments/${assessmentId}/quiz`],
    enabled: !!assessmentId,
  });

  const { data: assessment } = useQuery<any>({
    queryKey: guestToken 
      ? [`/api/assessments/${assessmentId}?guestToken=${guestToken}`]
      : [`/api/assessments/${assessmentId}`],
    enabled: !!assessmentId,
  });

  const { data: country } = useQuery<any>({
    queryKey: [`/api/countries/${assessment?.countryId}`],
    enabled: !!assessment?.countryId,
  });

  const { data: cvqResult } = useQuery<any>({
    queryKey: [`/api/cvq/result/${assessmentId}`],
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

  useEffect(() => { document.title = "Career Report | Future Pathways"; }, []);

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
                  <h2 className="text-xl font-bold">Student Profile</h2>
                </div>
                <div className="grid grid-cols-5 gap-3">
                  {displayName && (
                    <div className="p-2 bg-background/30 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">Name</p>
                      <p className="font-semibold text-sm leading-tight">{displayName}</p>
                    </div>
                  )}
                  {displayAge && (
                    <div className="p-2 bg-background/30 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">Age</p>
                      <p className="font-semibold text-sm">{displayAge} years</p>
                    </div>
                  )}
                  {displayGrade && (
                    <div className="p-2 bg-background/30 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">Grade</p>
                      <p className="font-semibold text-sm">Grade {String(displayGrade).replace('grade', '')}</p>
                    </div>
                  )}
                  {displayGender && (
                    <div className="p-2 bg-background/30 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">Gender</p>
                      <p className="font-semibold text-sm capitalize">{displayGender}</p>
                    </div>
                  )}
                  {country && (
                    <div className="p-2 bg-background/30 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground font-body mb-0.5">Country</p>
                      <p className="font-semibold text-sm leading-tight">{country.name}</p>
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

      {/* Page 2: Learning Style Analysis (Individual Assessment Only) */}
      {isPremiumAssessment(assessment?.assessmentType) && assessment?.kolbScores?.learningStyle && (
        <div className="print-page-career">
          <StickyNote color="blue" rotation="0" className="p-8">
            {(() => {
              const styleInfo = getLearningStyleInfo(assessment.kolbScores.learningStyle);
              const Icon = styleInfo.icon;
              
              return (
                <div className="space-y-6">
                  {/* Header */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                      <Icon className="w-8 h-8 text-primary" />
                    </div>
                    <h2 className="text-3xl font-bold mb-2">Your Learning Style</h2>
                    <p className="text-lg font-semibold text-primary mb-1">{styleInfo.title}</p>
                    <p className="text-sm text-muted-foreground font-body">
                      Based on our proprietary assessment methodology
                    </p>
                  </div>

                  {/* Description */}
                  <div className="p-4 bg-background/30 rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Brain className="w-4 h-4" />
                      What This Means
                    </h3>
                    <p className="text-sm font-body">{styleInfo.description}</p>
                  </div>

                  {/* Study Tips */}
                  <div className="p-4 bg-background/30 rounded-lg">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Study Strategies Just for You
                    </h3>
                    <ul className="space-y-2">
                      {styleInfo.studyTips.map((tip, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm font-body">
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Career Connection */}
                  <div className="p-4 bg-background/30 rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      How This Connects to Your Career Matches
                    </h3>
                    <p className="text-sm font-body mb-3">{styleInfo.careerConnection}</p>
                    <p className="text-xs text-muted-foreground font-body flex items-start gap-1">
                      <Star className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>Your learning style contributes 10% to your overall career match scores, ensuring we recommend careers that fit how you naturally learn and work.</span>
                    </p>
                  </div>

                  {/* Learning Style Scores Breakdown (Visual) */}
                  <div className="p-4 bg-background/30 rounded-lg">
                    <h3 className="font-semibold mb-3 text-sm">Your Learning Preferences</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">Concrete Experience</span>
                          <span className="text-xs font-bold">{assessment.kolbScores.CE}</span>
                        </div>
                        <Progress value={(assessment.kolbScores.CE / 48) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">Reflective Observation</span>
                          <span className="text-xs font-bold">{assessment.kolbScores.RO}</span>
                        </div>
                        <Progress value={(assessment.kolbScores.RO / 48) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">Abstract Conceptualization</span>
                          <span className="text-xs font-bold">{assessment.kolbScores.AC}</span>
                        </div>
                        <Progress value={(assessment.kolbScores.AC / 48) * 100} className="h-2" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium">Active Experimentation</span>
                          <span className="text-xs font-bold">{assessment.kolbScores.AE}</span>
                        </div>
                        <Progress value={(assessment.kolbScores.AE / 48) * 100} className="h-2" />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </StickyNote>

          {/* Footer */}
          <div className="mt-4 text-xs text-center text-muted-foreground">
            Generated on {new Date().toLocaleDateString()} | Future Pathways Career Guidance System<br />
            Visit us at futurepath.ae
          </div>
        </div>
      )}

      {/* Page 3: CVQ Values Analysis (Individual Assessment Only) */}
      {cvqResult && isPremiumAssessment(assessment?.assessmentType) && (
        <div className="print-page-career">
          <StickyNote color="purple" rotation="0" className="p-6">
            <div className="space-y-4">
              {/* Header - Compact */}
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
                  <Heart className="w-6 h-6 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-1">What Matters Most to You</h2>
                <p className="text-xs text-muted-foreground font-body">
                  Based on our comprehensive values assessment
                </p>
              </div>

              {/* Top 3 Values & Complete Profile - 2 Column Layout */}
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Top 3 Values */}
                <div className="p-3 bg-background/30 rounded-lg">
                  <h3 className="text-sm font-semibold mb-2">Your Top 3 Core Values</h3>
                  <div className="space-y-2">
                    {(() => {
                      const domainNames: Record<string, { name: string; icon: any; description: string }> = {
                        achievement: { name: "Achievement", icon: Target, description: "Success & competence" },
                        benevolence: { name: "Benevolence", icon: Heart, description: "Caring for others" },
                        universalism: { name: "Universalism", icon: Globe, description: "Fairness & equality" },
                        self_direction: { name: "Self-Direction", icon: Sparkles, description: "Independence & creativity" },
                        security: { name: "Security", icon: Shield, description: "Safety & stability" },
                        power: { name: "Power", icon: Crown, description: "Influence & authority" },
                        hedonism: { name: "Hedonism", icon: Smile, description: "Pleasure & enjoyment" },
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
                                <span className="text-xs font-bold ml-1">{Math.round(score)}%</span>
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
                  <h3 className="text-sm font-semibold mb-2">Complete Values Profile</h3>
                  <div className="space-y-1.5">
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
                          <div key={domain} className="flex items-center gap-1.5">
                            <Icon className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium truncate">{info.name}</span>
                                <span className="text-xs font-bold ml-1">{Math.round(score)}%</span>
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
                      What Your Values Mean
                    </h3>
                    <div className="space-y-1.5 text-xs font-body">
                      {(() => {
                        const scores = cvqResult.normalizedScores as Record<string, number>;
                        const top3 = Object.entries(scores)
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3)
                          .map(([d]) => d);

                        const explanations: Record<string, string> = {
                          achievement: "You're driven by success and recognition.",
                          benevolence: "You care deeply about helping others.",
                          universalism: "You believe in fairness and equality.",
                          self_direction: "You value independence and creativity.",
                          security: "You prioritize safety and stability.",
                          power: "You're motivated by influence.",
                          hedonism: "You value enjoying life.",
                        };

                        return top3.map(domain => (
                          <p key={domain} className="flex items-start gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0 mt-0.5" />
                            <span><strong>{domain.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}:</strong> {explanations[domain]}</span>
                          </p>
                        ));
                      })()}
                    </div>
                  </div>

                  {/* Right: Career Connection */}
                  <div>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" />
                      Career Connection
                    </h3>
                    <p className="text-xs font-body mb-2">
                      Your values are matched against each career's work values using scientific O*NET data.
                    </p>
                    <p className="text-xs text-muted-foreground font-body flex items-start gap-1">
                      <Star className="w-3 h-3 flex-shrink-0 mt-0.5" />
                      <span>Values contribute 20% to career match scores, ensuring recommended careers fulfill what you care about.</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </StickyNote>

          {/* Footer */}
          <div className="mt-2 text-xs text-center text-muted-foreground">
            Generated on {new Date().toLocaleDateString()} | Future Pathways Career Guidance System<br />
            Visit us at futurepath.ae
          </div>
        </div>
      )}

      {/* Personality Profile Fallback (school students without Kolb/CVQ data) */}
      {isPremiumAssessment(assessment?.assessmentType) &&
        !assessment?.kolbScores?.learningStyle &&
        (assessment?.riasecScores?.top3?.length > 0 || assessment?.interests?.length > 0 || assessment?.personalityTraits) && (
        <div className="print-page-career">
          <StickyNote color="green" rotation="0" className="p-6">
            <div className="space-y-5">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-3">
                  <Brain className="w-7 h-7 text-primary" />
                </div>
                <h2 className="text-2xl font-bold mb-1">Your Personality Profile</h2>
                <p className="text-sm text-muted-foreground font-body">
                  Based on your interests and personality assessment
                </p>
              </div>

              {/* RIASEC Top Types */}
              {assessment?.riasecScores?.top3?.length > 0 && (
                <div className="p-4 bg-background/30 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4" />
                    Your Personality Types (Holland Codes)
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    {(() => {
                      const riasecInfo: Record<string, { icon: any; label: string; desc: string }> = {
                        R: { icon: Wrench, label: "Realistic", desc: "Hands-on, practical, enjoys building and fixing things" },
                        I: { icon: Brain, label: "Investigative", desc: "Analytical, curious, loves researching and solving problems" },
                        A: { icon: Sparkles, label: "Artistic", desc: "Creative, imaginative, expressive and original" },
                        S: { icon: Users, label: "Social", desc: "Helpful, empathetic, loves working with and supporting people" },
                        E: { icon: TrendingUp, label: "Enterprising", desc: "Leadership-driven, persuasive, enjoys influencing others" },
                        C: { icon: Target, label: "Conventional", desc: "Organised, detail-oriented, follows clear rules and processes" },
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
                    Your Key Interests
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
                    Your Personality Traits
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
                  <span>Your personality type and interests contribute to your career match scores, ensuring the recommendations below align with how you naturally think and what excites you most.</span>
                </p>
              </div>
            </div>
          </StickyNote>

          <div className="mt-4 text-xs text-center text-muted-foreground">
            Generated on {new Date().toLocaleDateString()} | Future Pathways Career Guidance System<br />
            Visit us at futurepath.ae
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
              {pair.map((rec: any, colIdx: number) => {
                const color = pairColors[pageIdx % pairColors.length][colIdx] as any;
                return (
                  <StickyNote key={rec.id} color={color} rotation="0" className="p-4 flex flex-col gap-3">
                    {/* Career Header */}
                    <div>
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-bold leading-tight mb-1">{rec.career?.title}</h3>
                          <p className="text-xs text-muted-foreground font-body line-clamp-2">{rec.career?.description}</p>
                        </div>
                        <div className="bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-bold text-base flex-shrink-0">
                          {Math.round(rec.overallMatchScore)}%
                        </div>
                      </div>

                      {/* 2×2 Score Breakdown */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { label: "Subject", Icon: BookOpen, value: rec.subjectMatchScore, weight: "30%" },
                          { label: "Interest", Icon: Star, value: rec.interestMatchScore, weight: "30%" },
                          { label: "Vision", Icon: Target, value: rec.countryVisionAlignment, weight: "20%" },
                          { label: "Market", Icon: TrendingUp, value: rec.futureMarketDemand, weight: "20%" },
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
                            <span className="text-[10px] text-muted-foreground">{weight} weight</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Two-column content: Why+WorkStyle | Education+Strengths */}
                    <div className="grid grid-cols-2 gap-2 flex-1">
                      {/* Left: Why this Career? + Work Style Fit */}
                      <div className="flex flex-col gap-2">
                        <div className="p-2 bg-background/30 rounded-lg flex-1">
                          <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                            Why This Career?
                          </h4>
                          <div className="text-xs font-body text-foreground/90 whitespace-pre-line">
                            {(rec as any).premiumReasoning || rec.reasoning}
                          </div>
                        </div>
                        {(rec as any).workStyleFit && (
                          <div className="p-2 bg-background/30 rounded-lg">
                            <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                              Your Work Style Fit
                            </h4>
                            <div className="text-xs font-body text-foreground/90 whitespace-pre-line">
                              {(rec as any).workStyleFit}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: Education Path + Personal Strengths & Growth */}
                      <div className="flex flex-col gap-2">
                        <div className="p-2 bg-background/30 rounded-lg">
                          <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                            <BookOpen className="w-3 h-3 flex-shrink-0" />
                            Education Path
                          </h4>
                          <p className="text-xs font-body">{rec.requiredEducation}</p>
                        </div>
                        {(rec as any).strengthsGrowth && (
                          <div className="p-2 bg-background/30 rounded-lg flex-1">
                            <h4 className="text-xs font-semibold mb-1.5 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                              Personal Strengths & Growth
                            </h4>
                            <div className="text-xs font-body text-foreground/90 whitespace-pre-line">
                              {(rec as any).strengthsGrowth}
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
              Generated on {new Date().toLocaleDateString()} | Future Pathways Career Guidance System<br />
              Visit us at futurepath.ae
            </div>
          </div>
        ));
      })()}
    </div>
  );
}
