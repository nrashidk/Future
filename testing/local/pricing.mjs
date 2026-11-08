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

const { orgs } = await build();

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
 * ============ SETTING A PRICE, IN NORMAL MONEY ============
 *
 * The column holds minor units, which is right for storage and wrong for a
 * human. Before this route existed the only way to change a price was editing
 * an INTEGER column by hand, where typing the figure you mean — 36.73 —
 * stores 36, and a licence silently costs thirty-six fils. Reading 3673 as
 * the price has already happened once in practice.
 *
 *   S-01  a superadmin sets 36.73 and the column holds 3673
 *   S-02  the quote then charges that, so setting a price actually works
 *   S-03  a figure finer than the currency is REFUSED, not rounded
 *   S-04  zero and negative are refused — selling for nothing is not a price
 *   S-05  a three-decimal currency takes three decimals
 *   S-06  null CLEARS the price, which is not the same as zero
 *   S-07  only a superadmin can change what a country charges
 */
{
  const { Session, SUPERADMIN } = await import("./fixtures.mjs");
  const sa = new Session("priceSa");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);

  const setPrice = (id, body) =>
    sa.patch(`/api/admin/countries/${id}/license-price`, body);

  // ----------------------------------------- S-01  normal money in, fils out
  {
    const r = await setPrice("uae", { price: "36.73", currency: "aed" });
    const [row] = await sql(
      `SELECT license_price_minor AS p, license_currency AS c FROM countries WHERE id = 'uae'`);
    rec("S-01", "entering 36.73 stores 3673 fils",
      r.status === 200 && Number(row?.p) === 3673 && row?.c === "AED" &&
        r.body?.price === 36.73 && r.body?.priceMinor === 3673,
      `HTTP ${r.status}, column=${row?.p} ${row?.c}, echoed back as ${r.body?.price} ` +
      `(${r.body?.formatted})`);
  }

  // ------------------------------- S-02  and the quote charges what was set
  {
    const q = await quote("countryId=uae&students=1");
    rec("S-02", "the quote then charges the price that was set",
      q.body?.totalMinor === 3673 && q.body?.currency === "AED",
      `${q.body?.totalMinor} ${q.body?.currency}`);
  }

  // ------------------ S-03  THE MISTAKE: 3673 entered as if it were the price
  {
    /**
     * The exact confusion that prompted this route. 3673 AED is a real,
     * well-formed price — a hundred times too big, and no validator can know
     * that. What it MUST do is store 367300 fils, not 3673, so the figure the
     * person typed is the figure that gets charged and the error is visible on
     * the page rather than hidden in the column.
     */
    const r = await setPrice("uae", { price: "3673", currency: "AED" });
    const [row] = await sql(
      `SELECT license_price_minor AS p FROM countries WHERE id = 'uae'`);
    rec("S-03", "3673 entered as a price means AED 3673, visibly",
      r.status === 200 && Number(row?.p) === 367300 && r.body?.price === 3673,
      `stored ${row?.p} fils, shown back as ${r.body?.formatted} — wrong, but not silently`);

    // Put it back.
    await setPrice("uae", { price: "36.73", currency: "AED" });
  }

  // --------------------------- S-04  finer than the currency is refused
  {
    const r = await setPrice("uae", { price: "36.731", currency: "AED" });
    const [row] = await sql(
      `SELECT license_price_minor AS p FROM countries WHERE id = 'uae'`);
    // Refused AND unchanged. A 400 that still wrote would be worse than none.
    rec("S-04", "a third decimal on a two-decimal currency is refused",
      r.status === 400 && r.body?.code === "INVALID_PRICE" && Number(row?.p) === 3673,
      `HTTP ${r.status} ${r.body?.code}, column still ${row?.p}`);
  }

  // ------------------------------- S-05  zero and negative are refused
  {
    const outcomes = [];
    for (const bad of [0, -5, "", "free"]) {
      const r = await setPrice("uae", { price: bad, currency: "AED" });
      outcomes.push(`${JSON.stringify(bad)}:${r.status}`);
    }
    const [row] = await sql(`SELECT license_price_minor AS p FROM countries WHERE id = 'uae'`);
    rec("S-05", "zero, negative and nonsense are all refused",
      outcomes.every((o) => o.endsWith(":400")) && Number(row?.p) === 3673,
      `${outcomes.join(" ")}, column still ${row?.p}`);
  }

  // ------------------------- S-06  a three-decimal currency takes three
  {
    await sql(
      `INSERT INTO countries (id, code, name, mission, vision, priority_sectors, national_goals)
       VALUES ('kwt2','KW2','Kuwait Two','t','t',ARRAY['Technology'],ARRAY['Growth'])
       ON CONFLICT (id) DO NOTHING`);
    const r = await setPrice("kwt2", { price: "1.234", currency: "KWD" });
    const [row] = await sql(
      `SELECT license_price_minor AS p FROM countries WHERE id = 'kwt2'`);
    rec("S-06", "a dinar price keeps three decimals",
      r.status === 200 && Number(row?.p) === 1234 && r.body?.price === 1.234,
      `stored ${row?.p} (1.234 KWD); a flat /100 would have made this ${1234 / 100}`);
  }

  // ------------------------------------ S-07  null clears, and is not zero
  {
    const r = await setPrice("kwt2", { price: null });
    const [row] = await sql(
      `SELECT license_price_minor AS p, license_currency AS c FROM countries WHERE id = 'kwt2'`);
    const q = await quote("countryId=kwt2&students=1");
    rec("S-07", "null clears the price and falls back to USD",
      r.status === 200 && row?.p === null && row?.c === null &&
        q.body?.currency === "USD" && q.body?.usesFallbackPrice === true,
      `column=${row?.p}/${row?.c}, quote now ${q.body?.totalMinor} ${q.body?.currency} ` +
      `(fallback: ${q.body?.usesFallbackPrice})`);
  }

  // -------------------------- S-08  an org admin cannot reprice a country
  {
    const r = await orgs.A.session.patch("/api/admin/countries/uae/license-price",
      { price: "0.01", currency: "AED" });
    const [row] = await sql(`SELECT license_price_minor AS p FROM countries WHERE id = 'uae'`);
    // By effect, not status: a 403 that still wrote would look safe.
    rec("S-08", "an org admin cannot change what a country charges",
      [401, 403].includes(r.status) && Number(row?.p) === 3673,
      `HTTP ${r.status}, column still ${row?.p}`);
  }

  await sql(`DELETE FROM countries WHERE id = 'kwt2'`);
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
