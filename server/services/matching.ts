/**
 * Dynamic Career Matching Service
 * 
 * Implements a modular, database-driven career matching algorithm that:
 * - Fetches active assessment components from database
 * - Delegates scoring to component-specific calculators
 * - Aggregates weighted results with validation
 * - Supports backwards compatibility with legacy assessments
 */

import type { IStorage, SectorCategoryRow, SectorWefSkillRow } from "../storage";
import type { 
  Assessment, 
  Career, 
  AssessmentComponent,
  CareerComponentAffinity,
  JobMarketTrend,
  Country
} from "../../shared/schema";
import { type AssessmentTier, getEffectiveWeight } from "./tierWeights";
import { isPremiumAssessment } from "../utils/assessmentTier";
import { getEffectiveWeightFromDb, getTierConfig } from "./scoringConfig";
import { isFutureReady } from "./futureReadiness";
import { 
  INTEREST_LEXICON, 
  INTEREST_MATCHING_WEIGHTS, 
  findMatchingKeywords 
} from "./interestLexicon";
// Pure, storage-free module by design: matching.ts must stay importable without
// DATABASE_URL. Do NOT switch this to "../utils/subjects" (it imports storage).
import { normalizeCareerSubjects } from "../utils/subjectMap";

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
 * VISION-ALIGNMENT skill layer - the second half of the HYBRID score.
 *
 * SectorCategoryMap decides WHICH sector a career belongs to. This decides HOW
 * WELL that career's WEF skill profile fits the sector it was gated into. It is
 * never a candidate source of its own: a career is not credited to a sector it
 * has no category rule or override for, no matter how well its skills match.
 * See calculateVisionScore for why (mean-centred skill overlap alone puts
 * "Doctor" in Space Exploration).
 */
export interface SectorWefSkillMap {
  /** sectorId -> the WEF skills that sector requires, with 0-100 importance */
  bySector: Map<string, Array<{ wefSkillId: string; importance: number }>>;
  /** wefSkillId -> mean affinity across the whole career catalog. THE centering term. */
  catalogMeans: Map<string, number>;
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
  careerWefAffinities?: Map<string, Array<{ wefSkillId: string; affinityScore: number }>>; // careerId -> WEF affinities
  sectorCategoryMap?: SectorCategoryMap; // For vision alignment (sector <-> career category/override)
  sectorWefSkillMap?: SectorWefSkillMap; // For vision alignment (sector <-> WEF skill importance)
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
  /** Persisted to recommendations.scoring_provenance — see shared/schema.ts. */
  scoringProvenance: ScoringProvenance;
}

/**
 * The two identifiers that together say which scoring regime produced a score.
 * Written to recommendations.scoring_provenance at insert.
 */
export interface ScoringProvenance {
  /** SCORING_ALGORITHM_VERSION — the calculator code. Hand-bumped. */
  algorithm: number;
  /** generateConfigVersion() — component keys + weights. Automatic. */
  configHash: string;
  /** Which weight table applied: the assessment's tier. */
  tier: string;
  /** ISO date (YYYY-MM-DD) this score was computed. */
  scoredAt: string;
}

/**
 * How many career matches a report offers, by tier.
 *
 * FREE is deliberately narrower (L5). The free report is a real answer, not a
 * teaser — every section it shows is now unblurred and readable — but it is
 * built from three signals (subjects / interests / vision), and three signals
 * do not separate the 4th-best career from the 8th with any confidence. Two
 * well-supported matches is the honest width of that evidence. Premium adds
 * RIASEC and CVQ, which is what earns the wider list.
 *
 * Applied at GENERATE time and persisted one row per match, so a change here
 * affects newly generated reports only; existing rows keep the count they were
 * written with.
 */
export const MAX_MATCHES_FREE = 2;
export const MAX_MATCHES_PREMIUM = 5;

export function maxMatchesForTier(assessmentType: string | null | undefined): number {
  return isPremiumAssessment(assessmentType) ? MAX_MATCHES_PREMIUM : MAX_MATCHES_FREE;
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

  // 3d. FUTURE-READINESS GATE. A declining occupation is not scored down — it
  // is not offered. Requires BOTH the WEF 2025 fastest-declining list AND the
  // O*NET 'decline' band to agree; a single source yields 'watch', which does
  // NOT gate. See server/services/futureReadiness.ts.
  //
  // Placed HERE, after scoring and before the score filter, deliberately:
  //  - NOT in hydrateMatchingContext (storage.getAllCareers() below): shrinking
  //    the catalogue would shift SectorWefSkillMap.catalogMeans, the
  //    catalog-wide mean affinity that calculateVisionScore mean-centres
  //    against, silently moving every OTHER career's vision score. The gate
  //    must not perturb the model.
  //  - NOT after the tier slice: that would return fewer than the tier's quota
  //    whenever it fires. Filtering first backfills from the next-best career.
  //
  // On the current 68-career catalogue this excludes nothing — every career is
  // a professional occupation and WEF's declining list is clerical. That is the
  // expected outcome; the gate is a guard on catalogue growth.
  const gated = matches.filter(match => isFutureReady(match.career));
  if (gated.length !== matches.length) {
    const dropped = matches
      .filter(match => !isFutureReady(match.career))
      .map(match => match.career.title);
    console.warn(
      `[readiness] gated ${matches.length - gated.length} declining career(s): ${dropped.join(", ")}`
    );
  }

  // 4. Filter and sort by overall score, then take the tier's quota.
  // The slice MUST stay last: the future-readiness gate above deliberately runs
  // before it so a gated career backfills from the next-best one rather than
  // shrinking the list.
  const limit = maxMatchesForTier(context.assessment.assessmentType);
  return gated
    .filter(match => match.overallScore >= 40) // Filter low matches
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, limit); // 2 free / 5 premium — see maxMatchesForTier
}

/**
 * WHICH COMPONENTS A TIER IS SCORED ON, with their effective weights.
 *
 * EXPORTED, and shared with the provenance comparison rather than reimplemented
 * there, because the set is what generateConfigVersion hashes — so anything that
 * wants to know the CURRENT configHash must derive it through this exact path or
 * it is not answering the same question.
 *
 * The obvious shortcut is to read `tier_component_weights` via
 * getScoringConfigSummary / getEnabledComponentsForTier (scoringConfig.ts) and
 * hash that. It is wrong, in three separate ways, each of which invents drift
 * that does not exist:
 *
 *   1. isActive. This starts from getAllAssessmentComponents() and drops
 *      inactive components. The summary iterates the weight rows and never looks
 *      at the component's isActive flag.
 *   2. Premium gating. A requiresPremium component is dropped for a 'basic'
 *      assessment. The summary reports it for every tier.
 *   3. The >= 95 fallback. DB weights are used ONLY when the tier's rows sum to
 *      at least 95; below that the whole tier silently reverts to the hardcoded
 *      TIER_WEIGHT_OVERRIDES. The summary always reports the DB numbers, so on a
 *      half-configured tier the admin screen already shows weights the scorer is
 *      not using.
 *
 * A false "this report is stale" is worse than showing nothing: it trains the
 * operator to ignore the signal, which is the exact failure the provenance
 * column exists to prevent. Hence one implementation, called by both.
 *
 * FAITHFUL, NOT CORRECTED. Two quirks are preserved deliberately:
 *   - `assessmentType` is cast to AssessmentTier unchecked. A value outside
 *     'basic' | 'premium' | 'group' finds no override table and every component
 *     keeps its database weight.
 *   - The premium gate compares against the literal 'basic', so the 'free'
 *     synonym that isFreeAssessment (utils/assessmentTier.ts) accepts does NOT
 *     get premium components dropped.
 * Both are how stored rows were actually scored. Changing either here would move
 * scores and is a SCORING_ALGORITHM_VERSION bump, not a tidy-up.
 */
export async function resolveActiveComponents(
  storage: IStorage,
  assessmentType: string | null | undefined,
): Promise<AssessmentComponent[]> {
  const allComponents = await storage.getAllAssessmentComponents();
  const tier: AssessmentTier = assessmentType as AssessmentTier;

  // Try to get weights from database first, fallback to hardcoded
  const tierConfig = await getTierConfig(storage, tier);
  const useDbConfig = tierConfig !== null && tierConfig.totalWeight >= 95; // Use DB if weights are valid

  // Filter components and apply tier-specific weight overrides
  return allComponents
    .filter(component => {
      // Only include active components
      if (!component.isActive) return false;

      // Skip premium components if user doesn't have premium access
      if (component.requiresPremium && assessmentType === 'basic') {
        return false;
      }

      return true;
    })
    .map(component => {
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
    })
    .filter(component => component.weight > 0); // Remove components with 0 weight
}

/**
 * The scoring regime a NEW report would be written with today, for one tier.
 *
 * The stored counterpart is recommendations.scoring_provenance. Comparing the
 * two answers "is this report reproducible today", and the comparison is cheap
 * because this depends only on (tier, config, component flags) and never on the
 * student's answers — so it is a per-tier constant, not a per-row lookup, and
 * the tier configuration it reads is already cached (scoringConfig.ts, 5-minute
 * TTL, invalidated on every weights write).
 */
export async function currentScoringRegimeForTier(
  storage: IStorage,
  tier: string,
): Promise<{ algorithm: number; configHash: string }> {
  return {
    algorithm: SCORING_ALGORITHM_VERSION,
    configHash: generateConfigVersion(await resolveActiveComponents(storage, tier)),
  };
}

/**
 * The current regime for EVERY configured tier — the comparison set the stored
 * estate is measured against.
 *
 * One helper rather than two call sites building their own list, so the estate
 * card and the scoring-config editor can never disagree about what "current"
 * means. Both endpoints in superadmin.routes.ts go through this.
 *
 * The tiers come from scoring_tiers, so this list is exactly as complete as the
 * database. A stored provenance row naming a tier NOT in it — 'free', 'unknown',
 * or a tier since deleted — has nothing to compare against, and that is a state
 * of its own ("no current regime"), never drift. The join in
 * storage.getScoringEstateCounts is a LEFT JOIN for that reason.
 */
export async function currentScoringRegimes(
  storage: IStorage,
): Promise<Array<{ tier: string; algorithm: number; configHash: string }>> {
  const { getScoringConfigSummary } = await import("./scoringConfig");
  const summary = await getScoringConfigSummary(storage);
  return Promise.all(
    summary.tiers.map(async (tier) => ({
      tier: tier.key,
      ...(await currentScoringRegimeForTier(storage, tier.key)),
    })),
  );
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

  // Fetch active components (only those applicable to this user).
  const activeComponents = await resolveActiveComponents(storage, assessment.assessmentType);

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

  // VISION-ALIGNMENT: both halves of the HYBRID score, fetched together.
  //
  // The category map gates WHICH sector; the WEF skill map + career affinities
  // modulate HOW STRONGLY within it. The affinities are fetched UNCONDITIONALLY
  // now - they are vision's input, not a student component's. They used to sit
  // behind `activeComponents.some(c => c.key === 'wef_skills')`, a condition that
  // could never be true because no wef_skills row exists in assessment_components.
  //
  // A skill-side failure must NOT take vision down with it: the category half
  // alone still produces the score this replaced, so it degrades to that rather
  // than flooring the catalog at 40.
  let sectorCategoryMap: SectorCategoryMap | undefined;
  let sectorWefSkillMap: SectorWefSkillMap | undefined;
  let careerWefAffinities: Map<string, Array<{ wefSkillId: string; affinityScore: number }>> | undefined;

  if (assessment.countryId) {
    try {
      const sectorRows = await storage.getSectorCategoryMap(assessment.countryId);
      sectorCategoryMap = buildSectorCategoryMap(sectorRows, userCountry);
    } catch (error) {
      console.warn('[Matching] Failed to load sector-category map:', error);
      sectorCategoryMap = undefined; // Vision falls back to the floor for every career
    }

    try {
      const [skillRows, affinityRows] = await Promise.all([
        storage.getSectorWefSkillMap(assessment.countryId),
        storage.getCareerWefSkillAffinitiesBulk(careerIds),
      ]);
      careerWefAffinities = groupWefAffinitiesByCareer(affinityRows ?? []);
      sectorWefSkillMap = buildSectorWefSkillMap(skillRows, careerWefAffinities);
    } catch (error) {
      console.warn('[Matching] Failed to load sector-WEF-skill map:', error);
      sectorWefSkillMap = undefined; // Vision degrades to the category-only score
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
    careerWefAffinities,
    sectorCategoryMap,
    sectorWefSkillMap,
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
 * Build the VISION-ALIGNMENT skill layer.
 *
 * `careerWefAffinities` is passed in rather than re-queried so the catalog means
 * are computed from the EXACT same rows the scorer reads. Deriving the centering
 * term from a second query is how it silently desynchronises from the values
 * being centered.
 */
export function buildSectorWefSkillMap(
  rows: SectorWefSkillRow[],
  careerWefAffinities: Map<string, Array<{ wefSkillId: string; affinityScore: number }>>,
): SectorWefSkillMap {
  const bySector = new Map<string, Array<{ wefSkillId: string; importance: number }>>();

  for (const row of rows) {
    if (row.wefSkillId === null || row.importance === null || row.importance <= 0) {
      continue; // LEFT JOIN filler for a sector with no skill rows yet.
    }
    const list = bySector.get(row.sectorId) ?? [];
    list.push({ wefSkillId: row.wefSkillId, importance: row.importance });
    bySector.set(row.sectorId, list);
  }

  // Catalog mean per skill: one pass over every career's affinity vector.
  const sums = new Map<string, { total: number; count: number }>();
  for (const affinities of careerWefAffinities.values()) {
    for (const affinity of affinities) {
      const acc = sums.get(affinity.wefSkillId) ?? { total: 0, count: 0 };
      acc.total += affinity.affinityScore;
      acc.count += 1;
      sums.set(affinity.wefSkillId, acc);
    }
  }
  const catalogMeans = new Map<string, number>();
  for (const [wefSkillId, acc] of sums) {
    if (acc.count > 0) {
      catalogMeans.set(wefSkillId, acc.total / acc.count);
    }
  }

  return { bySector, catalogMeans };
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

  if (ruleCount === 0) {
    const detail = sectorCount === 0
      ? `country '${userCountry.name}' has no rows in country_priority_sectors`
      : `country '${userCountry.name}' has ${sectorCount} priority sector(s) but no rows in country_sector_categories`;

    console.warn(
      `SCORING WARNING: component 'vision' has weight ${visionComponent.weight} ` +
      `for tier '${tier}' but ${detail} — every career is scoring the floor ` +
      `(${VISION_FLOOR}), so the component cannot differentiate careers. ` +
      `Seed the sector-category map for this country.`
    );
    return; // Nothing scores above the floor; the skill half cannot matter.
  }

  // The category map is seeded, so vision differentiates. Report the skill half
  // separately: without it the HYBRID silently degrades to the category-only
  // score, which still looks healthy (no floor, good spread) and so trips no
  // other check. Careers inside one category would all score identically again.
  const skillCount = context.sectorWefSkillMap
    ? [...context.sectorWefSkillMap.bySector.values()].reduce((n, list) => n + list.length, 0)
    : 0;

  if (skillCount === 0) {
    console.warn(
      `SCORING WARNING: component 'vision' is scoring for tier '${tier}', but ` +
      `country '${userCountry.name}' has no rows in country_sector_wef_skills — ` +
      `the skill modulation is inert and careers sharing a category will score ` +
      `identically. Seed the sector→WEF-skill map for this country.`
    );
  }
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
    scoringProvenance: {
      algorithm: SCORING_ALGORITHM_VERSION,
      configHash: appliedConfigVersion,
      tier: (context.assessment as { assessmentType?: string })?.assessmentType ?? "unknown",
      scoredAt: new Date().toISOString().slice(0, 10),
    },
  };
}

/**
 * SCORING ALGORITHM VERSION — the identity of the calculator CODE.
 *
 * BUMP THIS WHEN THE GOLDEN FIXTURES MOVE. That is the whole rule, and it is
 * deliberately mechanical rather than a judgement call: change any calculator in
 * a way that alters a score and server/services/scoringProvenance.test.ts fails,
 * telling you to bump this and update the fixtures in the same commit. "Bump
 * when scoring semantics change" is what everyone writes and nobody applies.
 *
 * DO NOT bump for: a weights edit (that is configHash's job, and it is computed
 * automatically), narrative text, ordering, or presentation.
 *
 * There is no automatic scheme for this half. Hashing the source is the only
 * candidate and it is worse than useless — it bumps when a comment is edited, so
 * it stops meaning anything within a month.
 *
 * HISTORY, so the numbers mean something:
 *   1  before 2026-08-31. Career relatedSubjects compared as RAW strings, with
 *      the raw tag count as the denominator.
 *   2  221d496, 2026-08-31 ("Piece D"). Career tags normalized onto the
 *      umbrella-6 before matching, and the NORMALIZED set used as the
 *      denominator. This is the change that re-based every pre-existing
 *      assessment's subjects score and that nothing recorded — the reason this
 *      constant exists. No row carries 1 or 2: provenance was not written then,
 *      and those versions are listed so a NULL row can be dated, not claimed.
 *   3  2026-09-08. First version actually recorded. No scoring change from 2 —
 *      the number moves because the recording starts, not because the maths did.
 *   4  2026-09-10. VISION de-saturated. Two stacked ceilings were erasing the
 *      seed's calibration: the alignment band clipped 15 of 154 career × sector
 *      pairs to exactly 0 or 1, and the modulated relevance was then clamped at
 *      100 for 27 of 68 careers. Fix: band widened to ±16, and membership
 *      rebased into [15, 85] by membershipBase() so the ±15 fit swing always has
 *      room. Every career's vision score moves (mean −5.61, range −8.47 to
 *      −0.62); exact ties fall from 24 careers in 7 blocks to 2 in 1. No sector
 *      attribution changes and no reasoning sentence changes. THIS is the bump
 *      the fixture rule above could not have demanded — see the note below.
 *
 * A LIMIT OF THE RULE, found by the defect that produced version 4. "Bump when
 * the golden fixtures move" only works where fixtures exist, and
 * scoringProvenance.test.ts covered ONE of the five calculators — subjects.
 * Version 4 changes vision and moved no pre-existing fixture at all. Vision
 * fixtures were added in the same commit; interests, riasec and cvq still have
 * none, so for those three this rule remains unenforceable and a change to them
 * will pass silently. Tracked as a follow-up.
 */
export const SCORING_ALGORITHM_VERSION = 4;

/**
 * Generate deterministic config version hash
 *
 * COMPONENT KEYS AND WEIGHTS ONLY, and that is its documented limit rather than
 * an oversight: it captures the half of a score that an admin can change at
 * runtime. It CANNOT see a code change — 221d496 altered a denominator and left
 * every key and weight untouched, so this hash was byte-identical across it.
 * SCORING_ALGORITHM_VERSION covers that half.
 *
 * EXPORTED so the provenance comparison hashes the current config with the same
 * function that hashed the stored one. Feed it resolveActiveComponents' output
 * and nothing else — see that function for the three ways a set assembled from
 * the admin-facing config differs from the set actually scored.
 *
 * NOT A DIGEST, despite the name, and CURRENTLY NEARLY BLIND. It base64-encodes
 * the sorted `key:weight` join and slices to 16 characters. Base64 is 4 chars per
 * 3 bytes, so 16 chars is exactly the FIRST 12 BYTES of the string — about one
 * component. On the real tier configurations that means:
 *
 *   basic    hash decodes to "interests:35"  — subjects and vision are invisible
 *   premium  hash decodes to "cvq:25|riase"  — not even riasec's weight fits
 *
 * So an admin weight edit, the one thing this half of provenance exists to catch
 * automatically, mostly does not move it: change basic's subjects 35->99 and
 * vision 30->1, or drop vision from the tier altogether, and the hash is
 * byte-identical. scoringRegime.test.ts pins each of those.
 *
 * NOT FIXED HERE ON PURPOSE. Widening or properly hashing this changes what every
 * STORED provenance row means — their hashes were written under this scheme, so
 * they would all begin reading as "config drifted" when nothing about them
 * changed, which is the exact false positive the comparison exists to avoid. A
 * fix has to decide what happens to those rows (version the scheme, or treat
 * pre-fix hashes as an unknown config) and belongs in its own commit.
 *
 * It is also reversible for the part it keeps, which is why it is operator-only
 * and stripped from student responses (server/utils/recommendationView.ts).
 */
export function generateConfigVersion(components: AssessmentComponent[]): string {
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

export function calculateSubjectsScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { assessment, competencyScores } = context;
  
  if (!assessment.favoriteSubjects || assessment.favoriteSubjects.length === 0) {
    return null;
  }
  
  // Project the career's curriculum-flavoured tags ("Biology", "Health Science")
  // onto the student's vocabulary (the umbrella-6) before comparing - the two
  // sides can only meet there. This is BOTH the match target and, below, the
  // denominator.
  const careerSubjects = normalizeCareerSubjects(career.relatedSubjects);

  // Match user's favorite subjects with career's related subjects
  const matchingSubjects = assessment.favoriteSubjects.filter(subject => 
    careerSubjects.includes(subject)
  );
  
  // Flat 20 for a genuine non-match, and for a career whose tags project to
  // nothing at all (pure art/design/profession vocabulary).
  if (matchingSubjects.length === 0) {
    return {
      careerId: career.id,
      score: 20,
      reasoning: "No matching subjects between preferences and career requirements",
      componentKey: component.key,
    };
  }

  // Calculate preference score (percentage of career's subjects that user likes)
  //
  // THE DENOMINATOR MUST BE THE NORMALIZED SET, not the raw tags. Using the raw
  // length would swap a flat floor for a systematic penalty: Doctor's three tags
  // (Biology, Chemistry, Health Science) collapse to ONE umbrella subject
  // (Science), so a Science-loving student is a 1/1 = 100% subject match, not
  // 1/3 = 33%. Normalizing the target but not the divisor is the subtle
  // half-fix, and it penalises exactly the careers whose tags are most redundant.
  const preferenceScore = careerSubjects.length > 0
    ? (matchingSubjects.length / careerSubjects.length) * 100
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

// ---------------------------------------------------------------------------
// SKILL MODULATION - the HYBRID half. Read this before changing any of it.
// ---------------------------------------------------------------------------
//
// MEAN-CENTERING IS LOAD-BEARING, NOT A REFINEMENT.
// career_wef_skill_affinities is an IMPORTANCE matrix, not a discriminating one:
// 71% of its 576 values are >= 80 and the catalog mean is 82.4, because every WEF
// skill genuinely is somewhat important to every career. Measured on the live
// catalog, an ABSOLUTE weighted overlap spans only 85.5-96.6 - an 11-point spread
// across all 37 careers. Subtracting each skill's catalog mean before the dot
// product removes that shared baseline and restores a 33-point spread. Removing
// the centering does not weaken this modifier, it DELETES it: every career gets
// the same near-1.0 alignment and the score collapses back to the category map.
// Pinned by matching.vision.test.ts. Same class of bug as Piece D's denominator.
//
// THE BAND IS ABSOLUTE, NOT MIN-MAX. `raw` below is an importance-weighted mean
// of (affinity - catalog mean), in affinity points. Do NOT rescale to the
// observed min/max: that makes every career's score a function of every other
// career's (see the SCALE WARNING in
// server/migrations/career-values-profiles.ts:20-32) and it FORCES a full-range
// spread that proves nothing about discrimination. +/-16 is a fixed constant,
// so that warning still holds - widening the band is not a rescale.
//
// WIDENED -12/+12 -> -16/+16 (2026-09-10, SCORING_ALGORITHM_VERSION 4). The old
// band was chosen when this comment could say "live p5..p95 is -10.4..+10.2, so
// +/-12 clips the tails". The catalog then grew 37 -> 68 careers and nothing
// re-measured it. Measured today over all 154 career x candidate-sector pairs:
//
//     min -12.95   p1 -10.35   p5 -8.00   p50 2.94   p95 13.25   p99 14.80   max 15.93
//
//     band +/-12:  15 of 154 pairs clip  (9.7%)
//     band +/-14:   5 of 154 pairs clip  (3.2%)
//     band +/-16:   0 of 154 pairs clip  (0.0%)
//
// Clipping at 9.7% is not a tail event, it is the normal path for the careers
// that matter: Physicist (raw 13.99) and Space Scientist (13.06) both clipped to
// alignment exactly 1.0, so a genuine 0.9-point difference in skill fit produced
// an identical uplift. The band must be wide enough that CLIPPING MEANS
// SOMETHING. Pinned by the saturation guard in matching.vision.test.ts, which
// fails loudly if a future career blows past +/-16 rather than silently clipping.
const VISION_ALIGN_LO = -16;
const VISION_ALIGN_HI = 16;
// How far skill alignment may move a seeded relevance, in relevance points.
// The category rule states MEMBERSHIP (does this career serve the sector);
// skills state FIT (how well does its profile match). Membership stays dominant
// - at +/-15 the sector a career is credited to changes for 1 of 36 careers,
// while at +/-25 it changes for 4 and attribution starts to drift.
const VISION_SKILL_SWING = 15;

/**
 * MEMBERSHIP, REBASED so the FIT modulation always has room. Read this before
 * changing VISION_SKILL_SWING or the wording thresholds below.
 *
 * Seeded relevance is stated on 0-100 and the fit modulation is +/-15 points, so
 * the two do not fit on the same scale: a career seeded at 95 has 5 points of
 * headroom against a +15 swing and a career seeded at 100 has none. Applying the
 * swing directly and clamping the result at 100 is what SHIPPED, and it did not
 * cap an edge case, it erased the seed's calibration wholesale - 27 of 68 careers
 * landed on relevance exactly 100, collapsing into blocks of 5, 5, 4, 3, 3, 2, 2
 * careers sharing a byte-identical vision score. The five Space & Advanced
 * Sciences careers, seeded 100 / 95 / 95 / 88 / 85 with a written justification
 * per row (server/seed.ts:224, :255, :256), all scored 99.0.
 *
 * So membership is mapped into [SWING, 100-SWING] FIRST. base + SWING*(2a-1) is
 * then within [0, 100] by construction and the clamp becomes unreachable.
 *
 * WHY NOT CAP THE SWING AT THE AVAILABLE HEADROOM (`min(SWING, 100-relevance)`),
 * which is the smaller change and the obvious one: it makes a career seeded at
 * relevance 100 IMMUNE to fit modulation - zero headroom, zero uplift. All four
 * Education careers reach their sector through the same `Education @ 100`
 * category rule, so all four would keep an identical score forever. Reserving
 * headroom modulates every career equally; capping it silently exempts exactly
 * the careers a sector cares most about.
 *
 * 100 IS STILL REACHABLE, and only by a career that is both maximally seeded and
 * maximally aligned. No career in the catalog is. That is the point.
 */
function membershipBase(relevance: number): number {
  return VISION_SKILL_SWING + (100 - 2 * VISION_SKILL_SWING) * (relevance / 100);
}

/**
 * The "Core to / Supports / Some relevance to" wording thresholds.
 *
 * DERIVED, NOT LITERAL, and that is load-bearing. They are compared against the
 * MODULATED relevance, which membershipBase() rebases into [15, 85] - so the old
 * literals 75 and 40 no longer mean what they meant. Leaving them alone flips the
 * sentence for 10 of 68 careers (Mechanical Engineer, Electrical Engineer,
 * Architect, Interior Designer, Social Worker, Chef, Airline Pilot, Industrial
 * Engineer, Management Consultant, Marketing Manager - all Core -> Supports).
 * Passing them through the same function that rebases the scale gives 0 flips
 * and, more importantly, means they cannot drift apart from it again.
 */
const VISION_CORE_THRESHOLD = membershipBase(75);      // 67.5
const VISION_SUPPORTS_THRESHOLD = membershipBase(40);  // 43.0

/**
 * How well `career`'s WEF skill profile fits `sectorId`'s required skills.
 *
 * Returns 0..1 (0.5 == exactly catalog-average), or null when there is no skill
 * data for this career/sector pair - the caller then uses the seeded relevance
 * unmodified, so a missing affinity row degrades to the category-only score
 * rather than to the floor.
 */
function skillAlignment(
  careerId: string,
  sectorId: string,
  sectorWefSkillMap: SectorWefSkillMap | undefined,
  careerWefAffinities: Map<string, Array<{ wefSkillId: string; affinityScore: number }>> | undefined,
): number | null {
  if (!sectorWefSkillMap || !careerWefAffinities) {
    return null;
  }
  const sectorSkills = sectorWefSkillMap.bySector.get(sectorId);
  const affinities = careerWefAffinities.get(careerId);
  if (!sectorSkills?.length || !affinities?.length) {
    return null;
  }

  const careerVector = new Map(affinities.map(a => [a.wefSkillId, a.affinityScore]));

  // Importance-weighted MEAN of centered affinities. A weighted mean, not a sum:
  // sectors carry different numbers of skills, and a sum would score the sectors
  // with more skills higher for having more terms.
  let numerator = 0;
  let denominator = 0;
  for (const { wefSkillId, importance } of sectorSkills) {
    const affinity = careerVector.get(wefSkillId);
    const catalogMean = sectorWefSkillMap.catalogMeans.get(wefSkillId);
    if (affinity === undefined || catalogMean === undefined) {
      continue;
    }
    const weight = importance / 100;
    numerator += weight * (affinity - catalogMean); // <- THE CENTERING. Do not remove.
    denominator += weight;
  }
  if (denominator <= 0) {
    return null;
  }

  const raw = numerator / denominator;
  return Math.max(0, Math.min(1,
    (raw - VISION_ALIGN_LO) / (VISION_ALIGN_HI - VISION_ALIGN_LO),
  ));
}

/**
 * VISION ALIGNMENT: how well a career serves the country's priority sectors.
 *
 * Previously this substring-matched career.category against
 * countries.prioritySectors, which gave the floor to ~84% of the catalog and
 * produced false rationales ("biotechnology".includes("technology")). It now
 * reads an explicit, seeded map (country_sector_categories).
 *
 * HYBRID (WEF Phase 1): the category map decides WHICH sector and supplies the
 * seeded relevance; membershipBase() rebases that into [15, 85]; the country's
 * WEF skill vector then modulates it by +/-VISION_SKILL_SWING according to how
 * well the career's own skill profile fits. Category alone cannot separate
 * careers inside a category - all 6 Healthcare careers scored an identical 87.9
 * - because career.category is the only thing the lookup can see, and 37 careers
 * share 14 categories.
 *
 * THE REBASE IS NOT COSMETIC (2026-09-10). Without it the modulation saturated:
 * see membershipBase for what 27 of 68 careers collapsing onto relevance 100
 * looked like in a student's report.
 *
 * WHY NOT SKILLS ALONE. Scoring purely on mean-centered skill overlap was
 * simulated on the live catalog and is a downgrade on every axis but one:
 * spread falls 54.6 -> 33.1, Chef stops flooring (65.1, though no UAE priority
 * sector is about food service), and - worst - sector ATTRIBUTION collapses. The
 * six UAE sector skill-vectors correlate at r=0.99 (Space Exploration vs
 * Renewable Energy), 0.85 and 0.79 across the catalog, spanning only about three
 * independent directions, so the winning sector is decided by the rank modifier
 * and rounding. That put "Doctor" and "Physical Therapist" in Space Exploration
 * and "Chef" in Education - in the student-facing, Arabic-localised rationale
 * below. Skills are a fine but ambiguous signal about profile similarity;
 * the category map is a coarse but CORRECT statement about sector membership.
 * The hybrid uses each for what it is good at.
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
  const { userCountry, sectorCategoryMap, sectorWefSkillMap, careerWefAffinities } = context;

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

  // Best candidate = highest skill-modulated relevance after the rank modifier.
  let bestSectorName = "";
  let bestRelevance = 0;
  let bestWeighted = 0;

  for (const candidate of candidates) {
    const sector = sectorCategoryMap.sectors.get(candidate.sectorId);
    if (!sector) {
      continue; // Sector belongs to another country, or was removed.
    }

    // MEMBERSHIP (seeded, coarse) modulated by FIT (derived, fine). A null
    // alignment - no skill rows for this sector, or no affinity row for this
    // career - leaves the rebased membership untouched, so the score degrades to
    // the category-only value rather than to the floor.
    //
    // NOTE the category-only value is now membershipBase(relevance), not the raw
    // seeded relevance. Both halves must live on the SAME rebased scale or a
    // career with missing skill data would outscore an average-fit career that
    // has it - see membershipBase above.
    const alignment = skillAlignment(
      career.id,
      candidate.sectorId,
      sectorWefSkillMap,
      careerWefAffinities,
    );
    const base = membershipBase(candidate.relevance);
    // The clamp is a GUARD, not a mechanism: base + SWING*(2a-1) is inside
    // [0, 100] by construction. If it ever fires, membershipBase and
    // VISION_SKILL_SWING have drifted out of agreement.
    const relevance = alignment === null
      ? base
      : Math.max(0, Math.min(100, base + VISION_SKILL_SWING * (2 * alignment - 1)));

    const weighted = (relevance / 100) * sector.rankFactor;
    if (weighted > bestWeighted) {
      bestWeighted = weighted;
      bestRelevance = relevance;
      bestSectorName = sector.name;
    }
  }

  if (bestWeighted <= 0) {
    return floorResult;
  }

  const score = VISION_FLOOR + VISION_RANGE * bestWeighted;

  // Sector name stays a bare trailing token - see ARABIC CONSTRAINT above.
  let reasoning: string;
  if (bestRelevance >= VISION_CORE_THRESHOLD) {
    reasoning = `Core to a national priority sector for ${userCountry.name}: ${bestSectorName}`;
  } else if (bestRelevance >= VISION_SUPPORTS_THRESHOLD) {
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

