/**
 * Section 8 of docs/test-plan.md: files, email content, bilingual rendering.
 *
 * Two things here are testable despite the missing external services:
 *
 * - File REJECTION happens in multer's fileFilter, before anything is written
 *   to object storage, so the allowlist can be tested without Spaces. File
 *   ACCEPTANCE cannot -- that reaches Spaces, and is reported blocked.
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
 * File upload is superadmin-gated. Uploading as the org admin returns 403
 * "Forbidden: Admin access required" -- a ROLE refusal that never reaches
 * multer's fileFilter, so it would record the allowlist as working on
 * evidence that says nothing about it. These tests run as superadmin so the
 * refusal under test is the allowlist's.
 */
const { SUPERADMIN } = await import("./fixtures.mjs");
const up = new Session("uploader");
await up.login(SUPERADMIN.username, SUPERADMIN.password);

// ------------------------------------------------------------------- files
async function upload(session, filename, contentType, bytes) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), filename);
  const csrf = (session.cookie.match(/(?:^|; )csrf_token=([^;]+)/) || [])[1];
  const r = await fetch(`${BASE}/api/files/upload`, {
    method: "POST",
    headers: {
      cookie: session.cookie,
      ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
      "x-forwarded-for": session.clientIp,
    },
    body: form,
  });
  const t = await r.text();
  try { return { status: r.status, body: JSON.parse(t) }; }
  catch { return { status: r.status, body: t.slice(0, 160) }; }
}

for (const [name, type, label] of [
  ["payload.exe", "application/x-msdownload", ".exe"],
  ["icon.svg", "image/svg+xml", ".svg"],
  ["page.html", "text/html", ".html"],
]) {
  const r = await upload(up, name, type, "x".repeat(64));
  // 400, not just ">= 400": a disallowed type is a client error, and a 500
  // would file every rejected upload as a server fault.
  rec(`F-02:${label}`, `upload of ${label} is rejected with 400`,
    r.status === 400, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

// The allowlist checks MIME *and* extension, so a disguise must fail both ways.
{
  const r1 = await upload(up, "data.csv", "application/x-msdownload", "a,b\n1,2\n");
  rec("F-02:mime", "a .csv name with an executable MIME type is rejected",
    r1.status === 400, `HTTP ${r1.status}`);
  const r2 = await upload(up, "payload.exe", "text/csv", "a,b\n1,2\n");
  rec("F-02:ext", "an .exe name with a csv MIME type is rejected",
    r2.status === 400, `HTTP ${r2.status}`);
}

// F-04 path traversal in the filename
{
  // Honest scope: this name has no allowed extension, so it is refused by the
  // allowlist before any path handling runs. Traversal with an ALLOWED
  // extension cannot be tested here -- that path writes to Spaces.
  const r = await upload(up, "../../etc/passwd", "text/csv", "a,b\n1,2\n");
  rec("F-04", "traversal filename refused (by allowlist, not path handling)",
    r.status === 400, `HTTP ${r.status}`);
  const r2 = await upload(up, "../../evil.csv", "text/csv", "a,b\n1,2\n");
  rec("F-04b", "traversal with an ALLOWED extension", null,
    `HTTP ${r2.status} — reaches the storage path, which is unreachable here`);
}

rec("F-01", "permitted file types are accepted and stored", null,
  "acceptance path writes to Spaces, which is unreachable from this sandbox");
rec("F-05", "share link works until expiry, then refuses", null, "needs a stored file");

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
