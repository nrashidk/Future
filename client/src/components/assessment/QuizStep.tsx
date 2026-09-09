import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * Back to Subjects. Optional to match every other step, but this one had no
   * such prop at all until now — the quiz was the only step in the flow with a
   * step behind it and no way to reach it.
   *
   * That was not a decision: the server tells a student whose subjects yield no
   * questions to "update your subject preferences" (quiz.routes.ts), and it said
   * so on the one screen where they could not.
   *
   * ONLY RENDERED WHILE THE QUIZ IS UNSUBMITTED. Changing subjects discards an
   * unsubmitted quiz server-side so the pool can be rebuilt (the PATCH handler in
   * assessment.routes.ts), and a submitted quiz is scored and must stay that way.
   * Re-entry after submission is already a no-op — the auto-advance below bounces
   * straight back — so offering Back there would promise something that cannot
   * happen.
   */
  onBack?: () => void;
  /**
   * True when the PATCH that changed this student's subjects discarded an
   * unsubmitted quiz, so the questions below are a rebuild rather than a first
   * visit. Nothing on this screen could work that out for itself: the two cases
   * produce an identical /quiz/generate response, because the deleted row is
   * exactly the evidence that is gone.
   */
  quizDiscarded?: boolean;
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

export function QuizStep({ assessmentId, onComplete, onBack, quizDiscarded }: QuizStepProps) {
  const { t } = useTranslation('assessment');
  const { toast } = useToast();
  const { language } = useLanguage();
  const [responses, setResponses] = useState<Record<string, string>>({});
  // CAPTURED AT MOUNT, not read from the prop on every render. The parent clears
  // its flag when the student leaves this step, and reading the prop live would
  // make the notice vanish mid-read if anything else cleared it first. Taken once
  // here, it lasts exactly as long as this visit to the quiz — and a later visit
  // mounts fresh with the flag already false, so it does not reappear.
  const [showDiscardNotice] = useState(!!quizDiscarded);
  const [showResults, setShowResults] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);

  // Latest answers, for the unmount save. The cleanup that runs it is mounted
  // once and would otherwise close over the empty object from the first render.
  const responsesRef = useRef<Record<string, string>>({});
  responsesRef.current = responses;

  // What the SERVER is known to hold. Not a copy of `responses`: it advances
  // only on a 200. A failed save therefore leaves it behind, and the next answer
  // resends the full set — which is what makes a dropped request self-heal
  // instead of leaving a permanent hole.
  const lastSavedRef = useRef<Record<string, string>>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedQuizIdRef = useRef<string | null>(null);

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

  /**
   * Restore the answers the student already entered.
   *
   * Both server read paths have always returned them — the existing-quiz branch
   * of /quiz/generate and GET /quiz both send `responses` — and this component
   * had never once looked at that field. Until the previous commit there was
   * nothing in it but empty strings, so nobody noticed the read end was missing.
   *
   * GUARDED BY QUIZ ID, IN A REF. This runs once per quiz and never again for
   * that quiz. quizData's identity changes on every successful save (the
   * write-through setQueryData in saveAnswers), so an unguarded effect would
   * re-seed the form from the cache mid-quiz — harmless when the cache agrees,
   * and a lost answer the moment it does not. A ref, not state, because the
   * guard has to hold within the render pass that reads it.
   *
   * BLANKS ARE FILTERED. Every row is created with answer: "". An empty string
   * is not an answer: it would not satisfy allAnswered, but it WOULD count in
   * the "N of M answered" line above, telling a student they had answered
   * questions they had not.
   *
   * ANYTHING TYPED SINCE THE FETCH WINS — `prev` is spread last.
   *
   * lastSavedRef is seeded here as well. It records what the SERVER holds, and
   * what the server holds is precisely what was just read; without this the
   * debounced save would see a burst of new answers and PATCH them straight back
   * to where they came from on every entry to the quiz.
   */
  useEffect(() => {
    const quizId = quizData?.quizId;
    if (!quizId || hydratedQuizIdRef.current === quizId) return;
    hydratedQuizIdRef.current = quizId;

    const stored: Record<string, string> = Object.fromEntries(
      ((quizData.responses ?? []) as QuizResponse[])
        .filter((r) => typeof r.answer === "string" && r.answer !== "")
        .map((r) => [r.questionId, r.answer])
    );
    if (Object.keys(stored).length === 0) return;

    lastSavedRef.current = stored;
    setResponses((prev) => ({ ...stored, ...prev }));
  }, [quizData]);

  /**
   * Persist the answers entered so far.
   *
   * SENDS THE FULL ANSWER SET, NOT A DELTA. A dropped request then heals on the
   * next answer instead of leaving one question blank forever, and the server
   * skips the rows that already match (selectPartialAnswerUpdates), so the
   * resend costs nothing in writes.
   *
   * THE CACHE IS PATCHED ONLY AFTER THE AWAIT. apiRequest throws on a non-OK
   * response, so a failure never reaches the setQueryData below — and that
   * ordering is the whole guard. staleTime is 5 minutes (queryClient.ts), so the
   * remount after Back is served from cache with NO refetch; a cache patched
   * after a failed request would assert a persistence that did not happen, and
   * Back would look safe when it is not. That is worse than losing the answers
   * honestly, which is what this component did until now.
   *
   * Returns true when there is nothing to save, so callers can treat "nothing
   * pending" and "saved" alike.
   */
  const saveAnswers = useCallback(async (): Promise<boolean> => {
    const current = responsesRef.current;
    const answered = Object.entries(current).filter(([, answer]) => answer !== "");

    const saved = lastSavedRef.current;
    const unchanged =
      answered.length === Object.keys(saved).length &&
      answered.every(([questionId, answer]) => saved[questionId] === answer);
    if (unchanged) return true;

    const payload = answered.map(([questionId, answer]) => ({ questionId, answer }));

    await apiRequest("PATCH", `/api/assessments/${assessmentId}/quiz/responses`, {
      responses: payload,
    });

    lastSavedRef.current = Object.fromEntries(answered);

    // A FIRST generation returns `responses: []` — the blank rows exist in the
    // database but the payload does not enumerate them — while the existing-quiz
    // branch returns one entry per question. So this ADDS entries rather than
    // mapping over what is there; a map alone would silently no-op on the
    // student's first visit, which is the common case.
    queryClient.setQueryData(["/api/assessments", assessmentId, "quiz"], (old: any) => {
      if (!old) return old;
      const merged = new Map<string, { questionId: string; answer: string }>(
        (old.responses ?? []).map((r: any) => [r.questionId, r])
      );
      for (const [questionId, answer] of answered) {
        merged.set(questionId, { ...(merged.get(questionId) ?? { questionId }), answer });
      }
      return { ...old, responses: Array.from(merged.values()) };
    });

    return true;
  }, [assessmentId]);

  /**
   * Debounced background save. 400ms, not the 2000ms the parent's form autosave
   * uses (Assessment.tsx): that one debounces typing, this one debounces radio
   * clicks, which arrive in bursts and are final the moment they land.
   *
   * Failures are silent here, like the parent's autosave — the retry is the next
   * answer, and the one moment a failure actually costs the student something
   * (pressing Back) surfaces it there instead.
   */
  useEffect(() => {
    if (!quizData?.quizId || quizData.completed) return;

    const timeoutId = setTimeout(() => {
      saveAnswers().catch((error) => console.error("Quiz answer save failed:", error));
    }, 400);
    saveTimerRef.current = timeoutId;

    return () => clearTimeout(timeoutId);
  }, [responses, quizData, saveAnswers]);

  /**
   * Last-chance save for the ways out of this step that are not the Back button
   * (a route change, the parent advancing). Best-effort and unawaited — nothing
   * can be awaited in a cleanup. Mounted once, so it reads the refs rather than
   * the render's closure, and it is a no-op when the debounced save already
   * landed.
   */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveAnswers().catch(() => {});
    };
  }, [saveAnswers]);

  // Submit quiz mutation — uses apiRequest so CSRF token is always included
  const submitMutation = useMutation({
    mutationFn: async (quizResponses: QuizResponse[]) => {
      const res = await apiRequest("POST", `/api/assessments/${assessmentId}/quiz/submit`, {
        responses: quizResponses,
      });
      return await res.json();
    },
    onSuccess: () => {
      setShowResults(true);
      toast({
        title: t('quiz.complete'),
      });
      // Short confirmation beat only. Nothing here depends on the delay: the
      // submit already persisted server-side before onSuccess ran, and the
      // invalidate below is not awaited — it fires on the same tick as
      // onComplete either way.
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/assessments", assessmentId] });
        onComplete();
      }, 800);
    },
    onError: (error: any) => {
      // apiRequest throws `"${status}: ${bodyText}"` — parse the JSON body to get the code
      let code: string | undefined;
      try {
        const match = String(error?.message ?? "").match(/^\d+: (.+)$/s);
        if (match) code = JSON.parse(match[1])?.code;
      } catch {}

      if (code === "QUIZ_ALREADY_SUBMITTED") {
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

  /**
   * Back to Subjects — but not before the answers are safely stored.
   *
   * A plain onClick={onBack} would reproduce the very bug this batch fixes, in
   * miniature: answer a question, press Back inside the 400ms window, lose it.
   * So the pending timer is cleared and the save is AWAITED.
   *
   * AND IF THE SAVE FAILS, IT DOES NOT NAVIGATE. Leaving anyway would be exactly
   * the data loss this exists to end, except now silent and with the student
   * believing it was handled. Staying put costs them a second press; the answers
   * are still on screen, and submitting is still open to them.
   */
  const handleBack = async () => {
    if (!onBack) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setIsFlushing(true);
    try {
      await saveAnswers();
      onBack();
    } catch (error) {
      console.error("Quiz answer save failed on back:", error);
      toast({
        title: t('quiz.errorTitle'),
        description: t('quiz.saveFailedOnBack'),
        variant: "destructive",
      });
    } finally {
      setIsFlushing(false);
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

  if (showResults) {
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
              <p className="text-base font-semibold">{t('quiz.answersRecorded')}</p>
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

      {/* Deliberately not a destructive/warning style. Nothing went wrong: the
          student changed their subjects and the old answers were about subjects
          they no longer picked, so a rebuilt quiz is the correct outcome and the
          copy says why rather than apologising for it. */}
      {showDiscardNotice && (
        <div
          className="max-w-3xl mx-auto rounded-lg border bg-accent/30 px-4 py-3 text-sm text-muted-foreground font-body text-center"
          data-testid="text-quiz-discarded-notice"
        >
          {t('quiz.discardedNotice')}
        </div>
      )}

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

      <div className="flex justify-center gap-4 pt-8">
        {/* Gated on !quizData?.completed as well as onBack: a completed quiz
            never renders this branch today (the auto-advance fires first), but
            the guard states the rule rather than relying on that ordering. */}
        {onBack && !quizData?.completed && (
          <Button
            size="lg"
            variant="outline"
            onClick={handleBack}
            disabled={submitMutation.isPending || isFlushing}
            className="px-8 py-6 text-lg rounded-full"
            data-testid="button-back-quiz"
          >
            {t('nav.back')}
          </Button>
        )}
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
