/**
 * Section 1 of docs/test-plan.md: the guest journey, plus the guest half of
 * section 8.1 (bilingual rendering).
 *
 * Split on purpose. Rendering, RTL and i18n resolution are checked in a real
 * browser, because that is where they fail. Access control is checked over the
 * API, because a UI that offers no link is not a control -- the question is
 * what the server does when the request arrives anyway.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SHOTS = "/tmp/claude-0/-home-claude/02cff30d-f3af-5c58-9ad5-4dbfc039eb52/scratchpad/shots";

const results = [];
function rec(id, what, pass, note = "") {
  results.push({ id, what, pass, note });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id.padEnd(6)} ${what.padEnd(52)} ${note}`);
}
const blocked = (id, what, why) => {
  results.push({ id, what, pass: null, note: why });
  console.log(`BLOCK ${id.padEnd(6)} ${what.padEnd(52)} ${why}`);
};

/**
 * An i18n key that reached the screen unresolved. Deliberately narrow: the
 * pattern is dotted lowerCamel segments with no spaces, which is what t()
 * returns when a key is missing. Sentences, filenames and URLs are excluded,
 * or every "e.g." and ".ae" in the copy would be a false positive. This class
 * of defect shipped undetected for six weeks on the paid signup page once.
 */
const RAW_KEY = /\b[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]+){1,4}\b/g;
const IGNORE = /\.(ae|com|org|net|io|pdf|png|jpg|svg|json|ts|tsx)$/i;
function rawKeys(text) {
  return [...text.matchAll(RAW_KEY)].map((m) => m[0]).filter((s) => !IGNORE.test(s));
}

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function page(lang) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: lang === "ar" ? "ar-AE" : "en-US",
  });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => p._errs?.push(String(e).slice(0, 140)));
  p._errs = [];
  if (lang) {
    await p.goto(BASE, { waitUntil: "domcontentloaded" });
    await p.evaluate((l) => localStorage.setItem("fp_language", l), lang);
  }
  return p;
}

// ---------------------------------------------------------------- G-01, G-02
for (const lang of ["en", "ar"]) {
  const p = await page(lang);
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const body = await p.locator("body").innerText();
  const dir = await p.evaluate(() => document.documentElement.getAttribute("dir") || getComputedStyle(document.body).direction);
  const keys = rawKeys(body);
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  await p.screenshot({ path: `${SHOTS}/g-landing-${lang}.png` });

  if (lang === "en") {
    rec("G-01", "landing renders", body.length > 500 && p._errs.length === 0,
      `${body.length} chars, ${p._errs.length} page errors`);
  } else {
    rec("G-02", "Arabic landing: RTL, no raw keys, no overflow",
      dir === "rtl" && keys.length === 0 && !overflow,
      `dir=${dir} rawKeys=${keys.length ? keys.slice(0, 3).join(",") : "none"} hOverflow=${overflow}`);
  }
  await p.context().close();
}

// ---------------------------------------------------------------- G-03..G-06
{
  const p = await page("en");
  await p.goto(`${BASE}/assessment`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  const body = await p.locator("body").innerText();
  await p.screenshot({ path: `${SHOTS}/g-assessment-entry.png` });
  rec("G-03", "assessment entry reachable as guest", body.length > 200, `${body.length} chars`);

  const checkboxes = await p.locator('input[type="checkbox"], [role="checkbox"]').count();
  const consentText = /consent|agree|موافق/i.test(body);
  rec("G-04a", "a consent control is present on demographics",
    checkboxes > 0 && consentText, `${checkboxes} checkbox(es), consent wording ${consentText}`);

  // The under-18 note is conditional on the age entered, so the form has to be
  // filled before it can be judged. It is the sentence server-side comments
  // flag as unbacked ("no parental mechanism exists behind it"), so what it
  // says to a 15 year old matters.
  await p.getByPlaceholder(/full name/i).fill("Test Student").catch(() => {});
  await p.getByPlaceholder(/your age/i).fill("15").catch(() => {});
  await p.waitForTimeout(1200);
  const afterAge = await p.locator("body").innerText();
  await p.screenshot({ path: `${SHOTS}/g-demographics-under18.png` });
  const under18 = /under 18|parental|institutional/i.test(afterAge);
  const noteLine = (afterAge.split("\n").find((l) => /under 18|parental|institutional/i.test(l)) || "").trim();
  rec("G-05", "under-18 consent note appears for age 15", under18,
    under18 ? `"${noteLine.slice(0, 90)}"` : "no note shown after entering age 15");

  // G-04: the consent tick must be a real gate, not decoration.
  const nextBtn = p.getByRole("button", { name: /continue|next|التالي/i }).first();
  let blockedWithoutConsent = null;
  if (await nextBtn.count()) {
    await nextBtn.click().catch(() => {});
    await p.waitForTimeout(1200);
    blockedWithoutConsent = /step 1 of/i.test(await p.locator("body").innerText());
  }
  if (blockedWithoutConsent === null) {
    blocked("G-04b", "consent tick gates progression", "no continue button found at this step");
  } else {
    rec("G-04b", "consent tick gates progression (still on step 1)", blockedWithoutConsent,
      blockedWithoutConsent ? "blocked as expected" : "ADVANCED WITHOUT CONSENT");
  }
  await p.context().close();
}

// ------------------------------------------------------------------ G-07 API
// 15 questions at every subject count, checked against the server rather than
// by clicking through three full assessments.
{
  // The quiz is generated per assessment, so this creates a real guest
  // assessment at each subject count and counts what comes back.
  const counts = {};
  for (const subjects of [["Mathematics","Science","English"],
                          ["Mathematics","Science","English","Arabic"],
                          ["Mathematics","Science","English","Arabic","Physics"]]) {
    let cookie = "";
    const call = async (method, path, body) => {
      // CSRF applies to guests too: the csrf_token cookie must be echoed in
      // the x-csrf-token header, so an unauthenticated POST still needs a GET
      // first to be issued one.
      const csrf = (cookie.match(/(?:^|; )csrf_token=([^;]+)/) || [])[1];
      const r = await fetch(`${BASE}${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
          ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const c of r.headers.getSetCookie?.() ?? []) cookie += (cookie ? "; " : "") + c.split(";")[0];
      const t = await r.text();
      try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: t.slice(0, 120) }; }
    };
    await call("GET", "/api/auth/user");
    const made = await call("POST", "/api/assessments", {
      favoriteSubjects: subjects, interests: ["technology"], assessmentType: "basic",
      // grade is required for quiz generation: without it the quiz is created
      // but reads back empty, so the count silently looks like zero.
      countryId: "uae", curriculum: "MOE", grade: "10",
    });
    const id = made.body?.id;
    if (!id) { counts[subjects.length] = `create ${made.status}`; continue; }
    const gen = await call("POST", `/api/assessments/${id}/quiz/generate`, {});
    const got = await call("GET", `/api/assessments/${id}/quiz`);
    const qs = got.body?.questions ?? gen.body?.questions;
    counts[subjects.length] = Array.isArray(qs) ? qs.length : `read ${got.status}`;
  }
  const nums = Object.values(counts).filter((v) => typeof v === "number");
  if (nums.length !== 3) {
    blocked("G-07", "15 quiz questions at every subject count", JSON.stringify(counts));
  } else {
    rec("G-07", "15 quiz questions at every subject count",
      nums.every((n) => n === 15), JSON.stringify(counts));
  }
}

// ------------------------------------------------------- G-18, G-19, G-20 API
{
  const r = await fetch(`${BASE}/api/assessments/does-not-exist-00000000`);
  rec("G-18", "unknown assessment id is refused, not 500",
    r.status === 403 || r.status === 404, `HTTP ${r.status}`);
}
{
  // A report about a minor must not render to an unauthenticated caller.
  const r = await fetch(`${BASE}/api/recommendations/pdf/00000000-0000-0000-0000-000000000000`);
  rec("G-19", "PDF of an arbitrary assessment refused when signed out",
    r.status >= 400, `HTTP ${r.status}`);
}
{
  const guarded = [
    ["/api/admin/organizations", "admin orgs"],
    ["/api/superadmin/organizations", "superadmin orgs"],
    ["/api/analytics/overview", "analytics"],
  ];
  for (const [path, name] of guarded) {
    const r = await fetch(`${BASE}${path}`);
    const txt = await r.text();
    const html = txt.trimStart().startsWith("<!DOCTYPE");
    rec(`G-20:${name}`, `guest cannot reach ${name}`,
      !html && r.status >= 400, html ? "NO SUCH ROUTE — test wrong" : `HTTP ${r.status}`);
  }
}

// ------------------------------------------------------------ G-11 (72h TTL)
{
  const r = await fetch(`${BASE}/locales/en/results.json`);
  const j = await r.json().catch(() => ({}));
  const notice = JSON.stringify(j);
  rec("G-11", "guest expiry notice exists and names a date",
    /deleted|expire/i.test(notice) && /\{\{date\}\}/.test(notice),
    /\{\{date\}\}/.test(notice) ? "interpolates {{date}}" : "no {{date}} placeholder found");
}

// ------------------------------------------------------- 8.1 every route, AR
{
  const routes = ["/", "/assessment", "/login", "/login/student", "/register/parent",
                  "/tier-selection", "/forgot-password", "/privacy", "/terms"];
  const p = await page("ar");
  const offenders = [];
  for (const route of routes) {
    await p.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(1600);
    const text = await p.locator("body").innerText();
    const keys = rawKeys(text);
    if (keys.length) offenders.push(`${route}: ${keys.slice(0, 3).join(",")}`);
  }
  rec("B-01", "no unresolved i18n keys on any Arabic route",
    offenders.length === 0, offenders.length ? offenders.join(" | ") : `${routes.length} routes clean`);
  await p.context().close();
}

await browser.close();

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`guest: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
