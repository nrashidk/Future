/**
 * ONE PURCHASE, ONE SIGN-IN LINK — whichever path gets there first.
 *
 * Both `/api/checkout/complete` and the Stripe webhook act on the same
 * payment, and either may run first; sometimes both run. Before this, neither
 * sent anything at all: the generated credentials appeared once on the success
 * screen and nowhere else, so a closed tab left a paying buyer with an account
 * they could not enter. Naively adding a send to both paths would replace that
 * with two sign-in links in one inbox.
 *
 * `sendSchoolSetupInvite` is idempotent on the TOKEN rather than on a flag:
 * `issueSchoolSetupToken` returns a live unused token instead of minting a
 * second, so the loser of the race sends nothing. A "setup email sent" boolean
 * would be check-then-act with a window in it — the family that produced the
 * 2026-11-09 double-insert in the first place.
 *
 * REAL SIGNED EVENTS, so signature verification and the `stripe_webhook_events`
 * claim are in the path throughout.
 *
 * NEEDS, and refuses to run without:
 *   STRIPE_SECRET_KEY=sk_test_dummy
 *   STRIPE_WEBHOOK_SECRET=whsec_...   (same value passed to up.ts)
 *
 * The mail itself is never sent here: with no RESEND_API_KEY and NODE_ENV
 * development, `sendSchoolSetupEmail` takes its log-only branch and reports
 * success. That is the point of the branch, and it is why these cases assert
 * on the TOKEN ROW — issued, sent-stamped, counted — rather than on an inbox.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

if (!SECRET) {
  console.error("REFUSING TO RUN: STRIPE_WEBHOOK_SECRET is unset — every delivery would be\n" +
    "answered by the route's own 500 and nothing below would mean anything.");
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
const emails = [];
const mk = (n) => { const e = `inv.${n}.${tag}@futurepath.test`; emails.push(e); return e; };

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
          userId: "guest", studentCount: String(students), expectedAmount: String(amount),
          currency: "AED", countryId: "uae", assessmentType: "premium",
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
  try { body = JSON.parse(await res.text()); } catch {}
  return { status: res.status, body };
}

const tokensFor = (email) => sql(
  `SELECT t.id, t.token, t.used_at, t.sent_at, t.sent_count, t.organization_id
     FROM school_setup_tokens t JOIN users u ON u.id = t.user_id
    WHERE u.email = $1 ORDER BY t.created_at`, [email]);

try {
  // ------------------------------------------------------------------ I-01
  // A group purchase issues exactly ONE token, stamped as sent, attached to
  // the school it sets up.
  const email1 = mk("group");
  {
    const r = await deliver(event({ id: `evt_${tag}_1`, pi: `pi_${tag}_1`, email: email1, students: 100, orgName: `Invite School ${tag}` }));
    const t = await tokensFor(email1);
    const ok = r.status === 200 && t.length === 1
      && t[0].sent_at !== null && Number(t[0].sent_count) === 1
      && t[0].used_at === null && t[0].organization_id !== null;
    rec("I-01", "a group purchase issues one token, sent and unused", ok,
      `HTTP ${r.status} tokens=${t.length} sent=${t[0]?.sent_at !== null} count=${t[0]?.sent_count} org=${t[0]?.organization_id !== null}`);
  }

  // ------------------------------------------------------------------ I-02
  // THE RACE. A second delivery under a DIFFERENT event id — what a genuine
  // Stripe retry looks like, and what the interactive path arriving late would
  // do — must NOT mint a second token or re-send.
  {
    const before = await tokensFor(email1);
    const r = await deliver(event({ id: `evt_${tag}_1b`, pi: `pi_${tag}_1`, email: email1, students: 100, orgName: `Invite School ${tag}` }));
    const after = await tokensFor(email1);
    const ok = r.status === 200 && after.length === 1
      && after[0].token === before[0].token
      && Number(after[0].sent_count) === Number(before[0].sent_count);
    rec("I-02", "a second run sends nothing and mints no second token", ok,
      `tokens=${after.length} same=${after[0]?.token === before[0]?.token} count=${before[0]?.sent_count}→${after[0]?.sent_count}`);
  }

  // ------------------------------------------------------------------ I-03
  // CONTROL. A ONE-SEAT purchase gets no setup link. That buyer reached the
  // success screen through their own browser and their credentials are on it;
  // a school is the case where nobody may ever see that screen. Without this,
  // code that invited every payer would pass I-01 and I-02.
  {
    const email = mk("solo");
    const r = await deliver(event({ id: `evt_${tag}_2`, pi: `pi_${tag}_2`, email, students: 1, orgName: "Should Not Invite", amount: 4000 }));
    const t = await tokensFor(email);
    rec("I-03", "a one-seat purchase gets NO setup link", r.status === 200 && t.length === 0,
      `HTTP ${r.status} tokens=${t.length}`);
  }

  // ------------------------------------------------------------------ I-04
  // CONTROL. No organizationName means no school was created, so there is
  // nothing to set up and no link is issued — the licences are still granted.
  {
    const email = mk("noname");
    const r = await deliver(event({ id: `evt_${tag}_3`, pi: `pi_${tag}_3`, email, students: 100, orgName: null }));
    const t = await tokensFor(email);
    const u = await sql(`SELECT purchased_licenses FROM users WHERE email = $1`, [email]);
    rec("I-04", "no school name: licences granted, no link issued",
      r.status === 200 && t.length === 0 && Number(u[0]?.purchased_licenses) === 100,
      `HTTP ${r.status} tokens=${t.length} licences=${u[0]?.purchased_licenses}`);
  }

  // ------------------------------------------------------------------ I-05
  // The token is a real credential: 64 hex characters of randomness, and
  // unique across rows. A short or predictable token is a sign-in link anybody
  // can guess, on a product holding minors' data.
  {
    const t = await tokensFor(email1);
    const value = t[0]?.token ?? "";
    const dupes = await sql(`SELECT COUNT(*)::int AS n FROM (SELECT token FROM school_setup_tokens GROUP BY token HAVING COUNT(*) > 1) d`);
    rec("I-05", "the token is 64 hex chars and unique across rows",
      /^[0-9a-f]{64}$/.test(value) && Number(dupes[0].n) === 0,
      `len=${value.length} duplicates=${dupes[0].n}`);
  }
} finally {
  for (const e of emails) {
    try {
      await sql(`DELETE FROM school_setup_tokens WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [e]);
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
