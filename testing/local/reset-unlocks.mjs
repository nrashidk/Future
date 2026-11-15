/**
 * A NEW PASSWORD UNLOCKS THE ACCOUNT (2026-11-15).
 *
 * Five wrong guesses lock an account for 15 minutes (auth.ts) and only a
 * successful login cleared it, so a reset given to a locked-out person was
 * refused as "temporarily locked" -- the owner reset a school admin from the
 * Users tab and could not sign in with the new password. Judged by signing in.
 *
 *   U-01  control: five wrong guesses lock the account; the RIGHT password is
 *         then refused (without this U-02 passes against no lockout at all)
 *   U-02  THE CASE THAT MATTERS: a superadmin reset of the locked account
 *         signs in at once with the new password
 *   U-03  the same through the school's own reset of a locked student
 *   U-04  control: an account that is not locked still locks after a reset
 *         and five more wrong guesses (the reset clears, it does not exempt)
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(64)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}
// A fresh Session per attempt: each has its own client IP, so the per-IP
// limiter never answers and every refusal comes from the account lockout.
async function login(username, password) {
  const s = new Session("try");
  const r = await s.post("/api/login/username", { username, password });
  return { status: r.status, message: r.body?.message ?? "" };
}
async function lockOut(username) {
  for (let i = 0; i < 5; i++) await login(username, `wrong-guess-${i}`);
}
const locked = (m) => /locked/i.test(m);

const { orgs } = await build();
const A = orgs.A;
const [{ admin_user_id: adminId }] = await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [A.orgId]);
const sa = new Session("sa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

await lockOut(A.adminUsername);
const withRight = await login(A.adminUsername, A.adminPassword);
rec("U-01", "five wrong guesses lock; the right password is then refused",
  withRight.status === 401 && locked(withRight.message), `HTTP ${withRight.status} locked=${locked(withRight.message)}`);

const reset = await sa.post(`/api/superadmin/users/${adminId}/reset-password`, {});
const afterReset = reset.status === 200 ? await login(A.adminUsername, reset.body.newPassword) : { status: 0, message: "" };
rec("U-02", "superadmin reset of a locked account signs in at once",
  reset.status === 200 && afterReset.status === 200, `reset=${reset.status} login=${afterReset.status} locked=${locked(afterReset.message)}`);

const stu = A.students[0];
const [{ id: memberId }] = await sql(`SELECT id FROM organization_members WHERE user_id = $1`, [stu.userId]);
await lockOut(stu.username);
const schoolReset = await A.session.post(`/api/admin/organizations/${A.orgId}/members/${memberId}/reset-password`, { passwordComplexity: "medium" });
const stuLogin = schoolReset.status === 200 ? await login(stu.username, schoolReset.body.password) : { status: 0, message: "" };
rec("U-03", "the school's reset of a locked student signs in at once",
  schoolReset.status === 200 && stuLogin.status === 200, `reset=${schoolReset.status} login=${stuLogin.status} locked=${locked(stuLogin.message)}`);

await lockOut(stu.username);
const relock = await login(stu.username, schoolReset.body?.password);
rec("U-04", "after a reset, five more wrong guesses still lock",
  relock.status === 401 && locked(relock.message), `HTTP ${relock.status} locked=${locked(relock.message)}`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nreset-unlocks: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
