/**
 * WEF Skills Profile Orchestrator
 * 
 * Coordinates data extraction, calculation, and persistence of WEF skills
 * from existing assessment data without requiring new student responses.
 */

import type { IStorage } from "../storage";
import type { Assessment } from "@shared/schema";
import { buildWEFAssessmentData, hasWEFData } from "./wefDataExtractor";
import { calculateWEFSkills, WEF_SKILL_TO_COLUMN } from "./wefSkillsCalculator";

/**
 * Sync WEF skills profile for an assessment
 * 
 * Orchestrates: extract data → calculate scores → persist to database
 * Non-blocking: logs errors but doesn't throw to avoid breaking recommendation flow
 */
export async function syncWEFSkillsProfile(
  storage: IStorage,
  assessment: Assessment
): Promise<boolean> {
  try {
    // Extract assessment data
    const assessmentData = await buildWEFAssessmentData(storage, assessment);

    // Skip if no data available
    if (!hasWEFData(assessmentData)) {
      console.log(`[WEF] Skipping assessment ${assessment.id}: insufficient data`);
      return false;
    }

    // Calculate WEF skills profile
    const profile = calculateWEFSkills(assessmentData);

    // Convert to snake_case keys for JSONB storage
    const skillScores: Record<string, number> = {};
    profile.scores.forEach(({ skillName, score }) => {
      // Convert "Critical Thinking and Problem Solving" → "critical_thinking"
      const snakeKey = skillName
        .toLowerCase()
        .replace(/ and /g, ' ')  // Remove "and"
        .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
        .replace(/^_+|_+$/g, '');  // Trim underscores
      
      skillScores[snakeKey] = score;
    });

    // Extract source attribution for provenance
    const sources = new Set<string>();
    profile.scores.forEach(score => {
      score.sources.forEach(src => sources.add(src.assessment));
    });
    const sourceAttribution = Array.from(sources).join(", ");

    // Upsert to database (idempotent)
    await storage.upsertWefCompetencyResult(
      assessment.id,
      assessment.userId,
      skillScores,
      sourceAttribution,
      assessment.isGuest,
      assessment.guestSessionId
    );

    console.log(`[WEF] Synced skills profile for assessment ${assessment.id}: ${profile.overallReadiness}% readiness`);
    return true;

  } catch (error) {
    // Non-blocking: log error but don't throw
    console.error(`[WEF] Failed to sync skills profile for assessment ${assessment.id}:`, error);
    return false;
  }
}
