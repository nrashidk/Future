/**
 * EMAILING AN INVOICE, AND WHAT HAPPENED TO THAT MAIL.
 *
 * Two mechanisms, both of which fail silently:
 *
 * The SEND route decides whether the invoice is in a state worth mailing, who
 * it goes to, and whether the supplier's payment details exist. Each refusal
 * is judged HERE by whether the ROW was stamped, never by the status — a
 * failed send that wrote `email_sent_at` would make the one surface that
 * answers "did they get the bill?" lie in the direction that stops anyone
 * chasing it.
 *
 * The WEBHOOK now writes two tables. A delivery event carries a message id and
 * nothing else to say which, so the handler tries the setup tokens and falls
 * through to the invoices. A fall-through that silently matched the wrong table
 * — or stopped matching either — produces 200 and a null column for ever,
 * which looks exactly like "the webhook is not configured".
 *
 *   E-00  the route is real, not the SPA catch-all's 200 HTML
 *   E-01  a guest cannot send, and nothing is stamped
 *   E-02  an ORG ADMIN cannot send its own school's invoice
 *   E-03  a DRAFT is refused: sending is what issuing means
 *   E-04  a CANCELLED invoice is refused
 *   E-05  an invoice with no billing contact and no school is refused, rather
 *         than mailed to nobody
 *   E-06  THE POSITIVE CONTROL: an issued invoice is sent, stamped once
 *   E-07  a RESEND increments the count rather than colliding. The log-only
 *         sentinel must not be stored as a provider id — it would fill the one
 *         slot the unique index allows and the second send would 23505
 *   E-08  an explicit address is used and does NOT rewrite bill_to_email
 *   E-09  with no billing contact it falls back to the school's administrator
 *   E-10  THE FALL-THROUGH: a delivery event for an invoice's message id
 *         writes the INVOICE's columns
 *   E-11  the forward-only rule holds on invoices too — a late `sent` does not
 *         downgrade `delivered`
 *   E-12  a bounce for an invoice touches no setup token, and the suite's own
 *         setup token is unaffected
 *
 * NEEDS, on `up.ts` and on itself, `RESEND_WEBHOOK_SECRET`; and on `up.ts`,
 * the five `INVOICE_*` supplier variables and `PUPPETEER_EXECUTABLE_PATH`.
 * It refuses to run without the secret rather than letting every webhook case
 * pass against the route's own 503.
 *
 * NOT COVERED, deliberately: that a REAL provider message id is captured from
 * the send. A log-only environment has no provider to return one, and storing
 * the sentinel is the defect E-07 exists to catch — so E-10 onward set
 * `provider_message_id` in SQL. Those cases test the webhook's matching, which
 * is what can silently break; the capture is one line in the route.
 *
 * ALSO NOT COVERED: the supplier-details refusal. It reads the environment the
 * server booted with, so it cannot be toggled from here — `INVOICE_*` must be
 * set for E-06 to pass at all. `supplierDetailsMissing` is unit-tested and the
 * route's use of it is a two-line branch, reviewable by eye.
 */
import { createHmac } from "crypto";
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const SECRET = process.env.RESEND_WEBHOOK_SECRET;
if (!SECRET) {
  console.error(
    "REFUSING TO RUN: RESEND_WEBHOOK_SECRET is unset — the webhook route answers 503\n" +
    "with no secret, so every case below would pass against a handler it never reached.",
  );
  process.exit(2);
}

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(62)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

/** Signs exactly as Svix does, over the exact bytes the route will verify. */
async function postEvent(body, overrides = {}) {
  const payload = JSON.stringify(body);
  const id = overrides.id ?? `msg_${Math.random().toString(36).slice(2)}`;
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const raw = (SECRET.startsWith("whsec_") ? SECRET.slice(6) : SECRET);
  const sig = createHmac("sha256", Buffer.from(raw, "base64"))
    .update(`${id}.${timestamp}.${payload}`).digest("base64");
  const res = await fetch(`${BASE}/api/webhook/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${sig}`,
    },
    body: payload,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* HTML from the catch-all */ }
  return { status: res.status, body: parsed, text };
}

const tag = Math.random().toString(36).slice(2, 7);
const { orgs } = await build();
const A = orgs.A;

const sa = new Session(`isend-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const guest = new Session(`isend-guest-${tag}`);
// A never-used session has no csrf_token cookie, so its first state-changing
// request is refused 403 CSRF_MISSING before authentication is consulted —
// which asserts against the wrong guard. One GET first.
await guest.get("/api/auth/user");

const made = [];
const row = (id) => sql(
  `SELECT status, email_sent_at, email_sent_count, provider_message_id,
          delivery_status, delivery_detail, bill_to_email
     FROM invoices WHERE id = $1`, [id],
).then((r) => r[0] ?? null);

async function newInvoice(opts = {}) {
  const created = await sa.post("/api/superadmin/invoices", {
    organizationId: opts.organizationId === null ? A.orgId : A.orgId,
    studentCount: opts.studentCount ?? 10,
    billToEmail: opts.billToEmail,
    dueInDays: 14,
  });
  const id = created.body?.invoice?.id;
  if (!id) throw new Error(`could not create an invoice: ${JSON.stringify(created.body).slice(0, 200)}`);
  made.push(id);
  if (opts.issue !== false) await sa.post(`/api/superadmin/invoices/${id}/issue`, {});
  return id;
}

try {
  // The harness seeds UAE with no price, so countryPricing would fall back to
  // USD and every figure below would be a dollar amount. Set the live one.
  await sql(`UPDATE countries SET license_price_minor = 4000, license_currency = 'AED' WHERE id = 'uae'`);

  // ---------------------------------------------------------------------- E-00
  {
    const id = await newInvoice({ billToEmail: `finance.${tag}@futurepath.test` });
    const r = await sa.post(`/api/superadmin/invoices/${id}/send`, {});
    const isHtml = typeof r.text === "string" && r.text.trimStart().startsWith("<!DOCTYPE");
    rec("E-00", "the send route is real, not the SPA catch-all",
      !isHtml && r.body !== null && r.status !== 404,
      `HTTP ${r.status} html=${isHtml}`);
  }

  // ---------------------------------------------------------------------- E-01
  {
    const id = await newInvoice({ billToEmail: `finance.g.${tag}@futurepath.test` });
    const r = await guest.post(`/api/superadmin/invoices/${id}/send`, {});
    const after = await row(id);
    rec("E-01", "a guest cannot send, and the row is NOT stamped",
      r.status === 401 && after?.email_sent_at === null && after?.email_sent_count === 0,
      `HTTP ${r.status} sent_at=${after?.email_sent_at} count=${after?.email_sent_count}`);
  }

  // ---------------------------------------------------------------------- E-02
  // The school's own admin, on the school's own invoice. The billing surface a
  // school has is read-only by design: sending is a supplier act.
  {
    const id = await newInvoice({ billToEmail: `finance.o.${tag}@futurepath.test` });
    const r = await A.session.post(`/api/superadmin/invoices/${id}/send`, {});
    const after = await row(id);
    rec("E-02", "an ORG ADMIN cannot send its own school's invoice",
      r.status === 403 && after?.email_sent_at === null,
      `HTTP ${r.status} sent_at=${after?.email_sent_at}`);
  }

  // ---------------------------------------------------------------------- E-03
  {
    const id = await newInvoice({ issue: false, billToEmail: `finance.d.${tag}@futurepath.test` });
    const r = await sa.post(`/api/superadmin/invoices/${id}/send`, {});
    const after = await row(id);
    rec("E-03", "a DRAFT is refused and nothing is stamped",
      r.status === 409 && r.body?.code === "INVOICE_NOT_ISSUED"
        && after?.status === "draft" && after?.email_sent_at === null,
      `HTTP ${r.status} ${r.body?.code} status=${after?.status} sent_at=${after?.email_sent_at}`);
  }

  // ---------------------------------------------------------------------- E-04
  {
    const id = await newInvoice({ issue: false, billToEmail: `finance.c.${tag}@futurepath.test` });
    await sa.post(`/api/superadmin/invoices/${id}/cancel`, {});
    const r = await sa.post(`/api/superadmin/invoices/${id}/send`, {});
    const after = await row(id);
    rec("E-04", "a CANCELLED invoice is refused",
      r.status === 409 && r.body?.code === "INVOICE_CANCELLED" && after?.email_sent_at === null,
      `HTTP ${r.status} ${r.body?.code} status=${after?.status}`);
  }

  // ---------------------------------------------------------------------- E-05
  // No billing contact AND no school to fall back to. Detached in SQL because
  // the create route will not raise an invoice without a school — which is the
  // correct behaviour, and leaves this state reachable only afterwards, by a
  // school being deleted (organization_id is ON DELETE SET NULL).
  {
    const id = await newInvoice({});
    await sql(`UPDATE invoices SET organization_id = NULL, bill_to_email = NULL WHERE id = $1`, [id]);
    const r = await sa.post(`/api/superadmin/invoices/${id}/send`, {});
    const after = await row(id);
    rec("E-05", "no address anywhere is refused, not mailed to nobody",
      r.status === 409 && r.body?.code === "NO_RECIPIENT" && after?.email_sent_at === null,
      `HTTP ${r.status} ${r.body?.code} sent_at=${after?.email_sent_at}`);
  }

  // ---------------------------------------------------------------------- E-06
  // THE POSITIVE CONTROL. Without it every refusal above would pass against a
  // route that cannot send at all.
  let sentId = null;
  {
    const to = `finance.ok.${tag}@futurepath.test`;
    sentId = await newInvoice({ billToEmail: to });
    const r = await sa.post(`/api/superadmin/invoices/${sentId}/send`, {});
    const after = await row(sentId);
    rec("E-06", "an ISSUED invoice is sent, to its billing contact, stamped once",
      r.status === 200 && r.body?.sent === true && r.body?.to === to
        && after?.email_sent_at !== null && after?.email_sent_count === 1,
      `HTTP ${r.status} to=${r.body?.to} count=${after?.email_sent_count} sent_at set=${after?.email_sent_at !== null}`);
  }

  // ---------------------------------------------------------------------- E-07
  // THE CASE THAT CAUGHT A REAL DEFECT. The log-only send returns a fixed
  // sentinel in place of a message id; storing it fills the one slot
  // invoices_provider_msg_idx allows, so this second send would fail with
  // 23505 and the route would answer 500 for a mail that went out.
  {
    const r = await sa.post(`/api/superadmin/invoices/${sentId}/send`, {});
    const after = await row(sentId);
    rec("E-07", "a RESEND increments the count and does not collide",
      r.status === 200 && after?.email_sent_count === 2 && after?.provider_message_id === null,
      `HTTP ${r.status} count=${after?.email_sent_count} provider_id=${after?.provider_message_id ?? "null"}`);
  }

  // ---------------------------------------------------------------------- E-08
  // The override is for a wrong address. It must NOT be written back: the PDF
  // has already been rendered carrying bill_to_email, and rewriting the row
  // would make the document and the record disagree about who was billed.
  {
    const original = `finance.orig.${tag}@futurepath.test`;
    const id = await newInvoice({ billToEmail: original });
    const override = `finance.override.${tag}@futurepath.test`;
    const r = await sa.post(`/api/superadmin/invoices/${id}/send`, { email: override });
    const after = await row(id);
    rec("E-08", "an explicit address is used, and bill_to_email is NOT rewritten",
      r.status === 200 && r.body?.to === override && after?.bill_to_email === original,
      `to=${r.body?.to} bill_to_email=${after?.bill_to_email}`);
  }

  // ---------------------------------------------------------------------- E-09
  {
    const id = await newInvoice({});
    await sql(`UPDATE invoices SET bill_to_email = NULL WHERE id = $1`, [id]);
    const [admin] = await sql(
      `SELECT u.email FROM organizations o JOIN users u ON u.id = o.admin_user_id WHERE o.id = $1`,
      [A.orgId],
    );
    const r = await sa.post(`/api/superadmin/invoices/${id}/send`, {});
    rec("E-09", "with no billing contact it falls back to the school's administrator",
      r.status === 200 && !!admin?.email && r.body?.to === admin.email,
      `to=${r.body?.to} admin=${admin?.email}`);
  }

  // ---------------------------------------------------------------------- E-10
  // THE FALL-THROUGH. The message id is planted here rather than captured,
  // because a log-only send has no provider to supply one — see the header.
  const msgId = `inv_msg_${tag}`;
  {
    await sql(`UPDATE invoices SET provider_message_id = $1 WHERE id = $2`, [msgId, sentId]);
    const r = await postEvent({
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: msgId },
    });
    const after = await row(sentId);
    rec("E-10", "a delivery event for an INVOICE id writes the invoice's columns",
      r.status === 200 && r.body?.applied === true && r.body?.subject === "invoice"
        && after?.delivery_status === "delivered",
      `applied=${r.body?.applied} subject=${r.body?.subject} status=${after?.delivery_status}`);
  }

  // ---------------------------------------------------------------------- E-11
  // email.sent and email.delivered are emitted milliseconds apart and travel
  // separately, so `sent` arriving second is ordinary. A handler writing the
  // latest event would downgrade this row and the column would flicker.
  {
    const r = await postEvent({
      type: "email.sent",
      created_at: new Date().toISOString(),
      data: { email_id: msgId },
    });
    const after = await row(sentId);
    rec("E-11", "a LATE email.sent does not downgrade delivered",
      r.status === 200 && r.body?.applied === false && after?.delivery_status === "delivered",
      `applied=${r.body?.applied} status=${after?.delivery_status}`);
  }

  // ---------------------------------------------------------------------- E-12
  // The control for E-10: without it, a fall-through that wrote BOTH tables,
  // or matched on nothing and updated everything, would pass every case above.
  {
    const [u] = await sql(`SELECT admin_user_id AS id FROM organizations WHERE id = $1`, [A.orgId]);
    const tokMsg = `tok_msg_${tag}`;
    await sql(
      `INSERT INTO school_setup_tokens (user_id, token, expires_at, sent_at, sent_count, provider_message_id)
       VALUES ($1, $2, NOW() + INTERVAL '7 days', NOW(), 1, $3)`,
      [u.id, `isend_tok_${tag}`, tokMsg],
    );
    const r = await postEvent({
      type: "email.bounced",
      created_at: new Date().toISOString(),
      data: { email_id: msgId, bounce: { type: "Permanent", subType: "NoEmail" } },
    });
    const after = await row(sentId);
    const [tok] = await sql(
      `SELECT delivery_status FROM school_setup_tokens WHERE provider_message_id = $1`, [tokMsg]);
    rec("E-12", "the invoice bounce touches no setup token",
      r.status === 200 && r.body?.subject === "invoice"
        && after?.delivery_status === "bounced" && tok?.delivery_status === null,
      `invoice=${after?.delivery_status} token=${tok?.delivery_status ?? "null"}`);
    await sql(`DELETE FROM school_setup_tokens WHERE provider_message_id = $1`, [tokMsg]).catch(() => {});
  }
} finally {
  for (const id of made) {
    await sql(`DELETE FROM invoices WHERE id = $1`, [id]).catch(() => {});
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
