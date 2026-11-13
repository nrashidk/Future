/**
 * A STUDENT WITH A CHARGED REPORT COULD NOT BE ERASED AT ALL.
 *
 * license_consumptions.student_user_id and .assessment_id were NOT NULL
 * foreign keys with no cascade, and eraseUserData never touched the table. So
 * from migration 029 on, deleting the assessment of any student whose report
 * had been generated hit the foreign key: the school's "Delete record
 * permanently" answered 500, and so did every other erasure path. Found on
 * production 2026-11-13.
 *
 * The row is the school's accounting record and must SURVIVE -- used licences
 * are counted from it, so deleting it would refund the licence.
 *
 *   C-00  migration 043 runs after its own DOWN; both columns nullable
 *   C-01  control: a student with NO charge is erased
 *   C-02  a student WITH a charged report is erased: user and assessment gone
 *   C-03  the ledger row is still there, pointing at nobody
 *   C-04  the school's used-licence count did not move
 *   C-05  an individual's OWN charge rows go with the account
 *
 * Judged by rows, never by status. C-01 exists because C-02 failing on its own
 * would also be what "erasure is broken for everyone" looks like.
 */
import { readFileSync } from "node:fs";
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(62)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await client.connect();
  try { return (await client.query(text, params)).rows; } finally { await client.end(); }
}
const n = async (q, p) => Number((await sql(q, p))[0].n);
const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));

const { orgs } = await build();
const A = orgs.A;
const sa = new Session("sa"); await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const admin = new Session("adminA"); await admin.login(A.adminUsername, A.adminPassword);
const [s1, s2] = A.students;
const tag = Math.random().toString(36).slice(2, 7);

// ------------------------------------------------------------------ C-00
{
  const up = readFileSync(new URL("../../server/migrations/043_consumption_survives_erasure.sql", import.meta.url), "utf8");
  let err = null;
  try {
    await sql(`ALTER TABLE license_consumptions ALTER COLUMN student_user_id SET NOT NULL;
               ALTER TABLE license_consumptions ALTER COLUMN assessment_id SET NOT NULL;\n${up}`);
  } catch (e) { err = e.message; }
  await pause();
  const cols = await sql(`SELECT column_name, is_nullable FROM information_schema.columns
                           WHERE table_name = 'license_consumptions' AND column_name IN ('student_user_id','assessment_id') ORDER BY 1`);
  rec("C-00", "migration 043 runs after its own DOWN; both columns nullable",
    !err && cols.length === 2 && cols.every((c) => c.is_nullable === "YES"), err ?? JSON.stringify(cols));
}

// ------------------------------------------------------------------ C-01
await pause();
{
  const del = await admin.req("DELETE", `/api/admin/organizations/${A.orgId}/members/${s2.memberId}`, { disposition: "erase" });
  const left = await n(`SELECT COUNT(*)::int AS n FROM users WHERE id = $1`, [s2.userId]);
  rec("C-01", "control: a student with no charge is erased", del.status === 200 && left === 0, `HTTP ${del.status} users rows left=${left}`);
}

// A real assessment for s1, then its charge planted on the ledger (no
// Anthropic offline, so generation cannot write it).
await pause();
const stu = new Session("charged"); await stu.login(s1.username, s1.password);
const a = await stu.post("/api/assessments", {
  favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["technology"],
  assessmentType: "basic", name: "x", grade: "10", gender: "female", countryId: "uae", curriculum: "MOE National",
});
await pause();
await sql(`INSERT INTO license_consumptions (pool_owner_type, organization_id, student_user_id, assessment_id, grade, currency)
           VALUES ('organization', '${A.orgId}', '${s1.userId}', '${a.body.id}', '10', 'paid');
           UPDATE assessments SET is_completed = true WHERE id = '${a.body.id}';`);
await pause();
const usedBefore = await n(`SELECT COUNT(*)::int AS n FROM license_consumptions WHERE organization_id = $1`, [A.orgId]);

// ------------------------------------------------------------------ C-02..04
{
  const del = await admin.req("DELETE", `/api/admin/organizations/${A.orgId}/members/${s1.memberId}`, { disposition: "erase" });
  await pause();
  const userLeft = await n(`SELECT COUNT(*)::int AS n FROM users WHERE id = $1`, [s1.userId]);
  const asmtLeft = await n(`SELECT COUNT(*)::int AS n FROM assessments WHERE id = $1`, [a.body.id]);
  rec("C-02", "a student with a charged report is erased", del.status === 200 && userLeft === 0 && asmtLeft === 0,
    `HTTP ${del.status} users=${userLeft} assessments=${asmtLeft}`);

  const rows = await sql(`SELECT student_user_id, assessment_id, grade, currency FROM license_consumptions WHERE organization_id = $1`, [A.orgId]);
  const orphan = rows.filter((r) => r.student_user_id === null && r.assessment_id === null);
  rec("C-03", "the ledger row is still there, pointing at nobody",
    orphan.length === 1 && orphan[0].grade === "10" && orphan[0].currency === "paid" && !rows.some((r) => r.student_user_id === s1.userId),
    `rows=${rows.length} unnamed=${orphan.length} ${JSON.stringify(orphan[0] ?? null)}`);

  const usedAfter = await n(`SELECT COUNT(*)::int AS n FROM license_consumptions WHERE organization_id = $1`, [A.orgId]);
  const org = (await sql(`SELECT used_licenses FROM organizations WHERE id = $1`, [A.orgId]))[0];
  rec("C-04", "the school's spend did not move (no licence handed back)", usedBefore === 1 && usedAfter === 1,
    `ledger rows ${usedBefore} -> ${usedAfter}, organizations.used_licenses=${org.used_licenses}`);
}

// ------------------------------------------------------------------ C-05
await pause();
{
  const c = await sa.post("/api/superadmin/students", { firstName: "Own", lastName: "Pool", email: `own.${tag}@futurepath.test` });
  const uid = c.body.user.id;
  await pause();
  // No assessment behind it: the row is what is under test, and after 043 a
  // charge row may stand without one.
  await sql(`INSERT INTO license_consumptions (pool_owner_type, guardian_user_id, student_user_id, grade, currency)
             VALUES ('user', '${uid}', '${uid}', '11', 'paid')`);
  await pause();
  const del = await sa.req("DELETE", `/api/superadmin/users/${uid}`, { confirmEmail: `own.${tag}@futurepath.test` });
  await pause();
  const userLeft = await n(`SELECT COUNT(*)::int AS n FROM users WHERE id = $1`, [uid]);
  const rowsLeft = await n(`SELECT COUNT(*)::int AS n FROM license_consumptions WHERE guardian_user_id = $1 OR student_user_id = $1`, [uid]);
  rec("C-05", "an individual's own charge rows go with the account", del.status === 200 && userLeft === 0 && rowsLeft === 0,
    `HTTP ${del.status} users=${userLeft} ledger rows=${rowsLeft}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`); process.exit(1); }
