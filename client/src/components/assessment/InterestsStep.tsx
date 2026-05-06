import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Laptop, Palette, Heart, Lightbulb, Dumbbell, Microscope, Users, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";

interface InterestsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
}

export function InterestsStep({ data, onUpdate, onNext, onBack }: InterestsStepProps) {
  const { t } = useTranslation('assessment');

  const interests = [
    { id: "Technology", labelKey: "interests.technologyLabel", descKey: "interests.technologyDesc", icon: Laptop, color: "blue" as const },
    { id: "Creative", labelKey: "interests.creativeLabel", descKey: "interests.creativeDesc", icon: Palette, color: "pink" as const },
    { id: "Helping", labelKey: "interests.helpingLabel", descKey: "interests.helpingDesc", icon: Heart, color: "yellow" as const },
    { id: "Problem Solving", labelKey: "interests.problemSolvingLabel", descKey: "interests.problemSolvingDesc", icon: Lightbulb, color: "green" as const },
    { id: "Physical", labelKey: "interests.physicalLabel", descKey: "interests.physicalDesc", icon: Dumbbell, color: "purple" as const },
    { id: "Research", labelKey: "interests.researchLabel", descKey: "interests.researchDesc", icon: Microscope, color: "blue" as const },
    { id: "Leadership", labelKey: "interests.leadershipLabel", descKey: "interests.leadershipDesc", icon: Users, color: "yellow" as const },
    { id: "Business", labelKey: "interests.businessLabel", descKey: "interests.businessDesc", icon: TrendingUp, color: "pink" as const },
  ];

  const toggleInterest = (interestId: string) => {
    const current = data.interests || [];
    if (current.includes(interestId)) {
      onUpdate("interests", current.filter((i: string) => i !== interestId));
    } else {
      onUpdate("interests", [...current, interestId]);
    }
  };

  const canProceed = (data.interests || []).length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('interests.title')}</h2>
        <p className="text-lg text-muted-foreground font-body">
          {t('interests.subtitle')}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {interests.map((interest) => {
          const Icon = interest.icon;
          const isSelected = (data.interests || []).includes(interest.id);

          return (
            <StickyNote
              key={interest.id}
              color={interest.color}
              rotation={Math.random() > 0.5 ? "1" : "-1"}
              selected={isSelected}
              onClick={() => toggleInterest(interest.id)}
              className="cursor-pointer transition-transform"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div className="text-start">
                  <h4 className="font-semibold text-lg mb-1">{t(interest.labelKey)}</h4>
                  <p className="text-sm text-muted-foreground font-body">{t(interest.descKey)}</p>
                </div>
              </div>
            </StickyNote>
          );
        })}
      </div>

      {(data.interests || []).length > 0 && (
        <div className="text-center p-4 bg-primary/10 rounded-lg">
          <p className="font-body text-sm">
            {t('interests.selected', { count: (data.interests || []).length })}
          </p>
        </div>
      )}

      <div className="flex justify-center gap-4 pt-8">
        {onBack && (
          <Button
            size="lg"
            variant="outline"
            onClick={onBack}
            className="px-8 py-6 text-lg rounded-full"
            data-testid="button-back-interests"
          >
            {t('nav.back')}
          </Button>
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-interests"
        >
          {t('nav.continue')}
        </Button>
      </div>
    </div>
  );
}
