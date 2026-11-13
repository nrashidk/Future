/**
 * EVERY CAREER'S ARABIC DESCRIPTION IS ARABIC.
 *
 * Until 2026-11-13, 31 of the 68 entries stored the ENGLISH description in
 * descriptionAr as a deliberate placeholder, and an Arabic report printed
 * English for them. A placeholder is non-empty, so nothing that checked for
 * "has a value" could see it — the Translation Manager read 100%.
 *
 * Read as TEXT, not imported: the module imports db.ts, which throws at
 * import when DATABASE_URL is unset.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { isArabicText } from "@shared/arabicText";

const source = readFileSync(
  fileURLToPath(new URL("./career-arabic-content.ts", import.meta.url)), "utf8");
const descriptions = [...source.matchAll(/^\s*descriptionAr: "(.*)",$/gm)].map((m) => m[1]);

describe("career Arabic content", () => {
  it("covers all 68 careers", () => {
    expect(descriptions.length).toBe(68);
  });
  it("has no description left in English", () => {
    const english = descriptions.filter((d) => !isArabicText(d));
    expect(english).toEqual([]);
  });
  it("has no description that is mostly Latin letters", () => {
    // isArabicText passes on ONE Arabic letter; this catches a mixed line.
    const mixed = descriptions.filter((d) => (d.match(/[A-Za-z]/g)?.length ?? 0) > 12);
    expect(mixed).toEqual([]);
  });
  it("carries no TODO(i18n) placeholder", () => {
    expect(source).not.toContain("TODO(i18n)");
  });
});
