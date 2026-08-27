import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Atom, FlaskConical, Dna, Computer, BookOpen, Landmark, Globe2, DollarSign, Briefcase, Palette, Music, Star, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

interface SubjectsStepProps {
  data: any;
  onUpdate: (field: string, value: any) => void;
  onNext: () => void;
  onBack?: () => void;
}

const MAX_PRIORITY_SUBJECTS = 3;
// A student must pick at least this many subjects before continuing. It equals
// MAX_PRIORITY_SUBJECTS on purpose: at exactly this count the selection IS the
// priority set, above it the student must rank an explicit top three.
const MIN_SUBJECTS = 3;

export function SubjectsStep({ data, onUpdate, onNext, onBack }: SubjectsStepProps) {
  const { t } = useTranslation('assessment');
  const [phase, setPhase] = useState<"select" | "prioritize">("select");
  // Priorities count as the student's own only when they marked them on the
  // prioritize screen during THIS visit to the step, against THIS subject list.
  // Anything else — a set hydrated from a resumed draft, or the three carried
  // over from the exactly-3 rule before a 4th subject was added — is not a
  // ranking the student made, so it is cleared and asked for again rather than
  // shown pre-selected.
  const [prioritiesConfirmed, setPrioritiesConfirmed] = useState(false);

  const subjects = [
    { id: "Mathematics", labelKey: "subjects.subjectMathematics", icon: Calculator, color: "blue" as const },
    { id: "Physics", labelKey: "subjects.subjectPhysics", icon: Atom, color: "purple" as const },
    { id: "Chemistry", labelKey: "subjects.subjectChemistry", icon: FlaskConical, color: "green" as const },
    { id: "Biology", labelKey: "subjects.subjectBiology", icon: Dna, color: "yellow" as const },
    { id: "Computer Science", labelKey: "subjects.subjectComputerScience", icon: Computer, color: "pink" as const },
    { id: "English", labelKey: "subjects.subjectEnglish", icon: BookOpen, color: "blue" as const },
    { id: "History", labelKey: "subjects.subjectHistory", icon: Landmark, color: "purple" as const },
    { id: "Geography", labelKey: "subjects.subjectGeography", icon: Globe2, color: "green" as const },
    { id: "Economics", labelKey: "subjects.subjectEconomics", icon: DollarSign, color: "yellow" as const },
    { id: "Business", labelKey: "subjects.subjectBusiness", icon: Briefcase, color: "pink" as const },
    { id: "Art", labelKey: "subjects.subjectArt", icon: Palette, color: "blue" as const },
    { id: "Music", labelKey: "subjects.subjectMusic", icon: Music, color: "purple" as const },
  ];

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
    // Any change to the subject list invalidates a previously marked top three:
    // it was ranked against a different list.
    setPrioritiesConfirmed(false);
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
    let next: string[] | null = null;
    if (prioritySubjects.includes(subjectId)) {
      next = prioritySubjects.filter((s: string) => s !== subjectId);
    } else if (prioritySubjects.length < MAX_PRIORITY_SUBJECTS) {
      next = [...prioritySubjects, subjectId];
    }
    if (!next) return; // cap reached — un-star one first
    onUpdate("prioritySubjects", next);
    // A complete set of exactly MAX_PRIORITY_SUBJECTS marked here is the
    // student's own ranking, so it survives a Back/Continue loop on this step.
    setPrioritiesConfirmed(next.length === MAX_PRIORITY_SUBJECTS);
  };

  const handleContinueFromSelect = () => {
    // Below the minimum there is nothing to prioritise — the button is disabled,
    // this is the guard for any other caller.
    if (favoriteSubjects.length < MIN_SUBJECTS) return;

    if (favoriteSubjects.length === MIN_SUBJECTS) {
      // Exactly three: the three chosen subjects ARE the priorities. They are
      // named on screen above this button before it is pressed, so this records
      // what the student was shown — it is not a hidden slice of a longer list.
      onUpdate("prioritySubjects", [...favoriteSubjects]);
      onNext();
      return;
    }

    // Four or more: an explicit ranking is required. Start from an empty set
    // unless the student already marked one for this exact subject list.
    if (!prioritiesConfirmed && prioritySubjects.length > 0) {
      onUpdate("prioritySubjects", []);
    }
    setPhase("prioritize");
  };

  const canProceedFromSelect = favoriteSubjects.length >= MIN_SUBJECTS;
  const canProceedFromPrioritize = prioritySubjects.length === MAX_PRIORITY_SUBJECTS;

  if (phase === "select") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">{t('subjects.title')}</h2>
          <p className="text-lg text-muted-foreground font-body">
            {t('subjects.subtitle')}
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
                <p className="font-semibold text-sm">{t(subject.labelKey)}</p>
                {isSelected && (
                  <CheckCircle2 className="w-5 h-5 mx-auto mt-2 text-green-600" />
                )}
              </StickyNote>
            );
          })}
        </div>

        {favoriteSubjects.length > 0 && (
          <div className="text-center p-4 bg-primary/10 rounded-lg space-y-2">
            <p className="font-body text-sm">
              {t('subjects.selected', { count: favoriteSubjects.length })}
            </p>
            {favoriteSubjects.length < MIN_SUBJECTS && (
              <p className="font-body text-sm text-destructive" data-testid="text-min-subjects">
                {t('subjects.minRequired', { min: MIN_SUBJECTS })}
              </p>
            )}
          </div>
        )}

        {/* Exactly MIN_SUBJECTS selected: these subjects are the priority set.
            Named here so the student sees the priorities before Continue writes
            them, instead of having them assigned silently. */}
        {favoriteSubjects.length === MIN_SUBJECTS && (
          <div className="text-center p-4 bg-card border rounded-lg" data-testid="panel-auto-priority">
            <div className="flex items-center justify-center gap-2">
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              <p className="font-body text-sm font-semibold">
                {t('subjects.autoPriorityNotice', { min: MIN_SUBJECTS })}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              {favoriteSubjects.map((subjectId: string) => {
                const subject = subjects.find(s => s.id === subjectId);
                return subject ? (
                  <Badge key={subjectId} variant="secondary" className="bg-primary/20">
                    {t(subject.labelKey)}
                  </Badge>
                ) : null;
              })}
            </div>
            <p className="text-xs text-muted-foreground font-body mt-3">
              {t('subjects.autoPriorityHint', { max: MAX_PRIORITY_SUBJECTS })}
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
              {t('nav.back')}
            </Button>
          )}
          <Button
            size="lg"
            onClick={handleContinueFromSelect}
            disabled={!canProceedFromSelect}
            className="px-12 py-6 text-lg rounded-full shadow-lg"
            data-testid="button-next-subjects"
          >
            {t('nav.continue')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-bold mb-3">{t('subjects.priorityTitle')}</h2>
        <p className="text-lg text-muted-foreground font-body">
          {t('subjects.prioritySubtitle', { max: MAX_PRIORITY_SUBJECTS })}
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
                {t(subject.labelKey)}
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
            {t('subjects.prioritySelected', { count: prioritySubjects.length, max: MAX_PRIORITY_SUBJECTS })}
          </p>
        </div>
        {prioritySubjects.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-3">
            {prioritySubjects.map((subjectId: string) => {
              const subject = subjects.find(s => s.id === subjectId);
              return subject ? (
                <Badge key={subjectId} variant="secondary" className="bg-primary/20">
                  {t(subject.labelKey)}
                </Badge>
              ) : null;
            })}
          </div>
        )}
      </div>

      <div className="bg-card border rounded-lg p-4">
        <h4 className="font-semibold mb-2 flex items-center gap-2">
          <Star className="w-4 h-4 text-yellow-500" />
          {t('subjects.whyPriority')}
        </h4>
        <ul className="text-sm text-muted-foreground space-y-1 font-body">
          <li>{t('subjects.whyPriority1')}</li>
          <li>{t('subjects.whyPriority2')}</li>
          <li>{t('subjects.whyPriority3')}</li>
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
          {t('nav.back')}
        </Button>
        <Button
          size="lg"
          onClick={onNext}
          disabled={!canProceedFromPrioritize}
          className="px-12 py-6 text-lg rounded-full shadow-lg"
          data-testid="button-next-priorities"
        >
          {t('nav.continue')}
        </Button>
      </div>
    </div>
  );
}
