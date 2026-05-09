import { useState, useEffect } from "react";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Brain, CheckCircle2, Loader2, Construction } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";

interface QuizStepProps {
  assessmentId: string;
  onComplete: () => void;
}

interface QuizOption {
  id: string;
  text: string;
  textAr?: string;
}

interface QuizQuestion {
  id: string;
  question: string;
  questionAr?: string | null;
  questionType: "multiple_choice" | "rating";
  options: QuizOption[];
  domain: string;
  cognitiveLevel: string;
}

interface QuizResponse {
  questionId: string;
  answer: string;
}

export function QuizStep({ assessmentId, onComplete }: QuizStepProps) {
  const { t } = useTranslation('assessment');
  const { toast } = useToast();
  const { language } = useLanguage();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState<any>(null);

  // Generate/fetch quiz (guest token is sent via httpOnly cookie automatically)
  const { data: quizData, isLoading: isGenerating, error: generationError } = useQuery({
    queryKey: ["/api/assessments", assessmentId, "quiz"],
    queryFn: async () => {
      const response = await apiRequest("POST", `/api/assessments/${assessmentId}/quiz/generate`, {});
      return await response.json();
    }
  });

  // Auto-advance if quiz is already completed
  useEffect(() => {
    if (quizData?.completed && !showResults) {
      onComplete();
    }
  }, [quizData, showResults, onComplete]);

  // Submit quiz mutation (guest token is sent via httpOnly cookie automatically)
  const submitMutation = useMutation({
    mutationFn: async (quizResponses: QuizResponse[]) => {
      const response = await apiRequest("POST", `/api/assessments/${assessmentId}/quiz/submit`, {
        responses: quizResponses
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setScore(data);
      setShowResults(true);
      toast({
        title: t('quiz.complete'),
        description: `${data.totalScore}%`,
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/assessments", assessmentId] });
        onComplete();
      }, 3000);
    },
    onError: (error: any) => {
      const errorMessage = error?.message || t('quiz.submitFailed');
      
      // If quiz already submitted, auto-advance to next step
      if (errorMessage.includes("already been submitted")) {
        toast({
          title: t('quiz.alreadySubmitted'),
          description: t('quiz.alreadySubmittedDesc'),
        });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/assessments", assessmentId] });
          onComplete();
        }, 1500);
      } else {
        toast({
          title: t('quiz.errorTitle'),
          description: t('quiz.submitFailed'),
          variant: "destructive"
        });
      }
    }
  });

  const handleAnswerChange = (questionId: string, optionId: string) => {
    // Always store canonical English option text for language-agnostic scoring
    const question = questions.find((q: QuizQuestion) => q.id === questionId);
    if (question) {
      const canonicalOption = question.options.find((o: any) => o.id === optionId);
      if (canonicalOption) {
        setResponses(prev => ({ ...prev, [questionId]: canonicalOption.text }));
      }
    }
  };

  const handleSubmit = () => {
    // Ensure all questions are answered before submitting
    if (!allAnswered) {
      return;
    }

    const questions = quizData?.questions || [];
    const quizResponses: QuizResponse[] = questions.map((q: QuizQuestion) => ({
      questionId: q.id,
      answer: responses[q.id]
    }));

    submitMutation.mutate(quizResponses);
  };

  const questions: QuizQuestion[] = quizData?.questions || [];
  // Ensure questions exist AND all are answered (not undefined or empty)
  const allAnswered = questions.length > 0 && questions.every((q: QuizQuestion) => 
    responses[q.id] !== undefined && responses[q.id] !== ""
  );

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4 animate-in fade-in">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <p className="text-lg text-muted-foreground">{t('quiz.preparing')}</p>
      </div>
    );
  }

  if (generationError) {
    const errorMessage = (generationError as any)?.message || '';
    const isQuestionsUnavailable = errorMessage.includes('No quiz questions available') || 
                                    errorMessage.includes('Not enough questions available');
    
    if (isQuestionsUnavailable) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] space-y-8 animate-in fade-in p-8">
          <div className="text-center space-y-6 max-w-2xl">
            <div className="relative inline-block">
              <StickyNote color="yellow" rotation="2" className="mb-4">
                <div className="flex justify-center mb-4">
                  <Construction className="w-16 h-16 text-primary" aria-hidden="true" />
                </div>
                <h2 className="text-3xl font-bold mb-2">{t('quiz.comingSoon')}</h2>
                <p className="text-base text-muted-foreground">
                  {t('quiz.comingSoonSubtitle')}
                </p>
              </StickyNote>
            </div>
            
            <div className="space-y-4">
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                {t('quiz.comingSoonDesc1')}
              </p>
              <p className="text-base text-muted-foreground max-w-lg mx-auto">
                {t('quiz.comingSoonDesc2')}
              </p>
            </div>
          </div>
          
          <Button
            size="lg"
            onClick={onComplete}
            className="px-8"
            data-testid="button-skip-quiz"
          >
            {t('quiz.continueToResults')}
          </Button>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 animate-in fade-in">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-destructive">{t('quiz.unableToGenerate')}</h2>
          <p className="text-muted-foreground max-w-md">
            {errorMessage || t('quiz.unableToGenerateDesc')}
          </p>
        </div>
        <Button
          size="lg"
          onClick={onComplete}
          className="px-8"
          data-testid="button-skip-quiz"
        >
          {t('quiz.continueToResults')}
        </Button>
      </div>
    );
  }

  if (showResults && score) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-4xl font-bold mb-3">{t('quiz.complete')}</h2>
          <p className="text-lg text-muted-foreground">
            {t('quiz.completeSubtitle')}
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <StickyNote color="purple" rotation="-1">
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-2">{t('quiz.overallScore')}</p>
              <p className="text-5xl font-bold">{score.totalScore}%</p>
            </div>
          </StickyNote>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          {t('quiz.generatingRecs')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('quiz.title')}</h2>
        <p className="text-lg text-muted-foreground">
          {t('quiz.subtitle')}
        </p>
        <div className="mt-4 text-sm text-muted-foreground">
          {t('quiz.answeredOf', { answered: Object.keys(responses).length, total: questions.length })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto space-y-6">
        {questions.map((question: QuizQuestion, index: number) => {
          const colors = ["yellow", "blue", "pink", "green", "purple", "yellow"];
          const rotations = ["1", "-1", "1", "-1", "1", "-1"];
          
          return (
            <StickyNote 
              key={question.id} 
              color={colors[index % colors.length] as any}
              rotation={rotations[index % rotations.length] as any}
            >
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Brain className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1">
                    <Label className="text-base font-semibold leading-tight">
                      {index + 1}. {language === 'ar' && question.questionAr ? question.questionAr : question.question}
                    </Label>
                  </div>
                </div>

                <RadioGroup
                  value={question.options.find((o) => o.text === responses[question.id])?.id || ""}
                  onValueChange={(optionId) => handleAnswerChange(question.id, optionId)}
                  className="space-y-2 ps-11"
                >
                  {question.options.map((option) => (
                    <div 
                      key={option.id} 
                      className="flex items-center gap-2 p-2 min-h-[44px] rounded-lg hover-elevate cursor-pointer"
                      onClick={() => handleAnswerChange(question.id, option.id)}
                    >
                      <RadioGroupItem 
                        value={option.id} 
                        id={`${question.id}-${option.id}`}
                        data-testid={`radio-quiz-${question.id}-${option.id}`}
                      />
                      <Label 
                        htmlFor={`${question.id}-${option.id}`}
                        className="flex-1 cursor-pointer text-sm"
                      >
                        {language === 'ar' && option.textAr ? option.textAr : option.text}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </StickyNote>
          );
        })}
      </div>

      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!allAnswered || submitMutation.isPending}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-submit-quiz"
        >
          {submitMutation.isPending ? (
            <>
              <Loader2 className="w-5 h-5 me-2 animate-spin" />
              {t('quiz.submitting')}
            </>
          ) : (
            t('quiz.submit')
          )}
        </Button>
      </div>
    </div>
  );
}
