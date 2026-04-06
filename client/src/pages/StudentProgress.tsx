import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, TrendingUp, Target, Brain, Heart, ArrowLeft, Calendar, Award, ChevronRight } from "lucide-react";
import { StickyNote } from "@/components/StickyNote";

interface CareerEvolutionData {
  grade: string;
  completedAt: string | null;
  topCareers: Array<{ careerId: string; careerName: string; matchScore: number }>;
  kolbScores: any;
  riasecScores: any;
  interests: string[];
}

interface CareerTrajectory {
  careerId: string;
  careerName: string;
  gradesAppeared: string[];
  persistenceScore: number;
  avgMatchScore: number;
}

interface CareerEvolutionResponse {
  success: boolean;
  totalGrades: number;
  trajectory: CareerTrajectory[];
  gradeDetails: CareerEvolutionData[];
}

export default function StudentProgress() {
  useEffect(() => { document.title = "My Career Journey | Future Pathways"; }, []);
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();

  const { data: evolution, isLoading } = useQuery<CareerEvolutionResponse>({
    queryKey: ['/api/students/me/career-evolution'],
    enabled: !!user,
  });

  if (isAuthLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading your progress...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  const hasData = evolution?.gradeDetails && evolution.gradeDetails.length > 0;
  const grades = ['9', '10', '11', '12'];

  const getGradeLabel = (grade: string) => {
    const num = grade.replace(/\D/g, '');
    return `Grade ${num}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not completed';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    });
  };

  const getGradeData = (grade: string) => {
    return evolution?.gradeDetails?.find(d => d.grade.includes(grade));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover-elevate rounded-lg px-3 py-2" data-testid="link-home">
            <GraduationCap className="w-6 h-6 text-primary" />
            <span className="font-bold text-lg">Future Pathways</span>
          </Link>
          <Button variant="outline" asChild data-testid="button-back-profile">
            <Link href="/profile">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Profile
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Your Career Journey</h1>
          <p className="text-muted-foreground">Track how your career interests evolve across grades</p>
        </div>

        {!hasData ? (
          <Card className="text-center py-12">
            <CardContent>
              <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">No Progress Yet</h2>
              <p className="text-muted-foreground mb-6">
                Complete your first assessment to start tracking your career journey.
              </p>
              <Button asChild data-testid="button-start-assessment">
                <Link href="/assessment">Start Assessment</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {evolution?.trajectory && evolution.trajectory.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Career Consistency
                  </CardTitle>
                  <CardDescription>Careers that appear consistently across your assessments</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {evolution.trajectory.slice(0, 6).map((career, index) => (
                      <div 
                        key={career.careerId} 
                        className="p-4 rounded-lg border bg-card"
                        data-testid={`card-career-trajectory-${index}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold">{career.careerName}</h3>
                          <Badge variant={career.persistenceScore >= 0.75 ? "default" : "secondary"}>
                            {Math.round(career.persistenceScore * 100)}%
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Appeared in: {career.gradesAppeared.map(g => `Grade ${g.replace(/\D/g, '')}`).join(', ')}
                        </p>
                        <div className="flex items-center gap-2 text-sm">
                          <Award className="w-4 h-4 text-primary" />
                          <span>Avg Match: {Math.round(career.avgMatchScore)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Grade-by-Grade Journey
                </CardTitle>
                <CardDescription>Your assessment history and top career matches by grade</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-8">
                    {grades.map((grade, index) => {
                      const gradeData = getGradeData(grade);
                      const isCompleted = !!gradeData;
                      
                      return (
                        <div key={grade} className="relative pl-16" data-testid={`timeline-grade-${grade}`}>
                          <div className={`absolute left-4 w-5 h-5 rounded-full border-2 ${
                            isCompleted 
                              ? 'bg-primary border-primary' 
                              : 'bg-background border-muted-foreground'
                          }`}>
                            {isCompleted && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-background" />
                              </div>
                            )}
                          </div>
                          
                          <StickyNote 
                            color={isCompleted ? 'yellow' : 'blue'} 
                            className={`${!isCompleted ? 'opacity-50' : ''}`}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h3 className="font-bold text-lg">{getGradeLabel(grade)}</h3>
                              {isCompleted ? (
                                <Badge variant="outline" className="text-xs">
                                  {formatDate(gradeData.completedAt)}
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">Pending</Badge>
                              )}
                            </div>
                            
                            {isCompleted && gradeData.topCareers.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground font-medium">Top Career Matches:</p>
                                <div className="space-y-2">
                                  {gradeData.topCareers.slice(0, 3).map((career, cIndex) => (
                                    <div 
                                      key={career.careerId}
                                      className="flex items-center justify-between p-2 rounded-md bg-background/50"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-muted-foreground">
                                          #{cIndex + 1}
                                        </span>
                                        <span className="font-medium">{career.careerName}</span>
                                      </div>
                                      <Badge variant="secondary">{Math.round(career.matchScore)}%</Badge>
                                    </div>
                                  ))}
                                </div>
                                
                                {gradeData.interests && gradeData.interests.length > 0 && (
                                  <div className="mt-4">
                                    <p className="text-sm text-muted-foreground font-medium mb-2">Interests:</p>
                                    <div className="flex flex-wrap gap-1">
                                      {gradeData.interests.slice(0, 5).map((interest, iIndex) => (
                                        <Badge key={iIndex} variant="outline" className="text-xs">
                                          {interest}
                                        </Badge>
                                      ))}
                                      {gradeData.interests.length > 5 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{gradeData.interests.length - 5} more
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                )}

                                <Button 
                                  variant="ghost" 
                                  className="w-full mt-2" 
                                  asChild
                                  data-testid={`button-view-results-${grade}`}
                                >
                                  <Link href={`/results?grade=${grade}`}>
                                    View Full Results <ChevronRight className="w-4 h-4 ml-1" />
                                  </Link>
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {isCompleted 
                                  ? 'No career recommendations yet'
                                  : 'Assessment not yet completed for this grade'
                                }
                              </p>
                            )}
                          </StickyNote>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {evolution?.gradeDetails && evolution.gradeDetails.length > 1 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" />
                    Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <Heart className="w-8 h-8 text-primary mb-2" />
                      <h3 className="font-semibold mb-1">Interest Evolution</h3>
                      <p className="text-sm text-muted-foreground">
                        Your interests have been tracked across {evolution.gradeDetails.length} assessments. 
                        {evolution.trajectory.length > 0 && (
                          <> Your most consistent career interest is <strong>{evolution.trajectory[0]?.careerName}</strong>.</>
                        )}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-accent/5 border border-accent/20">
                      <TrendingUp className="w-8 h-8 text-accent mb-2" />
                      <h3 className="font-semibold mb-1">Career Path Clarity</h3>
                      <p className="text-sm text-muted-foreground">
                        {evolution.trajectory.filter(t => t.persistenceScore >= 0.5).length} careers 
                        have appeared in at least half of your assessments, showing strong consistency 
                        in your career interests.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
