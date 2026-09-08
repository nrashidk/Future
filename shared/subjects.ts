/**
 * The six umbrella subjects — the single source of truth for their canonical ids
 * and their i18n label keys.
 *
 * WHY THIS MODULE EXISTS. Each `id` must match `subjects.name` in the DB EXACTLY,
 * because it is stored on the assessment and later compared against
 * `quiz_questions.subject` to build the quiz pool — a drift silently yields an
 * empty question pool for that subject, with no error anywhere. SubjectsStep.tsx
 * carried that warning in a comment above a private array literal, while
 * Admin.tsx kept a second hand-maintained copy of the same six strings and the
 * two report pages knew about neither. One list, imported everywhere, is what
 * makes the warning enforceable instead of advisory.
 *
 * IDS ARE CANONICAL ENGLISH BY DESIGN and are never shown to a student as-is.
 * They are a database key that happens to be readable. Everything user-facing
 * goes through the label key, which is why the report pages printing the raw id
 * was a bug rather than a styling choice.
 *
 * NO REACT HERE, deliberately. SubjectsStep also attaches an icon and a colour to
 * each subject; both are client-only presentation, so they stay in the component,
 * keyed off the id. This module is imported by the server too (the premium action
 * step templates interpolate a subject name into Arabic prose), and pulling a
 * lucide component into shared/ would break that.
 */

export const SUBJECT_IDS = [
  "Mathematics",
  "Science",
  "English",
  "Arabic",
  "Social Studies",
  "Computer Science",
] as const;

export type SubjectId = (typeof SUBJECT_IDS)[number];

/**
 * id → i18n key, in the `assessment` namespace.
 *
 * The keys are stored bare (`subjects.subjectMathematics`) rather than
 * namespace-qualified because callers differ: SubjectsStep already runs under
 * `useTranslation('assessment')` and passes them straight to `t()`, while the
 * report pages run under `useTranslation('results')` and must prefix
 * `assessment:`. Both namespaces are preloaded (i18n/config.ts), so the prefix
 * costs nothing at runtime.
 */
export const SUBJECT_LABEL_KEYS: Record<SubjectId, string> = {
  "Mathematics": "subjects.subjectMathematics",
  "Science": "subjects.subjectScience",
  "English": "subjects.subjectEnglish",
  "Arabic": "subjects.subjectArabic",
  "Social Studies": "subjects.subjectSocialStudies",
  "Computer Science": "subjects.subjectComputerScience",
};

/**
 * The label key for a stored subject id, or undefined when the id is not one of
 * the six.
 *
 * Returns undefined rather than a fallback key so the caller can decide what an
 * unknown subject looks like. That case is real: `quiz_questions.subject` and
 * `subjects.name` are free text server-side, so a subject seeded outside this
 * list can reach a report. Showing its raw id is the honest answer there —
 * better than a missing-key placeholder, and better than hiding a score the
 * student earned.
 */
export function subjectLabelKey(id: string): string | undefined {
  return SUBJECT_LABEL_KEYS[id as SubjectId];
}
