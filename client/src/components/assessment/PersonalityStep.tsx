import { useState } from "react";
import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "react-i18next";

interface PersonalityStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
}

const questions = [
  {
    id: "teamwork",
    question: "I prefer to work...",
    options: [
      { value: "1", label: "Alone, focusing on my own tasks" },
      { value: "2", label: "Sometimes alone, sometimes with others" },
      { value: "3", label: "In a team, collaborating with others" },
    ],
  },
  {
    id: "learning",
    question: "When learning something new, I like to...",
    options: [
      { value: "1", label: "Read about it and study theory" },
      { value: "2", label: "Mix theory with hands-on practice" },
      { value: "3", label: "Jump in and learn by doing" },
    ],
  },
  {
    id: "planning",
    question: "I approach tasks by...",
    options: [
      { value: "1", label: "Planning everything in detail first" },
      { value: "2", label: "Having a general plan then adapting" },
      { value: "3", label: "Being spontaneous and flexible" },
    ],
  },
  {
    id: "problem",
    question: "When facing a problem, I...",
    options: [
      { value: "1", label: "Analyze it logically and systematically" },
      { value: "2", label: "Look for creative and innovative solutions" },
      { value: "3", label: "Seek advice and work with others" },
    ],
  },
];

export function PersonalityStep({ data, onUpdate, onNext, onBack }: PersonalityStepProps) {
  const { t } = useTranslation('assessment');
  const [answers, setAnswers] = useState<Record<string, string>>(data.personalityTraits || {});

  const handleAnswerChange = (questionId: string, value: string) => {
    const newAnswers = { ...answers, [questionId]: value };
    setAnswers(newAnswers);
    onUpdate("personalityTraits", newAnswers);
  };

  const canProceed = Object.keys(answers).length === questions.length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('personality.title')}</h2>
        <p className="text-lg text-muted-foreground font-body">
          {t('personality.subtitle')}
        </p>
      </div>

      <div className="space-y-6">
        {questions.map((q, index) => (
          <StickyNote
            key={q.id}
            color={["yellow", "pink", "blue", "green"][index % 4] as any}
            rotation={index % 2 === 0 ? "1" : "-1"}
          >
            <h4 className="font-semibold text-lg mb-4">{q.question}</h4>
            <RadioGroup
              value={answers[q.id] || ""}
              onValueChange={(value) => handleAnswerChange(q.id, value)}
              className="space-y-3"
            >
              {q.options.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center space-x-3 p-3 rounded-lg hover-elevate bg-background/30 cursor-pointer"
                >
                  <RadioGroupItem value={option.value} id={`${q.id}-${option.value}`} />
                  <Label
                    htmlFor={`${q.id}-${option.value}`}
                    className="flex-1 cursor-pointer font-body"
                  >
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </StickyNote>
        ))}
      </div>

      <div className="flex justify-center gap-4 pt-8">
        {onBack && (
          <Button
            size="lg"
            variant="outline"
            onClick={onBack}
            className="px-8 py-6 text-lg rounded-full"
            data-testid="button-back-personality"
          >
            {t('nav.back')}
          </Button>
        )}
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-personality"
        >
          {t('nav.continue')}
        </Button>
      </div>
    </div>
  );
}
