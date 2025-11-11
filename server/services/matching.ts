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
import { type AssessmentTier, getEffectiveWeight } from "./tierWeights";

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
  kolb: calculateKolbScore,
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
  const { assessment } = await storage.getAssessmentWithCompetencies(assessmentId);

  // Fetch all careers
  const careers = await storage.getAllCareers();

  // Fetch active components (only those applicable to this user)
  const allComponents = await storage.getAllAssessmentComponents();
  const tier: AssessmentTier = assessment.assessmentType as AssessmentTier;
  
  // Filter components and apply tier-specific weight overrides
  const activeComponents = allComponents
    .filter(component => {
      // Only include active components
      if (!component.isActive) return false;
      
      // Skip premium components if user doesn't have premium access
      if (component.requiresPremium && assessment.assessmentType === 'basic') {
        return false;
      }
      
      return true;
    })
    .map(component => {
      // Apply tier-specific weight override
      const effectiveWeight = getEffectiveWeight(tier, component.key, component.weight);
      return {
        ...component,
        weight: effectiveWeight, // Use effective weight for this tier
      };
    })
    .filter(component => component.weight > 0); // Remove components with 0 weight

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

  // Get competency scores if quiz was taken
  const competencyData = assessment as any; // Will have competencyScores from getAssessmentWithCompetencies
  
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
  
  if (competencyData.competencyScores && Object.keys(competencyData.competencyScores).length > 0) {
    const competencies = competencyData.competencyScores as Record<string, number>;
    const matchingCompetencies = matchingSubjects
      .map(subject => competencies[subject])
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

  // Interest to career category mapping
  const interestToCategoryMap: Record<string, string[]> = {
    "Technology": ["Technology", "IT & Software", "Engineering"],
    "Healthcare": ["Healthcare", "Medical", "Nursing"],
    "Arts & Design": ["Creative", "Design", "Arts"],
    "Business": ["Business", "Management", "Finance"],
    "Education": ["Education", "Teaching"],
    "Science": ["Science", "Research", "Engineering"],
    "Sports": ["Sports", "Physical Therapy", "Healthcare"],
    "Social Services": ["Social Services", "Healthcare", "Education"],
    "Law & Government": ["Legal", "Government", "Business"],
    "Environment": ["Environmental", "Science", "Engineering"],
  };

  // Calculate matching score
  let matchingInterests = 0;
  const matchedCategories: string[] = [];

  for (const interest of assessment.interests) {
    const categories = interestToCategoryMap[interest] || [interest];
    
    for (const category of categories) {
      if (career.category.toLowerCase().includes(category.toLowerCase()) ||
          category.toLowerCase().includes(career.category.toLowerCase())) {
        matchingInterests++;
        matchedCategories.push(interest);
        break;
      }
    }
  }

  // Calculate percentage score
  const score = assessment.interests.length > 0
    ? (matchingInterests / assessment.interests.length) * 100
    : 0;

  // Generate reasoning
  const reasoning = matchedCategories.length > 0
    ? `Aligns with ${matchedCategories.slice(0, 2).join(" & ")} interests`
    : "Limited alignment with stated interests";

  return {
    careerId: career.id,
    score: Math.min(100, Math.max(0, score)),
    reasoning,
    componentKey: component.key,
  };
}

function calculateVisionScore(
  context: MatchingContext,
  career: Career,
  component: AssessmentComponent
): ComponentScore | null {
  const { userCountry } = context;
  
  if (!userCountry || !userCountry.prioritySectors || userCountry.prioritySectors.length === 0) {
    return null;
  }

  // Check if career category aligns with country's priority sectors
  const prioritySectors = userCountry.prioritySectors as string[];
  
  // Find if career matches any priority sector
  let matchIndex = -1;
  let matchedSector = "";
  
  for (let i = 0; i < prioritySectors.length; i++) {
    const sector = prioritySectors[i];
    if (career.category.toLowerCase().includes(sector.toLowerCase()) ||
        sector.toLowerCase().includes(career.category.toLowerCase())) {
      matchIndex = i;
      matchedSector = sector;
      break;
    }
  }

  // Calculate score based on priority ranking
  let score: number;
  let reasoning: string;
  
  if (matchIndex === 0) {
    score = 100;
    reasoning = `Top priority sector for ${userCountry.name}: ${matchedSector}`;
  } else if (matchIndex === 1) {
    score = 90;
    reasoning = `High priority sector for ${userCountry.name}: ${matchedSector}`;
  } else if (matchIndex === 2) {
    score = 80;
    reasoning = `Priority sector for ${userCountry.name}: ${matchedSector}`;
  } else if (matchIndex > 2) {
    score = 60;
    reasoning = `Aligns with ${userCountry.name}'s development goals`;
  } else {
    score = 40;
    reasoning = `Viable career path in ${userCountry.name}`;
  }

  return {
    careerId: career.id,
    score,
    reasoning,
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
