/**
 * REPEATING A GRADE IS THE SCHOOL'S DECISION.
 *
 * Owner's decision, 2026-11-12, after the student walk on production: a
 * student with a finished report could start another, and another, each
 * spending one of the school's licences, because the licence belongs to the
 * pool and nothing else limited one student. Now a school student who already
 * has a CHARGED report for the grade they are in is refused a new assessment
 * unless their school has allowed one repeat — and that permission is spent
 * by starting it.
 *
 * Judged by ROWS, not statuses: how many assessments the student has, and
 * what repeat_allowed says afterwards.
 *
 * The charge is planted in SQL. Generating a real report needs Anthropic and
 * there is no network here; what this rule reads is the LEDGER row, so a
 * ledger row is the honest fixture.
 *
 *   node testing/local/repeat-grade.mjs      (fresh .pgdata, up.ts running)
 */
import { readFileSync } from "node:fs";
import { build, Session } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${id.padEnd(5)} ${what.padEnd(66)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return await c.query(text, params); } finally { await c.end(); }
}
const pause = (ms = 300) => new Promise((r) => setTimeout(r, ms));

const { orgs } = await build();
const A = orgs.A, B = orgs.B;
const s1 = A.students[0];
const payload = {
  favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["technology"],
  assessmentType: "basic", name: "x", grade: "10", gender: "female", countryId: "uae", curriculum: "MOE National",
};
const stu = new Session("repeatStudent");
await stu.login(s1.username, s1.password);

const member = (await sql(`SELECT m.id, m.user_id, m.grade, m.repeat_allowed FROM organization_members m JOIN users u ON u.id = m.user_id WHERE u.username = $1`, [s1.username])).rows[0];
const countMine = async () => (await sql(`SELECT COUNT(*)::int AS n FROM assessments WHERE user_id = $1`, [member.user_id])).rows[0].n;
const flag = async () => (await sql(`SELECT repeat_allowed FROM organization_members WHERE id = $1`, [member.id])).rows[0].repeat_allowed;

// ------------------------------------------------------------------ R-00
// The migration file itself, DOWN then UP in one call: schema-push builds the
// column from drizzle and never runs the .sql, so a typo in it would first
// run at production boot.
{
  const up = readFileSync(new URL("../../server/migrations/040_member_repeat_allowed.sql", import.meta.url), "utf8");
  let err = null;
  try { await sql(`ALTER TABLE organization_members DROP COLUMN IF EXISTS repeat_allowed;\n${up}`); } catch (e) { err = e.message; }
  await pause();
  const col = (await sql(`SELECT column_default, is_nullable FROM information_schema.columns WHERE table_name = 'organization_members' AND column_name = 'repeat_allowed'`)).rows[0];
  rec("R-00", "migration 040 runs after its own DOWN; column is NOT NULL DEFAULT false",
    !err && col?.is_nullable === "NO" && /false/.test(col?.column_default ?? ""), err ?? JSON.stringify(col));
}

// ------------------------------------------------------------------ R-01
// CONTROL: with no report yet, a student starts an assessment freely — or
// everything below passes against a route that refuses every student.
await pause();
const first = await stu.post("/api/assessments", payload);
rec("R-01", "control: a student with no report starts an assessment",
  typeof first.body?.id === "string" && (await countMine()) === 1, `HTTP ${first.status} rows=${await countMine()}`);

// The report is "generated and charged": one ledger row at the student's grade.
await sql(
  `INSERT INTO license_consumptions (pool_owner_type, organization_id, student_user_id, assessment_id, grade, currency)
   VALUES ('organization', $1, $2, $3, $4, 'paid');
   UPDATE assessments SET is_completed = true WHERE id = $3;`.replace(/\$1/g, `'${A.orgId}'`).replace(/\$2/g, `'${member.user_id}'`).replace(/\$3/g, `'${first.body.id}'`).replace(/\$4/g, `'${member.grade}'`));
await pause();

// ------------------------------------------------------------------ R-02, R-03
{
  const r = await stu.post("/api/assessments", payload);
  rec("R-02", "a second assessment at the SAME grade is refused",
    r.status === 403 && r.body?.code === "REPEAT_NOT_ALLOWED" && (await countMine()) === 1,
    `HTTP ${r.status} code=${r.body?.code ?? "-"} rows=${await countMine()}`);
  const me = await stu.get("/api/licenses/me");
  rec("R-03", "and the balance route says so before the student answers anything",
    me.body?.sameGradeAlreadyCharged === true && me.body?.repeatBlocked === true,
    `charged=${me.body?.sameGradeAlreadyCharged} blocked=${me.body?.repeatBlocked}`);
}

// ------------------------------------------------------------------ R-04
// Who may allow it: not the student, not another school.
{
  const self = await stu.post(`/api/admin/organizations/${A.orgId}/members/${member.id}/repeat`, { allowed: true });
  const other = await B.session.post(`/api/admin/organizations/${A.orgId}/members/${member.id}/repeat`, { allowed: true });
  const viaOwn = await B.session.post(`/api/admin/organizations/${B.orgId}/members/${member.id}/repeat`, { allowed: true });
  rec("R-04", "the student, another school, and another school via its OWN id are all refused",
    self.status === 403 && other.status === 403 && viaOwn.status === 403 && (await flag()) === false,
    `student=${self.status} otherSchool=${other.status} viaOwnOrg=${viaOwn.status} flag=${await flag()}`);
}

// ------------------------------------------------------------------ R-05
{
  const r = await A.session.post(`/api/admin/organizations/${A.orgId}/members/${member.id}/repeat`, { allowed: true });
  const list = await A.session.get(`/api/admin/organizations/${A.orgId}/members`);
  const row = (Array.isArray(list.body) ? list.body : list.body?.members ?? []).find((m) => m.id === member.id);
  const me = await stu.get("/api/licenses/me");
  rec("R-05", "the student's own school allows it; the roster and the balance both show it",
    r.status === 200 && (await flag()) === true && row?.repeatAllowed === true && me.body?.repeatBlocked === false,
    `HTTP ${r.status} flag=${await flag()} roster=${row?.repeatAllowed} blocked=${me.body?.repeatBlocked}`);
}

// ------------------------------------------------------------------ R-06, R-07
{
  const r = await stu.post("/api/assessments", payload);
  rec("R-06", "the allowed repeat starts, and starting it SPENDS the permission",
    typeof r.body?.id === "string" && (await countMine()) === 2 && (await flag()) === false,
    `HTTP ${r.status} rows=${await countMine()} flag=${await flag()}`);
  const again = await stu.post("/api/assessments", payload);
  rec("R-07", "so a third is refused: one permission is one attempt",
    again.status === 403 && again.body?.code === "REPEAT_NOT_ALLOWED" && (await countMine()) === 2,
    `HTTP ${again.status} code=${again.body?.code ?? "-"} rows=${await countMine()}`);
}

// ------------------------------------------------------------------ R-08
// CONTROL for the whole rule: a NEW grade is not a repeat. Without this the
// suite passes against "one assessment per student for life", which is the
// cap the pool was built to remove.
{
  await sql(`UPDATE organization_members SET grade = 'grade11' WHERE id = $1`, [member.id]);
  await pause();
  const r = await stu.post("/api/assessments", { ...payload, grade: "11" });
  rec("R-08", "control: after moving up a grade the student starts one with no permission",
    typeof r.body?.id === "string" && (await countMine()) === 3, `HTTP ${r.status} rows=${await countMine()}`);
}

// ------------------------------------------------------------------ R-09
{
  const adminRow = (await sql(`SELECT id FROM organization_members WHERE organization_id = $1 AND role = 'admin' LIMIT 1`, [A.orgId])).rows[0];
  const r = await A.session.post(`/api/admin/organizations/${A.orgId}/members/${adminRow.id}/repeat`, { allowed: true });
  const bad = await A.session.post(`/api/admin/organizations/${A.orgId}/members/${member.id}/repeat`, { allowed: "yes" });
  rec("R-09", "an administrator's row is refused, and so is a non-boolean",
    r.status === 400 && r.body?.code === "NOT_A_STUDENT" && bad.status === 400 && bad.body?.code === "INVALID_ALLOWED",
    `admin=${r.status}/${r.body?.code} nonBoolean=${bad.status}/${bad.body?.code}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\nrepeat-grade: ${results.length - failed.length} passed, ${failed.length} failed`);
if (failed.length) { console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`); process.exit(1); }
