/**
 * MIGRATION 035 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` builds the schema from the drizzle definitions and marks
 * every migration applied WITHOUT RUNNING IT, so no .sql file in
 * server/migrations/ is ever executed by the harness. A syntax error or a bad
 * constraint therefore first runs at PRODUCTION BOOT, where the runner treats
 * a failure as fatal and Render has already deployed.
 *
 *   M-01  the UP runs at all, from the file on disk
 *   M-02  it produces exactly the intended columns
 *   M-03  `token` is UNIQUE. That constraint is the whole guarantee: a link is
 *         one credential, and a table created without it would leave every
 *         other setup assertion passing against nothing
 *   M-04  user_id and organization_id both CASCADE on delete. A deleted
 *         account must not leave a live sign-in link behind, and this is
 *         minors' data under PDPL — a token outliving its user is a dangling
 *         credential, not an orphan row
 *   M-05  organization_id is NULLABLE. A token is minted inside the Stripe
 *         purchase transaction where the organization may not exist yet; NOT
 *         NULL there would roll back a payment already taken
 *   M-06  sent_count defaults to 0 and is NOT NULL, so "never sent" is a
 *         number and not a null the superadmin column has to special-case
 *   M-07  running the UP twice is harmless — a restored database, a
 *         re-pointed environment, a hand-run catch-up
 *   M-08  the DOWN in the comment block actually works. It is written for a
 *         human to paste, so nothing else ever checks it
 *   M-09  the UP works again after the DOWN: reversible both ways, not merely
 *         droppable
 *
 * Leaves the table in place, because the application and the other suites
 * need it.
 */
import { readFileSync } from "fs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(60)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const FILE = "server/migrations/035_school_setup_tokens.sql";
const raw = readFileSync(FILE, "utf8");

// Parsed from the file rather than retyped: a copy would drift silently, and
// the file is what production runs.
const marker = "-- DOWN (manual, not run by the runner):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN block to test`);
const upSql = raw.slice(0, idx);
const downSql = raw
  .slice(idx + marker.length)
  .split("\n")
  .map((l) => l.replace(/^--\s{0,3}/, "").trim())
  .filter((l) => l.length > 0 && !l.startsWith("--"))
  .join("\n");

const T = "school_setup_tokens";
const columns = () =>
  sql(`SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = '${T}' ORDER BY column_name`);
const indexes = () =>
  sql(`SELECT indexname FROM pg_indexes WHERE tablename = '${T}' ORDER BY indexname`);
const uniqueCols = () =>
  sql(`SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = '${T}'::regclass AND i.indisunique AND NOT i.indisprimary`);
const fks = () =>
  sql(`SELECT kcu.column_name, rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
        WHERE tc.table_name = '${T}' AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY kcu.column_name`);

// Start from nothing: schema-push already created this table from the drizzle
// definitions, and the point is to prove the FILE creates it.
await sql(`DROP TABLE IF EXISTS ${T}`);

// ---------------------------------------------------------------------- M-01
let upError = null;
try { await sql(upSql); } catch (e) { upError = e; }
rec("M-01", "the UP runs from the file on disk", upError === null,
  upError ? String(upError.message).slice(0, 90) : "no error");

// ---------------------------------------------------------------------- M-02
{
  const cols = (await columns()).map((c) => c.column_name);
  const expected = [
    "created_at", "expires_at", "id", "organization_id",
    "sent_at", "sent_count", "token", "used_at", "user_id",
  ];
  rec("M-02", "exactly the nine intended columns",
    cols.length === expected.length && cols.every((c, i) => c === expected[i]),
    cols.join(", ") || "NO TABLE");
}

// ---------------------------------------------------------------------- M-03
{
  const u = (await uniqueCols()).map((r) => r.attname);
  rec("M-03", "token is UNIQUE — one link is one credential",
    u.includes("token"), u.join(", ") || "NO UNIQUE CONSTRAINT");
}

// ---------------------------------------------------------------------- M-04
{
  const rows = await fks();
  const byCol = Object.fromEntries(rows.map((r) => [r.column_name, r.delete_rule]));
  rec("M-04", "both references CASCADE — no live link outlives its account",
    byCol.user_id === "CASCADE" && byCol.organization_id === "CASCADE",
    `user_id=${byCol.user_id ?? "none"} organization_id=${byCol.organization_id ?? "none"}`);
}

// ---------------------------------------------------------------------- M-05
{
  const cols = await columns();
  const org = cols.find((c) => c.column_name === "organization_id");
  const user = cols.find((c) => c.column_name === "user_id");
  rec("M-05", "organization_id NULLABLE, user_id NOT NULL",
    org?.is_nullable === "YES" && user?.is_nullable === "NO",
    `organization_id nullable=${org?.is_nullable} user_id nullable=${user?.is_nullable}`);
}

// ---------------------------------------------------------------------- M-06
{
  const c = (await columns()).find((x) => x.column_name === "sent_count");
  const ok = c?.is_nullable === "NO" && String(c?.column_default ?? "").startsWith("0");
  rec("M-06", "sent_count is NOT NULL DEFAULT 0 — never-sent is a number", ok,
    `nullable=${c?.is_nullable} default=${c?.column_default}`);
}

// ---------------------------------------------------------------------- M-07
{
  let reError = null;
  try { await sql(upSql); } catch (e) { reError = e; }
  const n = (await columns()).length;
  rec("M-07", "running the UP a second time is harmless", reError === null && n === 9,
    reError ? String(reError.message).slice(0, 80) : `no error, ${n} columns`);
}

// ---------------------------------------------------------------------- M-08
{
  let downError = null;
  try { await sql(downSql); } catch (e) { downError = e; }
  const gone = (await columns()).length === 0;
  rec("M-08", "the DOWN from the comment block actually rolls back",
    downError === null && gone,
    downError ? String(downError.message).slice(0, 80) : `table gone: ${gone}`);
}

// ---------------------------------------------------------------------- M-09
{
  let reupError = null;
  try { await sql(upSql); } catch (e) { reupError = e; }
  const n = (await columns()).length;
  const idxNames = (await indexes()).map((i) => i.indexname);
  rec("M-09", "the UP works again after the DOWN — reversible both ways",
    reupError === null && n === 9
      && idxNames.includes("school_setup_tokens_user_idx")
      && idxNames.includes("school_setup_tokens_org_idx"),
    reupError ? String(reupError.message).slice(0, 80) : `${n} columns, ${idxNames.length} indexes`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
