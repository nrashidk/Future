/**
 * The assessment step order — the single source of truth for both tiers.
 *
 * WHY this module exists (docs/v2-phase3-recon.md §5): the step order was
 * encoded in THREE unsynchronised places — the 7-way conditional in
 * Assessment.tsx, the `totalSteps` constant, and ProgressTracker's title arrays.
 * They had already drifted: a free student sitting on the Quiz was shown the
 * label "Results", because freeStepTitles listed a step order the conditional
 * had never implemented. One array, derived everywhere, removes that bug class.
 *
 * SPEC (docs/v2-rebuild-plan.md L2/L3):
 *   steps 1-4 are IDENTICAL for both tiers — the shared spine — then they
 *   diverge, and Aspirations is always the last input step.
 */

/**
 * Steps 1-4, identical for both tiers. L2's "shared 4-step spine".
 *
 * COUNTRY PRECEDES SUBJECTS deliberately: country + curriculum are the frame the
 * subject list is chosen inside, so they are declared first. Today SubjectsStep
 * still renders a fixed six-subject list, but the quiz already filters its
 * question pool by {countryId, grade, curriculum} (server/routes/quiz.routes.ts),
 * and this ordering is the precondition for a curriculum-scoped subject list.
 */
export const SPINE_STEP_IDS = ['basicInfo', 'country', 'subjects', 'quiz'] as const;

/** FREE: spine → Interests → Aspirations → Results. No RIASEC, no CVQ. */
export const FREE_STEP_IDS = [
  ...SPINE_STEP_IDS,
  'interests',
  'aspirations',
  'results',
] as const;

/** PREMIUM: spine → RIASEC → CVQ → Aspirations → Results. No Interests. */
export const PREMIUM_STEP_IDS = [
  ...SPINE_STEP_IDS,
  'careerPersonality',
  'personalValues',
  'aspirations',
  'results',
] as const;

export type StepId = (typeof FREE_STEP_IDS)[number] | (typeof PREMIUM_STEP_IDS)[number];

export function stepIdsForTier(isPremium: boolean): readonly StepId[] {
  return isPremium ? PREMIUM_STEP_IDS : FREE_STEP_IDS;
}

/**
 * Total steps shown to the student: 7 free, 8 premium.
 *
 * This COUNTS 'results', which Assessment.tsx does not render — completion
 * redirects to /results. Counting it is what makes the two tiers agree: before
 * Phase 3 both were hardcoded to 7, but premium's 7 excluded Results while
 * free's 7 included a "Results" label on what was actually the Quiz.
 *
 * Consequence, and it is intended: the progress bar reads 6-of-7 (free) and
 * 7-of-8 (premium) on the Aspirations step rather than 100%. The student is not
 * finished there — generation still has to run — so claiming 100% was the less
 * honest reading.
 */
export function totalStepsForTier(isPremium: boolean): number {
  return stepIdsForTier(isPremium).length;
}

/** 1-based step number of a step id, or null if that tier has no such step. */
export function stepNumberOf(isPremium: boolean, id: StepId): number | null {
  const index = stepIdsForTier(isPremium).indexOf(id);
  return index === -1 ? null : index + 1;
}

/**
 * The last step that collects input — Aspirations for both tiers (L3), so 6
 * free and 7 premium. This is where report generation fires, and where a
 * refresh means "generation may be in flight" rather than "resume the form".
 */
export function finalInputStep(isPremium: boolean): number {
  return stepNumberOf(isPremium, 'aspirations')!;
}

/** The fields deriveFreeResumeStep inspects. Satisfied by `Assessment` as-is. */
export interface ResumableAssessment {
  name?: string | null;
  age?: number | null;
  grade?: string | null;
  gender?: string | null;
  favoriteSubjects?: string[] | null;
  countryId?: string | null;
  interests?: string[] | null;
  careerAspirations?: string[] | null;
}

const hasItems = (v: unknown[] | null | undefined): boolean => Array.isArray(v) && v.length > 0;

/**
 * Where to resume a FREE assessment — derived from the DATA PRESENT, never from
 * the stored `assessments.currentStep`.
 *
 * THE PROBLEM (docs/v2-phase3-recon.md §6b). Phase 3 renumbered the free flow,
 * and the Country/Subjects swap renumbered it again: pre-Phase-3 step 3 was
 * Interests and step 5 was Country; post-Phase-3 step 2 was Subjects and step 3
 * Country; now step 2 is Country and step 3 Subjects. `assessments.currentStep`
 * is a DATABASE column read by cross-device resume, so unlike the sessionStorage
 * draft it cannot be discarded by versioning a key — every free assessment in
 * flight at deploy time carries a number in some earlier numbering. Trusting it
 * would drop a student into a step whose prerequisites were never collected, and
 * generation would then 400 on a component they were never shown.
 *
 * Note the check order below MUST track SPINE_STEP_IDS. It returns the first
 * step whose input is missing, so country is tested before subjects; testing
 * subjects first would resume a country-less student past Country, and
 * collectMissingComponents would then 400 on "Country Selection".
 *
 * THE FIX. The stored number is not translatable, but it is also not needed: the
 * data itself says how far the student got. This returns the first step whose
 * input is missing, so it is correct under the old numbering, the new one, and
 * any future one.
 *
 * WHY THE QUIZ IS NOT CHECKED. The quiz is SKIPPABLE — when no questions exist
 * for the student's country/subjects, QuizStep renders a "continue" button that
 * advances without submitting (QuizStep.tsx:181, :202), leaving `quizScore`
 * null. Gating on it would pin such a student at step 4 on every single resume.
 * Instead, a student who has Country but not Interests resumes AT the quiz: it
 * is the earlier of the two possible positions, and re-entering it is
 * idempotent because QuizStep auto-advances when the quiz is already complete
 * (QuizStep.tsx:56-59) and re-offers the skip button when it is not.
 *
 * Premium is NOT covered by this and must not use it: premium's step numbering
 * is unchanged by Phase 3, so its stored `currentStep` stays valid.
 */
export function deriveFreeResumeStep(assessment: ResumableAssessment): number {
  const basicInfoComplete =
    !!assessment.name &&
    assessment.age !== null && assessment.age !== undefined &&
    !!assessment.grade &&
    !!assessment.gender;

  if (!basicInfoComplete) return stepNumberOf(false, 'basicInfo')!;      // 1
  if (!assessment.countryId) return stepNumberOf(false, 'country')!;     // 2
  if (!hasItems(assessment.favoriteSubjects)) return stepNumberOf(false, 'subjects')!;  // 3

  // Interests missing → the student is at the Quiz or at Interests. Resume at
  // the Quiz; it self-advances if already done. See the note above.
  if (!hasItems(assessment.interests)) return stepNumberOf(false, 'quiz')!;  // 4

  // Everything up to Interests is in. Aspirations is the only input left —
  // whether it holds a value or not, that is where an unfinished free
  // assessment belongs, because generation fires from there.
  return stepNumberOf(false, 'aspirations')!;                            // 6
}
