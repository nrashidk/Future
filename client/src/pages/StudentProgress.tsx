import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { GraduationCap, TrendingUp, Target, Brain, Heart, ArrowLeft, Calendar, Award, ChevronRight } from "lucide-react";
import { StickyNote } from "@/components/StickyNote";
import { useTranslation } from "react-i18next";

interface CareerEvolutionData {
  grade: string;
  completedAt: string | null;
  topCareers: Array<{ careerId: string; careerName: string; matchScore: number }>;
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
  const { t } = useTranslation("profile");
  useEffect(() => { document.title = `${t("progress.pageTitle")} | Future Pathways`; }, [t]);

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
          <p className="text-muted-foreground">{t("loadingProgress")}</p>
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
    return t("progress.grade", { num });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t("progress.notCompletedDate");
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
              <ArrowLeft className="w-4 h-4 me-2" />
              {t("progress.backToProfile")}
            </Link>
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">{t("progress.title")}</h1>
          <p className="text-muted-foreground">{t("progress.subtitle")}</p>
        </div>

        {!hasData ? (
          <Card className="text-center py-12">
            <CardContent>
              <Target className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">{t("progress.noProgressTitle")}</h2>
              <p className="text-muted-foreground mb-6">
                {t("progress.noProgressDesc")}
              </p>
              <Button asChild data-testid="button-start-assessment">
                <Link href="/assessment">{t("progress.startAssessment")}</Link>
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
                    {t("progress.consistencyTitle")}
                  </CardTitle>
                  <CardDescription>{t("progress.consistencyDesc")}</CardDescription>
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
                          {t("progress.appearedIn", { grades: career.gradesAppeared.map(g => getGradeLabel(g)).join(', ') })}
                        </p>
                        <div className="flex items-center gap-2 text-sm">
                          <Award className="w-4 h-4 text-primary" />
                          <span>{t("progress.avgMatch", { score: Math.round(career.avgMatchScore) })}</span>
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
                  {t("progress.gradeByGrade")}
                </CardTitle>
                <CardDescription>{t("progress.gradeByGradeDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="absolute start-6 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-8">
                    {grades.map((grade, index) => {
                      const gradeData = getGradeData(grade);
                      const isCompleted = !!gradeData;
                      
                      return (
                        <div key={grade} className="relative ps-16" data-testid={`timeline-grade-${grade}`}>
                          <div className={`absolute start-4 w-5 h-5 rounded-full border-2 ${
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
                                <Badge variant="secondary" className="text-xs">{t("progress.pending")}</Badge>
                              )}
                            </div>
                            
                            {isCompleted && gradeData.topCareers.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground font-medium">{t("progress.topCareers")}</p>
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
                                    <p className="text-sm text-muted-foreground font-medium mb-2">{t("progress.interests")}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {gradeData.interests.slice(0, 5).map((interest, iIndex) => (
                                        <Badge key={iIndex} variant="outline" className="text-xs">
                                          {interest}
                                        </Badge>
                                      ))}
                                      {gradeData.interests.length > 5 && (
                                        <Badge variant="outline" className="text-xs">
                                          +{gradeData.interests.length - 5} {t("progress.more")}
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
                                    {t("progress.viewResults")} <ChevronRight className="w-4 h-4 ms-1" />
                                  </Link>
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">
                                {isCompleted 
                                  ? t("progress.noRecommendations")
                                  : t("progress.notCompleted")
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
                    {t("progress.insightsTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                      <Heart className="w-8 h-8 text-primary mb-2" />
                      <h3 className="font-semibold mb-1">{t("progress.interestEvolution")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("progress.interestEvolutionDesc", { count: evolution.gradeDetails.length })}
                        {evolution.trajectory.length > 0 && (
                          <>{t("progress.mostConsistent")} <strong>{evolution.trajectory[0]?.careerName}</strong>.</>
                        )}
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-accent/5 border border-accent/20">
                      <TrendingUp className="w-8 h-8 text-accent mb-2" />
                      <h3 className="font-semibold mb-1">{t("progress.clarityTitle")}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t("progress.clarityDesc", { count: evolution.trajectory.filter(tr => tr.persistenceScore >= 0.5).length })}
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
