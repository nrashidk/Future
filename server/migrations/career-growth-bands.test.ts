/**
 * Data guard for the O*NET growth-band table.
 *
 * The bands are the source of truth for what a student is told about a career's
 * future, and one of them ("decline") is the signal the future-readiness gate
 * will later read. This test pins the table's shape and, most importantly, the
 * decline set: silently gaining a fifth declining career is the failure mode
 * that matters.
 */

import { describe, it, expect, vi } from "vitest";
import { ONET_GROWTH_BANDS, ONET_BAND_BY_LABEL, isOnetGrowthBand } from "@shared/growthBands";

// The module imports ../db for its backfill function, and server/db.ts opens a
// Neon pool (and throws without DATABASE_URL) at import time. Only the DATA is
// under test here, so stub the db module out.
vi.mock("../db", () => ({ db: {}, pool: {} }));

const { CAREER_GROWTH_BANDS, EXPECTED_DECLINE_TITLES } = await import("./career-growth-bands");
const { CAREER_VALUES_PROFILES } = await import("./career-values-profiles");

describe("CAREER_GROWTH_BANDS", () => {
  it("covers all 68 careers", () => {
    expect(CAREER_GROWTH_BANDS).toHaveLength(68);
  });

  it("has no duplicate titles (the backfill matches on title)", () => {
    const titles = CAREER_GROWTH_BANDS.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("covers exactly the same career titles as the values-profile table", () => {
    // Both backfills are title-keyed against the same catalogue. If they ever
    // disagree, one of them is silently skipping careers.
    expect(CAREER_GROWTH_BANDS.map((c) => c.title).sort()).toEqual(
      CAREER_VALUES_PROFILES.map((c) => c.title).sort(),
    );
  });

  it("carries a valid band for every career", () => {
    for (const entry of CAREER_GROWTH_BANDS) {
      expect(isOnetGrowthBand(entry.band), `${entry.title}: ${entry.band}`).toBe(true);
    }
  });

  it("carries an onetCode for every career — the band's only justification", () => {
    for (const entry of CAREER_GROWTH_BANDS) {
      expect(entry.onetCode, entry.title).toMatch(/^\d{2}-\d{4}(\.\d{2})?$/);
    }
  });

  it("keeps bandVerbatim traceable to the O*NET label it was read from", () => {
    for (const entry of CAREER_GROWTH_BANDS) {
      if (entry.band === "not_applicable") {
        // The one reviewed exception: no O*NET band is being claimed.
        expect(entry.bandVerbatim, entry.title).toBeNull();
        continue;
      }
      expect(entry.bandVerbatim, entry.title).not.toBeNull();
      expect(ONET_BAND_BY_LABEL[entry.bandVerbatim!], `${entry.title}: "${entry.bandVerbatim}"`)
        .toBe(entry.band);
    }
  });

  it("has exactly one reviewed not_applicable exception (Entrepreneur)", () => {
    const na = CAREER_GROWTH_BANDS.filter((c) => c.band === "not_applicable");
    expect(na.map((c) => c.title)).toEqual(["Entrepreneur"]);
  });

  it("bands exactly the four reviewed careers as declining", () => {
    // THE assertion. A fifth declining career must be a reviewed decision, not
    // a diff nobody noticed — three of these four (Nuclear Engineer and both
    // teacher careers) are careers the UAE is actively investing in, and the
    // band is a US-headcount projection. See docs/future-readiness-recon.md §1b.
    const declining = CAREER_GROWTH_BANDS.filter((c) => c.band === "decline").map((c) => c.title);
    expect(declining.sort()).toEqual([...EXPECTED_DECLINE_TITLES].sort());
  });

  it("records the decline careers that the old string vocabulary censored", () => {
    // Nuclear Engineer and Primary School Teacher were stored as
    // "Moderate (0% growth)" because the localiser had no declining tier.
    const byTitle = new Map(CAREER_GROWTH_BANDS.map((c) => [c.title, c]));
    expect(byTitle.get("Nuclear Engineer")?.band).toBe("decline");
    expect(byTitle.get("Primary School Teacher")?.band).toBe("decline");
    expect(byTitle.get("Teacher (Secondary Education)")?.band).toBe("decline");
  });

  it("uses every band the catalogue can express", () => {
    const used = new Set(CAREER_GROWTH_BANDS.map((c) => c.band));
    for (const band of ONET_GROWTH_BANDS) {
      expect(used.has(band), `no career carries band "${band}"`).toBe(true);
    }
  });
});
