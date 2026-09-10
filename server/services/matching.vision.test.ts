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

  // -------------------------------------------------------------------------
  // WHY THE TEST ABOVE DID NOT CATCH THE SATURATION (fixed 2026-09-10,
  // SCORING_ALGORITHM_VERSION 4). It is a correct test and it passed throughout.
  // It runs on the Healthcare CATEGORY-RULE careers, every one of them seeded at
  // relevance 85, where a +/-15 swing has 15 points of room. It never touches a
  // per-career OVERRIDE career — and the override careers are seeded 88 to 100,
  // which is to say they have LESS headroom than the swing. Every career that
  // collapsed was an override career; the set above contains none of them.
  //
  // So the three cases below are not extra assurance on a covered path. They are
  // the uncovered half: the same claim on override careers, the saturation
  // property itself, and a catalogue-wide invariant.
  // -------------------------------------------------------------------------

  it("resolves careers that share a SECTOR through per-career overrides", () => {
    // The override analogue of the test above, on the exact cluster that
    // collapsed. All five reach Space & Advanced Sciences by an explicit
    // override, seeded 100 / 95 / 95 / 88 / 85 with a written justification per
    // row (server/seed.ts:224, :255, :256). Before version 4 all five scored
    // 99.0 — and a free report shows TWO matches, so a student could be handed
    // two of these with identical scores and identical reasoning.
    const ctx = makeContext();
    const SPACE_FIVE = [
      "Aerospace Engineer",
      "Space Scientist (Astrophysicist)",
      "Satellite & Remote Sensing Scientist",
      "Atmospheric & Space Scientist",
      "Physicist",
    ];

    for (const title of SPACE_FIVE) {
      expect(
        UAE_SECTOR_CAREER_OVERRIDES.filter(o => o.careerTitle === title),
        `${title} must reach its sector by override, not by a category rule`,
      ).toHaveLength(1);
      expect(scoreOf(ctx, title).reasoning.endsWith(": Space & Advanced Sciences")).toBe(true);
    }

    const scores = SPACE_FIVE.map(t => scoreOf(ctx, t).score);
    expect(
      new Set(scores.map(s => s.toFixed(4))).size,
      `five careers, ${new Set(scores.map(s => s.toFixed(4))).size} distinct scores: ${SPACE_FIVE.map(
        (t, i) => `${t} ${scores[i].toFixed(2)}`,
      ).join(", ")}`,
    ).toBe(5);

    // The seed's top pick must still lead. Fit may reorder careers inside the
    // sector — that is what the hybrid is for — but it must not unseat the
    // career the seed says IS the sector.
    expect(Math.max(...scores)).toBe(scoreOf(ctx, "Aerospace Engineer").score);
  });

  it("NEITHER SATURATION FIRES — no clipped alignment, no career pinned at the relevance ceiling", () => {
    // THE PROPERTY THAT ACTUALLY BROKE, asserted directly rather than through a
    // table of pinned scores. Pinned scores go stale as the catalogue grows;
    // this does not. A future career whose skill profile blows past the +/-16
    // band, or a future seed row high enough to re-saturate, makes this say so
    // out loud instead of silently collapsing onto its neighbours.
    //
    // Before version 4: 15 of 154 pairs clipped (9.7%) and 27 of 68 careers sat
    // at relevance exactly 100. Both must now be zero.
    const skillMap = buildSectorWefSkillMap(skillRows(), affinityMap);
    const catMap = buildSectorCategoryMap(categoryRows(), UAE);
    const ALIGN_BAND = 16;  // VISION_ALIGN_HI; module-private, mirrored here
    const SWING = 15;       // VISION_SKILL_SWING; ditto
    const membershipBase = (r: number) => SWING + (100 - 2 * SWING) * (r / 100);

    // THE MIRRORED CONSTANTS MUST BE THE SHIPPED ONES. Without this the loop
    // below computes the maths this test WANTS rather than the maths the module
    // does, and it would keep passing if someone put the ±12 band or the
    // un-rebased membership back — which is precisely the regression it exists
    // to prevent. VISION_ALIGN_HI and VISION_SKILL_SWING are module-private, so
    // they are recovered from the calculator's own output on a synthetic
    // single-sector map where rankFactor is 1 and score = 40 + 0.6 * relevance.
    const probe = (relevance: number, affinity: number | null) => {
      const mean = 50;
      return calculateVisionScore(
        {
          assessment: { assessmentType: "basic" },
          careers: [],
          activeComponents: [VISION_COMPONENT],
          userCountry: UAE,
          sectorCategoryMap: {
            sectors: new Map([["probe-sector", { name: "Probe", rankFactor: 1 }]]),
            byCategory: new Map([["probe", [{ sectorId: "probe-sector", relevance }]]]),
            byCareer: new Map(),
          },
          sectorWefSkillMap: affinity === null ? undefined : {
            bySector: new Map([["probe-sector", [{ wefSkillId: "probe-skill", importance: 100 }]]]),
            catalogMeans: new Map([["probe-skill", mean]]),
          },
          careerWefAffinities: affinity === null ? undefined
            : new Map([["probe", [{ wefSkillId: "probe-skill", affinityScore: mean + affinity }]]]),
        } as unknown as MatchingContext,
        { id: "probe", title: "probe", category: "Probe" } as unknown as Career,
        VISION_COMPONENT,
      )!.score;
    };
    /** Invert score = 40 + 0.6 * relevance. */
    const relevanceOf = (score: number) => (score - 40) / 0.6;

    // Membership is rebased: with no skill data the calculator must return
    // membershipBase(relevance), not the raw seeded relevance.
    for (const seeded of [40, 85, 95, 100]) {
      expect(
        relevanceOf(probe(seeded, null)),
        `membershipBase(${seeded}) drifted — the mirrored constants below are stale`,
      ).toBeCloseTo(membershipBase(seeded), 6);
    }
    // A raw overlap exactly at the band edge yields alignment 1, i.e. the full
    // +SWING. One just inside it must yield strictly less. Together these pin
    // both the band width and the swing.
    expect(relevanceOf(probe(85, ALIGN_BAND))).toBeCloseTo(membershipBase(85) + SWING, 6);
    expect(relevanceOf(probe(85, ALIGN_BAND - 0.5))).toBeLessThan(membershipBase(85) + SWING);

    const clipped: string[] = [];
    const ceilinged: string[] = [];

    for (const career of CAREERS) {
      const candidates =
        catMap.byCareer.get(career.id) ?? catMap.byCategory.get(career.category.trim().toLowerCase());
      if (!candidates) continue;

      for (const candidate of candidates) {
        const sectorSkills = skillMap.bySector.get(candidate.sectorId);
        const affinities = affinityMap.get(career.id);
        if (!sectorSkills?.length || !affinities?.length) continue;

        const vector = new Map(affinities.map(a => [a.wefSkillId, a.affinityScore]));
        let num = 0;
        let den = 0;
        for (const { wefSkillId, importance } of sectorSkills) {
          const affinity = vector.get(wefSkillId);
          const mean = skillMap.catalogMeans.get(wefSkillId);
          if (affinity === undefined || mean === undefined) continue;
          num += (importance / 100) * (affinity - mean);
          den += importance / 100;
        }
        if (den <= 0) continue;

        const raw = num / den;
        if (Math.abs(raw) >= ALIGN_BAND) {
          clipped.push(`${career.title} x ${candidate.sectorId}: raw ${raw.toFixed(2)}`);
        }

        const alignment = Math.max(0, Math.min(1, (raw + ALIGN_BAND) / (2 * ALIGN_BAND)));
        const relevance = membershipBase(candidate.relevance) + SWING * (2 * alignment - 1);
        if (relevance >= 100 - 1e-9 || relevance <= 1e-9) {
          ceilinged.push(`${career.title} x ${candidate.sectorId}: relevance ${relevance.toFixed(3)}`);
        }
      }
    }

    expect(clipped, `alignment clipped for:\n  ${clipped.join("\n  ")}`).toEqual([]);
    expect(ceilinged, `relevance saturated for:\n  ${ceilinged.join("\n  ")}`).toEqual([]);
  });

  it("no two careers credited to the SAME sector share a vision score", () => {
    // The catalogue-wide no-collapse invariant. Careers in different sectors may
    // legitimately land on the same number; two careers the report attributes to
    // the SAME sector, scored on the same seeded scale and the same skill vector,
    // sharing a score means the model failed to say anything about them.
    //
    // ONE DOCUMENTED EXCEPTION, and it is named rather than excluded because it
    // is a DATA gap, not a scorer defect. Accountant and Actuary carry identical
    // values on every skill the Financial Services vector asks about:
    //
    //     Financial Literacy  imp 95   Accountant 100  Actuary 100
    //     Numeracy            imp 90   Accountant 100  Actuary 100
    //     ICT Literacy        imp 75   Accountant  85  Actuary  85
    //     Leadership          imp 60   Accountant  65  Actuary  65
    //     Literacy            imp 55   Accountant  80  Actuary  80
    //
    // They differ on 8 of the other 11 — including Critical Thinking 90 vs 100
    // and Curiosity 70 vs 80, which is most of what separates an actuary from an
    // accountant. The sector vector simply does not ask. The fix is to give
    // Financial Services a discriminating skill (a seed change, with its own
    // justification and its own commit); until then this pair is expected to tie
    // and this test records why. If it stops tying, delete the exception.
    const KNOWN_DATA_GAP = ["Accountant", "Actuary"];

    const ctx = makeContext();
    const bySector = new Map<string, Array<{ title: string; score: string }>>();
    for (const career of CAREERS) {
      const result = scoreOf(ctx, career.title);
      if (result.score === 40) continue; // floor: no sector attributed
      const sector = UAE_SECTOR_WEF_SKILLS.map(s => s.name).find(n =>
        result.reasoning.endsWith(`: ${n}`),
      );
      if (!sector) continue;
      const list = bySector.get(sector) ?? [];
      list.push({ title: career.title, score: result.score.toFixed(4) });
      bySector.set(sector, list);
    }

    const collisions: string[] = [];
    for (const [sector, careers] of bySector) {
      const byScore = new Map<string, string[]>();
      for (const { title, score } of careers) {
        byScore.set(score, [...(byScore.get(score) ?? []), title]);
      }
      for (const [score, titles] of byScore) {
        if (titles.length < 2) continue;
        if (titles.length === KNOWN_DATA_GAP.length && KNOWN_DATA_GAP.every(t => titles.includes(t))) {
          continue; // the documented Financial Services skill-vector gap above
        }
        collisions.push(`${sector} @ ${score}: ${titles.join(" | ")}`);
      }
    }

    expect(collisions, `careers sharing a score inside one sector:\n  ${collisions.join("\n  ")}`)
      .toEqual([]);
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
    // floor and it now has a sector (Tourism), so the bottom of the
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
    // Tourism and re-homed it, so NO career in the catalog floors
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
    expect(scoreOf(makeContext(), "Chef").reasoning).toContain("Tourism");
  });

  it("preserves sector attribution — skills modulate, they never re-attribute wholesale", () => {
    const ctx = makeContext();
    // Pure skill-based put these in the space sector (r=0.99 with the
    // renewables sector across the catalog makes the winner arbitrary). The
    // category gate is what keeps clinicians in the healthcare sector.
    // Sector names are the post-Phase-2 ones (Biotechnology -> Healthcare &
    // Life Sciences -> Healthcare, Space Exploration -> Space & Advanced Sciences, etc.).
    for (const title of ["Doctor (General Practitioner)", "Physical Therapist", "Healthcare Professional (Nurse)"]) {
      expect(scoreOf(ctx, title).reasoning).toContain("Healthcare");
      expect(scoreOf(ctx, title).reasoning).not.toContain("Space & Advanced Sciences");
    }
    expect(scoreOf(ctx, "Teacher (Secondary Education)").reasoning).toContain("Education & Human Capital");
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
      // "The category-only score" means membershipBase(seeded relevance) since
      // SCORING_ALGORITHM_VERSION 4 — the REBASED midpoint, not the raw seeded
      // value. Both halves have to live on the same scale: if the null-alignment
      // path returned the raw relevance, a career with NO skill data would
      // outscore an identically-seeded career whose skills merely match the
      // catalogue average. See membershipBase in matching.ts.
      //
      // The bound is structural, not observed: 15 relevance points of swing,
      // damped by rankFactor (<=1) and scaled by VISION_RANGE/100 = 0.6 => at
      // most 9 score points either way. Measured max today is 8.365.
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
      .toEqual(["Tourism", "Food Security"]);
  });

  it("PHASE 3 STAGE 2: every one of the 29 new careers headlines its intended sector", () => {
    // The whole point of the stage. Attribution is what the student is told;
    // the skill modulation only moves the score within it.
    const INTENDED: Record<string, string> = {
      "Cybersecurity Analyst": "Digital Economy",
      "AI Research Scientist": "Artificial Intelligence",
      "Robotics Engineer": "Artificial Intelligence",
      "Nuclear Engineer": "Renewable Energy",
      "Chemical Engineer": "Renewable Energy",
      "Risk & Compliance Officer": "Financial Services",
      "Geneticist": "Healthcare",
      "Health Informatics Specialist": "Healthcare",
      "Hospitality Manager": "Tourism",
      "Tourism & Events Manager": "Tourism",
      "Airline Pilot": "Tourism",
      "Agricultural Scientist (Agronomist)": "Food Security",
      "Food Technologist": "Food Security",
      "Agricultural Engineer": "Food Security",
      "Satellite & Remote Sensing Scientist": "Space & Advanced Sciences",
      "Film & TV Producer": "Cultural & Creative Industries",
      "Data Engineer": "Artificial Intelligence",
      "Atmospheric & Space Scientist": "Space & Advanced Sciences",
      "Physicist": "Space & Advanced Sciences",
      "Environmental Engineer": "Renewable Energy",
      "Actuary": "Financial Services",
      "Investment & Financial Manager": "Financial Services",
      "Primary School Teacher": "Education & Human Capital",
      "School Counsellor & Career Advisor": "Education & Human Capital",
      "Curriculum & Instructional Designer": "Education & Human Capital",
      "Cloud & Network Architect": "Digital Economy",
      "Industrial Engineer": "Digital Economy",
      "Video Editor": "Cultural & Creative Industries",
      "Dietitian & Nutritionist": "Food Security",
    };
    expect(Object.keys(INTENDED)).toHaveLength(29);
    const ctx = makeContext();
    for (const [title, sector] of Object.entries(INTENDED)) {
      const result = scoreOf(ctx, title);
      expect(result.reasoning.endsWith(`: ${sector}`), `${title}: ${result.reasoning}`).toBe(true);
      expect(result.score, `${title} floored`).toBeGreaterThan(75);
    }
  });

  it("PHASE 4: the six business careers headline their new sectors, not the catch-all", () => {
    // docs/uae-official-sectors.md §4: no official UAE source treats business or
    // entrepreneurship as a SECTOR, so these six are distributed across existing
    // sectors rather than given an 11th. Before Phase 4 all six headlined the
    // catch-all (Business & Management @65 / Business & Marketing @60, then
    // named Technology). Attribution is what the student is told, so it is what
    // is pinned here.
    const INTENDED: Record<string, string> = {
      "Human Resources Manager": "Education & Human Capital",
      "Digital Marketing Specialist": "Digital Economy",
      "Entrepreneur": "Digital Economy",
      "Management Consultant": "Financial Services",
      "Sales Manager": "Financial Services",
      "Marketing Manager": "Cultural & Creative Industries",
    };
    const byCareerOverrideCount = (title: string) =>
      UAE_SECTOR_CAREER_OVERRIDES.filter(o => o.careerTitle === title).length;
    const ctx = makeContext();
    for (const [title, sector] of Object.entries(INTENDED)) {
      const result = scoreOf(ctx, title);
      expect(result.reasoning.endsWith(`: ${sector}`), `${title}: ${result.reasoning}`).toBe(true);
      // Exactly one override row each: override-EXCLUSIVE means a second row
      // would re-open the choice these are here to close.
      expect(byCareerOverrideCount(title), title).toBe(1);
      expect(result.score, `${title} floored`).toBeGreaterThan(40);
    }
    // Four of the six move OFF the catch-all entirely; the two that stay on
    // Digital Economy do so by an override that names it, not by the
    // Business & * category rules. Assert the source, not just the answer.
    for (const title of Object.keys(INTENDED)) {
      expect(byCareerOverrideCount(title), `${title} not override-sourced`).toBe(1);
    }
  });

  it("PHASE 4: Business & Management / Business & Marketing rules are unreachable but kept", () => {
    // Every career in both categories now carries an override, so neither rule
    // can fire. They are deliberately NOT deleted - they are the fallback for
    // the next career added to either category, which would otherwise floor at
    // 40. This test documents the state so a future reader does not "clean up"
    // rules that look dead, and fails if a business career loses its override.
    const overridden = new Set(UAE_SECTOR_CAREER_OVERRIDES.map(o => o.careerTitle));
    const businessCareers = Object.entries(CAREER_CATEGORY)
      .filter(([, c]) => c === "Business & Management" || c === "Business & Marketing")
      .map(([t]) => t);
    expect(businessCareers.length).toBeGreaterThan(0);
    expect(businessCareers.filter(t => !overridden.has(t))).toEqual([]);
    // The rules themselves still exist.
    for (const category of ["Business & Management", "Business & Marketing"]) {
      expect(UAE_SECTOR_CATEGORY_RULES.filter(r => r.category === category).length, category)
        .toBeGreaterThan(0);
    }
  });

  it("PHASE 3 STAGE 3: no two sector vectors are collinear across the catalog", () => {
    // THE GUARD THIS STAGE EXISTS FOR. Two sectors whose alignment columns
    // correlate near 1.0 are not two signals — whichever wins a career is then
    // decided by the seeded relevance alone, and the skill modulation is
    // measuring the same thing twice. Phase 3 stage 1 pushed Space & Future
    // Sciences <-> Healthcare to r=0.903 by adding six
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
    // It sat 0.4 score points from Space & Advanced Sciences at 39 careers and
    // 0.2 points the other way at 68 — a coin flip inside the ±9-point skill
    // modulation band. An override makes Renewable Energy the only candidate.
    const result = scoreOf(makeContext(), "Electrical Engineer");
    expect(result.reasoning.endsWith(": Renewable Energy")).toBe(true);
    expect(UAE_SECTOR_CAREER_OVERRIDES.filter(o => o.careerTitle === "Electrical Engineer"))
      .toHaveLength(1);
    // Relevance is byte-identical to the Engineering category rule it replaces,
    // so pinning it must not have changed the score.
    // 87.55 -> 81.93 at SCORING_ALGORITHM_VERSION 4: membership is now rebased
    // into [15, 85] before the skill swing (see membershipBase in matching.ts).
    // The point of this assertion is unchanged — that the override did not move
    // the score relative to the category rule it replaced.
    expect(result.score).toBeCloseTo(81.93, 1);
  });

  it("the two re-homed careers moved off their old attribution", () => {
    const ctx = makeContext();
    // Was the catch-all @45 (named Technology then, Digital Economy now) -
    // the catalog's weakest attribution.
    expect(scoreOf(ctx, "Lawyer").reasoning.endsWith(": Financial Services")).toBe(true);
    expect(scoreOf(ctx, "Lawyer").score).toBeGreaterThan(75);
    // Was the 40 floor, with no sector at all.
    expect(scoreOf(ctx, "Chef").reasoning.endsWith(": Tourism")).toBe(true);
    expect(scoreOf(ctx, "Chef").score).toBeGreaterThan(75);
  });
});
