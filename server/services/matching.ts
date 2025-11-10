/**
 * Dynamic Career Matching Service
 * 
 * Implements a modular, database-driven career matching algorithm that:
 * - Fetches active assessment components from database
 * - Delegates scoring to component-specific calculators
 * - Aggregates weighted results with validation
 * - Supports backwards compatibility with legacy assessments
 */

import type { IStorage } from "../storage";
import type { 
  Assessment, 
  Career, 
  AssessmentComponent,
  CareerComponentAffinity,
  JobMarketTrend,
  Country
} from "../../shared/schema";

/**
 * Typed interfaces for JSONB fields
 */
export interface KolbScores {
  CE: number;
  RO: number;
  AC: number;
  AE: number;
  X: number;
  Y: number;
  learningStyle: 'Diverging' | 'Assimilating' | 'Converging' | 'Accommodating';
}

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
 * Hydrated context containing all data needed for matching
 */
export interface MatchingContext {
  assessment: Assessment;
  careers: Career[];
  activeComponents: AssessmentComponent[];
  careerAffinities: Map<string, CareerComponentAffinity[]>; // careerId -> affinities
  jobMarketTrends: Map<string, JobMarketTrend[]>; // careerId -> trends
  userCountry?: Country; // For vision alignment
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
  market: calculateMarketScore,
  kolb: calculateKolbScore,
  riasec: calculateRiasecScore,
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
  // Fetch assessment
  const assessment = await storage.getAssessmentById(assessmentId);
  if (!assessment) {
    throw new Error(`Assessment ${assessmentId} not found`);
  }

  // Fetch all careers
  const careers = await storage.getAllCareers();

  // Fetch active components (only those applicable to this user)
  const allComponents = await storage.getAllAssessmentComponents();
  const activeComponents = allComponents.filter(component => {
    // Only include active components
    if (!component.isActive) return false;
    
    // Skip premium components if user doesn't have premium access
    if (component.requiresPremium && assessment.assessmentType === 'basic') {
      return false;
    }
    
    return true;
  });

  // Fetch career affinities for all active components
  const careerAffinities = new Map<string, CareerComponentAffinity[]>();
  for (const career of careers) {
    const affinities = await storage.getCareerComponentAffinitiesByCareer(career.id);
    careerAffinities.set(career.id, affinities);
  }

  // Fetch job market trends (placeholder for now - will be enhanced in later subtask)
  const jobMarketTrends = new Map<string, JobMarketTrend[]>();
  // TODO: Add efficient bulk query for job market trends in storage interface

  // Fetch user's country for vision alignment
  let userCountry: Country | undefined;
  if (assessment.countryId) {
    userCountry = await storage.getCountryById(assessment.countryId);
  }

  return {
    assessment,
    careers,
    activeComponents,
    careerAffinities,
    jobMarketTrends,
    userCountry,
  };
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
  const { assessment } = context;
  
  if (!assessment.favoriteSubjects || assessment.favoriteSubjects.length === 0) {
    return null;
  }

  // TODO: Implement subject matching logic
  // For now, return placeholder
  return {
    careerId: career.id,
    score: 50,
    reasoning: "Subject matching to be implemented",
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

  // TODO: Implement interest matching logic
  return {
    careerId: career.id,
    score: 50,
    reasoning: "Interest matching to be implemented",
    componentKey: component.key,
  };
}

function calculateVisionScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { userCountry } = context;
  
  if (!userCountry || !userCountry.prioritySectors) {
    return null;
  }

  // TODO: Implement vision alignment logic
  return {
    careerId: career.id,
    score: 50,
    reasoning: "Vision alignment to be implemented",
    componentKey: component.key,
  };
}

function calculateMarketScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const trends = context.jobMarketTrends.get(career.id);
  
  if (!trends || trends.length === 0) {
    return null;
  }

  // Use most recent trend data
  const latestTrend = trends[0];

  return {
    careerId: career.id,
    score: latestTrend.demandScore,
    reasoning: `${latestTrend.growthRate.toFixed(1)}% projected growth`,
    componentKey: component.key,
  };
}

function calculateKolbScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { assessment } = context;
  const affinities = context.careerAffinities;
  
  // Check if user has Kolb scores (with type guard)
  if (!assessment.kolbScores) {
    return null;
  }
  
  const kolbScores = assessment.kolbScores as KolbScores;
  if (!kolbScores.learningStyle) {
    return null;
  }

  // Get Kolb affinities for this career
  const careerAffinityList = affinities.get(career.id) || [];
  const kolbAffinity = careerAffinityList.find(a => a.componentId === component.id);
  
  if (!kolbAffinity || !kolbAffinity.affinityData) {
    return null;
  }

  const userLearningStyle = kolbScores.learningStyle;
  const affinityScore = (kolbAffinity.affinityData as any)[userLearningStyle] || 0;

  return {
    careerId: career.id,
    score: affinityScore,
    reasoning: `${userLearningStyle} learning style affinity`,
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
