/**
 * The rename list's ORDER-INDEPENDENCE, which is the property that broke in
 * Phase 4 and is invisible when broken.
 *
 * Phase 2 renamed `Renewable Energy -> Renewable Energy & Sustainability`;
 * Phase 4 renames it back. Left as two rows, the pair is a chain, and applying a
 * chain in list order collapses A->C while applying it in the other order stops
 * at B — so the sector's final name would depend on array position, and nothing
 * downstream would notice (the seed's "unknown sector" warning is non-fatal).
 * The list is therefore collapsed, and this pins that it stays collapsed.
 */
import { describe, it, expect, vi } from "vitest";

// sector-renames.ts -> ../db opens a Neon pool at import time. Only the DATA
// and the guard are under test here; nothing touches a database.
vi.mock("../db", () => ({ db: {}, pool: {} }));

const { SECTOR_RENAMES, assertNoRenameChains } = await import("./sector-renames");

describe("sector rename list", () => {
  it("contains no chains — no target is also a source", () => {
    expect(() => assertNoRenameChains()).not.toThrow();
  });

  it("assertNoRenameChains actually catches one", () => {
    expect(() => assertNoRenameChains([
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ])).toThrow(/chain/i);
  });

  it("every rename is a real change, and no source is renamed twice", () => {
    for (const { from, to } of SECTOR_RENAMES) {
      expect(from, `identity rename: ${from}`).not.toBe(to);
    }
    const sources = SECTOR_RENAMES.map(r => r.from);
    expect(new Set(sources).size, "a source appears twice").toBe(sources.length);
  });

  it("lands on the ten current sector names", async () => {
    // The rename targets must be names the seed still knows about, or the
    // migration renames a row into a name the upsert then duplicates.
    const { UAE_SECTOR_WEF_SKILLS } = await import("../seed");
    const seeded = new Set(UAE_SECTOR_WEF_SKILLS.map(s => s.name));
    expect(SECTOR_RENAMES.filter(r => !seeded.has(r.to)).map(r => r.to)).toEqual([]);
  });
});
