/**
 * INVOICING — the sale a school actually makes, and the one place it meets
 * the licence ledger.
 *
 * Schools pay by bank transfer against a purchase order. Until this existed
 * that sale lived nowhere: a superadmin typed a count and an amount into the
 * grant route and the only trace was a ledger row with a note.
 *
 * THE DANGEROUS PART IS NOT THE PAPERWORK, it is that marking an invoice paid
 * changes what a school is entitled to. So almost every case below is judged
 * by the LEDGER and the school's BALANCE, not by a status code — a 200 from
 * mark-paid proves nothing about whether the licences arrived, and an invoice
 * that settled without granting is invisible to every report.
 *
 *   V-00  the route is real — the SPA catch-all answers 200 with HTML for any
 *         unmatched URL, so a misspelled path makes every case "pass"
 *   V-01  a guest cannot raise an invoice
 *   V-02  an ORG ADMIN cannot raise one against their own school
 *   V-03  THE PRICE COMES FROM THE SCHOOL'S COUNTRY, not the request. A body
 *         carrying its own price is ignored
 *   V-04  the volume discount reaches the document
 *   V-05  a draft cannot be marked paid — it was never sent to anyone
 *   V-06  THE POSITIVE CONTROL: issue → pay grants the licences, writes ONE
 *         purchase row, and moves the school's total by exactly the count
 *   V-07  the grant records the SUBTOTAL as revenue, in MAJOR units
 *   V-08  PAYING TWICE grants once. The second request is refused and the
 *         balance does not move — the case that matters most
 *
 * WHAT V-08 DOES NOT PROVE, said plainly: ATOMICITY. PGlite allows a single
 * connection, so two requests fired at once are serialized by the bridge and
 * never overlap — the limitation CLAUDE.md documents for the Stripe webhook.
 * V-08 is therefore the SEQUENTIAL case, a human double-clicking, and it is
 * caught by the `canTransition` read above the write. Proved by mutation:
 * removing that guard fails V-05 and V-08, while removing the status from the
 * UPDATE's own WHERE clause fails NOTHING here. The claim-in-WHERE is still
 * correct on its own terms and is the only thing that would hold under real
 * concurrency — but verifying that needs real Postgres with real concurrent
 * connections, and a green V-08 is not that verification.
 *   V-09  a paid invoice cannot be cancelled or reopened
 *   V-10  reconciliation still balances afterwards, which is the whole point
 *         of routing payment through the existing ledger
 *   V-11  outstanding counts ISSUED only, never drafts
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
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
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

const tag = Math.random().toString(36).slice(2, 7);
const { orgs } = await build();
const A = orgs.A;

const sa = new Session(`inv-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

// A GET first: a never-used session has no csrf_token cookie, so its first
// state-changing request is refused 403 CSRF_MISSING before authentication is
// consulted, and the guest case would assert against the wrong guard.
const guest = new Session(`inv-guest-${tag}`);
await guest.get("/api/auth/user");

const balanceOf = async (orgId) =>
  Number((await sql(`SELECT total_licenses FROM organizations WHERE id = $1`, [orgId]))[0]?.total_licenses ?? -1);
const grantsFor = async (orgId) =>
  await sql(`SELECT kind, licenses_delta, amount_paid, currency, note FROM license_grants
              WHERE organization_id = $1 ORDER BY created_at`, [orgId]);
const invoiceRow = async (id) =>
  (await sql(`SELECT * FROM invoices WHERE id = $1`, [id]))[0] ?? null;

const raise = (session, body) => session.post("/api/superadmin/invoices", body);
const made = [];

/**
 * THE HARNESS SEEDS UAE WITH NO PRICE, so countryPricing falls back to the USD
 * default and every figure below would be $10 rather than AED 40. That is the
 * PRODUCT working — an unpriced country is supposed to fall back and say so —
 * but a suite that asserted the fallback figures would be testing the default,
 * not the pricing. The first draft did exactly that and failed four cases
 * against working code.
 *
 * So the price is set here, deliberately and visibly, to the live production
 * value. V-03b then clears it again to prove the fallback is REPORTED rather
 * than silently applied.
 */
await sql(`UPDATE countries SET license_price_minor = 4000, license_currency = 'AED' WHERE id = 'uae'`);

try {
  // --------------------------------------------------------------------- V-00
  {
    const r = await raise(sa, { organizationId: A.orgId, studentCount: 10 });
    if (r.body?.invoice?.id) made.push(r.body.invoice.id);
    rec("V-00", "the route is real: JSON, not the SPA's 200 HTML",
      r.status === 201 && !isHtml(r.body) && !!r.body?.invoice?.number,
      `HTTP ${r.status} number=${r.body?.invoice?.number}`);
  }

  // --------------------------------------------------------------------- V-01
  {
    const before = (await sql(`SELECT COUNT(*)::int n FROM invoices`))[0].n;
    const r = await raise(guest, { organizationId: A.orgId, studentCount: 10 });
    const after = (await sql(`SELECT COUNT(*)::int n FROM invoices`))[0].n;
    rec("V-01", "a guest cannot raise an invoice", r.status === 401 && after === before,
      `HTTP ${r.status} invoices ${before}→${after}`);
  }

  // --------------------------------------------------------------------- V-02
  {
    const before = (await sql(`SELECT COUNT(*)::int n FROM invoices`))[0].n;
    const r = await raise(A.session, { organizationId: A.orgId, studentCount: 10 });
    const after = (await sql(`SELECT COUNT(*)::int n FROM invoices`))[0].n;
    rec("V-02", "an ORG ADMIN cannot bill their own school", r.status === 403 && after === before,
      `HTTP ${r.status} invoices ${before}→${after}`);
  }

  // --------------------------------------------------------------------- V-03
  // THE PRICE IS SERVER-DERIVED. Public checkout has to take a country from
  // the request because a group buyer has no account; an invoice does not have
  // that excuse, and accepting one here would reintroduce the arbitrage that
  // path is still waiting on.
  {
    const r = await raise(sa, {
      organizationId: A.orgId, studentCount: 10,
      unitPriceMinor: 1, currency: "USD", totalMinor: 10, // all ignored
    });
    if (r.body?.invoice?.id) made.push(r.body.invoice.id);
    const inv = r.body?.invoice;
    rec("V-03", "the price comes from the SCHOOL's country, not the request body",
      r.status === 201 && inv?.currency === "AED" && inv?.unitPriceMinor === 4000
        && inv?.totalMinor === 40000,
      `currency=${inv?.currency} unit=${inv?.unitPriceMinor} total=${inv?.totalMinor}`);
  }

  // -------------------------------------------------------------------- V-03b
  // AN UNPRICED COUNTRY MUST BE VISIBLE, not discovered on a receipt. The
  // fallback itself is correct; billing a UAE school in dollars without
  // saying so is not.
  {
    await sql(`UPDATE countries SET license_price_minor = NULL, license_currency = NULL WHERE id = 'uae'`);
    const r = await raise(sa, { organizationId: A.orgId, studentCount: 10 });
    if (r.body?.invoice?.id) made.push(r.body.invoice.id);
    await sql(`UPDATE countries SET license_price_minor = 4000, license_currency = 'AED' WHERE id = 'uae'`);
    rec("V-03b", "an UNPRICED country falls back to USD and SAYS SO",
      r.status === 201 && r.body?.usesFallbackPrice === true && r.body?.invoice?.currency === "USD",
      `usesFallbackPrice=${r.body?.usesFallbackPrice} currency=${r.body?.invoice?.currency}`);
  }

  // --------------------------------------------------------------------- V-04
  {
    const r = await raise(sa, { organizationId: A.orgId, studentCount: 100 });
    if (r.body?.invoice?.id) made.push(r.body.invoice.id);
    const inv = r.body?.invoice;
    // 100 students is the first tier: 10% off AED 40.00 = AED 36.00 each.
    rec("V-04", "the volume discount reaches the document",
      inv?.discountPercent === 10 && inv?.perStudentMinor === 3600 && inv?.subtotalMinor === 360000,
      `discount=${inv?.discountPercent}% perStudent=${inv?.perStudentMinor} subtotal=${inv?.subtotalMinor}`);
  }

  // --------------------------------------------------------------------- V-05
  // Skipping `issued` would grant licences against a document the school has
  // never seen.
  {
    const created = await raise(sa, { organizationId: A.orgId, studentCount: 5 });
    const id = created.body?.invoice?.id;
    if (id) made.push(id);
    const before = await balanceOf(A.orgId);
    const r = await sa.post(`/api/superadmin/invoices/${id}/mark-paid`, {});
    const after = await balanceOf(A.orgId);
    rec("V-05", "a DRAFT cannot be marked paid, and grants nothing",
      r.status === 409 && after === before,
      `HTTP ${r.status} code=${r.body?.code} balance ${before}→${after}`);
  }

  // --------------------------------------------------------------------- V-06
  // THE POSITIVE CONTROL. Without it every refusal above passes against a
  // feature that never works.
  let paidInvoiceId = null;
  {
    const created = await raise(sa, { organizationId: A.orgId, studentCount: 25 });
    paidInvoiceId = created.body?.invoice?.id;
    if (paidInvoiceId) made.push(paidInvoiceId);
    const balanceBefore = await balanceOf(A.orgId);
    const grantsBefore = (await grantsFor(A.orgId)).length;

    const issued = await sa.post(`/api/superadmin/invoices/${paidInvoiceId}/issue`, {});
    const paid = await sa.post(`/api/superadmin/invoices/${paidInvoiceId}/mark-paid`,
      { paymentReference: `TT-${tag}` });

    const balanceAfter = await balanceOf(A.orgId);
    const grants = await grantsFor(A.orgId);
    const row = await invoiceRow(paidInvoiceId);

    rec("V-06", "issue → pay grants exactly 25 licences and writes ONE grant row",
      issued.status === 200 && paid.status === 200
        && balanceAfter === balanceBefore + 25
        && grants.length === grantsBefore + 1
        && row?.status === "paid" && row?.paid_at !== null && row?.license_grant_id !== null,
      `balance ${balanceBefore}→${balanceAfter} grants ${grantsBefore}→${grants.length} status=${row?.status} grantId=${row?.license_grant_id ? "set" : "NULL"}`);
  }

  // --------------------------------------------------------------------- V-07
  // Revenue is the SUBTOTAL in MAJOR units. VAT is collected for the tax
  // authority and is not revenue; and 1000 minor units is ten dirhams but ONE
  // dinar, so a hardcoded /100 mis-records the Gulf three-decimal currencies
  // by a factor of ten.
  {
    const grants = await grantsFor(A.orgId);
    const last = grants[grants.length - 1];
    rec("V-07", "the grant is a PURCHASE recording the subtotal in major units",
      last?.kind === "purchase" && Number(last?.amount_paid) === 1000
        && last?.currency === "AED" && String(last?.note ?? "").includes("FP-"),
      `kind=${last?.kind} amount=${last?.amount_paid} ${last?.currency} note="${String(last?.note ?? "").slice(0, 40)}"`);
  }

  // --------------------------------------------------------------------- V-08
  // THE CASE THAT MATTERS MOST — a double-click must not grant twice.
  //
  // Caught here by the canTransition read, NOT by the claim in the UPDATE's
  // WHERE clause: these two requests are sequential, and PGlite cannot make
  // them overlap. See the header. The WHERE-clause claim is what would hold
  // under real concurrency and this suite cannot speak to it.
  {
    const balanceBefore = await balanceOf(A.orgId);
    const grantsBefore = (await grantsFor(A.orgId)).length;
    const again = await sa.post(`/api/superadmin/invoices/${paidInvoiceId}/mark-paid`,
      { paymentReference: `TT-${tag}-again` });
    const balanceAfter = await balanceOf(A.orgId);
    const grantsAfter = (await grantsFor(A.orgId)).length;
    rec("V-08", "paying the SAME invoice twice grants once",
      again.status === 409 && balanceAfter === balanceBefore && grantsAfter === grantsBefore,
      `HTTP ${again.status} balance ${balanceBefore}→${balanceAfter} grants ${grantsBefore}→${grantsAfter}`);
  }

  // --------------------------------------------------------------------- V-09
  // Un-paying would mean un-granting licences a school may already have spent,
  // and the ledger has no such operation by design.
  {
    const cancel = await sa.post(`/api/superadmin/invoices/${paidInvoiceId}/cancel`, {});
    const issue = await sa.post(`/api/superadmin/invoices/${paidInvoiceId}/issue`, {});
    const row = await invoiceRow(paidInvoiceId);
    rec("V-09", "a PAID invoice can be neither cancelled nor reopened",
      cancel.status === 409 && issue.status === 409 && row?.status === "paid",
      `cancel=${cancel.status} issue=${issue.status} status=${row?.status}`);
  }

  // --------------------------------------------------------------------- V-10
  // The whole reason payment routes through the existing ledger: a second way
  // to change entitlement is exactly what reconciliation exists to catch.
  {
    const r = await sa.get("/api/superadmin/licenses/reconciliation");
    const rows = r.body?.discrepancies ?? r.body?.mismatches ?? r.body?.organizations ?? [];
    const ours = Array.isArray(rows) ? rows.filter((x) => x.organizationId === A.orgId || x.id === A.orgId) : [];
    rec("V-10", "reconciliation still balances for the school we just billed",
      r.status === 200 && ours.length === 0,
      `HTTP ${r.status} discrepancies for this school=${ours.length}`);
  }

  // --------------------------------------------------------------------- V-11
  // A draft has not been sent to anybody, so counting it would report money as
  // owed that nobody has been asked for.
  {
    const created = await raise(sa, { organizationId: A.orgId, studentCount: 7 });
    const id = created.body?.invoice?.id;
    if (id) made.push(id);
    const beforeIssue = await sa.get("/api/superadmin/invoices");
    await sa.post(`/api/superadmin/invoices/${id}/issue`, {});
    const afterIssue = await sa.get("/api/superadmin/invoices");
    const moved = (afterIssue.body?.outstandingMinor ?? 0) - (beforeIssue.body?.outstandingMinor ?? 0);
    rec("V-11", "outstanding counts ISSUED only — a draft owes nothing",
      moved === 7 * 4000,
      `outstanding moved by ${moved} on issuing a 7-student invoice (expected ${7 * 4000})`);
  }
} finally {
  for (const id of made) { try { await sql(`DELETE FROM invoices WHERE id = $1`, [id]); } catch {} }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
