/**
 * Multi-year progression: the same student, a grade higher each year.
 *
 * THE PRODUCT CANNOT DO THIS YET, and that is what this suite records.
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
import { build, Session } from "./fixtures.mjs";

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

const stu = new Session("progressionStudent");
await stu.login(me.username, me.password);
console.log(`\nstudent: ${me.username}  school: ${A.name}\n`);

const years = [
  { grade: "9", year: 2023, subjects: ["Mathematics", "Science", "English"] },
  { grade: "10", year: 2024, subjects: ["Mathematics", "Physics", "English"] },
  { grade: "11", year: 2025, subjects: ["Mathematics", "Physics", "Chemistry"] },
  { grade: "12", year: 2026, subjects: ["Mathematics", "Physics", "Biology"] },
];

const made = [];
for (const [i, y] of years.entries()) {
  const create = await stu.post("/api/assessments", {
    favoriteSubjects: y.subjects,
    interests: ["Technology", "Healthcare", "Business"],
    countryId: COUNTRY, curriculum: CURRICULUM, grade: y.grade,
    academicYear: y.year,
    riasecResponses: riasec30(i), cvqResponses: await cvqAll(i),
  });

  if (i > 0) {
    // Every year after the first must be refused while the licence grants one
    // lifetime allocation. Asserted, not worked around.
    const refused = create.status === 403 &&
      /already completed for this allocation/i.test(JSON.stringify(create.body));
    rec(`PG-0${i + 1}`, `year ${i + 1} (grade ${y.grade}) is refused: one allocation`,
      refused, refused ? "403 as expected — PD2 would change this" : detail(create));
    continue;
  }

  const id = create.body?.id;
  if (!id) { rec("PG-01", `grade ${y.grade} assessment created`, false, detail(create)); break; }

  const gen = await stu.post(`/api/assessments/${id}/quiz/generate`, {});
  const qs = gen.body?.questions ?? [];
  if (qs.length) {
    await stu.post(`/api/assessments/${id}/quiz/submit`, {
      responses: qs.map((q) => {
        const opt = Array.isArray(q.options) ? q.options[(i + 1) % q.options.length] : null;
        return { questionId: q.id, answer: typeof opt === "string" ? opt : (opt?.text ?? "a") };
      }),
    });
  }
  await stu.patch(`/api/assessments/${id}`, {
    name: "Progression Student", age: 14 + i,
    interests: ["Technology", "Healthcare", "Business"],
    careerAspirations: ["Doctor", "Engineer"],
    currentStep: 6,
  });
  await stu.post("/api/cvq/submit", { assessmentId: id, responses: await cvqAll(i), durationSeconds: 120 });
  const recsGen = await stu.post(`/api/recommendations/generate/${id}`, {});

  made.push({ id, grade: y.grade, year: y.year });
  rec("PG-01", `first assessment completes with a report`,
    recsGen.status < 400, `${recsGen.body?.count ?? 0} matches`);

  // The school sets the grade, so the client's value is ignored.
  const stored = (await stu.get(`/api/assessments/${id}`)).body?.grade;
  rec("PG-01b", "the grade comes from the school record, not the request",
    stored !== undefined && String(stored) !== y.grade,
    `requested "${y.grade}", stored "${stored}"`);
}

// ------------------------------------------------------------- the progression
{
  const r = await stu.get("/api/students/me/progression");
  const data = r.body?.data ?? [];
  // One allocation, so one year. This is the ceiling, not a failure.
  rec("PG-05", "the progression endpoint returns the one allowed year",
    r.status === 200 && data.length === 1,
    r.status === 200 ? `${data.length} assessment(s)` : detail(r));

  const grades = data.map((d) => String(d.grade));
  rec("PG-06", "the year carries a grade", grades.length === 1 && !!grades[0],
    `grades: ${grades.join(", ")}`);

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
  rec("PG-09", "years are distinguishable (vacuous while only one is allowed)",
    distinct > 1 || data.length < 2,
    `${distinct} distinct top-3 set(s) across ${data.length} year(s)`);

  const ordered = data.every((d, i) => i === 0 || Number(d.grade) >= Number(data[i - 1].grade));
  rec("PG-10", "the progression is returned in grade order", ordered,
    ordered ? "ascending" : `out of order: ${grades.join(", ")}`);
}

// --------------------------------------------- the org admin's view of the same
{
  const admin = A.session;
  const r = await admin.get(`/api/students/${me.userId}/progression`);
  const data = r.body?.data ?? r.body ?? [];
  rec("PG-11", "the school admin can read that student's progression",
    r.status === 200, detail(r));
  const n = Array.isArray(data) ? data.length : (data?.length ?? 0);
  rec("PG-12", "the admin sees the same single year", n === 1, `${n} year(s)`);

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
