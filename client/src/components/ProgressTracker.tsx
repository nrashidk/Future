import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  number: number;
  title: string;
  completed: boolean;
  current: boolean;
}

interface ProgressTrackerProps {
  currentStep: number;
  totalSteps: number;
}

const stepTitles = [
  "Basic Info",
  "Subjects",
  "Interests",
  "Personality",
  "Country",
  "Aspirations",
  "Results"
];

export function ProgressTracker({ currentStep, totalSteps }: ProgressTrackerProps) {
  const steps: Step[] = Array.from({ length: totalSteps }, (_, i) => ({
    number: i + 1,
    title: stepTitles[i] || `Step ${i + 1}`,
    completed: i + 1 < currentStep,
    current: i + 1 === currentStep,
  }));

  const progress = ((currentStep - 1) / (totalSteps - 1)) * 100;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-3 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-center">
          <span className="text-sm font-medium text-muted-foreground font-body">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
      </div>

      {/* Step indicators */}
      <div className="hidden md:flex justify-between items-start relative">
        {/* Connection line */}
        <div className="absolute top-6 left-0 right-0 h-1 bg-muted -z-10" />
        <div 
          className="absolute top-6 left-0 h-1 bg-primary transition-all duration-500 -z-10"
          style={{ width: `${progress}%` }}
        />

        {steps.map((step) => (
          <div key={step.number} className="flex flex-col items-center" style={{ width: `${100 / totalSteps}%` }}>
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
                "mt-2 text-xs font-medium text-center transition-all duration-300",
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
