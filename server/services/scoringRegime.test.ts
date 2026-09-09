/**
 * THE CURRENT SCORING REGIME, and specifically why it may not be derived from
 * the admin-facing config.
 *
 * recommendations.scoring_provenance records which regime produced a stored row.
 * Comparing it against the current regime answers "is this report reproducible
 * today". The comparison is only worth showing if it is RIGHT: a false "stale"
 * teaches the operator to ignore the column, which is the failure the column
 * exists to prevent.
 *
 * The tempting shortcut is to hash the weights that GET /api/superadmin/scoring-
 * config already returns. The last describe block below constructs each of the
 * three configurations where that answer differs from the scorer's, and asserts
 * the difference — so if someone later "simplifies" resolveActiveComponents into
 * a read of the weight rows, these fail with the reason.
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  resolveActiveComponents,
  currentScoringRegimeForTier,
  currentScoringRegimes,
  generateConfigVersion,
  SCORING_ALGORITHM_VERSION,
} from "./matching";
import {
  getScoringConfigSummary,
  invalidateScoringConfigCache,
} from "./scoringConfig";
import type { IStorage } from "../storage";

interface ComponentSpec {
  key: string;
  weight: number;
  isActive?: boolean;
  requiresPremium?: boolean;
}

function components(specs: ComponentSpec[]) {
  return specs.map((s, i) => ({
    id: `comp-${s.key}`,
    key: s.key,
    name: s.key,
    displayName: s.key,
    weight: s.weight,
    isActive: s.isActive ?? true,
    requiresPremium: s.requiresPremium ?? false,
    displayOrder: i,
  }));
}

/**
 * @param tierWeights when omitted, no scoring_tiers rows exist and getTierConfig
 *   synthesises a tier from the hardcoded TIER_WEIGHT_OVERRIDES.
 */
function makeStorage(
  specs: ComponentSpec[],
  tierWeights?: { tierKey: string; weights: Record<string, number> },
): IStorage {
  const comps = components(specs);
  const tiers = tierWeights
    ? [{ id: "tier-1", key: tierWeights.tierKey, name: tierWeights.tierKey, description: null, isActive: true, displayOrder: 0 }]
    : [];
  const weightRows = tierWeights
    ? Object.entries(tierWeights.weights).map(([key, weight]) => ({
        id: `tw-${key}`,
        tierId: "tier-1",
        componentId: `comp-${key}`,
        weight,
        isEnabled: true,
      }))
    : [];

  return {
    getAllAssessmentComponents: async () => comps,
    getAllScoringTiers: async () => tiers,
    getAllTierComponentWeights: async () => weightRows,
  } as unknown as IStorage;
}

const keysOf = async (storage: IStorage, tier: string) =>
  (await resolveActiveComponents(storage, tier)).map((c) => c.key).sort();

// The scoringConfig cache is module-level and survives between tests.
beforeEach(() => invalidateScoringConfigCache());

describe("resolveActiveComponents", () => {
  it("drops components flagged inactive", async () => {
    const storage = makeStorage([
      { key: "subjects", weight: 35 },
      { key: "interests", weight: 35 },
      { key: "vision", weight: 30, isActive: false },
    ]);
    expect(await keysOf(storage, "basic")).toEqual(["interests", "subjects"]);
  });

  it("drops premium-only components for a basic assessment, keeps them for premium", async () => {
    const specs: ComponentSpec[] = [
      { key: "subjects", weight: 35 },
      { key: "interests", weight: 35 },
      { key: "vision", weight: 30 },
      { key: "riasec", weight: 35, requiresPremium: true },
      { key: "cvq", weight: 25, requiresPremium: true },
    ];
    expect(await keysOf(makeStorage(specs), "basic")).toEqual(["interests", "subjects", "vision"]);
    // premium's hardcoded table zeroes `interests`, and a 0 weight is dropped.
    expect(await keysOf(makeStorage(specs), "premium")).toEqual(["cvq", "riasec", "subjects", "vision"]);
  });

  it("keeps premium components for the 'free' synonym — faithful to the scorer, not to isFreeAssessment", async () => {
    // Preserved quirk, asserted so it is a decision rather than a surprise: the
    // gate compares against the literal 'basic'. Stored rows were scored this
    // way; changing it moves scores and needs a SCORING_ALGORITHM_VERSION bump.
    const storage = makeStorage([
      { key: "subjects", weight: 35 },
      { key: "riasec", weight: 35, requiresPremium: true },
    ]);
    expect(await keysOf(storage, "free")).toContain("riasec");
  });

  it("uses database weights when the tier's rows sum to at least 95", async () => {
    const storage = makeStorage(
      [{ key: "subjects", weight: 35 }, { key: "interests", weight: 35 }, { key: "vision", weight: 30 }],
      { tierKey: "basic", weights: { subjects: 50, interests: 25, vision: 25 } },
    );
    const resolved = await resolveActiveComponents(storage, "basic");
    expect(resolved.find((c) => c.key === "subjects")?.weight).toBe(50);
  });

  it("reverts the WHOLE tier to hardcoded weights when the rows sum below 95", async () => {
    const storage = makeStorage(
      [{ key: "subjects", weight: 35 }, { key: "interests", weight: 35 }, { key: "vision", weight: 30 }],
      { tierKey: "basic", weights: { subjects: 50, interests: 20, vision: 20 } }, // 90
    );
    const resolved = await resolveActiveComponents(storage, "basic");
    // Hardcoded basic is 35/35/30 — the 50 in the database is not used.
    expect(resolved.find((c) => c.key === "subjects")?.weight).toBe(35);
  });
});

describe("currentScoringRegimeForTier", () => {
  it("reports the live algorithm version and the hash of the scorer's own set", async () => {
    const storage = makeStorage([
      { key: "subjects", weight: 35 },
      { key: "interests", weight: 35 },
      { key: "vision", weight: 30 },
    ]);
    const regime = await currentScoringRegimeForTier(storage, "basic");
    expect(regime.algorithm).toBe(SCORING_ALGORITHM_VERSION);
    expect(regime.configHash).toBe(
      generateConfigVersion(await resolveActiveComponents(storage, "basic")),
    );
  });

  it("is a per-tier constant — it never reads a student's answers", async () => {
    // Why the comparison is cheap enough to show per row: same tier, same hash,
    // no assessment involved anywhere in the call.
    const storage = makeStorage([{ key: "subjects", weight: 35 }, { key: "interests", weight: 35 }, { key: "vision", weight: 30 }]);
    const a = await currentScoringRegimeForTier(storage, "basic");
    const b = await currentScoringRegimeForTier(storage, "basic");
    expect(a.configHash).toBe(b.configHash);
  });

  it("gives different tiers different hashes", async () => {
    const specs: ComponentSpec[] = [
      { key: "subjects", weight: 35 },
      { key: "interests", weight: 35 },
      { key: "vision", weight: 30 },
      { key: "riasec", weight: 35, requiresPremium: true },
      { key: "cvq", weight: 25, requiresPremium: true },
    ];
    const basic = await currentScoringRegimeForTier(makeStorage(specs), "basic");
    invalidateScoringConfigCache();
    const premium = await currentScoringRegimeForTier(makeStorage(specs), "premium");
    expect(basic.configHash).not.toBe(premium.configHash);
  });
});

describe("currentScoringRegimes", () => {
  it("returns one regime per CONFIGURED tier, matching the per-tier helper", async () => {
    // The estate card and the scoring-config editor both read this list, so a
    // disagreement between them would be a disagreement about what "current"
    // means. One helper, asserted against the single-tier path.
    const storage = makeStorage(
      [{ key: "subjects", weight: 35 }, { key: "interests", weight: 35 }, { key: "vision", weight: 30 }],
      { tierKey: "basic", weights: { subjects: 35, interests: 35, vision: 30 } },
    );
    const regimes = await currentScoringRegimes(storage);
    expect(regimes.map((r) => r.tier)).toEqual(["basic"]);
    expect(regimes[0].algorithm).toBe(SCORING_ALGORITHM_VERSION);
    expect(regimes[0].configHash).toBe(
      (await currentScoringRegimeForTier(storage, "basic")).configHash,
    );
  });

  it("returns an empty list when no tier is configured", async () => {
    // Not a degenerate case to shrug at: it is what puts every stored row into
    // noCurrentRegime, and it is why storage.getScoringEstateCounts has a
    // separate branch — a zero-row VALUES list is a syntax error.
    expect(await currentScoringRegimes(makeStorage([{ key: "subjects", weight: 35 }]))).toEqual([]);
  });
});

describe("the admin-facing config is NOT the scorer's set", () => {
  /**
   * Asserted on the SET, not on the hash, and deliberately: generateConfigVersion
   * cannot currently express most of these differences (see the block below), so
   * a hash-level assertion here would pass for the wrong reason and would stop
   * meaning anything the moment the hash is fixed. The set is the real contract
   * of resolveActiveComponents.
   */
  const adminFacingSet = async (storage: IStorage, tierKey: string) => {
    const summary = await getScoringConfigSummary(storage);
    const tier = summary.tiers.find((t) => t.key === tierKey)!;
    return tier.components
      .filter((c) => c.isEnabled && c.weight > 0)
      .map((c) => `${c.key}:${c.weight}`)
      .sort();
  };
  const scorerSet = async (storage: IStorage, tierKey: string) =>
    (await resolveActiveComponents(storage, tierKey)).map((c) => `${c.key}:${c.weight}`).sort();

  it("differs when a weighted component is flagged inactive", async () => {
    const storage = makeStorage(
      [{ key: "subjects", weight: 35 }, { key: "interests", weight: 35 }, { key: "vision", weight: 30, isActive: false }],
      { tierKey: "basic", weights: { subjects: 35, interests: 35, vision: 30 } },
    );
    expect(await adminFacingSet(storage, "basic")).toContain("vision:30");
    expect(
      await scorerSet(storage, "basic"),
      "The admin config still lists the inactive component; the scorer drops it.",
    ).not.toContain("vision:30");
  });

  it("differs when premium gating applies to a basic assessment", async () => {
    const storage = makeStorage(
      [{ key: "subjects", weight: 60 }, { key: "vision", weight: 20 }, { key: "riasec", weight: 20, requiresPremium: true }],
      { tierKey: "basic", weights: { subjects: 60, vision: 20, riasec: 20 } },
    );
    expect(await adminFacingSet(storage, "basic")).toContain("riasec:20");
    expect(await scorerSet(storage, "basic")).not.toContain("riasec:20");
  });

  it("differs when the tier's rows sum below 95 and the scorer reverts to hardcoded", async () => {
    const storage = makeStorage(
      [{ key: "subjects", weight: 35 }, { key: "interests", weight: 35 }, { key: "vision", weight: 30 }],
      { tierKey: "basic", weights: { subjects: 50, interests: 20, vision: 20 } }, // 90
    );
    expect(
      await adminFacingSet(storage, "basic"),
      "The admin screen shows the database weights it was given.",
    ).toEqual(["interests:20", "subjects:50", "vision:20"]);
    expect(
      await scorerSet(storage, "basic"),
      "Below 95 the scorer ignores those weights entirely and uses hardcoded 35/35/30.",
    ).toEqual(["interests:35", "subjects:35", "vision:30"]);
  });
});

describe("generateConfigVersion TRUNCATION — a known defect, pinned so it cannot be forgotten", () => {
  /**
   * configHash is documented (shared/schema.ts) as the half of provenance that
   * "can never be forgotten" because it is computed automatically from component
   * keys and weights. On the real tier configurations it is very nearly blind.
   *
   * The function base64-encodes a sorted `key:weight` join and slices to 16
   * characters. Base64 is 4 characters per 3 bytes, so 16 characters is exactly
   * the FIRST 12 BYTES of the string — roughly one component. Everything after
   * that, including entire components, is invisible.
   *
   * These assertions state today's behaviour, not desired behaviour. They exist
   * so the defect is undeniable and so that fixing it is a deliberate act with a
   * failing test attached — a fix must also decide what happens to stored rows,
   * whose hashes were written under this scheme and would otherwise all start
   * reading as "config drifted" when nothing about them changed.
   */
  const hash = (pairs: Array<[string, number]>) =>
    generateConfigVersion(pairs.map(([key, weight]) => ({ key, weight })) as any);

  const BASIC: Array<[string, number]> = [["subjects", 35], ["interests", 35], ["vision", 30]];
  const PREMIUM: Array<[string, number]> = [["subjects", 20], ["vision", 20], ["riasec", 35], ["cvq", 25]];

  it("sees only the first ~12 bytes: basic's hash IS the string 'interests:35'", () => {
    expect(Buffer.from(hash(BASIC), "base64").toString()).toBe("interests:35");
  });

  it("cannot see a weight change to any component that does not sort first", () => {
    expect(
      hash([["subjects", 99], ["interests", 35], ["vision", 1]]),
      "subjects 35->99 and vision 30->1 — two weight edits, no change in hash.",
    ).toBe(hash(BASIC));
  });

  it("cannot see a component being removed from the tier entirely", () => {
    expect(hash([["subjects", 35], ["interests", 35]])).toBe(hash(BASIC));
  });

  it("on premium it does not even reach riasec's weight", () => {
    expect(Buffer.from(hash(PREMIUM), "base64").toString()).toBe("cvq:25|riase");
    expect(hash([["subjects", 5], ["vision", 70], ["riasec", 35], ["cvq", 25]])).toBe(hash(PREMIUM));
  });
});
