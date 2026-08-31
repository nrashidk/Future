/**
 * Drift guard: the generated CVQ values-profile module vs its source JSON.
 *
 * career-values-profiles.ts is a COMPILED COPY of
 * scripts/cvq-values-profiles.proposed.json — the data has to be a .ts module so
 * esbuild bundles it into dist/, but that duplication is exactly what rots. This
 * test fails the suite the moment the two disagree, so the JSON stays the single
 * reviewable source of truth and the module stays a pure derivative of it.
 *
 * It also pins the shape the scoring code depends on: calculateCvqScore
 * (server/services/matching.ts) reads career.valuesProfile as
 * Record<string, number> and intersects its keys with the student's CVQ domains,
 * so a renamed or missing domain here would silently shrink validDomains rather
 * than throw.
 */

import { readFileSync } from "fs";
import path from "path";
import { describe, it, expect, vi } from "vitest";
import { CVQ_DOMAINS } from "@shared/schema";

// The module imports ../db for its backfill function, and server/db.ts opens a
// Neon pool (and throws without DATABASE_URL) at import time. Only the DATA is
// under test here, so stub the db module out.
vi.mock("../db", () => ({ db: {}, pool: {} }));

const { CAREER_VALUES_PROFILES } = await import("./career-values-profiles");

interface SourceCareer {
  title: string;
  onetCode: string;
  valuesProfile: Record<string, number>;
}

const source = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../scripts/cvq-values-profiles.proposed.json"),
    "utf-8",
  ),
) as { domains: string[]; careers: SourceCareer[] };

describe("CAREER_VALUES_PROFILES vs cvq-values-profiles.proposed.json", () => {
  it("covers exactly the same set of career titles", () => {
    const moduleTitles = CAREER_VALUES_PROFILES.map((c) => c.title).sort();
    const sourceTitles = source.careers.map((c) => c.title).sort();
    expect(moduleTitles).toEqual(sourceTitles);
  });

  it("has no duplicate titles (the backfill matches on title)", () => {
    const titles = CAREER_VALUES_PROFILES.map((c) => c.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("carries the RESCALED valuesProfile verbatim, not rawProfile", () => {
    const bySourceTitle = new Map(source.careers.map((c) => [c.title, c]));
    for (const entry of CAREER_VALUES_PROFILES) {
      const original = bySourceTitle.get(entry.title);
      expect(original, `no source entry for "${entry.title}"`).toBeDefined();
      // Deep equality both ways: catches a changed number, a dropped domain and
      // an added one. rawProfile differs from valuesProfile for every career, so
      // this also pins that the rescaled profile is the one that was embedded.
      expect(entry.valuesProfile).toEqual(original!.valuesProfile);
    }
  });

  it("carries the O*NET code verbatim", () => {
    const bySourceTitle = new Map(source.careers.map((c) => [c.title, c]));
    for (const entry of CAREER_VALUES_PROFILES) {
      expect(entry.onetCode).toBe(bySourceTitle.get(entry.title)!.onetCode);
    }
  });

  it("uses exactly the five active CVQ_DOMAINS as profile keys", () => {
    const expected = [...CVQ_DOMAINS].sort();
    expect([...source.domains].sort()).toEqual(expected);
    for (const entry of CAREER_VALUES_PROFILES) {
      expect(Object.keys(entry.valuesProfile).sort()).toEqual(expected);
    }
  });

  it("holds only integers in 0-100 (the range calculateCvqScore assumes)", () => {
    for (const entry of CAREER_VALUES_PROFILES) {
      for (const [domain, value] of Object.entries(entry.valuesProfile)) {
        expect(Number.isInteger(value), `${entry.title}.${domain} = ${value}`).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(100);
      }
    }
  });

  it("keeps onetCode within the careers.onet_code varchar(15) limit", () => {
    for (const entry of CAREER_VALUES_PROFILES) {
      expect(entry.onetCode.length).toBeLessThanOrEqual(15);
    }
  });
});
