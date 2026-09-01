/**
 * Generated-country persistence — the three tables, not one.
 *
 * The defect this pins (docs/priority-alignment-plan.md section 7): the create-country
 * route called createOrUpdateCountryPrioritySector and stopped. The generated
 * skill vectors were computed and thrown away, and country_sector_categories
 * was never written at all — so calculateVisionScore returned VISION_FLOOR for
 * every career of every LLM-generated country.
 *
 * Storage is mocked so importing country.routes.ts does not pull in db.ts,
 * which throws at import when DATABASE_URL is unset (same pattern as
 * superadmin.reconciliation.test.ts). persistGeneratedSectors takes its store
 * as an argument, so the mock only has to exist, not behave.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

const { persistGeneratedSectors } = await import("./country.routes");
import { skillKey, type GeneratedSector } from "../services/llmCountryService";

const WEF_SKILL_IDS = new Map([
  ["ICT Literacy", "wef-ict"],
  ["Numeracy", "wef-num"],
  ["Financial Literacy", "wef-fin"],
].map(([name, id]) => [skillKey(name), id]));

function fakeStore() {
  const sectorRows: Array<{ countryId: string; name: string; displayOrder: number; description?: string }> = [];
  const skillRows: Array<{ sectorId: string; wefSkillId: string; importance: number }> = [];
  const categoryRows: Array<{ sectorId: string; careerCategory: string; relevance: number; notes?: string }> = [];
  let failSector: string | null = null;

  return {
    sectorRows,
    skillRows,
    categoryRows,
    failSectorNamed(name: string) { failSector = name; },
    async createOrUpdateCountryPrioritySector(countryId: string, name: string, displayOrder: number, description?: string) {
      if (name === failSector) throw new Error("unique violation");
      sectorRows.push({ countryId, name, displayOrder, description });
      return { id: `sector-${sectorRows.length}` };
    },
    async createOrUpdateCountrySectorWefSkill(sectorId: string, wefSkillId: string, importance: number) {
      skillRows.push({ sectorId, wefSkillId, importance });
      return {};
    },
    async createOrUpdateSectorCategoryRule(sectorId: string, careerCategory: string, relevance: number, notes?: string) {
      categoryRows.push({ sectorId, careerCategory, relevance, notes });
      return {};
    },
  };
}

const TECH: GeneratedSector = {
  sector: "Advanced Technology & AI",
  skills: [
    { skill: "ICT Literacy", importance: 95 },
    { skill: "Numeracy", importance: 80 },
  ],
  categoryRules: [
    { category: "Technology", relevance: 95, notes: "Core. [source: https://u.ae/tech]" },
    { category: "Engineering", relevance: 65, notes: "Secondary. [source: https://u.ae/tech]" },
  ],
  servingCareers: ["Software Engineer"],
  sources: ["https://u.ae/tech"],
};

const FINANCE: GeneratedSector = {
  sector: "Financial Services & FinTech",
  skills: [{ skill: "Financial Literacy", importance: 95 }],
  categoryRules: [{ category: "Finance", relevance: 95, notes: "Core. [source: https://difc.ae]" }],
  servingCareers: ["Financial Analyst"],
  sources: ["https://difc.ae"],
};

describe("persistGeneratedSectors", () => {
  it("writes the sector, its WEF skill vector AND its category rules", async () => {
    const store = fakeStore();
    const result = await persistGeneratedSectors(store, "testland", "Testland", [TECH], WEF_SKILL_IDS);

    expect(result).toMatchObject({ sectorsWritten: 1, skillRowsWritten: 2, categoryRowsWritten: 2, errors: [] });
    expect(store.skillRows).toEqual([
      { sectorId: "sector-1", wefSkillId: "wef-ict", importance: 95 },
      { sectorId: "sector-1", wefSkillId: "wef-num", importance: 80 },
    ]);
    expect(store.categoryRows).toEqual([
      { sectorId: "sector-1", careerCategory: "Technology", relevance: 95, notes: "Core. [source: https://u.ae/tech]" },
      { sectorId: "sector-1", careerCategory: "Engineering", relevance: 65, notes: "Secondary. [source: https://u.ae/tech]" },
    ]);
  });

  it("numbers displayOrder 1-based in accepted order — it drives rankFactor", async () => {
    const store = fakeStore();
    await persistGeneratedSectors(store, "testland", "Testland", [TECH, FINANCE], WEF_SKILL_IDS);
    expect(store.sectorRows.map(r => [r.name, r.displayOrder])).toEqual([
      ["Advanced Technology & AI", 1],
      ["Financial Services & FinTech", 2],
    ]);
  });

  it("carries provenance onto the sector row", async () => {
    const store = fakeStore();
    await persistGeneratedSectors(store, "testland", "Testland", [TECH], WEF_SKILL_IDS);
    expect(store.sectorRows[0].description).toBe("Priority sector for Testland. Sources: https://u.ae/tech");
  });

  it("reports a skill the database does not have instead of writing a dangling row", async () => {
    const store = fakeStore();
    const result = await persistGeneratedSectors(
      store,
      "testland",
      "Testland",
      [{ ...TECH, skills: [{ skill: "Curiosity", importance: 70 }, { skill: "ICT Literacy", importance: 95 }] }],
      WEF_SKILL_IDS,
    );
    expect(result.skillRowsWritten).toBe(1);
    expect(result.errors).toEqual(['Advanced Technology & AI: WEF skill "Curiosity" is not seeded in wef_skills']);
  });

  it("skips a failed sector whole — no orphan skill or category rows — and keeps going", async () => {
    const store = fakeStore();
    store.failSectorNamed("Advanced Technology & AI");
    const result = await persistGeneratedSectors(store, "testland", "Testland", [TECH, FINANCE], WEF_SKILL_IDS);

    expect(result.sectorsWritten).toBe(1);
    expect(store.skillRows.every(r => r.sectorId === "sector-1")).toBe(true);
    expect(store.categoryRows.map(r => r.careerCategory)).toEqual(["Finance"]);
    expect(result.errors[0]).toMatch(/sector row failed/);
    // Second sector still lands, and takes displayOrder 2 — the gap is
    // deliberate: rankFactor is computed from position in the ordered list, so
    // renumbering a survivor would silently promote it.
    expect(store.sectorRows[0].displayOrder).toBe(2);
  });
});
