/**
 * Every code the data-rights endpoints send has a sentence in both languages.
 *
 * The server sends codes precisely so the reader gets their own language. A code
 * with no Arabic label reaches an Arabic reader as a raw key, and on this surface
 * — a minor being refused, or told what survives their deletion — a raw key is a
 * sentence missing at the point it matters. i18next would fall back to English
 * silently, so nothing but this test notices.
 */

import { describe, it, expect } from "vitest";
import en from "../client/public/locales/en/profile.json";
import ar from "../client/public/locales/ar/profile.json";
import { ERASURE_BLOCK_CODES, ERASURE_KEPT_CODES } from "./dataRights";

const at = (bundle: any, path: string): unknown =>
  path.split(".").reduce((node, key) => node?.[key], bundle);

const keysOf = (node: any, prefix = ""): string[] =>
  Object.entries(node).flatMap(([k, v]) =>
    v && typeof v === "object" ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

describe.each([["en", en], ["ar", ar]] as const)("profile.json (%s) data-rights strings", (_lang, bundle) => {
  it.each(ERASURE_BLOCK_CODES)("labels the blocking record %s", (code) => {
    const label = at(bundle, `dataRights.refusal.labels.${code}`);
    expect(typeof label === "string" && label.trim().length > 0).toBe(true);
  });

  it.each(ERASURE_KEPT_CODES)("says what survives erasure for %s, naming the school", (code) => {
    expect(at(bundle, `dataRights.delete.kept.${code}`)).toContain("{{school}}");
  });
});

it("has the same data-rights keys in Arabic as in English", () => {
  expect(keysOf((ar as any).dataRights).sort()).toEqual(keysOf((en as any).dataRights).sort());
});
