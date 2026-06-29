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
export const COMPONENT_BREAKDOWN_META: Record<string, { labelKey: string; Icon: LucideIcon }> = {
  subjects: { labelKey: "subjectMatch", Icon: BookOpen },
  interests: { labelKey: "interestMatch", Icon: Star },
  vision: { labelKey: "visionAlignment", Icon: Target },
  riasec: { labelKey: "riasecMatch", Icon: Brain },
  cvq: { labelKey: "valuesMatch", Icon: Heart },
  wef_skills: { labelKey: "futureSkillsShort", Icon: Zap },
};
