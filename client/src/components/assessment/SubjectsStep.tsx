import { StickyNote } from "@/components/StickyNote";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, Atom, BookOpen, Languages, Landmark, Computer, Star, CheckCircle2 } from "lucide-react";
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
// Hard ceiling on the selection. The quiz budget is a fixed 18 questions split
// across the chosen subjects, so allowing a 6th subject would thin every
// subject's share below a usable number - the cap is what keeps the total at 18.
const MAX_SUBJECTS = 5;

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

  // The six umbrella subjects. Each `id` must match subjects.name in the DB
  // EXACTLY, because it is stored on the assessment and later compared against
  // quiz_questions.subject to build the quiz pool - a drift here silently
  // yields an empty question pool for that subject.
  const subjects = [
    { id: "Mathematics", labelKey: "subjects.subjectMathematics", icon: Calculator, color: "blue" as const },
    { id: "Science", labelKey: "subjects.subjectScience", icon: Atom, color: "purple" as const },
    { id: "English", labelKey: "subjects.subjectEnglish", icon: BookOpen, color: "green" as const },
    { id: "Arabic", labelKey: "subjects.subjectArabic", icon: Languages, color: "yellow" as const },
    { id: "Social Studies", labelKey: "subjects.subjectSocialStudies", icon: Landmark, color: "pink" as const },
    { id: "Computer Science", labelKey: "subjects.subjectComputerScience", icon: Computer, color: "blue" as const },
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
    // At the cap a new subject cannot be added - the tile is already
    // non-clickable, this is the guard for any other caller. It returns before
    // anything else so a blocked add changes no state at all, least of all a
    // confirmed top three. De-selecting stays available below at any count, so
    // the student is never stuck.
    if (!current.includes(subjectId) && current.length >= MAX_SUBJECTS) return;
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

  const atMaxSubjects = favoriteSubjects.length >= MAX_SUBJECTS;
  const canProceedFromSelect = favoriteSubjects.length >= MIN_SUBJECTS;
  const canProceedFromPrioritize = prioritySubjects.length === MAX_PRIORITY_SUBJECTS;

  if (phase === "select") {
    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold mb-3">{t('subjects.title')}</h2>
          <p className="text-lg text-muted-foreground font-body">
            {t('subjects.subtitle', { min: MIN_SUBJECTS, max: MAX_SUBJECTS })}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {subjects.map((subject, index) => {
            const Icon = subject.icon;
            const isSelected = favoriteSubjects.includes(subject.id);
            // At the cap the remaining tiles are inert and greyed, mirroring how
            // the prioritize screen greys non-priority tiles once three are
            // starred. Selected tiles stay clickable so a swap is one tap away.
            const isDisabled = !isSelected && atMaxSubjects;

            return (
              <StickyNote
                key={subject.id}
                color={subject.color}
                // Alternating by index, not random: the tilt is a fixed property
                // of the tile's position, so it stays put across re-renders
                // instead of the whole grid re-tilting on every toggle.
                rotation={index % 2 === 0 ? "1" : "-1"}
                selected={isSelected}
                onClick={isDisabled ? undefined : () => toggleSubject(subject.id)}
                className={`text-center p-4 transition-transform ${
                  isDisabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                }`}
                data-testid={`subject-${subject.id.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                <p className="font-semibold text-sm">{t(subject.labelKey)}</p>
                {/* Always mounted, hidden when unselected: the tick keeps its
                    slot so selecting a tile never changes its height. Same
                    mx-auto/mt-2 centring as when it was mounted conditionally. */}
                <CheckCircle2
                  className={`w-5 h-5 mx-auto mt-2 text-green-600 ${isSelected ? "" : "invisible"}`}
                />
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
            {atMaxSubjects && (
              <p className="font-body text-sm text-muted-foreground" data-testid="text-max-subjects">
                {t('subjects.maxReached', { max: MAX_SUBJECTS })}
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
              // No scale-105 on the starred state: it made starred chips
              // physically larger than the greyed ones. Colour and shadow carry
              // the emphasis instead, so every chip keeps one size.
              className={`
                flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200
                ${isPriority
                  ? 'bg-primary/20 border-primary shadow-lg'
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
              {/* Reserved slot, same reason as the tick: hidden rather than
                  unmounted, so starring a chip does not widen it. */}
              <Star
                className={`w-5 h-5 text-yellow-500 fill-yellow-500 ${isPriority ? '' : 'invisible'}`}
              />
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
