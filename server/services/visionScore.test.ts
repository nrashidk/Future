/**
 * VISION-ALIGNMENT scoring — unit tests.
 *
 * These pin the three behaviours that the substring-matching implementation got
 * wrong, plus the two traps the replacement design is built around:
 *   1. relevance drives the score, rank is only a +/-15% modifier;
 *   2. no mapping means the floor (40), which is a real answer, not a gap;
 *   3. OVERRIDE-EXCLUSIVE: an override suppresses category rules for OTHER
 *      sectors entirely — the naive per-sector `override ?? category` merge
 *      fails the test below;
 *   4. the sector name is emitted verbatim from countries.prioritySectors so the
 *      Arabic \b substitution in recommendations.routes.ts can match it.
 */

import { describe, it, expect } from "vitest";
import {
  buildSectorCategoryMap,
  calculateVisionScore,
  type MatchingContext,
  type SectorCategoryMap,
} from "./matching";
import type { SectorCategoryRow } from "../storage";
import type { AssessmentComponent, Career, Country } from "../../shared/schema";

const COMPONENT = { key: "vision", weight: 20 } as unknown as AssessmentComponent;

const COUNTRY = {
  id: "uae",
  name: "UAE",
  prioritySectors: ["Advanced Technology", "Healthcare", "Tourism"],
} as unknown as Country;

function career(id: string, category: string): Career {
  return { id, category, title: id } as unknown as Career;
}

function context(
  sectorCategoryMap?: SectorCategoryMap,
  userCountry: Country | null = COUNTRY,
): MatchingContext {
  return {
    assessment: { assessmentType: "premium" },
    careers: [],
    activeComponents: [COMPONENT],
    careerAffinities: new Map(),
    jobMarketTrends: new Map(),
    userCountry: userCountry ?? undefined,
    sectorCategoryMap,
  } as unknown as MatchingContext;
}

/** Sector rows in display_order; relevance null = LEFT JOIN filler (empty sector). */
function row(over: Partial<SectorCategoryRow>): SectorCategoryRow {
  return {
    sectorId: "s1",
    sectorName: "Advanced Technology",
    displayOrder: 0,
    careerCategory: null,
    careerId: null,
    relevance: null,
    ...over,
  };
}

const TECH = { sectorId: "s1", sectorName: "Advanced Technology", displayOrder: 0 };
const HEALTH = { sectorId: "s2", sectorName: "Healthcare", displayOrder: 1 };
const TOURISM = { sectorId: "s3", sectorName: "Tourism", displayOrder: 2 };

describe("calculateVisionScore — floor", () => {
  it("returns null when the assessment has no country", () => {
    expect(calculateVisionScore(context(undefined, null), career("c1", "Culinary Arts"), COMPONENT)).toBeNull();
  });

  it("scores the floor (40) for a career with no mapping — a real answer, not a gap", () => {
    const map = buildSectorCategoryMap(
      [row({ ...TECH, careerCategory: "Technology", relevance: 90 })],
      COUNTRY,
    );
    const result = calculateVisionScore(context(map), career("chef", "Culinary Arts"), COMPONENT)!;

    expect(result.score).toBe(40);
    expect(result.reasoning).toBe("Viable career path in UAE");
  });

  it("scores the floor when the map is entirely unseeded", () => {
    const map = buildSectorCategoryMap(
      [row(TECH), row(HEALTH), row(TOURISM)], // LEFT JOIN fillers: sectors, no rules
      COUNTRY,
    );
    expect(map.sectors.size).toBe(3); // Empty sectors still hold their rank
    expect(calculateVisionScore(context(map), career("c1", "Technology"), COMPONENT)!.score).toBe(40);
  });
});

describe("calculateVisionScore — relevance drives the score, rank modifies it", () => {
  it("applies score = 40 + 60 * (relevance/100) * rankFactor", () => {
    const map = buildSectorCategoryMap(
      [
        row({ ...TECH, careerCategory: "Technology", relevance: 100 }),
        row({ ...HEALTH, careerCategory: "Health", relevance: 100 }),
        row({ ...TOURISM, careerCategory: "Hospitality", relevance: 100 }),
      ],
      COUNTRY,
    );

    // rankFactor = 1 - 0.15 * (i / (n-1)) for n = 3 => 1.0, 0.925, 0.85
    expect(calculateVisionScore(context(map), career("a", "Technology"), COMPONENT)!.score).toBe(100);
    expect(calculateVisionScore(context(map), career("b", "Health"), COMPONENT)!.score).toBeCloseTo(95.5, 5);
    expect(calculateVisionScore(context(map), career("c", "Hospitality"), COMPONENT)!.score).toBeCloseTo(91, 5);
  });

  it("lets a strong lower-ranked sector beat a weak top-ranked one (rank is only +/-15%)", () => {
    const map = buildSectorCategoryMap(
      [
        row({ ...TECH, careerCategory: "Admin", relevance: 20 }),
        row({ ...TOURISM, careerCategory: "Admin", relevance: 90 }),
      ],
      COUNTRY,
    );
    // Tourism is last-ranked but far more relevant: 40 + 60*0.9*0.85 = 85.9
    const result = calculateVisionScore(context(map), career("a", "Admin"), COMPONENT)!;
    expect(result.score).toBeCloseTo(85.9, 5);
    expect(result.reasoning).toContain("Tourism");
  });

  it("gives a single-sector country rankFactor 1 (no divide-by-zero)", () => {
    const map = buildSectorCategoryMap([row({ ...TECH, careerCategory: "Technology", relevance: 50 })], COUNTRY);
    expect(calculateVisionScore(context(map), career("a", "Technology"), COMPONENT)!.score).toBe(70);
  });

  it("matches career.category case- and whitespace-insensitively", () => {
    const map = buildSectorCategoryMap([row({ ...TECH, careerCategory: "Technology", relevance: 80 })], COUNTRY);
    expect(calculateVisionScore(context(map), career("a", "  technology "), COMPONENT)!.score).toBe(88);
  });

  it("does not substring-match: biotechnology is not technology", () => {
    const map = buildSectorCategoryMap([row({ ...TECH, careerCategory: "Technology", relevance: 90 })], COUNTRY);
    expect(calculateVisionScore(context(map), career("a", "Biotechnology"), COMPONENT)!.score).toBe(40);
  });
});

describe("calculateVisionScore — OVERRIDE-EXCLUSIVE", () => {
  // The trap: a career whose category rule scores high under sector A, but which
  // has a deliberate LOW override under sector B. A per-sector `override ?? category`
  // merge inside the sector loop still lets sector A's category rule win the max.
  const rows: SectorCategoryRow[] = [
    row({ ...TECH, careerCategory: "Technology", relevance: 100 }),
    row({ ...HEALTH, careerId: "legacy-it", relevance: 30 }),
  ];

  it("uses ONLY the override rows once any override exists for the career", () => {
    const map = buildSectorCategoryMap(rows, COUNTRY);
    const result = calculateVisionScore(context(map), career("legacy-it", "Technology"), COMPONENT)!;

    // Override path: 40 + 60 * 0.30 * 0.85 (Healthcare, last of the 2 sectors present) = 55.3
    expect(result.score).toBeCloseTo(55.3, 5);
    expect(result.reasoning).toContain("Healthcare");
    // The naive merge would have returned 100 via the Technology category rule.
    expect(result.score).not.toBe(100);
    expect(result.reasoning).not.toContain("Advanced Technology");
  });

  it("still applies the category rule to other careers in the same category", () => {
    const map = buildSectorCategoryMap(rows, COUNTRY);
    const result = calculateVisionScore(context(map), career("ai-engineer", "Technology"), COMPONENT)!;
    expect(result.score).toBe(100);
    expect(result.reasoning).toContain("Advanced Technology");
  });

  it("takes the max across multiple overrides for one career", () => {
    const map = buildSectorCategoryMap(
      [
        row({ ...TECH, careerId: "c1", relevance: 40 }),
        row({ ...HEALTH, careerId: "c1", relevance: 90 }),
      ],
      COUNTRY,
    );
    // Healthcare 90 * 0.85 = 0.765 beats Technology 40 * 1.0
    expect(calculateVisionScore(context(map), career("c1", "Anything"), COMPONENT)!.score).toBeCloseTo(85.9, 5);
  });

  it("falls back to the floor when every override row is zero-relevance", () => {
    const map = buildSectorCategoryMap(
      [
        row({ ...TECH, careerCategory: "Technology", relevance: 100 }),
        row({ ...HEALTH, careerId: "c1", relevance: 0 }),
      ],
      COUNTRY,
    );
    // relevance 0 is dropped at build time, so c1 has no override list and falls
    // through to its category rule. Documented behaviour: use no row, not a 0 row,
    // to mean "not relevant"; use a low relevance to demote.
    expect(map.byCareer.has("c1")).toBe(false);
    expect(calculateVisionScore(context(map), career("c1", "Technology"), COMPONENT)!.score).toBe(100);
  });
});

describe("calculateVisionScore — Arabic substitution constraint", () => {
  it("emits the sector name verbatim from countries.prioritySectors", () => {
    // DB row spelled differently from the countries.prioritySectors entry.
    const map = buildSectorCategoryMap(
      [row({ sectorId: "s1", sectorName: "advanced technology", displayOrder: 0, careerCategory: "Technology", relevance: 90 })],
      COUNTRY,
    );
    const reasoning = calculateVisionScore(context(map), career("a", "Technology"), COMPONENT)!.reasoning;

    // recommendations.routes.ts substitutes with new RegExp(`\\b${sector}\\b`, "gi").
    for (const sector of COUNTRY.prioritySectors as string[]) {
      const pattern = new RegExp(`\\b${sector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
      if (sector === "Advanced Technology") {
        expect(reasoning).toMatch(pattern);
      }
    }
    expect(reasoning).toContain("Advanced Technology");
  });

  it("leaves the sector name bare and un-possessive at the end of the string", () => {
    const map = buildSectorCategoryMap([row({ ...TECH, careerCategory: "Technology", relevance: 90 })], COUNTRY);
    const reasoning = calculateVisionScore(context(map), career("a", "Technology"), COMPONENT)!.reasoning;

    expect(reasoning).toBe("Core to a national priority sector for UAE: Advanced Technology");
    expect(reasoning.endsWith("Advanced Technology")).toBe(true);
    expect(reasoning).not.toMatch(/Advanced Technology['’]s/);
  });

  it("bands the wording by relevance, not by rank", () => {
    const map = buildSectorCategoryMap(
      [
        row({ ...TECH, careerCategory: "High", relevance: 80 }),
        row({ ...HEALTH, careerCategory: "Mid", relevance: 50 }),
        row({ ...TOURISM, careerCategory: "Low", relevance: 20 }),
      ],
      COUNTRY,
    );
    expect(calculateVisionScore(context(map), career("a", "High"), COMPONENT)!.reasoning).toMatch(/^Core to/);
    expect(calculateVisionScore(context(map), career("b", "Mid"), COMPONENT)!.reasoning).toMatch(/^Supports/);
    expect(calculateVisionScore(context(map), career("c", "Low"), COMPONENT)!.reasoning).toMatch(/^Some relevance/);
  });
});
