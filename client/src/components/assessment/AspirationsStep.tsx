import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Rocket, Star, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AspirationsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
}

const strengthOptions = [
  "Critical Thinking",
  "Creativity",
  "Communication",
  "Leadership",
  "Teamwork",
  "Problem Solving",
  "Attention to Detail",
  "Adaptability",
];

export function AspirationsStep({ data, onUpdate, onNext, onBack }: AspirationsStepProps) {
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
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`w-4 h-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-medium font-body">{strength}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </StickyNote>
      </div>

      <div className="flex justify-center gap-4 pt-8">
        {onBack && (
          <Button
            size="lg"
            variant="outline"
            onClick={onBack}
            className="px-8 py-6 text-lg rounded-full"
            data-testid="button-back-aspirations"
          >
            {t('nav.back')}
          </Button>
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-submit-assessment"
        >
          {t('aspirations.selfAssessment')}
        </Button>
      </div>
    </div>
  );
}
