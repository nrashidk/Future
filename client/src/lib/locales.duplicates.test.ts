/**
 * NO LOCALE FILE MAY DECLARE THE SAME KEY TWICE IN ONE OBJECT.
 *
 * JSON allows it and every parser silently keeps the LAST one, so a duplicate
 * is not a syntax error — it is a string that quietly stops being used. The
 * one this test was written for had two features both claiming
 * `countries.selectCountry` in admin.json; the second won, the first became
 * dead text, and nothing anywhere reported it.
 *
 * It is also a trap for anyone editing these files with a tool rather than by
 * hand: a JSON round trip DELETES the losing copy, so a formatting change
 * arrives in review carrying a silent content change beside it. That happened
 * twice while the licence analytics strings were being added.
 *
 * Checked per object, not per file: the same key name in two different objects
 * is normal and fine.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const LOCALES_DIR = join(process.cwd(), "client", "public", "locales");

function bundleFiles(): string[] {
  const out: string[] = [];
  for (const lang of readdirSync(LOCALES_DIR)) {
    const dir = join(LOCALES_DIR, lang);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".json")) out.push(join(dir, f));
    }
  }
  return out.sort();
}

/**
 * Found with a reviver rather than by regex: only a real parse knows which
 * keys sit in the SAME object, and a regex over the text would flag every
 * namespace that legitimately repeats a name.
 */
function duplicateKeys(path: string): string[] {
  const found: string[] = [];
  const raw = readFileSync(path, "utf8");

  // Parsed first purely to fail loudly on a malformed file: the walker below
  // assumes well-formed JSON and would report nothing useful about broken
  // input. A reviver cannot be used to find the duplicates themselves — by the
  // time it runs, the losing copy is already gone.
  JSON.parse(raw);

  const stack: Array<Set<string>> = [];
  let i = 0;
  let inString = false;
  let escaped = false;
  let current = "";
  let lastKey: string | null = null;
  let expectingValue = false;

  for (i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { current += ch; escaped = false; continue; }
      if (ch === "\\") { current += ch; escaped = true; continue; }
      if (ch === '"') { inString = false; lastKey = current; continue; }
      current += ch;
      continue;
    }
    if (ch === '"') { inString = true; current = ""; continue; }
    if (ch === "{") { stack.push(new Set()); expectingValue = false; continue; }
    if (ch === "}") { stack.pop(); lastKey = null; continue; }
    if (ch === "[") { stack.push(new Set()); continue; }
    if (ch === "]") { stack.pop(); continue; }
    if (ch === ":") {
      const top = stack[stack.length - 1];
      if (top && lastKey !== null) {
        if (top.has(lastKey)) found.push(lastKey);
        top.add(lastKey);
      }
      lastKey = null;
      expectingValue = true;
      continue;
    }
    if (ch === ",") { lastKey = null; expectingValue = false; continue; }
  }
  return found;
}

describe("locale bundles", () => {
  const files = bundleFiles();

  it("finds locale files to check at all", () => {
    // Without this, a wrong path makes every assertion below pass on nothing.
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files)("%s declares no key twice in the same object", (file) => {
    expect(duplicateKeys(file)).toEqual([]);
  });

  it("detects a duplicate when there is one", () => {
    // The detector proved against a known-bad input, so an always-empty
    // implementation cannot pass the suite above.
    const { writeFileSync, mkdtempSync } = require("fs");
    const { tmpdir } = require("os");
    const dir = mkdtempSync(join(tmpdir(), "loc-"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, JSON.stringify({ a: { k: "one" } }).replace('"k":"one"', '"k":"one","k":"two"'));
    expect(duplicateKeys(bad)).toEqual(["k"]);
  });
});
