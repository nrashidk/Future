/**
 * RESEND DELIVERY EVENTS — telling a bounce from an unopened inbox.
 *
 * Before migration 036, `sent_at` was the whole story: it means Resend
 * ACCEPTED the message. A hard bounce off a misspelled domain, a spam folder,
 * a gateway that dropped it and an inbox nobody looked at were one
 * indistinguishable null in `used_at`, and they need opposite actions from a
 * superadmin — correct the address, or resend and telephone.
 *
 * REAL SIGNED EVENTS. Each case below signs its payload with the same secret
 * the route verifies against, so Svix verification is in the path every time.
 * A suite that bypassed it would also bypass everything the route does after
 * it, which is all of the behaviour.
 *
 * THE CASE THAT MATTERS IS R-05. Resend emits email.sent and email.delivered
 * milliseconds apart and they travel separately, so `sent` arriving AFTER
 * `delivered` is ordinary, not exotic. A handler that wrote the latest event
 * would downgrade the row at random and the superadmin column would flicker
 * between "arrived" and "handed over" with nothing in the product changing —
 * an intermittent fault that reads as a UI bug. The forward-only rule is
 * enforced in the UPDATE's own WHERE clause, so two events racing are
 * arbitrated by the database rather than by a read taken outside the write.
 *
 * NEEDS, and this suite refuses to run without it, because every case would
 * otherwise be answered by the route's own 503 and prove nothing:
 *   RESEND_WEBHOOK_SECRET=whsec_bG9jYWx0ZXN0c2VjcmV0  (the same value on up.ts)
 *
 * NOT COVERED, said plainly: that Resend's real payloads carry the field names
 * assumed here. `data.email_id` and `data.id` are BOTH read for that reason,
 * and getting it wrong is the quietest possible failure — every event matches
 * no row, every response is 200, and the column stays null, which looks
 * exactly like an unconfigured webhook. The first real bounce on production is
 * the only thing that proves the field name, so the route logs loudly on a
 * recorded bounce and `applied` is returned in the response body for exactly
 * this check.
 */
import { createHmac, randomBytes } from "crypto";
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SECRET = process.env.RESEND_WEBHOOK_SECRET;

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

if (!SECRET) {
  console.error(
    "REFUSING TO RUN: RESEND_WEBHOOK_SECRET is unset, so the route answers 503\n" +
    "to every case and each one would 'pass' against a handler it never reached.\n\n" +
    "  RESEND_WEBHOOK_SECRET=whsec_bG9jYWx0ZXN0c2VjcmV0 npx tsx testing/local/up.ts\n" +
    "  RESEND_WEBHOOK_SECRET=whsec_bG9jYWx0ZXN0c2VjcmV0 node testing/local/resend-webhook.mjs\n",
  );
  process.exit(1);
}

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

/** The same HMAC the route verifies: base64(HMAC-SHA256(key, "id.ts.body")). */
function sign(id, timestamp, body) {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

async function send(event, opts = {}) {
  const body = JSON.stringify(event);
  const id = opts.svixId ?? `msg_${randomBytes(8).toString("hex")}`;
  const ts = String(opts.timestamp ?? Math.floor(Date.now() / 1000));
  const headers = { "Content-Type": "application/json" };
  if (!opts.omitHeaders) {
    headers["svix-id"] = id;
    headers["svix-timestamp"] = ts;
    headers["svix-signature"] = opts.badSignature ? "v1,ZGVmaW5pdGVseW5vdHRoZXNpZ25hdHVyZQ==" : sign(id, ts, body);
  }
  const res = await fetch(`${BASE}/api/webhook/resend`, { method: "POST", headers, body });
  const text = await res.text();
  let parsed = null; try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, body: parsed, text, isHtml: text.trimStart().startsWith("<!DOCTYPE") };
}

const evt = (type, emailId, extra = {}) => ({
  type,
  created_at: new Date().toISOString(),
  data: { email_id: emailId, to: ["buyer@futurepath.test"], ...extra },
});

const statusOf = async (msgId) => {
  const [row] = await sql(
    `SELECT delivery_status, delivery_detail, delivery_status_at, sent_count
       FROM school_setup_tokens WHERE provider_message_id = $1`, [msgId]);
  return row ?? null;
};

const tag = randomBytes(3).toString("hex");
await build();

// A token row to hang the events on. Written as SQL, never with a bound JS
// Date: PGlite mis-binds those, and a timestamp fixture written that way lies
// (see CLAUDE.md — school-setup-link.mjs reported a false expiry that way).
const [user] = await sql(
  `INSERT INTO users (id, username, email, account_type, password_hash)
   VALUES (gen_random_uuid(), $1, $2, 'individual', '$2b$10$notarealhashbutnotnull')
   RETURNING id`,
  [`rw${tag}`, `rw.${tag}@futurepath.test`],
);
const MSG = `msg_real_${tag}`;
const token = randomBytes(16).toString("hex");
await sql(
  `INSERT INTO school_setup_tokens (user_id, token, expires_at, sent_at, sent_count, provider_message_id)
   VALUES ($1, $2, NOW() + INTERVAL '7 days', NOW(), 1, $3)`,
  [user.id, token, MSG],
);

try {
  // ------------------------------------------------------------------ R-00
  // The SPA catch-all answers 200 with HTML for any unmatched URL, so a
  // misspelled path would make every case below "pass" on nothing.
  {
    const r = await send(evt("email.delivered", MSG));
    rec("R-00", "the route is real: JSON, not the SPA's 200 HTML",
      !r.isHtml && r.body !== null, `HTTP ${r.status} ${r.isHtml ? "HTML" : JSON.stringify(r.body)}`);
  }
  // R-00 already applied `delivered`. Reset so each case below starts clean.
  await sql(`UPDATE school_setup_tokens SET delivery_status = NULL, delivery_status_at = NULL,
             delivery_detail = NULL WHERE provider_message_id = $1`, [MSG]);

  // ------------------------------------------------------------------ R-01
  {
    const r = await send(evt("email.delivered", MSG), { omitHeaders: true });
    const after = await statusOf(MSG);
    rec("R-01", "no signature headers: refused, nothing written",
      r.status === 401 && after?.delivery_status === null,
      `HTTP ${r.status} status=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-02
  {
    const r = await send(evt("email.delivered", MSG), { badSignature: true });
    const after = await statusOf(MSG);
    rec("R-02", "a WRONG signature is refused, nothing written",
      r.status === 401 && after?.delivery_status === null,
      `HTTP ${r.status} code=${r.body?.code} status=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-03
  // A correctly signed event from an hour ago. The signature is valid — only
  // the timestamp is stale — so this proves the replay window is checked and
  // not merely that a bad signature fails.
  {
    const r = await send(evt("email.delivered", MSG), { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    const after = await statusOf(MSG);
    rec("R-03", "a VALIDLY SIGNED but stale event is refused (replay window)",
      r.status === 401 && r.body?.code === "TIMESTAMP_OUT_OF_TOLERANCE" && after?.delivery_status === null,
      `HTTP ${r.status} code=${r.body?.code} status=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-04
  // THE POSITIVE CONTROL. Without it every refusal above passes against a
  // route that refuses everything.
  {
    const r = await send(evt("email.delivered", MSG));
    const after = await statusOf(MSG);
    rec("R-04", "a valid email.delivered IS recorded",
      r.status === 200 && r.body?.applied === true && after?.delivery_status === "delivered",
      `HTTP ${r.status} applied=${r.body?.applied} status=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-05
  // THE ORDERING CASE, and the reason the rule lives in the WHERE clause.
  {
    const r = await send(evt("email.sent", MSG));
    const after = await statusOf(MSG);
    rec("R-05", "a LATE email.sent does NOT downgrade a delivered row",
      r.status === 200 && r.body?.applied === false && after?.delivery_status === "delivered",
      `HTTP ${r.status} applied=${r.body?.applied} status=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-06
  // A bounce outranks a delivery: it describes what happened after the
  // attempt, and it is the one state a human must act on.
  {
    const r = await send(evt("email.bounced", MSG, {
      bounce: { type: "Permanent", subType: "NoEmail", message: "Recipient address does not exist" },
    }));
    const after = await statusOf(MSG);
    rec("R-06", "a bounce overwrites a delivery, and the reason is kept",
      r.status === 200 && r.body?.applied === true && after?.delivery_status === "bounced"
        && (after?.delivery_detail ?? "").includes("does not exist"),
      `applied=${r.body?.applied} status=${after?.delivery_status} detail=${(after?.delivery_detail ?? "").slice(0, 40)}`);
  }

  // ------------------------------------------------------------------ R-07
  // Svix retries on any non-2xx and may redeliver after a 2xx. A repeat must
  // change nothing — judged by `applied`, not by the 200 both cases return.
  {
    const r = await send(evt("email.bounced", MSG, { bounce: { type: "Permanent" } }));
    const after = await statusOf(MSG);
    rec("R-07", "a REDELIVERED bounce changes nothing",
      r.status === 200 && r.body?.applied === false && after?.delivery_status === "bounced"
        && (after?.delivery_detail ?? "").includes("does not exist"),
      `applied=${r.body?.applied} detail unchanged=${(after?.delivery_detail ?? "").includes("does not exist")}`);
  }

  // ------------------------------------------------------------------ R-08
  // Resend sends events for EVERY mail on the account — password resets, guest
  // report recoveries. An id we do not hold is not an error and must not touch
  // a row we do hold.
  {
    const before = await statusOf(MSG);
    const r = await send(evt("email.delivered", `msg_not_ours_${tag}`));
    const after = await statusOf(MSG);
    rec("R-08", "an unknown message id is ignored and touches no other row",
      r.status === 200 && r.body?.applied === false && after?.delivery_status === before?.delivery_status,
      `applied=${r.body?.applied} ours still=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-09
  // Open tracking is a pixel that Apple Mail Privacy Protection and Gmail's
  // image proxy fire or suppress on the recipient's behalf. A status built on
  // it would be confidently wrong in both directions.
  {
    const r = await send(evt("email.opened", MSG));
    const after = await statusOf(MSG);
    rec("R-09", "email.opened is ignored rather than trusted as delivery",
      r.status === 200 && r.body?.ignored === "event_type" && after?.delivery_status === "bounced",
      `ignored=${r.body?.ignored} status=${after?.delivery_status}`);
  }

  // ------------------------------------------------------------------ R-10
  // A RESEND CLEARS THE STATUS. The column describes the message currently in
  // flight; leaving the previous attempt's bounce in place would report the
  // old failure against the new mail, and a superadmin would stop trying.
  {
    await sql(
      `UPDATE school_setup_tokens
          SET sent_at = NOW(), sent_count = sent_count + 1, provider_message_id = $2,
              delivery_status = NULL, delivery_status_at = NULL, delivery_detail = NULL
        WHERE token = $1`,
      [token, `msg_resent_${tag}`],
    );
    const stale = await statusOf(MSG);
    const fresh = await statusOf(`msg_resent_${tag}`);
    rec("R-10", "a resend clears the previous attempt's bounce",
      stale === null && fresh?.delivery_status === null && fresh?.sent_count === 2,
      `old row gone=${stale === null} new status=${fresh?.delivery_status} sent_count=${fresh?.sent_count}`);
  }
} finally {
  await sql(`DELETE FROM school_setup_tokens WHERE user_id = $1`, [user.id]).catch(() => {});
  await sql(`DELETE FROM users WHERE id = $1`, [user.id]).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
