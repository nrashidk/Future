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
  // Phase 3 step 1
  "Aerospace Engineer": "Engineering", "Space Scientist (Astrophysicist)": "Science",
  // Phase 3 stage 2 — the 29 derived careers
  "Cybersecurity Analyst": "Technology", "AI Research Scientist": "Technology",
  "Data Engineer": "Technology", "Cloud & Network Architect": "Technology",
  "Robotics Engineer": "Engineering", "Nuclear Engineer": "Engineering",
  "Chemical Engineer": "Engineering", "Agricultural Engineer": "Engineering",
  "Environmental Engineer": "Engineering", "Industrial Engineer": "Engineering",
  "Risk & Compliance Officer": "Finance", "Actuary": "Finance",
  "Investment & Financial Manager": "Finance",
  "Geneticist": "Science", "Agricultural Scientist (Agronomist)": "Science",
  "Food Technologist": "Science", "Satellite & Remote Sensing Scientist": "Science",
  "Atmospheric & Space Scientist": "Science", "Physicist": "Science",
  "Health Informatics Specialist": "Healthcare", "Dietitian & Nutritionist": "Healthcare",
  "Hospitality Manager": "Business & Management", "Tourism & Events Manager": "Business & Management",
  "Airline Pilot": "Aviation & Transport",
  "Film & TV Producer": "Media & Communications", "Video Editor": "Media & Communications",
  "Primary School Teacher": "Education", "School Counsellor & Career Advisor": "Education",
  "Curriculum & Instructional Designer": "Education",
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

    // Six clinicians + Health Informatics Specialist and Dietitian & Nutritionist
    // (Phase 3 stage 2). Dietitian carries an override, so it is excluded here:
    // override-exclusive semantics take it out of the category gate entirely.
    const healthcare = CAREERS.filter(
      c => c.category === "Healthcare" && c.title !== "Dietitian & Nutritionist",
    );
    expect(healthcare).toHaveLength(7);

    const withSkills = healthcare.map(c => scoreOf(ctx, c.title).score);
    const withoutSkills = healthcare.map(
      c => calculateVisionScore(makeContext({ skills: false }), c, VISION_COMPONENT)!.score,
    );

    // Category alone: career.category is the only input, so all seven are identical.
    expect(new Set(withoutSkills.map(s => s.toFixed(4))).size).toBe(1);
    // Hybrid: seven distinct scores.
    expect(new Set(withSkills.map(s => s.toFixed(4))).size).toBe(7);
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
    const categoryOnly = scoreAll(makeContext({ skills: false })).map(r => r.score);
    // The hybrid must not materially NARROW the spread the category map already
    // produced, and must strictly ADD resolution to it — pure skill-based scoring
    // did the opposite (54.6 -> 33.1 on the 37-career catalog), which is why it
    // was rejected. Stated as a comparison, not a fixed number: the absolute
    // spread is a property of the catalog, and it fell from ~60 to ~26 at Phase 3
    // stage 2 for a good reason - Chef was the only career sitting on the 40
    // floor and it now has a sector (Tourism & Hospitality), so the bottom of the
    // range moved up 40 points. Measured here: 27.2 category-only -> 26.2 hybrid.
    expect(spread(scores)).toBeGreaterThan(0.9 * spread(categoryOnly));
    // The resolution gain is the actual point of the hybrid. Measured on the
    // 68-career catalog: 30 distinct scores category-only, 45 hybrid. The gain
    // looks modest only because 18 careers now carry per-career overrides, which
    // are already one score each; among the 50 category-gated careers it is the
    // whole difference (see the first test in this file).
    expect(new Set(scores.map(s => s.toFixed(1))).size)
      .toBeGreaterThan(new Set(categoryOnly.map(s => s.toFixed(1))).size);
    expect(new Set(scores.map(s => s.toFixed(1))).size).toBeGreaterThan(25);
  });

  it("keeps the floor meaningful: a career serving no priority sector still floors at 40", () => {
    // Chef used to be this test's subject: no UAE priority sector was about food
    // service, so it had no category rule and floored. Phase 3 stage 2 added
    // Tourism & Hospitality and re-homed it, so NO career in the catalog floors
    // any more. The floor behaviour itself is unchanged and still matters - an
    // unmapped category must not be rescued by skill overlap, because under pure
    // skill-based scoring Chef rose to 65.1: mean-centred overlap finds SOME
    // sector every career is above average for.
    // A fresh id, not CAREER_ID("Chef"): Chef now carries an override row, and
    // byCareer is looked up by id, so reusing it would find that override.
    const unmapped = { id: CAREER_ID("Unmapped Probe"), title: "Unmapped Probe", category: "Nothing Maps Here" } as unknown as Career;
    expect(calculateVisionScore(makeContext(), unmapped, VISION_COMPONENT)!.score).toBe(40);
    // ...and the whole real catalog is now off the floor.
    expect(scoreAll(makeContext()).filter(r => r.score === 40)).toHaveLength(0);
    expect(scoreOf(makeContext(), "Chef").reasoning).toContain("Tourism & Hospitality");
  });

  it("preserves sector attribution — skills modulate, they never re-attribute wholesale", () => {
    const ctx = makeContext();
    // Pure skill-based put these in the space sector (r=0.99 with the
    // renewables sector across the catalog makes the winner arbitrary). The
    // category gate is what keeps clinicians in the healthcare sector.
    // Sector names are the post-Phase-2 ones (Biotechnology -> Healthcare &
    // Life Sciences, Space Exploration -> Space & Future Sciences, etc.).
    for (const title of ["Doctor (General Practitioner)", "Physical Therapist", "Healthcare Professional (Nurse)"]) {
      expect(scoreOf(ctx, title).reasoning).toContain("Healthcare & Life Sciences");
      expect(scoreOf(ctx, title).reasoning).not.toContain("Space & Future Sciences");
    }
    expect(scoreOf(ctx, "Teacher (Secondary Education)").reasoning).toContain("Education & Human Capital");
    expect(scoreOf(ctx, "Renewable Energy Engineer").reasoning).toContain("Renewable Energy & Sustainability");
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
    // 37 + Phase 3 step 1 (Aerospace Engineer, Space Scientist) + Phase 3 stage 2
    // (the 29 derived careers) = 68 careers x 16 skills = 1088 affinity rows.
    expect(CAREER_WEF_SKILL_AFFINITIES).toHaveLength(68);
    for (const mapping of CAREER_WEF_SKILL_AFFINITIES) {
      expect(Object.keys(mapping.skills), mapping.careerTitle).toHaveLength(16);
    }
    const titles = CAREER_WEF_SKILL_AFFINITIES.map(m => m.careerTitle);
    expect(new Set(titles).size, "duplicate careerTitle").toBe(titles.length);
    // The fixture map above must not drift from the affinity catalog, or a career
    // silently drops out of every assertion in this file.
    expect(titles.filter(t => !(t in CAREER_CATEGORY))).toEqual([]);
  });

  it("all 10 priority sectors are seeded, in order, with a vector each", () => {
    expect(UAE_SECTOR_WEF_SKILLS).toHaveLength(10);
    expect(UAE_SECTOR_WEF_SKILLS.map(s => s.displayOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(UAE_SECTOR_WEF_SKILLS.map(s => s.name).slice(-2))
      .toEqual(["Tourism & Hospitality", "Food Security & Agriculture"]);
  });

  it("PHASE 3 STAGE 2: every one of the 29 new careers headlines its intended sector", () => {
    // The whole point of the stage. Attribution is what the student is told;
    // the skill modulation only moves the score within it.
    const INTENDED: Record<string, string> = {
      "Cybersecurity Analyst": "Technology",
      "AI Research Scientist": "Artificial Intelligence",
      "Robotics Engineer": "Artificial Intelligence",
      "Nuclear Engineer": "Renewable Energy & Sustainability",
      "Chemical Engineer": "Renewable Energy & Sustainability",
      "Risk & Compliance Officer": "Financial Services & FinTech",
      "Geneticist": "Healthcare & Life Sciences",
      "Health Informatics Specialist": "Healthcare & Life Sciences",
      "Hospitality Manager": "Tourism & Hospitality",
      "Tourism & Events Manager": "Tourism & Hospitality",
      "Airline Pilot": "Tourism & Hospitality",
      "Agricultural Scientist (Agronomist)": "Food Security & Agriculture",
      "Food Technologist": "Food Security & Agriculture",
      "Agricultural Engineer": "Food Security & Agriculture",
      "Satellite & Remote Sensing Scientist": "Space & Future Sciences",
      "Film & TV Producer": "Creative Industries & Media",
      "Data Engineer": "Artificial Intelligence",
      "Atmospheric & Space Scientist": "Space & Future Sciences",
      "Physicist": "Space & Future Sciences",
      "Environmental Engineer": "Renewable Energy & Sustainability",
      "Actuary": "Financial Services & FinTech",
      "Investment & Financial Manager": "Financial Services & FinTech",
      "Primary School Teacher": "Education & Human Capital",
      "School Counsellor & Career Advisor": "Education & Human Capital",
      "Curriculum & Instructional Designer": "Education & Human Capital",
      "Cloud & Network Architect": "Technology",
      "Industrial Engineer": "Technology",
      "Video Editor": "Creative Industries & Media",
      "Dietitian & Nutritionist": "Food Security & Agriculture",
    };
    expect(Object.keys(INTENDED)).toHaveLength(29);
    const ctx = makeContext();
    for (const [title, sector] of Object.entries(INTENDED)) {
      const result = scoreOf(ctx, title);
      expect(result.reasoning.endsWith(`: ${sector}`), `${title}: ${result.reasoning}`).toBe(true);
      expect(result.score, `${title} floored`).toBeGreaterThan(75);
    }
  });

  it("PHASE 3 STAGE 3: no two sector vectors are collinear across the catalog", () => {
    // THE GUARD THIS STAGE EXISTS FOR. Two sectors whose alignment columns
    // correlate near 1.0 are not two signals — whichever wins a career is then
    // decided by the seeded relevance alone, and the skill modulation is
    // measuring the same thing twice. Phase 3 stage 1 pushed Space & Future
    // Sciences <-> Healthcare & Life Sciences to r=0.903 by adding six
    // Science-category careers to a catalog whose two science vectors both led
    // on Scientific Literacy. Nothing in the product surfaced that; only this
    // kind of measurement does, which is why it is pinned here.
    //
    // Computed exactly as skillAlignment does it (server/services/matching.ts):
    // importance-weighted mean of MEAN-CENTRED affinities, per sector, across
    // every career — then Pearson between each pair of sector columns.
    const skillMap = buildSectorWefSkillMap(skillRows(), affinityMap);
    const columns = UAE_SECTOR_WEF_SKILLS.map(sector => {
      const sectorSkills = skillMap.bySector.get(SECTOR_ID(sector.name))!;
      return CAREERS.map(career => {
        const vector = new Map((affinityMap.get(career.id) ?? []).map(a => [a.wefSkillId, a.affinityScore]));
        let num = 0, den = 0;
        for (const { wefSkillId, importance } of sectorSkills) {
          const affinity = vector.get(wefSkillId);
          const mean = skillMap.catalogMeans.get(wefSkillId);
          if (affinity === undefined || mean === undefined) continue;
          num += (importance / 100) * (affinity - mean);
          den += importance / 100;
        }
        return num / den;
      });
    });
    const pearson = (a: number[], b: number[]) => {
      const ma = a.reduce((x, y) => x + y, 0) / a.length;
      const mb = b.reduce((x, y) => x + y, 0) / b.length;
      let n = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
      return n / Math.sqrt(da * db);
    };

    const pairs: Array<{ pair: string; r: number }> = [];
    for (let i = 0; i < columns.length; i++) {
      for (let j = i + 1; j < columns.length; j++) {
        pairs.push({
          pair: `${UAE_SECTOR_WEF_SKILLS[i].name} <-> ${UAE_SECTOR_WEF_SKILLS[j].name}`,
          r: pearson(columns[i], columns[j]),
        });
      }
    }
    expect(pairs).toHaveLength(45); // 10 sectors choose 2

    const worst = pairs.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
    // Measured 0.763 at the time of writing (Renewable Energy <-> Food Security),
    // down from 0.903 before the stage 3 retune. 0.85 is the ceiling the retune
    // was commissioned against; the headroom is deliberate, so this fails on a
    // real regression rather than on rounding.
    expect(Math.abs(worst.r), `worst pair: ${worst.pair} r=${worst.r.toFixed(3)}`).toBeLessThan(0.85);

    // And no single pair may creep up on its own while the max looks fine.
    const over = pairs.filter(p => Math.abs(p.r) >= 0.85).map(p => `${p.pair} r=${p.r.toFixed(3)}`);
    expect(over).toEqual([]);
  });

  it("PHASE 3 STAGE 3: Electrical Engineer is pinned, not decided by rounding", () => {
    // It sat 0.4 score points from Space & Future Sciences at 39 careers and
    // 0.2 points the other way at 68 — a coin flip inside the ±9-point skill
    // modulation band. An override makes Renewable Energy the only candidate.
    const result = scoreOf(makeContext(), "Electrical Engineer");
    expect(result.reasoning.endsWith(": Renewable Energy & Sustainability")).toBe(true);
    expect(UAE_SECTOR_CAREER_OVERRIDES.filter(o => o.careerTitle === "Electrical Engineer"))
      .toHaveLength(1);
    // Relevance is byte-identical to the Engineering category rule it replaces,
    // so pinning it must not have changed the score.
    expect(result.score).toBeCloseTo(87.55, 1);
  });

  it("the two re-homed careers moved off their old attribution", () => {
    const ctx = makeContext();
    // Was Technology @45 - the catalog's weakest attribution.
    expect(scoreOf(ctx, "Lawyer").reasoning.endsWith(": Financial Services & FinTech")).toBe(true);
    expect(scoreOf(ctx, "Lawyer").score).toBeGreaterThan(75);
    // Was the 40 floor, with no sector at all.
    expect(scoreOf(ctx, "Chef").reasoning.endsWith(": Tourism & Hospitality")).toBe(true);
    expect(scoreOf(ctx, "Chef").score).toBeGreaterThan(75);
  });
});
