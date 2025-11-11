import { Button } from "@/components/ui/button";

interface CVQStepProps {
  responses: Record<string, number>;
  onUpdate: (responses: Record<string, number>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function CVQStep({ responses, onUpdate, onNext, onBack }: CVQStepProps) {
  const handleComplete = () => {
    // TODO: Implement full CVQ assessment in Task 10
    // For now, just pass through with empty responses
    onUpdate({});
    onNext();
  };

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="bg-card border rounded-lg p-8 shadow-sm">
        <h2 className="text-2xl font-bold mb-4">Values Assessment</h2>
        <p className="text-muted-foreground mb-6">
          This step will assess your core values to better match you with careers.
        </p>
        <p className="text-sm text-muted-foreground italic mb-8">
          (Full CVQ implementation coming in Task 10)
        </p>
        
        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            Back
          </Button>
          <Button onClick={handleComplete} data-testid="button-next">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
