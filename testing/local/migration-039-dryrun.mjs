/**
 * MIGRATION 039 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` builds the schema from the DRIZZLE definitions and marks
 * every migration applied WITHOUT RUNNING IT, so no .sql in server/migrations/
 * is ever executed by the harness. A syntax error first runs at PRODUCTION
 * BOOT, where the runner treats a failure as fatal and Render has already
 * deployed.
 *
 *   M-01  the UP runs at all, from the file on disk
 *   M-02  it adds exactly ONE column, nullable with no default — a school that
 *         never raised a purchase order has no PO, and NULL says that; a
 *         default of '' would say they gave us an empty one
 *   M-03  the length CHECK actually FIRES at the database. CLAUDE.md records
 *         why this is asserted rather than read: a constraint in the .sql
 *         alone is live in production and absent here, and the gap lies in the
 *         dangerous direction
 *   M-04  100 characters is ACCEPTED — the boundary, from the permitted side,
 *         or M-03 would pass against a constraint set to any lower number
 *   M-05  it is NOT unique: two schools may number the same way, and one
 *         school may put one PO against several invoices when it orders in
 *         instalments
 *   M-06  THE ADDITIVE CLAIM, verified rather than asserted: 038's and 037's
 *         columns survive and an existing ROW keeps its values, with the new
 *         column NULL. An ALTER that rewrote data passes a column-list check
 *         and fails this one
 *   M-07  running the UP twice is harmless
 *   M-08  the DOWN in the comment block works — column and constraint
 *   M-09  the UP works again after the DOWN
 */
import { readFileSync } from "fs";
import { randomBytes } from "crypto";

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

const FILE = "server/migrations/039_invoice_purchase_order.sql";
const raw = readFileSync(FILE, "utf8");

// Parsed from the file, never retyped: a copy drifts silently and the file is
// what production runs.
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

const T = "invoices";
const COL = "purchase_order_ref";
const CHK = "invoices_po_ref_length";
// A sample across 037 and 038, including money, lifecycle and the delivery
// columns. If an ALTER dropped any of these the invoice itself is gone.
const OLD = ["bill_to_name", "currency", "delivery_status", "email_sent_count",
             "id", "issued_at", "number", "payment_reference", "provider_message_id",
             "sequence", "status", "student_count", "subtotal_minor", "total_minor", "year"];

const columns = () =>
  sql(`SELECT column_name, is_nullable, column_default, character_maximum_length
         FROM information_schema.columns WHERE table_name = '${T}' ORDER BY column_name`);
const checkNames = () =>
  sql(`SELECT conname FROM pg_constraint
        WHERE conrelid = '${T}'::regclass AND contype = 'c' ORDER BY conname`);
const indexDefs = () =>
  sql(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${T}'`);

// Start from the state BEFORE 039. Dropping the column is how this suite
// proves the FILE adds it, rather than reading what schema-push already built
// from the drizzle definitions.
await sql(`ALTER TABLE ${T} DROP CONSTRAINT IF EXISTS ${CHK}`);
await sql(`ALTER TABLE ${T} DROP COLUMN IF EXISTS ${COL}`);

const tag = randomBytes(4).toString("hex");
const YEAR = 2026;
// A sequence range of this suite's own, far from the product's, so a
// concurrent createInvoice cannot collide with these fixtures.
let seq = 940000 + Math.floor(Math.random() * 9000);
const nextNumber = () => `FP-M039-${tag}-${seq++}`;
const made = [];

/** Inserts an invoice and returns its number. `extra` adds columns/values. */
async function insertInvoice(name, cols = "", vals = "", params = []) {
  const n = nextNumber();
  made.push(n);
  await sql(
    `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                       unit_price_minor, per_student_minor, subtotal_minor,
                       total_minor, currency${cols})
     VALUES ($1, $2, $3, $4, 1, 4000, 4000, 4000, 4000, 'AED'${vals})`,
    [n, YEAR, seq - 1, name, ...params],
  );
  return n;
}

// A row that EXISTS BEFORE the migration, so M-06 proves the ALTER left real
// DATA alone rather than merely leaving a column list alone. ISSUED with a
// date, or `invoices_issued_has_date` refuses it.
const preNumber = nextNumber();
await sql(
  `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                     unit_price_minor, per_student_minor, discount_percent,
                     subtotal_minor, vat_rate_bp, vat_minor, total_minor,
                     currency, status, issued_at, payment_reference)
   VALUES ($1, $2, $3, 'Pre-039 School', 40, 4000, 3600, 10,
           144000, 0, 0, 144000, 'AED', 'issued', NOW() - INTERVAL '2 days', 'TT-PRE-039')`,
  [preNumber, YEAR, seq - 1],
);
made.push(preNumber);

try {
  // -------------------------------------------------------------------- M-01
  let upError = null;
  try { await sql(upSql); } catch (e) { upError = e; }
  rec("M-01", "the UP runs from the file on disk", upError === null,
    upError ? String(upError.message).slice(0, 90) : "no error");

  // -------------------------------------------------------------------- M-02
  {
    const col = (await columns()).find((c) => c.column_name === COL);
    rec("M-02", "one NULLABLE column, no default, capped at 100",
      !!col && col.is_nullable === "YES"
        && (col.column_default === null || col.column_default === undefined)
        && Number(col.character_maximum_length) === 100,
      col ? `nullable=${col.is_nullable} default=${col.column_default ?? "none"} len=${col.character_maximum_length}`
          : "COLUMN MISSING");
  }

  // -------------------------------------------------------------------- M-03
  // Judged by whether the DATABASE refuses the row. A check that exists but
  // does not fire is the same as none.
  {
    let refused = false;
    try {
      await insertInvoice("Too long", `, ${COL}`, `, $5`, ["X".repeat(101)]);
    } catch (e) { refused = String(e.code) === "23514" || String(e.code) === "22001"; }
    const present = (await checkNames()).some((c) => c.conname === CHK);
    rec("M-03", "a 101-character reference is REFUSED by the database",
      refused && present, refused ? `refused, constraint present=${present}` : "101 CHARS ACCEPTED");
  }

  // -------------------------------------------------------------------- M-04
  // The boundary from the permitted side. Without it M-03 passes against a
  // constraint accidentally set to 10.
  {
    let accepted = false;
    try {
      await insertInvoice("Exactly 100", `, ${COL}`, `, $5`, ["Y".repeat(100)]);
      accepted = true;
    } catch { accepted = false; }
    rec("M-04", "exactly 100 characters is ACCEPTED", accepted,
      accepted ? "100 ok" : "100 WRONGLY REFUSED");
  }

  // -------------------------------------------------------------------- M-05
  // Not unique, deliberately: one school may put one PO against several
  // invoices, and two schools may number the same way.
  {
    let both = false;
    try {
      await insertInvoice("Dup PO A", `, ${COL}`, `, $5`, ["PO-2026-114"]);
      await insertInvoice("Dup PO B", `, ${COL}`, `, $5`, ["PO-2026-114"]);
      both = true;
    } catch { both = false; }
    const hasIdx = (await indexDefs()).some((i) => /purchase_order_ref/.test(i.indexdef));
    rec("M-05", "the SAME reference may appear on several invoices",
      both && !hasIdx, `both accepted=${both} index on column=${hasIdx}`);
  }

  // -------------------------------------------------------------------- M-06
  // A column list surviving is weaker than a ROW surviving with its values.
  {
    const cols = (await columns()).map((c) => c.column_name);
    const oldIntact = OLD.every((c) => cols.includes(c));
    const [row] = await sql(
      `SELECT status, total_minor, subtotal_minor, payment_reference, ${COL},
              (issued_at < NOW() - INTERVAL '1 day') AS issued_at_preserved
         FROM ${T} WHERE number = $1`, [preNumber]);
    rec("M-06", "pre-existing invoices survive intact, with a NULL reference",
      oldIntact && row?.status === "issued" && row?.total_minor === 144000
        && row?.subtotal_minor === 144000 && row?.payment_reference === "TT-PRE-039"
        && row?.[COL] === null && row?.issued_at_preserved === true,
      `old cols=${oldIntact} status=${row?.status} total=${row?.total_minor} payment_ref=${row?.payment_reference} po=${row?.[COL] ?? "null"}`);
  }

  // -------------------------------------------------------------------- M-07
  {
    let reError = null;
    try { await sql(upSql); } catch (e) { reError = e; }
    const still = (await columns()).some((c) => c.column_name === COL);
    rec("M-07", "running the UP a second time is harmless", reError === null && still,
      reError ? String(reError.message).slice(0, 80) : "no error, column intact");
  }

  // -------------------------------------------------------------------- M-08
  {
    let downError = null;
    try { await sql(downSql); } catch (e) { downError = e; }
    const gone = !(await columns()).some((c) => c.column_name === COL);
    const chkGone = !(await checkNames()).some((c) => c.conname === CHK);
    rec("M-08", "the DOWN rolls back the column AND the constraint",
      downError === null && gone && chkGone,
      downError ? String(downError.message).slice(0, 80)
        : `column gone=${gone} check gone=${chkGone}`);
  }

  // -------------------------------------------------------------------- M-09
  {
    let reupError = null;
    try { await sql(upSql); } catch (e) { reupError = e; }
    const back = (await columns()).some((c) => c.column_name === COL);
    const hasChk = (await checkNames()).some((c) => c.conname === CHK);
    rec("M-09", "the UP works again after the DOWN — reversible both ways",
      reupError === null && back && hasChk,
      reupError ? String(reupError.message).slice(0, 80) : `column=${back} check=${hasChk}`);
  }
} finally {
  // Leaves the column in place; removes only this suite's own rows. An
  // invented invoice left behind is counted as outstanding revenue by any
  // suite that reads the superadmin list.
  for (const n of made) {
    await sql(`DELETE FROM ${T} WHERE number = $1`, [n]).catch(() => {});
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
