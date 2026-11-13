/**
 * MIGRATION 044 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` builds the schema from the drizzle definitions and marks
 * every migration applied WITHOUT RUNNING IT, so a syntax error in a .sql
 * first runs at production boot, where a failure is fatal.
 *
 *   M-01  the DOWN from the file's comment block runs (the harness already
 *         has the objects, from drizzle), and removes both columns and the table
 *   M-02  the UP runs, from the file on disk
 *   M-03  both users columns are back: nullable, NO default
 *   M-04  THE CLAIM THAT MATTERS: no existing account is asked to confirm.
 *         A row that existed before the UP has NULL in both columns, so the
 *         sweep cannot reach it. A default on the due date would erase every
 *         account in the product 72 hours after deploy.
 *   M-05  the token table: token_hash is UNIQUE (a duplicate is refused)
 *   M-06  the token table CASCADES with its user, so erasure is not blocked
 *   M-07  an existing users row kept its other values through DOWN and UP
 *   M-08  running the UP twice is harmless
 *
 * Run it LAST or on its own database: between M-01 and M-02 the app's schema
 * is missing two users columns.
 */
import { readFileSync } from "fs";

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

const FILE = "server/migrations/044_email_confirmation.sql";
const raw = readFileSync(FILE, "utf8");
const marker = "-- DOWN (paste by hand):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN block to test`);
const upSql = raw.slice(0, idx);
const downSql = raw.slice(idx + marker.length).split("\n")
  .map((l) => l.replace(/^--\s{0,3}/, "").trim())
  .filter((l) => l.length > 0 && !l.startsWith("--")).join("\n");

const COLS = ["email_confirmation_due_at", "email_confirmed_at"];
const userCols = () => sql(
  `SELECT column_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = ANY($1)`, [COLS]);
const tableExists = async () => (await sql(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'email_confirmation_tokens'`))[0].n === 1;

const id = `m044-${Date.now()}`;
const email = `${id}@futurepath.test`;
try {
  await sql(`INSERT INTO users (id, email, first_name, role, account_type) VALUES ($1, $2, 'Before', 'user', 'public')`, [id, email]);

  let downError = null;
  try { await sql(downSql); } catch (e) { downError = e; }
  rec("M-01", "the DOWN runs and removes both columns and the table",
    downError === null && (await userCols()).length === 0 && !(await tableExists()),
    downError ? String(downError.message).slice(0, 90) : "");

  let upError = null;
  try { await sql(upSql); } catch (e) { upError = e; }
  rec("M-02", "the UP runs from the file on disk", upError === null,
    upError ? String(upError.message).slice(0, 90) : "");

  const cols = await userCols();
  rec("M-03", "both users columns exist, nullable, with NO default",
    cols.length === 2 && cols.every((c) => c.is_nullable === "YES" && c.column_default === null),
    JSON.stringify(cols.map((c) => [c.column_name, c.is_nullable, c.column_default])));

  const [row] = await sql(`SELECT email, first_name, email_confirmation_due_at AS due, email_confirmed_at AS conf FROM users WHERE id = $1`, [id]);
  const asked = (await sql(`SELECT count(*)::int AS n FROM users WHERE email_confirmation_due_at IS NOT NULL`))[0].n;
  rec("M-04", "NO existing account is asked to confirm (all due dates NULL)",
    row?.due === null && row?.conf === null && asked === 0, `this row due=${row?.due} accounts asked=${asked}`);

  await sql(`INSERT INTO email_confirmation_tokens (user_id, token_hash, expires_at) VALUES ($1, 'h-1', NOW() + INTERVAL '1 hour')`, [id]);
  let dup = null;
  try { await sql(`INSERT INTO email_confirmation_tokens (user_id, token_hash, expires_at) VALUES ($1, 'h-1', NOW() + INTERVAL '1 hour')`, [id]); }
  catch (e) { dup = e; }
  rec("M-05", "token_hash is UNIQUE: a duplicate is refused (23505)", dup?.code === "23505", `code=${dup?.code ?? "accepted"}`);

  rec("M-07", "the existing row kept its values through DOWN and UP",
    row?.email === email && row?.first_name === "Before", `${row?.email} ${row?.first_name}`);

  let again = null;
  try { await sql(upSql); } catch (e) { again = e; }
  rec("M-08", "running the UP twice is harmless", again === null, again ? String(again.message).slice(0, 80) : "");

  await sql(`DELETE FROM users WHERE id = $1`, [id]);
  const left = (await sql(`SELECT count(*)::int AS n FROM email_confirmation_tokens WHERE user_id = $1`, [id]))[0].n;
  rec("M-06", "the token CASCADES with its user", left === 0, `tokens left=${left}`);
} finally {
  await sql(`DELETE FROM users WHERE id = $1`, [id]).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
