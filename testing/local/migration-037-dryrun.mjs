/**
 * MIGRATION 037 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` builds the schema from the drizzle definitions and marks
 * every migration applied WITHOUT RUNNING IT, so no .sql file in
 * server/migrations/ is ever executed by the harness. A syntax error first
 * runs at PRODUCTION BOOT, where the runner treats a failure as fatal and
 * Render has already deployed.
 *
 * MOST OF THIS SUITE IS ABOUT THE CHECK CONSTRAINTS, and that is deliberate.
 * An invoice is a document a customer keeps: the figures on it have to add up,
 * and "shared/invoice.ts computes them correctly" is a promise about one
 * TypeScript function, not about the column. A hand-run UPDATE, a second
 * caller written later, or a refactor that reorders two lines would each pass
 * review and produce a document whose total does not equal its own line items.
 * The database is the only place that can refuse that, so each constraint is
 * tested by trying to VIOLATE it rather than by reading pg_constraint.
 *
 *   M-01  the UP runs at all, from the file on disk
 *   M-02  the columns exist with the right nullability and defaults —
 *         vat_rate_bp 0 and status 'draft', so a fresh invoice is a PROFORMA
 *   M-03  THE POSITIVE CONTROL: a valid invoice inserts. Without it every
 *         refusal below would pass against a table that accepts nothing
 *   M-04  total_minor must equal subtotal + vat — the arithmetic guarantee
 *   M-05  a status outside the four is refused
 *   M-06  a paid invoice without a paid_at is refused
 *   M-07  an issued invoice without an issued_at is refused
 *   M-08  zero or negative students is refused
 *   M-09  two invoices cannot share a year and sequence
 *   M-10  organization_id is SET NULL on delete, so an invoice OUTLIVES the
 *         school — which is the whole reason the bill-to fields are a snapshot
 *   M-11  running the UP twice is harmless
 *   M-12  the DOWN in the comment block actually works
 *   M-13  the UP works again after the DOWN
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
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

/** Did this statement get refused by a constraint, rather than succeed? */
async function refused(text, params = []) {
  try {
    await sql(text, params);
    return null;
  } catch (e) {
    return String(e.code ?? e.message);
  }
}

const FILE = "server/migrations/037_invoices.sql";
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
const columns = () =>
  sql(`SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = '${T}' ORDER BY column_name`);
const tableExists = async () =>
  (await sql(`SELECT 1 FROM information_schema.tables WHERE table_name = '${T}'`)).length === 1;

const tag = randomBytes(4).toString("hex");
let seq = 0;
/** A VALID invoice. Each case below breaks exactly one thing about it. */
const valid = (over = {}) => {
  seq += 1;
  const base = {
    number: `FP-2099-${String(seq).padStart(4, "0")}-${tag}`,
    year: 2099, sequence: seq,
    bill_to_name: `Test School ${tag}`,
    student_count: 100, unit_price_minor: 4000, per_student_minor: 3600,
    discount_percent: 10, subtotal_minor: 360000, vat_rate_bp: 0, vat_minor: 0,
    total_minor: 360000, currency: "AED", status: "draft",
    issued_at: null, paid_at: null, organization_id: null,
  };
  return { ...base, ...over };
};
const insert = (v) => {
  const keys = Object.keys(v);
  const ph = keys.map((_, i) => `$${i + 1}`).join(", ");
  return [`INSERT INTO ${T} (${keys.join(", ")}) VALUES (${ph})`, keys.map((k) => v[k])];
};

// Start from nothing: schema-push already created this table from the drizzle
// definitions, and the point is to prove the FILE creates it.
await sql(`DROP TABLE IF EXISTS ${T}`);

try {
  // -------------------------------------------------------------------- M-01
  let upError = null;
  try { await sql(upSql); } catch (e) { upError = e; }
  rec("M-01", "the UP runs from the file on disk", upError === null,
    upError ? String(upError.message).slice(0, 90) : "no error");

  // -------------------------------------------------------------------- M-02
  {
    const cols = await columns();
    const by = Object.fromEntries(cols.map((c) => [c.column_name, c]));
    // A fresh invoice is a PROFORMA with no tax: a default of 500 would put
    // VAT on a document that has no TRN behind it.
    const vatDefault = String(by.vat_rate_bp?.column_default ?? "").startsWith("0");
    const statusDefault = String(by.status?.column_default ?? "").includes("draft");
    const trnNullable = by.supplier_trn?.is_nullable === "YES";
    const orgNullable = by.organization_id?.is_nullable === "YES";
    rec("M-02", "vat 0, status draft, TRN and organization both nullable",
      vatDefault && statusDefault && trnNullable && orgNullable,
      `vat=${by.vat_rate_bp?.column_default} status=${by.status?.column_default} trn_null=${trnNullable} org_null=${orgNullable}`);
  }

  // -------------------------------------------------------------------- M-03
  // THE POSITIVE CONTROL. Without it every refusal below passes against a
  // table that refuses everything.
  {
    const err = await refused(...insert(valid()));
    rec("M-03", "a VALID invoice inserts — the control for every refusal below",
      err === null, err ?? "inserted");
  }

  // -------------------------------------------------------------------- M-04
  // The arithmetic guarantee, and the reason most of this suite exists.
  {
    const err = await refused(...insert(valid({ total_minor: 999999 })));
    rec("M-04", "total_minor must equal subtotal + vat", err === "23514",
      err ? `refused ${err}` : "ACCEPTED A DOCUMENT THAT DOES NOT ADD UP");
  }

  // -------------------------------------------------------------------- M-05
  {
    const err = await refused(...insert(valid({ status: "sent" })));
    rec("M-05", "a status outside the four is refused", err === "23514",
      err ? `refused ${err}` : "ACCEPTED");
  }

  // -------------------------------------------------------------------- M-06
  // A paid invoice with no payment date cannot be aged or reconciled.
  {
    const err = await refused(...insert(valid({
      status: "paid", issued_at: new Date().toISOString(), paid_at: null,
    })));
    rec("M-06", "a PAID invoice with no paid_at is refused", err === "23514",
      err ? `refused ${err}` : "ACCEPTED");
  }

  // -------------------------------------------------------------------- M-07
  {
    const err = await refused(...insert(valid({ status: "issued", issued_at: null })));
    rec("M-07", "an ISSUED invoice with no issued_at is refused", err === "23514",
      err ? `refused ${err}` : "ACCEPTED");
  }

  // -------------------------------------------------------------------- M-08
  {
    const zero = await refused(...insert(valid({ student_count: 0 })));
    const neg = await refused(...insert(valid({ student_count: -5 })));
    rec("M-08", "zero and negative student counts are both refused",
      zero === "23514" && neg === "23514", `zero=${zero} negative=${neg}`);
  }

  // -------------------------------------------------------------------- M-09
  // A repeated invoice number is the one defect a finance department cannot
  // work around, and a rule living only in application code is one concurrent
  // request away from being broken.
  {
    const first = valid({ year: 2098, sequence: 7, number: `FP-2098-0007-a-${tag}` });
    await sql(...insert(first));
    const err = await refused(...insert(
      valid({ year: 2098, sequence: 7, number: `FP-2098-0007-b-${tag}` })));
    rec("M-09", "two invoices cannot share a year and sequence", err === "23505",
      err ? `refused ${err}` : "ACCEPTED A DUPLICATE NUMBER");
  }

  // -------------------------------------------------------------------- M-10
  // THE REASON THE BILL-TO FIELDS ARE A SNAPSHOT. An invoice is a historical
  // document and must outlive the school it was sent to.
  {
    // organizations.admin_user_id is NOT NULL, so the school needs an owner
    // before it can exist — which is also why deleting a school and then its
    // admin is two acts (superadmin-delete-user.mjs D-07).
    const [owner] = await sql(
      `INSERT INTO users (id, username, email, account_type, password_hash)
       VALUES (gen_random_uuid(), $1, $2, 'individual', '$2b$10$notarealhashbutnotnull')
       RETURNING id`, [`invown${tag}`, `inv.own.${tag}@futurepath.test`]);
    const [org] = await sql(
      `INSERT INTO organizations (id, name, admin_user_id, total_licenses, used_licenses, country_id)
       VALUES (gen_random_uuid(), $1, $2, 10, 0, 'uae') RETURNING id`,
      [`Inv School ${tag}`, owner.id]);
    const v = valid({ organization_id: org.id, bill_to_name: `Inv School ${tag}` });
    await sql(...insert(v));
    await sql(`DELETE FROM organizations WHERE id = $1`, [org.id]);
    const [row] = await sql(
      `SELECT organization_id, bill_to_name, total_minor FROM ${T} WHERE number = $1`, [v.number]);
    rec("M-10", "the invoice SURVIVES its school's deletion, name and figures intact",
      !!row && row.organization_id === null && row.bill_to_name === `Inv School ${tag}`
        && Number(row.total_minor) === 360000,
      row ? `org=${row.organization_id} name kept=${row.bill_to_name === `Inv School ${tag}`}` : "ROW GONE");
  }

  // -------------------------------------------------------------------- M-11
  {
    let reError = null;
    try { await sql(upSql); } catch (e) { reError = e; }
    rec("M-11", "running the UP a second time is harmless",
      reError === null && (await tableExists()),
      reError ? String(reError.message).slice(0, 80) : "no error");
  }

  // -------------------------------------------------------------------- M-12
  {
    let downError = null;
    try { await sql(downSql); } catch (e) { downError = e; }
    const gone = !(await tableExists());
    rec("M-12", "the DOWN from the comment block actually rolls back",
      downError === null && gone,
      downError ? String(downError.message).slice(0, 80) : `table gone: ${gone}`);
  }

  // -------------------------------------------------------------------- M-13
  {
    let reupError = null;
    try { await sql(upSql); } catch (e) { reupError = e; }
    const cols = (await columns()).length;
    rec("M-13", "the UP works again after the DOWN — reversible both ways",
      reupError === null && cols > 20,
      reupError ? String(reupError.message).slice(0, 80) : `${cols} columns`);
  }
} finally {
  try { await sql(`DELETE FROM ${T} WHERE number LIKE $1`, [`%${tag}`]); } catch {}
  try { await sql(`DELETE FROM organizations WHERE name = $1`, [`Inv School ${tag}`]); } catch {}
  try { await sql(`DELETE FROM users WHERE username = $1`, [`invown${tag}`]); } catch {}
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
