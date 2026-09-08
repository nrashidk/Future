import { BookOpen, Star, Target, Brain, Heart, Zap, type LucideIcon } from "lucide-react";

/**
 * One entry of recommendations.component_breakdown (stored jsonb).
 * Produced by the matching service's componentScores[] and persisted per career.
 */
export interface ComponentBreakdownEntry {
  key: string;
  displayName: string;
  score: number;
  weight: number;
}

/**
 * Maps a scorer component key to its results-namespace i18n label key and icon,
 * so the career card renders labels/icons from the stored breakdown's `key`
 * rather than the blob's English displayName. Shared by Results.tsx and
 * ResultsPrint.tsx — do not duplicate in either file.
 */
export const COMPONENT_BREAKDOWN_META: Record<string, { labelKey: string; weightKey: string; Icon: LucideIcon }> = {
  subjects: { labelKey: "subjectMatch", weightKey: "weightSubjects", Icon: BookOpen },
  interests: { labelKey: "interestMatch", weightKey: "weightInterests", Icon: Star },
  vision: { labelKey: "visionAlignment", weightKey: "weightVision", Icon: Target },
  riasec: { labelKey: "riasecMatch", weightKey: "weightRiasec", Icon: Brain },
  cvq: { labelKey: "valuesMatch", weightKey: "weightCvq", Icon: Heart },
  wef_skills: { labelKey: "futureSkillsShort", weightKey: "weightWefSkills", Icon: Zap },
};

/**
 * The i18n key rendering one component's weight as a sentence, with the entry's
 * displayName supplied for components this map does not cover.
 *
 * ONE KEY SET, BOTH RENDERERS. Results.tsx and ResultsPrint.tsx previously said
 * the same thing by two mechanisms — t('weightLabel', {pct}) on screen and
 * `{weight}% {t('weightSuffix')}` in the PDF — so a change to one silently left
 * the other on the old wording. Both now come through here.
 *
 * THE FALLBACK IS LOAD-BEARING, not defensive padding. COMPONENT_BREAKDOWN_META
 * covers six keys; the scorer can emit others (marketDemand already has a label
 * in results.json and no entry here), and both renderers already fall back to
 * entry.displayName for the label. Without the generic sentence an unmapped
 * component would keep its score and lose its weight line — the one asymmetry
 * this change exists to remove.
 */
export function weightSentence(entry: ComponentBreakdownEntry): {
  key: string;
  vars: Record<string, string | number>;
} {
  const meta = COMPONENT_BREAKDOWN_META[entry.key];
  return meta
    ? { key: meta.weightKey, vars: { pct: entry.weight } }
    : { key: "weightGeneric", vars: { component: entry.displayName, pct: entry.weight } };
}

/**
 * The weight a component carries across this report, read from the first stored
 * breakdown that names it.
 *
 * Weights are TIER-level, not per-career (matching.ts:285-296 resolves one
 * effectiveWeight per component for the whole run), so every recommendation
 * agrees and the first hit is the answer.
 *
 * RETURNS null RATHER THAN A DEFAULT, and the callers omit their sentence on
 * null. The value this replaced was a hardcoded 20 in ResultsPrint.tsx, correct
 * only for tiers that happen to weight values at 20% — a wrong number printed
 * onto a PDF with total confidence. A missing clause is recoverable; a confident
 * wrong one is not.
 */
export function findComponentWeight(
  recommendations: { componentBreakdown?: unknown }[],
  key: string,
): number | null {
  for (const rec of recommendations) {
    const entry = ((rec.componentBreakdown ?? []) as ComponentBreakdownEntry[]).find(
      (e) => e.key === key,
    );
    if (entry) return entry.weight;
  }
  return null;
}
