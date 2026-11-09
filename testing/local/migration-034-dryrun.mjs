/**
 * MIGRATION 034 — EXECUTED, NOT READ.
 *
 * WHY THIS SUITE HAS TO EXIST. `schema-push.mjs` builds the schema from the
 * drizzle definitions and marks every migration applied WITHOUT RUNNING IT, so
 * no .sql file in server/migrations/ is ever executed by the harness. A syntax
 * error, a bad constraint or a psql meta-command therefore first runs at
 * PRODUCTION BOOT, where the runner treats a failure as fatal and Render has
 * already deployed. A read-only verification script dropped into that directory
 * once took the app down for exactly this reason.
 *
 * So this runs the real file against a real Postgres engine and asserts the
 * result, in the order working rule 5 asks for: reversible, and dry-run in the
 * harness regardless.
 *
 *   M-01  the UP runs at all, from the file on disk
 *   M-02  it produces the four columns and nothing else
 *   M-03  the index exists under the name the schema declares
 *   M-04  the PRIMARY KEY is on event_id — the entire dedupe guarantee is that
 *         constraint, so a table created without it would leave every other
 *         webhook assertion passing against nothing
 *   M-05  running the UP twice is harmless. The runner applies a file once, but
 *         a re-run happens in practice — a restored database, a re-pointed
 *         environment, a hand-run catch-up with scripts/run-migrations.ts
 *   M-06  the DOWN in the file's comment block actually works. It is written
 *         for a human to paste, so nothing else ever checks it, and a down
 *         migration that does not run is not a rollback plan
 *   M-07  the UP works again after the DOWN — reversible in both directions,
 *         not merely droppable
 *
 * Leaves the table in place, because the application and every other suite
 * need it.
 */
import { readFileSync } from "fs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(58)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const FILE = "server/migrations/034_stripe_webhook_events.sql";
const raw = readFileSync(FILE, "utf8");

/**
 * The UP is the file with its trailing DOWN comment block removed, and the DOWN
 * is that block with its leading `--   ` stripped. Parsed from the file rather
 * than retyped here: a copy would drift from the file silently, and the file is
 * what production runs.
 */
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

const columns = () =>
  sql(`SELECT column_name, is_nullable FROM information_schema.columns
       WHERE table_name = 'stripe_webhook_events' ORDER BY column_name`);
const indexes = () =>
  sql(`SELECT indexname FROM pg_indexes WHERE tablename = 'stripe_webhook_events' ORDER BY indexname`);
const pkColumns = () =>
  sql(`SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = 'stripe_webhook_events'::regclass AND i.indisprimary`);

// Start from nothing: schema-push already created this table from the drizzle
// definitions, and the point is to prove the FILE creates it.
await sql(`DROP TABLE IF EXISTS stripe_webhook_events`);

// ---------------------------------------------------------------------- M-01
let upError = null;
try { await sql(upSql); } catch (e) { upError = e; }
rec("M-01", "the UP runs from the file on disk", upError === null,
  upError ? String(upError.message).slice(0, 90) : "no error");

// ---------------------------------------------------------------------- M-02
{
  const cols = (await columns()).map((c) => c.column_name);
  const expected = ["event_id", "event_type", "processed_at", "received_at"];
  rec("M-02", "exactly the four intended columns",
    cols.length === expected.length && cols.every((c, i) => c === expected[i]),
    cols.join(", ") || "NO TABLE");
}

// ---------------------------------------------------------------------- M-03
{
  const idxNames = (await indexes()).map((i) => i.indexname);
  rec("M-03", "the received_at index exists under its declared name",
    idxNames.includes("stripe_webhook_events_received_idx"), idxNames.join(", ") || "none");
}

// ---------------------------------------------------------------------- M-04
{
  const pk = (await pkColumns()).map((r) => r.attname);
  rec("M-04", "PRIMARY KEY is on event_id — the whole dedupe guarantee",
    pk.length === 1 && pk[0] === "event_id", pk.join(", ") || "NO PRIMARY KEY");
}

// ---------------------------------------------------------------------- M-05
{
  let reError = null;
  try { await sql(upSql); } catch (e) { reError = e; }
  const cols = (await columns()).length;
  rec("M-05", "running the UP a second time is harmless", reError === null && cols === 4,
    reError ? String(reError.message).slice(0, 80) : `no error, ${cols} columns`);
}

// ---------------------------------------------------------------------- M-06
{
  let downError = null;
  try { await sql(downSql); } catch (e) { downError = e; }
  const gone = (await columns()).length === 0;
  rec("M-06", "the DOWN from the comment block actually rolls back",
    downError === null && gone,
    downError ? String(downError.message).slice(0, 80) : `table gone: ${gone}`);
}

// ---------------------------------------------------------------------- M-07
{
  let reUpError = null;
  try { await sql(upSql); } catch (e) { reUpError = e; }
  const cols = (await columns()).map((c) => c.column_name);
  const pk = (await pkColumns()).map((r) => r.attname);
  rec("M-07", "the UP works again after the DOWN, with its key intact",
    reUpError === null && cols.length === 4 && pk[0] === "event_id",
    reUpError ? String(reUpError.message).slice(0, 80) : `${cols.length} columns, pk=${pk.join(",")}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
