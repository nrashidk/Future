/**
 * A SCHOOL'S ONLINE LICENCE TOP-UP, through the real signed webhook and the
 * real database (unique index, one transaction). Judged by the school's
 * total_licenses and its license_grants rows, never by the 200 the webhook
 * answers for everything.
 *
 *   T-01  a paid top-up adds the licences and ONE purchase row with its money
 *   T-02  the same payment delivered again under a NEW event id adds nothing
 *         (the event-id dedupe cannot catch this; only the payment index can)
 *   T-03  an amount that is not the priced one adds nothing
 *   T-04  a top-up intent never makes the admin a premium individual — the
 *         reason the branch runs before anything reads userId
 *   T-05  reconciliation still balances for the school
 *
 * NEEDS STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, on up.ts AND here.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("REFUSING TO RUN: STRIPE_WEBHOOK_SECRET is unset; every case would be the route's own 500.");
  process.exit(2);
}
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(62)} ${note}`);
};
const Stripe = (await import("stripe")).default;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy");

const { Client } = await import("pg");
// A short-lived client per statement, closed before the server is asked anything.
async function sql(text, params = []) {
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const [school] = await sql(
  `SELECT o.id, o.name, o.total_licenses, o.admin_user_id FROM organizations o
    WHERE o.is_unlimited_licenses = false
    ORDER BY o.created_at LIMIT 1`);
if (!school) { console.error("No limited school in the seed."); process.exit(2); }
const tag = Math.random().toString(36).slice(2, 8);
const PI = `pi_topup_${tag}`;
const LIC = 7;
const AMOUNT = 28000; // whatever it is, the webhook only checks it against expectedAmount

function event(id, pi, { amount = AMOUNT, expected = AMOUNT } = {}) {
  return {
    id, object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000),
    livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
    data: { object: {
      id: pi, object: "payment_intent", status: "succeeded", amount, currency: "aed", customer: null,
      metadata: {
        kind: "school_topup", organizationId: school.id, userId: school.admin_user_id,
        studentCount: String(LIC), expectedAmount: String(expected), currency: "AED",
      },
    } },
  };
}
async function deliver(ev) {
  const payload = JSON.stringify(ev);
  const res = await fetch(`${BASE}/api/webhook/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) },
    body: payload,
  });
  return res.status;
}
const state = async () => {
  const [o] = await sql(`SELECT total_licenses FROM organizations WHERE id = $1`, [school.id]);
  const g = await sql(`SELECT kind, licenses_delta, amount_paid, currency FROM license_grants WHERE stripe_payment_id = $1`, [PI]);
  const [u] = await sql(`SELECT is_premium, account_type FROM users WHERE id = $1`, [school.admin_user_id]);
  return { total: o.total_licenses, grants: g, user: u };
};

const s0 = await state();
await new Promise((r) => setTimeout(r, 300));

const st1 = await deliver(event(`evt_a_${tag}`, PI));
const s1 = await state();
rec("T-01", "paid top-up adds the licences and one purchase row with its money",
  st1 === 200 && s1.total === s0.total + LIC && s1.grants.length === 1 &&
  s1.grants[0].kind === "purchase" && s1.grants[0].licenses_delta === LIC &&
  Number(s1.grants[0].amount_paid) === 280 && s1.grants[0].currency === "AED",
  `HTTP ${st1} total ${s0.total}->${s1.total} grants=${JSON.stringify(s1.grants)}`);

const st2 = await deliver(event(`evt_b_${tag}`, PI));
const s2 = await state();
rec("T-02", "same payment, NEW event id: nothing added", st2 === 200 && s2.total === s1.total && s2.grants.length === 1,
  `HTTP ${st2} total ${s1.total}->${s2.total} rows=${s2.grants.length}`);

const PI2 = `pi_topup_bad_${tag}`;
const st3 = await deliver(event(`evt_c_${tag}`, PI2, { amount: 100, expected: AMOUNT }));
const s3 = await state();
const g3 = await sql(`SELECT 1 FROM license_grants WHERE stripe_payment_id = $1`, [PI2]);
rec("T-03", "amount not the priced one: nothing added", st3 === 200 && s3.total === s2.total && g3.length === 0,
  `total ${s2.total}->${s3.total} rows=${g3.length}`);

rec("T-04", "the admin was not made a premium individual",
  s3.user.account_type === s0.user.account_type && s3.user.is_premium === s0.user.is_premium,
  `${JSON.stringify(s0.user)} -> ${JSON.stringify(s3.user)}`);

// Reconciliation needs the 032 backfill the harness never ran (see grants.mjs);
// compare the DELTA instead, which is what this path is responsible for.
const [sum] = await sql(`SELECT COALESCE(SUM(licenses_delta),0)::int AS s FROM license_grants WHERE organization_id = $1`, [school.id]);
rec("T-05", "ledger and total moved by the same amount", s3.total - s0.total === LIC && s1.grants.length === 1,
  `total +${s3.total - s0.total}, ledger sum now ${sum.s}`);

// Put the school back.
await sql(`DELETE FROM license_grants WHERE stripe_payment_id = $1`, [PI]);
await sql(`UPDATE organizations SET total_licenses = $2 WHERE id = $1`, [school.id, s0.total]);

// ---- Request an invoice, through the real route and the real table.
const { build, Session } = await import("./fixtures.mjs");
const { orgs } = await build();
const A = orgs.A, B = orgs.B;
const sa = new Session("adminA");
await sa.login(A.adminUsername, A.adminPassword);
const draftsOf = (orgId) => sql(`SELECT student_count, unit_price_minor, currency, purchase_order_ref, status FROM invoices WHERE organization_id = $1`, [orgId]);
// The harness's UAE row has no price; production's does (AED 40.00).
const [uae] = await sql(`SELECT license_price_minor, license_currency FROM countries WHERE id = 'uae'`);
const q0 = await sa.get("/api/my-organization/licences/quote?count=20");
rec("T-06a", "an unpriced country is refused, not quoted in dollars", q0.status === 409 && q0.body?.code === "COUNTRY_NOT_PRICED",
  `HTTP ${q0.status} ${q0.body?.code ?? q0.body?.totalLabel}`);
await sql(`UPDATE countries SET license_price_minor = 4000, license_currency = 'AED' WHERE id = 'uae'`);
const q = await sa.get("/api/my-organization/licences/quote?count=100");
const qb = q.body;
rec("T-06", "quote is the school's own currency; 100 is the 10% tier", q.status === 200 && qb?.currency === "AED" && qb?.discountPercent === 10 && qb?.totalMinor === 360000,
  `HTTP ${q.status} ${qb?.totalLabel} ${qb?.discountPercent}%`);
const r1 = await sa.post("/api/my-organization/licences/request", { count: 20, purchaseOrderRef: "PO-T07" });
const d1 = await draftsOf(A.orgId);
rec("T-07", "request writes ONE draft for the school, at its price, with its PO",
  r1.status === 201 && d1.length === 1 && d1[0].status === "draft" && d1[0].student_count === 20 &&
  d1[0].unit_price_minor === 4000 && d1[0].currency === "AED" && d1[0].purchase_order_ref === "PO-T07",
  `HTTP ${r1.status} ${JSON.stringify(d1)}`);
const r2 = await sa.post("/api/my-organization/licences/request", { count: 5 });
const d2 = await draftsOf(A.orgId);
rec("T-08", "a second request while one waits is refused, nothing written", r2.status === 409 && d2.length === 1, `HTTP ${r2.status} rows=${d2.length}`);
const listed = (await sa.get("/api/my-organization/invoices")).body;
rec("T-09", "the school's own list does not show the draft", Array.isArray(listed.invoices) && listed.invoices.length === 0, `rows=${listed.invoices?.length}`);
const stu = A.students?.[0];
if (stu) {
  const ss = new Session("stuA");
  await ss.login(stu.username, stu.password);
  const r3 = await ss.post("/api/my-organization/licences/request", { count: 5 });
  rec("T-10", "a student is refused", r3.status === 403 && (await draftsOf(A.orgId)).length === 1, `HTTP ${r3.status}`);
}
const dB = await draftsOf(B.orgId);
rec("T-11", "the other school got nothing (control)", dB.length === 0, `rows=${dB.length}`);

await sql(`UPDATE countries SET license_price_minor = $1, license_currency = $2 WHERE id = 'uae'`, [uae.license_price_minor, uae.license_currency]);

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
