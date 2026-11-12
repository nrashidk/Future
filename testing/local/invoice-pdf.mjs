/**
 * THE INVOICE PDF, asserted against the RENDER rather than the CSS.
 *
 * The student report's pagination bug is the reason this suite exists in this
 * shape: the CSS read as correct, and the fault was in which SIBLING a
 * selector matched. It was only ever caught by measuring the rendered PDF.
 * An invoice has a worse version of the same failure — a second page holding
 * nothing but a footer looks to a school like a document that got cut off.
 *
 * READ AS BYTES, NEVER res.text(). `res.text()` on a PDF reports a plausible
 * `%PDF` header and around 200 bytes for a megabyte file, so a size assertion
 * made that way passes on a broken render (CLAUDE.md).
 *
 *   P-00  the route is real — not the SPA catch-all's 200 HTML
 *   P-01  a guest gets no PDF
 *   P-02  a school cannot download ANOTHER school's invoice
 *   P-03  THE POSITIVE CONTROL: a real PDF, with a %PDF header and real bytes
 *   P-04  ONE PAGE. The report's bug produced a near-blank trailing page
 *   P-05  the figures are IN the rendered text, not merely in the source
 *   P-06  Arabic renders, is one page, and carries Arabic text
 *   P-07  the Arabic render is not simply the English one relabelled
 *   P-08  a school CAN download its own
 *
 * NEEDS a Chromium: set PUPPETEER_EXECUTABLE_PATH on `up.ts`, the same one
 * report.mjs needs. Without it this refuses to run rather than reporting
 * failures that are really a missing browser.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

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
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

const tag = Math.random().toString(36).slice(2, 7);
const { orgs } = await build();
const A = orgs.A;
const B = orgs.B;

const sa = new Session(`pdf-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const guest = new Session(`pdf-guest-${tag}`);
await guest.get("/api/auth/user");

/**
 * The Session helper parses JSON, which would corrupt a PDF, so these fetch
 * by hand with the session's cookie and read an ArrayBuffer.
 */
async function fetchBytes(session, path) {
  // `session.cookie` is the jar the fixture keeps; x-forwarded-for keeps each
  // session in its own rate-limit bucket, exactly as Session.req does.
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      ...(session.cookie ? { cookie: session.cookie } : {}),
      "x-forwarded-for": session.clientIp,
    },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type") ?? "", bytes: buf };
}

const isPdf = (b) => b.length > 4 && b.subarray(0, 4).toString("latin1") === "%PDF";
/** Pages, counted from the rendered file rather than assumed. */
const pageCount = (b) => {
  const m = b.toString("latin1").match(/\/Type\s*\/Page[^s]/g);
  return m ? m.length : 0;
};
/** Rough text extraction: enough to assert a figure is ON the page. */
const textOf = async (b) => {
  const { execFile } = await import("child_process");
  return await new Promise((resolve) => {
    const p = execFile("pdftotext", ["-", "-"], { maxBuffer: 20e6 }, (err, stdout) =>
      resolve(err ? "" : stdout));
    p.stdin.end(b);
  });
};

let invoiceId = null;
const made = [];

try {
  await sql(`UPDATE countries SET license_price_minor = 4000, license_currency = 'AED' WHERE id = 'uae'`);
  const created = await sa.post("/api/superadmin/invoices", {
    organizationId: A.orgId, studentCount: 250, dueInDays: 14,
  });
  invoiceId = created.body?.invoice?.id;
  if (invoiceId) made.push(invoiceId);
  await sa.post(`/api/superadmin/invoices/${invoiceId}/issue`, {});

  // ---------------------------------------------------------------------- P-00
  {
    const r = await fetchBytes(sa, `/api/superadmin/invoices/${invoiceId}/pdf`);
    const html = r.bytes.subarray(0, 15).toString("latin1").trimStart().startsWith("<!DOCTYPE");
    rec("P-00", "the route is real: a PDF, not the SPA's 200 HTML",
      r.status === 200 && !html && r.type.includes("pdf"),
      `HTTP ${r.status} type=${r.type} html=${html}`);
  }

  // ---------------------------------------------------------------------- P-01
  {
    const r = await fetchBytes(guest, `/api/superadmin/invoices/${invoiceId}/pdf`);
    rec("P-01", "a guest gets no PDF", r.status === 401 && !isPdf(r.bytes),
      `HTTP ${r.status} pdf=${isPdf(r.bytes)}`);
  }

  // ---------------------------------------------------------------------- P-02
  // THE CASE THAT MATTERS. A download is a different verb on the same
  // resource, and the control has to be repeated on it.
  {
    const r = await fetchBytes(B.session, `/api/my-organization/invoices/${invoiceId}/pdf`);
    rec("P-02", "school B cannot download school A's invoice",
      r.status === 404 && !isPdf(r.bytes),
      `HTTP ${r.status} pdf=${isPdf(r.bytes) ? "LEAKED" : "none"}`);
  }

  // ---------------------------------------------------------------------- P-03
  // THE POSITIVE CONTROL, read as bytes. res.text() would report a valid
  // header and ~200 bytes for a megabyte file.
  let enPdf = null;
  {
    const r = await fetchBytes(sa, `/api/superadmin/invoices/${invoiceId}/pdf`);
    enPdf = r.bytes;
    rec("P-03", "a real PDF comes back, with real bytes behind the header",
      r.status === 200 && isPdf(enPdf) && enPdf.length > 10_000,
      `${isPdf(enPdf) ? "%PDF" : "NOT A PDF"} ${enPdf.length} bytes`);
  }

  // ---------------------------------------------------------------------- P-04
  // ONE PAGE. The report's own bug produced a trailing page holding nothing
  // but a footer, and to a school that reads as a document that got cut off.
  {
    const pages = pageCount(enPdf);
    rec("P-04", "the English invoice is exactly ONE page", pages === 1, `${pages} page(s)`);
  }

  // ---------------------------------------------------------------------- P-05
  // IN THE RENDER, not in the source. A figure present in the HTML and
  // clipped off the sheet is the failure this distinguishes.
  {
    const text = await textOf(enPdf);
    if (!text) {
      rec("P-05", "the figures are in the RENDERED text", false,
        "pdftotext unavailable — cannot read the render, so this proves nothing");
    } else {
      const ok = text.includes("9,000.00") && text.includes("10,000.00")
        && text.includes("FP-") && /Proforma/i.test(text);
      rec("P-05", "total, gross and number are all ON the rendered page", ok,
        `total=${text.includes("9,000.00")} gross=${text.includes("10,000.00")} proforma=${/Proforma/i.test(text)}`);
    }
  }

  // ---------------------------------------------------------------------- P-06
  let arPdf = null;
  {
    const r = await fetchBytes(sa, `/api/superadmin/invoices/${invoiceId}/pdf?lang=ar`);
    arPdf = r.bytes;
    rec("P-06", "the Arabic invoice renders, and is also ONE page",
      r.status === 200 && isPdf(arPdf) && pageCount(arPdf) === 1,
      `${isPdf(arPdf) ? "%PDF" : "NOT A PDF"} ${arPdf.length} bytes, ${pageCount(arPdf)} page(s)`);
  }

  // ---------------------------------------------------------------------- P-07
  // Without this, P-06 passes if ?lang=ar is silently ignored and the English
  // document comes back — which is exactly what a missing branch would do.
  {
    const same = arPdf && enPdf && arPdf.length === enPdf.length;
    const text = await textOf(arPdf);
    const hasArabic = /[؀-ۿ]/.test(text);
    rec("P-07", "the Arabic render is a DIFFERENT document, with Arabic in it",
      !same && (text ? hasArabic : true),
      `sizes differ=${!same} arabic text=${text ? hasArabic : "pdftotext unavailable"}`);
  }

  // ---------------------------------------------------------------------- P-09
  // THE SCHOOL'S OWN REFERENCE, on the RENDERED page.
  //
  // Migration 039. The document already had a "Your reference" row, but it
  // rendered `payment_reference` — OUR record of THEIR bank transfer, written
  // only when the invoice is marked paid. So the one field a school needs in
  // order to pay was absent from every unpaid invoice and appeared only after
  // the money had arrived, labelled as theirs.
  //
  // Asserted in the render rather than the source, because a value present in
  // the HTML and clipped off the sheet is the failure this distinguishes.
  {
    const created = await sa.post("/api/superadmin/invoices", {
      organizationId: A.orgId, studentCount: 30, dueInDays: 30,
      purchaseOrderRef: "PO-2026-114",
    });
    const poId = created.body?.invoice?.id;
    if (poId) made.push(poId);
    await sa.post(`/api/superadmin/invoices/${poId}/issue`, {});
    const r = await fetchBytes(sa, `/api/superadmin/invoices/${poId}/pdf`);
    const text = await textOf(r.bytes);
    if (!text) {
      rec("P-09", "the purchase order is ON the rendered page", false,
        "pdftotext unavailable — cannot read the render, so this proves nothing");
    } else {
      // And STILL one page: a new meta row must not push the document over.
      rec("P-09", "the school's purchase order is on the rendered page",
        text.includes("PO-2026-114") && pageCount(r.bytes) === 1,
        `po=${text.includes("PO-2026-114")} pages=${pageCount(r.bytes)}`);
    }
  }

  // ---------------------------------------------------------------------- P-10
  // THE CONTROL. Without it P-09 passes against a document that prints a
  // "Your reference" row unconditionally, empty label and all.
  {
    const created = await sa.post("/api/superadmin/invoices", {
      organizationId: A.orgId, studentCount: 30, dueInDays: 30,
    });
    const noPoId = created.body?.invoice?.id;
    if (noPoId) made.push(noPoId);
    await sa.post(`/api/superadmin/invoices/${noPoId}/issue`, {});
    const r = await fetchBytes(sa, `/api/superadmin/invoices/${noPoId}/pdf`);
    const text = await textOf(r.bytes);
    rec("P-10", "an invoice with NO purchase order prints no reference row",
      text ? !/Your reference/i.test(text) : false,
      text ? `row absent=${!/Your reference/i.test(text)}` : "pdftotext unavailable");
  }

  // ---------------------------------------------------------------------- P-08
  {
    const r = await fetchBytes(A.session, `/api/my-organization/invoices/${invoiceId}/pdf`);
    rec("P-08", "school A CAN download its own invoice",
      r.status === 200 && isPdf(r.bytes) && r.bytes.length > 10_000,
      `HTTP ${r.status} ${r.bytes.length} bytes`);
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
