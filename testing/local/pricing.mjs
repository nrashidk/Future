/**
 * LICENCE PRICING PER COUNTRY.
 *
 * Every school used to be charged from a hardcoded $10 in a route. No UAE
 * business expects a dollar invoice, and the buyer's bank adds a
 * foreign-transaction fee on top of the price for it.
 *
 * The payment route itself cannot be exercised here — it needs Stripe, and the
 * harness has no network. This suite covers the decision that route makes, by
 * hitting the quote endpoint that reads the SAME country row through the SAME
 * function. If the quote is right, the charge is right, because there is only
 * one calculation left in the codebase.
 *
 *   P-01  the UAE quotes dirhams, not dollars
 *   P-02  the amount is the country's price, not the old $10
 *   P-03  a different country quotes its own currency
 *   P-04  an unpriced country falls back to USD AND SAYS SO, rather than
 *         failing the sale or hiding it
 *   P-05  an unknown country is REFUSED, not quietly quoted in dollars — a
 *         typo must not sell a UAE school a dollar licence
 *   P-06  the volume tiers apply in local currency
 *   P-07  minor units and major units agree, using the currency's own exponent
 *   P-08  a three-decimal Gulf currency is handled, since Stripe rejects an
 *         amount that is not a multiple of ten in those
 *   P-09  the quote never takes a price from the request
 */
import { build } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(56)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const quote = async (qs) => {
  const r = await fetch(`${BASE}/api/pricing/quote?${qs}`);
  let body = null;
  try { body = await r.json(); } catch { /* HTML from the SPA catch-all */ }
  return { status: r.status, body };
};

await build();

// Price the fixtures the way migration 033 does, plus two more countries to
// prove the quote follows the ROW and not a hardcoded table.
await sql(`UPDATE countries SET license_price_minor = 3673, license_currency = 'AED' WHERE id = 'uae'`);
for (const [id, code, name, price, cur] of [
  ["ksa", "SAU", "Saudi Arabia", 3750, "SAR"],
  ["kwt", "KWT", "Kuwait", 3070, "KWD"],   // three-decimal
  ["unpriced", "ZZZ", "Unpriced Land", null, null],
]) {
  await sql(
    `INSERT INTO countries (id, code, name, mission, vision, priority_sectors, national_goals)
     VALUES ($1,$2,$3,'t','t',ARRAY['Technology'],ARRAY['Growth']) ON CONFLICT (id) DO NOTHING`,
    [id, code, name]);
  if (price !== null) {
    await sql(`UPDATE countries SET license_price_minor = $2, license_currency = $3 WHERE id = $1`,
      [id, price, cur]);
  }
}

// ------------------------------------------- P-01 / P-02  the UAE in dirhams
{
  const q = await quote("countryId=uae&students=1");
  rec("P-01", "the UAE quotes dirhams, not dollars",
    q.status === 200 && q.body?.currency === "AED",
    `HTTP ${q.status}, currency=${q.body?.currency}`);

  // 3673 fils = 36.73 AED, the exact peg conversion of the old $10. Asserting
  // the NUMBER as well as the currency: a quote that said AED and charged
  // 1000 would be worse than one that said USD.
  rec("P-02", "the amount is the country's price, not the old $10",
    q.body?.totalMinor === 3673 && q.body?.unitPriceMinor === 3673 && q.body?.total === 36.73,
    `${q.body?.totalMinor} minor = ${q.body?.total} ${q.body?.currency}`);
}

// -------------------------------------------- P-03  another country, its own
{
  const q = await quote("countryId=ksa&students=1");
  rec("P-03", "Saudi Arabia quotes riyals at its own price",
    q.status === 200 && q.body?.currency === "SAR" && q.body?.totalMinor === 3750,
    `${q.body?.totalMinor} minor ${q.body?.currency}`);
}

// ------------------------- P-04  an unpriced country falls back, and says so
{
  const q = await quote("countryId=unpriced&students=1");
  // Falling back is right — refusing would block every sale in a country
  // nobody has priced. Hiding it is not: the flag is what makes the gap
  // reportable instead of discovered on a receipt.
  rec("P-04", "an unpriced country falls back to USD and reports it",
    q.status === 200 && q.body?.currency === "USD" &&
      q.body?.totalMinor === 1000 && q.body?.usesFallbackPrice === true,
    `${q.body?.totalMinor} ${q.body?.currency}, flagged: ${q.body?.usesFallbackPrice}`);

  const uae = await quote("countryId=uae&students=1");
  rec("P-04b", "and a priced country is NOT flagged as a fallback",
    uae.body?.usesFallbackPrice === false,
    `uae flagged: ${uae.body?.usesFallbackPrice} (if this were true for everyone, P-04 would prove nothing)`);
}

// ------------------------------------------ P-05  an unknown country refused
{
  const q = await quote("countryId=nowhere-at-all&students=1");
  // Specifically NOT 200-with-dollars. The SPA catch-all returns 200 and HTML
  // for a wrong path, so the error code is asserted, not just the status.
  rec("P-05", "an unknown country is refused, not quietly quoted in dollars",
    q.status === 400 && q.body?.code === "UNKNOWN_COUNTRY",
    `HTTP ${q.status} ${q.body?.code ?? JSON.stringify(q.body).slice(0, 50)}`);
}

// ---------------------------------- P-06  the tiers apply in local currency
{
  const rows = [];
  for (const [n, pct] of [[1, 0], [100, 10], [500, 15], [1000, 20]]) {
    const q = await quote(`countryId=uae&students=${n}`);
    const expected = Math.round(3673 * (1 - pct / 100) * n);
    rows.push({ n, pct, got: q.body?.totalMinor, expected, cur: q.body?.currency });
  }
  rec("P-06", "the volume tiers apply to the local price",
    rows.every((r) => r.got === r.expected && r.cur === "AED" && r.pct === r.pct),
    rows.map((r) => `${r.n}:${r.got}${r.got === r.expected ? "" : `≠${r.expected}`}`).join(" "));
}

// -------------------------- P-07  minor and major agree, per exponent
{
  const q = await quote("countryId=uae&students=100");
  rec("P-07", "major units are the minor units at the right exponent",
    Math.round(q.body?.total * 100) === q.body?.totalMinor,
    `${q.body?.totalMinor} minor vs ${q.body?.total} major (AED, exponent 2)`);
}

// ------------------------------ P-08  a three-decimal currency is chargeable
{
  const q = await quote("countryId=kwt&students=7");
  // Stripe refuses a three-decimal amount that is not a multiple of ten, and
  // 3070 x 7 = 21490 already is — so the division is what this checks: 21490
  // fils is 21.490 KWD, not 214.90.
  rec("P-08", "a three-decimal currency divides by 1000, not 100",
    q.body?.currency === "KWD" &&
      q.body?.totalMinor % 10 === 0 &&
      Math.abs(q.body?.total - q.body?.totalMinor / 1000) < 1e-9,
    `${q.body?.totalMinor} minor = ${q.body?.total} KWD (a /100 would read ${(q.body?.totalMinor / 100).toFixed(2)})`);
}

// ------------------------------- P-09  the request cannot set the price
{
  // The whole point of a server-side quote. If any of these moved the number,
  // a buyer could name their own price at checkout.
  const base = await quote("countryId=uae&students=10");
  const spoofed = await quote(
    "countryId=uae&students=10&unitPriceMinor=1&total=1&totalMinor=1&currency=USD&price=1&amount=1");
  rec("P-09", "a price in the request changes nothing",
    base.body?.totalMinor === spoofed.body?.totalMinor &&
      base.body?.currency === spoofed.body?.currency &&
      spoofed.body?.totalMinor === 36730,
    `clean ${base.body?.totalMinor} ${base.body?.currency} vs spoofed ${spoofed.body?.totalMinor} ${spoofed.body?.currency}`);
}

/**
 * REMOVE THE COUNTRIES THIS SUITE INVENTED.
 *
 * Suites share one database. Leaving three extra countries behind made
 * school-setup's "the rest are available" report 247 of 250 and fail — a true
 * statement about a state this suite created, which reads exactly like a
 * catalogue bug and is not one.
 *
 * The UAE is a fixture country, so its price is cleared rather than the row
 * deleted.
 */
await sql(`DELETE FROM countries WHERE id IN ('ksa', 'kwt', 'unpriced')`);
await sql(`UPDATE countries SET license_price_minor = NULL, license_currency = NULL WHERE id = 'uae'`);

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`pricing: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
