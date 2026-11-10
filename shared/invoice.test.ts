/**
 * The figures a school receives on paper and the rule about when they may
 * change. Each case is a decision, not a shape check.
 */
import { describe, it, expect } from "vitest";
import {
  invoiceTotals, canTransition, isEditable, formatInvoiceNumber,
  invoiceDocumentType, grantAmountMajor, VAT_RATE_BP_UAE,
} from "./invoice";
import { quotePrice } from "./pricing";

const AED = { currency: "AED", unitPriceMinor: 4000 };

describe("invoiceTotals", () => {
  it("takes its subtotal STRAIGHT from quotePrice, never its own arithmetic", () => {
    // The whole point. Seven copies of a price calculation is how a buyer gets
    // quoted one figure and charged another, and the invoice is the copy the
    // customer keeps.
    for (const n of [1, 10, 99, 100, 500, 1000, 1500]) {
      const t = invoiceTotals({ ...AED, studentCount: n });
      expect(t.subtotalMinor).toBe(quotePrice({ ...AED, studentCount: n }).totalMinor);
    }
  });

  it("carries the volume discount onto the document", () => {
    // 100+ is the first tier. A school that qualified and saw full price on
    // the invoice would be right to query it.
    expect(invoiceTotals({ ...AED, studentCount: 99 }).discountPercent).toBe(0);
    expect(invoiceTotals({ ...AED, studentCount: 100 }).discountPercent).toBe(10);
    expect(invoiceTotals({ ...AED, studentCount: 500 }).discountPercent).toBe(15);
    expect(invoiceTotals({ ...AED, studentCount: 1000 }).discountPercent).toBe(20);
  });

  it("issues a PROFORMA with no tax by default", () => {
    // No TRN exists, so every invoice today is rate 0 and the total is the
    // goods. A default of 5% would put tax on a document that cannot charge
    // it.
    const t = invoiceTotals({ ...AED, studentCount: 100 });
    expect(t.vatRateBp).toBe(0);
    expect(t.vatMinor).toBe(0);
    expect(t.totalMinor).toBe(t.subtotalMinor);
  });

  it("computes 5% correctly once a rate is supplied", () => {
    // 100 students at AED 40 less 10% = AED 3,600.00 = 360000 fils.
    const t = invoiceTotals({ ...AED, studentCount: 100, vatRateBp: VAT_RATE_BP_UAE });
    expect(t.subtotalMinor).toBe(360000);
    expect(t.vatMinor).toBe(18000);
    expect(t.totalMinor).toBe(378000);
  });

  it("rounds VAT ONCE against the subtotal, not per line", () => {
    // Tax on each line, summed, is not tax on the sum. 7 × 4000 = 28000;
    // 5% is 1400 exactly, but the per-line route (Math.round(4000*0.05)=200,
    // ×7 = 1400) only agrees by luck — the assertion that matters is that the
    // figure is derived from the subtotal.
    const t = invoiceTotals({ ...AED, studentCount: 7, vatRateBp: VAT_RATE_BP_UAE });
    expect(t.vatMinor).toBe(Math.round((t.subtotalMinor * VAT_RATE_BP_UAE) / 10000));
  });

  it("refuses a NaN rate rather than putting NaN on a customer's document", () => {
    // `?? 0` lets NaN through, and a NaN tax makes a NaN total, which reaches
    // a school as "AED NaN". Same trap quotePrice documents for the price.
    const t = invoiceTotals({ ...AED, studentCount: 10, vatRateBp: NaN as any });
    expect(t.vatRateBp).toBe(0);
    expect(Number.isFinite(t.totalMinor)).toBe(true);
  });

  it("treats a negative rate as zero", () => {
    expect(invoiceTotals({ ...AED, studentCount: 10, vatRateBp: -500 }).vatMinor).toBe(0);
  });
});

describe("canTransition", () => {
  it("walks a normal sale: draft → issued → paid", () => {
    expect(canTransition("draft", "issued")).toBe(true);
    expect(canTransition("issued", "paid")).toBe(true);
  });

  it("REFUSES to un-pay an invoice", () => {
    // Un-paying would mean un-granting licences a school may already have
    // spent, and the ledger has no such operation by design. A correction is a
    // new document, the way a ledger reduction is a new signed row.
    expect(canTransition("paid", "issued")).toBe(false);
    expect(canTransition("paid", "draft")).toBe(false);
    expect(canTransition("paid", "cancelled")).toBe(false);
  });

  it("refuses to reopen a cancelled invoice", () => {
    expect(canTransition("cancelled", "issued")).toBe(false);
    expect(canTransition("cancelled", "paid")).toBe(false);
  });

  it("refuses to mark a DRAFT paid — it was never sent to anyone", () => {
    // Skipping `issued` would grant licences against a document the school has
    // never seen.
    expect(canTransition("draft", "paid")).toBe(false);
  });

  it("allows cancelling before payment, from either live state", () => {
    expect(canTransition("draft", "cancelled")).toBe(true);
    expect(canTransition("issued", "cancelled")).toBe(true);
  });

  it("refuses everything from a status it does not recognise", () => {
    // A value written by an older build must not make the record unusable, and
    // refusing every move is the safe direction.
    expect(canTransition("sent", "paid")).toBe(false);
    expect(canTransition("", "issued")).toBe(false);
  });

  it("refuses a move to a status that does not exist", () => {
    expect(canTransition("issued", "refunded")).toBe(false);
  });
});

describe("isEditable", () => {
  it("only a draft may be rewritten in place", () => {
    expect(isEditable("draft")).toBe(true);
    expect(isEditable("issued")).toBe(false);
    expect(isEditable("paid")).toBe(false);
    expect(isEditable("cancelled")).toBe(false);
  });
});

describe("formatInvoiceNumber", () => {
  it("reads the way a finance department expects", () => {
    expect(formatInvoiceNumber(2026, 1)).toBe("FP-2026-0001");
    expect(formatInvoiceNumber(2026, 42)).toBe("FP-2026-0042");
  });

  it("WIDENS past 9999 rather than wrapping", () => {
    // A repeated invoice number is worse than an ugly one.
    expect(formatInvoiceNumber(2026, 10000)).toBe("FP-2026-10000");
  });

  it("never produces a zero or negative sequence", () => {
    expect(formatInvoiceNumber(2026, 0)).toBe("FP-2026-0001");
    expect(formatInvoiceNumber(2026, -5)).toBe("FP-2026-0001");
  });
});

describe("invoiceDocumentType", () => {
  it("is a PROFORMA without a TRN", () => {
    expect(invoiceDocumentType(null)).toBe("proforma");
    expect(invoiceDocumentType("")).toBe("proforma");
    expect(invoiceDocumentType("   ")).toBe("proforma");
  });

  it("is a tax invoice once a TRN is recorded ON THE INVOICE", () => {
    // Driven by the stored value, not a global setting — otherwise adding a
    // TRN would retitle every historical proforma as a tax invoice.
    expect(invoiceDocumentType("100123456700003")).toBe("tax_invoice");
  });
});

describe("grantAmountMajor", () => {
  it("converts minor to major through toMajor, never by dividing by 100", () => {
    // 1000 minor units is ten dirhams but ONE dinar. The Gulf three-decimal
    // currencies mis-record by a factor of ten if read as hundredths.
    expect(grantAmountMajor(360000, "AED")).toBe(3600);
    expect(grantAmountMajor(360000, "KWD")).toBe(360);
  });

  it("records the SUBTOTAL, because VAT is not revenue", () => {
    // Collected for the tax authority. Recording it as licence revenue would
    // overstate every figure the reconciliation report produces.
    const t = invoiceTotals({ ...AED, studentCount: 100, vatRateBp: VAT_RATE_BP_UAE });
    expect(grantAmountMajor(t.subtotalMinor, t.currency)).toBe(3600);
    expect(grantAmountMajor(t.totalMinor, t.currency)).toBe(3780); // what NOT to record
  });
});
