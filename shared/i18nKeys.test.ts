/**
 * Every t("…") literal in the client must resolve in BOTH locales.
 *
 * This exists because of a specific, shipped failure. 5e58950 retired the free
 * tier and deleted the orphaned form keys under auth.json's register.*, on the
 * stated grounds that they were "confirmed unused outside Register.tsx before
 * removal". They were not: RegisterParent.tsx — the only page through which a
 * parent can pay — used eleven of them. For six weeks its field labels read
 * "register.firstName", "register.email", "register.password", and a mistyped
 * address produced "register.validation.emailInvalid". Nothing failed. tsc is
 * blind to this (t() returns string for any input), no test rendered the page,
 * and the server was entirely unaffected, so the whole estate stayed green
 * while the paid signup form displayed raw key names to every visitor.
 *
 * The check is deliberately whole-repo rather than scoped to the page that
 * broke. The defect was not in RegisterParent.tsx — that file never changed;
 * it was in a DIFFERENT file's deletion. A guard that only watched the victim
 * would not have fired, because the victim is not what moves. The same scan
 * independently found superadmin.errorTitle missing from admin.json, breaking
 * the toast title on four superadmin error paths that nobody had reported.
 *
 * Scope and its limits, stated so this is not mistaken for more than it is:
 *   - Only string-literal keys are checked. t(someVariable) and template
 *     literals are invisible here and always will be.
 *   - Comments are stripped before scanning. Without that, ResetPassword.tsx's
 *     comment ABOUT t("errorDesc") reads as a call to it and fails a file that
 *     is correct — the first version of this scan did exactly that.
 *   - A key resolving is not a key being CORRECT. The fallback this same fix
 *     replaced, t("register.firstName"), resolved perfectly well for months
 *     while rendering "I am First Name's parent or legal guardian."
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const LOCALES = ["en", "ar"] as const;
const SRC_DIR = "client/src";
const LOCALE_DIR = "client/public/locales";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if ([".ts", ".tsx"].includes(extname(entry.name)) && !entry.name.endsWith(".test.ts"))
      out.push(p);
  }
  return out;
}

/** Strip // and block comments so prose about a key is not read as a call. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const bundles = new Map<string, Record<string, unknown> | null>();
function bundle(loc: string, ns: string) {
  const key = `${loc}/${ns}`;
  if (!bundles.has(key)) {
    const p = join(LOCALE_DIR, loc, `${ns}.json`);
    bundles.set(key, existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null);
  }
  return bundles.get(key);
}

function resolves(loc: string, namespaces: string[], dotted: string): boolean {
  return namespaces.some((ns) => {
    let cur: unknown = bundle(loc, ns);
    for (const part of dotted.split(".")) {
      if (typeof cur !== "object" || cur === null || !(part in (cur as object))) return false;
      cur = (cur as Record<string, unknown>)[part];
    }
    return typeof cur === "string";
  });
}

describe("client translation keys", () => {
  it("every t(\"…\") literal resolves in both en and ar", () => {
    const failures: string[] = [];

    for (const file of walk(SRC_DIR)) {
      const src = stripComments(readFileSync(file, "utf-8"));
      const namespaces = [...src.matchAll(/useTranslation\(\s*\[?\s*["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      if (namespaces.length === 0) continue;

      const keys = new Set([...src.matchAll(/\bt\(\s*["']([a-zA-Z][\w.]*)["']/g)].map((m) => m[1]));
      for (const key of [...keys].sort()) {
        const missing = LOCALES.filter((loc) => !resolves(loc, namespaces, key));
        if (missing.length > 0) failures.push(`${file}: ${key} — missing in ${missing.join(", ")}`);
      }
    }

    expect(failures, `Unresolved translation keys:\n${failures.join("\n")}`).toEqual([]);
  });

  it("scans a meaningful number of files, so a broken walk cannot pass silently", () => {
    // Without this, a walk() that returns [] — a renamed directory, a changed
    // extension filter — makes the assertion above vacuously true.
    expect(walk(SRC_DIR).length).toBeGreaterThan(50);
  });
});
