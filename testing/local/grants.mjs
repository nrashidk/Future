/**
 * THE LICENCE GRANTS LEDGER — the other half of licence accounting.
 *
 * license_consumptions records what was SPENT. license_grants records where it
 * came from. Until this existed, a school's payment was three columns holding
 * one purchase for ever and every superadmin top-up recorded a count and no
 * money, so "paid versus consumed" was unanswerable and per-country revenue
 * did not exist.
 *
 * WHAT EACH CASE MEASURES, and why it is not obvious:
 *
 *   W-01  a superadmin-created school gets an opening row, so the ledger
 *         agrees with its total from the first moment
 *   W-02  with no amount it is a COMP, not a zero-price purchase -- a free
 *         school in revenue at zero would understate the average price
 *   W-03  an amount passed at creation makes it a purchase that carries money
 *   W-04  a top-up through the licence route records the DELTA, not the new
 *         total, or a school topped up twice would look like it bought the
 *         whole balance again
 *   W-05  a reduction records a NEGATIVE delta rather than editing history
 *   W-06  the ledger still sums to total_licenses after all of that -- the
 *         invariant every report depends on
 *   W-07  reconciliation reports nothing while that holds
 *   W-08  ...and CATCHES a school whose entitlement was changed without a row.
 *         This is the case that matters: W-07 passing on an empty list proves
 *         nothing on its own, since an endpoint returning [] always would pass
 *         it too.
 *   W-09  reconciliation ignores unlimited schools, whose total has no meaning
 *   W-10  only a superadmin can read it
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(58)} ${note}`);
};

/** One connection per query: PGlite allows a single one, and holding it open
 *  across the HTTP calls below starves the application. */
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const { orgs } = await build();
const sa = new Session("grantsSa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const tag = Math.random().toString(36).slice(2, 6);

/**
 * RUN MIGRATION 032 FIRST, to reproduce the state production will be in.
 *
 * schema-push creates the tables and marks the migrations applied WITHOUT
 * running them, so the backfill never happens here. Schools created by seed.ts
 * go through storage.createOrganization directly and therefore have no ledger
 * row, and reconciliation correctly flags them -- a true report of a state that
 * only exists in the harness. Running the migration is honest about that
 * instead of excluding seeded schools from the assertions, which would also
 * hide a real regression in the backfill.
 *
 * Idempotent, so this is safe on a database where it has already run.
 */
{
  const { readFile } = await import("fs/promises");
  const migration = await readFile("server/migrations/032_license_grants.sql", "utf8");
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { await c.query(migration); } finally { await c.end(); }
}

const createSchool = (label, licenses, extra = {}) =>
  sa.post("/api/superadmin/organizations/create-with-admin", {
    organizationName: `${label} ${tag}`,
    totalLicenses: licenses,
    isUnlimitedLicenses: false,
    countryId: "uae",
    curriculum: "MOE National",
    adminFirstName: "G", adminLastName: label.replace(/\W/g, ""),
    adminEmail: `${label.toLowerCase().replace(/\W/g, "")}.${tag}@futurepath.test`,
    adminPhone: "+971500000000",
    adminUsername: `${label.toLowerCase().replace(/\W/g, "")}${tag}`,
    ...extra,
  });

const grantsFor = (orgId) =>
  sql(`SELECT kind, licenses_delta, amount_paid, currency, note, performed_by
         FROM license_grants WHERE organization_id = $1 ORDER BY created_at, licenses_delta DESC`, [orgId]);

// ------------------------------------------ W-01 / W-02  an opening comp
let compOrgId = null;
{
  const r = await createSchool("CompSchool", 40);
  compOrgId = r.body?.organization?.id ?? r.body?.id;
  const rows = compOrgId ? await grantsFor(compOrgId) : [];
  rec("W-01", "a superadmin-created school gets an opening grant row",
    rows.length === 1 && Number(rows[0].licenses_delta) === 40,
    compOrgId ? `${rows.length} row(s), delta=${rows[0]?.licenses_delta}` : `HTTP ${r.status}`);

  rec("W-02", "with no amount it is a comp carrying no money",
    rows[0]?.kind === "comp" && rows[0]?.amount_paid === null && rows[0]?.currency === null &&
      !!rows[0]?.performed_by,
    `kind=${rows[0]?.kind} amount=${rows[0]?.amount_paid} currency=${rows[0]?.currency} ` +
    `performer recorded: ${!!rows[0]?.performed_by}`);
}

// --------------------------------------- W-03  an amount makes it a purchase
{
  const r = await createSchool("PaidSchool", 60, { amountPaid: 900, currency: "usd" });
  const orgId = r.body?.organization?.id ?? r.body?.id;
  const rows = orgId ? await grantsFor(orgId) : [];
  rec("W-03", "an amount given at creation is recorded as a purchase",
    rows[0]?.kind === "purchase" && Number(rows[0]?.amount_paid) === 900 &&
      rows[0]?.currency === "USD" && Number(rows[0]?.licenses_delta) === 60,
    `kind=${rows[0]?.kind} ${rows[0]?.amount_paid} ${rows[0]?.currency} delta=${rows[0]?.licenses_delta}`);
}

// ------------------------------- W-04 / W-05  top-up and reduction as deltas
{
  // 40 -> 100 by setting the new total. The row must say +60, not 100.
  const up = await sa.patch(`/api/superadmin/organizations/${compOrgId}/licenses`, { totalLicenses: 100 });
  let rows = await grantsFor(compOrgId);
  const topUp = rows.find((r) => Number(r.licenses_delta) === 60);
  rec("W-04", "a top-up records the delta, not the new total",
    up.status === 200 && rows.length === 2 && !!topUp &&
      !rows.some((r) => Number(r.licenses_delta) === 100),
    `HTTP ${up.status}, deltas now [${rows.map((r) => r.licenses_delta).join(", ")}]`);

  const down = await sa.patch(`/api/superadmin/organizations/${compOrgId}/licenses`, { adjustment: -25 });
  rows = await grantsFor(compOrgId);
  const cut = rows.find((r) => Number(r.licenses_delta) === -25);
  rec("W-05", "a reduction is a negative row, not an edit to an earlier one",
    down.status === 200 && !!cut && cut.kind === "adjustment" && rows.length === 3,
    `HTTP ${down.status}, deltas [${rows.map((r) => r.licenses_delta).join(", ")}], kind=${cut?.kind}`);

  // ------------------------------------------- W-06  the invariant holds
  const [org] = await sql(`SELECT total_licenses FROM organizations WHERE id = $1`, [compOrgId]);
  const sum = rows.reduce((a, r) => a + Number(r.licenses_delta), 0);
  rec("W-06", "the ledger sums to the school's licence total after all of it",
    sum === Number(org.total_licenses) && sum === 75,
    `ledger ${sum} vs total ${org.total_licenses} (40 + 60 - 25)`);
}

// --------------------------------------------- W-07  reconciliation is clean
{
  const r = await sa.get("/api/superadmin/licenses/reconciliation");
  rec("W-07", "reconciliation reports no mismatch while the ledger agrees",
    r.status === 200 && r.body?.mismatchCount === 0,
    `HTTP ${r.status}, ${r.body?.mismatchCount} mismatch(es)`);
}

// ------------- W-08  ...and catches entitlement changed without a ledger row
{
  // The exact failure the report exists for: a code path that writes
  // total_licenses and records nothing. Done in SQL because no route does it
  // any more -- which is the point.
  await sql(`UPDATE organizations SET total_licenses = total_licenses + 500 WHERE id = $1`, [compOrgId]);

  const r = await sa.get("/api/superadmin/licenses/reconciliation");
  const hit = (r.body?.mismatches ?? []).find((m) => m.organizationId === compOrgId);
  rec("W-08", "it CATCHES a school whose entitlement changed without a row",
    r.status === 200 && r.body?.mismatchCount >= 1 && !!hit && hit.difference === -500,
    hit ? `caught: ledger ${hit.ledgerTotal} vs total ${hit.totalLicenses}, difference ${hit.difference}`
        : `NOT CAUGHT — ${r.body?.mismatchCount} mismatches reported`);

  // Put it back, and confirm the report goes quiet again: a report that stayed
  // dirty would be no more useful than one that was always clean.
  await sql(`UPDATE organizations SET total_licenses = total_licenses - 500 WHERE id = $1`, [compOrgId]);
  const after = await sa.get("/api/superadmin/licenses/reconciliation");
  rec("W-08b", "and goes quiet once the disagreement is resolved",
    after.body?.mismatchCount === 0, `${after.body?.mismatchCount} mismatch(es) after restoring`);
}

// ------------------------------- W-09  unlimited schools are not flagged
{
  /**
   * An unlimited school whose licence total disagrees with its ledger: it must
   * NOT appear, because that total is a number with no meaning.
   *
   * The original values are READ and restored, rather than restored to an
   * assumed 50 plus a compensating ledger row. The first version of this case
   * did that and left the school at 50 with a ledger of 100, because it already
   * had a row from its own creation -- a mismatch invented by the test and then
   * reported by the very endpoint under test.
   */
  const [beforeA] = await sql(
    `SELECT is_unlimited_licenses, total_licenses FROM organizations WHERE id = $1`, [orgs.A.orgId]);

  await sql(
    `UPDATE organizations SET is_unlimited_licenses = true, total_licenses = 9999 WHERE id = $1`,
    [orgs.A.orgId]);
  const r = await sa.get("/api/superadmin/licenses/reconciliation");
  const flagged = (r.body?.mismatches ?? []).some((m) => m.organizationId === orgs.A.orgId);
  rec("W-09", "an unlimited school is not flagged whatever its total says",
    r.status === 200 && !flagged,
    `set to 9999 while unlimited; flagged: ${flagged}, ${r.body?.mismatchCount} mismatch(es) overall`);

  await sql(
    `UPDATE organizations SET is_unlimited_licenses = $2, total_licenses = $3 WHERE id = $1`,
    [orgs.A.orgId, beforeA.is_unlimited_licenses, beforeA.total_licenses]);

  // Restoring must leave the report exactly as it was, or this case has
  // polluted every later one.
  const back = await sa.get("/api/superadmin/licenses/reconciliation");
  rec("W-09b", "restoring it leaves the report clean, so this case pollutes nothing",
    back.body?.mismatchCount === 0,
    `${back.body?.mismatchCount} mismatch(es) after restoring to ` +
    `${beforeA.total_licenses}/${beforeA.is_unlimited_licenses ? "unlimited" : "capped"}`);
}

// ------------------------------------- W-10  org admins cannot read it
{
  const r = await orgs.A.session.get("/api/superadmin/licenses/reconciliation");
  // Not 200-with-a-body: this names every school and its licence position.
  rec("W-10", "an org admin cannot read the reconciliation report",
    r.status === 401 || r.status === 403,
    `HTTP ${r.status} ${typeof r.body === "string" ? "(html)" : JSON.stringify(r.body).slice(0, 60)}`);
}

/**
 * =========================  ANALYTICS  =========================
 *
 * A-01  the endpoint totals agree with the ledgers, counted independently
 * A-02  MULTIPLE grants and MULTIPLE consumptions on one school do not
 *       multiply each other. This is the case the whole query shape exists
 *       for: joining organizations to both ledgers at once gives a school with
 *       3 grants and 4 consumptions 12 rows, and reports 12 of each. Every
 *       figure would be wrong in a way that looks entirely plausible, which is
 *       why it is asserted with exact numbers rather than "looks about right".
 * A-03  country totals are exactly the sum of their schools' rows
 * A-04  only paid consumption is deducted from a balance -- reward credits are
 *       a separate pool, and charging both would bill a school twice
 * A-05  an unlimited school reports no remaining balance rather than zero
 * A-06  revenue counts purchases only, never comps or backfilled rows
 * A-07  revenue is grouped by currency, never summed across them
 * A-08  only a superadmin can read it
 */
{
  const an = await sa.get("/api/superadmin/licenses/analytics");
  const body = an.body ?? {};

  // Independent truth, straight from the two ledgers.
  const [truth] = await sql(`
    SELECT (SELECT COALESCE(SUM(licenses_delta),0)::int FROM license_grants) AS granted,
           (SELECT COALESCE(SUM(amount_paid),0)::double precision FROM license_grants WHERE kind='purchase') AS revenue,
           (SELECT count(*)::int FROM license_consumptions) AS consumed,
           (SELECT count(*)::int FROM organizations) AS schools`);

  const revenueTotal = (body.revenueByCurrency ?? []).reduce((a, r) => a + Number(r.amount), 0);
  rec("A-01", "platform totals agree with the ledgers counted independently",
    an.status === 200 &&
      Number(body.platform?.granted) === Number(truth.granted) &&
      Number(body.platform?.totalConsumed) === Number(truth.consumed) &&
      Math.abs(revenueTotal - Number(truth.revenue)) < 0.01 &&
      Number(body.platform?.schools) === Number(truth.schools),
    `granted ${body.platform?.granted}/${truth.granted}, consumed ` +
    `${body.platform?.totalConsumed}/${truth.consumed}, revenue ${revenueTotal}/${truth.revenue}, ` +
    `schools ${body.platform?.schools}/${truth.schools}`);
}

// --------------- A-02  several grants AND several consumptions on one school
{
  // compOrgId already carries 3 grant rows (40, +60, -25) from W-04/W-05.
  // Give it consumption too, which is what triggers the multiplication bug.
  const [stu] = await sql(
    `SELECT user_id FROM organization_members
      WHERE organization_id = $1 AND role = 'student' LIMIT 1`, [orgs.A.orgId]);

  // Four consumption rows, each needing its own assessment: the assessment id
  // is unique on the consumption ledger, which is what makes a regenerated
  // report free.
  for (let i = 0; i < 4; i++) {
    const [a] = await sql(
      `INSERT INTO assessments (user_id, country_id, curriculum, grade, favorite_subjects, interests)
       VALUES ($1, 'uae', 'MOE National', '10', ARRAY['Mathematics'], ARRAY['Technology'])
       RETURNING id`, [stu.user_id]);
    await sql(
      `INSERT INTO license_consumptions
         (pool_owner_type, organization_id, student_user_id, assessment_id, grade, currency)
       VALUES ('organization', $1, $2, $3, '10', $4)`,
      [compOrgId, stu.user_id, a.id, i < 3 ? "paid" : "reward"]);
  }

  const an = await sa.get("/api/superadmin/licenses/analytics");
  const row = (an.body?.perSchool ?? []).find((s) => s.organizationId === compOrgId);

  const [grantRows] = await sql(
    `SELECT count(*)::int n FROM license_grants WHERE organization_id = $1`, [compOrgId]);
  const [consRows] = await sql(
    `SELECT count(*)::int n FROM license_consumptions WHERE organization_id = $1`, [compOrgId]);

  rec("A-02", "several grants and several consumptions do not multiply",
    !!row && row.granted === 75 && row.consumed === 4 &&
      row.consumedPaid === 3 && row.consumedReward === 1,
    row ? `${grantRows.n} grants x ${consRows.n} consumptions -> granted=${row.granted} (75), ` +
          `consumed=${row.consumed} (4), paid=${row.consumedPaid} (3), reward=${row.consumedReward} (1)`
        : "school not in the report");

  // -------------------- A-04  only paid consumption reduces the balance
  rec("A-04", "only paid consumption is deducted, not reward credits",
    row?.remaining === 72,
    `remaining=${row?.remaining}, expected 72 (75 granted - 3 paid, reward untouched)`);
}

// ------------------------ A-03  country totals are the sum of school rows
{
  const an = await sa.get("/api/superadmin/licenses/analytics");
  const schools = an.body?.perSchool ?? [];
  const countries = an.body?.perCountry ?? [];
  const mismatches = [];
  for (const c of countries) {
    const mine = schools.filter((s) => (s.countryId ?? null) === (c.countryId ?? null));
    const g = mine.reduce((a, s) => a + s.granted, 0);
    const u = mine.reduce((a, s) => a + s.consumed, 0);
    if (g !== c.granted || u !== c.consumed || mine.length !== c.schools) {
      mismatches.push(`${c.countryName}: ${g}/${c.granted} granted, ${u}/${c.consumed} consumed`);
    }
  }
  rec("A-03", "every country total is exactly the sum of its schools' rows",
    countries.length > 0 && mismatches.length === 0,
    `${countries.length} countries checked: ${mismatches.length ? mismatches.join("; ") : "all agree"}` +
    `; names resolved: ${countries.every((c) => !!c.countryName)}`);
}

// --------------------- A-05  an unlimited school has no remaining balance
{
  const [beforeA] = await sql(
    `SELECT is_unlimited_licenses FROM organizations WHERE id = $1`, [orgs.A.orgId]);
  await sql(`UPDATE organizations SET is_unlimited_licenses = true WHERE id = $1`, [orgs.A.orgId]);

  const an = await sa.get("/api/superadmin/licenses/analytics");
  const row = (an.body?.perSchool ?? []).find((s) => s.organizationId === orgs.A.orgId);
  // null, not 0: zero reads as exhausted, the opposite of unlimited.
  rec("A-05", "an unlimited school reports no remaining balance, not zero",
    row?.remaining === null && row?.isUnlimited === true &&
      an.body?.platform?.unlimitedSchools >= 1,
    `remaining=${JSON.stringify(row?.remaining)}, unlimited=${row?.isUnlimited}, ` +
    `platform counts ${an.body?.platform?.unlimitedSchools}`);

  await sql(`UPDATE organizations SET is_unlimited_licenses = $2 WHERE id = $1`,
    [orgs.A.orgId, beforeA.is_unlimited_licenses]);
}

// ------------------- A-06 / A-07  revenue is purchases only, per currency
{
  const an = await sa.get("/api/superadmin/licenses/analytics");
  const rev = an.body?.revenueByCurrency ?? [];

  const [truth] = await sql(`
    SELECT COALESCE(SUM(amount_paid),0)::double precision AS purchases_only,
           (SELECT count(*)::int FROM license_grants WHERE kind IN ('comp','backfill')) AS free_rows
      FROM license_grants WHERE kind = 'purchase'`);

  const total = rev.reduce((a, r) => a + Number(r.amount), 0);
  rec("A-06", "revenue counts purchases only, with comps and backfills excluded",
    Math.abs(total - Number(truth.purchases_only)) < 0.01 && Number(truth.free_rows) > 0,
    `revenue ${total} vs purchases-only ${truth.purchases_only}, ` +
    `with ${truth.free_rows} free row(s) present and excluded`);

  // Add an AED purchase and require it to be reported apart, not added in.
  const [org] = await sql(`SELECT id FROM organizations LIMIT 1`);
  await sql(`INSERT INTO license_grants (organization_id, kind, licenses_delta, amount_paid, currency, note)
             VALUES ($1, 'purchase', 5, 100, 'AED', 'grants.mjs A-07 currency probe')`, [org.id]);

  const after = await sa.get("/api/superadmin/licenses/analytics");
  const byCur = Object.fromEntries((after.body?.revenueByCurrency ?? []).map((r) => [r.currency, r.amount]));
  rec("A-07", "two currencies are reported apart, never added together",
    Object.keys(byCur).length >= 2 && Number(byCur.AED) === 100 && Number(byCur.USD) > 0,
    `${JSON.stringify(byCur)}`);

  await sql(`DELETE FROM license_grants WHERE note = 'grants.mjs A-07 currency probe'`);
}

// ------------------------------------- A-08  org admins cannot read it
{
  const r = await orgs.A.session.get("/api/superadmin/licenses/analytics");
  rec("A-08", "an org admin cannot read licence analytics",
    r.status === 401 || r.status === 403,
    `HTTP ${r.status}`);
}

/**
 * ------------- A-09  the independent check again, now consumption is non-zero
 *
 * A-01 ran before any consumption existed, so its consumed comparison was 0
 * against 0 — true, and no evidence. A-02 since created four rows, one of them
 * a reward, so repeating the check here compares real numbers on both sides.
 */
{
  const an = await sa.get("/api/superadmin/licenses/analytics");
  const [truth] = await sql(`
    SELECT (SELECT count(*)::int FROM license_consumptions) AS all_consumed,
           (SELECT count(*)::int FROM license_consumptions WHERE pool_owner_type = 'organization') AS school_consumed,
           (SELECT count(*)::int FROM license_consumptions WHERE pool_owner_type = 'user') AS guardian_consumed,
           (SELECT count(*)::int FROM license_consumptions WHERE currency = 'reward') AS reward`);
  const p = an.body?.platform ?? {};
  rec("A-09", "consumption totals agree once there is some, school and parent apart",
    Number(truth.all_consumed) > 0 &&
      Number(p.totalConsumed) === Number(truth.all_consumed) &&
      Number(p.schoolConsumed) === Number(truth.school_consumed) &&
      Number(p.guardianConsumed) === Number(truth.guardian_consumed) &&
      Number(p.schoolConsumedReward) === Number(truth.reward),
    `total ${p.totalConsumed}/${truth.all_consumed}, school ${p.schoolConsumed}/${truth.school_consumed}, ` +
    `parent ${p.guardianConsumed}/${truth.guardian_consumed}, reward ${p.schoolConsumedReward}/${truth.reward}`);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`grants: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
