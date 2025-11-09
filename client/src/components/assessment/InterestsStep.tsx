import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Laptop, Palette, Heart, Lightbulb, Dumbbell, Microscope, Users, TrendingUp } from "lucide-react";

interface InterestsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
}

const interests = [
  { id: "Technology", label: "Technology & Innovation", icon: Laptop, color: "blue" as const, description: "Building apps, coding, robotics" },
  { id: "Creative", label: "Creative Arts", icon: Palette, color: "pink" as const, description: "Design, music, writing" },
  { id: "Helping", label: "Helping Others", icon: Heart, color: "yellow" as const, description: "Healthcare, education, social work" },
  { id: "Problem Solving", label: "Problem Solving", icon: Lightbulb, color: "green" as const, description: "Analysis, strategy, innovation" },
  { id: "Physical", label: "Physical Activities", icon: Dumbbell, color: "purple" as const, description: "Sports, fitness, outdoors" },
  { id: "Research", label: "Research & Discovery", icon: Microscope, color: "blue" as const, description: "Science, investigation, learning" },
  { id: "Leadership", label: "Leadership & Team", icon: Users, color: "yellow" as const, description: "Managing, organizing, leading" },
  { id: "Business", label: "Business & Finance", icon: TrendingUp, color: "pink" as const, description: "Entrepreneurship, markets, money" },
];

export function InterestsStep({ data, onUpdate, onNext }: InterestsStepProps) {
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
        <h2 className="text-4xl font-bold mb-3">What Gets You Excited? ✨</h2>
        <p className="text-lg text-muted-foreground font-body">
          Choose the activities and topics that interest you most
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
                <div className="text-left">
                  <h4 className="font-semibold text-lg mb-1">{interest.label}</h4>
                  <p className="text-sm text-muted-foreground font-body">{interest.description}</p>
                </div>
              </div>
            </StickyNote>
          );
        })}
      </div>

      {(data.interests || []).length > 0 && (
        <div className="text-center p-4 bg-primary/10 rounded-lg">
          <p className="font-body text-sm">
            <span className="font-semibold">{(data.interests || []).length}</span> interest{(data.interests || []).length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-interests"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
