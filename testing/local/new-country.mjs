/**
 * The new-country onboarding chain, end to end:
 *
 *   country -> priorities & vision -> curricula -> subjects -> questions
 *           -> school in that country -> students in that school
 *           -> a guest taking the assessment in that country
 *
 * Each step depends on the last, so a break anywhere stops the chain and is
 * reported at the step that broke rather than as a cascade of failures.
 *
 * NOT TESTED HERE: autoPopulate. POST /api/admin/countries can research the
 * country with the LLM, and api.anthropic.com is unreachable from this
 * sandbox. The chain runs with autoPopulate false and fills the data
 * explicitly, which is also the path a superadmin uses when they do not want
 * generated content.
 */
import { Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
function rec(id, what, pass, note = "") {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(8)} ${what.padEnd(50)} ${note}`);
  return pass;
}
const detail = (r) => isHtml(r.body) ? "NO SUCH ROUTE" : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`;

const RUN = Math.random().toString(36).slice(2, 6);
const COUNTRY_ID = `testland-${RUN}`;
const CODE = "TL" + (RUN[0].toUpperCase() >= "A" && RUN[0].toUpperCase() <= "Z" ? RUN[0].toUpperCase() : "X");

const sa = new Session("superadmin");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

console.log(`\n--- new country: ${COUNTRY_ID} (${CODE}) ---\n`);

// ------------------------------------------------------------ 1. the country
let created = false;
{
  const r = await sa.post("/api/admin/countries", {
    id: COUNTRY_ID, name: `Testland ${RUN}`, code: CODE,
    abbreviation: "TL", autoPopulate: false,
  });
  created = rec("NC-01", "superadmin creates a country", r.status < 400, detail(r));
}
if (!created) {
  console.log("\nchain stops here — nothing downstream can be tested.");
  process.exit(1);
}

// id rules are enforced
{
  const r = await sa.post("/api/admin/countries", {
    id: "Bad Id With Spaces", name: "Bad", code: "BD", autoPopulate: false,
  });
  rec("NC-01b", "malformed country id is refused", r.status === 400, `HTTP ${r.status}`);
}
{
  const r = await sa.post("/api/admin/countries", {
    id: COUNTRY_ID, name: "Duplicate", code: "DUP", autoPopulate: false,
  });
  rec("NC-01c", "duplicate country id is refused (409)", r.status === 409, `HTTP ${r.status}`);
}

// ---------------------------------------- 2. priorities, vision, curricula
{
  const r = await sa.req("PUT", `/api/admin/countries/${COUNTRY_ID}`, {
    mission: "Build a knowledge economy for Testland.",
    vision: "Every student on a path that fits them.",
    // prioritySectors is an array of STRINGS, with the Arabic held in a
    // parallel prioritySectorsAr array -- not objects with a nameAr field.
    prioritySectors: ["Healthcare", "Renewable Energy"],
    prioritySectorsAr: ["الرعاية الصحية", "الطاقة المتجددة"],
    nationalGoals: ["Double STEM graduates by 2035"],
    curricula: ["MOE", "IB"],
    gradeLevels: ["9", "10", "11", "12"],
  });
  rec("NC-02", "priorities, vision and curricula are saved", r.status < 400, detail(r));
}
{
  const r = await sa.get(`/api/countries/${COUNTRY_ID}`);
  const b = r.body ?? {};
  const ok = Array.isArray(b.prioritySectors) && b.prioritySectors.length === 2 &&
             Array.isArray(b.curricula) && b.curricula.includes("IB");
  rec("NC-02b", "they read back correctly on the public route", ok,
    `sectors=${b.prioritySectors?.length} curricula=${JSON.stringify(b.curricula)}`);
}

// ------------------------------------------------------------- 3. subjects
const subjectIds = [];
for (const [name, code, curriculum] of [
  ["Mathematics", `MATH-${RUN}`, "MOE"],
  ["Biology", `BIO-${RUN}`, "MOE"],
  ["Economics", `ECON-${RUN}`, "IB"],
]) {
  const r = await sa.post("/api/superadmin/subjects", {
    name, code, countryId: COUNTRY_ID, curriculum,
    description: `${name} for Testland`, displayOrder: subjectIds.length + 1, isActive: true,
  });
  if (r.status < 400 && (r.body?.id ?? r.body?.subject?.id)) subjectIds.push(r.body.id ?? r.body.subject.id);
  rec(`NC-03:${code.split("-")[0]}`, `subject ${name} (${curriculum}) created`, r.status < 400, detail(r));
}
{
  const r = await sa.post("/api/superadmin/subjects", { name: "Incomplete" });
  rec("NC-03b", "subject without countryId/curriculum is refused", r.status === 400, `HTTP ${r.status}`);
}
{
  const r = await sa.get(`/api/countries/${COUNTRY_ID}/curricula/MOE/subjects`);
  const n = Array.isArray(r.body) ? r.body.length : null;
  rec("NC-03c", "MOE subjects list shows exactly the two MOE subjects", n === 2,
    n === null ? detail(r) : `${n} subjects`);
}
{
  const r = await sa.get(`/api/countries/${COUNTRY_ID}/curricula/IB/subjects`);
  const n = Array.isArray(r.body) ? r.body.length : null;
  rec("NC-03d", "IB subjects list is separate from MOE", n === 1, n === null ? detail(r) : `${n} subjects`);
}

// ------------------------------------------------------------ 4. questions
{
  const r = await sa.post("/api/admin/questions", {
    // grade is an INTEGER column, and topic is NOT NULL.
    subject: "Mathematics", countryId: COUNTRY_ID, curriculum: "MOE", grade: 10,
    question: `Testland ${RUN}: what is 7 x 8?`,
    questionType: "multiple_choice",
    options: ["54", "56", "58", "64"], correctAnswer: "56",
    // cognitiveLevel is NOT NULL too, and has no default.
    topic: "Arithmetic", difficulty: "easy", cognitiveLevel: "knowledge",
  });
  rec("NC-04", "a question is added for the new country", r.status < 400, detail(r));
}
{
  const r = await sa.get(`/api/admin/questions?countryId=${COUNTRY_ID}`);
  const list = Array.isArray(r.body) ? r.body : r.body?.questions;
  const mine = Array.isArray(list) ? list.filter((q) => q.countryId === COUNTRY_ID).length : null;
  rec("NC-04b", "the question is listed under the new country", mine >= 1,
    mine === null ? detail(r) : `${mine} question(s)`);
}
rec("NC-04c", "LLM question generation for the country", null,
  "POST /countries/:id/generate-questions needs api.anthropic.com, unreachable here");

// -------------------------------------------------- 5. a school in it
let org = null;
{
  const r = await sa.post("/api/superadmin/organizations/create-with-admin", {
    organizationName: `Testland Academy ${RUN}`, totalLicenses: 20, isUnlimitedLicenses: false,
    countryId: COUNTRY_ID, curriculum: "MOE",
    adminFirstName: "TL", adminLastName: "Admin",
    adminEmail: `tl.admin.${RUN}@futurepath.test`, adminPhone: "+971500000000",
    adminUsername: `tladmin${RUN}`,
  });
  org = {
    id: r.body?.organization?.id ?? r.body?.id,
    creds: r.body?.admin?.credentials,
  };
  rec("NC-05", "a school is created in the new country", r.status < 400 && !!org.id, detail(r));
}

// -------------------------------------------------- 6. students in it
let orgAdmin = null;
if (org?.id && org.creds) {
  orgAdmin = new Session("tlAdmin");
  await orgAdmin.login(org.creds.username, org.creds.password);

  const consent = await orgAdmin.post("/api/my-organization/consent", {
    consentsToProcessing: true, attestsGuardianConsent: true,
    attestationText: "LOCAL FIXTURE consent wording", locale: "en",
  });
  rec("NC-06", "the new school records its consent", consent.status < 400, detail(consent));

  const r = await orgAdmin.post(`/api/admin/organizations/${org.id}/members`, {
    fullName: "Testland Student", studentName: "Testland Student",
    grade: "10", dateOfBirth: "2010-06-06", studentGender: "female",
  });
  const username = r.body?.user?.username;
  rec("NC-06b", "a student is enrolled in the new school", r.status < 400 && !!username, detail(r));

  // The student inherits the school's country, and the school's country is the
  // new one -- so the whole chain has to have held for this to be right.
  if (username) {
    const stu = new Session("tlStudent");
    await stu.login(username, r.body.password);
    const me = await stu.get("/api/auth/user");
    rec("NC-06c", "the student's country is the new country",
      me.body?.countryId === COUNTRY_ID || me.body?.organizationCountryId === COUNTRY_ID,
      `countryId=${me.body?.countryId ?? "(not on user payload)"}`);
  }
}

// -------------------------------------------------- 7. a guest in it
{
  const g = new Session("tlGuest");
  await g.get("/api/auth/user");
  const made = await g.post("/api/assessments", {
    // Minimum three favourite subjects is enforced server-side.
    favoriteSubjects: ["Mathematics", "Biology", "Economics"], interests: ["healthcare"],
    assessmentType: "basic", countryId: COUNTRY_ID, curriculum: "MOE", grade: "10",
  });
  const id = made.body?.id;
  rec("NC-07", "a guest can start an assessment in the new country",
    made.status < 400 && !!id, detail(made));

  if (id) {
    const gen = await g.post(`/api/assessments/${id}/quiz/generate`, {});
    const qs = gen.body?.questions;

    /**
     * THE PARTIALLY-POPULATED COUNTRY TRAP.
     *
     * quiz.routes.ts builds the pool for the assessment's country, and only
     * falls back to the global bank when that pool is EXACTLY zero:
     *
     *   if (questionPool.length === 0 && studentGrade) { ...countryId: null... }
     *
     * Then it requires MIN_QUESTIONS (6). So a country with 0 questions works
     * -- it borrows the global bank -- and a country with 1 to 5 does not:
     * the pool is non-empty, the fallback never fires, and every student in
     * that country gets a hard 400 until the bank reaches 6 for their grade
     * and subjects.
     *
     * Adding the first question to a new country therefore BREAKS it. This
     * test asserts the behaviour as it currently is, so the day it changes,
     * this fails and someone reads this comment.
     */
    /**
     * After the top-up fix: one question no longer breaks the country. The
     * quiz builds, the country's own question is used, and the rest are
     * borrowed from other countries at the same grade -- which the server
     * logs as a warning, because the student is being assessed partly on
     * another country's curriculum until the bank is populated.
     */
    const built = Array.isArray(qs) && qs.length >= 6;
    rec("NC-07b", "one question no longer breaks a new country",
      built, built ? `${qs.length} questions built` : detail(gen));
    const mine = Array.isArray(qs) ? qs.filter((q) => /Testland/.test(q.question ?? "")).length : 0;
    rec("NC-07d", "the country's own question is preferred and included",
      mine > 0, `${mine} of ${qs?.length ?? 0} are Testland's, rest borrowed`);

    // The same assessment, in a country with NO questions of its own, works.
    const g2 = new Session("tlGuest2");
    await g2.get("/api/auth/user");
    const made2 = await g2.post("/api/assessments", {
      favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["technology"],
      assessmentType: "basic", countryId: "uae", curriculum: "MOE National", grade: "10",
    });
    const gen2 = made2.body?.id
      ? await g2.post(`/api/assessments/${made2.body.id}/quiz/generate`, {})
      : { status: 0, body: null };
    rec("NC-07c", "a populated country still generates normally (control)",
      Array.isArray(gen2.body?.questions) && gen2.body.questions.length === 15,
      `${gen2.body?.questions?.length ?? "n/a"} questions`);
  }
}

// ------------------------------- 8. the secondary school admin (untested role)
if (org?.id) {
  const r = await sa.post(`/api/superadmin/organizations/${org.id}/admins`, {
    firstName: "Second", lastName: "Admin",
    email: `second.${RUN}@futurepath.test`, username: `second${RUN}`,
  });
  const creds = r.body?.credentials ?? r.body?.admin?.credentials;
  rec("NC-08", "a SECOND (non-primary) school admin can be added",
    r.status < 400 && !!creds, detail(r));

  if (creds) {
    const s2 = new Session("secondAdmin");
    await s2.login(creds.username, creds.password);
    const own = await s2.get("/api/my-organization");
    rec("NC-08b", "the second admin sees the same school", own.status === 200, `HTTP ${own.status}`);

    const enrol = await s2.post(`/api/admin/organizations/${org.id}/members`, {
      fullName: "Second Admin Student", studentName: "Second Admin Student",
      grade: "11", dateOfBirth: "2009-07-07", studentGender: "male",
    });
    rec("NC-08c", "the second admin can enrol students", enrol.status < 400, detail(enrol));

    const other = await s2.get("/api/superadmin/organizations");
    rec("NC-08d", "the second admin cannot reach superadmin", other.status >= 400, `HTTP ${other.status}`);
  }
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`new-country chain: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
