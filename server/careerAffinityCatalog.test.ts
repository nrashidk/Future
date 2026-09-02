/**
 * Catalog-completeness guard for the two career affinity tables.
 *
 * `careers` is written from server/seed.ts. `career_wef_skill_affinities` is
 * written from CAREER_WEF_SKILL_AFFINITIES (16 rows per career) and the RIASEC
 * rows of `career_component_affinities` from RIASEC_CAREER_AFFINITIES (ONE row
 * per career, carrying all six themes in one jsonb — reading "6" here as a row
 * count is what hid the duplicate-row defect guarded at the bottom of this
 * file). All three are keyed by the career's English TITLE, matched by string
 * equality in the seed loops — so a career added to one file and not the others,
 * or a title edited in one place, fails silently at seed time with nothing worse
 * than a "⚠️ Career not found" line in a log nobody reads.
 *
 * That is the failure this file exists to make loud. It is a size-and-coverage
 * guard, not a content one: what the numbers should BE is argued in
 * server/wefSkillsData.ts, server/riasecAffinities.ts and
 * docs/phase3-stage2-done.md.
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";

import { careerComponentAffinities } from "@shared/schema";
import { CAREER_WEF_SKILL_AFFINITIES, WEF_16_SKILLS } from "./wefSkillsData";
import { RIASEC_CAREER_AFFINITIES, validateRiasecAffinities } from "./riasecAffinities";

/** 37 original + Phase 3 step 1 (2 Space) + Phase 3 stage 1 (29 derived). */
const CATALOG_SIZE = 68;

/** Career titles, straight out of the seed array's source text. */
function seededTitles(): string[] {
  const src = readFileSync(path.resolve(import.meta.dirname, "seed.ts"), "utf-8");
  const start = src.indexOf("const careers = [");
  const seg = src.slice(start, src.indexOf("\n  ];", start));
  return [...seg.matchAll(/^\s{6}title:\s*"([^"]+)",$/gm)].map(m => m[1]);
}

describe("career affinity catalogs vs the seed.ts careers array", () => {
  const titles = seededTitles();

  it("parses the seed array (sanity check on the regex above)", () => {
    expect(titles).toHaveLength(CATALOG_SIZE);
    expect(new Set(titles).size, "duplicate career title in seed.ts").toBe(CATALOG_SIZE);
  });

  it("WEF: one 16-skill vector per career, and 16 skills exist to hold them", () => {
    expect(WEF_16_SKILLS).toHaveLength(16);
    expect(CAREER_WEF_SKILL_AFFINITIES).toHaveLength(CATALOG_SIZE);

    const skillNames = new Set(WEF_16_SKILLS.map(s => s.name));
    for (const m of CAREER_WEF_SKILL_AFFINITIES) {
      const keys = Object.keys(m.skills);
      expect(keys, m.careerTitle).toHaveLength(16);
      // Every key must resolve to a real WEF skill: seed.ts looks these up by
      // name and skips (with a warning) on a miss, so a typo silently costs a row.
      expect(keys.filter(k => !skillNames.has(k)), m.careerTitle).toEqual([]);
      for (const [skill, score] of Object.entries(m.skills)) {
        expect(score, `${m.careerTitle} / ${skill}`).toBeGreaterThanOrEqual(0);
        expect(score, `${m.careerTitle} / ${skill}`).toBeLessThanOrEqual(100);
      }
    }

    // 68 x 16. This is the number seed.ts compares against getCareerWefSkillAffinityCount()
    // to decide whether the affinity block has already been seeded.
    const rows = CAREER_WEF_SKILL_AFFINITIES.reduce((t, m) => t + Object.keys(m.skills).length, 0);
    expect(rows).toBe(CATALOG_SIZE * 16);
    expect(rows).toBe(1088);
  });

  it("RIASEC: one 6-dimension vector per career", () => {
    expect(RIASEC_CAREER_AFFINITIES).toHaveLength(CATALOG_SIZE);
    expect(validateRiasecAffinities()).toBe(true);
    for (const m of RIASEC_CAREER_AFFINITIES) {
      expect(Object.keys(m.affinities).sort(), m.careerTitle).toEqual(["A", "C", "E", "I", "R", "S"]);
      expect(m.rationale.length, `${m.careerTitle} has no rationale`).toBeGreaterThan(40);
    }
    // 68 x 6.
    expect(RIASEC_CAREER_AFFINITIES.length * 6).toBe(408);
  });

  it("both catalogs cover exactly the seeded careers — no orphans, no gaps", () => {
    const seeded = new Set(titles);
    const wef = CAREER_WEF_SKILL_AFFINITIES.map(m => m.careerTitle);
    const riasec = RIASEC_CAREER_AFFINITIES.map(m => m.careerTitle);

    expect(new Set(wef).size, "duplicate careerTitle in wefSkillsData.ts").toBe(wef.length);
    expect(new Set(riasec).size, "duplicate careerTitle in riasecAffinities.ts").toBe(riasec.length);

    // Orphans: an affinity row whose title matches no career is dropped by the
    // seed loop with only a console warning.
    expect(wef.filter(t => !seeded.has(t)), "WEF rows with no career").toEqual([]);
    expect(riasec.filter(t => !seeded.has(t)), "RIASEC rows with no career").toEqual([]);

    // Gaps: a career with no WEF vector leaves calculateVisionScore with nothing
    // to modulate (Web Developer was exactly this before WEF Phase 1); a career
    // with no RIASEC vector makes calculateRiasecScore return null for it.
    const wefSet = new Set(wef), riasecSet = new Set(riasec);
    expect(titles.filter(t => !wefSet.has(t)), "careers with no WEF vector").toEqual([]);
    expect(titles.filter(t => !riasecSet.has(t)), "careers with no RIASEC vector").toEqual([]);
  });
});

/**
 * Schema guard for the duplication defect fixed in Phase 3 stage 3.
 *
 * career_component_affinities had ONLY a primary key on `id` until migration
 * 010. The RIASEC seed loop inserted unconditionally and caught SQLSTATE 23505
 * "if it already exists" — a violation that could never be raised, so every boot
 * appended one more identical row per career. Staging reached 358 rows for 68
 * careers before it was noticed, and nothing in the product ever showed it:
 * calculateRiasecScore uses .find(), so the first copy always won.
 *
 * Two things must stay true together, and this file pins both:
 *   - the Drizzle table declares the unique index, and
 *   - server/migrations/010_*.sql actually creates it in the database.
 * Either one alone silently re-opens the bug — and the index is also the
 * ON CONFLICT target for storage.createOrUpdateCareerComponentAffinity(), so
 * dropping it breaks the seed at runtime rather than just letting rows pile up.
 */
describe("career_component_affinities uniqueness (the duplicate-row defect)", () => {
  it("the Drizzle table declares a unique index on (career_id, component_id)", () => {
    const cfg = getTableConfig(careerComponentAffinities);
    const unique = cfg.indexes.filter(i => i.config.unique);
    const cols = unique.map(i => (i.config.columns as Array<{ name: string }>).map(c => c.name).join(","));
    expect(cols).toContain("career_id,component_id");
    // All six RIASEC themes live in one affinity_data jsonb, so there is no
    // finer key available — (career_id, component_id) IS the natural key.
    expect(cfg.columns.map(c => c.name)).toContain("affinity_data");
  });

  it("migration 010 both dedupes and creates that index", () => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname, "migrations/010_career_component_affinities_unique.sql"),
      "utf-8",
    );
    // Dedupe must come BEFORE the index, or CREATE UNIQUE INDEX fails on the
    // duplicates it is meant to prevent.
    const deleteAt = sql.indexOf("DELETE FROM career_component_affinities");
    const indexAt = sql.indexOf("CREATE UNIQUE INDEX");
    expect(deleteAt, "migration must delete duplicates").toBeGreaterThan(-1);
    expect(indexAt, "migration must create the unique index").toBeGreaterThan(-1);
    expect(deleteAt).toBeLessThan(indexAt);
    expect(sql).toContain("career_component_affinity_unique_idx");
    expect(sql).toMatch(/\(career_id,\s*component_id\)/);
  });
});
