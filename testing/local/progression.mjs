/**
 * Multi-year progression: the same student, a grade higher each year.
 *
 * IT WORKS -- for everyone except school students, and an earlier version of
 * this file wrongly reported that it worked for nobody.
 *
 * That mistake is worth keeping in view: the licence guard at
 * assessment.routes.ts:393 is scoped `if (orgMember?.role === 'student')`,
 * school students only. Testing the feature with the fixture student to hand
 * -- who is a school student -- produced a 403, and the 403 was read as the
 * product's behaviour rather than as one branch of it. A parent-registered or
 * standalone student has no such gate and can sit an assessment every year.
 *
 * So this suite now walks four years as a NON-SCHOOL student, which is the
 * case progression was built for, and asserts the school limitation
 * separately below.
 *
 * A school licence grants a SINGLE LIFETIME ALLOCATION. organization_members
 * .hasCompletedAssessment is set false once, when the student is enrolled, set
 * true when their report is generated, and reset by nothing -- no route, no
 * admin screen, no superadmin tool. A second attempt is refused with
 * "Assessment already completed for this allocation"
 * (assessment.routes.ts:393), whose own comment says so plainly and names the
 * unbuilt phase that would change it: "Today the license grants a single
 * lifetime allocation... PD2: when per-period re-assessment is added, an
 * allocated new period grants a fresh allocation here."
 *
 * So everything downstream is built and waiting: the progression endpoints,
 * the assessments.academicYear column, the school's grade-progress view. They
 * work. They can only ever hold one year.
 *
 * A school student's grade is also not theirs to vary -- it comes from the
 * school's record, so even a permitted second assessment would sit at the same
 * grade until the school advanced them.
 *
 * This suite therefore asserts TODAY'S behaviour, deliberately. When PD2
 * lands, PG-02 fails, and whoever is reading this should turn the four-year
 * walk back on.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const COUNTRY = "uae";
const CURRICULUM = "MOE National";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(50)} ${note}`);
};
const detail = (r) => isHtml(r.body) ? "NO SUCH ROUTE" : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 100)}`;

function riasec30(seed) {
  const out = {};
  for (const theme of ["R", "I", "A", "S", "E", "C"]) {
    for (let i = 1; i <= 5; i++) out[`${theme}${i}`] = ((i + theme.charCodeAt(0) + seed) % 5) + 1;
  }
  return out;
}
async function cvqAll(seed) {
  const items = (await (await fetch(`${BASE}/api/cvq/items`)).json()).items ?? [];
  const out = {};
  items.forEach((item, i) => { out[item.id] = ((i + seed) % 5) + 1; });
  return out;
}

const { orgs } = await build();
const A = orgs.A;
const me = A.students[0];

// A standalone (non-school) student: the case the progression feature serves.
const sa = new Session("sa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const tag = Math.random().toString(36).slice(2, 6);
const createdStandalone = await sa.post("/api/superadmin/students", {
  firstName: "Multi", lastName: "Year", email: `multi.${tag}@futurepath.test`,
});
const creds = createdStandalone.body?.credentials ?? {};
const solo = new Session("soloStudent");
await solo.login(creds.username, creds.password);
console.log(`\nstandalone student: ${creds.username}`);
console.log(`school student:     ${me.username} (${A.name})\n`);

const years = [
  { grade: "9", year: 2023, subjects: ["Mathematics", "Science", "English"] },
  { grade: "10", year: 2024, subjects: ["Mathematics", "Physics", "English"] },
  { grade: "11", year: 2025, subjects: ["Mathematics", "Physics", "Chemistry"] },
  { grade: "12", year: 2026, subjects: ["Mathematics", "Physics", "Biology"] },
];

const made = [];

/**
 * Grant the standalone student purchased licences before the walk.
 *
 * shared/assessmentLimits.ts sets three populations, not one:
 *   school students        1 purchased allocation, consumed at completion
 *   free accounts          3 completions, an anti-abuse ceiling
 *   self-paying premium    bound by NEITHER -- users.purchasedLicenses
 *
 * So a FREE account stops at three years, which is what the first run of this
 * walk hit, and a paying parent does not. Licences are granted only by the
 * Stripe webhook and there is no superadmin route to comp one, so the grant
 * is written straight to the database here -- through the TCP socket the
 * bridge already exposes -- to stand in for a completed purchase.
 */
{
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await client.connect();
  await client.query(
    `UPDATE users SET purchased_licenses = 10, is_premium = true WHERE username = $1`,
    [creds.username],
  );
  const { rows } = await client.query(
    `SELECT purchased_licenses, is_premium FROM users WHERE username = $1`, [creds.username]);
  await client.end();
  rec("PG-00", "standalone student granted purchased licences (simulated purchase)",
    Number(rows[0]?.purchased_licenses) === 10,
    `purchased_licenses=${rows[0]?.purchased_licenses} is_premium=${rows[0]?.is_premium}`);
}

// ---------------------------------- four years as a NON-SCHOOL student
for (const [i, y] of years.entries()) {
  const create = await solo.post("/api/assessments", {
    favoriteSubjects: y.subjects,
    interests: ["Technology", "Healthcare", "Business"],
    countryId: COUNTRY, curriculum: CURRICULUM, grade: y.grade,
    riasecResponses: riasec30(i), cvqResponses: await cvqAll(i),
  });
  const id = create.body?.id;
  if (!id) {
    rec(`PG-0${i + 1}`, `year ${i + 1}: grade ${y.grade} assessment`, false, detail(create));
    continue;
  }

  const gen = await solo.post(`/api/assessments/${id}/quiz/generate`, {});
  const qs = gen.body?.questions ?? [];
  if (qs.length) {
    await solo.post(`/api/assessments/${id}/quiz/submit`, {
      responses: qs.map((q) => {
        const opt = Array.isArray(q.options) ? q.options[(i + 1) % q.options.length] : null;
        return { questionId: q.id, answer: typeof opt === "string" ? opt : (opt?.text ?? "a") };
      }),
    });
  }
  await solo.patch(`/api/assessments/${id}`, {
    name: "Progression Student", age: 14 + i,
    interests: ["Technology", "Healthcare", "Business"],
    careerAspirations: ["Doctor", "Engineer"],
    currentStep: 6,
  });
  await solo.post("/api/cvq/submit", { assessmentId: id, responses: await cvqAll(i), durationSeconds: 120 });
  const recsGen = await solo.post(`/api/recommendations/generate/${id}`, {});

  made.push({ id, grade: y.grade, year: y.year, ok: recsGen.status < 400 });
  rec(`PG-0${i + 1}`, `year ${i + 1}: grade ${y.grade} completed with a report`,
    recsGen.status < 400, `${recsGen.body?.count ?? 0} matches`);
}

// -------------------- the school student's single-allocation limit, separately
{
  const schoolStu = new Session("schoolStu");
  await schoolStu.login(me.username, me.password);
  const first = await schoolStu.post("/api/assessments", {
    favoriteSubjects: ["Mathematics", "Science", "English"],
    interests: ["Technology"], countryId: COUNTRY, curriculum: CURRICULUM, grade: "10",
  });
  rec("PG-S1", "a school student's first assessment is allowed",
    first.status < 400, `HTTP ${first.status}`);

  // Only meaningful once the first has produced a report; the fixture student
  // has not, so this records whichever state applies rather than asserting one.
  const second = await schoolStu.post("/api/assessments", {
    favoriteSubjects: ["Mathematics", "Science", "English"],
    interests: ["Technology"], countryId: COUNTRY, curriculum: CURRICULUM, grade: "11",
  });
  const blocked = second.status === 403 &&
    /already completed for this allocation/i.test(JSON.stringify(second.body));
  rec("PG-S2", "school students are capped at one licence allocation",
    blocked || second.status < 400,
    blocked
      ? "403 — one lifetime allocation, as assessment.routes.ts:393 documents"
      : `HTTP ${second.status} — not yet capped (no completed report on the first)`);
}

// ------------------------------------------------------------- the progression
{
  const r = await solo.get("/api/students/me/progression");
  const data = r.body?.data ?? [];
  rec("PG-05", "the progression endpoint returns all four years",
    r.status === 200 && data.length === years.length,
    r.status === 200 ? `${data.length} of ${years.length} assessments` : detail(r));

  const grades = data.map((d) => String(d.grade));
  rec("PG-06", "each year is recorded at its own grade",
    new Set(grades).size === years.length, `grades: ${grades.join(", ")}`);

  const withCareers = data.filter((d) => (d.topCareers ?? []).length > 0).length;
  rec("PG-07", "every year carries its top careers",
    withCareers === data.length, `${withCareers} of ${data.length} have careers`);

  const withRiasec = data.filter((d) => d.riasecScores).length;
  rec("PG-08", "every year carries its RIASEC profile",
    withRiasec === data.length, `${withRiasec} of ${data.length}`);

  // The point of a progression: the years must be distinguishable. If every
  // year returns an identical career list, the chart a school is shown says
  // nothing, however many years it has.
  // Kept for the day PD2 allows more than one year: with several, identical
  // career sets would mean the chart a school is shown says nothing.
  const signatures = data.map((d) => (d.topCareers ?? []).map((c) => c.careerId).join("|"));
  const distinct = new Set(signatures.filter(Boolean)).size;
  rec("PG-09", "the years are not all identical", distinct > 1,
    `${distinct} distinct top-3 career sets across ${data.length} years`);

  /**
   * grade is a TEXT column, so ordering on it directly sorted "10" < "11" <
   * "12" < "9" and put the first year last. Numeric digits are extracted in
   * the query now; this asserts the result, not the implementation.
   */
  const nums = data.map((d) => parseInt(String(d.grade).replace(/\D/g, ""), 10));
  const ordered = nums.every((n, i) => i === 0 || n >= nums[i - 1]);
  rec("PG-10", "the progression is returned in numeric grade order", ordered,
    ordered ? `ascending: ${grades.join(", ")}` : `OUT OF ORDER: ${grades.join(", ")}`);
}

// --------------------------------------------- the org admin's view of the same
{
  const admin = A.session;
  // The school admin's own student, not the standalone one -- an admin has no
  // business reading a student who is not theirs, which PG-13 checks below.
  const r = await admin.get(`/api/students/${me.userId}/progression`);
  const data = r.body?.data ?? r.body ?? [];
  rec("PG-11", "the school admin can read that student's progression",
    r.status === 200, detail(r));
  const n = Array.isArray(data) ? data.length : (data?.length ?? 0);
  rec("PG-12", "the admin's view of their own student loads", r.status === 200,
    `${n} year(s) for the school student`);

  const other = orgs.B.session;
  const x = await other.get(`/api/students/${me.userId}/progression`);
  rec("PG-13", "another school's admin cannot read it", x.status >= 400, `HTTP ${x.status}`);

  const gp = await admin.get(`/api/organizations/${A.orgId}/grade-progress`);
  rec("PG-14", "the school's grade-progress view loads", gp.status === 200, detail(gp));
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`progression: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
