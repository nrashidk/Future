/**
 * MIGRATION 038 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` builds the schema from the drizzle definitions and marks
 * every migration applied WITHOUT RUNNING IT, so no .sql file in
 * server/migrations/ is ever executed by the harness. A syntax error first
 * runs at PRODUCTION BOOT, where the runner treats a failure as fatal and
 * Render has already deployed.
 *
 * 038 is additive, like 036, and carries the same risk: not that it fails, but
 * that it quietly does more than it claims, or that a constraint is absent and
 * every surface downstream passes against nothing.
 *
 *   M-01  the UP runs at all, from the file on disk
 *   M-02  it adds exactly the six intended columns. Five NULLABLE with no
 *         default — null means UNKNOWN, not failed, and a default of 'sent'
 *         would turn an unconfigured webhook into a confident claim — and
 *         email_sent_count NOT NULL DEFAULT 0, which is true of every invoice
 *         raised before this migration
 *   M-03  provider_message_id is UNIQUE. That is what makes a Svix redelivery
 *         a no-op rather than a second write, and what stops one event
 *         attaching itself to two invoices
 *   M-04  the unique index is PARTIAL: every invoice not yet emailed has a
 *         null here, and many nulls must coexist
 *   M-05  the email_sent_count CHECK actually FIRES. A check declared and not
 *         enforced is the same as none, and this one was the gap CLAUDE.md
 *         records: a constraint in the .sql alone exists in production and not
 *         in the harness
 *   M-06  THE ADDITIVE CLAIM, verified rather than asserted: 037's columns are
 *         untouched and an existing ROW survives with its values intact,
 *         including a backfilled email_sent_count of 0. An ALTER that rewrote
 *         data would pass a column-list check and fail this one
 *   M-07  running the UP twice is harmless
 *   M-08  the DOWN in the comment block works — columns, index and constraint
 *   M-09  the UP works again after the DOWN: reversible both ways
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

const FILE = "server/migrations/038_invoice_delivery.sql";
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

const T = "invoices";
const IDX = "invoices_provider_msg_idx";
const CHK = "invoices_email_sent_count_non_negative";
const NEW = ["delivery_detail", "delivery_status", "delivery_status_at",
             "email_sent_at", "email_sent_count", "provider_message_id"];
// A sample of 037's own columns, including the money and the lifecycle. If an
// ALTER dropped or rewrote any of these the invoice itself is gone.
const OLD = ["bill_to_name", "currency", "id", "issued_at", "number", "paid_at",
             "sequence", "status", "student_count", "subtotal_minor", "total_minor", "year"];

const columns = () =>
  sql(`SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = '${T}' ORDER BY column_name`);
const indexDefs = () =>
  sql(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${T}' ORDER BY indexname`);
const checkNames = () =>
  sql(`SELECT conname FROM pg_constraint
       WHERE conrelid = '${T}'::regclass AND contype = 'c' ORDER BY conname`);

// Start from the state BEFORE 038: the table without these columns. Dropping
// them is how this suite proves the FILE adds them, rather than reading what
// schema-push already built from the drizzle definitions.
await sql(`ALTER TABLE ${T} DROP CONSTRAINT IF EXISTS ${CHK}`);
await sql(`ALTER TABLE ${T}
             DROP COLUMN IF EXISTS delivery_detail,
             DROP COLUMN IF EXISTS delivery_status_at,
             DROP COLUMN IF EXISTS delivery_status,
             DROP COLUMN IF EXISTS provider_message_id,
             DROP COLUMN IF EXISTS email_sent_count,
             DROP COLUMN IF EXISTS email_sent_at`);

const tag = randomBytes(4).toString("hex");
const YEAR = 2026;
// A sequence range of this suite's own, far from the product's, so a
// concurrent createInvoice cannot collide with these fixtures.
const baseSeq = 900000 + Math.floor(Math.random() * 9000);
let seq = baseSeq;
const nextNumber = () => `FP-M038-${tag}-${seq++}`;

/**
 * A row that EXISTS BEFORE the migration, so M-06 can prove the ALTER left
 * real data alone rather than merely leaving a column list alone. ISSUED with
 * an issued_at, or `invoices_issued_has_date` refuses it — which is the point
 * of declaring 037's checks on the drizzle table as well.
 */
const preNumber = nextNumber();
await sql(
  `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                     unit_price_minor, per_student_minor, discount_percent,
                     subtotal_minor, vat_rate_bp, vat_minor, total_minor,
                     currency, status, issued_at)
   VALUES ($1, $2, $3, 'Pre-038 School', 40, 4000, 3600, 10,
           144000, 0, 0, 144000, 'AED', 'issued', NOW() - INTERVAL '3 days')`,
  [preNumber, YEAR, seq - 1],
);

const made = [preNumber];

try {
  // -------------------------------------------------------------------- M-01
  let upError = null;
  try { await sql(upSql); } catch (e) { upError = e; }
  rec("M-01", "the UP runs from the file on disk", upError === null,
    upError ? String(upError.message).slice(0, 90) : "no error");

  // -------------------------------------------------------------------- M-02
  {
    const cols = await columns();
    const added = cols.filter((c) => NEW.includes(c.column_name));
    const count = added.find((c) => c.column_name === "email_sent_count");
    const nullableOnes = added.filter((c) => c.column_name !== "email_sent_count");
    const fiveNullable = nullableOnes.length === 5 && nullableOnes.every(
      (c) => c.is_nullable === "YES" && (c.column_default === null || c.column_default === undefined),
    );
    const countShape = count?.is_nullable === "NO" && /^0\b/.test(String(count?.column_default ?? ""));
    rec("M-02", "six columns: five nullable-no-default, the count NOT NULL DEFAULT 0",
      added.length === 6 && fiveNullable && countShape,
      `added=${added.length} five nullable=${fiveNullable} count=${count?.is_nullable}/${count?.column_default ?? "none"}`);
  }

  // -------------------------------------------------------------------- M-03
  // Judged by whether a DUPLICATE IS ACTUALLY REFUSED, not by reading
  // pg_index: a constraint that exists but does not fire is the same as none.
  {
    const dup = `msg_dup_${tag}`;
    const a = nextNumber(); made.push(a);
    await sql(
      `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                         unit_price_minor, per_student_minor, subtotal_minor,
                         total_minor, currency, provider_message_id)
       VALUES ($1, $2, $3, 'Dup A', 1, 4000, 4000, 4000, 4000, 'AED', $4)`,
      [a, YEAR, seq - 1, dup],
    );
    let refused = false;
    const b = nextNumber();
    try {
      await sql(
        `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                           unit_price_minor, per_student_minor, subtotal_minor,
                           total_minor, currency, provider_message_id)
         VALUES ($1, $2, $3, 'Dup B', 1, 4000, 4000, 4000, 4000, 'AED', $4)`,
        [b, YEAR, seq - 1, dup],
      );
      made.push(b);
    } catch (e) { refused = String(e.code) === "23505"; }
    rec("M-03", "a SECOND invoice with the same provider_message_id is refused", refused,
      refused ? "23505 unique_violation" : "DUPLICATE ACCEPTED");
  }

  // -------------------------------------------------------------------- M-04
  // Partial, or every invoice not yet emailed would collide with every other.
  {
    let bothInserted = false;
    try {
      for (const name of ["Null A", "Null B"]) {
        const n = nextNumber(); made.push(n);
        await sql(
          `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                             unit_price_minor, per_student_minor, subtotal_minor,
                             total_minor, currency)
           VALUES ($1, $2, $3, $4, 1, 4000, 4000, 4000, 4000, 'AED')`,
          [n, YEAR, seq - 1, name],
        );
      }
      bothInserted = true;
    } catch { bothInserted = false; }
    const def = (await indexDefs()).find((i) => i.indexname === IDX);
    rec("M-04", "MANY invoices may have a null provider_message_id (partial index)",
      bothInserted && /WHERE .*provider_message_id IS NOT NULL/i.test(def?.indexdef ?? ""),
      `two nulls accepted=${bothInserted} partial=${/WHERE/i.test(def?.indexdef ?? "")}`);
  }

  // -------------------------------------------------------------------- M-05
  // THE CHECK, judged by whether the DATABASE refuses the row. CLAUDE.md
  // records why this is asserted rather than read: a check written only in a
  // .sql is live in production and absent from the harness, and the gap lies
  // in the dangerous direction.
  {
    const n = nextNumber();
    let refused = false;
    try {
      await sql(
        `INSERT INTO ${T} (number, year, sequence, bill_to_name, student_count,
                           unit_price_minor, per_student_minor, subtotal_minor,
                           total_minor, currency, email_sent_count)
         VALUES ($1, $2, $3, 'Negative', 1, 4000, 4000, 4000, 4000, 'AED', -1)`,
        [n, YEAR, seq - 1],
      );
      made.push(n);
    } catch (e) { refused = String(e.code) === "23514"; }
    const present = (await checkNames()).some((c) => c.conname === CHK);
    rec("M-05", "a NEGATIVE email_sent_count is refused by the database", refused && present,
      refused ? `23514, constraint present=${present}` : "NEGATIVE ACCEPTED");
  }

  // -------------------------------------------------------------------- M-06
  // THE ADDITIVE CLAIM. A column list surviving is weaker than a ROW surviving
  // with its values: an ALTER that rewrote data would pass the first and fail
  // this one.
  {
    const cols = (await columns()).map((c) => c.column_name);
    const oldIntact = OLD.every((c) => cols.includes(c));
    const [row] = await sql(
      `SELECT status, total_minor, subtotal_minor, email_sent_count, email_sent_at,
              delivery_status, (issued_at < NOW() - INTERVAL '1 day') AS issued_at_preserved
         FROM ${T} WHERE number = $1`, [preNumber]);
    rec("M-06", "pre-existing invoices survive intact; the count backfills to 0",
      oldIntact && row?.status === "issued" && row?.total_minor === 144000
        && row?.subtotal_minor === 144000 && row?.email_sent_count === 0
        && row?.email_sent_at === null && row?.delivery_status === null
        && row?.issued_at_preserved === true,
      `old cols=${oldIntact} status=${row?.status} total=${row?.total_minor} count=${row?.email_sent_count} issued_at kept=${row?.issued_at_preserved}`);
  }

  // -------------------------------------------------------------------- M-07
  {
    let reError = null;
    try { await sql(upSql); } catch (e) { reError = e; }
    const n = (await columns()).filter((c) => NEW.includes(c.column_name)).length;
    rec("M-07", "running the UP a second time is harmless", reError === null && n === 6,
      reError ? String(reError.message).slice(0, 80) : `no error, ${n} new columns`);
  }

  // -------------------------------------------------------------------- M-08
  {
    let downError = null;
    try { await sql(downSql); } catch (e) { downError = e; }
    const left = (await columns()).filter((c) => NEW.includes(c.column_name)).length;
    const idxGone = !(await indexDefs()).some((i) => i.indexname === IDX);
    const chkGone = !(await checkNames()).some((c) => c.conname === CHK);
    rec("M-08", "the DOWN rolls back columns, index AND constraint",
      downError === null && left === 0 && idxGone && chkGone,
      downError ? String(downError.message).slice(0, 80)
        : `columns left=${left} index gone=${idxGone} check gone=${chkGone}`);
  }

  // -------------------------------------------------------------------- M-09
  {
    let reupError = null;
    try { await sql(upSql); } catch (e) { reupError = e; }
    const n = (await columns()).filter((c) => NEW.includes(c.column_name)).length;
    const hasIdx = (await indexDefs()).some((i) => i.indexname === IDX);
    const hasChk = (await checkNames()).some((c) => c.conname === CHK);
    rec("M-09", "the UP works again after the DOWN — reversible both ways",
      reupError === null && n === 6 && hasIdx && hasChk,
      reupError ? String(reupError.message).slice(0, 80)
        : `${n} columns, index=${hasIdx} check=${hasChk}`);
  }
} finally {
  // Leaves the six columns in place; removes only this suite's own rows. An
  // invented invoice left behind would be counted as outstanding revenue by
  // any suite that reads the superadmin list — the same class of fault as the
  // leftover countries that made school-setup's catalogue count fail.
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
