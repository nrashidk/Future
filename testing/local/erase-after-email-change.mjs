/**
 * A STUDENT WHOSE EMAIL A SUPERADMIN ONCE CHANGED COULD NEVER BE ERASED.
 *
 * The email-change route wrote an organization_events row with
 * affected_user_id = the student. That column is a foreign key to users with
 * no cascade, so the student's users row could not be deleted afterwards: the
 * school's "Delete record permanently" answered 500 "Failed to delete
 * organization member", and the student's own erasure was refused as if they
 * were an administrator. Found on production 2026-11-13, on a test student.
 *
 * Every other event about a student deliberately leaves that column empty
 * (see applyRemovalDisposition); this one did not.
 *
 *   E-01  the email change itself still works
 *   E-02  it leaves no activity-log row naming the student
 *   E-03  the school can then erase the student: the users row is GONE
 *   E-04  control: the same change on a school ADMIN is still logged against
 *         them -- without it E-02 passes against a route that logs nothing
 *   E-05  a student named by a row written BEFORE this fix is erasable too
 *
 * Judged by rows, never by status.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
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

const { orgs } = await build();
const A = orgs.A;
const sa = new Session("sa"); await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const admin = new Session("adminA"); await admin.login(A.adminUsername, A.adminPassword);
const tag = Math.random().toString(36).slice(2, 7);

const [s1, s2] = A.students;
const newEmail = `moved.${tag}@futurepath.test`;
const ch = await sa.req("PATCH", `/api/superadmin/users/${s1.userId}/email`, { email: newEmail });
const stored = (await sql(`SELECT email FROM users WHERE id = $1`, [s1.userId]))[0]?.email;
rec("E-01", "a superadmin changes a student's email", ch.status === 200 && stored === newEmail, `HTTP ${ch.status} stored=${stored}`);

const named = await n(`SELECT COUNT(*)::int AS n FROM organization_events WHERE affected_user_id = $1`, [s1.userId]);
rec("E-02", "no activity-log row names the student", named === 0, `rows naming the student: ${named}`);

const del = await admin.req("DELETE", `/api/admin/organizations/${A.orgId}/members/${s1.memberId}`, { disposition: "erase" });
const left = await n(`SELECT COUNT(*)::int AS n FROM users WHERE id = $1`, [s1.userId]);
rec("E-03", "the school can erase that student afterwards", del.status === 200 && left === 0, `HTTP ${del.status} users rows left=${left}`);

const adminRow = (await sql(`SELECT id FROM users WHERE username = $1`, [A.adminUsername]))[0];
const ch2 = await sa.req("PATCH", `/api/superadmin/users/${adminRow.id}/email`, { email: `admin.${tag}@futurepath.test` });
const namedAdmin = await n(
  `SELECT COUNT(*)::int AS n FROM organization_events WHERE affected_user_id = $1 AND event_type = 'user_email_changed'`, [adminRow.id]);
rec("E-04", "control: the same change on a school admin IS logged", ch2.status === 200 && namedAdmin === 1, `HTTP ${ch2.status} rows=${namedAdmin}`);

// A row of the old shape, as production holds one.
await sql(
  `INSERT INTO organization_events (organization_id, event_type, event_description, performed_by, performed_by_role, affected_user_id)
   VALUES ($1, 'user_email_changed', 'Changed account email for a student', $2, 'superadmin', $3)`,
  [A.orgId, (await sql(`SELECT id FROM users WHERE username = 'superadmin'`))[0].id, s2.userId]);
const del2 = await admin.req("DELETE", `/api/admin/organizations/${A.orgId}/members/${s2.memberId}`, { disposition: "erase" });
const left2 = await n(`SELECT COUNT(*)::int AS n FROM users WHERE id = $1`, [s2.userId]);
const kept = await n(`SELECT COUNT(*)::int AS n FROM organization_events WHERE organization_id = $1 AND event_type = 'user_email_changed' AND affected_user_id IS NULL`, [A.orgId]);
rec("E-05", "a student named by an OLD row is erasable, the row kept unnamed", del2.status === 200 && left2 === 0 && kept >= 1,
  `HTTP ${del2.status} users rows left=${left2} unnamed rows kept=${kept}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`); process.exit(1); }
