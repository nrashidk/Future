/**
 * THE LAST TWO UNCOVERED SUPERADMIN WRITES: the quiz-question PATCH and the
 * primary-admin promote.
 *
 * CLAUDE.md listed both as having no references in any suite. Each writes
 * something that matters on a product used by 13–18 year olds:
 *
 *   PATCH /api/superadmin/quiz-questions/:id writes into `quiz_questions`, the
 *   national bank every student's paper is drawn from. It is documented as
 *   "update Arabic translation", and the test that matters is whether that is
 *   all it can do — a route that set the whole body would let one bad payload
 *   rewrite an answer key, silently, in a bank students are being scored
 *   against.
 *
 *   PATCH .../admins/:memberId/promote moves `isPrimaryAdmin` between members
 *   of a school. That is a privilege change, which this repo's rules escalate
 *   by one severity, and the interesting direction is a SCHOOL ADMIN promoting
 *   itself: an org admin is authenticated and is a member of the school whose
 *   id is in the URL, so only the superadmin check stands between it and the
 *   primary role.
 *
 * Both chains carry `isAuthenticated, isSuperadminMiddleware`, which is the
 * honest shape — unlike the two routes `admin-writes.mjs` covers, where the
 * real check lives inside the handler. They are tested anyway, because reading
 * tells you a check is written and not that it runs, and because
 * `isSuperadminMiddleware` recomputes superadmin status from the database on
 * every request (email against SUPERADMIN_EMAILS, or role) — a thing worth
 * proving rather than trusting.
 *
 * JUDGED BY THE ROW, NOT THE STATUS, wherever a status could lie. This repo has
 * produced a 200-with-the-field-silently-dropped twice (the organization PATCH
 * and bulk-reset-passwords), so every denial case below reads the stored value
 * back and compares it.
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

const sa = new Session(`sw-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

/**
 * THE GUEST MUST BE ISSUED A CSRF TOKEN FIRST, or its cases test the wrong
 * guard. The middleware is double-submit: a `csrf_token` cookie echoed in a
 * header on every state-changing request, and a session that has never made a
 * request holds neither — so a bare PATCH is refused **403 CSRF_MISSING**
 * before authentication is ever consulted. The first draft of this suite did
 * that: S-01 asserted 401, got 403 from the CSRF layer, and reported a failure
 * that had nothing to do with authorization, while P-01 "passed" with a 401
 * only because the earlier 403's own Set-Cookie had meanwhile given this
 * session a token. One GET makes both cases test authentication.
 */
const guest = new Session(`sw-guest-${tag}`);
await guest.get("/api/auth/user");

// A school student — the lowest-privileged authenticated caller, and the one
// whose own quiz is drawn from the bank these routes write to.
const studentCreds = A.students?.[0] ?? null;
let student = null;
if (studentCreds?.username && studentCreds?.password) {
  student = new Session(`sw-student-${tag}`);
  await student.login(studentCreds.username, studentCreds.password);
}

// =====================================================================
// PART 1 — PATCH /api/superadmin/quiz-questions/:id
// =====================================================================

/**
 * A real row in the bank, created through the product's own route so the
 * fixture is not a hand-built row that the route might treat differently.
 * Its correctAnswer is the field S-07 watches.
 */
// Payload shape taken from admin-writes.mjs, which proved it: `grade` is a
// NUMBER here, not the Latin-digit string the quiz matches on, and the schema
// also requires topic and cognitiveLevel.
const created = await sa.post("/api/admin/questions", {
  question: `Which of these is a prime number? (sw-${tag})`,
  questionAr: `أي من هذه الأعداد أولي؟ (sw-${tag})`,
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
if (created.status !== 201 && created.status !== 200) {
  console.error(`REFUSING TO RUN: could not create a question to edit — ` +
    `HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`);
  process.exit(2);
}
const qid = created.body?.id ?? created.body?.question?.id;
if (!qid) {
  console.error(`REFUSING TO RUN: no question id in ${JSON.stringify(created.body).slice(0, 200)}`);
  process.exit(2);
}

const row = async () => (await sql(
  `SELECT question, question_ar, correct_answer, subject, grade, country_id, curriculum
     FROM quiz_questions WHERE id = $1`, [qid]))[0];

const baseline = await row();

// ----------------------------------------------------------------- S-01
{
  const r = await guest.patch(`/api/superadmin/quiz-questions/${qid}`, { questionAr: "اختراق" });
  const after = await row();
  rec("S-01", "guest cannot edit a bank question", r.status === 401 && after.question_ar === baseline.question_ar,
    `HTTP ${r.status} ar unchanged=${after.question_ar === baseline.question_ar}`);
}

// ----------------------------------------------------------------- S-02
// THE ONE THAT MATTERS MOST. A school student writing into the bank their own
// paper is drawn from. admin-writes.mjs proved a student CAN do this if
// isSuperadminOnly is dropped from the question-create route; this is the same
// question for the edit route.
if (student) {
  const r = await student.patch(`/api/superadmin/quiz-questions/${qid}`, { questionAr: `طالب كتب هذا ${tag}` });
  const after = await row();
  rec("S-02", "school STUDENT cannot edit a bank question", r.status === 403 && after.question_ar === baseline.question_ar,
    `HTTP ${r.status} ar unchanged=${after.question_ar === baseline.question_ar}`);
} else {
  rec("S-02", "school STUDENT cannot edit a bank question", false, "no student session — fixture did not enrol one");
}

// ----------------------------------------------------------------- S-03
{
  const r = await A.session.patch(`/api/superadmin/quiz-questions/${qid}`, { questionAr: `مدير مدرسة ${tag}` });
  const after = await row();
  rec("S-03", "org admin cannot edit a bank question", r.status === 403 && after.question_ar === baseline.question_ar,
    `HTTP ${r.status} ar unchanged=${after.question_ar === baseline.question_ar}`);
}

// ----------------------------------------------------------------- S-04
// THE POSITIVE CONTROL. Without it, a route that refused everyone would pass
// every case above while the feature was broken for its only intended user.
const newAr = `ترجمة محدثة ${tag}`;
{
  const r = await sa.patch(`/api/superadmin/quiz-questions/${qid}`, { questionAr: newAr });
  const after = await row();
  rec("S-04", "superadmin CAN edit, and the row actually changes",
    r.status === 200 && after.question_ar === newAr && after.question_ar !== baseline.question_ar,
    `HTTP ${r.status} stored="${String(after.question_ar).slice(0, 28)}"`);
}

// ----------------------------------------------------------------- S-05
// A missing field must be a 400 AND leave the row alone. Asserting only the
// status would let a route that validated after writing pass.
{
  const r = await sa.patch(`/api/superadmin/quiz-questions/${qid}`, { questionAr: 42 });
  const after = await row();
  rec("S-05", "non-string questionAr refused, row untouched",
    r.status === 400 && after.question_ar === newAr,
    `HTTP ${r.status} still="${String(after.question_ar).slice(0, 28)}"`);
}

// ----------------------------------------------------------------- S-06
// A pass on 404 is only a pass if it IS a 404 and not the SPA catch-all
// answering 200 with HTML.
{
  const r = await sa.patch(`/api/superadmin/quiz-questions/00000000-0000-0000-0000-000000000000`, { questionAr: "x" });
  rec("S-06", "unknown id is a JSON 404, not SPA HTML",
    r.status === 404 && !isHtml(r.body) && typeof r.body?.message === "string",
    `HTTP ${r.status} body=${isHtml(r.body) ? "HTML" : JSON.stringify(r.body).slice(0, 48)}`);
}

// ----------------------------------------------------------------- S-07
// THE SCOPE TEST, and the reason this route is worth covering at all.
// `questionAr` is the only field the handler sets. Everything else sent
// alongside it must be ignored — above all `correctAnswer`, because a bank
// whose answer key can be rewritten through a translation endpoint scores
// students against the wrong answers with nothing in the response to say so.
{
  const r = await sa.patch(`/api/superadmin/quiz-questions/${qid}`, {
    questionAr: `نطاق ${tag}`,
    correctAnswer: "15",
    question: "REWRITTEN BY THE TRANSLATION ROUTE",
    subject: "Physics",
    grade: "12",
    countryId: "ksa",
    curriculum: "British",
  });
  const after = await row();
  const untouched =
    after.correct_answer === baseline.correct_answer &&
    after.question === baseline.question &&
    after.subject === baseline.subject &&
    after.grade === baseline.grade &&
    after.country_id === baseline.country_id &&
    after.curriculum === baseline.curriculum;
  rec("S-07", "ONLY questionAr is writable — answer key and cell intact",
    r.status === 200 && after.question_ar === `نطاق ${tag}` && untouched,
    `HTTP ${r.status} ar=changed answer=${after.correct_answer} subject=${after.subject} grade=${after.grade}`);
}

// =====================================================================
// PART 2 — PATCH /api/superadmin/organizations/:orgId/admins/:memberId/promote
// =====================================================================

/**
 * A SECOND admin in school A, because promote requires a member whose role is
 * already "admin" and the school is created with exactly one (its primary).
 * With only that one, every promote would 404 on "admin not found" and the
 * suite would pass while asserting nothing — this repo's "a pass on 404 is a
 * pass on nothing" family.
 */
const second = await sa.post(`/api/superadmin/organizations/${A.orgId}/admins`, {
  firstName: "Second",
  lastName: `Admin${tag}`,
  email: `second.admin.${tag}@futurepath.test`,
  phone: "+971500000001",
});
if (second.status !== 201 && second.status !== 200) {
  console.error(`REFUSING TO RUN: could not add a second admin — HTTP ${second.status} ` +
    JSON.stringify(second.body).slice(0, 200));
  process.exit(2);
}

const membersOf = (orgId) => sql(
  `SELECT id, user_id, role, is_primary_admin FROM organization_members
    WHERE organization_id = $1 ORDER BY role, id`, [orgId]);

const aMembers = await membersOf(A.orgId);
const aAdmins = aMembers.filter((m) => m.role === "admin");
const aStudents = aMembers.filter((m) => m.role === "student");
const primaryBefore = aAdmins.find((m) => m.is_primary_admin);
const challenger = aAdmins.find((m) => !m.is_primary_admin);

if (!primaryBefore || !challenger) {
  console.error(`REFUSING TO RUN: school A has ${aAdmins.length} admin(s), ` +
    `primary=${!!primaryBefore} challenger=${!!challenger} — the promote cases need both.`);
  process.exit(2);
}

const primaryIdOf = async (orgId) =>
  (await membersOf(orgId)).filter((m) => m.is_primary_admin).map((m) => m.id);

// ----------------------------------------------------------------- P-01
{
  const r = await guest.patch(`/api/superadmin/organizations/${A.orgId}/admins/${challenger.id}/promote`);
  const now = await primaryIdOf(A.orgId);
  rec("P-01", "guest cannot promote", r.status === 401 && now.length === 1 && now[0] === primaryBefore.id,
    `HTTP ${r.status} primary=${now[0] === primaryBefore.id ? "unchanged" : "MOVED"}`);
}

// ----------------------------------------------------------------- P-02
// THE PRIVILEGE-ESCALATION CASE. The org admin of THIS VERY SCHOOL asking to
// make its own second admin primary. Authenticated, a genuine member, correct
// orgId in the URL: only the superadmin check refuses it.
{
  const r = await A.session.patch(`/api/superadmin/organizations/${A.orgId}/admins/${challenger.id}/promote`);
  const now = await primaryIdOf(A.orgId);
  rec("P-02", "org admin of that school cannot promote within it",
    r.status === 403 && now.length === 1 && now[0] === primaryBefore.id,
    `HTTP ${r.status} primary=${now[0] === primaryBefore.id ? "unchanged" : "MOVED"}`);
}

// ----------------------------------------------------------------- P-03
// CROSS-TENANT. School B's own primary member id, sent with school A's orgId.
// The handler looks memberId up inside A's member list, so this must 404 — and
// B's primary must be exactly where it was.
{
  const bMembers = await membersOf(B.orgId);
  const bPrimary = bMembers.find((m) => m.is_primary_admin);
  const r = await sa.patch(`/api/superadmin/organizations/${A.orgId}/admins/${bPrimary.id}/promote`);
  const bNow = await primaryIdOf(B.orgId);
  const aNow = await primaryIdOf(A.orgId);
  rec("P-03", "a member of ANOTHER school cannot be promoted into this one",
    r.status === 404 && bNow[0] === bPrimary.id && aNow[0] === primaryBefore.id,
    `HTTP ${r.status} B.primary=${bNow[0] === bPrimary.id ? "unchanged" : "MOVED"} A.primary=${aNow[0] === primaryBefore.id ? "unchanged" : "MOVED"}`);
}

// ----------------------------------------------------------------- P-04
// A STUDENT member of the same school. `role === "admin"` is the filter; a
// student promoted to primary admin would hold a school's administration.
{
  const victim = aStudents[0];
  const r = await sa.patch(`/api/superadmin/organizations/${A.orgId}/admins/${victim.id}/promote`);
  const after = (await membersOf(A.orgId)).find((m) => m.id === victim.id);
  rec("P-04", "a STUDENT member cannot be promoted to primary admin",
    r.status === 404 && after.is_primary_admin === false && after.role === "student",
    `HTTP ${r.status} primary=${after.is_primary_admin} role=${after.role}`);
}

// ----------------------------------------------------------------- P-05
// THE POSITIVE CONTROL, asserting BOTH halves: the new primary is set and the
// old one is demoted. Checking only the first would pass a route that left two
// primaries behind, which is a school with two people holding one role.
{
  const r = await sa.patch(`/api/superadmin/organizations/${A.orgId}/admins/${challenger.id}/promote`);
  const after = await membersOf(A.orgId);
  const primaries = after.filter((m) => m.is_primary_admin);
  rec("P-05", "superadmin promotes: exactly one primary, and it moved",
    r.status === 200 && primaries.length === 1 && primaries[0].id === challenger.id,
    `HTTP ${r.status} primaries=${primaries.length} moved=${primaries[0]?.id === challenger.id}`);
}

// ----------------------------------------------------------------- P-07
// THE SHARPER HALF OF THE SAME DEFECT. `DELETE .../admins/:memberId` refuses
// to remove a primary admin — "Transfer primary admin role first" — by reading
// `adminToRemove.isPrimaryAdmin` off the very same query. While that column was
// missing from the select list the condition was always false, so the guard
// could not fire and a school's primary admin was deletable. P-05 proves the
// demote; this proves the protection. Judged by whether the row is still there,
// because a 400 could be any validation refusal.
{
  // After P-05 the challenger holds primary. Attempt to delete it.
  const r = await sa.req("DELETE", `/api/superadmin/organizations/${A.orgId}/admins/${challenger.id}`);
  const still = (await membersOf(A.orgId)).find((m) => m.id === challenger.id);
  rec("P-07", "the primary admin cannot be deleted while primary",
    r.status === 400 && !!still && still.is_primary_admin === true,
    `HTTP ${r.status} row=${still ? "present" : "GONE"} primary=${still?.is_primary_admin}`);
}

// ----------------------------------------------------------------- P-08
// THE CONTROL for P-07: a NON-primary admin is removable. Without it, a route
// that refused every deletion would pass P-07 while the feature was broken.
{
  // Guarded rather than asserted blind: when the demote is broken BOTH admins
  // read as primary, so there is no non-primary row to delete and a bare
  // `.id` here throws — taking the whole run's results down with it instead of
  // reporting one failure. A missing row IS the failure, so it is recorded as
  // one.
  const nonPrimary = (await membersOf(A.orgId)).find((m) => m.role === "admin" && !m.is_primary_admin);
  if (!nonPrimary) {
    rec("P-08", "a non-primary admin IS removable", false,
      "no non-primary admin exists — the demote in P-05 did not happen");
  } else {
    const r = await sa.req("DELETE", `/api/superadmin/organizations/${A.orgId}/admins/${nonPrimary.id}`);
    const gone = !(await membersOf(A.orgId)).some((m) => m.id === nonPrimary.id);
    rec("P-08", "a non-primary admin IS removable", r.status === 200 && gone,
      `HTTP ${r.status} removed=${gone}`);
  }
}

// ----------------------------------------------------------------- P-06
// THE AUDIT RECORD. A privilege change on a minors' product with no trail is
// its own finding. Asserts the event names the school, the type, who did it and
// WHO IT HAPPENED TO — an event missing affectedUserId cannot answer "who holds
// this school now" after the fact.
{
  const ev = await sql(
    `SELECT event_type, performed_by_role, affected_user_id, new_value
       FROM organization_events
      WHERE organization_id = $1 AND event_type = 'admin_promoted'
      ORDER BY created_at DESC LIMIT 1`, [A.orgId]);
  const ok = ev.length === 1
    && ev[0].performed_by_role === "superadmin"
    && ev[0].affected_user_id === challenger.user_id;
  rec("P-06", "the promotion is audited, naming who it happened to", ok,
    ev.length ? `type=${ev[0].event_type} by=${ev[0].performed_by_role} affected=${ev[0].affected_user_id === challenger.user_id}` : "no event row");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
