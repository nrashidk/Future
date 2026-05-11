import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2, Rocket, Star, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AspirationsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
  isGenerating?: boolean;
  submitError?: string | null;
}

const STRENGTH_KEYS: Record<string, string> = {
  "Critical Thinking": "aspirations.strengthCriticalThinking",
  "Creativity": "aspirations.strengthCreativity",
  "Communication": "aspirations.strengthCommunication",
  "Leadership": "aspirations.strengthLeadership",
  "Teamwork": "aspirations.strengthTeamwork",
  "Problem Solving": "aspirations.strengthProblemSolving",
  "Attention to Detail": "aspirations.strengthAttentionToDetail",
  "Adaptability": "aspirations.strengthAdaptability",
};

const strengthOptions = Object.keys(STRENGTH_KEYS);

export function AspirationsStep({ data, onUpdate, onNext, onBack, isGenerating = false, submitError = null }: AspirationsStepProps) {
  const { t } = useTranslation('assessment');

  const toggleStrength = (strength: string) => {
    const current = data.strengths || [];
    if (current.includes(strength)) {
      onUpdate("strengths", current.filter((s: string) => s !== strength));
    } else {
      onUpdate("strengths", [...current, strength]);
    }
  };

  const canProceed = (data.strengths || []).length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('aspirations.title')}</h2>
        <p className="text-lg text-muted-foreground font-body">
          {t('aspirations.subtitle')}
        </p>
      </div>

      <div className="max-w-2xl mx-auto space-y-6">
        <StickyNote color="purple" rotation="1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold">{t('aspirations.dreamsLabel')}</Label>
          </div>
          <Textarea
            placeholder={t('aspirations.dreamsPlaceholder')}
            value={(data.careerAspirations || []).join("\n")}
            onChange={(e) => onUpdate("careerAspirations", e.target.value.split("\n").filter(Boolean))}
            className="min-h-32 bg-background/50 border-foreground/20 font-body"
            data-testid="textarea-aspirations"
          />
        </StickyNote>

        <StickyNote color="yellow" rotation="-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Star className="w-5 h-5 text-primary" />
            </div>
            <Label className="text-lg font-semibold">{t('aspirations.strengthsLabel')}</Label>
          </div>
          <p className="text-sm text-muted-foreground mb-4 font-body">
            {t('aspirations.strengthsHint')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {strengthOptions.map((strength) => {
              const isSelected = (data.strengths || []).includes(strength);
              return (
                <div
                  key={strength}
                  onClick={() => toggleStrength(strength)}
                  className={`p-3 rounded-lg cursor-pointer transition-all hover-elevate ${
                    isSelected
                      ? "bg-primary/20 ring-2 ring-primary"
                      : "bg-background/30"
                  }`}
                  data-testid={`strength-${strength.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-medium font-body">
                      {t(STRENGTH_KEYS[strength])}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </StickyNote>
      </div>

      <div className="flex flex-col items-center gap-4 pt-8">
        <div className="flex justify-center gap-4">
          {onBack && (
            <Button
              size="lg"
              variant="outline"
              onClick={onBack}
              disabled={isGenerating}
              className="px-8 py-6 text-lg rounded-full"
              data-testid="button-back-aspirations"
            >
              {t('nav.back')}
            </Button>
          )}
          <Button
            size="lg"
            onClick={onNext}
            disabled={!canProceed || isGenerating}
            className="px-12 py-6 text-lg rounded-full shadow-lg"
            data-testid="button-submit-assessment"
          >
            {isGenerating ? (
              <>
                <Loader2 className="me-2 h-5 w-5 animate-spin" />
                {t('aspirations.generating')}
              </>
            ) : (
              t('aspirations.selfAssessment')
            )}
          </Button>
        </div>
        {submitError && (
          <div
            className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive max-w-md w-full"
            data-testid="text-aspirations-submit-error"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onNext}
              disabled={!canProceed || isGenerating}
              className="self-end"
              data-testid="button-try-again"
            >
              {t('errors.tryAgain')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
