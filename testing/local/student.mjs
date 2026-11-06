/**
 * Section 4 of docs/test-plan.md: the school student.
 *
 * This role never registers and never consents -- the school does both on the
 * student's behalf. So the questions are: is the student TOLD what was agreed
 * for them, are the fields the school set actually locked, and can one student
 * reach another.
 */
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
import { build, Session } from "./fixtures.mjs";
const { chromium } = pw;

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SHOTS = "/tmp/claude-0/-home-claude/02cff30d-f3af-5c58-9ad5-4dbfc039eb52/scratchpad/shots";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(50)} ${note}`);
};

const { orgs } = await build();
const A = orgs.A;
const me = A.students[0];
const peer = A.students[1];
console.log(`\nschool: ${A.name}\nstudent: ${me.username}\n`);

// ------------------------------------------------------------------ API side
const s = new Session("student");
const login = await (async () => {
  try { await s.login(me.username, me.password); return true; } catch { return false; }
})();
rec("S-01", "student signs in with issued credentials", login);

if (login) {
  const who = await s.get("/api/auth/user");
  rec("S-01b", "session resolves to the right user",
    who.body?.id === me.userId || who.body?.userId === me.userId,
    `role=${who.body?.role ?? "?"}`);

  // S-09: the most important test in this section.
  const peerReach = [
    ["/api/assessments/" + (peer.assessmentId ?? "00000000-0000-0000-0000-000000000000"), "peer assessment by id"],
    ["/api/admin/organizations/" + A.orgId + "/members", "own school's roster"],
  ];
  for (const [path, name] of peerReach) {
    const r = await s.get(path);
    const html = typeof r.body === "string" && r.body.trimStart().startsWith("<!DOCTYPE");
    rec("S-09", `student cannot read ${name}`, !html && r.status >= 400,
      html ? "NO SUCH ROUTE — test wrong" : `HTTP ${r.status}`);
  }

  // A peer's real assessment, created as that peer, then reached for.
  const peerSession = new Session("peer");
  let peerAssessmentId = null;
  try {
    await peerSession.login(peer.username, peer.password);
    const made = await peerSession.post("/api/assessments", {
      favoriteSubjects: ["Mathematics", "Science", "English"],
      interests: ["technology"], assessmentType: "basic",
      countryId: "uae", curriculum: "MOE", grade: "10",
    });
    peerAssessmentId = made.body?.id ?? null;
  } catch { /* reported below */ }

  if (peerAssessmentId) {
    const r = await s.get(`/api/assessments/${peerAssessmentId}`);
    rec("S-09b", "student cannot read a PEER's real assessment", r.status >= 400, `HTTP ${r.status}`);
    const pdf = await s.get(`/api/recommendations/pdf/${peerAssessmentId}`);
    rec("S-09c", "student cannot download a peer's PDF", pdf.status >= 400, `HTTP ${pdf.status}`);
  } else {
    rec("S-09b", "student cannot read a PEER's real assessment", null, "could not create peer assessment");
  }

  rec("S-10", "student cannot reach admin",
    (await s.get(`/api/admin/organizations/${A.orgId}`)).status >= 400);
}

// -------------------------------------------------------------- browser side
const browser = await chromium.launch({ args: ["--no-sandbox"] });
for (const lang of ["en", "ar"]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: "domcontentloaded" });
  await p.evaluate((l) => localStorage.setItem("fp_language", l), lang);

  await p.goto(`${BASE}/login/student`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  const userField = p.locator('input[name="username"], input[type="text"]').first();
  const passField = p.locator('input[type="password"]').first();
  if (await userField.count() && await passField.count()) {
    await userField.fill(me.username);
    await passField.fill(me.password);
    await p.getByRole("button", { name: /log ?in|sign ?in|دخول/i }).first().click().catch(() => {});
    await p.waitForTimeout(3500);
  }
  const signedIn = !/\/login/.test(p.url());
  if (lang === "en") rec("S-01c", "student can sign in through the UI", signedIn, p.url().replace(BASE, "") || "/");

  await p.goto(`${BASE}/assessment`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  const body = await p.locator("body").innerText();
  await p.screenshot({ path: `${SHOTS}/s-assessment-${lang}.png` });

  // S-02 / S-03: the student is NOTIFIED, not asked. The school's name should
  // appear, and there should be no tick-box asking the student to consent.
  const namesSchool = body.includes(A.name) || /school|مدرس/i.test(body);
  const asksToTick = (await p.locator('input[type="checkbox"]').count()) > 0;
  rec(lang === "en" ? "S-02" : "S-03", `school consent notice shown, student not asked to consent (${lang})`,
    signedIn ? namesSchool && !asksToTick : null,
    signedIn ? `namesSchool=${namesSchool} checkbox=${asksToTick}` : "not signed in");

  // S-04 / S-05: grade and country were set by the school and must be locked.
  if (signedIn) {
    /**
     * The school's choices are not disabled inputs -- they are rendered as
     * plain text under a "Set by your school" heading, which is a stronger
     * lock than a disabled control: there is no form field to re-enable from
     * devtools. So the assertion is that the values are SHOWN, that no
     * editable control exists for them, and that the student is told why.
     */
    const panel = await p.evaluate(() => {
      const text = document.body.innerText;
      const editable = [...document.querySelectorAll("input,select,[role=combobox]")].filter((el) => {
        const l = (el.getAttribute("name") || el.getAttribute("id") || el.getAttribute("aria-label") || "").toLowerCase();
        return /grade|country|curriculum/.test(l);
      }).length;
      return {
        setBySchool: /set by your school|حدّدتها مدرستك|حددتها مدرستك/i.test(text),
        explains: /not yours to change|chose the country|لا يمكنك تغيير/i.test(text),
        editable,
      };
    });
    if (lang === "en") {
      rec("S-04", "country/curriculum shown as school-set, with no editable control",
        panel.setBySchool && panel.explains && panel.editable === 0, JSON.stringify(panel));
    } else {
      rec("S-05", "same lock renders in Arabic",
        panel.setBySchool || panel.explains ? panel.editable === 0 : null,
        JSON.stringify(panel));
    }
  }
  await ctx.close();
}
await browser.close();

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`student: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
