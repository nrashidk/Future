/**
 * A RESERVED ADDRESS CANNOT BE REGISTERED.
 *
 * Superadmin is not only a role: any account whose email is listed in
 * SUPERADMIN_EMAILS is a platform administrator from its next request. The
 * superadmin's own email-edit route has refused to WRITE a reserved address
 * since it was built (server/utils/emailChange.ts) -- and nothing refused to
 * CREATE an account with one. POST /api/register/parent is public, signs the
 * new account in, and asks for no proof of the address, so a reserved address
 * that no account yet held was a nationwide-administrator account for whoever
 * typed it first. Found 2026-11-13, while moving the owner's address between
 * two accounts: for a moment a reserved address is held by nobody.
 *
 * up.ts reserves `reserved-unheld@futurepath.test`, which no account has.
 *
 *   X-01  THE CASE THAT MATTERS: registering with it creates NO account
 *   X-02  ...and the session that tried is no superadmin (the staff list
 *         refuses it; judged by the body, since the SPA answers 200 to
 *         anything unmatched)
 *   X-03  the refusal reads exactly like "already registered", so the public
 *         form does not reveal which addresses are reserved
 *   X-04  case and surrounding spaces do not get round it
 *   X-05  CONTROL: an ordinary address still registers -- or everything above
 *         passes against a registration route that refuses everyone
 *   X-06  a superadmin's "Add Users" cannot create one either
 */
import { Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(62)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}
const RESERVED = "reserved-unheld@futurepath.test";
const PASSWORD = "Str0ng!Passw0rd";
const body = (email) => ({
  firstName: "Mallory", lastName: "Test", email, password: PASSWORD, confirmPassword: PASSWORD,
  child: { name: "Nobody", dateOfBirth: "2010-04-04", gender: "female", grade: "grade10",
           countryId: "uae", curriculum: "MOE National" },
  consentsToProcessing: true, attestsGuardianRelationship: true,
  attestationText: "LOCAL FIXTURE attestation wording", locale: "en",
});
const held = async () => (await sql(`SELECT count(*)::int AS n FROM users WHERE lower(email) = $1`, [RESERVED]))[0].n;
const isStaff = async (s) => {
  const r = await s.get("/api/superadmin/students");
  return r.status === 200 && Array.isArray(r.body);
};

const before = await held();
const m = new Session("mallory");
await m.get("/api/auth/user");
const attempt = await m.post("/api/register/parent", body(RESERVED));
rec("X-01", "registering with a reserved address creates NO account",
  before === 0 && (await held()) === 0, `HTTP ${attempt.status} accounts holding it ${before}->${await held()}`);
rec("X-02", "the session that tried is not a superadmin", !(await isStaff(m)));

// What "already registered" looks like, to compare against.
const dupe = `dupe.${Date.now()}@futurepath.test`;
const d1 = new Session("d1"); await d1.get("/api/auth/user");
const first = await d1.post("/api/register/parent", body(dupe));
const d2 = new Session("d2"); await d2.get("/api/auth/user");
const second = await d2.post("/api/register/parent", body(dupe));
rec("X-03", "the refusal is indistinguishable from 'already registered'",
  attempt.status === second.status && JSON.stringify(attempt.body) === JSON.stringify(second.body),
  `reserved=${attempt.status} ${JSON.stringify(attempt.body).slice(0, 60)} | taken=${second.status}`);

const v = new Session("variant"); await v.get("/api/auth/user");
const variant = await v.post("/api/register/parent", body("  Reserved-Unheld@FuturePath.test "));
rec("X-04", "case and spaces do not get round it",
  (await held()) === 0 && !(await isStaff(v)), `HTTP ${variant.status} held=${await held()}`);

rec("X-05", "CONTROL: an ordinary address still registers", first.status === 200 && !!first.body?.user?.id,
  `HTTP ${first.status}`);

const sa = new Session("sa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const add = await sa.post("/api/superadmin/students", { firstName: "Extra", lastName: "Admin", email: RESERVED });
rec("X-06", "a superadmin's Add Users cannot create one either", (await held()) === 0,
  `HTTP ${add.status} ${JSON.stringify(add.body).slice(0, 90)} held=${await held()}`);

// Clean up the two ordinary accounts.
for (const e of [dupe]) {
  const [u] = await sql(`SELECT id FROM users WHERE email = $1`, [e]);
  if (!u) continue;
  await sql(`DELETE FROM child_profiles WHERE guardian_user_id = $1`, [u.id]);
  await sql(`DELETE FROM users WHERE id = $1`, [u.id]);
}
await sql(`DELETE FROM users WHERE lower(email) = $1`, [RESERVED]).catch(() => {});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
