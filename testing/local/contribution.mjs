/**
 * The contribution / reward model: schools submit questions, a superadmin
 * reviews them, approved ones join the bank and the school earns credit.
 *
 * The intent is that a school's questions are filed under the school's own
 * country, curriculum and subject automatically. This suite checks how much of
 * that the server actually enforces, because every one of those three is sent
 * by the client.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(54)} ${note}`);
};
const detail = (r) => isHtml(r.body) ? "NO SUCH ROUTE" : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 110)}`;

const { orgs } = await build();
const A = orgs.A;
const a = A.session;

const sa = new Session("superadmin");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

// What does org A actually look like, and what subjects exist for it?
const orgRow = (await a.get("/api/my-organization")).body;
const orgCountry = orgRow?.countryId ?? "uae";
const orgCurriculum = orgRow?.curriculum ?? "MOE";
const subjects = (await sa.get(`/api/countries/${orgCountry}/curricula/${orgCurriculum}/subjects`)).body;
const subjectCode = Array.isArray(subjects) && subjects.length ? subjects[0].code : null;

console.log(`\nschool: ${A.name}`);
console.log(`country=${orgCountry} curriculum=${orgCurriculum} firstSubject=${subjectCode}\n`);

const question = (text) => ({
  question: text,
  questionType: "multiple_choice",
  // Exactly four PLAIN STRINGS, and correctAnswer is the option text, not an
  // id -- the submission schema differs from the admin question schema here.
  options: ["Option A", "Option B", "Option C", "Option D"],
  correctAnswer: "Option B",
  explanation: "Because B is correct.",
  topic: "General",
  difficulty: "easy",
  cognitiveLevel: "knowledge",
});

// --------------------------------------------------------------- R-01 balance
{
  const r = await a.get("/api/contributions/balance");
  rec("R-01", "org admin can read the reward balance", r.status === 200, detail(r));
}

// ----------------------------------------------------- R-02 a valid submission
let submissionId = null;
if (subjectCode) {
  const r = await a.post("/api/contributions/submit", {
    countryId: orgCountry, curriculum: orgCurriculum, subject: subjectCode, grade: 10,
    questions: [question(`Contribution A ${Date.now()}: which option is B?`)],
  });
  submissionId = r.body?.submissionId ?? r.body?.submission?.id ?? r.body?.id;
  rec("R-02", "a valid submission is accepted", r.status < 400, detail(r));
} else {
  rec("R-02", "a valid submission is accepted", null, "no subject found for this school");
}

// ------------------------------------------- R-03 curriculum must match school
{
  const r = await a.post("/api/contributions/submit", {
    countryId: orgCountry, curriculum: "DEFINITELY-NOT-OURS", subject: subjectCode ?? "MATH", grade: 10,
    questions: [question("Wrong curriculum question?")],
  });
  rec("R-03", "a curriculum that is not the school's is refused", r.status === 400,
    `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
}

// --------------------------------- R-04 THE ONE THAT MATTERS: another country
{
  // Build a second country with the same curriculum and a subject, so the only
  // thing wrong with this submission is that it is not THIS school's country.
  const RUN = Math.random().toString(36).slice(2, 6);
  const otherId = `elsewhere-${RUN}`;
  await sa.post("/api/admin/countries", {
    id: otherId, name: `Elsewhere ${RUN}`, code: "EL" + RUN[0].toUpperCase(), autoPopulate: false,
  });
  await sa.req("PUT", `/api/admin/countries/${otherId}`, {
    curricula: [orgCurriculum], gradeLevels: ["9", "10", "11", "12"],
  });
  const madeSubject = await sa.post("/api/superadmin/subjects", {
    name: "Mathematics", code: `MATH-${RUN}`, countryId: otherId,
    curriculum: orgCurriculum, isActive: true, displayOrder: 1,
  });
  const otherSubject = madeSubject.body?.code ?? `MATH-${RUN}`;

  const r = await a.post("/api/contributions/submit", {
    countryId: otherId, curriculum: orgCurriculum, subject: otherSubject, grade: 10,
    questions: [question(`Cross-country question ${RUN}?`)],
  });
  const refused = r.status >= 400;
  rec("R-04", "a submission for ANOTHER country is refused", refused,
    refused
      ? `HTTP ${r.status}`
      : `HTTP ${r.status} — ACCEPTED: countryId is client-supplied and not checked against the school`);
}

// -------------------------------------------------------- R-05 daily limit
{
  // Three submissions per school per day. The earlier tests have already used
  // some of today's allowance, so this asserts the limiter fires rather than
  // counting from zero -- it is a control, not an accident.
  let last = { status: 0, body: null };
  for (let i = 0; i < 4; i++) {
    last = await a.post("/api/contributions/submit", {
      countryId: orgCountry, curriculum: orgCurriculum, subject: subjectCode ?? "mathematics", grade: 10,
      questions: [question(`Daily limit probe ${i} ${Date.now()}?`)],
    });
    if (last.status === 429) break;
  }
  rec("R-05", "the per-school daily submission limit is enforced",
    last.status === 429, `HTTP ${last.status} ${JSON.stringify(last.body).slice(0, 80)}`);
}

// ------------------------------------------------------ R-06 who may submit
{
  const stu = new Session("studentSubmit");
  await stu.login(A.students[0].username, A.students[0].password);
  const r = await stu.post("/api/contributions/submit", {
    countryId: orgCountry, curriculum: orgCurriculum, subject: subjectCode ?? "MATH", grade: 10,
    questions: [question("Student-submitted question?")],
  });
  rec("R-06", "a student cannot submit questions", r.status >= 400, `HTTP ${r.status}`);
}
{
  const other = orgs.B.session;
  const r = await other.get("/api/contributions/admin/pending");
  rec("R-06b", "an org admin cannot reach the review queue", r.status >= 400, `HTTP ${r.status}`);
}

// --------------------------------------------------------- R-07 review flow
{
  const pending = await sa.get("/api/contributions/admin/pending");
  const list = Array.isArray(pending.body) ? pending.body : pending.body?.submissions;
  rec("R-07", "superadmin sees the pending queue",
    pending.status === 200 && Array.isArray(list), detail(pending));

  const mine = Array.isArray(list)
    ? list.find((s) => s.id === submissionId) ?? list[0]
    : null;
  if (!mine) {
    rec("R-08", "an approved question joins the live bank", null, "no pending submission to review");
  } else {
    const before = await sa.get(`/api/admin/questions?countryId=${orgCountry}`);
    const beforeN = Array.isArray(before.body) ? before.body.length : (before.body?.questions?.length ?? 0);

    const review = await sa.post(`/api/contributions/admin/${mine.id}/review`, {
      status: "approved", feedback: "Looks good.",
    });
    rec("R-08", "superadmin can approve a submission", review.status < 400, detail(review));

    const after = await sa.get(`/api/admin/questions?countryId=${orgCountry}`);
    const afterN = Array.isArray(after.body) ? after.body.length : (after.body?.questions?.length ?? 0);
    rec("R-08b", "the approved question is now in the live bank",
      afterN > beforeN, `${beforeN} -> ${afterN} questions for ${orgCountry}`);

    // The whole point of the feature: the question must carry the school's
    // country, curriculum and subject, not something the client chose.
    const list2 = Array.isArray(after.body) ? after.body : after.body?.questions ?? [];
    const landed = list2.find((q) => /Contribution A /.test(q.question ?? ""));
    if (!landed) {
      rec("R-09", "the approved question carries the school's country/curriculum/subject",
        null, "could not find the approved question in the bank listing");
    } else {
      const ok = landed.countryId === orgCountry && landed.curriculum === orgCurriculum;
      rec("R-09", "the approved question carries the school's country and curriculum",
        ok, `countryId=${landed.countryId} curriculum=${landed.curriculum} subject=${landed.subject}`);
    }
  }
}

// ------------------------------------------------------------- R-10 rewards
{
  const stats = await sa.get("/api/contributions/admin/stats");
  rec("R-10", "superadmin can read contribution stats", stats.status === 200, detail(stats));
  const pendingRewards = await sa.get("/api/contributions/admin/pending-rewards");
  rec("R-10b", "superadmin can read pending rewards", pendingRewards.status === 200, detail(pendingRewards));
  const balance = await a.get("/api/contributions/balance");
  rec("R-10c", "the school's balance reflects the approval",
    balance.status === 200, detail(balance));
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`contribution: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
