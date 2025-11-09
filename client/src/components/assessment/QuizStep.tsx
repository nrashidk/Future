import { useState, useEffect } from "react";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Brain, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface QuizStepProps {
  assessmentId: string;
  onComplete: () => void;
}

interface QuizQuestion {
  id: string;
  question: string;
  questionType: "multiple_choice" | "rating";
  options: { id: string; text: string }[];
  domain: string;
  cognitiveLevel: string;
}

interface QuizResponse {
  questionId: string;
  answer: string;
}

export function QuizStep({ assessmentId, onComplete }: QuizStepProps) {
  const { toast } = useToast();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [showResults, setShowResults] = useState(false);
  const [score, setScore] = useState<any>(null);

  // Generate/fetch quiz
  const { data: quizData, isLoading: isGenerating, error: generationError } = useQuery({
    queryKey: ["/api/assessments", assessmentId, "quiz"],
    queryFn: async () => {
      const response = await apiRequest("POST", `/api/assessments/${assessmentId}/quiz/generate`);
      return await response.json();
    }
  });

  // Auto-advance if quiz is already completed
  useEffect(() => {
    if (quizData?.completed && !showResults) {
      onComplete();
    }
  }, [quizData, showResults, onComplete]);

  // Submit quiz mutation
  const submitMutation = useMutation({
    mutationFn: async (quizResponses: QuizResponse[]) => {
      const response = await apiRequest("POST", `/api/assessments/${assessmentId}/quiz/submit`, {
        responses: quizResponses
      });
      return await response.json();
    },
    onSuccess: (data) => {
      setScore(data.score);
      setShowResults(true);
      toast({
        title: "Quiz Completed! 🎉",
        description: `You scored ${data.score.overall}% overall`,
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/assessments", assessmentId] });
        onComplete();
      }, 3000);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to submit quiz. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleAnswerChange = (questionId: string, answer: string) => {
    setResponses(prev => ({ ...prev, [questionId]: answer }));
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
        <p className="text-lg text-muted-foreground">Preparing your quiz...</p>
      </div>
    );
  }

  if (generationError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-6 animate-in fade-in">
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-destructive">Unable to Generate Quiz</h2>
          <p className="text-muted-foreground max-w-md">
            We couldn't create your quiz at this time. This might be due to missing questions for your grade level or country.
          </p>
        </div>
        <Button
          size="lg"
          onClick={onComplete}
          className="px-8"
          data-testid="button-skip-quiz"
        >
          Continue to Results
        </Button>
      </div>
    );
  }

  if (showResults && score) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-4xl font-bold mb-3">Quiz Complete! 🎉</h2>
          <p className="text-lg text-muted-foreground">
            Great job! Here's how you did:
          </p>
        </div>

        <div className="max-w-2xl mx-auto grid grid-cols-2 gap-4">
          <StickyNote color="blue" rotation="1">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Vision Awareness</p>
              <p className="text-3xl font-bold">{score.vision}%</p>
            </div>
          </StickyNote>
          <StickyNote color="green" rotation="-1">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Sector Competency</p>
              <p className="text-3xl font-bold">{score.sector}%</p>
            </div>
          </StickyNote>
          <StickyNote color="yellow" rotation="1">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Personal Alignment</p>
              <p className="text-3xl font-bold">{score.motivation}%</p>
            </div>
          </StickyNote>
          <StickyNote color="purple" rotation="-1">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Overall Score</p>
              <p className="text-3xl font-bold">{score.overall}%</p>
            </div>
          </StickyNote>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Generating your personalized career recommendations...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">Quick Knowledge Check 🧠</h2>
        <p className="text-lg text-muted-foreground">
          Answer these questions to refine your career recommendations
        </p>
        <div className="mt-4 text-sm text-muted-foreground">
          {Object.keys(responses).length} of {questions.length} answered
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
                      {index + 1}. {question.question}
                    </Label>
                  </div>
                </div>

                <RadioGroup
                  value={responses[question.id] || ""}
                  onValueChange={(value) => handleAnswerChange(question.id, value)}
                  className="space-y-2 pl-11"
                >
                  {question.options.map((option) => (
                    <div 
                      key={option.id} 
                      className="flex items-center space-x-2 p-2 rounded-lg hover-elevate cursor-pointer"
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
                        {option.text}
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
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            "Submit Quiz ✨"
          )}
        </Button>
      </div>
    </div>
  );
}
