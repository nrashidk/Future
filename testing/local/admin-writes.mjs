/**
 * THE WRITE SURFACES THAT NO SUITE TOUCHED: question CRUD, bulk upload, and
 * the organization PATCH.
 *
 * CLAUDE.md listed all three as uncovered. Each one writes something that
 * matters: quiz_questions is the national bank every student's paper is drawn
 * from, and the organization PATCH carries a school's licence entitlement and
 * the country and curriculum that decide which bank its students draw from.
 *
 * WHAT THIS SUITE IS FOR, AND WHAT IT IS NOT. Every guard here turned out to
 * exist when read. That is the reason to test them rather than a reason not to:
 * reading tells you a check is written, not that it runs, and two of these
 * routes carry only `isAuthenticated` in the middleware chain with the real
 * check inside the handler — a shape where deleting four lines leaves a route
 * that still looks guarded. Each case below was confirmed to FAIL when its
 * guard is removed; the mutation results are in the commit message.
 *
 * THE CASE THAT CANNOT BE JUDGED BY STATUS. A non-superadmin PATCHing
 * `totalLicenses` is answered **200**, and the field is silently dropped. So a
 * school admin trying to grant itself licences gets a success and no licences,
 * and a status-based test passes identically whether the drop happens or not —
 * the same shape as bulk-reset-passwords, which answers 200 having refused
 * every member in the batch. W-04 reads the licence count out of the database
 * before and after and compares the numbers.
 *
 * Denial cases are safe to send with a thin body: the role check runs in the
 * middleware or at the top of the handler, before validation, so a 403 cannot
 * be a 400 wearing a disguise. The positive controls carry full valid payloads,
 * because those have to actually succeed.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(62)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const tag = Math.random().toString(36).slice(2, 7);
const { orgs } = await build();
const A = orgs.A, B = orgs.B;

const sa = new Session(`aw-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

/**
 * A school student's own session — the lowest-privileged authenticated caller,
 * and the one whose quiz these questions end up in. build() enrols students
 * and returns their credentials, so this is a real enrolled member rather than
 * a hand-made row.
 */
const studentCreds = A.students?.[0] ?? null;
let studentSession = null;
if (studentCreds?.username && studentCreds?.password) {
  studentSession = new Session(`aw-student-${tag}`);
  await studentSession.login(studentCreds.username, studentCreds.password);
}

/** Session has get/post/put/patch but no delete, and DELETE is a sibling verb
 *  this suite must not skip — `req` takes the method directly. */
const del = (session, path) => session.req("DELETE", path);

const question = (label) => ({
  question: `${label} — which of these is a prime number? (${tag})`,
  questionType: "multiple_choice",
  options: ["4", "7", "9", "15"],
  correctAnswer: "7",
  subject: "Mathematics",
  grade: 10,
  topic: "Number Theory",
  difficulty: "easy",
  cognitiveLevel: "knowledge",
  countryId: "uae",
  curriculum: "MOE National",
});

const countQuestions = async () =>
  Number((await sql(`SELECT COUNT(*)::int AS n FROM quiz_questions WHERE question LIKE $1`, [`%(${tag})%`]))[0].n);

const orgRow = async (id) =>
  (await sql(`SELECT name, total_licenses, is_unlimited_licenses, country_id, curriculum FROM organizations WHERE id = $1`, [id]))[0] ?? null;

let createdQuestionId = null;

try {
  // ------------------------------------------------------------------ W-00
  // The routes are real. The SPA catch-all answers 200 with HTML for any
  // unmatched URL, so a misspelled path would "pass" every denial case below.
  {
    const real = await A.session.post("/api/admin/questions", question("probe"));
    const bogus = await A.session.post("/api/admin/questionsX", question("probe"));
    const realIsOurs = real.status === 403 && !isHtml(real.body);
    const bogusDiffers = isHtml(bogus.body) || bogus.status === 404;
    rec("W-00", "question route is real; misspelled sibling answers differently",
      realIsOurs && bogusDiffers,
      `real=${real.status}/${isHtml(real.body) ? "html" : "json"} bogus=${bogus.status}/${isHtml(bogus.body) ? "html" : "json"}`);
  }

  // ------------------------------------------------------------------ W-01
  // A SCHOOL ADMIN cannot write to the national question bank. Asserted by the
  // row count, not only the status: a 403 with a row written would be worse
  // than either alone.
  {
    const before = await countQuestions();
    const r = await A.session.post("/api/admin/questions", question("org-admin"));
    const after = await countQuestions();
    rec("W-01", "org admin cannot create a quiz question", r.status === 403 && after === before,
      `HTTP ${r.status} rows ${before}->${after}`);
  }

  // ------------------------------------------------------------------ W-02
  // A STUDENT — the account type that sits the quiz — cannot write questions
  // into the bank it is drawn from.
  if (!studentSession) {
    rec("W-02", "a school student cannot create a quiz question", false,
      "fixture: build() exposed no student session");
  } else {
    const before = await countQuestions();
    const r = await studentSession.post("/api/admin/questions", question("student"));
    const after = await countQuestions();
    rec("W-02", "a school student cannot create a quiz question", r.status === 403 && after === before,
      `HTTP ${r.status} rows ${before}->${after}`);
  }

  // ------------------------------------------------------------------ W-03
  // THE NEGATIVE CONTROL. Without it, a route that refused everyone would pass
  // W-01 and W-02 while the feature was dead. It also gives the later cases a
  // real row to edit and delete.
  {
    const before = await countQuestions();
    const r = await sa.post("/api/admin/questions", question("superadmin"));
    const after = await countQuestions();
    createdQuestionId = r.body?.id ?? null;
    rec("W-03", "a superadmin CAN create a quiz question", r.status === 201 && after === before + 1 && !!createdQuestionId,
      `HTTP ${r.status} rows ${before}->${after}`);
  }

  // ------------------------------------------------------------------ W-04
  // EVERY VERB, not just the one that was easy to check. This codebase's own
  // bug list names "a control applied to one verb and not its siblings" —
  // ownership checked on PATCH and not GET or DELETE — so PATCH and DELETE are
  // checked here, and DELETE is confirmed by the row still existing.
  if (!createdQuestionId) {
    rec("W-04", "org admin cannot PATCH or DELETE a quiz question", false, "no question was created to target");
  } else {
    const p = await A.session.patch(`/api/admin/questions/${createdQuestionId}`, { difficulty: "hard" });
    const d = await del(A.session, `/api/admin/questions/${createdQuestionId}`);
    const still = await sql(`SELECT difficulty FROM quiz_questions WHERE id = $1`, [createdQuestionId]);
    rec("W-04", "org admin cannot PATCH or DELETE a quiz question",
      p.status === 403 && d.status === 403 && still.length === 1 && still[0].difficulty === "easy",
      `patch=${p.status} delete=${d.status} row survives=${still.length === 1} difficulty=${still[0]?.difficulty}`);
  }

  // ------------------------------------------------------------------ W-05
  // Bulk upload is the same control on a different door, and the one that can
  // write MANY rows in one request.
  {
    const before = await countQuestions();
    const r = await A.session.post("/api/admin/questions/bulk-upload", {
      questions: [question("bulk-1"), question("bulk-2")], format: "json",
    });
    const after = await countQuestions();
    rec("W-05", "org admin cannot bulk-upload questions", r.status === 403 && after === before,
      `HTTP ${r.status} rows ${before}->${after}`);
  }

  // ------------------------------------------------------------------ W-06
  // CROSS-TENANT. School B's admin against school A's organization: a school's
  // name, logo, country and curriculum are its own. Judged by school A's row,
  // because a 403 that still wrote would be invisible to a status check.
  {
    const before = await orgRow(A.orgId);
    const r = await B.session.patch(`/api/admin/organizations/${A.orgId}`, {
      name: `HIJACKED-${tag}`, logoUrl: "https://example.invalid/x.png",
    });
    const after = await orgRow(A.orgId);
    rec("W-06", "school B cannot PATCH school A's organization",
      r.status === 403 && after?.name === before?.name,
      `HTTP ${r.status} name unchanged=${after?.name === before?.name}`);
  }

  // ------------------------------------------------------------------ W-07
  // THE MONEY CASE, AND THE ONE STATUS CANNOT JUDGE. An org admin may patch
  // its own school, and `totalLicenses` is silently DROPPED rather than
  // refused — so this is answered 200 whether the drop happens or not. The
  // licence count is read from the database on both sides.
  {
    const before = await orgRow(A.orgId);
    const r = await A.session.patch(`/api/admin/organizations/${A.orgId}`, {
      totalLicenses: 99999, isUnlimitedLicenses: true,
    });
    const after = await orgRow(A.orgId);
    const held = after?.total_licenses === before?.total_licenses
      && after?.is_unlimited_licenses === before?.is_unlimited_licenses;
    rec("W-07", "an org admin cannot grant itself licences (200, silently dropped)", held,
      `HTTP ${r.status} licences ${before?.total_licenses}->${after?.total_licenses} unlimited ${before?.is_unlimited_licenses}->${after?.is_unlimited_licenses}`);
  }

  // ------------------------------------------------------------------ W-08
  // THE NEGATIVE CONTROL for W-06 and W-07: the org admin's legitimate edit
  // still works. Without this, a PATCH that refused every field would pass
  // both and the school could no longer rename itself.
  {
    const wanted = `Renamed-${tag}`;
    const r = await A.session.patch(`/api/admin/organizations/${A.orgId}`, { name: wanted });
    const after = await orgRow(A.orgId);
    rec("W-08", "an org admin CAN still rename its own school", r.status < 400 && after?.name === wanted,
      `HTTP ${r.status} name=${after?.name}`);
  }

  // ------------------------------------------------------------------ W-09
  // A STUDENT cannot reconfigure the school it belongs to. accountType is the
  // test in this handler, so a student is not an org_admin and falls through to
  // the 403 -- fails closed, which is what this pins.
  if (!studentSession) {
    rec("W-09", "a school student cannot PATCH its own school", false, "no student session");
  } else {
    const before = await orgRow(A.orgId);
    const r = await studentSession.patch(`/api/admin/organizations/${A.orgId}`, { name: `STUDENT-${tag}` });
    const after = await orgRow(A.orgId);
    rec("W-09", "a school student cannot PATCH its own school",
      r.status === 403 && after?.name === before?.name,
      `HTTP ${r.status} name unchanged=${after?.name === before?.name}`);
  }

  // ------------------------------------------------------------------ W-10
  // CROSS-TENANT ON A MINOR'S RECORD. The member PATCH is the student-edit
  // route -- it accepts fullName, grade, gender, studentId and dateOfBirth --
  // so this is school B writing a child's details in school A.
  {
    const victim = (await sql(
      `SELECT id, student_name FROM organization_members WHERE organization_id = $1 AND role = 'student' LIMIT 1`,
      [A.orgId]))[0];
    if (!victim) {
      rec("W-10", "school B cannot edit school A's student record", false, "fixture: school A has no student member");
    } else {
      const r = await B.session.patch(`/api/admin/organizations/${A.orgId}/members/${victim.id}`, {
        fullName: `HIJACKED-${tag}`, grade: "12",
      });
      const after = (await sql(`SELECT student_name FROM organization_members WHERE id = $1`, [victim.id]))[0];
      rec("W-10", "school B cannot edit school A's student record",
        r.status === 403 && after?.student_name === victim.student_name,
        `HTTP ${r.status} name unchanged=${after?.student_name === victim.student_name}`);
    }
  }
} finally {
  await sql(`DELETE FROM quiz_questions WHERE question LIKE $1`, [`%(${tag})%`]);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
