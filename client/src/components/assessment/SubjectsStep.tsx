import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Calculator, Atom, FlaskConical, Dna, Computer, BookOpen, Landmark, Globe2, DollarSign, Briefcase, Palette, Music } from "lucide-react";

interface SubjectsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
}

const subjects = [
  { id: "Mathematics", label: "Mathematics", icon: Calculator, color: "blue" as const },
  { id: "Physics", label: "Physics", icon: Atom, color: "purple" as const },
  { id: "Chemistry", label: "Chemistry", icon: FlaskConical, color: "green" as const },
  { id: "Biology", label: "Biology", icon: Dna, color: "yellow" as const },
  { id: "Computer Science", label: "Computer Science/IT", icon: Computer, color: "pink" as const },
  { id: "English", label: "English/Literature", icon: BookOpen, color: "blue" as const },
  { id: "History", label: "History", icon: Landmark, color: "purple" as const },
  { id: "Geography", label: "Geography", icon: Globe2, color: "green" as const },
  { id: "Economics", label: "Economics", icon: DollarSign, color: "yellow" as const },
  { id: "Business", label: "Business Studies", icon: Briefcase, color: "pink" as const },
  { id: "Art", label: "Art & Design", icon: Palette, color: "blue" as const },
  { id: "Music", label: "Music", icon: Music, color: "purple" as const },
];

export function SubjectsStep({ data, onUpdate, onNext }: SubjectsStepProps) {
  const toggleSubject = (subjectId: string) => {
    const current = data.favoriteSubjects || [];
    if (current.includes(subjectId)) {
      onUpdate("favoriteSubjects", current.filter((s: string) => s !== subjectId));
    } else {
      onUpdate("favoriteSubjects", [...current, subjectId]);
    }
  };

  const canProceed = (data.favoriteSubjects || []).length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">What Subjects Do You Love? 📚</h2>
        <p className="text-lg text-muted-foreground font-body">
          Select all the subjects you enjoy learning (choose as many as you like!)
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {subjects.map((subject) => {
          const Icon = subject.icon;
          const isSelected = (data.favoriteSubjects || []).includes(subject.id);

          return (
            <StickyNote
              key={subject.id}
              color={subject.color}
              rotation={Math.random() > 0.5 ? "1" : "-1"}
              selected={isSelected}
              onClick={() => toggleSubject(subject.id)}
              className="cursor-pointer text-center p-4 transition-transform"
            >
              <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold text-sm">{subject.label}</p>
            </StickyNote>
          );
        })}
      </div>

      {(data.favoriteSubjects || []).length > 0 && (
        <div className="text-center p-4 bg-primary/10 rounded-lg">
          <p className="font-body text-sm">
            <span className="font-semibold">{(data.favoriteSubjects || []).length}</span> subject{(data.favoriteSubjects || []).length !== 1 ? 's' : ''} selected
          </p>
        </div>
      )}

      <div className="flex justify-center pt-8">
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceed}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-subjects"
        >
          Continue →
        </Button>
      </div>
    </div>
  );
}
