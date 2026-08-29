/**
 * Dynamic Career Matching Service
 * 
 * Implements a modular, database-driven career matching algorithm that:
 * - Fetches active assessment components from database
 * - Delegates scoring to component-specific calculators
 * - Aggregates weighted results with validation
 * - Supports backwards compatibility with legacy assessments
 */

import type { IStorage, SectorCategoryRow } from "../storage";
import type { 
  Assessment, 
  Career, 
  AssessmentComponent,
  CareerComponentAffinity,
  JobMarketTrend,
  Country
} from "../../shared/schema";
import { type AssessmentTier, getEffectiveWeight } from "./tierWeights";
import { getEffectiveWeightFromDb, getTierConfig } from "./scoringConfig";
import { 
  INTEREST_LEXICON, 
  INTEREST_MATCHING_WEIGHTS, 
  findMatchingKeywords 
} from "./interestLexicon";

/**
 * Typed interfaces for JSONB fields
 */
export interface RiasecScores {
  R: number;
  I: number;
  A: number;
  S: number;
  E: number;
  C: number;
  top3?: string[];
  ranking?: Array<{ code: string; score: number }>;
}

/**
 * VISION-ALIGNMENT lookup structures, built once per assessment.
 *
 * `sectors` carries each priority sector's display name and its precomputed
 * rankFactor. `byCategory` and `byCareer` are the two candidate sources; see
 * calculateVisionScore for the OVERRIDE-EXCLUSIVE rule that keeps them apart.
 */
export interface SectorRelevance {
  sectorId: string;
  relevance: number; // 0-100
}

export interface SectorCategoryMap {
  /** sectorId -> display name (verbatim from countries.prioritySectors) + rank modifier */
  sectors: Map<string, { name: string; rankFactor: number }>;
  /** lowercased career.category -> candidate sectors */
  byCategory: Map<string, SectorRelevance[]>;
  /** careerId -> candidate sectors (per-career overrides) */
  byCareer: Map<string, SectorRelevance[]>;
}

/**
 * Hydrated context containing all data needed for matching
 */
export interface MatchingContext {
  assessment: Assessment;
  careers: Career[];
  activeComponents: AssessmentComponent[];
  careerAffinities: Map<string, CareerComponentAffinity[]>; // careerId -> affinities
  jobMarketTrends: Map<string, JobMarketTrend[]>; // careerId -> trends
  userCountry?: Country; // For vision alignment
  competencyScores?: Record<string, number>; // Subject competency scores from quiz (0-100)
  wefCompetencyScores?: Record<string, number>; // WEF skill scores (0-100)
  careerWefAffinities?: Map<string, Array<{ wefSkillId: string; affinityScore: number }>>; // careerId -> WEF affinities
  sectorCategoryMap?: SectorCategoryMap; // For vision alignment (sector <-> career category/override)
}

/**
 * Result from a single component calculator
 */
export interface ComponentScore {
  careerId: string;
  score: number; // 0-100
  reasoning: string;
  componentKey: string;
}

/**
 * Aggregated career match result
 */
export interface CareerMatch {
  career: Career;
  overallScore: number; // 0-100
  componentScores: {
    key: string;
    displayName: string;
    score: number;
    weight: number;
    reasoning: string;
  }[];
  appliedConfigVersion: string; // Hash of component config for auditability
}

/**
 * Component calculator function signature
 */
export type ComponentCalculator = (
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
) => ComponentScore | null;

/**
 * Registry mapping component keys to calculator functions
 */
const componentCalculators: Record<string, ComponentCalculator> = {
  subjects: calculateSubjectsScore,
  interests: calculateInterestsScore,
  vision: calculateVisionScore,
  riasec: calculateRiasecScore,
  cvq: calculateCvqScore,
  wef_skills: calculateWefSkillsScore,
};

/**
 * Main entry point: Generate career recommendations for an assessment
 */
export async function generateRecommendations(
  storage: IStorage,
  assessmentId: string
): Promise<CareerMatch[]> {
  // 1. Hydrate context with all required data
  const context = await hydrateMatchingContext(storage, assessmentId);

  // 2. Validate component weights sum to 100%
  validateComponentWeights(context);

  // 3. Calculate scores for each career
  const matches = context.careers.map(career => 
    calculateCareerMatch(context, career)
  );

  // 3b. Detection only: warn if a weighted component scored nothing catalog-wide
  warnOnInertComponents(context, matches);

  // 3c. Detection only: vision now returns the floor instead of null, so an
  // unseeded country can no longer trip warnOnInertComponents. Check it directly.
  warnOnEmptySectorCategoryMap(context);

  // 4. Filter and sort by overall score
  return matches
    .filter(match => match.overallScore >= 40) // Filter low matches
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 5); // Top 5 matches
}

/**
 * Hydrate all data needed for matching
 */
async function hydrateMatchingContext(
  storage: IStorage,
  assessmentId: string
): Promise<MatchingContext> {
  // Fetch assessment with competencies in a single query
  const { assessment, competencyScores } = await storage.getAssessmentWithCompetencies(assessmentId);

  // Fetch all careers
  const careers = await storage.getAllCareers();

  // Fetch active components (only those applicable to this user)
  const allComponents = await storage.getAllAssessmentComponents();
  const tier: AssessmentTier = assessment.assessmentType as AssessmentTier;
  
  // Try to get weights from database first, fallback to hardcoded
  const tierConfig = await getTierConfig(storage, tier);
  const useDbConfig = tierConfig !== null && tierConfig.totalWeight >= 95; // Use DB if weights are valid
  
  // Filter components and apply tier-specific weight overrides
  const activeComponentsPromises = allComponents
    .filter(component => {
      // Only include active components
      if (!component.isActive) return false;
      
      // Skip premium components if user doesn't have premium access
      if (component.requiresPremium && assessment.assessmentType === 'basic') {
        return false;
      }
      
      return true;
    })
    .map(async component => {
      // Apply tier-specific weight override (database-first, then hardcoded fallback)
      let effectiveWeight: number;
      
      if (useDbConfig && tierConfig) {
        const dbWeight = tierConfig.weights.get(component.key);
        effectiveWeight = (dbWeight?.isEnabled && dbWeight.weight > 0) ? dbWeight.weight : 0;
      } else {
        // Fallback to hardcoded weights
        effectiveWeight = getEffectiveWeight(tier, component.key, component.weight);
      }
      
      return {
        ...component,
        weight: effectiveWeight, // Use effective weight for this tier
      };
    });
  
  const resolvedComponents = await Promise.all(activeComponentsPromises);
  const activeComponents = resolvedComponents.filter(component => component.weight > 0); // Remove components with 0 weight

  // Bulk fetch career affinities for all careers and active components
  const careerIds = careers.map(c => c.id);
  const componentIds = activeComponents.map(c => c.id);
  const affinitiesArray = await storage.getCareerAffinitiesBulk(careerIds, componentIds);
  
  // Group affinities by careerId for efficient lookup
  const careerAffinities = groupAffinitiesByCareer(affinitiesArray);

  // Bulk fetch job market trends for all careers (filtered by user's country if available)
  const trendsArray = await storage.getJobTrendsByCareerIds(careerIds, assessment.countryId || undefined);
  
  // Group trends by careerId for efficient lookup
  const jobMarketTrends = groupTrendsByCareer(trendsArray);

  // Fetch user's country for vision alignment
  let userCountry: Country | undefined;
  if (assessment.countryId) {
    userCountry = await storage.getCountryById(assessment.countryId);
  }

  // Fetch the sector <-> career-category map for vision alignment (single query).
  let sectorCategoryMap: SectorCategoryMap | undefined;
  if (assessment.countryId) {
    try {
      const sectorRows = await storage.getSectorCategoryMap(assessment.countryId);
      sectorCategoryMap = buildSectorCategoryMap(sectorRows, userCountry);
    } catch (error) {
      console.warn('[Matching] Failed to load sector-category map:', error);
      sectorCategoryMap = undefined; // Vision falls back to the floor for every career
    }
  }

  // Fetch WEF data only if WEF component is active
  let wefCompetencyScores: Record<string, number> | undefined;
  let careerWefAffinities: Map<string, Array<{ wefSkillId: string; affinityScore: number }>> | undefined;
  
  const hasWefComponent = activeComponents.some(c => c.key === 'wef_skills');
  if (hasWefComponent) {
    // Fetch student's WEF scores for premium assessments
    if (assessment.assessmentType !== 'basic') {
      const wefResult = await storage.getWefCompetencyResultByAssessmentId(assessmentId);
      if (wefResult?.normalizedScores) {
        wefCompetencyScores = wefResult.normalizedScores as Record<string, number>;
      }
    }

    // Bulk fetch career-WEF skill affinities
    try {
      const wefAffinitiesArray = await storage.getCareerWefSkillAffinitiesBulk(careerIds);
      careerWefAffinities = groupWefAffinitiesByCareer(wefAffinitiesArray || []);
    } catch (error) {
      console.warn('[Matching] Failed to load WEF affinities:', error);
      careerWefAffinities = new Map(); // Fallback to empty map
    }
  }

  return {
    assessment,
    careers,
    activeComponents,
    careerAffinities,
    jobMarketTrends,
    userCountry,
    competencyScores,
    wefCompetencyScores,
    careerWefAffinities,
    sectorCategoryMap,
  };
}

/**
 * Helper: Group career affinities by careerId for efficient lookup
 */
function groupAffinitiesByCareer(
  affinities: CareerComponentAffinity[]
): Map<string, CareerComponentAffinity[]> {
  const map = new Map<string, CareerComponentAffinity[]>();
  
  for (const affinity of affinities) {
    if (!map.has(affinity.careerId)) {
      map.set(affinity.careerId, []);
    }
    map.get(affinity.careerId)!.push(affinity);
  }
  
  return map;
}

/**
 * Helper: Group job market trends by careerId for efficient lookup
 */
function groupTrendsByCareer(
  trends: JobMarketTrend[]
): Map<string, JobMarketTrend[]> {
  const map = new Map<string, JobMarketTrend[]>();
  
  for (const trend of trends) {
    if (!map.has(trend.careerId)) {
      map.set(trend.careerId, []);
    }
    map.get(trend.careerId)!.push(trend);
  }
  
  return map;
}

/**
 * Helper: Group WEF skill affinities by careerId for efficient lookup
 */
function groupWefAffinitiesByCareer(
  affinities: Array<{ careerId: string; wefSkillId: string; affinityScore: number }> | null | undefined
): Map<string, Array<{ wefSkillId: string; affinityScore: number }>> {
  const map = new Map<string, Array<{ wefSkillId: string; affinityScore: number }>>();
  
  if (!affinities) {
    return map;
  }
  
  for (const affinity of affinities) {
    if (!map.has(affinity.careerId)) {
      map.set(affinity.careerId, []);
    }
    map.get(affinity.careerId)!.push({
      wefSkillId: affinity.wefSkillId,
      affinityScore: affinity.affinityScore,
    });
  }
  
  return map;
}

/**
 * Helper: build the VISION-ALIGNMENT lookup from the flat LEFT JOIN rows.
 *
 * Rank: sectors are ordered by display_order; a sector's index i within that
 * ordered list yields rankFactor = 1 - 0.15 * (i / (n - 1)). Rank is therefore a
 * +/-15% modifier on relevance, not the primary signal (single sector => 1.0).
 *
 * ARABIC CONSTRAINT (hard rule): sector display names are canonicalised back to
 * the exact spelling in countries.prioritySectors. recommendations.routes.ts
 * localises reasoning text by string-substituting each countries.prioritySectors
 * entry for its prioritySectorsAr counterpart using a \b word-boundary regex, so
 * a name emitted with different casing/spacing than that array would never be
 * translated. Keep country_priority_sectors.name identical to the corresponding
 * countries.prioritySectors entry when seeding.
 */
export function buildSectorCategoryMap(
  rows: SectorCategoryRow[],
  userCountry?: Country,
): SectorCategoryMap {
  const sectors = new Map<string, { name: string; rankFactor: number }>();
  const byCategory = new Map<string, SectorRelevance[]>();
  const byCareer = new Map<string, SectorRelevance[]>();

  // Canonical spellings from countries.prioritySectors, keyed for loose lookup.
  const canonicalNames = new Map<string, string>();
  for (const name of (userCountry?.prioritySectors as string[] | undefined) ?? []) {
    canonicalNames.set(name.trim().toLowerCase(), name);
  }

  // Distinct sectors in display_order (rows arrive pre-sorted by the query).
  const orderedSectorIds: string[] = [];
  for (const row of rows) {
    if (!sectors.has(row.sectorId)) {
      orderedSectorIds.push(row.sectorId);
      const canonical = canonicalNames.get(row.sectorName.trim().toLowerCase());
      sectors.set(row.sectorId, {
        name: canonical ?? row.sectorName,
        rankFactor: 1, // Replaced below once n is known.
      });
    }
  }

  const n = orderedSectorIds.length;
  orderedSectorIds.forEach((sectorId, i) => {
    const entry = sectors.get(sectorId)!;
    entry.rankFactor = n > 1
      ? 1 - VISION_RANK_PENALTY * (i / (n - 1))
      : 1;
  });

  for (const row of rows) {
    if (row.relevance === null || row.relevance <= 0) {
      continue; // LEFT JOIN filler, or an explicit "not relevant" row.
    }
    const candidate: SectorRelevance = { sectorId: row.sectorId, relevance: row.relevance };

    if (row.careerId !== null) {
      // Per-career override.
      const list = byCareer.get(row.careerId) ?? [];
      list.push(candidate);
      byCareer.set(row.careerId, list);
    } else if (row.careerCategory !== null) {
      // Category rule.
      const key = row.careerCategory.trim().toLowerCase();
      const list = byCategory.get(key) ?? [];
      list.push(candidate);
      byCategory.set(key, list);
    }
  }

  return { sectors, byCategory, byCareer };
}

/**
 * Validate that component weights sum to 100%
 */
function validateComponentWeights(context: MatchingContext): void {
  const totalWeight = context.activeComponents.reduce(
    (sum, component) => sum + component.weight,
    0
  );

  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new Error(
      `Component weights must sum to 100%. Current total: ${totalWeight}%. ` +
      `Active components: ${context.activeComponents.map(c => `${c.key}(${c.weight}%)`).join(', ')}`
    );
  }
}

/**
 * Detect components that are configured with weight but contribute nothing.
 *
 * validateComponentWeights checks CONFIGURED weights sum to 100%. It cannot see
 * APPLIED weight: calculateCareerMatch skips null results and normalizes by
 * totalAppliedWeight, so a component whose calculator returns null (or 0) for the
 * entire catalog is silently dropped and its weight redistributed across the rest.
 * That is how a 25%-weighted component can be dead without any signal.
 *
 * This is detection only — it reads the computed matches and logs. It does not
 * alter any score, weight, or ordering.
 */
function warnOnInertComponents(
  context: MatchingContext,
  matches: CareerMatch[]
): void {
  const careerCount = matches.length;
  if (careerCount === 0) {
    return; // Empty catalog: nothing to conclude.
  }

  const tier = context.assessment.assessmentType;

  for (const component of context.activeComponents) {
    if (component.weight <= 0) {
      continue; // Not carrying weight for this tier — nothing to warn about.
    }

    let scored = 0; // calculator returned a score > 0
    let zeroed = 0; // calculator returned a score, but it was 0

    for (const match of matches) {
      const componentScore = match.componentScores.find(s => s.key === component.key);
      if (componentScore === undefined) {
        continue; // Calculator returned null for this career.
      }
      if (componentScore.score > 0) {
        scored++;
      } else {
        zeroed++;
      }
    }

    if (scored > 0) {
      continue; // Contributing something somewhere — not inert.
    }

    const nulled = careerCount - zeroed;
    const breakdown = zeroed === 0
      ? `null for all ${careerCount}`
      : `${nulled} null, ${zeroed} zero`;

    console.warn(
      `SCORING WARNING: component '${component.key}' has weight ${component.weight} ` +
      `for tier '${tier}' but returned null/zero for all ${careerCount} careers ` +
      `(${breakdown}) — it is contributing nothing and its weight is being silently ` +
      `redistributed across the remaining components.`
    );
  }
}

/**
 * Detect a country whose VISION-ALIGNMENT map was never seeded.
 *
 * calculateVisionScore returns the floor (40) rather than null when a career has
 * no mapping, which is correct per-career (a Chef really does map to nothing) but
 * means an entirely unseeded country produces a flat 40 across the catalog -
 * scores > 0 everywhere, so warnOnInertComponents stays silent. This makes that
 * specific mis-onboarding visible.
 *
 * Detection only - it reads context and logs, changing no score or weight.
 */
function warnOnEmptySectorCategoryMap(context: MatchingContext): void {
  const visionComponent = context.activeComponents.find(c => c.key === 'vision');
  if (!visionComponent || visionComponent.weight <= 0) {
    return; // Vision carries no weight for this tier.
  }

  const { userCountry, sectorCategoryMap } = context;
  if (!userCountry) {
    return; // No country: calculateVisionScore returns null and the inert check covers it.
  }

  const tier = context.assessment.assessmentType;
  const sectorCount = sectorCategoryMap?.sectors.size ?? 0;
  const ruleCount = sectorCategoryMap
    ? sectorCategoryMap.byCategory.size + sectorCategoryMap.byCareer.size
    : 0;

  if (ruleCount > 0) {
    return; // Seeded - nothing to report.
  }

  const detail = sectorCount === 0
    ? `country '${userCountry.name}' has no rows in country_priority_sectors`
    : `country '${userCountry.name}' has ${sectorCount} priority sector(s) but no rows in country_sector_categories`;

  console.warn(
    `SCORING WARNING: component 'vision' has weight ${visionComponent.weight} ` +
    `for tier '${tier}' but ${detail} — every career is scoring the floor ` +
    `(${VISION_FLOOR}), so the component cannot differentiate careers. ` +
    `Seed the sector-category map for this country.`
  );
}

/**
 * Calculate overall match for a single career
 */
function calculateCareerMatch(
  context: MatchingContext,
  career: Career
): CareerMatch {
  const componentScores: CareerMatch['componentScores'] = [];
  let weightedSum = 0;
  let totalAppliedWeight = 0;

  // Calculate score for each active component
  for (const component of context.activeComponents) {
    const calculator = componentCalculators[component.key];
    if (!calculator) {
      console.warn(`No calculator found for component: ${component.key}`);
      continue;
    }

    const result = calculator(context, career, component);
    
    // Skip if calculator returns null (missing data, graceful fallback)
    if (result === null) {
      continue;
    }

    componentScores.push({
      key: component.key,
      displayName: component.name,
      score: result.score,
      weight: component.weight,
      reasoning: result.reasoning,
    });

    weightedSum += result.score * (component.weight / 100);
    totalAppliedWeight += component.weight;
  }

  // Calculate overall score (normalize by applied weights)
  const overallScore = totalAppliedWeight > 0 
    ? (weightedSum / totalAppliedWeight) * 100 
    : 0;

  // Generate config version for auditability
  const appliedConfigVersion = generateConfigVersion(context.activeComponents);

  return {
    career,
    overallScore: Math.round(overallScore * 10) / 10, // Round to 1 decimal
    componentScores,
    appliedConfigVersion,
  };
}

/**
 * Generate deterministic config version hash
 */
function generateConfigVersion(components: AssessmentComponent[]): string {
  const configString = components
    .slice()
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(c => `${c.key}:${c.weight}`)
    .join('|');
  
  // Simple hash for now (can be replaced with crypto hash if needed)
  return Buffer.from(configString).toString('base64').slice(0, 16);
}

/**
 * Component Calculators
 */

function calculateSubjectsScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { assessment, competencyScores } = context;
  
  if (!assessment.favoriteSubjects || assessment.favoriteSubjects.length === 0) {
    return null;
  }
  
  // Match user's favorite subjects with career's related subjects
  const matchingSubjects = assessment.favoriteSubjects.filter(subject => 
    career.relatedSubjects.includes(subject)
  );
  
  if (matchingSubjects.length === 0) {
    return {
      careerId: career.id,
      score: 20,
      reasoning: "No matching subjects between preferences and career requirements",
      componentKey: component.key,
    };
  }

  // Calculate preference score (percentage of career's subjects that user likes)
  const preferenceScore = career.relatedSubjects.length > 0
    ? (matchingSubjects.length / career.relatedSubjects.length) * 100
    : 0;

  // Calculate competency score if quiz data available
  let competencyScore = 0;
  let hasCompetencyData = false;
  
  if (competencyScores && Object.keys(competencyScores).length > 0) {
    const matchingCompetencies = matchingSubjects
      .map(subject => competencyScores[subject])
      .filter((score): score is number => score !== undefined);
    
    if (matchingCompetencies.length > 0) {
      competencyScore = matchingCompetencies.reduce((sum, score) => sum + score, 0) / matchingCompetencies.length;
      hasCompetencyData = true;
    }
  }

  // Blend preference and competency (40% preference, 60% competency if available)
  const finalScore = hasCompetencyData
    ? (preferenceScore * 0.4) + (competencyScore * 0.6)
    : preferenceScore;

  // Generate reasoning
  const matchedList = matchingSubjects.slice(0, 3).join(", ");
  const reasoning = hasCompetencyData
    ? `Strong in ${matchedList} (preference + ${Math.round(competencyScore)}% quiz competency)`
    : `Interest in ${matchedList}`;

  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, finalScore)),
    reasoning,
    componentKey: component.key,
  };
}

function calculateInterestsScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { assessment } = context;
  
  if (!assessment.interests || assessment.interests.length === 0) {
    return null;
  }

  // Track matched interests and their matching channels
  interface InterestMatch {
    interest: string;
    categoryMatches: string[];
    descriptionMatches: string[];
    skillMatches: string[];
    weightedScore: number;
  }

  const matches: InterestMatch[] = [];

  // For each student interest, calculate multi-channel match score
  for (const interest of assessment.interests) {
    const lexicon = INTEREST_LEXICON[interest];
    if (!lexicon) {
      // Fallback for interests not in lexicon
      continue;
    }

    const categoryMatches = findMatchingKeywords(lexicon.categories, career.category);
    const descriptionMatches = findMatchingKeywords(lexicon.descriptionKeywords, career.description);
    const skillMatches = findMatchingKeywords(
      lexicon.skillKeywords,
      career.requiredSkills.join(" ")
    );

    // Calculate weighted score for this interest
    const categoryScore = categoryMatches.length > 0 ? INTEREST_MATCHING_WEIGHTS.categoryMatch : 0;
    const descriptionScore = descriptionMatches.length > 0 ? INTEREST_MATCHING_WEIGHTS.descriptionMatch : 0;
    const skillScore = skillMatches.length > 0 ? INTEREST_MATCHING_WEIGHTS.skillMatch : 0;
    const weightedScore = categoryScore + descriptionScore + skillScore;

    if (weightedScore > 0) {
      matches.push({
        interest,
        categoryMatches,
        descriptionMatches,
        skillMatches,
        weightedScore,
      });
    }
  }

  // Calculate overall score (percentage of max possible weighted score)
  const maxPossibleScore = assessment.interests.length * 
    (INTEREST_MATCHING_WEIGHTS.categoryMatch + 
     INTEREST_MATCHING_WEIGHTS.descriptionMatch + 
     INTEREST_MATCHING_WEIGHTS.skillMatch);
  
  const totalScore = matches.reduce((sum, match) => sum + match.weightedScore, 0);
  const score = maxPossibleScore > 0 ? (totalScore / maxPossibleScore) * 100 : 0;

  // Generate enhanced reasoning with specific signals
  let reasoning: string;
  if (matches.length === 0) {
    reasoning = "Limited alignment with stated interests";
  } else {
    const topMatches = matches
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, 2);

    const reasonParts: string[] = [];
    for (const match of topMatches) {
      const signals: string[] = [];
      if (match.categoryMatches.length > 0) {
        signals.push("field");
      }
      if (match.descriptionMatches.length > 0) {
        signals.push("work tasks");
      }
      if (match.skillMatches.length > 0) {
        signals.push("skills");
      }
      reasonParts.push(`${match.interest} (${signals.join(", ")})`);
    }

    reasoning = `Strong match with your ${reasonParts.join(" and ")} interests`;
  }

  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, score)),
    reasoning,
    componentKey: component.key,
  };
}

// VISION-ALIGNMENT scoring constants.
//
// score = VISION_FLOOR + VISION_RANGE * (relevance / 100) * rankFactor
//
// The floor is what a career with no sector mapping scores: 40. That is a real
// answer, not a gap - "Chef" legitimately maps to none of a country's priority
// sectors and should not be penalised below the baseline for it.
const VISION_FLOOR = 40;
const VISION_RANGE = 60;
// Rank is a modifier, not the signal: the last-ranked sector keeps 85% of the
// relevance-driven headroom (see buildSectorCategoryMap).
const VISION_RANK_PENALTY = 0.15;

/**
 * VISION ALIGNMENT: how well a career serves the country's priority sectors.
 *
 * Previously this substring-matched career.category against
 * countries.prioritySectors, which gave the floor to ~84% of the catalog and
 * produced false rationales ("biotechnology".includes("technology")). It now
 * reads an explicit, seeded map (country_sector_categories).
 *
 * OVERRIDE-EXCLUSIVE: if a career has ANY per-career override row, those rows
 * are the ONLY candidates for it. Merging per-sector ("override ?? category")
 * inside a loop over sectors is WRONG - another sector's category rule can then
 * out-score the deliberate override and win the max. The choice of candidate
 * SOURCE happens once, before any sector is considered.
 *
 * ARABIC CONSTRAINT (hard rule): the sector name must appear in the reasoning
 * VERBATIM as it appears in countries.prioritySectors, bare and un-possessive.
 * recommendations.routes.ts localises this text with a \b word-boundary regex
 * per sector name; "Technology's" or "Advanced-Technology" would not match and
 * would leak English into the Arabic report. Keep the name a standalone trailing
 * token after the colon.
 */
export function calculateVisionScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { userCountry, sectorCategoryMap } = context;

  if (!userCountry) {
    return null; // No country selected: the component genuinely does not apply.
  }

  const floorResult: ComponentScore = {
    careerId: career.id,
    score: VISION_FLOOR,
    reasoning: `Viable career path in ${userCountry.name}`,
    componentKey: component.key,
  };

  if (!sectorCategoryMap) {
    return floorResult;
  }

  // OVERRIDE-EXCLUSIVE: pick the candidate source ONCE. An override list, when
  // present, replaces the category rules outright - it never merges with them.
  const overrides = sectorCategoryMap.byCareer.get(career.id);
  const candidates = overrides ?? sectorCategoryMap.byCategory.get(
    career.category.trim().toLowerCase()
  );

  if (!candidates || candidates.length === 0) {
    return floorResult; // No mapping - the floor is the correct answer.
  }

  // Best candidate = highest relevance after the rank modifier.
  let bestSectorName = "";
  let bestRelevance = 0;
  let bestWeighted = 0;

  for (const candidate of candidates) {
    const sector = sectorCategoryMap.sectors.get(candidate.sectorId);
    if (!sector) {
      continue; // Sector belongs to another country, or was removed.
    }
    const weighted = (candidate.relevance / 100) * sector.rankFactor;
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestRelevance = candidate.relevance;
      bestSectorName = sector.name;
    }
  }

  if (bestWeighted <= 0) {
    return floorResult;
  }

  const score = VISION_FLOOR + VISION_RANGE * bestWeighted;

  // Sector name stays a bare trailing token - see ARABIC CONSTRAINT above.
  let reasoning: string;
  if (bestRelevance >= 75) {
    reasoning = `Core to a national priority sector for ${userCountry.name}: ${bestSectorName}`;
  } else if (bestRelevance >= 40) {
    reasoning = `Supports a national priority sector for ${userCountry.name}: ${bestSectorName}`;
  } else {
    reasoning = `Some relevance to a national priority sector for ${userCountry.name}: ${bestSectorName}`;
  }

  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, score)),
    reasoning,
    componentKey: component.key,
  };
}

function calculateRiasecScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { assessment } = context;
  const affinities = context.careerAffinities;
  
  // Check if user has RIASEC scores (with type guard)
  if (!assessment.riasecScores) {
    return null;
  }

  const userScores = assessment.riasecScores as RiasecScores;
  
  // Validate all RIASEC themes exist (checking for undefined/null, not truthiness)
  // Note: 0 is a valid score, so we must explicitly check for undefined/null
  if (
    userScores.R === undefined || userScores.R === null ||
    userScores.I === undefined || userScores.I === null ||
    userScores.A === undefined || userScores.A === null ||
    userScores.S === undefined || userScores.S === null ||
    userScores.E === undefined || userScores.E === null ||
    userScores.C === undefined || userScores.C === null
  ) {
    return null; // Incomplete RIASEC data
  }

  // Get RIASEC affinities for this career
  const careerAffinityList = affinities.get(career.id) || [];
  const riasecAffinity = careerAffinityList.find(a => a.componentId === component.id);
  
  if (!riasecAffinity || !riasecAffinity.affinityData) {
    return null;
  }

  const careerAffinityScores = riasecAffinity.affinityData as RiasecScores;

  // Validate career affinity data has all themes as numbers
  if (
    typeof careerAffinityScores.R !== 'number' ||
    typeof careerAffinityScores.I !== 'number' ||
    typeof careerAffinityScores.A !== 'number' ||
    typeof careerAffinityScores.S !== 'number' ||
    typeof careerAffinityScores.E !== 'number' ||
    typeof careerAffinityScores.C !== 'number'
  ) {
    return null; // Invalid affinity data
  }

  // Calculate weighted average affinity based on user's RIASEC profile
  // Note: All scores are validated to be numbers (including 0), so safe to multiply
  let totalAffinity = 0;
  let totalUserScore = 0;
  
  for (const theme of ['R', 'I', 'A', 'S', 'E', 'C'] as const) {
    totalAffinity += userScores[theme] * careerAffinityScores[theme];
    totalUserScore += userScores[theme];
  }

  const normalizedScore = totalUserScore > 0 
    ? (totalAffinity / totalUserScore) 
    : 0;

  // Find top Holland Code themes for reasoning
  const themes: Array<'R' | 'I' | 'A' | 'S' | 'E' | 'C'> = ['R', 'I', 'A', 'S', 'E', 'C'];
  const sortedThemes = [...themes]
    .sort((a, b) => userScores[b] - userScores[a])
    .slice(0, 2);

  const themeNames: Record<'R' | 'I' | 'A' | 'S' | 'E' | 'C', string> = {
    R: 'Realistic',
    I: 'Investigative', 
    A: 'Artistic',
    S: 'Social',
    E: 'Enterprising',
    C: 'Conventional'
  };

  const topThemes = sortedThemes.map(t => themeNames[t]).join(' & ');

  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, normalizedScore)),
    reasoning: `Strong ${topThemes} personality match`,
    componentKey: component.key,
  };
}

function calculateCvqScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { assessment } = context;
  
  // Check if user has CVQ scores (normalized 0-100 for each domain)
  if (!assessment.cvqScores || typeof assessment.cvqScores !== 'object') {
    return null;
  }
  
  const userScores = assessment.cvqScores as Record<string, any>;
  
  // Extract normalized scores (expecting { achievement: 80, benevolence: 90, ..., top3: [...] })
  if (!userScores || typeof userScores !== 'object') {
    return null;
  }
  
  // Check if career has valuesProfile
  if (!career.valuesProfile || typeof career.valuesProfile !== 'object') {
    return null;
  }
  
  const careerValues = career.valuesProfile as Record<string, number>;
  
  // CVQ domains (7 domains from Schwartz model)
  const domains = ['achievement', 'benevolence', 'universalism', 'self_direction', 'security', 'power', 'hedonism'];
  
  // Validate that both user and career have all domain scores
  const validDomains = domains.filter(d => 
    typeof userScores[d] === 'number' && 
    typeof careerValues[d] === 'number'
  );
  
  if (validDomains.length === 0) {
    return null;
  }
  
  // Calculate Euclidean distance between user values and career values
  let sumSquaredDiff = 0;
  for (const domain of validDomains) {
    const diff = userScores[domain] - careerValues[domain];
    sumSquaredDiff += diff * diff;
  }
  
  const distance = Math.sqrt(sumSquaredDiff);
  
  // Normalize distance to 0-100 score (0 distance = 100% match, max distance = 0% match)
  // Max possible distance for N domains with 0-100 scale = sqrt(N * 100^2)
  const maxDistance = Math.sqrt(validDomains.length * 100 * 100);
  const normalizedScore = Math.max(0, 100 - (distance / maxDistance) * 100);
  
  // Generate reasoning based on top user values
  const top3 = userScores.top3 as string[] | undefined;
  const topValuesText = top3 && Array.isArray(top3) && top3.length > 0
    ? top3.slice(0, 2).map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(' & ')
    : 'Core values';
  
  const reasoning = normalizedScore > 70
    ? `Strong ${topValuesText} alignment with career values`
    : normalizedScore > 50
    ? `Moderate ${topValuesText} values match`
    : `${topValuesText} values partially align`;
  
  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, normalizedScore)),
    reasoning,
    componentKey: component.key,
  };
}

/**
 * Calculate WEF Skills alignment score
 * Compares student's WEF competency profile with career's skill requirements
 */
function calculateWefSkillsScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { wefCompetencyScores, careerWefAffinities } = context;
  
  // Check if WEF data is available
  if (!careerWefAffinities) {
    return null;
  }
  
  // Check if student has WEF scores (premium assessments only)
  if (!wefCompetencyScores || Object.keys(wefCompetencyScores).length === 0) {
    return null;
  }
  
  // Get career's WEF skill requirements
  const careerAffinities = careerWefAffinities.get(career.id);
  if (!careerAffinities || careerAffinities.length === 0) {
    return null;
  }
  
  // Calculate weighted alignment score
  let totalAlignment = 0;
  let totalWeight = 0;
  const skillMatches: Array<{ skill: string; userScore: number; careerRequirement: number }> = [];
  
  for (const affinity of careerAffinities) {
    const userScore = wefCompetencyScores[affinity.wefSkillId];
    if (userScore !== undefined) {
      // Weight by career's skill requirement (0-100)
      // Higher affinity scores = more important for this career
      const weight = affinity.affinityScore / 100; // Normalize to 0-1
      const alignmentScore = userScore * weight;
      
      totalAlignment += alignmentScore;
      totalWeight += affinity.affinityScore;
      
      skillMatches.push({
        skill: affinity.wefSkillId,
        userScore,
        careerRequirement: affinity.affinityScore,
      });
    }
  }
  
  if (totalWeight === 0) {
    return null;
  }
  
  // Normalize to 0-100 scale
  const normalizedScore = (totalAlignment / totalWeight) * 100;
  
  // Find top matching skills for reasoning
  const sortedMatches = skillMatches
    .map(m => ({
      ...m,
      alignmentScore: m.userScore * (m.careerRequirement / 100),
    }))
    .sort((a, b) => b.alignmentScore - a.alignmentScore)
    .slice(0, 2);
  
  // Convert snake_case to readable format
  const formatSkillName = (skill: string) => 
    skill.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  
  const topSkills = sortedMatches
    .map(m => formatSkillName(m.skill))
    .join(' & ');
  
  const reasoning = normalizedScore > 75
    ? `Excellent future skills match (${topSkills})`
    : normalizedScore > 60
    ? `Strong skills alignment in ${topSkills}`
    : `Growing ${topSkills} competencies`;
  
  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, normalizedScore)),
    reasoning,
    componentKey: component.key,
  };
}
