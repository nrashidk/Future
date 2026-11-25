/**
 * MIGRATION 049 — EXECUTED, NOT READ.
 *
 *   M-01  THE CASE THAT MATTERS: a school whose registered admin has the
 *         column and no membership row gets an admin row, and that admin can
 *         then read the roster (the deploy does not lock them out)
 *   M-02  CONTROL: a removed admin (admin_removed event) gets NO row back
 *   M-03  CONTROL: an admin who already has a row is not given a second
 *   M-04  running it twice adds nothing
 *   M-05  the backfilled row is primary only when the school has none
 */
import { readFileSync } from "fs";
import { Session } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(62)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}
const pause = (ms = 500) => new Promise((r) => setTimeout(r, ms));
const FILE = "server/migrations/049_backfill_admin_membership.sql";
const raw = readFileSync(FILE, "utf8");
const upSql = raw.slice(0, raw.indexOf("-- DOWN"));

const tag = Math.random().toString(36).slice(2, 7);
const PASSWORD = "Migration49!Strong";

// One multi-statement call per fixture (PGlite has one connection).
async function school(name, { withRow, removed }) {
  const [u] = await sql(
    `INSERT INTO users (id, username, email, first_name, last_name, account_type, password_hash)
     VALUES (gen_random_uuid(), $1, $2, 'M', '49', 'org_admin', $3) RETURNING id`,
    [`m49${name}${tag}`, `m49.${name}.${tag}@futurepath.test`, await hash()]);
  await pause();
  const [o] = await sql(
    `INSERT INTO organizations (id, name, admin_user_id, total_licenses, used_licenses, country_id, curriculum)
     VALUES (gen_random_uuid(), $1, $2, 10, 0, 'uae', 'MOE National') RETURNING id`, [`M49 ${name} ${tag}`, u.id]);
  await pause();
  if (withRow) { await sql(`INSERT INTO organization_members (id, organization_id, user_id, role, is_primary_admin) VALUES (gen_random_uuid(), $1, $2, 'admin', true)`, [o.id, u.id]); await pause(); }
  if (removed) { await sql(`INSERT INTO organization_events (id, organization_id, event_type, event_description, affected_user_id, performed_by, performed_by_role) VALUES (gen_random_uuid(), $1, 'admin_removed', 'removed', $2, $2, 'superadmin')`, [o.id, u.id]); await pause(); }
  return { userId: u.id, orgId: o.id, username: `m49${name}${tag}` };
}
let cachedHash;
async function hash() {
  if (cachedHash) return cachedHash;
  const bcrypt = await import("bcryptjs").catch(() => import("bcrypt"));
  cachedHash = await (bcrypt.default ?? bcrypt).hash(PASSWORD, 10);
  return cachedHash;
}
const rows = async (userId) => { const r = await sql(`SELECT role, is_primary_admin FROM organization_members WHERE user_id = $1`, [userId]); await pause(); return r; };

const orphan = await school("orphan", { withRow: false, removed: false });
const gone = await school("gone", { withRow: false, removed: true });
const normal = await school("normal", { withRow: true, removed: false });

await sql(upSql); await pause();
const o = await rows(orphan.userId), g = await rows(gone.userId), n = await rows(normal.userId);

const s = new Session("m49");
await s.login(orphan.username, PASSWORD);
const roster = await s.get(`/api/admin/organizations/${orphan.orgId}/members`);
rec("M-01", "an admin with only the column gets a row and keeps the school",
  o.length === 1 && o[0].role === "admin" && roster.status === 200, `rows=${o.length} roster=${roster.status}`);
rec("M-02", "control: a removed admin gets no row back", g.length === 0, `rows=${g.length}`);
rec("M-03", "control: an existing row is not duplicated", n.length === 1, `rows=${n.length}`);
await sql(upSql); await pause();
const o2 = await rows(orphan.userId);
rec("M-04", "a second run adds nothing", o2.length === 1, `rows=${o2.length}`);
rec("M-05", "primary when the school had none", o[0]?.is_primary_admin === true, `primary=${o[0]?.is_primary_admin}`);

const failed = results.filter((r) => !r.pass).length;
console.log(`\nmigration-049-dryrun: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
