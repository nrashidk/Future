/**
 * DRY RUN FOR MIGRATION 032 — the licence grants ledger.
 *
 * The migration creates license_grants and backfills one row per school from
 * organizations.total_licenses, so that the sum of a school's deltas equals its
 * total from the moment the table exists.
 *
 * WHAT CAN GO WRONG, and what each case measures:
 *
 *   M-01  the table and its constraints exist at all
 *   M-02  every school with licences gets exactly one row, summing to its total
 *         -- the invariant every later report depends on
 *   M-03  a school with no licences gets NO row (a zero row would have to be
 *         filtered out of every report, and sums to zero either way)
 *   M-04  running it twice does not double anybody's entitlement -- the single
 *         most damaging way this migration could fail, and silent
 *   M-05  the backfill invents NO revenue: not one row claims money, even for
 *         schools that have a Stripe id and an amount on record
 *   M-06  the known Stripe id is preserved somewhere, so backfilling as
 *         'backfill' rather than 'purchase' does not throw the fact away
 *   M-07  historic rows are dated from the purchase date, not from today, or
 *         revenue-by-period would report every historic school as granted now
 *   M-08  the partial unique index refuses a duplicate Stripe payment -- the
 *         webhook-retry guard, which is the reason the index is partial
 *   M-09  ...while still permitting many rows with no Stripe id, which a plain
 *         unique index would not
 *   M-10  the money check constraint refuses a comp that carries an amount
 *   M-11  a negative delta is accepted, since a reduction must be a row rather
 *         than an edit to an earlier one
 *
 * The before/after counts are printed for every case, because this migration
 * writes rows and "it ran without error" is not evidence that it wrote the
 * right ones.
 */
import { readFile } from "fs/promises";
import { build } from "./fixtures.mjs";

const PORT = process.env.PGLITE_TCP_PORT ?? 55432;

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(56)} ${note}`);
};

const { Client } = await import("pg");
const client = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

const SQL = await readFile("server/migrations/032_license_grants.sql", "utf8");

// Real schools, built by the application rather than hand-written INSERTs, so
// this cannot drift from the real schema.
await build();

/**
 * The migration is additive and idempotent, but the harness pushes the whole
 * schema up front, so license_grants already exists and may already hold the
 * backfill. Clearing it is what makes this a dry RUN rather than an assertion
 * about whatever state the database happened to be in.
 */
await q(`DELETE FROM license_grants`);

// A school with no licences at all, for M-03.
const [zeroOrg] = await q(
  `UPDATE organizations SET total_licenses = 0
     WHERE id = (SELECT id FROM organizations ORDER BY created_at DESC LIMIT 1)
   RETURNING id, name`);

// A school with a payment on record, for M-05/M-06/M-07.
const PAID_ID = "pi_dryrun_032_onrecord";
const [paidOrg] = await q(
  `UPDATE organizations
      SET stripe_payment_id = $1, amount_paid = 1234.5,
          purchase_date = TIMESTAMP '2024-03-01 10:00:00'
    WHERE id = (SELECT id FROM organizations WHERE total_licenses <> 0 ORDER BY created_at LIMIT 1)
   RETURNING id, name, total_licenses`,
  [PAID_ID]);

const before = Number((await q(`SELECT count(*)::int n FROM organizations WHERE total_licenses <> 0`))[0].n);
console.log(`\nschools with licences: ${before}`);
console.log(`zero-licence school:   ${zeroOrg.name}`);
console.log(`school with a payment: ${paidOrg.name} (${paidOrg.total_licenses} licences)\n`);

// ------------------------------------------------------- 1. it runs at all
await client.query(SQL);
{
  const [t] = await q(
    `SELECT count(*)::int n FROM information_schema.tables WHERE table_name = 'license_grants'`);
  const cons = (await q(
    `SELECT conname FROM pg_constraint WHERE conname LIKE 'license_grants%'`)).map((r) => r.conname);
  rec("M-01", "the table and both check constraints exist",
    Number(t.n) === 1 &&
    cons.includes("license_grants_kind_check") &&
    cons.includes("license_grants_purchase_money_check"),
    `${cons.length} constraints: ${cons.join(", ")}`);
}

// ------------------------- 2. the invariant: deltas sum to total_licenses
{
  const bad = await q(
    `SELECT o.id, o.name, o.total_licenses,
            COALESCE(SUM(g.licenses_delta), 0)::int AS ledger
       FROM organizations o
       LEFT JOIN license_grants g ON g.organization_id = o.id
      GROUP BY o.id, o.name, o.total_licenses
     HAVING COALESCE(SUM(g.licenses_delta), 0) <> o.total_licenses`);
  const rows = Number((await q(`SELECT count(*)::int n FROM license_grants`))[0].n);
  rec("M-02", "every school's deltas sum to its licence total",
    bad.length === 0 && rows === before,
    `${rows} rows for ${before} schools; ${bad.length} mismatched` +
    (bad.length ? `: ${bad.map((b) => `${b.name} ${b.ledger}≠${b.total_licenses}`).join(", ")}` : ""));
}

// ------------------------------- 3. a school with no licences gets no row
{
  const n = Number((await q(
    `SELECT count(*)::int n FROM license_grants WHERE organization_id = $1`, [zeroOrg.id]))[0].n);
  rec("M-03", "a school with no licences gets no row at all",
    n === 0, `${n} rows for "${zeroOrg.name}" (0 licences)`);
}

// ----------------------------------------- 4. running it twice is a no-op
{
  const beforeRows = Number((await q(`SELECT count(*)::int n FROM license_grants`))[0].n);
  const beforeSum = Number((await q(`SELECT COALESCE(SUM(licenses_delta),0)::int n FROM license_grants`))[0].n);
  await client.query(SQL);
  const afterRows = Number((await q(`SELECT count(*)::int n FROM license_grants`))[0].n);
  const afterSum = Number((await q(`SELECT COALESCE(SUM(licenses_delta),0)::int n FROM license_grants`))[0].n);
  rec("M-04", "a second run doubles nobody's entitlement",
    afterRows === beforeRows && afterSum === beforeSum,
    `rows ${beforeRows} -> ${afterRows}, licences ${beforeSum} -> ${afterSum}`);
}

// --------------------------------- 5. the backfill invents no revenue
{
  const money = await q(
    `SELECT count(*)::int AS n, COALESCE(SUM(amount_paid), 0)::real AS total
       FROM license_grants WHERE amount_paid IS NOT NULL OR currency IS NOT NULL`);
  const kinds = await q(`SELECT kind, count(*)::int n FROM license_grants GROUP BY kind ORDER BY kind`);
  rec("M-05", "no backfilled row claims any money",
    Number(money[0].n) === 0 && Number(money[0].total) === 0,
    `${money[0].n} rows with money, total ${money[0].total}; kinds: ` +
    kinds.map((k) => `${k.kind}=${k.n}`).join(", "));
}

// ------------------------- 6. but the Stripe id on record is not thrown away
{
  const [row] = await q(
    `SELECT note, amount_paid FROM license_grants WHERE organization_id = $1`, [paidOrg.id]);
  rec("M-06", "the Stripe id on record is preserved in the note, not the money",
    !!row && row.note?.includes(PAID_ID) && row.note?.includes("1234.5") && row.amount_paid === null,
    row ? `amount_paid=${row.amount_paid}, note mentions id: ${row.note.includes(PAID_ID)}` : "NO ROW");
}

// --------------------------------- 7. dated from the purchase, not from today
{
  const [row] = await q(
    `SELECT created_at FROM license_grants WHERE organization_id = $1`, [paidOrg.id]);
  const year = row ? new Date(row.created_at).getUTCFullYear() : null;
  rec("M-07", "a historic grant keeps its purchase date, not today's",
    year === 2024, `created_at=${row?.created_at?.toISOString?.() ?? row?.created_at} (year ${year})`);
}

// ------------------------------ 8. the webhook-retry guard actually refuses
{
  const [org] = await q(`SELECT id FROM organizations WHERE total_licenses <> 0 LIMIT 1`);
  await q(
    `INSERT INTO license_grants (organization_id, kind, licenses_delta, amount_paid, currency, stripe_payment_id)
     VALUES ($1, 'purchase', 10, 99.0, 'USD', 'pi_retry_probe')`, [org.id]);
  let refused = null;
  try {
    await q(
      `INSERT INTO license_grants (organization_id, kind, licenses_delta, amount_paid, currency, stripe_payment_id)
       VALUES ($1, 'purchase', 10, 99.0, 'USD', 'pi_retry_probe')`, [org.id]);
  } catch (e) { refused = e.code ?? e.message; }
  const n = Number((await q(
    `SELECT count(*)::int n FROM license_grants WHERE stripe_payment_id = 'pi_retry_probe'`))[0].n);
  // The count is the evidence: a refusal that still wrote the row would be
  // worse than no constraint, because it would look safe.
  rec("M-08", "a repeated Stripe payment is refused and grants nothing twice",
    refused === "23505" && n === 1, `error ${refused}, ${n} row(s) for that payment`);
}

// ---------------------- 9. ...while many rows with no Stripe id are allowed
{
  const [org] = await q(`SELECT id FROM organizations WHERE total_licenses <> 0 LIMIT 1`);
  let err = null;
  try {
    await q(`INSERT INTO license_grants (organization_id, kind, licenses_delta, note)
             VALUES ($1, 'comp', 5, 'dry run comp A'), ($1, 'comp', 5, 'dry run comp B')`, [org.id]);
  } catch (e) { err = e.code ?? e.message; }
  const n = Number((await q(
    `SELECT count(*)::int n FROM license_grants WHERE note LIKE 'dry run comp%'`))[0].n);
  rec("M-09", "many rows with no Stripe id are still permitted",
    err === null && n === 2, err ? `REFUSED: ${err}` : `${n} comp rows accepted`);
}

// --------------------------- 10. a comp carrying money is refused
{
  const [org] = await q(`SELECT id FROM organizations WHERE total_licenses <> 0 LIMIT 1`);
  let refused = null;
  try {
    await q(`INSERT INTO license_grants (organization_id, kind, licenses_delta, amount_paid, currency)
             VALUES ($1, 'comp', 5, 500.0, 'USD')`, [org.id]);
  } catch (e) { refused = e.constraint ?? e.code ?? e.message; }
  rec("M-10", "a comp that carries an amount is refused",
    refused === "license_grants_purchase_money_check",
    `${refused ?? "ACCEPTED — a giveaway would appear in revenue"}`);
}

// ------------------------------- 11. a reduction is a row, and is allowed
{
  const [org] = await q(`SELECT id FROM organizations WHERE total_licenses <> 0 LIMIT 1`);
  let err = null;
  try {
    await q(`INSERT INTO license_grants (organization_id, kind, licenses_delta, note)
             VALUES ($1, 'adjustment', -3, 'dry run reduction')`, [org.id]);
  } catch (e) { err = e.code ?? e.message; }
  const [row] = await q(`SELECT licenses_delta FROM license_grants WHERE note = 'dry run reduction'`);
  rec("M-11", "a negative delta is accepted, so a reduction is a row",
    err === null && Number(row?.licenses_delta) === -3,
    err ? `REFUSED: ${err}` : `delta=${row?.licenses_delta}`);
}

// Leave the database as the migration would: probe rows out, backfill intact.
await q(`DELETE FROM license_grants WHERE note LIKE 'dry run %' OR stripe_payment_id = 'pi_retry_probe'`);
await q(`UPDATE organizations SET stripe_payment_id = NULL, amount_paid = NULL, purchase_date = NULL
          WHERE id = $1`, [paidOrg.id]);

await client.end();

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`migration-032 dry run: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
