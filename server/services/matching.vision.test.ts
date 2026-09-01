/**
 * VISION ALIGNMENT — the HYBRID score (WEF Phase 1).
 *
 * These tests run the REAL calculator over the REAL seeded data
 * (UAE_SECTOR_CATEGORY_RULES, UAE_SECTOR_CAREER_OVERRIDES, UAE_SECTOR_WEF_SKILLS
 * from server/seed.ts and CAREER_WEF_SKILL_AFFINITIES from
 * server/wefSkillsData.ts). Nothing is reimplemented here, so a change to the
 * scorer or to the seed data is what these assertions actually see.
 *
 * The load-bearing one is "mean-centering". career_wef_skill_affinities is an
 * IMPORTANCE matrix — 71% of its values are >= 80 — so an uncentered overlap
 * gives every career a near-identical alignment and the skill modulation
 * silently does nothing, leaving the component looking healthy while
 * discriminating no better than the category map it was meant to sharpen. That
 * is invisible in every other check, which is why it is pinned here.
 */

import { describe, it, expect, vi } from "vitest";

// seed.ts -> storage.ts -> db.ts opens a Neon pool (and throws without
// DATABASE_URL) at import time. Only the DATA is under test.
vi.mock("../db", () => ({ db: {}, pool: {} }));

const { UAE_SECTOR_CATEGORY_RULES, UAE_SECTOR_CAREER_OVERRIDES, UAE_SECTOR_WEF_SKILLS } =
  await import("../seed");
const { CAREER_WEF_SKILL_AFFINITIES } = await import("../wefSkillsData");
const {
  calculateVisionScore,
  buildSectorCategoryMap,
  buildSectorWefSkillMap,
} = await import("./matching");

import type { SectorCategoryRow, SectorWefSkillRow } from "../storage";
import type { MatchingContext } from "./matching";
import type { Career, AssessmentComponent, Country } from "@shared/schema";

// ---------------------------------------------------------------------------
// Fixtures built from the seed data
// ---------------------------------------------------------------------------

const SECTOR_ID = (name: string) => `sector-${name.replace(/\s+/g, "-").toLowerCase()}`;
const SKILL_ID = (name: string) => `skill-${name.replace(/\s+/g, "-").toLowerCase()}`;
const CAREER_ID = (title: string) => `career-${title.replace(/\W+/g, "-").toLowerCase()}`;

/** Every career the seed authors WEF affinities for, with its seeded category. */
const CAREER_CATEGORY: Record<string, string> = {
  "Software Engineer": "Technology", "Data Scientist": "Technology",
  "Product Manager": "Technology", "UX/UI Designer": "Technology",
  "Web Developer": "Technology",
  "Renewable Energy Engineer": "Engineering", "Biomedical Engineer": "Engineering",
  "Civil Engineer": "Engineering", "Electrical Engineer": "Engineering",
  "Mechanical Engineer": "Engineering",
  "Healthcare Professional (Nurse)": "Healthcare", "Doctor (General Practitioner)": "Healthcare",
  "Dentist": "Healthcare", "Pharmacist": "Healthcare",
  "Physical Therapist": "Healthcare", "Psychologist": "Healthcare",
  "Digital Marketing Specialist": "Business & Marketing",
  "Marketing Manager": "Business & Marketing", "Sales Manager": "Business & Marketing",
  "Entrepreneur": "Business & Management", "Human Resources Manager": "Business & Management",
  "Management Consultant": "Business & Management",
  "Graphic Designer": "Creative Arts", "Fashion Designer": "Creative Arts",
  "Photographer": "Creative Arts", "Video Game Designer": "Creative Arts",
  "Architect": "Design & Architecture", "Interior Designer": "Design & Architecture",
  "Accountant": "Finance", "Financial Analyst": "Finance",
  "Teacher (Secondary Education)": "Education",
  "Environmental Scientist": "Science",
  "Journalist": "Media & Communications", "Content Creator": "Media & Communications",
  "Lawyer": "Legal", "Social Worker": "Social Services", "Chef": "Culinary Arts",
};

const CAREERS = Object.entries(CAREER_CATEGORY).map(([title, category]) => ({
  id: CAREER_ID(title), title, category,
})) as unknown as Career[];

const VISION_COMPONENT = { key: "vision", weight: 30 } as unknown as AssessmentComponent;

const UAE = {
  name: "United Arab Emirates",
  prioritySectors: UAE_SECTOR_WEF_SKILLS.map(s => s.name),
} as unknown as Country;

function categoryRows(): SectorCategoryRow[] {
  const rows: SectorCategoryRow[] = [];
  for (const sector of UAE_SECTOR_WEF_SKILLS) {
    for (const rule of UAE_SECTOR_CATEGORY_RULES.filter(r => r.sector === sector.name)) {
      rows.push({
        sectorId: SECTOR_ID(sector.name), sectorName: sector.name,
        displayOrder: sector.displayOrder, careerCategory: rule.category,
        careerId: null, relevance: rule.relevance,
      });
    }
    for (const ovr of UAE_SECTOR_CAREER_OVERRIDES.filter(o => o.sector === sector.name)) {
      rows.push({
        sectorId: SECTOR_ID(sector.name), sectorName: sector.name,
        displayOrder: sector.displayOrder, careerCategory: null,
        careerId: CAREER_ID(ovr.careerTitle), relevance: ovr.relevance,
      });
    }
  }
  return rows.sort((a, b) => a.displayOrder - b.displayOrder);
}

function skillRows(): SectorWefSkillRow[] {
  return UAE_SECTOR_WEF_SKILLS.flatMap(sector =>
    Object.entries(sector.skills).map(([skillName, importance]) => ({
      sectorId: SECTOR_ID(sector.name), sectorName: sector.name,
      displayOrder: sector.displayOrder, wefSkillId: SKILL_ID(skillName),
      wefSkillName: skillName, importance,
    })),
  ).sort((a, b) => a.displayOrder - b.displayOrder);
}

const affinityMap = new Map(
  CAREER_WEF_SKILL_AFFINITIES.map(m => [
    CAREER_ID(m.careerTitle),
    Object.entries(m.skills).map(([name, affinityScore]) => ({
      wefSkillId: SKILL_ID(name), affinityScore,
    })),
  ]),
);

function makeContext(opts: { skills: boolean } = { skills: true }): MatchingContext {
  return {
    assessment: { assessmentType: "premium" },
    careers: CAREERS,
    activeComponents: [VISION_COMPONENT],
    userCountry: UAE,
    careerWefAffinities: opts.skills ? affinityMap : undefined,
    sectorCategoryMap: buildSectorCategoryMap(categoryRows(), UAE),
    sectorWefSkillMap: opts.skills
      ? buildSectorWefSkillMap(skillRows(), affinityMap)
      : undefined,
  } as unknown as MatchingContext;
}

const scoreAll = (ctx: MatchingContext) =>
  CAREERS.map(c => calculateVisionScore(ctx, c, VISION_COMPONENT)!);
const spread = (v: number[]) => Math.max(...v) - Math.min(...v);
const scoreOf = (ctx: MatchingContext, title: string) =>
  calculateVisionScore(ctx, CAREERS.find(c => c.title === title)!, VISION_COMPONENT)!;

// ---------------------------------------------------------------------------

describe("calculateVisionScore — HYBRID (category gate + WEF skill modulation)", () => {
  it("resolves careers that share a category, which the category map alone cannot", () => {
    const ctx = makeContext();

    const healthcare = CAREERS.filter(c => c.category === "Healthcare");
    expect(healthcare).toHaveLength(6);

    const withSkills = healthcare.map(c => scoreOf(ctx, c.title).score);
    const withoutSkills = healthcare.map(
      c => calculateVisionScore(makeContext({ skills: false }), c, VISION_COMPONENT)!.score,
    );

    // Category alone: career.category is the only input, so all six are identical.
    expect(new Set(withoutSkills.map(s => s.toFixed(4))).size).toBe(1);
    // Hybrid: six distinct scores.
    expect(new Set(withSkills.map(s => s.toFixed(4))).size).toBe(6);
  });

  it("MEAN-CENTERING IS LOAD-BEARING — without it the modulation collapses", () => {
    // Uncentered alignment, computed the way the naive implementation would:
    // an importance-weighted mean of RAW affinities. Every career lands in a
    // narrow band just under 1.0, so `relevance + SWING * (2a - 1)` pins almost
    // every career at the +SWING ceiling and stops separating them.
    const skillMap = buildSectorWefSkillMap(skillRows(), affinityMap);
    const uncenteredAlignments: number[] = [];
    const centeredAlignments: number[] = [];

    for (const [, sectorSkills] of skillMap.bySector) {
      for (const affinities of affinityMap.values()) {
        const vector = new Map(affinities.map(a => [a.wefSkillId, a.affinityScore]));
        let rawNum = 0, cenNum = 0, den = 0;
        for (const { wefSkillId, importance } of sectorSkills) {
          const affinity = vector.get(wefSkillId);
          const mean = skillMap.catalogMeans.get(wefSkillId);
          if (affinity === undefined || mean === undefined) continue;
          const w = importance / 100;
          rawNum += w * affinity;
          cenNum += w * (affinity - mean);
          den += w;
        }
        if (den <= 0) continue;
        uncenteredAlignments.push(rawNum / den / 100);            // ~0.66..0.97, all clipped to 1
        centeredAlignments.push((cenNum / den + 12) / 24);         // the shipped mapping
      }
    }

    const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
    const sd = (v: number[]) => {
      const m = mean(v);
      return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
    };

    // THE TRAP. Raw overlap is not a weak signal, it is a near-constant one:
    // measured mean 0.823, sd 0.062, with 96% of all career x sector pairs
    // above 0.70. Fed through `relevance + SWING * (2a - 1)` that is a uniform
    // +9.7 relevance points for almost every career — a bias, not a resolution.
    // The component would look like it was working and rank nothing new.
    expect(mean(uncenteredAlignments)).toBeGreaterThan(0.75);
    expect(sd(uncenteredAlignments)).toBeLessThan(0.10);
    expect(uncenteredAlignments.filter(a => a >= 0.7).length / uncenteredAlignments.length)
      .toBeGreaterThan(0.9);

    // THE FIX. Centering puts the catalog average at the middle of the band, so
    // the modulation is symmetric — above-average profiles gain, below-average
    // ones lose — and it varies nearly 4x as much.
    expect(mean(centeredAlignments)).toBeGreaterThan(0.45);
    expect(mean(centeredAlignments)).toBeLessThan(0.55);
    expect(sd(centeredAlignments)).toBeGreaterThan(3 * sd(uncenteredAlignments));
    expect(spread(centeredAlignments)).toBeGreaterThan(spread(uncenteredAlignments));
  });

  it("keeps the catalog spread the category map already had", () => {
    const scores = scoreAll(makeContext()).map(r => r.score);
    // Category-only measured 54.6 on this catalog. The hybrid must not narrow it —
    // pure skill-based scoring did (33.1), which is why it was rejected.
    expect(spread(scores)).toBeGreaterThan(50);
    expect(new Set(scores.map(s => s.toFixed(1))).size).toBeGreaterThan(25);
  });

  it("keeps the floor meaningful: a career serving no priority sector still floors at 40", () => {
    // No UAE priority sector is about food service, so Chef has no category rule.
    // Under pure skill-based scoring Chef rose to 65.1 because mean-centred
    // overlap finds SOME sector every career is above average for.
    expect(scoreOf(makeContext(), "Chef").score).toBe(40);
  });

  it("preserves sector attribution — skills modulate, they never re-attribute wholesale", () => {
    const ctx = makeContext();
    // Pure skill-based put these in Space Exploration (r=0.99 with Renewable
    // Energy across the catalog makes the winner arbitrary). The category gate
    // is what keeps clinicians in the healthcare sector.
    for (const title of ["Doctor (General Practitioner)", "Physical Therapist", "Healthcare Professional (Nurse)"]) {
      expect(scoreOf(ctx, title).reasoning).toContain("Biotechnology");
      expect(scoreOf(ctx, title).reasoning).not.toContain("Space Exploration");
    }
    expect(scoreOf(ctx, "Teacher (Secondary Education)").reasoning).toContain("Education");
    expect(scoreOf(ctx, "Renewable Energy Engineer").reasoning).toContain("Renewable Energy");
  });

  it("ARABIC CONSTRAINT: the sector name appears verbatim as a bare trailing token", () => {
    // recommendations.routes.ts localises reasoning with a \b word-boundary regex
    // per countries.prioritySectors entry; a possessive or hyphenated form would
    // leak English into the Arabic report.
    for (const result of scoreAll(makeContext())) {
      if (result.score === 40) continue; // floor text names no sector
      const sector = UAE_SECTOR_WEF_SKILLS.map(s => s.name).find(n => result.reasoning.endsWith(`: ${n}`));
      expect(sector, `no bare trailing sector in: ${result.reasoning}`).toBeDefined();
    }
  });

  it("degrades to the category-only score when skill data is missing, never to the floor", () => {
    const ctx = makeContext();
    const noSkills = makeContext({ skills: false });
    for (const career of CAREERS) {
      const hybrid = calculateVisionScore(ctx, career, VISION_COMPONENT)!.score;
      const categoryOnly = calculateVisionScore(noSkills, career, VISION_COMPONENT)!.score;
      // 15 relevance points of swing, damped by rankFactor (<=1) and scaled by
      // VISION_RANGE/100 = 0.6 => at most 9 score points either way.
      expect(Math.abs(hybrid - categoryOnly)).toBeLessThanOrEqual(9.001);
      expect(hybrid).toBeGreaterThanOrEqual(40);
    }
  });

  it("every WEF skill is used by at least one sector, and no sector aliases a non-WEF skill", () => {
    // Financial Literacy, Cultural and Civic Literacy, Leadership and Persistence
    // and Grit used to be referenced by NO sector — discarding two of the four
    // most discriminating columns in the affinity matrix. And "Sustainability"
    // was aliased onto Scientific Literacy, colliding on the unique index and
    // silently costing Renewable Energy a skill.
    const catalogSkills = new Set(Object.keys(CAREER_WEF_SKILL_AFFINITIES[0].skills));
    expect(catalogSkills.size).toBe(16);

    const used = new Set(UAE_SECTOR_WEF_SKILLS.flatMap(s => Object.keys(s.skills)));
    expect([...catalogSkills].filter(s => !used.has(s))).toEqual([]);
    expect([...used].filter(s => !catalogSkills.has(s))).toEqual([]);

    for (const sector of UAE_SECTOR_WEF_SKILLS) {
      expect(Object.keys(sector.skills).length, `${sector.name} skill count`).toBeGreaterThanOrEqual(5);
    }
  });

  it("every career in the WEF affinity catalog has a full 16-skill vector", () => {
    expect(CAREER_WEF_SKILL_AFFINITIES).toHaveLength(37); // Web Developer backfilled
    for (const mapping of CAREER_WEF_SKILL_AFFINITIES) {
      expect(Object.keys(mapping.skills), mapping.careerTitle).toHaveLength(16);
    }
  });
});
