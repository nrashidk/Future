/**
 * Which components an assessment is still missing before a report can be
 * generated — the gate behind POST /api/recommendations/generate/:id.
 *
 * Extracted from the route handler so it can be unit-tested without a database.
 * The check it enforces is tier-shaped and easy to get wrong in a way that only
 * shows up as a 400 in production: Phase 3 removed the free PersonalityStep, and
 * had this requirement not been dropped in the same change, EVERY free report
 * would have failed to generate.
 *
 * The CVQ result lives in its own table, so the caller looks it up and passes
 * the answer in — that keeps this function pure.
 */

/** The assessment fields the gate inspects. Satisfied by `Assessment` as-is. */
export interface GateableAssessment {
  name?: string | null;
  age?: number | null;
  grade?: string | null;
  favoriteSubjects?: unknown;
  countryId?: string | null;
  // `unknown` deliberately: the column is JSONB and has held both a bare number
  // and an object with `.overall` (see the admin CSV export). The gate only ever
  // asks whether it is present, never what shape it is.
  quizScore?: unknown;
  riasecScores?: unknown;
  interests?: unknown;
  careerAspirations?: unknown;
}

const isEmptyList = (v: unknown): boolean => !Array.isArray(v) || v.length === 0;

export function collectMissingComponents(
  assessment: GateableAssessment,
  opts: { isPremium: boolean; hasCvqResult: boolean },
): string[] {
  const missing: string[] = [];

  // Core fields required for both tiers — these are the shared spine's output
  // (steps 1-3), so a student who reached the divergence has all of them.
  if (!assessment.name) missing.push("Name");
  if (!assessment.age) missing.push("Age");
  if (!assessment.grade) missing.push("Grade");
  if (isEmptyList(assessment.favoriteSubjects)) missing.push("Favorite Subjects");
  if (!assessment.countryId) missing.push("Country Selection");

  if (opts.isPremium) {
    if (assessment.quizScore === null || assessment.quizScore === undefined) {
      missing.push("Subject Competency Quiz");
    }
    // RIASEC is stored as JSONB on the assessment itself.
    if (!assessment.riasecScores || Object.keys(assessment.riasecScores as object).length === 0) {
      missing.push("Interest Inventory (RIASEC)");
    }
    // CVQ lives in the separate cvq_results table — resolved by the caller.
    if (!opts.hasCvqResult) {
      missing.push("Work Values Assessment (CVQ)");
    }
  } else {
    // Free tier requirements.
    //
    // NO personalityTraits check. The free flow's PersonalityStep was removed in
    // Phase 3 (L3: free is Basic → Subjects → Country → Quiz → Interests →
    // Aspirations), so nothing collects the field any more and requiring it
    // would 400 every new free report.
    //
    // Dropping it is safe for SCORING: there is no `personality` component in
    // any tier (server/services/tierWeights.ts:13-39 — free is subjects 35 /
    // interests 35 / vision 30), and assessments.personalityTraits has no reader
    // in the matching engine at all. Its only remaining consumers are the
    // display blocks in Results.tsx and ResultsPrint.tsx, which render only when
    // the field is non-empty and so keep working for reports generated earlier.
    //
    // NO quizScore check either, deliberately. Free now takes the quiz inside
    // the shared spine (step 4), so the value WILL normally be present — but the
    // quiz is skippable when no questions exist for the student's country, and
    // requiring it would also 400 every free assessment already in flight under
    // the old order where the quiz came last. See docs/v2-phase3-recon.md §2e.
    if (isEmptyList(assessment.interests)) missing.push("Interests");
    if (!assessment.careerAspirations) missing.push("Career Aspirations");
  }

  return missing;
}
