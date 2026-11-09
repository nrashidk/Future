/**
 * STRIPE WEBHOOK DELIVERY IDEMPOTENCY.
 *
 * Stripe retries until it gets a 2xx and may redeliver even after one. The
 * only guard used to be `paymentIntent.metadata.processed === "true"`, read off
 * the EVENT PAYLOAD — a snapshot taken when the event was CREATED — so on a
 * genuine retry the flag is absent even though the first delivery stamped the
 * PaymentIntent. `stripe_webhook_events` (migration 034) stores `event.id` and
 * lets the primary key decide.
 *
 * REAL SIGNED EVENTS, not a stubbed handler. The suite signs each payload with
 * the same secret the server verifies against, so the signature check is in the
 * path for every case below. That matters: a test that bypassed verification
 * would also bypass the claim, which sits deliberately AFTER it.
 *
 * No network is involved. constructEvent is local crypto, and the event type
 * used for the idempotency cases is one the switch does not handle, so it
 * reaches `default:` and no handler calls the Stripe API. That is the point —
 * the mechanism under test is the claim, not what any particular handler does.
 *
 * NEEDS, and the suite refuses to run without them, because every case would
 * otherwise "pass" on a 500 or a 503:
 *   STRIPE_SECRET_KEY=sk_test_dummy  (constructs the client; never called)
 *   STRIPE_WEBHOOK_SECRET=whsec_...  (the same value passed to up.ts)
 *
 * NOT COVERED, and said plainly rather than faked: the release-on-failure path.
 * The handler deletes its own claim when processing throws, so Stripe's retry
 * can run — and there is no deterministic way to make a handler throw from
 * outside without a network call that would hang. W-06 asserts the release at
 * the STORAGE level instead, which proves the delete works but not that the
 * route calls it. Flagged for a human rather than papered over.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  const tag = pass === null ? "BLOCK" : pass ? "PASS " : "FAIL ";
  console.log(`${tag} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

if (!SECRET) {
  console.error(
    "REFUSING TO RUN: STRIPE_WEBHOOK_SECRET is unset, so every case would be\n" +
    "answered by the route's own 500 'Webhook secret not configured' and would\n" +
    "prove nothing. Boot up.ts with STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET\n" +
    "set, and pass the same secret to this suite.",
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

const tag = Math.random().toString(36).slice(2, 8);

/**
 * An event type the switch does NOT handle, so it lands on `default:` and is
 * claimed, trivially processed and stamped without touching Stripe or granting
 * anything. The claim is what is being measured.
 */
function makeEvent(id) {
  return {
    id,
    object: "event",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "invoice.payment_succeeded",
    data: { object: { id: `in_${tag}`, object: "invoice" } },
  };
}

async function deliver(event, { corrupt = false, unsigned = false } = {}) {
  const payload = JSON.stringify(event);
  const headers = { "content-type": "application/json" };
  if (!unsigned) {
    headers["stripe-signature"] = stripe.webhooks.generateTestHeaderString({
      payload: corrupt ? payload.replace(/invoice/, "charge") : payload,
      secret: SECRET,
    });
  }
  const res = await fetch(`${BASE}/api/webhook/stripe`, { method: "POST", headers, body: payload });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

const rows = (eventId) =>
  sql(`SELECT event_id, event_type, processed_at FROM stripe_webhook_events WHERE event_id = $1`, [eventId]);

try {
  // ------------------------------------------------------------------ W-00
  // The route is real. The SPA catch-all answers 200 with HTML for any
  // unmatched URL, so without this every case below could be passing against
  // a route that was never registered.
  {
    const r = await deliver(makeEvent(`evt_${tag}_probe`), { unsigned: true });
    const isOurs = r.status === 400 && typeof r.body === "object" && typeof r.body.error === "string";
    rec("W-00", "route exists; unsigned delivery refused with a JSON error", isOurs,
      `${r.status} ${JSON.stringify(r.body).slice(0, 70)}`);
  }

  // ------------------------------------------------------------------ W-01
  // Signature verification is load-bearing and sits BEFORE the claim, so a
  // forged event cannot pre-claim a real event id and starve the genuine one.
  {
    const id = `evt_${tag}_tamper`;
    const r = await deliver(makeEvent(id), { corrupt: true });
    const after = await rows(id);
    rec("W-01", "tampered payload refused AND leaves no claim behind",
      r.status === 400 && after.length === 0,
      `${r.status} rows=${after.length}`);
  }

  // ------------------------------------------------------------------ W-02
  {
    const id = `evt_${tag}_first`;
    const r = await deliver(makeEvent(id));
    const after = await rows(id);
    const ok = r.status === 200 && r.body?.received === true && !r.body?.duplicate
      && after.length === 1 && after[0].processed_at !== null;
    rec("W-02", "first delivery is processed and stamped processed_at", ok,
      `${r.status} dup=${r.body?.duplicate} rows=${after.length} stamped=${after[0]?.processed_at !== null}`);

    // ---------------------------------------------------------------- W-03
    // The assertion that matters. Same event id again: answered 200 so Stripe
    // stops retrying, flagged duplicate, and NO second row.
    const again = await deliver(makeEvent(id));
    const afterAgain = await rows(id);
    rec("W-03", "redelivery of the same event id is a no-op duplicate",
      again.status === 200 && again.body?.duplicate === true && afterAgain.length === 1,
      `${again.status} dup=${again.body?.duplicate} rows=${afterAgain.length}`);

    // ---------------------------------------------------------------- W-04
    // 200, not 409: Stripe retries anything non-2xx, so a 409 on a duplicate
    // would keep it retrying for ever.
    rec("W-04", "duplicate answers 2xx so Stripe stops retrying", again.status === 200,
      `status=${again.status}`);
  }

  // ------------------------------------------------------------------ W-05
  // The negative case. Without it, a claim that refused EVERY event would pass
  // W-03 and W-04 and the webhook would be dead.
  {
    const id = `evt_${tag}_other`;
    const r = await deliver(makeEvent(id));
    const after = await rows(id);
    rec("W-05", "a different event id is still processed, not blocked",
      r.status === 200 && !r.body?.duplicate && after.length === 1,
      `${r.status} dup=${r.body?.duplicate} rows=${after.length}`);
  }

  // ------------------------------------------------------------------ W-06
  // STORAGE LEVEL, and labelled as such: proves the delete the route calls on
  // failure actually frees the id for a retry. Does not prove the route calls
  // it -- see the header note.
  {
    const id = `evt_${tag}_release`;
    await deliver(makeEvent(id));
    const before = (await rows(id)).length;
    await sql(`DELETE FROM stripe_webhook_events WHERE event_id = $1`, [id]);
    const r = await deliver(makeEvent(id));
    const after = await rows(id);
    rec("W-06", "a released claim lets the same event be processed again",
      before === 1 && r.status === 200 && !r.body?.duplicate && after.length === 1,
      `before=${before} replay=${r.status} dup=${r.body?.duplicate} rows=${after.length}`);
  }

  // ------------------------------------------------------------------ W-07
  /**
   * EIGHT DELIVERIES OF ONE EVENT ID AT ONCE -- AND READ THE LIMIT BELOW
   * BEFORE TREATING THIS AS PROOF OF ATOMICITY. IT IS NOT.
   *
   * It was written to prove that the claim is one atomic statement rather than
   * a read followed by an insert. It does not, and that was established by
   * trying: replacing the claim with an explicit SELECT-then-INSERT leaves this
   * case PASSING. PGlite allows a single connection, so the eight deliveries
   * are serialized by the bridge and never actually overlap. There is no race
   * here to lose.
   *
   * What it does prove, and what it caught: deleting the dedupe entirely fails
   * it (fresh=8, duplicates=0) alongside W-03. So it is a real assertion about
   * repeated delivery accounting, just not the one its shape suggests.
   *
   * The atomicity of `ON CONFLICT DO NOTHING ... RETURNING` is therefore
   * UNPROVEN IN THIS HARNESS and needs real Postgres with real concurrent
   * connections. The implementation stays atomic regardless -- it is correct on
   * its own terms and costs nothing -- but nobody should read a green W-07 as
   * having tested the race.
   */
  {
    const id = `evt_${tag}_race`;
    const ev = makeEvent(id);
    const settled = await Promise.all(Array.from({ length: 8 }, () => deliver(ev)));
    const fresh = settled.filter((r) => r.status === 200 && !r.body?.duplicate).length;
    const dupes = settled.filter((r) => r.body?.duplicate === true).length;
    const after = await rows(id);
    rec("W-07", "8 deliveries of one id: one claim, one row (NOT a race test)",
      fresh === 1 && dupes === 7 && after.length === 1,
      `fresh=${fresh} duplicates=${dupes} rows=${after.length}`);
  }

  // ------------------------------------------------------------------ W-08
  // No personal data is recorded. The payload holds a buyer's email and a
  // student's details; this table deduplicates deliveries, it does not archive
  // them.
  {
    const cols = await sql(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'stripe_webhook_events' ORDER BY column_name`,
    );
    const names = cols.map((c) => c.column_name);
    const expected = ["event_id", "event_type", "processed_at", "received_at"];
    const same = names.length === expected.length && names.every((n, i) => n === expected[i]);
    rec("W-08", "the table stores no payload and no personal data", same, names.join(", "));
  }
} finally {
  await sql(`DELETE FROM stripe_webhook_events WHERE event_id LIKE $1`, [`evt_${tag}%`]);
}

const failed = results.filter((r) => r.pass === false);
const blocked = results.filter((r) => r.pass === null);
console.log(`\n${results.length - failed.length - blocked.length}/${results.length} passed${blocked.length ? `, ${blocked.length} blocked` : ""}`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
