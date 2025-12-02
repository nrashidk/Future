/**
 * Scoring Configuration Service
 * 
 * Provides database-driven scoring configuration with:
 * - Load tier weights from database
 * - Validate weight totals (must sum to 100%)
 * - Cache configurations for performance
 * - Fallback to hardcoded defaults if database is empty
 */

import type { IStorage } from "../storage";
import type { ScoringTier, TierComponentWeight, AssessmentComponent } from "../../shared/schema";
import { TIER_WEIGHT_OVERRIDES, type AssessmentTier } from "./tierWeights";

/**
 * Cached tier configuration
 */
interface TierConfig {
  tier: ScoringTier;
  weights: Map<string, { weight: number; isEnabled: boolean; componentId: string }>;
  totalWeight: number;
  lastUpdated: Date;
}

/**
 * Cache for tier configurations
 */
let configCache: Map<string, TierConfig> = new Map();
let componentCache: Map<string, AssessmentComponent> = new Map();
let lastCacheUpdate: Date | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if cache is still valid
 */
function isCacheValid(): boolean {
  if (!lastCacheUpdate) return false;
  return Date.now() - lastCacheUpdate.getTime() < CACHE_TTL_MS;
}

/**
 * Invalidate the configuration cache
 * Call this after any configuration update
 */
export function invalidateScoringConfigCache(): void {
  configCache.clear();
  componentCache.clear();
  lastCacheUpdate = null;
  console.log("[ScoringConfig] Cache invalidated");
}

/**
 * Load all tier configurations from database
 */
export async function loadScoringConfigurations(storage: IStorage): Promise<Map<string, TierConfig>> {
  // Return cached data if valid
  if (isCacheValid() && configCache.size > 0) {
    return configCache;
  }

  console.log("[ScoringConfig] Loading configurations from database...");

  // Load all data in parallel
  const [tiers, allWeights, components] = await Promise.all([
    storage.getAllScoringTiers(),
    storage.getAllTierComponentWeights(),
    storage.getAllAssessmentComponents(),
  ]);

  // Build component cache (key -> component)
  componentCache.clear();
  for (const component of components) {
    componentCache.set(component.key, component);
  }

  // Build component ID to key mapping
  const componentIdToKey = new Map<string, string>();
  for (const component of components) {
    componentIdToKey.set(component.id, component.key);
  }

  // Build tier configurations
  configCache.clear();
  for (const tier of tiers) {
    const tierWeights = allWeights.filter(w => w.tierId === tier.id);
    const weightsMap = new Map<string, { weight: number; isEnabled: boolean; componentId: string }>();
    
    let totalWeight = 0;
    for (const tw of tierWeights) {
      const componentKey = componentIdToKey.get(tw.componentId);
      if (componentKey && tw.isEnabled) {
        weightsMap.set(componentKey, {
          weight: tw.weight,
          isEnabled: tw.isEnabled,
          componentId: tw.componentId,
        });
        totalWeight += tw.weight;
      } else if (componentKey) {
        // Store disabled components with 0 weight
        weightsMap.set(componentKey, {
          weight: 0,
          isEnabled: false,
          componentId: tw.componentId,
        });
      }
    }

    configCache.set(tier.key, {
      tier,
      weights: weightsMap,
      totalWeight,
      lastUpdated: new Date(),
    });
  }

  lastCacheUpdate = new Date();
  console.log(`[ScoringConfig] Loaded ${configCache.size} tier configurations`);
  
  return configCache;
}

/**
 * Get configuration for a specific tier
 * Falls back to hardcoded defaults if database config is unavailable
 */
export async function getTierConfig(
  storage: IStorage,
  tierKey: AssessmentTier
): Promise<TierConfig | null> {
  const configs = await loadScoringConfigurations(storage);
  
  if (configs.has(tierKey)) {
    return configs.get(tierKey)!;
  }

  // Fallback: create config from hardcoded values
  console.log(`[ScoringConfig] Tier "${tierKey}" not in database, using hardcoded defaults`);
  const hardcodedWeights = TIER_WEIGHT_OVERRIDES[tierKey];
  
  if (!hardcodedWeights) {
    return null;
  }

  const weightsMap = new Map<string, { weight: number; isEnabled: boolean; componentId: string }>();
  let totalWeight = 0;
  
  for (const [key, weight] of Object.entries(hardcodedWeights)) {
    if (weight !== undefined && weight > 0) {
      weightsMap.set(key, { weight, isEnabled: true, componentId: "" });
      totalWeight += weight;
    }
  }

  return {
    tier: {
      id: tierKey,
      key: tierKey,
      name: tierKey === "basic" ? "Free Assessment" : tierKey === "kolb" ? "Premium Assessment" : "School Assessment",
      description: null,
      isActive: true,
      displayOrder: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    weights: weightsMap,
    totalWeight,
    lastUpdated: new Date(),
  };
}

/**
 * Get effective weight for a component in a given tier
 * Uses database config with fallback to hardcoded values
 */
export async function getEffectiveWeightFromDb(
  storage: IStorage,
  tierKey: AssessmentTier,
  componentKey: string
): Promise<number> {
  const config = await getTierConfig(storage, tierKey);
  
  if (config && config.weights.has(componentKey)) {
    const weightConfig = config.weights.get(componentKey)!;
    return weightConfig.isEnabled ? weightConfig.weight : 0;
  }

  // Fallback to hardcoded
  const override = TIER_WEIGHT_OVERRIDES[tierKey]?.[componentKey];
  return override !== undefined ? override : 0;
}

/**
 * Validate tier weight configuration
 * Returns errors if weights don't sum to 100%
 */
export async function validateTierWeights(storage: IStorage): Promise<string[]> {
  const configs = await loadScoringConfigurations(storage);
  const errors: string[] = [];

  const configEntries = Array.from(configs.entries());
  for (const [tierKey, config] of configEntries) {
    if (!config.tier.isActive) continue;
    
    if (Math.abs(config.totalWeight - 100) > 0.01) {
      errors.push(
        `Tier "${config.tier.name}" weights sum to ${config.totalWeight}% instead of 100%`
      );
    }
  }

  return errors;
}

/**
 * Get all enabled components for a tier with their weights
 */
export async function getEnabledComponentsForTier(
  storage: IStorage,
  tierKey: AssessmentTier
): Promise<Array<{ component: AssessmentComponent; weight: number }>> {
  const config = await getTierConfig(storage, tierKey);
  if (!config) return [];

  const result: Array<{ component: AssessmentComponent; weight: number }> = [];
  
  const weightEntries = Array.from(config.weights.entries());
  for (const [componentKey, weightConfig] of weightEntries) {
    if (weightConfig.isEnabled && weightConfig.weight > 0) {
      const component = componentCache.get(componentKey);
      if (component) {
        result.push({ component, weight: weightConfig.weight });
      }
    }
  }

  return result;
}

/**
 * Get summary of all tier configurations for admin display
 */
export async function getScoringConfigSummary(storage: IStorage): Promise<{
  tiers: Array<{
    id: string;
    key: string;
    name: string;
    description: string | null;
    isActive: boolean;
    totalWeight: number;
    components: Array<{
      key: string;
      name: string;
      weight: number;
      isEnabled: boolean;
    }>;
  }>;
  isValid: boolean;
  validationErrors: string[];
}> {
  const configs = await loadScoringConfigurations(storage);
  const validationErrors = await validateTierWeights(storage);

  const tiers = Array.from(configs.values()).map(config => {
    const weightEntries = Array.from(config.weights.entries());
    return {
      id: config.tier.id,
      key: config.tier.key,
      name: config.tier.name,
      description: config.tier.description,
      isActive: config.tier.isActive,
      totalWeight: config.totalWeight,
      components: weightEntries.map(([key, wc]) => {
        const component = componentCache.get(key);
        return {
          key,
          name: component?.name || key,
          weight: wc.weight,
          isEnabled: wc.isEnabled,
        };
      }),
    };
  });

  return {
    tiers,
    isValid: validationErrors.length === 0,
    validationErrors,
  };
}
