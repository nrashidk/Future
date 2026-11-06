/**
 * Sections 2 and 3 of docs/test-plan.md: a guest converting to a paying
 * parent, and the parent account afterwards.
 *
 * Section 0.1 applies: the guest-to-save flow is the one with an open product
 * decision behind it, so these tests RECORD what happens rather than asserting
 * what should. Where the behaviour is a choice not yet made, the test states
 * the observed behaviour and passes -- the point is evidence for the decision,
 * not a verdict on it.
 *
 * Payment is unreachable from here (api.stripe.com is not routable), so
 * anything past checkout is reported blocked rather than guessed at.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
import { Session } from "./fixtures.mjs";
const { chromium } = pw;

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SHOTS = "/tmp/claude-0/-home-claude/02cff30d-f3af-5c58-9ad5-4dbfc039eb52/scratchpad/shots";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(50)} ${note}`);
};

// ------------------------------------------------- C-15 / free tier retired
{
  const s = new Session("wouldbe");
  await s.get("/api/auth/user");
  const r = await s.post("/api/register", {
    username: `free${Date.now()}`, email: `free${Date.now()}@futurepath.test`,
    password: "Str0ng!Passw0rd", firstName: "Free", lastName: "User",
  });
  rec("C-00", "free self-registration is retired (410)",
    r.status === 410, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
}

// ------------------------------------------------------- parent registration
const email = `parent.${Date.now()}@futurepath.test`;
const password = "Str0ng!Passw0rd";
let parentUserId = null;
{
  const s = new Session("parent");
  await s.get("/api/auth/user");
  const r = await s.post("/api/register/parent", {
    firstName: "Test", lastName: "Parent", email, password, confirmPassword: password,
    child: { name: "Test Child", dateOfBirth: "2010-04-04", gender: "male",
             grade: "10", countryId: "uae", curriculum: "MOE" },
    // Both claims or nothing: the schema requires literal true on each, and
    // attestationText pins the exact wording the parent was shown.
    consentsToProcessing: true, attestsGuardianRelationship: true,
    attestationText: "LOCAL FIXTURE attestation wording",
    locale: "en",
  });
  parentUserId = r.body?.user?.id ?? r.body?.id ?? null;
  rec("C-09", "parent registration creates an account",
    r.status < 400 && !!parentUserId, isHtml(r.body) ? "NO SUCH ROUTE" : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 110)}`);
}

// C-08 consent is a real gate on the server, not only in the form
{
  const s = new Session("noconsent");
  await s.get("/api/auth/user");
  const r = await s.post("/api/register/parent", {
    firstName: "No", lastName: "Consent", email: `nc.${Date.now()}@futurepath.test`,
    password, confirmPassword: password,
    child: { name: "Child", dateOfBirth: "2010-04-04", gender: "male",
             grade: "10", countryId: "uae", curriculum: "MOE" },
    // Everything else valid, so the ONLY reason to refuse is the withheld
    // consent -- otherwise this passes on a missing-field error and proves
    // nothing about the consent gate.
    consentsToProcessing: false, attestsGuardianRelationship: false,
    attestationText: "LOCAL FIXTURE attestation wording", locale: "en",
  });
  rec("C-08", "registration without consent is refused server-side",
    r.status >= 400, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
}

// C-04 / C-05 password rules enforced server-side
{
  const s = new Session("weak");
  await s.get("/api/auth/user");
  const r = await s.post("/api/register/parent", {
    firstName: "Weak", lastName: "Pass", email: `weak.${Date.now()}@futurepath.test`,
    password: "short", confirmPassword: "short",
    child: { name: "Child", dateOfBirth: "2010-04-04", gender: "male",
             grade: "10", countryId: "uae", curriculum: "MOE" },
    consentsToProcessing: true, attestsGuardianRelationship: true,
    attestationText: "x", locale: "en",
  });
  rec("C-04", "short password refused server-side", r.status >= 400, `HTTP ${r.status}`);
}

// C-15 duplicate registration
if (parentUserId) {
  const s = new Session("dupe");
  await s.get("/api/auth/user");
  const r = await s.post("/api/register/parent", {
    firstName: "Dupe", lastName: "Parent", email, password, confirmPassword: password,
    child: { name: "Child", dateOfBirth: "2010-04-04", gender: "male",
             grade: "10", countryId: "uae", curriculum: "MOE" },
    consentsToProcessing: true, attestsGuardianRelationship: true,
    attestationText: "x", locale: "en",
  });
  rec("C-15", "duplicate email refused", r.status >= 400, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

// ------------------------------------------------------------- P-07 / P-08
{
  const s = new Session("reset");
  await s.get("/api/auth/user");
  const known = await s.post("/api/forgot-password", { email });
  const unknown = await s.post("/api/forgot-password", { email: `nobody.${Date.now()}@futurepath.test` });
  const same = known.status === unknown.status &&
    JSON.stringify(known.body) === JSON.stringify(unknown.body);
  rec("P-07", "password reset does not reveal whether an address exists",
    same, `known=${known.status} unknown=${unknown.status} identical=${same}`);
}

// ----------------------------------------------------------------- P-01..03
if (parentUserId) {
  const s = new Session("parentLogin");
  let ok = false;
  try { await s.login(email, password); ok = true; } catch { ok = false; }
  rec("P-01", "parent can sign in", ok);
  if (ok) {
    const prof = await s.get("/api/auth/user");
    rec("P-02", "profile returns the parent's own record",
      prof.status === 200 && prof.body?.email === email, `HTTP ${prof.status}`);
    const other = await s.get("/api/assessments/00000000-0000-0000-0000-000000000000");
    rec("P-03", "parent cannot read an arbitrary assessment", other.status >= 400, `HTTP ${other.status}`);
  }
}

// -------------------------------------------------------------- browser side
const browser = await chromium.launch({ args: ["--no-sandbox"] });
for (const lang of ["en", "ar"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  await p.evaluate((l) => localStorage.setItem("fp_language", l), lang);
  await p.goto(`${BASE}/register/parent`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2600);
  const body = await p.locator("body").innerText();
  await p.screenshot({ path: `${SHOTS}/c-register-parent-${lang}.png`, fullPage: false });

  if (lang === "en") {
    // C-02 page chrome: header, language switcher, back control at the TOP.
    const hasHeader = await p.locator("header, [role=banner]").count() > 0;
    const backAtTop = await p.evaluate(() => {
      const el = [...document.querySelectorAll("a,button")]
        .find((e) => /back|return/i.test(e.textContent || ""));
      return el ? el.getBoundingClientRect().top < window.innerHeight / 2 : null;
    });
    rec("C-02", "register page has header and a back control near the top",
      hasHeader && backAtTop === true, `header=${hasHeader} backNearTop=${backAtTop}`);

    // C-06 the attestation must read naturally before a child's name is typed.
    const fallback = /my child/i.test(body);
    rec("C-06", "consent attestation reads naturally with no child name yet",
      fallback, fallback ? 'uses "my child"' : "fallback wording not visible");
  } else {
    const fallbackAr = /طفلي/.test(body);
    rec("C-06b", "Arabic attestation fallback reads naturally",
      fallbackAr, fallbackAr ? 'uses طفلي' : "fallback wording not visible");
  }
  await ctx.close();
}
await browser.close();

// ------------------------------------------------------------------- blocked
rec("C-10", "payment completes and upgrades the tier", null, "api.stripe.com unreachable from this sandbox");
rec("P-04", "PDF generated and readable", null, "needs a completed paid assessment");
rec("E-01", "reset email delivered", null, "api.resend.com unreachable from this sandbox");

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`parent/conversion: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
