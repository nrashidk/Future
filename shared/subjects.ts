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
 * A grade's LABEL in the requested language.
 *
 * Grades live on each country as a plain string array
 * (`countries.grade_levels`) with no Arabic anywhere, so an Arabic screen or
 * prompt had nothing to render but a bare number. This supplies the label and
 * nothing else.
 *
 * DELIBERATELY NO `GRADE_LEVELS` CONSTANT HERE. One was added alongside this
 * function and removed within the hour: grades are per-country data, and a
 * hardcoded list beside the column that actually holds them is a second source
 * of truth for the same fact -- the drift this codebase keeps producing. It
 * was also dead on arrival, since every caller already reads
 * `country.gradeLevels`. If a default is ever needed, it belongs next to the
 * column, not here.
 *
 * The VALUE is never localised: it is what `quiz_questions.grade` is matched
 * against, and Arabic-Indic digits would silently stop matching.
 */
export function gradeLabelFor(grade: string, lang: string): string {
  const n = String(grade).replace(/\D/g, "");
  if (!n) return String(grade);
  return lang === "ar" ? `الصف ${n}` : `Grade ${n}`;
}

/**
 * A CURRICULUM's name in the requested language.
 *
 * Curricula live on each country as a plain string array
 * (`countries.curricula`) with no Arabic column, and `GET /api/reference`
 * returned `nameAr: null` for every one of them. The reasoning recorded there
 * was that most curriculum names are proper nouns which stay in Latin script
 * inside Arabic text — "IB", "British", "CBSE" — and that is true and is why
 * the fallback below returns the name unchanged.
 *
 * IT IS NOT TRUE OF THE ONE CURRICULUM IN PRODUCTION. "MOE National" is the
 * UAE Ministry of Education's national curriculum, which has an ordinary
 * Arabic name, and an Arabic-language school administrator was being shown an
 * English string in the one field they must choose correctly before they can
 * enrol anybody.
 *
 * SAME SHAPE AS subjectNameFor ABOVE, and for the same reason: the server
 * cannot read the client's locale bundle, and a second copy of these strings
 * on the client is the drift this codebase keeps producing. Anything not
 * listed falls through to its own name, which is correct for a proper noun and
 * more honest than a placeholder for anything else.
 *
 * NO CURRICULUM_IDS CONSTANT, deliberately — the same trap gradeLabelFor
 * documents. Curricula are per-country data; a hardcoded list of them beside
 * the column that holds them would be a second source of truth for which
 * curricula exist, which is a different question from what they are called.
 */
export const CURRICULUM_NAMES_AR: Record<string, string> = {
  "MOE National": "المنهاج الوطني (وزارة التربية والتعليم)",
};

export function curriculumNameFor(name: string, lang: string): string {
  if (lang !== "ar") return name;
  return CURRICULUM_NAMES_AR[name] ?? name;
}
