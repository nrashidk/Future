/**
 * DRY RUN FOR MIGRATION 033 — a licence price per country, in local currency.
 *
 *   M-01  the columns and the both-or-neither constraint exist
 *   M-02  the UAE is priced in dirhams at the exact peg conversion, not
 *         rounded up — rounding 36.725 to 37.00 is a 0.75% price RISE nobody
 *         asked for, and this migration changes the currency, not the price
 *   M-03  Saudi Arabia is priced in riyals
 *   M-04  every other country is left NULL and keeps transacting in dollars
 *   M-05  the constraint REFUSES half a configuration — a price with no
 *         currency is how a country bills 3700 cents for a 37 dirham licence
 *   M-06  ...and refuses a zero or negative price
 *   M-07  running it twice changes nothing and re-prices nobody
 *   M-08  it does not overwrite a price somebody already set
 *   M-09  the UAE is matched whether its id is spelled 'uae' or 'ae'
 */
import { readFile } from "fs/promises";
import { build } from "./fixtures.mjs";

const PORT = process.env.PGLITE_TCP_PORT ?? 55432;
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(58)} ${note}`);
};

const { Client } = await import("pg");
const client = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

const SQL = await readFile("server/migrations/033_country_license_pricing.sql", "utf8");
await build();

// The harness pushes the schema up front, so the columns already exist and may
// already hold values. Clearing them is what makes this a dry RUN rather than
// an assertion about whatever state the database happened to be in.
await q(`UPDATE countries SET license_price_minor = NULL, license_currency = NULL`);

/**
 * TWO MORE COUNTRIES, because the fixture seeds only the UAE.
 *
 * Without them "Saudi Arabia is priced in riyals" has nothing to price and
 * "every other country is left alone" is a statement about an empty set —
 * both pass while asserting nothing, which is the failure mode this whole
 * suite is written against.
 *
 * Egypt is the control: a real country the migration must NOT touch.
 */
for (const [id, code, name] of [["ksa", "SAU", "Saudi Arabia"], ["egy", "EGY", "Egypt"]]) {
  await q(
    `INSERT INTO countries (id, code, name, mission, vision, priority_sectors, national_goals)
     VALUES ($1, $2, $3, 'dry run', 'dry run', ARRAY['Technology'], ARRAY['Growth'])
     ON CONFLICT (id) DO NOTHING`,
    [id, code, name]);
}

const before = await q(
  `SELECT id, code, license_price_minor, license_currency FROM countries ORDER BY id`);
console.log(`\ncountries before: ${before.length} ` +
  `(${before.map((c) => `${c.id}/${c.code}`).join(", ")})`);
console.log(`priced before: ${before.filter((c) => c.license_price_minor !== null).length}\n`);

await client.query(SQL);

// ------------------------------------------------- 1. structure
{
  const cols = (await q(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name = 'countries' AND column_name LIKE 'license_%'`)).map((r) => r.column_name);
  const [con] = await q(
    `SELECT count(*)::int n FROM pg_constraint WHERE conname = 'countries_license_price_pair_check'`);
  rec("M-01", "both columns and the both-or-neither constraint exist",
    cols.includes("license_price_minor") && cols.includes("license_currency") && Number(con.n) === 1,
    `columns: ${cols.join(", ")}; constraint present: ${Number(con.n) === 1}`);
}

// ---------------------------------- 2. the UAE, at the exact peg conversion
{
  const [uae] = await q(
    `SELECT license_price_minor AS p, license_currency AS c FROM countries
      WHERE LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE') LIMIT 1`);
  // 10 x 3.6725 = 36.725 -> 3673 minor units. NOT 3700: rounding up is a
  // price rise, and the exact figure is what keeps this currency-only.
  rec("M-02", "the UAE is priced in dirhams at the exact peg, not rounded up",
    Number(uae?.p) === 3673 && uae?.c === "AED",
    `${uae?.p} ${uae?.c} (36.73 AED; 3700 would have been a 0.75% rise)`);
}

// ------------------------------------------------------- 3. Saudi Arabia
{
  const [ksa] = await q(
    `SELECT license_price_minor AS p, license_currency AS c FROM countries
      WHERE LOWER(id) IN ('ksa','sa','saudi','saudi-arabia') OR UPPER(code) IN ('SAU','SA') LIMIT 1`);
  // Required to exist, not merely "correct if present": an absent row made
  // this case pass without pricing anything.
  rec("M-03", "Saudi Arabia is priced in riyals",
    !!ksa && Number(ksa.p) === 3750 && ksa.c === "SAR",
    ksa ? `${ksa.p} ${ksa.c} (37.50 SAR)` : "NO SAUDI ROW — this case proved nothing");
}

// ------------------------------- 4. everyone else is left to the dollar
{
  const others = await q(
    `SELECT id, license_price_minor AS p, license_currency AS c FROM countries
      WHERE NOT (LOWER(id) IN ('uae','ae','ksa','sa','saudi','saudi-arabia')
                 OR UPPER(code) IN ('ARE','AE','SAU','SA'))`);
  const priced = others.filter((o) => o.p !== null);
  // There must BE others, or this is a statement about an empty set.
  rec("M-04", "every other country is left unpriced, not guessed at",
    others.length > 0 && priced.length === 0,
    `${others.length} other countries checked (${others.map((o) => o.id).join(", ")}), ` +
    `${priced.length} given a price` +
    (priced.length ? `: ${priced.map((p) => p.id).join(", ")}` : " — they fall back to USD"));
}

// ------------------------- 5. the constraint refuses half a configuration
{
  const [c] = await q(`SELECT id FROM countries LIMIT 1`);
  const attempts = [
    ["a price with no currency", `UPDATE countries SET license_price_minor = 3700, license_currency = NULL WHERE id = $1`],
    ["a currency with no price", `UPDATE countries SET license_price_minor = NULL, license_currency = 'AED' WHERE id = $1`],
  ];
  const refusals = [];
  for (const [label, sql] of attempts) {
    try { await q(sql, [c.id]); refusals.push(`${label}: ACCEPTED`); }
    catch (e) { refusals.push(`${label}: ${e.constraint ?? e.code}`); }
  }
  rec("M-05", "half a configuration is refused by the database",
    refusals.every((r) => r.includes("countries_license_price_pair_check")),
    refusals.join(" | "));
}

// --------------------------------------- 6. and a non-positive price
{
  const [c] = await q(`SELECT id FROM countries LIMIT 1`);
  let refused = null;
  try {
    await q(`UPDATE countries SET license_price_minor = 0, license_currency = 'AED' WHERE id = $1`, [c.id]);
  } catch (e) { refused = e.constraint ?? e.code; }
  rec("M-06", "a zero price is refused rather than selling for nothing",
    refused === "countries_license_price_pair_check", `${refused ?? "ACCEPTED"}`);
}

// ------------------------------------------- 7. a second run is a no-op
{
  const snapshot = await q(
    `SELECT id, license_price_minor AS p, license_currency AS c FROM countries ORDER BY id`);
  await client.query(SQL);
  const after = await q(
    `SELECT id, license_price_minor AS p, license_currency AS c FROM countries ORDER BY id`);
  rec("M-07", "a second run re-prices nobody",
    JSON.stringify(snapshot) === JSON.stringify(after),
    `${after.filter((a) => a.p !== null).length} priced, unchanged`);
}

// -------------------------- 8. it does not overwrite a price already set
{
  // The real risk on a re-run against production: a price somebody chose
  // deliberately being reset to the migration's opening figure.
  await q(`UPDATE countries SET license_price_minor = 5000, license_currency = 'AED'
            WHERE LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE')`);
  await client.query(SQL);
  const [uae] = await q(
    `SELECT license_price_minor AS p FROM countries
      WHERE LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE') LIMIT 1`);
  rec("M-08", "a price somebody already set is left alone",
    Number(uae?.p) === 5000, `still ${uae?.p}, not reset to 3673`);
  await q(`UPDATE countries SET license_price_minor = 3673 WHERE license_price_minor = 5000`);
}

// ------------------------------ 9. the UAE is found under either spelling
{
  // This database's UAE row has been spelled both 'uae' and 'ae'. A migration
  // matching only one would leave it unpriced with no error at all.
  const [row] = await q(
    `SELECT id, code FROM countries WHERE LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE') LIMIT 1`);
  await q(`UPDATE countries SET license_price_minor = NULL, license_currency = NULL WHERE id = $1`, [row.id]);
  await client.query(SQL);
  const [after] = await q(`SELECT license_price_minor AS p FROM countries WHERE id = $1`, [row.id]);
  rec("M-09", "the UAE is matched by id OR ISO code, either spelling",
    Number(after?.p) === 3673, `id="${row.id}" code="${row.code}" -> ${after?.p}`);
}

await client.end();

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`migration-033 dry run: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
