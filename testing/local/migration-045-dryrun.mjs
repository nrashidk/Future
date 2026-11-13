/**
 * MIGRATION 045 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` marks every migration applied WITHOUT RUNNING IT, so the
 * .sql first runs at production boot, where a failure is fatal.
 *
 *   M-01  the UP runs, from the file on disk
 *   M-02  THE CLAIM: an account stored as 'public' is 'individual' afterwards
 *   M-03  CONTROL: an org_admin, an org_student and an individual are
 *         untouched — without this M-02 passes against an UPDATE with no WHERE
 *   M-04  nothing else about the moved account changed (premium flag,
 *         licences, the confirmation deadline)
 *   M-05  running the UP twice is harmless
 *   M-06  no 'public' account is left
 *
 * There is no DOWN to run: the file says why (the two values cannot be told
 * apart afterwards).
 */
import { readFileSync } from "fs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(62)} ${note}`);
};
// ONE client for the whole run would starve the app; one per call exhausts
// PGlite. Each call here is a single multi-statement or single statement.
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const FILE = "server/migrations/045_registered_accounts_are_individual.sql";
const raw = readFileSync(FILE, "utf8");
const marker = "-- DOWN (paste by hand):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN marker`);
const upSql = raw.slice(0, idx);

const tag = `m045-${Date.now()}`;
const ids = { pub: `${tag}-pub`, ind: `${tag}-ind`, adm: `${tag}-adm`, stu: `${tag}-stu` };
const read = async () => Object.fromEntries((await sql(
  `SELECT id, account_type, is_premium, purchased_licenses, (email_confirmation_due_at IS NOT NULL) AS due
     FROM users WHERE id = ANY($1)`, [Object.values(ids)])).map((r) => [r.id, r]));
try {
  await sql(`
    INSERT INTO users (id, email, first_name, role, account_type, is_premium, purchased_licenses, email_confirmation_due_at) VALUES
      ('${ids.pub}', '${ids.pub}@futurepath.test', 'Pub', 'user', 'public', true, 3, NOW() + INTERVAL '72 hours'),
      ('${ids.ind}', '${ids.ind}@futurepath.test', 'Ind', 'user', 'individual', false, 0, NULL),
      ('${ids.adm}', '${ids.adm}@futurepath.test', 'Adm', 'user', 'org_admin', false, 0, NULL),
      ('${ids.stu}', '${ids.stu}@futurepath.test', 'Stu', 'user', 'org_student', false, 0, NULL)`);
  await pause(300);
  const before = await read();

  let upErr = null;
  try { await sql(upSql); } catch (e) { upErr = e; }
  rec("M-01", "the UP runs from the file on disk", !upErr, upErr ? String(upErr.message).slice(0, 80) : "");
  await pause(300);
  const after = await read();

  rec("M-02", "a 'public' account is 'individual' afterwards",
    before[ids.pub].account_type === "public" && after[ids.pub].account_type === "individual",
    `${before[ids.pub].account_type} -> ${after[ids.pub].account_type}`);
  rec("M-03", "CONTROL: admin, student and individual are untouched",
    after[ids.adm].account_type === "org_admin" && after[ids.stu].account_type === "org_student" && after[ids.ind].account_type === "individual",
    `${after[ids.adm].account_type} / ${after[ids.stu].account_type} / ${after[ids.ind].account_type}`);
  rec("M-04", "the moved account kept premium, licences and its deadline",
    after[ids.pub].is_premium === true && after[ids.pub].purchased_licenses === 3 && after[ids.pub].due === true,
    `premium=${after[ids.pub].is_premium} licences=${after[ids.pub].purchased_licenses} due=${after[ids.pub].due}`);

  let againErr = null;
  try { await sql(upSql); } catch (e) { againErr = e; }
  rec("M-05", "running the UP twice is harmless", !againErr);
  await pause(300);
  const left = (await sql(`SELECT count(*)::int AS n FROM users WHERE account_type = 'public'`))[0].n;
  rec("M-06", "no 'public' account is left", left === 0, `left=${left}`);
} finally {
  await pause(300);
  await sql(`DELETE FROM users WHERE id = ANY($1)`, [Object.values(ids)]).catch(() => {});
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
