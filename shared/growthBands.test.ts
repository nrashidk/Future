/**
 * Regression guard for the bug this module was created to fix.
 *
 * The old growth display parsed a hand-authored string with a regex that
 * matched only an UNSIGNED percentage, and returned the raw English string on
 * anything it could not parse. A career whose outlook was "Declining (-6%
 * growth)" therefore rendered in English inside the Arabic report, and there was
 * no Arabic key for decline at all.
 *
 * The assertion that matters here is the last one: every band must have a
 * string in BOTH locales. A band with no Arabic string can no longer ship.
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  ONET_GROWTH_BANDS,
  ONET_BAND_BY_LABEL,
  GROWTH_BAND_I18N,
  growthOutlookFor,
  isOnetGrowthBand,
  type OnetGrowthBand,
} from "./growthBands";

function locale(lang: "en" | "ar"): Record<string, string> {
  return JSON.parse(
    readFileSync(
      path.resolve(import.meta.dirname, `../client/public/locales/${lang}/results.json`),
      "utf-8",
    ),
  );
}

describe("ONET_GROWTH_BANDS", () => {
  it("is the six-value domain the careers column stores", () => {
    expect([...ONET_GROWTH_BANDS]).toEqual([
      "much_faster",
      "faster",
      "average",
      "slower",
      "decline",
      "not_applicable",
    ]);
  });

  it("isOnetGrowthBand accepts every member and rejects the dead vocabularies", () => {
    for (const band of ONET_GROWTH_BANDS) expect(isOnetGrowthBand(band)).toBe(true);
    // The four vocabularies that used to be written into growth_outlook.
    for (const dead of ["high", "medium", "low", "declining", "Excellent", "Steady", "", null, undefined]) {
      expect(isOnetGrowthBand(dead)).toBe(false);
    }
  });
});

describe("ONET_BAND_BY_LABEL", () => {
  it("maps every verbatim O*NET label to a valid band", () => {
    for (const [label, band] of Object.entries(ONET_BAND_BY_LABEL)) {
      expect(isOnetGrowthBand(band), `${label} -> ${band}`).toBe(true);
    }
  });

  it("covers the five bands O*NET actually publishes (not_applicable is ours, not theirs)", () => {
    expect(new Set(Object.values(ONET_BAND_BY_LABEL))).toEqual(
      new Set<OnetGrowthBand>(["much_faster", "faster", "average", "slower", "decline"]),
    );
  });
});

describe("growthOutlookFor", () => {
  it("returns a non-empty derived string for every band", () => {
    for (const band of ONET_GROWTH_BANDS) {
      expect(growthOutlookFor(band).length, band).toBeGreaterThan(0);
    }
  });

  it("never emits a fabricated percentage — the bug being fixed", () => {
    // The old strings carried unsourced numbers like "(36% growth)". A band can
    // only ever express the O*NET range, so no exact percentage may appear.
    for (const band of ONET_GROWTH_BANDS) {
      expect(growthOutlookFor(band)).not.toMatch(/\(\d+% growth\)/);
    }
  });

  it("says 'Declining' for the decline band", () => {
    expect(growthOutlookFor("decline")).toMatch(/Declining/);
  });
});

describe("GROWTH_BAND_I18N", () => {
  it("has a key for every band", () => {
    for (const band of ONET_GROWTH_BANDS) {
      expect(GROWTH_BAND_I18N[band], band).toBeTruthy();
    }
  });

  it("resolves in BOTH en and ar — a band with no Arabic string cannot ship", () => {
    const en = locale("en");
    const ar = locale("ar");
    for (const band of ONET_GROWTH_BANDS) {
      const key = GROWTH_BAND_I18N[band];
      expect(en[key], `en.results.json is missing "${key}" (band: ${band})`).toBeTruthy();
      expect(ar[key], `ar.results.json is missing "${key}" (band: ${band})`).toBeTruthy();
    }
  });

  it("has a genuinely Arabic decline string, not an English fallback", () => {
    const ar = locale("ar");
    const declineAr = ar[GROWTH_BAND_I18N.decline];
    expect(declineAr).toBeTruthy();
    expect(declineAr).toMatch(/[؀-ۿ]/); // contains Arabic script
    expect(declineAr).not.toMatch(/Declining/);
  });

  it("keeps the derived English string identical to the en locale value", () => {
    // growthOutlookFor writes careers.growth_outlook; the locale drives the UI.
    // If these drift, the DB and the report disagree about the same career.
    const en = locale("en");
    for (const band of ONET_GROWTH_BANDS) {
      expect(growthOutlookFor(band), band).toBe(en[GROWTH_BAND_I18N[band]]);
    }
  });

  it("no longer references the removed parser keys", () => {
    const en = locale("en");
    const ar = locale("ar");
    for (const dead of ["growthExcellent", "growthVeryGood", "growthGood", "growthModerate", "growthPctPattern"]) {
      expect(en[dead], `en still has dead key "${dead}"`).toBeUndefined();
      expect(ar[dead], `ar still has dead key "${dead}"`).toBeUndefined();
    }
  });

  it("ships the source attribution line in both locales", () => {
    expect(locale("en").growthSource).toBeTruthy();
    expect(locale("ar").growthSource).toBeTruthy();
  });
});
