import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Atom, FlaskConical, Dna, Computer, BookOpen, Landmark, Globe2, DollarSign, Briefcase, Palette, Music, Star, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

interface SubjectsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
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

const MAX_PRIORITY_SUBJECTS = 3;

export function SubjectsStep({ data, onUpdate, onNext, onBack }: SubjectsStepProps) {
  const [phase, setPhase] = useState<"select" | "prioritize">("select");
  
  const favoriteSubjects = data.favoriteSubjects || [];
  const prioritySubjects = data.prioritySubjects || [];
  
  useEffect(() => {
    if (prioritySubjects.length > 0 && favoriteSubjects.length > 0) {
      const validPriorities = prioritySubjects.filter((s: string) => favoriteSubjects.includes(s));
      if (validPriorities.length !== prioritySubjects.length) {
        onUpdate("prioritySubjects", validPriorities);
      }
    }
  }, [favoriteSubjects, prioritySubjects, onUpdate]);

  const toggleSubject = (subjectId: string) => {
    const current = favoriteSubjects;
    if (current.includes(subjectId)) {
      onUpdate("favoriteSubjects", current.filter((s: string) => s !== subjectId));
      if (prioritySubjects.includes(subjectId)) {
        onUpdate("prioritySubjects", prioritySubjects.filter((s: string) => s !== subjectId));
      }
    } else {
      onUpdate("favoriteSubjects", [...current, subjectId]);
    }
  };

  const togglePriority = (subjectId: string) => {
    if (prioritySubjects.includes(subjectId)) {
      onUpdate("prioritySubjects", prioritySubjects.filter((s: string) => s !== subjectId));
    } else if (prioritySubjects.length < MAX_PRIORITY_SUBJECTS) {
      onUpdate("prioritySubjects", [...prioritySubjects, subjectId]);
    }
  };

  const handleContinueFromSelect = () => {
    if (favoriteSubjects.length >= 4) {
      setPhase("prioritize");
    } else {
      // With 1-3 subjects, they are automatically the priority subjects
      onUpdate("prioritySubjects", favoriteSubjects.slice(0, MAX_PRIORITY_SUBJECTS));
      onNext();
    }
  };

  const canProceedFromSelect = favoriteSubjects.length > 0;
  const canProceedFromPrioritize = prioritySubjects.length > 0;

  if (phase === "select") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">What Subjects Do You Love?</h2>
          <p className="text-lg text-muted-foreground font-body">
            Select all the subjects you enjoy learning (choose as many as you like!)
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {subjects.map((subject) => {
            const Icon = subject.icon;
            const isSelected = favoriteSubjects.includes(subject.id);

            return (
              <StickyNote
                key={subject.id}
                color={subject.color}
                rotation={Math.random() > 0.5 ? "1" : "-1"}
                selected={isSelected}
                onClick={() => toggleSubject(subject.id)}
                className="cursor-pointer text-center p-4 transition-transform"
                data-testid={`subject-${subject.id.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                <p className="font-semibold text-sm">{subject.label}</p>
                {isSelected && (
                  <CheckCircle2 className="w-5 h-5 mx-auto mt-2 text-green-600" />
                )}
              </StickyNote>
            );
          })}
        </div>

        {favoriteSubjects.length > 0 && (
          <div className="text-center p-4 bg-primary/10 rounded-lg">
            <p className="font-body text-sm">
              <span className="font-semibold">{favoriteSubjects.length}</span> subject{favoriteSubjects.length !== 1 ? 's' : ''} selected
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
              data-testid="button-back-subjects"
            >
              Back
            </Button>
          )}
          <Button
            size="lg"
            onClick={handleContinueFromSelect}
            disabled={!canProceedFromSelect}
            className="px-12 py-6 text-lg rounded-full shadow-lg"
            data-testid="button-next-subjects"
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">Which Subjects Matter Most?</h2>
        <p className="text-lg text-muted-foreground font-body">
          Mark up to {MAX_PRIORITY_SUBJECTS} subjects as your top priorities for career planning
        </p>
        <p className="text-sm text-muted-foreground font-body mt-2">
          Priority subjects will get more quiz questions to better assess your knowledge
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-6">
        {favoriteSubjects.map((subjectId: string) => {
          const subject = subjects.find(s => s.id === subjectId);
          if (!subject) return null;
          const isPriority = prioritySubjects.includes(subjectId);
          const Icon = subject.icon;
          
          return (
            <button
              key={subjectId}
              onClick={() => togglePriority(subjectId)}
              disabled={!isPriority && prioritySubjects.length >= MAX_PRIORITY_SUBJECTS}
              className={`
                flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200
                ${isPriority 
                  ? 'bg-primary/20 border-primary shadow-lg scale-105' 
                  : 'bg-card border-border hover:border-primary/50 hover:bg-primary/5'}
                ${!isPriority && prioritySubjects.length >= MAX_PRIORITY_SUBJECTS 
                  ? 'opacity-50 cursor-not-allowed' 
                  : 'cursor-pointer'}
              `}
              data-testid={`priority-${subjectId.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <Icon className={`w-5 h-5 ${isPriority ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`font-medium ${isPriority ? 'text-primary' : ''}`}>
                {subject.label}
              </span>
              {isPriority && (
                <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="text-center p-4 bg-primary/10 rounded-lg">
        <div className="flex items-center justify-center gap-2">
          <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
          <p className="font-body text-sm">
            <span className="font-semibold">{prioritySubjects.length}</span> of {MAX_PRIORITY_SUBJECTS} priority subjects selected
          </p>
        </div>
        {prioritySubjects.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {prioritySubjects.map((subjectId: string) => {
              const subject = subjects.find(s => s.id === subjectId);
              return subject ? (
                <Badge key={subjectId} variant="secondary" className="bg-primary/20">
                  {subject.label}
                </Badge>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="bg-card border rounded-lg p-4">
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          Why mark priority subjects?
        </h4>
        <ul className="text-sm text-muted-foreground space-y-1 font-body">
          <li>Priority subjects receive more quiz questions (4 instead of 2)</li>
          <li>Better assessment of your knowledge in areas that matter most to you</li>
          <li>Career recommendations will focus more on these subjects</li>
        </ul>
      </div>

      <div className="flex justify-center gap-4 pt-8">
        <Button
          size="lg"
          variant="outline"
          onClick={() => setPhase("select")}
          className="px-8 py-6 text-lg rounded-full"
          data-testid="button-back-to-select"
        >
          Back
        </Button>
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceedFromPrioritize}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-priorities"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
