/**
 * Section 8 of docs/test-plan.md: files, email content, bilingual rendering.
 *
 * - The files API is asserted GONE (it was removed on 2026-11-15).
 * - Email CONTENT is built by exported functions, so the brand, direction and
 *   wording can be checked without a mail provider. DELIVERY cannot.
 */
import { build, Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(52)} ${note}`);
};

const { orgs } = await build();
const a = orgs.A.session;

/**
 * THE FILES API WAS REMOVED (2026-11-15). Nothing in the product wrote a file
 * row: the upload had no screen and the school CSV import had no caller, so
 * the upload, the share-link maker and the UNAUTHENTICATED one-time share
 * download were surface over minors' data with no purpose. An unmatched /api
 * path falls to the SPA catch-all (200 with HTML), so "gone" is judged by the
 * BODY being the page, never by the status.
 */
const { SUPERADMIN } = await import("./fixtures.mjs");
const up = new Session("uploader");
await up.login(SUPERADMIN.username, SUPERADMIN.password);
const isPage = (b) => typeof b === "string" && /<!doctype html|<html/i.test(b);
{
  const list = await up.get("/api/files");
  rec("F-01", "GET /api/files is no longer a route (superadmin)", isPage(list.body), `HTTP ${list.status}`);
  const shared = await fetch(`${BASE}/api/files/shared/anytoken`, { headers: { accept: "application/json" } });
  const t = await shared.text();
  rec("F-02", "the unauthenticated share download is gone", isPage(t), `HTTP ${shared.status} ${t.slice(0, 40)}`);
  const upl = await up.post("/api/files/upload", {});
  rec("F-03", "the upload is gone", isPage(upl.body) || upl.status === 404, `HTTP ${upl.status}`);
}

// ------------------------------------------------------------------- email
{
  // Signature is (resetUrl, userName, language) -- positional, not an options
  // object. Requires tsx to import the TypeScript module.
  const mod = await import("../../server/services/email.ts").catch(() => null);
  if (!mod?.buildHtmlEmail) {
    rec("E-05", "email content builds in both languages", null,
      "could not import server/services/email.ts (run this suite with tsx)");
  } else {
    const en = mod.buildHtmlEmail("https://example.test/r", "Test Parent", "en");
    const ar = mod.buildHtmlEmail("https://example.test/r", "Test Parent", "ar");
    const arRtl = /dir=["']rtl["']/.test(ar);
    const oldBrandEn = /Future Pathways/.test(en);
    const oldBrandAr = /مسارات المستقبل/.test(ar);
    const newBrandAr = /مسار المستقبل/.test(ar);
    rec("E-05", "Arabic email is RTL and carries the current brand",
      arRtl && !oldBrandAr && !oldBrandEn && newBrandAr,
      `rtl=${arRtl} oldBrandAr=${oldBrandAr} oldBrandEn=${oldBrandEn} newBrandAr=${newBrandAr}`);

    // The sticky-note geometry the design is supposed to carry.
    const sticky = /rotate\(-?1\.5deg\)/.test(en) && /border-radius:\s*8px/.test(en);
    rec("E-05b", "email keeps the sticky-note styling", sticky,
      sticky ? "rotation and 8px radius present" : "styling markers not found");
  }
}
rec("E-01", "emails actually arrive", null, "api.resend.com unreachable from this sandbox");

// --------------------------------------------------------------- bilingual
{
  const langs = ["en", "ar"];
  // The real namespace list; "orgs" is not one -- those keys live in admin.
  const namespaces = ["admin", "assessment", "auth", "common", "landing",
                      "legal", "pricing", "profile", "results", "riasec"];
  const missing = [];
  const loaded = {};
  for (const l of langs) {
    loaded[l] = {};
    for (const ns of namespaces) {
      const r = await fetch(`${BASE}/locales/${l}/${ns}.json`);
      // A missing namespace returns the SPA shell, not JSON, so guard on
      // content type as well as status or JSON.parse throws.
      const ct = r.headers.get("content-type") || "";
      loaded[l][ns] = r.ok && ct.includes("json") ? await r.json().catch(() => null) : null;
    }
  }
  const flat = (o, p = "") => Object.entries(o ?? {}).flatMap(([k, v]) =>
    v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]);
  /**
   * i18next plural suffixes are NOT drift. Arabic has six plural categories
   * (zero/one/two/few/many/other) where English has two, so ar legitimately
   * carries _two, _few and _many keys that en never will. Comparing raw key
   * sets reports six "missing" English keys that should not exist.
   */
  const base = (k) => k.replace(/_(zero|one|two|few|many|other)$/, "");
  const baseSet = (keys) => new Set(keys.map(base));
  for (const ns of namespaces) {
    if (!loaded.en[ns] || !loaded.ar[ns]) { missing.push(`${ns}: namespace missing`); continue; }
    const en = baseSet(flat(loaded.en[ns]));
    const ar = baseSet(flat(loaded.ar[ns]));
    const onlyEn = [...en].filter((k) => !ar.has(k));
    const onlyAr = [...ar].filter((k) => !en.has(k));
    if (onlyEn.length || onlyAr.length) {
      missing.push(`${ns}: ${onlyEn.length} en-only, ${onlyAr.length} ar-only`);
    }
  }
  rec("B-04", "every namespace has the same keys in both locales",
    missing.length === 0, missing.length ? missing.join(" | ") : `${namespaces.length} namespaces aligned`);
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`cross-cutting: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
