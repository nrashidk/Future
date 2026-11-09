/**
 * A GROUP PURCHASE MUST PRODUCE A SCHOOL, EVEN IF THE BROWSER NEVER COMES BACK.
 *
 * `grantIndividualPremium` is individual-only: a user, premium, a licence
 * count, and no organization. Correct for one seat, wrong for a school. The
 * webhook backstop stopped there, so a 100-student purchase whose
 * `/api/checkout/complete` never ran produced an `individual` account holding
 * 100 licences and NO SCHOOL — nothing to enrol students into, and invisible
 * to licence reconciliation, which only looks at schools.
 *
 * That is not hypothetical. It happened in production on 2026-11-09: the
 * webhook won a create race, `/complete` threw on the duplicate email, and the
 * buyer got exactly that shape. The race itself is fixed; this covers the case
 * the race fix cannot reach — when `/complete` never runs at all.
 *
 * REAL SIGNED EVENTS, so signature verification is in the path for every case.
 * A test that bypassed it would also bypass the `stripe_webhook_events` claim,
 * which sits deliberately after it.
 *
 * The suite drives ONLY the webhook. There is no browser here and no
 * `/checkout/complete` call — that is the scenario, not a shortcut.
 *
 * NEEDS, and refuses to run without:
 *   STRIPE_SECRET_KEY=sk_test_dummy   (constructs the client)
 *   STRIPE_WEBHOOK_SECRET=whsec_...   (same value passed to up.ts)
 *
 * The Stripe API is never reached. `constructEvent` is local crypto, and the
 * handler's only outbound call — stamping `processed` — is now best-effort and
 * logs rather than throwing, which is what makes this path testable offline at
 * all.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

if (!SECRET) {
  console.error(
    "REFUSING TO RUN: STRIPE_WEBHOOK_SECRET is unset. Every delivery would be\n" +
    "answered by the route's own 500 and nothing below would mean anything.",
  );
  process.exit(2);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy");

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const tag = Math.random().toString(36).slice(2, 7);

/**
 * A succeeded guest group purchase, in the metadata shape the product actually
 * produces: `create-payment-intent` writes userId/studentCount/expectedAmount/
 * currency/countryId/assessmentType, and `stamp-buyer` merges the buyer fields
 * and organizationName over them.
 *
 * Every field here earns its place by making the handler NOT return early.
 * `userId: "guest"` is the one that routes to the backstop at all — the first
 * draft of this suite omitted it, every case answered 200 having done nothing,
 * and six assertions failed for the right reason by luck rather than design.
 * `expectedAmount` must equal `amount` or the amount-manipulation check
 * returns before any grant.
 */
function event({ id, pi, email, students, orgName, amount = 360000 }) {
  return {
    id, object: "event", api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: pi, object: "payment_intent", status: "succeeded",
        amount, currency: "aed", customer: null,
        metadata: {
          userId: "guest",
          studentCount: String(students),
          expectedAmount: String(amount),
          currency: "AED",
          countryId: "uae",
          assessmentType: "premium",
          buyerEmail: email, buyerName: "Group Buyer", buyerPhone: "0500000000",
          ...(orgName ? { organizationName: orgName } : {}),
        },
      },
    },
  };
}

async function deliver(ev) {
  const payload = JSON.stringify(ev);
  const res = await fetch(`${BASE}/api/webhook/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }),
    },
    body: payload,
  });
  let body = null;
  try { body = JSON.parse(await res.text()); } catch { body = null; }
  return { status: res.status, body };
}

const orgsFor = (email) => sql(
  `SELECT o.id, o.name, o.total_licenses, o.country_id
     FROM organizations o JOIN users u ON u.id = o.admin_user_id
    WHERE u.email = $1`, [email]);
const userFor = (email) => sql(
  `SELECT id, account_type, is_premium, purchased_licenses FROM users WHERE email = $1`, [email]);
const grantsFor = (pi) => sql(
  `SELECT kind, licenses_delta, amount_paid, currency FROM license_grants WHERE stripe_payment_id = $1`, [pi]);

const emails = [];
const mk = (n) => { const e = `grp.${n}.${tag}@futurepath.test`; emails.push(e); return e; };

try {
  // ------------------------------------------------------------------ B-00
  // The route is real: an unsigned delivery is refused with a JSON error, not
  // the SPA catch-all's 200 HTML.
  {
    const payload = JSON.stringify(event({ id: `evt_${tag}_p`, pi: `pi_${tag}_p`, email: mk("probe"), students: 100, orgName: "Probe" }));
    const res = await fetch(`${BASE}/api/webhook/stripe`, {
      method: "POST", headers: { "content-type": "application/json" }, body: payload,
    });
    const txt = await res.text();
    let b = null; try { b = JSON.parse(txt); } catch {}
    rec("B-00", "route is real; unsigned delivery refused with JSON", res.status === 400 && !!b?.error,
      `${res.status} ${txt.slice(0, 60)}`);
  }

  // ------------------------------------------------------------------ B-01
  // THE DEFECT. A group purchase, webhook only, no browser: a SCHOOL must
  // exist afterwards.
  const email1 = mk("school");
  let afterFirst = null;
  {
    const r = await deliver(event({ id: `evt_${tag}_1`, pi: `pi_${tag}_1`, email: email1, students: 100, orgName: `Backstop School ${tag}` }));
    const orgs = await orgsFor(email1);
    const u = await userFor(email1);
    afterFirst = { licences: Number(u[0]?.purchased_licenses), orgId: orgs[0]?.id };
    const ok = r.status === 200 && orgs.length === 1
      && Number(orgs[0].total_licenses) === 100 && orgs[0].country_id === "uae"
      && u[0]?.account_type === "org_admin";
    rec("B-01", "group purchase creates a school with the right licences", ok,
      `HTTP ${r.status} orgs=${orgs.length} org.licences=${orgs[0]?.total_licenses} country=${orgs[0]?.country_id} type=${u[0]?.account_type}`);
  }

  // ------------------------------------------------------------------ B-02
  // The ledger row must record it as a PURCHASE with its money, or revenue
  // reporting silently loses the sale.
  {
    const g = await grantsFor(`pi_${tag}_1`);
    const ok = g.length === 1 && g[0].kind === "purchase"
      && Number(g[0].licenses_delta) === 100 && String(g[0].currency).toUpperCase() === "AED"
      && Number(g[0].amount_paid) === 3600;
    rec("B-02", "license_grants records a purchase of AED 3600 for 100", ok,
      g.length ? `kind=${g[0].kind} delta=${g[0].licenses_delta} ${g[0].currency} ${g[0].amount_paid}` : "no grant row");
  }

  // ------------------------------------------------------------------ B-03
  // Redelivery of the SAME event id is a no-op: stripe_webhook_events claims
  // it before any work happens.
  {
    const again = await deliver(event({ id: `evt_${tag}_1`, pi: `pi_${tag}_1`, email: email1, students: 100, orgName: `Backstop School ${tag}` }));
    const orgs = await orgsFor(email1);
    rec("B-03", "same event id again: duplicate, still exactly one school",
      again.body?.duplicate === true && orgs.length === 1,
      `dup=${again.body?.duplicate} orgs=${orgs.length}`);
  }

  // ------------------------------------------------------------------ B-04
  // THE HARDER IDEMPOTENCY. A DIFFERENT event id for the same payment — which
  // is what a genuine Stripe retry after a failed stamp looks like — must not
  // produce a second school or a second entitlement. The `stripe_webhook_events`
  // claim does NOT cover this case: the id is new, so it is claimed cleanly and
  // the handler runs in full. What stops it is createGroupPurchaseTransaction
  // refusing a second org for the same user, and the unique-where-present
  // `stripe_payment_id` on the grants ledger.
  //
  // ASSERTED BY DELTA, not by an absolute figure. A completed group purchase
  // leaves `users.purchased_licenses` at 2 × studentCount: grantIndividualPremium
  // SETS it to studentCount and createGroupPurchaseTransaction then ADDS
  // studentCount while promoting the buyer to org_admin
  // (`storage.ts:2985`). The interactive /api/checkout/complete path does the
  // same two steps in the same order, so this is the product's existing shape
  // and not something the backstop introduced — the point of the backstop is
  // that both paths agree. That figure is also unread for an org admin:
  // `getLicensePoolForUser` only reaches `purchasedLicenses` for a PARENT pool,
  // gated on a `child_profiles.guardian_user_id` row, and enrolment reads
  // `organizations.total_licenses`. Flagged here for a human rather than
  // "fixed" — it is cosmetically wrong, provably unread, and changing it would
  // touch the live interactive path to no effect.
  {
    const r = await deliver(event({ id: `evt_${tag}_1b`, pi: `pi_${tag}_1`, email: email1, students: 100, orgName: `Backstop School ${tag}` }));
    const orgs = await orgsFor(email1);
    const u = await userFor(email1);
    const g = await grantsFor(`pi_${tag}_1`);
    const ok = r.status === 200
      && orgs.length === 1 && orgs[0].id === afterFirst.orgId
      && Number(orgs[0].total_licenses) === 100          // the figure enrolment reads
      && Number(u[0]?.purchased_licenses) === afterFirst.licences  // moved by nothing
      && g.length === 1;                                  // no second ledger row
    rec("B-04", "new event id, same payment: nothing moves", ok,
      `HTTP ${r.status} orgs=${orgs.length} org.licences=${orgs[0]?.total_licenses} ` +
      `user=${afterFirst.licences}→${u[0]?.purchased_licenses} grants=${g.length}`);
  }

  // ------------------------------------------------------------------ B-05
  // CONTROL. An individual purchase must NOT get a school. Without this, code
  // that created an organization for every payment would pass B-01 to B-04.
  {
    const email = mk("solo");
    const r = await deliver(event({ id: `evt_${tag}_2`, pi: `pi_${tag}_2`, email, students: 1, orgName: "Should Not Exist", amount: 4000 }));
    const orgs = await orgsFor(email);
    const u = await userFor(email);
    rec("B-05", "one-seat purchase creates NO school", r.status === 200 && orgs.length === 0 && u.length === 1,
      `HTTP ${r.status} orgs=${orgs.length} user=${u.length} type=${u[0]?.account_type}`);
  }

  // ------------------------------------------------------------------ B-06
  // CONTROL. No organizationName in metadata means no name to create a school
  // under. The licences are still granted — the buyer paid — but nothing is
  // invented, and the handler says so loudly for a human to pick up.
  {
    const email = mk("noname");
    const r = await deliver(event({ id: `evt_${tag}_3`, pi: `pi_${tag}_3`, email, students: 100, orgName: null }));
    const orgs = await orgsFor(email);
    const u = await userFor(email);
    rec("B-06", "no org name: licences granted, no school invented",
      r.status === 200 && orgs.length === 0 && Number(u[0]?.purchased_licenses) === 100,
      `HTTP ${r.status} orgs=${orgs.length} licences=${u[0]?.purchased_licenses}`);
  }
} finally {
  for (const e of emails) {
    try {
      await sql(`DELETE FROM license_grants WHERE organization_id IN
                   (SELECT o.id FROM organizations o JOIN users u ON u.id = o.admin_user_id WHERE u.email = $1)`, [e]);
      await sql(`DELETE FROM organization_members WHERE organization_id IN
                   (SELECT o.id FROM organizations o JOIN users u ON u.id = o.admin_user_id WHERE u.email = $1)`, [e]);
      await sql(`DELETE FROM organizations WHERE admin_user_id IN (SELECT id FROM users WHERE email = $1)`, [e]);
      await sql(`DELETE FROM users WHERE email = $1`, [e]);
    } catch (err) { console.error("cleanup:", String(err.message).slice(0, 70)); }
  }
  await sql(`DELETE FROM stripe_webhook_events WHERE event_id LIKE $1`, [`evt_${tag}%`]);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
