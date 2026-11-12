import { buildInvoiceDocument, type InvoiceDocumentSupplier } from "@shared/invoiceDocument";
import type { Invoice } from "@shared/schema";

/**
 * RENDERING AN INVOICE TO PDF, with no URL involved.
 *
 * The student-report route launches a headless browser, points it at
 * `/print/results`, mints a short-lived print token so that browser — which
 * carries no session cookie — can authorize the page's own data fetches, and
 * then validates the URL against SSRF. All of that exists because the page
 * FETCHES what it renders.
 *
 * An invoice fetches nothing. The caller has already read the row and already
 * checked who may see it, so the HTML is built in process and handed to
 * `setContent`. No token, no URL, no SSRF surface, no client route — three
 * mechanisms that do not need to exist rather than three more to get right.
 *
 * `networkidle0` still matters despite that: the document links a Google Font,
 * and rendering before it arrives silently produces a fallback-font PDF that
 * looks fine in English and badly wrong in Arabic. A font that never loads
 * must not hang the request for ever either, hence the timeout — on which the
 * render proceeds with whatever has arrived rather than failing, because a
 * slightly wrong font beats no invoice.
 */

/** Matches the report route's reasoning: honour a pinned binary, never guess one. */
const executablePath = () => process.env.PUPPETEER_EXECUTABLE_PATH;

/**
 * The supplier block, read from the environment rather than hardcoded. These
 * are the owner's registered details and do not belong in a repository; an
 * unset one renders a visible placeholder on the document.
 *
 * `INVOICE_TRN` IS THE ONE SWITCH between a proforma and a tax invoice. Set it
 * only when VAT registration is actually in effect — the document states a
 * legal position, and the environment is what decides which.
 */
const clean = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
};

export function supplierFromEnv(language: string): InvoiceDocumentSupplier {
  const ar = language === "ar";
  return {
    // NO DEFAULT. This used to fall back to a company name written into the
    // source from a DRAFT trade licence -- a name that had not been issued
    // and could change before it is. A document that names a legal entity
    // states who is owed the money; printing one that does not exist yet is
    // worse than printing a placeholder a reader recognises as unfinished.
    legalName: clean(ar ? process.env.INVOICE_LEGAL_NAME_AR : process.env.INVOICE_LEGAL_NAME),
    tradingName: ar ? "مسار المستقبل" : "Future Path",
    address: ar ? (process.env.INVOICE_ADDRESS_AR ?? null) : (process.env.INVOICE_ADDRESS ?? null),
    email: process.env.EMAIL_REPLY_TO || "support@futurepath.ae",
    website: "futurepath.ae",
    bankName: process.env.INVOICE_BANK_NAME ?? null,
    bankAccountName: process.env.INVOICE_BANK_ACCOUNT_NAME ?? null,
    iban: process.env.INVOICE_IBAN ?? null,
    swift: process.env.INVOICE_SWIFT ?? null,
    trn: process.env.INVOICE_TRN ?? null,
  };
}

/** Whether anything on the payment block is still a placeholder. */
export function supplierDetailsMissing(s: InvoiceDocumentSupplier): string[] {
  const missing: string[] = [];
  if (!s.legalName) missing.push("legalName");
  if (!s.address) missing.push("address");
  if (!s.bankAccountName) missing.push("bankAccountName");
  if (!s.bankName) missing.push("bankName");
  if (!s.iban) missing.push("iban");
  if (!s.swift) missing.push("swift");
  return missing;
}

export async function renderInvoicePdf(args: {
  invoice: Invoice;
  language?: string;
}): Promise<Buffer> {
  const language = args.language === "ar" ? "ar" : "en";
  const html = buildInvoiceDocument({
    invoice: args.invoice as any,
    supplier: supplierFromEnv(language),
    language,
  });

  const puppeteer = await import("puppeteer");
  const exe = executablePath();
  let browser: any = null;
  try {
    browser = await puppeteer.default.launch({
      headless: true,
      ...(exe ? { executablePath: exe } : {}),
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();

    // A render error here is otherwise invisible: page.pdf() succeeds on a
    // broken page and returns a plausible-looking file.
    page.on("pageerror", (err: Error) => {
      console.error(`[InvoicePdf] render error for ${args.invoice.number}:`, err.stack || err);
    });

    try {
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 15_000 });
    } catch {
      // The font did not settle. Proceed rather than fail: a fallback-font
      // invoice is worth more than none, and the figures are unaffected.
      console.warn(`[InvoicePdf] webfont did not settle for ${args.invoice.number}; rendering anyway.`);
    }

    /**
     * `printBackground` is required or the PAID pill and the bordered payment
     * panel vanish — Chromium drops backgrounds by default and the result is a
     * document that looks correct until someone looks for the thing that is
     * missing.
     *
     * No margin: the document sets its own A4 page box and 15mm padding, so a
     * puppeteer margin on top of that would shrink the sheet inside the page.
     */
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* a leaked browser is worse than a noisy log */ }
    }
  }
}
