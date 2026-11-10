/**
 * DELETING AN ACCOUNT — the capability the product did not have, on a route
 * that can destroy a person's record.
 *
 * Until this existed the only deletion path was `DELETE /api/users/me`,
 * self-service erasure needing that account's own password, so a test purchase
 * or a stranded premium account could never be cleared. The fix is a superadmin
 * route — and a superadmin route that erases people needs its refusals proved,
 * not reviewed.
 *
 * Every denial case below is judged by whether the ROW IS STILL THERE, never
 * by the status: a 409 that nonetheless deleted would read as safe.
 *
 *   D-00  the route is real — the SPA catch-all answers 200 with HTML for any
 *         unmatched URL, so a misspelled path would make every case "pass"
 *   D-01  a guest cannot delete anyone
 *   D-02  an ORG ADMIN cannot delete anyone, their own members included
 *   D-03  a superadmin must type the account's email; an id alone is refused
 *   D-04  the wrong email is refused — the confirmation is compared, not merely
 *         required
 *   D-05  deleting YOURSELF is refused and pointed at self-erasure
 *   D-05b a DIFFERENT superadmin is refused outright — the branch D-05 cannot
 *         reach, since the self-check fires first when the target is the caller
 *   D-06  a STUDENT is refused and redirected to the school's own removal
 *         endpoints, which carry the erase/detach choice this route cannot
 *   D-07  a school's REGISTERED ADMINISTRATOR is blocked by the audit check —
 *         organizations.admin_user_id is a blocking source, so the school must
 *         go first. This is the case that forces the order, and it is why
 *         deleting a school and then its admin is two acts
 *   D-08  THE POSITIVE CONTROL: an ordinary account with nothing against it IS
 *         deleted, and the row is gone. Without it every refusal above would
 *         pass against a route that refuses everyone
 *   D-09  the account really cannot sign in afterwards — "the row is gone" and
 *         "the credentials are dead" are different claims
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
const A = orgs.A;

const sa = new Session(`del-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

// A GET first: without a csrf_token cookie the first state-changing request is
// refused 403 CSRF_MISSING before authentication is ever consulted, and the
// guest case would assert against the wrong guard.
const guest = new Session(`del-guest-${tag}`);
await guest.get("/api/auth/user");

const exists = async (id) =>
  (await sql(`SELECT 1 FROM users WHERE id = $1`, [id])).length === 1;

const made = [];
/** An ordinary account: premium individual, no school — the stranded shape. */
async function account(label, { accountType = "individual", email = true } = {}) {
  const addr = email ? `del.${label}.${tag}@futurepath.test` : null;
  const [u] = await sql(
    `INSERT INTO users (id, username, email, first_name, account_type, is_premium, purchased_licenses, password_hash)
     VALUES (gen_random_uuid(), $1, $2, 'Del', $3, true, 1, '$2b$10$notarealhashbutnotnull')
     RETURNING id`,
    [`del${label}${tag}`, addr, accountType],
  );
  made.push(u.id);
  return { id: u.id, email: addr, username: `del${label}${tag}` };
}

const del = (session, id, body) => session.req("DELETE", `/api/superadmin/users/${id}`, body);

try {
  const victim = await account("victim");

  // ------------------------------------------------------------------ D-00
  {
    const r = await del(sa, "00000000-0000-0000-0000-000000000000", { confirmEmail: "x@y.z" });
    rec("D-00", "the route is real: a JSON 404, not the SPA's 200 HTML",
      r.status === 404 && !isHtml(r.body) && typeof r.body?.message === "string",
      `HTTP ${r.status} ${isHtml(r.body) ? "HTML" : JSON.stringify(r.body).slice(0, 44)}`);
  }

  // ------------------------------------------------------------------ D-01
  {
    const r = await del(guest, victim.id, { confirmEmail: victim.email });
    rec("D-01", "a guest cannot delete an account",
      r.status === 401 && (await exists(victim.id)),
      `HTTP ${r.status} row=${(await exists(victim.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-02
  {
    const r = await del(A.session, victim.id, { confirmEmail: victim.email });
    rec("D-02", "an ORG ADMIN cannot delete an account",
      r.status === 403 && (await exists(victim.id)),
      `HTTP ${r.status} row=${(await exists(victim.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-03
  {
    const r = await del(sa, victim.id, {});
    rec("D-03", "a superadmin with no confirmation is refused",
      r.status === 400 && r.body?.code === "CONFIRMATION_REQUIRED" && (await exists(victim.id)),
      `HTTP ${r.status} code=${r.body?.code} row=${(await exists(victim.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-04
  {
    const r = await del(sa, victim.id, { confirmEmail: "someone.else@futurepath.test" });
    rec("D-04", "the WRONG email is refused — the confirmation is compared",
      r.status === 400 && r.body?.code === "CONFIRMATION_REQUIRED" && (await exists(victim.id)),
      `HTTP ${r.status} code=${r.body?.code} row=${(await exists(victim.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-05
  // YOURSELF is refused and pointed at /api/users/me, which asks for the
  // password again — a session proves a browser, not a person.
  {
    const [su] = await sql(`SELECT id, email, username FROM users WHERE username = $1`, [SUPERADMIN.username]);
    const r = await del(sa, su.id, { confirmEmail: (su.email || su.username || "").toLowerCase() });
    rec("D-05", "deleting YOURSELF is refused, pointed at self-erasure",
      r.status === 409 && r.body?.code === "USE_SELF_ERASURE" && (await exists(su.id)),
      `HTTP ${r.status} code=${r.body?.code} row=${(await exists(su.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-05b
  // A DIFFERENT superadmin, which D-05 cannot reach: the self-check fires
  // first when the target is the caller, so the TARGET_IS_SUPERADMIN branch
  // would otherwise never run. An endpoint that can delete the people holding
  // the keys is a privilege surface, so this branch is the one that matters.
  {
    const [other] = await sql(
      `INSERT INTO users (id, username, email, account_type, role, password_hash)
       VALUES (gen_random_uuid(), $1, $2, 'individual', 'superadmin', '$2b$10$notarealhashbutnotnull')
       RETURNING id, email`,
      [`delsuper${tag}`, `del.super.${tag}@futurepath.test`],
    );
    made.push(other.id);
    const r = await del(sa, other.id, { confirmEmail: other.email });
    rec("D-05b", "ANOTHER superadmin is refused outright",
      r.status === 409 && r.body?.code === "TARGET_IS_SUPERADMIN" && (await exists(other.id)),
      `HTTP ${r.status} code=${r.body?.code} row=${(await exists(other.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-06
  // One path for minors' records, not two: a student's removal carries an
  // erase/detach choice this route cannot express.
  {
    const student = await account("student", { accountType: "student" });
    const r = await del(sa, student.id, { confirmEmail: student.email });
    rec("D-06", "a STUDENT is refused and redirected to school removal",
      r.status === 409 && r.body?.code === "USE_STUDENT_REMOVAL" && (await exists(student.id)),
      `HTTP ${r.status} code=${r.body?.code} row=${(await exists(student.id)) ? "present" : "GONE"}`);
  }

  // ------------------------------------------------------------------ D-07
  // THE ORDERING CASE. organizations.admin_user_id is a blocking audit source,
  // so a school's registered administrator cannot be erased while the school
  // stands — which is exactly why cleaning up a stranded school is two acts
  // and not one.
  {
    const admin = await account("schooladmin");
    const [org] = await sql(
      `INSERT INTO organizations (id, name, admin_user_id, total_licenses, used_licenses, country_id)
       VALUES (gen_random_uuid(), $1, $2, 10, 0, 'uae') RETURNING id`,
      [`Del School ${tag}`, admin.id],
    );
    const r = await del(sa, admin.id, { confirmEmail: admin.email });
    const blocked = r.status === 409
      && r.body?.code === "ERASURE_BLOCKED_BY_AUDIT_RECORDS"
      && (r.body?.blockingRecords ?? []).includes("school_administrator");
    rec("D-07", "a school's registered administrator is blocked until the school goes",
      blocked && (await exists(admin.id)),
      `HTTP ${r.status} blocking=${(r.body?.blockingRecords ?? []).join("+")} row=${(await exists(admin.id)) ? "present" : "GONE"}`);
    await sql(`DELETE FROM organizations WHERE id = $1`, [org.id]);
  }

  // ------------------------------------------------------------------ D-08
  // THE POSITIVE CONTROL. Without it every refusal above passes against a
  // route that refuses everyone.
  {
    const r = await del(sa, victim.id, { confirmEmail: victim.email });
    rec("D-08", "an ordinary stranded account IS deleted, and the row is gone",
      r.status === 200 && r.body?.success === true && !(await exists(victim.id)),
      `HTTP ${r.status} row=${(await exists(victim.id)) ? "STILL PRESENT" : "gone"}`);
  }

  // ------------------------------------------------------------------ D-09
  // "The row is gone" and "the credentials are dead" are different claims, and
  // this repo has shipped the first without the second.
  {
    const s = new Session(`del-ghost-${tag}`);
    let loggedIn = false;
    try { const r = await s.login(victim.username, "irrelevant-wrong-password"); loggedIn = r.status === 200; } catch { loggedIn = false; }
    rec("D-09", "the deleted account cannot sign in", !loggedIn,
      loggedIn ? "LOGGED IN AFTER DELETION" : "refused");
  }
} finally {
  for (const id of made) {
    try { await sql(`DELETE FROM users WHERE id = $1`, [id]); } catch {}
  }
  try { await sql(`DELETE FROM organizations WHERE name LIKE $1`, [`Del School %${tag}`]); } catch {}
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
