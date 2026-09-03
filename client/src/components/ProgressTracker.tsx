import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { stepIdsForTier } from "@shared/assessmentFlow";

interface Step {
  number: number;
  title: string;
  completed: boolean;
  current: boolean;
}

interface ProgressTrackerProps {
  currentStep: number;
  totalSteps: number;
  isPremium?: boolean;
}

export function ProgressTracker({ currentStep, totalSteps, isPremium = false }: ProgressTrackerProps) {
  const { t } = useTranslation('assessment');
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  // Labels come from the shared step order, so they can no longer drift from the
  // steps Assessment.tsx actually renders. They had drifted: the free list used
  // to be [basicInfo, subjects, interests, personality, country, aspirations,
  // results] while the free flow ran [.., country, aspirations, QUIZ] — so a
  // free student taking the quiz was told they were on "Results".
  // The step ids double as the i18n keys under `progress.`.
  const stepTitles = stepIdsForTier(isPremium).map(id => t(`progress.${id}`));

  const steps: Step[] = Array.from({ length: totalSteps }, (_, i) => ({
    number: i + 1,
    title: stepTitles[i] || String(i + 1),
    completed: i + 1 < currentStep,
    current: i + 1 === currentStep,
  }));

  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6">
      {/* Progress bar — dir="ltr" keeps fill visually correct;
          scaleX(-1) mirrors it so fill grows from the reading-start side in RTL */}
      <div className="mb-8">
        <div
          className="h-3 bg-muted rounded-full overflow-hidden"
          style={isRTL ? { transform: 'scaleX(-1)' } : undefined}
        >
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-center">
          <span className="text-sm font-medium text-muted-foreground font-body">
            {t('progress.stepOf', { current: currentStep, total: totalSteps })}
          </span>
        </div>
      </div>

      {/* Step indicators — in RTL, flex-row naturally reverses order so
          step 1 is on the right; connector fill anchors from inline-end */}
      <div className="hidden md:flex justify-between items-start relative gap-2">
        {/* Full connector track */}
        <div className="absolute top-6 left-0 right-0 h-1 bg-muted -z-10" />
        {/* Progress fill — anchors from inline-start (left in LTR, right in RTL) */}
        <div
          className="absolute top-6 h-1 bg-primary transition-all duration-500 -z-10"
          style={{
            width: `${progress}%`,
            ...(isRTL ? { right: 0 } : { left: 0 }),
          }}
        />

        {steps.map((step) => (
          <div key={step.number} className="flex flex-col items-center flex-1 min-w-0">
            <div
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 shadow-md",
                step.completed && "bg-primary text-primary-foreground scale-110",
                step.current && "bg-primary text-primary-foreground scale-125 ring-4 ring-primary/30 animate-pulse",
                !step.completed && !step.current && "bg-muted text-muted-foreground"
              )}
            >
              {step.completed ? <Check className="w-6 h-6" /> : step.number}
            </div>
            <span
              className={cn(
                "mt-2 text-xs font-medium text-center transition-all duration-300 whitespace-nowrap px-1",
                step.current && "text-foreground font-bold",
                step.completed && "text-primary",
                !step.completed && !step.current && "text-muted-foreground"
              )}
            >
              {step.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
