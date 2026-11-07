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
/**
 * These two asserted EXACT COUNTS -- two subjects under MOE, one under IB,
 * being the ones this suite adds by hand. Both now hold more, because
 * offering a curriculum seeds it the six umbrella subjects, and a count is
 * the wrong thing to pin anyway: it breaks whenever the umbrella list or the
 * fixtures change, while saying nothing about the property that matters.
 *
 * What matters is that the per-curriculum lists stay SEPARATE. A hand-added
 * subject must appear under its own curriculum and not leak into the other,
 * which is the thing a (country, curriculum) key is for.
 */
{
  const moe = await sa.get(`/api/countries/${COUNTRY_ID}/curricula/MOE/subjects`);
  const ib = await sa.get(`/api/countries/${COUNTRY_ID}/curricula/IB/subjects`);
  const moeNames = Array.isArray(moe.body) ? moe.body.map((x) => x.name) : null;
  const ibNames = Array.isArray(ib.body) ? ib.body.map((x) => x.name) : null;

  rec("NC-03c", "MOE's own subject is under MOE and not under IB",
    moeNames?.includes("Biology") === true && ibNames?.includes("Biology") === false,
    moeNames ? `MOE has ${moeNames.length}, IB has ${ibNames.length}` : detail(moe));

  rec("NC-03d", "IB's own subject is under IB and not under MOE",
    ibNames?.includes("Economics") === true && moeNames?.includes("Economics") === false,
    ibNames ? `IB: ${ibNames.join(", ")}` : detail(ib));
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
    /**
     * FLAKY AS ORIGINALLY WRITTEN, and it took two false alarms to notice.
     *
     * This asserted that the country's single own question appeared among the
     * fifteen built. But selection shuffles the pool and slices it
     * (quiz.routes.ts, shuffleQuestions), so one own question among fourteen
     * borrowed ones appears or does not by luck. It passed on one fresh
     * database and failed on the next, and on the first of those failures it
     * was read as a regression from an unrelated change.
     *
     * So it is asked over several attempts instead. The claim being made is
     * that the country's own question is ELIGIBLE -- that it is in the pool
     * rather than excluded by the borrowing path -- and an own question that
     * never surfaces across five independent draws is not eligible, while one
     * that surfaces once is. A single draw cannot distinguish those.
     */
    let mine = 0;
    let attempts = 0;
    for (let i = 0; i < 5 && mine === 0; i++) {
      attempts++;
      const g3 = new Session(`tlGuestDraw${i}`);
      await g3.get("/api/auth/user");
      const a3 = await g3.post("/api/assessments", {
        favoriteSubjects: ["Mathematics", "Biology", "Economics"], interests: ["healthcare"],
        assessmentType: "basic", countryId: COUNTRY_ID, curriculum: "MOE", grade: "10",
      });
      if (!a3.body?.id) continue;
      const q3 = await g3.post(`/api/assessments/${a3.body.id}/quiz/generate`, {});
      const list = q3.body?.questions ?? [];
      mine = list.filter((q) => /Testland/.test(q.question ?? "")).length;
    }
    rec("NC-07d", "the country's own question is eligible, not excluded by borrowing",
      mine > 0, `found in ${attempts} draw(s): ${mine} of 15 were Testland's`);

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

/**
 * READINESS -- whether the chain above actually produced a usable country.
 *
 * Everything before this point passed, and the country is still not fit to
 * serve a student: this suite gives MOE two subjects and IB one, and the
 * assessment makes a student choose three. That was invisible. A half-built
 * country looked exactly like a finished one -- same row, same Active badge --
 * and the ways it breaks are all silent: no sector map means every career
 * scores the same for national-vision alignment, and too few subjects means
 * the student cannot get past the first step at all.
 *
 * NC-09b is the one that matters. If readiness ever reports this country as
 * ready, the check has stopped measuring anything.
 */
{
  const sa = new Session("readinessSa");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);

  const r = await sa.get(`/api/admin/countries/${COUNTRY_ID}/readiness`);
  rec("NC-09", "the readiness endpoint answers for the new country",
    r.status === 200 && Array.isArray(r.body?.blockers), detail(r));

  const blockers = (r.body?.blockers ?? []).join(" | ");
  rec("NC-09b", "the half-built country is reported NOT ready",
    r.body?.ready === false && r.body.blockers.length > 0,
    r.body?.ready === false ? blockers.slice(0, 150) : `ready=${r.body?.ready} -- readiness is not measuring anything`);

  // Named explicitly: these are the two gaps this suite actually created, so
  // "not ready" has to be not-ready FOR THE RIGHT REASONS rather than for any
  // reason at all.
  rec("NC-09c", "it names the missing sector map", /sector map/i.test(blockers),
    /sector map/i.test(blockers) ? "flagged" : "NOT flagged");
  /**
   * THE SUBJECT DETECTOR, PROVEN DIRECTLY.
   *
   * This used to read the blocker off Testland, which was a dead end for lack
   * of subjects as a side effect of how this suite builds it. That no longer
   * happens: a curriculum now gets its six umbrella subjects on the write that
   * offers it, so the natural flow can never produce the state. Which is the
   * point -- but it means the detector has to be given the state on purpose,
   * or this assertion silently stops measuring anything.
   *
   * So the subjects of one curriculum are removed and the check is asked
   * again. Deactivated rather than deleted, because readiness counts active
   * rows and a question may reference the subject.
   */
  const { Client } = await import("pg");
  const pg = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await pg.connect();
  try {
    const { rowCount } = await pg.query(
      `UPDATE subjects SET is_active = false WHERE country_id = $1 AND curriculum = $2`,
      [COUNTRY_ID, "IB"],
    );
    const after = await sa.get(`/api/admin/countries/${COUNTRY_ID}/readiness`);
    const b = (after.body?.blockers ?? []).join(" | ");
    rec("NC-09d", "a curriculum stripped of subjects IS flagged as a dead end",
      rowCount > 0 && /IB.*subject/i.test(b),
      rowCount === 0 ? "SETUP FAILED -- no subject rows to deactivate"
        : (/IB.*subject/i.test(b) ? b.match(/IB[^|]*/)?.[0]?.trim() : `NOT flagged: ${b.slice(0, 120)}`));

    await pg.query(
      `UPDATE subjects SET is_active = true WHERE country_id = $1 AND curriculum = $2`,
      [COUNTRY_ID, "IB"],
    );
  } finally {
    await pg.end();
  }

  /**
   * THE POSITIVE CONTROL -- the check must be able to say yes about something,
   * or "not ready" above means nothing.
   *
   * Asserted against UAE's MOE National curriculum rather than against UAE as
   * a whole, because UAE as a whole is NOT ready, and that is a live finding
   * rather than a flaw in this test. See NC-09g.
   */
  const uae = await sa.get(`/api/admin/countries/uae/readiness`);
  const moe = (uae.body?.checks?.curricula ?? []).find((c) => c.curriculum === "MOE National");
  rec("NC-09e", "a fully seeded curriculum is reported ready (positive control)",
    uae.status === 200 && moe?.ready === true && (uae.body?.checks?.sectorMapRows ?? 0) > 0,
    moe ? `MOE National: ${moe.subjectCount} subjects, ${moe.questionCount} questions, ` +
          `${uae.body.checks.sectorMapRows} sector rows` : detail(uae));

  /**
   * THE INVARIANT: a country never offers a curriculum a student cannot use.
   *
   * This test was written the other way round first. UAE offered four
   * curricula -- MOE National, British, American, IB -- and only MOE National
   * had any subjects. Picking British meant reaching the first step of the
   * assessment, being asked to choose three subjects from an empty list, and
   * going no further; nothing refused the choice, so it surfaced only when a
   * student was sitting in front of it. So NC-09g asserted that broken state
   * deliberately, and said to flip it once the gap closed.
   *
   * The gap is closed: the seed now offers only curricula it seeds subjects
   * for, and migration 030 removes empty ones from existing data -- keeping
   * any that a school or an assessment still references, since dropping those
   * would turn working rows into permanently invalid ones.
   *
   * So the assertion is now the rule rather than the exception. If this fails,
   * someone has added a curriculum to a country without adding its subjects,
   * and a student is about to hit that empty list.
   */
  const empty = (uae.body?.checks?.curricula ?? []).filter((c) => c.subjectCount === 0);
  rec("NC-09g", "no country offers a curriculum with no subjects",
    (uae.body?.checks?.curricula ?? []).length > 0 && empty.length === 0,
    empty.length === 0
      ? `all ${uae.body?.checks?.curricula?.length} offered curricula have subjects`
      : `DEAD ENDS: ${empty.map((c) => c.curriculum).join(", ")} -- offered with no subjects behind them`);

  const list = await sa.get("/api/admin/countries");
  const mine = (list.body ?? []).find((c) => c.id === COUNTRY_ID);
  rec("NC-09f", "readiness travels with the country list, not behind a click",
    list.status === 200 && mine?.readiness?.ready === false && mine.readiness.blockerCount > 0,
    mine?.readiness ? `blockers=${mine.readiness.blockerCount} warnings=${mine.readiness.warningCount}` : "no readiness on the list row");
}

/**
 * THE PATH THAT ACTUALLY MATTERS: a country created WITH its curricula.
 *
 * Everything above builds a country the long way round -- create it bare, then
 * add curricula, then add subjects by hand -- which is what a human clicking
 * through the screens does, and it is deliberately left half-built so the
 * readiness checks have something to find.
 *
 * Auto-population is not that. It researches the country and hands back its
 * curricula in one go, so the curricula are present at the moment the country
 * row is written, and that is where the subject rows are now created. This
 * asserts the case Saudi Arabia will actually take: six umbrella subjects per
 * curriculum, with no further action.
 *
 * Six, not a model's idea of a subject list, because career matching is
 * hard-coded to those six and a seventh would score every career as a
 * non-match for any student who picked it. What varies per curriculum is the
 * naming, which lives in aliases -- hence the alias assertion below.
 */
{
  const sa2 = new Session("autoSubjects");
  await sa2.login(SUPERADMIN.username, SUPERADMIN.password);
  const id = `seedland-${RUN}`;

  const created = await sa2.post("/api/admin/countries", {
    // 2-3 UPPERCASE LETTERS only -- RUN is base36 and can start with a digit,
    // so it cannot be spliced in raw. Derived to a letter so repeat runs still
    // differ.
    id, name: `Seedland ${RUN}`,
    code: `S${String.fromCharCode(65 + (RUN.charCodeAt(0) + RUN.charCodeAt(1)) % 26)}`,
    abbreviation: "SL", currency: "SLD", region: "Test",
    curricula: ["National", "IB"],
    prioritySectors: ["Technology"], nationalGoals: ["Growth"],
    gradeLevels: ["9", "10", "11", "12"],
    autoPopulate: false,
  });
  rec("NC-10", "a country can be created with its curricula in one call",
    created.status === 201, detail(created));

  for (const curriculum of ["National", "IB"]) {
    const r = await sa2.get(`/api/countries/${id}/curricula/${encodeURIComponent(curriculum)}/subjects`);
    const names = (r.body ?? []).map((s) => s.name).sort();
    const expected = ["Arabic", "Computer Science", "English", "Mathematics", "Science", "Social Studies"];
    rec(`NC-10:${curriculum}`, `${curriculum} got the six umbrella subjects automatically`,
      JSON.stringify(names) === JSON.stringify(expected),
      names.length ? names.join(", ") : detail(r));
  }

  // The aliases are what let a curriculum call a subject something local --
  // "Islamic Studies", "Physics" -- and still resolve to the umbrella subject
  // that matching understands. Without them the row is just a label.
  const nat = await sa2.get(`/api/countries/${id}/curricula/National/subjects`);
  const science = (nat.body ?? []).find((s) => s.name === "Science");
  rec("NC-10b", "the seeded subjects carry their local-name aliases",
    Array.isArray(science?.aliases) && science.aliases.includes("Physics") &&
    science.aliases.includes("Biology"),
    science ? `Science aliases: ${(science.aliases ?? []).slice(0, 5).join(", ")}` : "no Science row");

  // And the whole point: such a country is not a dead end.
  const ready = await sa2.get(`/api/admin/countries/${id}/readiness`);
  const subjectBlockers = (ready.body?.blockers ?? []).filter((b) => /subject/i.test(b));
  rec("NC-10c", "no curriculum of it is a dead end for lack of subjects",
    ready.status === 200 && subjectBlockers.length === 0,
    subjectBlockers.length === 0
      ? `remaining blockers are not about subjects: ${(ready.body?.blockers ?? []).length}`
      : subjectBlockers.join(" | "));
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`new-country chain: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
