/**
 * A SCHOOL ADMIN ACTS ON STUDENTS, NOT ON OTHER ADMINS; A REMOVED ADMIN IS OUT
 * (2026-11-24, found by an independent review before launch).
 *
 * The roster routes (reset-password, bulk reset, PATCH, DELETE, bulk-delete)
 * checked that a member belonged to the school and never that it was a
 * STUDENT, and the members list hands out the admins' member ids. So a second
 * admin could reset the primary admin's password and be shown it: a takeover.
 * Judged by whether the victim's ORIGINAL password still signs in, never by
 * status alone (bulk reset answers 200 whatever it refused).
 *
 * And a removed admin kept the school: getOrganizationByAdminUserId matched
 * organizations.admin_user_id first, and neither promote nor remove ever moved
 * that column, so the person the superadmin removed still resolved to the
 * school on every school-scoped route.
 *
 *   A-01  THE CASE THAT MATTERS: a second admin cannot reset the primary
 *         admin's password; the primary's own password still signs in
 *   A-02  ...nor rename them through PATCH
 *   A-03  ...nor detach them through DELETE
 *   A-04  ...nor include them in a bulk reset (judged by sign-in)
 *   A-05  ...nor include them in a bulk delete (membership still there)
 *   A-06  control: the second admin CAN still reset a student's password,
 *         and the new password signs in (without it A-01..A-05 pass against
 *         a roster that refuses everything)
 *   A-07  THE OTHER CASE THAT MATTERS: promote B, remove A; A's session can no
 *         longer read the roster
 *   A-08  control: B, now primary, can
 *   A-09  promote moved organizations.admin_user_id to B
 */
import { build, Session } from "./fixtures.mjs";

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return await c.query(text, params); } finally { await c.end(); }
}
const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(64)} ${note}`);
};
async function canSignIn(username, password) {
  const s = new Session("probe");
  const r = await s.post("/api/login/username", { username, password });
  return r.status === 200;
}

const { sa, orgs } = await build();
const A = orgs.A;
const org = A.orgId;

// A second admin for school A, made the way the superadmin's dialog makes one.
const added = await sa.post(`/api/superadmin/organizations/${org}/admins`, { firstName: "Second", lastName: "Admin" });
if (added.status !== 201) throw new Error(`could not add a second admin: HTTP ${added.status} ${JSON.stringify(added.body).slice(0, 200)}`);
const second = { username: added.body.credentials.username, password: added.body.credentials.password, memberId: added.body.member.id, userId: added.body.user.id };
const s2 = new Session("secondAdmin");
await s2.login(second.username, second.password);
await s2.get("/api/auth/user");

const members = (await s2.get(`/api/admin/organizations/${org}/members`)).body;
const primary = Array.isArray(members) ? members.find((m) => m.role === "admin" && m.isPrimaryAdmin) : null;
if (!primary) throw new Error(`no primary admin in the roster: ${JSON.stringify(members).slice(0, 300)}`);
const student = A.students[0];

// ------------------------------------------------------------------ A-01
{
  const r = await s2.post(`/api/admin/organizations/${org}/members/${primary.id}/reset-password`, {});
  const still = await canSignIn(A.adminUsername, A.adminPassword);
  rec("A-01", "second admin cannot reset the primary admin's password",
    r.status === 403 && !r.body?.password && still, `HTTP ${r.status} passwordReturned=${!!r.body?.password} primarySignsIn=${still}`);
}
// ------------------------------------------------------------------ A-02
{
  const r = await s2.patch(`/api/admin/organizations/${org}/members/${primary.id}`, { fullName: "Hijacked Name" });
  const name = (await sql(`SELECT first_name FROM users WHERE id = $1`, [primary.userId])).rows[0]?.first_name;
  await pause();
  rec("A-02", "...nor rename them", r.status === 403 && name !== "Hijacked", `HTTP ${r.status} first_name=${name}`);
}
// ------------------------------------------------------------------ A-03
{
  const r = await s2.del(`/api/admin/organizations/${org}/members/${primary.id}`, { disposition: "detach" });
  const n = (await sql(`SELECT COUNT(*)::int AS n FROM organization_members WHERE id = $1`, [primary.id])).rows[0].n;
  await pause();
  rec("A-03", "...nor detach them", r.status === 403 && n === 1, `HTTP ${r.status} membership=${n}`);
}
// ------------------------------------------------------------------ A-04
{
  const r = await s2.post(`/api/admin/organizations/${org}/members/bulk-reset-passwords`, { memberIds: [primary.id] });
  const still = await canSignIn(A.adminUsername, A.adminPassword);
  rec("A-04", "...nor bulk-reset them (judged by sign-in)", still, `HTTP ${r.status} primarySignsIn=${still}`);
}
// ------------------------------------------------------------------ A-05
{
  const r = await s2.post(`/api/admin/organizations/${org}/members/bulk-delete`, { memberIds: [primary.id], disposition: "detach" });
  const n = (await sql(`SELECT COUNT(*)::int AS n FROM organization_members WHERE id = $1`, [primary.id])).rows[0].n;
  await pause();
  rec("A-05", "...nor bulk-delete them", n === 1, `HTTP ${r.status} membership=${n}`);
}
// ------------------------------------------------------------------ A-06
{
  const r = await s2.post(`/api/admin/organizations/${org}/members/${student.memberId}/reset-password`, {});
  const ok = r.status === 200 && r.body?.password ? await canSignIn(r.body.username, r.body.password) : false;
  rec("A-06", "control: a student's password can still be reset", ok, `HTTP ${r.status} newPasswordSignsIn=${ok}`);
}
// ------------------------------------------------------------------ A-07..A-09
// School B, so nothing above has touched its admins. The admin to be removed
// is signed in BEFORE the removal, as a real one would be.
{
  const B = orgs.B;
  const bOld = new Session("adminToRemove");
  await bOld.login(B.adminUsername, B.adminPassword);
  const before = await bOld.get(`/api/admin/organizations/${B.orgId}/members`);
  const oldPrimary = Array.isArray(before.body) ? before.body.find((m) => m.role === "admin" && m.isPrimaryAdmin) : null;
  const add = await sa.post(`/api/superadmin/organizations/${B.orgId}/admins`, { firstName: "Next", lastName: "Primary" });
  const nb = { username: add.body.credentials.username, password: add.body.credentials.password, memberId: add.body.member.id, userId: add.body.user.id };
  const p = await sa.patch(`/api/superadmin/organizations/${B.orgId}/admins/${nb.memberId}/promote`, {});
  const adminCol = (await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [B.orgId])).rows[0]?.admin_user_id;
  await pause();
  const rm = await sa.del(`/api/superadmin/organizations/${B.orgId}/admins/${oldPrimary?.id}`);
  const after = await bOld.get(`/api/admin/organizations/${B.orgId}/members`);
  const fresh = new Session("removedAdminAgain");
  await fresh.login(B.adminUsername, B.adminPassword);
  const after2 = await fresh.get(`/api/admin/organizations/${B.orgId}/members`);
  rec("A-07", "a removed admin can no longer read the roster",
    before.status === 200 && rm.status === 200 && after.status === 403 && after2.status === 403,
    `before=${before.status} promote=${p.status} remove=${rm.status} sameSession=${after.status} newSession=${after2.status}`);
  const sNew = new Session("newPrimary");
  await sNew.login(nb.username, nb.password);
  const rB = await sNew.get(`/api/admin/organizations/${B.orgId}/members`);
  rec("A-08", "control: the promoted admin can", rB.status === 200 && Array.isArray(rB.body), `HTTP ${rB.status}`);
  rec("A-09", "promote moved organizations.admin_user_id", adminCol === nb.userId, `admin_user_id is ${adminCol === nb.userId ? "the promoted admin" : adminCol === oldPrimary?.userId ? "STILL the old primary" : adminCol}`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\nadmin-boundaries: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
