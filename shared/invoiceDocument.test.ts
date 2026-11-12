/**
 * The document a school receives. Pure, so everything except pagination is a
 * string assertion — and pagination is asserted against a real render in
 * invoice-pdf.mjs, because the report's own pagination bug was in the CSS
 * reading as correct while a selector matched the wrong sibling.
 */
import { describe, it, expect } from "vitest";
import { buildInvoiceDocument } from "./invoiceDocument";
import { invoiceTotals, VAT_RATE_BP_UAE } from "./invoice";

const supplier = {
  legalName: "Future Path Services for Research and development (S.P.S - L.L.C)",
  tradingName: "Future Path",
  email: "support@futurepath.ae",
};

const base = (over = {}) => {
  const t = invoiceTotals({ studentCount: 250, unitPriceMinor: 4000, currency: "AED" });
  return {
    number: "FP-2026-0003",
    issuedAt: new Date("2026-11-06T09:00:00Z"),
    dueAt: new Date("2026-11-20T09:00:00Z"),
    billToName: "Cedar Hill Academy",
    billToEmail: "accounts@cedarhill.example",
    status: "issued",
    ...t,
    ...over,
  };
};

const doc = (over = {}, sup = {}, language = "en") =>
  buildInvoiceDocument({ invoice: base(over), supplier: { ...supplier, ...sup }, language });

describe("proforma versus tax invoice", () => {
  it("is a PROFORMA with no TRN, and says why in full", () => {
    const html = doc();
    expect(html).toContain("Proforma invoice");
    expect(html).toContain("Not a tax invoice");
    expect(html).toContain("no VAT has been charged");
    expect(html).not.toContain("Tax invoice</div>");
  });

  it("becomes a TAX INVOICE the moment a TRN is present, and drops the disclaimer", () => {
    // The one switch. Everything else about the document is unchanged.
    const html = doc({}, { trn: "100123456700003" });
    expect(html).toContain("Tax invoice");
    expect(html).toContain("TRN: <span dir=\"ltr\">100123456700003");
    expect(html).not.toContain("no VAT has been charged");
    expect(html).not.toContain("Not a tax invoice");
  });

  it("shows 'Not applicable' for VAT at rate 0, not a zero amount", () => {
    // AED 0.00 on a tax line reads as "we charged you nothing", which invites
    // the question. "Not applicable" answers it.
    expect(doc()).toContain("Not applicable");
  });

  it("shows a real VAT amount once a rate is set", () => {
    const t = invoiceTotals({ studentCount: 250, unitPriceMinor: 4000, currency: "AED", vatRateBp: VAT_RATE_BP_UAE });
    const html = buildInvoiceDocument({ invoice: base(t), supplier: { ...supplier, trn: "100123456700003" } });
    expect(html).not.toContain("Not applicable");
    expect(html).toContain("450.00"); // 5% of AED 9,000.00
  });
});

describe("the figures on the page", () => {
  it("prints the gross, the discount and the net so they add up on sight", () => {
    // 250 × AED 40.00 = 10,000.00, less 10% = 9,000.00. A school's finance
    // officer checks this with a calculator; the three numbers have to be there.
    const html = doc();
    expect(html).toContain("10,000.00");
    expect(html).toContain("1,000.00");
    expect(html).toContain("9,000.00");
    expect(html).toContain("10%");
  });

  it("omits the discount row entirely below the first tier", () => {
    // A "−0%" line is noise that invites a query.
    const t = invoiceTotals({ studentCount: 60, unitPriceMinor: 4000, currency: "AED" });
    const html = buildInvoiceDocument({ invoice: base(t), supplier });
    expect(html).not.toContain("Volume discount");
    expect(html).toContain("2,400.00");
  });

  it("marks a settled invoice PAID", () => {
    expect(doc({ status: "paid" })).toContain(">PAID<");
    expect(doc({ status: "issued" })).not.toContain(">PAID<");
  });
});

describe("what a school supplies is escaped", () => {
  it("escapes the school's own name — it is emailed and printed", () => {
    const html = doc({ billToName: 'Cedar <script>alert(1)</script> Academy' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the reference the school typed", () => {
    const html = doc({ paymentReference: '"><img src=x onerror=1>' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&quot;&gt;&lt;img");
  });

  it("turns newlines in an address into line breaks rather than losing them", () => {
    const html = doc({ billToAddress: "PO Box 1234\nAbu Dhabi" });
    expect(html).toContain("PO Box 1234<br>Abu Dhabi");
  });
});

describe("unset supplier details", () => {
  it("renders a VISIBLE placeholder, never a silent blank", () => {
    // A blank on a sent invoice reads as an oversight; a placeholder reads as
    // "not finished yet", which is the honest signal while the licence and the
    // bank account are still pending.
    const html = doc();
    expect(html).toContain("[REGISTERED ADDRESS]");
    expect(html).toContain("[IBAN]");
    expect(html).toContain("[ACCOUNT NAME]");
  });

  it("uses the real values once they are supplied", () => {
    const html = doc({}, { address: "PO Box 9", iban: "AE07 0331 2345 6789 0123 456" });
    expect(html).not.toContain("[REGISTERED ADDRESS]");
    expect(html).not.toContain("[IBAN]");
    expect(html).toContain("AE07 0331 2345 6789 0123 456");
  });
});

describe("Arabic", () => {
  it("sets dir=rtl and lang=ar on the document itself", () => {
    const html = doc({}, {}, "ar");
    expect(html).toContain('<html lang="ar" dir="rtl">');
  });

  it("adds NO blanket RTL text-align rule", () => {
    // `text-align: start` already resolves right inside a dir=rtl root, and a
    // blanket [dir=rtl] rule silently un-centred every heading in the Arabic
    // report PDF. This asserts the trap is not re-entered.
    const html = doc({}, {}, "ar");
    expect(html).not.toMatch(/\[dir=["']?rtl["']?\]/);
  });

  it("translates the proforma statement rather than leaving it English", () => {
    const html = doc({}, {}, "ar");
    expect(html).toContain("فاتورة مبدئية");
    expect(html).toContain("ليست فاتورة ضريبية");
    expect(html).not.toContain("Proforma invoice");
  });

  it("keeps the invoice NUMBER and the IBAN left-to-right", () => {
    // Both get retyped into a banking form. An identifier reordered by
    // bidirectional text is a failed transfer.
    const html = doc({}, { iban: "AE07 0331 2345 6789 0123 456" }, "ar");
    expect(html).toMatch(/dir="ltr"[^>]*>FP-2026-0003/);
    expect(html).toContain('dir="ltr">AE07 0331 2345 6789 0123 456');
  });

  it("keeps the DATE in Latin digits, not Arabic-Indic", () => {
    // Correct Arabic prose, wrong on a document somebody retypes — the same
    // reasoning that keeps grade values in Latin digits.
    const html = doc({}, {}, "ar");
    expect(html).toContain("2026");
    expect(html).not.toMatch(/[٠-٩]/);
  });
});

describe("the supplier's legal name", () => {
  it("renders a visible placeholder when it is not set, in both places it appears", () => {
    const html = buildInvoiceDocument({ invoice: base(), supplier: { ...supplier, legalName: null }, language: "en" });
    expect(html.match(/\[REGISTERED LEGAL NAME\]/g)?.length).toBe(2);
    expect(html).not.toContain("null");
  });
  it("never falls back to a name of its own", () => {
    const html = buildInvoiceDocument({ invoice: base(), supplier: { ...supplier, legalName: null }, language: "ar" });
    expect(html).toContain("[الاسم القانوني المسجَّل]");
    expect(html).not.toMatch(/S\.P\.S|ذ\.م\.م/);
  });
});
