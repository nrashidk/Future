/**
 * WHAT AN INVOICE IS, WHAT IT TOTALS, AND WHEN IT MAY CHANGE.
 *
 * Schools buy by bank transfer against a purchase order, not by card on a web
 * form, and until now that sale existed nowhere: a superadmin typed a licence
 * count and an amount into the grant route and the only record was a ledger
 * row with a note. There was nothing to send the school, nothing to chase, and
 * no way to answer "what is outstanding".
 *
 * TWO RULES SHAPE EVERYTHING HERE.
 *
 * FIRST: AN INVOICE NEVER COMPUTES ITS OWN PRICE. `quotePrice` in
 * shared/pricing.ts is the one price calculation in this codebase, and it is
 * that way because the volume tiers were once written out by hand in two files
 * and the price itself in six more. They agreed, which is the dangerous state:
 * nothing compares them at runtime, so a change to one quotes a buyer one
 * price and charges another with no error anywhere. An invoice that did its
 * own arithmetic would be the seventh copy, and the one the customer keeps.
 *
 * SECOND: A PAID INVOICE IS NEVER EDITED. A wrong figure on a settled invoice
 * is corrected by issuing another document, not by rewriting the first —
 * exactly as `license_grants` records a reduction as a signed row rather than
 * an edit to an earlier one. `canTransition` below is where that is enforced,
 * and it is a pure function so the rule cannot differ between the route that
 * marks one paid and the screen that offers the button.
 *
 * VAT IS BUILT AND DORMANT. Without a trade licence there is no TRN, and a
 * document headed "Tax Invoice" without one is a compliance problem rather
 * than a cosmetic one. So every invoice is a PROFORMA today, `vatRateBp` is 0,
 * and the arithmetic that will be needed is already here and already tested.
 * When a TRN exists, `vatRateBp` becomes 500 and `isTaxInvoice` true; nothing
 * else moves, and no stored invoice changes — the ones issued before the TRN
 * stay what they were, which is the only honest way to do it.
 */

import { quotePrice, toMajor } from "./pricing";

/**
 * draft     — being prepared; may still be changed or deleted outright
 * issued    — sent to the school; the figures are now a statement to a
 *             customer and are frozen
 * paid      — settled, and the licences granted in the same transaction
 * cancelled — withdrawn before payment
 */
export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export const INVOICE_STATUSES: readonly InvoiceStatus[] =
  ["draft", "issued", "paid", "cancelled"] as const;

/**
 * UAE VAT, in BASIS POINTS rather than a percentage or a fraction.
 *
 * 500 = 5%. Basis points because the alternative is a float: 0.05 cannot be
 * represented exactly, and a rate stored as 0.05 and multiplied by a subtotal
 * is the kind of arithmetic that produces a receipt one fil out with no
 * explanation. An integer rate times an integer subtotal, divided once, does
 * not drift.
 *
 * NOT APPLIED TODAY. Invoices are issued at rate 0 until a TRN exists.
 */
export const VAT_RATE_BP_UAE = 500;

export interface InvoiceTotals {
  currency: string;
  studentCount: number;
  /** Per licence before the volume discount. */
  unitPriceMinor: number;
  /** Per licence after it, for display on the line. */
  perStudentMinor: number;
  discountPercent: number;
  /** The goods, after the volume discount and before any tax. */
  subtotalMinor: number;
  vatRateBp: number;
  vatMinor: number;
  totalMinor: number;
}

/**
 * The figures that go on the document.
 *
 * The subtotal comes STRAIGHT from `quotePrice`, which already rounds once at
 * the end from the unrounded per-student figure — rounding per student and
 * multiplying drifts a few fils on a large order, which surfaces as the quote
 * and the invoice disagreeing for no explicable reason.
 *
 * VAT is then rounded ONCE against that subtotal, for the same reason. Tax on
 * each line, summed, is not the same number as tax on the sum.
 */
export function invoiceTotals(params: {
  studentCount: number;
  unitPriceMinor?: number;
  currency?: string;
  /** Basis points. 0 — the default — is a proforma with no tax line. */
  vatRateBp?: number;
}): InvoiceTotals {
  const quote = quotePrice({
    studentCount: params.studentCount,
    unitPriceMinor: params.unitPriceMinor,
    currency: params.currency,
  });

  // Same finiteness discipline as quotePrice: `?? 0` lets NaN through, and a
  // NaN tax makes a NaN total, which reaches a customer as "AED NaN".
  const rawRate = Number(params.vatRateBp);
  const vatRateBp = Number.isFinite(rawRate) ? Math.max(0, Math.round(rawRate)) : 0;

  const subtotalMinor = quote.totalMinor;
  const vatMinor = Math.round((subtotalMinor * vatRateBp) / 10000);

  return {
    currency: quote.currency,
    studentCount: quote.studentCount,
    unitPriceMinor: quote.unitPriceMinor,
    perStudentMinor: quote.perStudentMinor,
    discountPercent: quote.discountPercent,
    subtotalMinor,
    vatRateBp,
    vatMinor,
    totalMinor: subtotalMinor + vatMinor,
  };
}

/**
 * The transitions this document type permits.
 *
 * `paid` and `cancelled` are TERMINAL. Un-paying an invoice would mean
 * un-granting licences a school is already using, and the ledger has no such
 * operation by design — a correction is a new signed row, and the paper
 * equivalent is a credit note. Allowing the transition here would make the
 * screen offer a button the ledger cannot honour.
 *
 * An unknown `from` returns false rather than throwing: a status written by an
 * older build must not make the whole record unusable, and refusing every move
 * is the safe direction.
 */
const ALLOWED: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["issued", "cancelled"],
  issued: ["paid", "cancelled"],
  paid: [],
  cancelled: [],
};

export function canTransition(from: string, to: string): boolean {
  const allowed = ALLOWED[from as InvoiceStatus];
  if (!allowed) return false;
  return allowed.includes(to as InvoiceStatus);
}

/** Whether the figures may still be rewritten in place. Only a draft may. */
export function isEditable(status: string): boolean {
  return status === "draft";
}

/**
 * FP-2026-0001.
 *
 * The year is part of the number rather than only a column, because that is
 * how a finance department reads one and how a sequence restarts cleanly each
 * January without colliding with last year's.
 *
 * FOUR DIGITS, zero-padded, and NOT truncated past 9999: a five-digit sequence
 * widens the number rather than wrapping, because a repeated invoice number is
 * worse than an ugly one.
 */
export function formatInvoiceNumber(year: number, sequence: number, prefix = "FP"): string {
  const seq = Math.max(1, Math.floor(sequence));
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * What the document calls itself. A tax invoice requires a TRN, so this is
 * driven by whether one was recorded ON THE INVOICE — not by a global setting
 * read at display time, which would retitle every historical proforma the day
 * a TRN is added.
 */
export function invoiceDocumentType(supplierTrn?: string | null): "tax_invoice" | "proforma" {
  return supplierTrn && supplierTrn.trim().length > 0 ? "tax_invoice" : "proforma";
}

/**
 * The amount for the licence ledger, in MAJOR units.
 *
 * `license_grants.amount_paid` is a major-unit `real`, and this module works
 * in minor units throughout — so the conversion has to happen exactly once, in
 * one place, through `toMajor`. Never `/ 100`: 1000 minor units is ten dirhams
 * but ONE dinar, and the Gulf three-decimal currencies mis-record by a factor
 * of ten if read as hundredths.
 *
 * The SUBTOTAL, not the total: VAT is collected for the tax authority and is
 * not revenue, so recording it as licence revenue would overstate every figure
 * the reconciliation report produces.
 */
export function grantAmountMajor(subtotalMinor: number, currency: string): number {
  return toMajor(subtotalMinor, currency);
}
