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

/**
 * id → Arabic name, FOR THE SERVER.
 *
 * SUBJECT_LABEL_KEYS above solves this for the client, which has i18n. The
 * server does not: it builds the Arabic report narrative, and it had no Arabic
 * subject vocabulary at all. So an Arabic report said "Science" and
 * "Mathematics" in English, inside Arabic prose, joined with an Arabic
 * conjunction -- `premiumNarratives.ts` picks the separator by language and
 * then interpolates untranslated names.
 *
 * The strings are copied from client/public/locales/ar/assessment.json rather
 * than written fresh, so the name a student picks on screen and the name their
 * report prints are the same words. If one changes, change both -- they are
 * two copies by necessity (the server cannot read the locale bundles), which
 * is why subjectNameFor is the only way either side should reach them.
 */
export const SUBJECT_NAMES_AR: Record<SubjectId, string> = {
  "Mathematics": "الرياضيات",
  "Science": "العلوم",
  "English": "اللغة الإنجليزية",
  "Arabic": "اللغة العربية",
  "Social Studies": "الدراسات الاجتماعية",
  "Computer Science": "علوم الحاسب",
};

/**
 * A subject's name in the requested language.
 *
 * Falls back to the id for anything outside the six, for the same reason
 * subjectLabelKey returns undefined: `subjects.name` is free text server-side,
 * so a subject seeded outside this list can reach a report, and printing what
 * it is called is more honest than hiding it or showing a placeholder.
 */
export function subjectNameFor(id: string, lang: string): string {
  if (lang !== "ar") return id;
  return SUBJECT_NAMES_AR[id as SubjectId] ?? id;
}

/**
 * The grade levels the platform assesses, with their labels.
 *
 * Grades live on each country as a plain string array (`countries.grade_levels`)
 * with no Arabic anywhere, so an Arabic screen or prompt had nothing to render
 * but the bare number. The numbers themselves are the stored values and must
 * not be localised -- Arabic-Indic digits here would stop matching
 * `quiz_questions.grade`.
 */
export const GRADE_LEVELS = ["8", "9", "10", "11", "12"] as const;
export type GradeLevel = (typeof GRADE_LEVELS)[number];

export function gradeLabelFor(grade: string, lang: string): string {
  const n = String(grade).replace(/\D/g, "");
  if (!n) return String(grade);
  return lang === "ar" ? `الصف ${n}` : `Grade ${n}`;
}
