/**
 * THE INVOICE AS A DOCUMENT — one pure function from a row to a complete HTML
 * page, in English or Arabic.
 *
 * PURE, AND THAT IS THE WHOLE POINT. The student report's PDF route launches
 * a headless browser, points it at `/print/results`, and has to mint a
 * short-lived print token so that browser — which carries no session cookie —
 * can authorize the page's own data fetches, then validate the URL against
 * SSRF. All of that exists because the page FETCHES what it renders.
 *
 * An invoice fetches nothing. Every figure is already in hand by the time a
 * PDF is wanted, so the HTML is built here and handed straight to
 * `page.setContent()`. No print token, no URL, no SSRF surface, no client
 * route, and no way for the renderer to be denied by an auth check — three
 * mechanisms that do not need to exist rather than three more to get right.
 *
 * It also means the document is testable without a browser at all: the
 * assertions that matter (the right total, the right title, the school's name
 * escaped) are string checks, and only PAGINATION needs a real render.
 *
 * SUPPLIER DETAILS ARE INPUT, never hardcoded. Address, bank and IBAN are the
 * owner's and are not in this repo; an unset one renders a visible placeholder
 * rather than a blank, because a blank on a sent invoice reads as an oversight
 * and a placeholder reads as "not finished yet".
 *
 * THE TRN IS THE ONE SWITCH. Absent, this is a PROFORMA INVOICE stating
 * plainly that no VAT was charged. Present, it is a TAX INVOICE and the VAT
 * line appears. Nothing else moves, and no already-issued invoice changes —
 * the TRN is stored ON the row, so a document reprints as what it was.
 */

import { formatMoney } from "./pricing";
import { invoiceDocumentType } from "./invoice";

export interface InvoiceDocumentSupplier {
  /** Registered trade name, in the document's language. */
  /** Null until the registered name is set: never defaulted, see invoicePdf.ts. */
  legalName: string | null;
  /** The brand the school recognises. */
  tradingName: string;
  address?: string | null;
  email?: string | null;
  website?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  iban?: string | null;
  swift?: string | null;
  /** Present = a tax invoice. Absent = a proforma. */
  trn?: string | null;
}

export interface InvoiceDocumentData {
  number: string;
  /** The SCHOOL's own purchase-order reference, if they gave one. */
  purchaseOrderRef?: string | null;
  issuedAt?: Date | string | null;
  dueAt?: Date | string | null;
  billToName: string;
  billToEmail?: string | null;
  billToAddress?: string | null;
  studentCount: number;
  unitPriceMinor: number;
  perStudentMinor: number;
  discountPercent: number;
  subtotalMinor: number;
  vatRateBp: number;
  vatMinor: number;
  totalMinor: number;
  currency: string;
  notes?: string | null;
  status: string;
  paymentReference?: string | null;
  /** When the transfer was recorded. Printed on a PAID invoice only. */
  paidAt?: Date | string | null;
}

/**
 * Everything a school supplies reaches this document: its name, its address,
 * and a reference it typed. Escaped without exception — an invoice is emailed
 * and printed, so markup that slipped through would be rendered by whatever
 * opens it.
 */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** A placeholder a reader recognises as unfinished, never a silent blank. */
const orPlaceholder = (v: string | null | undefined, placeholder: string) =>
  v && String(v).trim().length > 0 ? esc(v) : `<span style="color:#a8a29e">${esc(placeholder)}</span>`;

const EN = {
  proforma: "Proforma invoice", tax: "Tax invoice", notTax: "Not a tax invoice",
  billedTo: "Billed to", details: "Details", issueDate: "Issue date",
  due: "Payment due", reference: "Your reference", paymentRef: "Payment received",
  currencyLabel: "Currency",
  description: "Description", qty: "Qty", unit: "Unit", amount: "Amount",
  lineTitle: "Student assessment licences",
  lineBody: "One licence covers one completed career assessment and its report. Licences do not expire and are not tied to a named student.",
  discount: "Volume discount", subtotal: "Subtotal", vat: "VAT",
  vatNone: "Not applicable", totalDue: "Total due", totalPaid: "Total paid", paid: "PAID",
  paidTitle: "Payment received", paidBody: "This invoice has been paid. No payment is due.", paidOn: "Paid on",
  payBy: "Payment by bank transfer", accountName: "Account name",
  bank: "Bank", iban: "IBAN", swift: "SWIFT / BIC",
  quote: "Please quote", asReference: "as the transfer reference. Licences are added to your account once the transfer is received.",
  proformaNote: "This is a proforma invoice. It is a request for payment, not a tax invoice, and no VAT has been charged. No TRN is held. A tax invoice will be issued in place of this document once VAT registration is in effect.",
  questions: "Questions about this invoice:", issuedBy: "Issued by",
  trnLabel: "TRN",
};

const AR = {
  proforma: "فاتورة مبدئية", tax: "فاتورة ضريبية", notTax: "ليست فاتورة ضريبية",
  billedTo: "الفاتورة إلى", details: "التفاصيل", issueDate: "تاريخ الإصدار",
  due: "تاريخ الاستحقاق", reference: "مرجعكم", paymentRef: "مرجع السداد",
  currencyLabel: "العملة",
  description: "البيان", qty: "الكمية", unit: "سعر الوحدة", amount: "المبلغ",
  lineTitle: "تراخيص تقييم الطلبة",
  lineBody: "يغطي الترخيص الواحد تقييماً مهنياً مكتملاً وتقريره. التراخيص لا تنتهي صلاحيتها وليست مرتبطة بطالب بعينه.",
  discount: "خصم الكمية", subtotal: "المجموع الفرعي", vat: "ضريبة القيمة المضافة",
  vatNone: "لا تنطبق", totalDue: "الإجمالي المستحق", totalPaid: "الإجمالي المدفوع", paid: "مدفوعة",
  paidTitle: "تم استلام السداد", paidBody: "تم سداد هذه الفاتورة، ولا يوجد مبلغ مستحق.", paidOn: "تاريخ السداد",
  payBy: "السداد عن طريق التحويل البنكي", accountName: "اسم الحساب",
  bank: "البنك", iban: "رقم الآيبان", swift: "رمز السويفت",
  quote: "يُرجى ذكر", asReference: "كمرجع للتحويل. تُضاف التراخيص إلى حسابكم فور استلام التحويل.",
  proformaNote: "هذه فاتورة مبدئية. وهي طلب سداد وليست فاتورة ضريبية، ولم تُحتسب عليها ضريبة القيمة المضافة، ولا يوجد رقم تسجيل ضريبي. وستصدر فاتورة ضريبية بدلاً من هذه الوثيقة فور سريان التسجيل.",
  questions: "للاستفسار عن هذه الفاتورة:", issuedBy: "صادرة عن",
  trnLabel: "الرقم الضريبي",
};

/**
 * Dates are formatted with the Gregorian calendar and LATIN digits in both
 * languages. An Arabic invoice reading ٢٠٢٦ is correct prose and wrong on a
 * document somebody retypes into a banking form — the same reasoning that
 * keeps grade VALUES in Latin digits where they are matched against the
 * question bank.
 */
function fmtDate(value: Date | string | null | undefined, lang: string): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(lang === "ar" ? "ar-AE-u-ca-gregory-nu-latn" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

export function buildInvoiceDocument(args: {
  invoice: InvoiceDocumentData;
  supplier: InvoiceDocumentSupplier;
  language?: string;
}): string {
  const lang = args.language === "ar" ? "ar" : "en";
  const t = lang === "ar" ? AR : EN;
  const rtl = lang === "ar";
  const dir = rtl ? "rtl" : "ltr";
  const inv = args.invoice;
  const sup = args.supplier;

  const isTax = invoiceDocumentType(sup.trn) === "tax_invoice";

  /**
   * A PAID invoice asks for nothing. Until 2026-11-14 it still printed "Total
   * due" and the whole bank-transfer panel beside its PAID badge, so a finance
   * officer sent a copy for their records was being asked to pay it again.
   */
  const isPaid = inv.status === "paid";
  const money = (minor: number) => formatMoney(minor, inv.currency, lang);
  const discounted = inv.discountPercent > 0;
  // The gross line, before the discount row subtracts from it.
  const grossMinor = inv.unitPriceMinor * inv.studentCount;

  const fontStack = rtl
    ? `"IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui, sans-serif`
    : `Inter, system-ui, -apple-system, sans-serif`;
  const fontHref = rtl
    ? "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap"
    : "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";

  // `text-align: start` already resolves correctly inside a dir="rtl" root, so
  // there is no blanket RTL alignment rule here. One of those silently
  // un-centred every heading in the Arabic report PDF (CLAUDE.md).
  const endAlign = rtl ? "left" : "right";

  const row = (label: string, value: string) =>
    `<tr><td style="padding:2px 0;color:#57534e">${label}</td>` +
    `<td style="padding:2px 0;text-align:${endAlign}">${value}</td></tr>`;

  const payRow = (label: string, value: string) =>
    `<div style="display:flex;justify-content:space-between;gap:12px">` +
    `<span style="color:#57534e">${label}</span>` +
    `<span style="text-align:${endAlign}" dir="ltr">${value}</span></div>`;

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<title>${esc(inv.number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${fontHref}">
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { font-family: ${fontStack}; color: #1c1917; background: #fff;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { border-collapse: collapse; }
  .sheet { width: 210mm; min-height: 297mm; box-sizing: border-box; padding: 16mm 15mm 12mm;
           display: flex; flex-direction: column; }
  .lbl { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; color: #78716c; }
  .num { font-variant-numeric: tabular-nums; }
</style>
</head>
<body>
<div class="sheet">

  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:28px;padding-bottom:18px;border-bottom:2px solid #1c1917">
    <div>
      <div style="font-size:21px;font-weight:700;margin-bottom:6px">${esc(sup.tradingName)}</div>
      <div style="font-size:9.5px;line-height:1.6;color:#57534e;max-width:330px">${orPlaceholder(sup.legalName, lang === "ar" ? "[الاسم القانوني المسجَّل]" : "[REGISTERED LEGAL NAME]")}</div>
      <div style="font-size:9.5px;line-height:1.7;color:#57534e;margin-top:7px">
        ${orPlaceholder(sup.address, lang === "ar" ? "[العنوان المسجَّل]" : "[REGISTERED ADDRESS]")}<br>
        <span dir="ltr">${esc(sup.email ?? "")}${sup.website ? " · " + esc(sup.website) : ""}</span>
      </div>
      ${isTax ? `<div style="font-size:9.5px;color:#57534e;margin-top:6px">${t.trnLabel}: <span dir="ltr">${esc(sup.trn)}</span></div>` : ""}
    </div>
    <div style="text-align:${endAlign};flex-shrink:0">
      <div style="font-size:16px;font-weight:700;text-transform:uppercase">${isTax ? t.tax : t.proforma}</div>
      ${isTax ? "" : `<div style="font-size:10px;color:#57534e;margin-top:3px">${t.notTax}</div>`}
      <div dir="ltr" class="num" style="font-size:19px;font-weight:700;margin-top:12px;text-align:${endAlign}">${esc(inv.number)}</div>
      ${inv.status === "paid" ? `<div style="display:inline-block;margin-top:9px;padding:3px 10px;border-radius:999px;background:#d7eee1;color:#14532d;font-size:11px;font-weight:700">${t.paid}</div>` : ""}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px;padding:20px 0 22px">
    <div>
      <div class="lbl" style="margin-bottom:7px">${t.billedTo}</div>
      <div style="font-size:12.5px;font-weight:600;margin-bottom:4px">${esc(inv.billToName)}</div>
      <div style="font-size:10.5px;line-height:1.7;color:#44403c">
        ${inv.billToAddress ? esc(inv.billToAddress).replace(/\n/g, "<br>") + "<br>" : ""}
        <span dir="ltr">${esc(inv.billToEmail ?? "")}</span>
      </div>
    </div>
    <div>
      <div class="lbl" style="margin-bottom:7px">${t.details}</div>
      <table style="font-size:10.5px;width:100%"><tbody>
        ${row(t.issueDate, `<span class="num">${esc(fmtDate(inv.issuedAt, lang))}</span>`)}
        ${row(t.due, `<span class="num" style="font-weight:600">${esc(fmtDate(inv.dueAt, lang))}</span>`)}
        ${/**
           * TWO REFERENCES, TWO LABELS, because they are two different facts
           * owned by two different parties.
           *
           * `purchaseOrderRef` is the SCHOOL'S — the number their finance
           * system matches this invoice against, supplied before payment and
           * the whole reason a bill gets settled rather than queried.
           *
           * `paymentReference` is OURS — the bank's reference for a transfer
           * we have received, written when the invoice is marked paid. It
           * cannot exist while the invoice is outstanding.
           *
           * Until 2026-11-12 the document rendered `paymentReference` under
           * "Your reference", so the field a school needs in order to pay was
           * absent from every unpaid invoice and appeared only after the money
           * had arrived, labelled as theirs.
           *
           * Both are kept `dir="ltr"`: a PO number is digits and hyphens, and
           * bidi reorders a run of those inside Arabic text.
           */""}
        ${inv.purchaseOrderRef ? row(t.reference, `<span dir="ltr">${esc(inv.purchaseOrderRef)}</span>`) : ""}
        ${inv.paymentReference ? row(t.paymentRef, `<span dir="ltr">${esc(inv.paymentReference)}</span>`) : ""}
        ${row(t.currencyLabel, esc(inv.currency))}
      </tbody></table>
    </div>
  </div>

  <table style="width:100%;font-size:11px">
    <thead><tr>
      <th scope="col" class="lbl" style="text-align:start;padding:8px 0;border-top:1px solid #d6d3d1;border-bottom:1px solid #d6d3d1">${t.description}</th>
      <th scope="col" class="lbl" style="text-align:${endAlign};padding:8px 0;width:62px;border-top:1px solid #d6d3d1;border-bottom:1px solid #d6d3d1">${t.qty}</th>
      <th scope="col" class="lbl" style="text-align:${endAlign};padding:8px 0;width:96px;border-top:1px solid #d6d3d1;border-bottom:1px solid #d6d3d1">${t.unit}</th>
      <th scope="col" class="lbl" style="text-align:${endAlign};padding:8px 0;width:110px;border-top:1px solid #d6d3d1;border-bottom:1px solid #d6d3d1">${t.amount}</th>
    </tr></thead>
    <tbody>
      <tr>
        <td style="padding:13px 0 5px;vertical-align:top">
          <div style="font-weight:600;font-size:11.5px">${t.lineTitle}</div>
          <div style="font-size:10px;color:#57534e;line-height:1.6;margin-top:4px;max-width:360px">${t.lineBody}</div>
        </td>
        <td class="num" style="padding:13px 0 5px;text-align:${endAlign};vertical-align:top">${inv.studentCount}</td>
        <td class="num" style="padding:13px 0 5px;text-align:${endAlign};vertical-align:top">${money(inv.unitPriceMinor)}</td>
        <td class="num" style="padding:13px 0 5px;text-align:${endAlign};vertical-align:top">${money(grossMinor)}</td>
      </tr>
      ${discounted ? `<tr>
        <td style="padding:2px 0 13px;border-bottom:1px solid #e7e5e4">
          <div style="font-size:10.5px;color:#44403c">${t.discount} — ${inv.discountPercent}%</div>
        </td>
        <td class="num" dir="ltr" style="padding:2px 0 13px;text-align:${endAlign};border-bottom:1px solid #e7e5e4;color:#44403c">−${inv.discountPercent}%</td>
        <td class="num" style="padding:2px 0 13px;text-align:${endAlign};border-bottom:1px solid #e7e5e4;color:#44403c">${money(inv.perStudentMinor)}</td>
        <td class="num" dir="ltr" style="padding:2px 0 13px;text-align:${endAlign};border-bottom:1px solid #e7e5e4;color:#44403c">−${money(grossMinor - inv.subtotalMinor)}</td>
      </tr>` : `<tr><td colspan="4" style="border-bottom:1px solid #e7e5e4;padding-bottom:13px"></td></tr>`}
    </tbody>
  </table>

  <div style="display:flex;justify-content:flex-end;margin-top:14px">
    <table style="width:280px;font-size:11px"><tbody>
      ${row(t.subtotal, `<span class="num">${money(inv.subtotalMinor)}</span>`)}
      ${row(t.vat, inv.vatRateBp > 0
        ? `<span class="num">${money(inv.vatMinor)}</span>`
        : `<span>${t.vatNone}</span>`)}
      <tr>
        <td style="padding:11px 0 0;border-top:2px solid #1c1917;font-size:12.5px;font-weight:700">${isPaid ? t.totalPaid : t.totalDue}</td>
        <td class="num" style="padding:11px 0 0;border-top:2px solid #1c1917;text-align:${endAlign};font-size:14px;font-weight:700">${money(inv.totalMinor)}</td>
      </tr>
    </tbody></table>
  </div>

  ${isPaid ? `<div data-block="paid" style="margin-top:26px;border:1px solid #b7dcc6;background:#f1f9f4;border-radius:6px;padding:14px 16px">
    <div class="lbl" style="margin-bottom:7px">${t.paidTitle}</div>
    <p style="margin:0;font-size:10.5px;color:#14532d;line-height:1.6">${t.paidBody}${inv.paidAt ? ` ${t.paidOn} ${fmtDate(inv.paidAt, lang)}.` : ""}</p>
  </div>` : `<div data-block="pay" style="margin-top:26px;border:1px solid #d6d3d1;border-radius:6px;padding:14px 16px">
    <div class="lbl" style="margin-bottom:9px">${t.payBy}</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 28px;font-size:10.5px">
      ${payRow(t.accountName, orPlaceholder(sup.bankAccountName, lang === "ar" ? "[اسم الحساب]" : "[ACCOUNT NAME]"))}
      ${payRow(t.bank, orPlaceholder(sup.bankName, lang === "ar" ? "[اسم البنك]" : "[BANK]"))}
      ${payRow(t.iban, orPlaceholder(sup.iban, "[IBAN]"))}
      ${payRow(t.swift, orPlaceholder(sup.swift, "[SWIFT]"))}
    </div>
    <p style="margin:11px 0 0;font-size:10px;color:#44403c;line-height:1.6">${t.quote} <strong dir="ltr">${esc(inv.number)}</strong> ${t.asReference}</p>
  </div>`}

  ${inv.notes ? `<div style="margin-top:16px;font-size:10px;color:#44403c;line-height:1.6">${esc(inv.notes).replace(/\n/g, "<br>")}</div>` : ""}

  <div style="flex-grow:1"></div>

  <div style="border-top:1px solid #e7e5e4;padding-top:12px">
    ${isTax ? "" : `<p style="margin:0 0 6px;font-size:9.5px;color:#44403c;line-height:1.7">${t.proformaNote}</p>`}
    <p style="margin:0;font-size:9.5px;color:#78716c;line-height:1.7">${t.questions} <span dir="ltr">${esc(sup.email ?? "")}</span> · ${t.issuedBy} ${orPlaceholder(sup.legalName, lang === "ar" ? "[الاسم القانوني المسجَّل]" : "[REGISTERED LEGAL NAME]")}</p>
  </div>

</div>
</body>
</html>`;
}
