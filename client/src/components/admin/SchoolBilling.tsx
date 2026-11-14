/**
 * WHAT A SCHOOL SEES OF ITS OWN BILLING, and where it buys more licences.
 *
 * The top-up section (`SchoolTopUp`, 2026-11-14) is the in-account purchase
 * this card used to say did not exist: request an invoice, or pay online.
 * The invoice table below it stays read-only.
 *
 * NO DRAFTS. The server filters them out (`SCHOOL_VISIBLE_INVOICE_STATUSES`),
 * because a draft is a figure still being checked and showing one tells a
 * school it owes money nobody has asked it for. The note at the bottom says so
 * rather than leaving the gap to be noticed.
 *
 * NO PAY BUTTON ON AN INVOICE, for the same reason the emailed invoice has none: settlement
 * is a bank transfer and the account details are on the PDF. A
 * call-to-action that cannot take money teaches a reader that our buttons do
 * nothing.
 *
 * NO DELIVERY STATUS EITHER. Whether our mail reached them is our operational
 * problem, not information a school can act on — and a school reading
 * "undeliverable" about its own address would have no way to correct it here.
 */
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@shared/pricing";
import { Download, FileText, Info } from "lucide-react";
import SchoolTopUp from "@/components/admin/SchoolTopUp";

interface SchoolInvoice {
  id: string;
  number: string;
  studentCount: number;
  totalMinor: number;
  currency: string;
  status: "issued" | "paid" | "cancelled";
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
}

/**
 * A DATE THAT SURVIVES ARABIC.
 *
 * The bidirectional algorithm reorders runs of neutral characters inside RTL
 * text, and an ISO date is nothing but digits and hyphens — so "2026-11-10"
 * renders in the Arabic UI as "10-11-2026". That is not a cosmetic nuisance:
 * it is a DIFFERENT DATE to anyone who reads it as day-month-year, on a screen
 * about when money is due. Caught by looking at the rendered page; nothing in
 * the code reads wrong.
 *
 * U+2066/U+2069 (LEFT-TO-RIGHT ISOLATE / POP DIRECTIONAL ISOLATE) fix the run
 * in place. Done here rather than with a wrapper element because these dates
 * are interpolated INTO translated sentences — "Issued {{date}}" — where there
 * is no element to wrap, and splitting the sentence to make one would make it
 * untranslatable.
 */
function dateOnly(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  // Day-first, as every other date in the product is. Built from the ISO
  // (UTC) date so the day does not shift with the viewer's time zone.
  const [year, month, day] = d.toISOString().slice(0, 10).split("-");
  return `\u2066${day}/${month}/${year}\u2069`;
}

/** Overdue is derived from the due date, never stored. */
function isOverdue(row: SchoolInvoice): boolean {
  if (row.status !== "issued" || !row.dueAt) return false;
  const due = new Date(row.dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}


export default function SchoolBilling() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language === "ar" ? "ar" : "en";

  /**
   * `awaitingMinor`, which is the server's own field name — and read with a
   * typeof check rather than `?? 0`.
   *
   * The first version of this file read `outstandingMinor`, the SUPERADMIN
   * route's name for the same idea. The mismatch was invisible in the code and
   * invisible in types: the figure came back undefined, `?? 0` turned it into
   * zero, and the card announced "Awaiting payment AED 0.00" directly above a
   * table listing AED 17,000.00 awaiting payment. Only looking at the rendered
   * page found it.
   *
   * So the fallback is now the honest one: if the figure is absent the tile is
   * not drawn at all. A missing number must not be able to render as a
   * confident zero on a screen about money.
   */
  const { data, isLoading } = useQuery<{
    invoices: SchoolInvoice[];
    awaitingMinor?: number;
    awaitingCurrencies?: string[];
  }>({
    queryKey: ["/api/my-organization/invoices"],
  });

  const rows = data?.invoices ?? [];
  // A school with no invoices still gets the card: it is where it buys more
  // licences. The table and its explanation are drawn only when there are rows.
  const hasRows = rows.length > 0;

  const awaiting = rows.filter((r) => r.status === "issued");
  // The server's list, not one recomputed here: two derivations of the same
  // figure is how a school and the person chasing them come to read different
  // numbers off the same rows.
  const currencies = data?.awaitingCurrencies ?? [];
  const awaitingMinor = typeof data?.awaitingMinor === "number" ? data.awaitingMinor : null;

  const statusBadge = (row: SchoolInvoice) => {
    if (isOverdue(row)) {
      return <Badge variant="destructive">{t("billing.statusOverdue")}</Badge>;
    }
    if (row.status === "paid") return <Badge variant="secondary">{t("billing.statusPaid")}</Badge>;
    if (row.status === "cancelled") return <Badge variant="outline">{t("billing.statusCancelled")}</Badge>;
    return <Badge>{t("billing.statusAwaiting")}</Badge>;
  };

  return (
    <Card data-testid="card-school-billing">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="w-5 h-5" />
          {t("billing.title")}
        </CardTitle>
        <CardDescription>{t("billing.subtitle")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {awaiting.length > 0 && awaitingMinor !== null && (
          <div className="rounded-lg border p-4 max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {t("billing.awaiting")}
            </p>
            <p className="text-3xl font-bold tabular-nums" data-testid="text-school-outstanding">
              {currencies.length > 1
                ? t("billing.mixedCurrencies")
                : formatMoney(awaitingMinor, currencies[0] ?? "AED", locale)}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("billing.awaitingNote", { count: awaiting.length })}
            </p>
          </div>
        )}

        <SchoolTopUp />

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("billing.loading")}</p>
        ) : !hasRows ? null : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("billing.colInvoice")}</TableHead>
                  <TableHead className="text-end">{t("billing.colLicences")}</TableHead>
                  <TableHead className="text-end">{t("billing.colAmount")}</TableHead>
                  <TableHead>{t("billing.colStatus")}</TableHead>
                  <TableHead className="text-end">
                    <span className="sr-only">{t("billing.colDownload")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id} data-testid={`row-school-invoice-${row.id}`}>
                    <TableCell className="align-top">
                      <div className="font-semibold tabular-nums whitespace-nowrap">{row.number}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {row.issuedAt
                          ? t("billing.dateIssued", { date: dateOnly(row.issuedAt) })
                          : ""}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-end tabular-nums">{row.studentCount}</TableCell>
                    <TableCell className="align-top text-end font-semibold tabular-nums">
                      {formatMoney(row.totalMinor, row.currency, locale)}
                    </TableCell>
                    <TableCell className="align-top">
                      {statusBadge(row)}
                      <div className="text-xs text-muted-foreground mt-2">
                        {row.status === "paid"
                          ? t("billing.paidNote", {
                            date: dateOnly(row.paidAt),
                            licences: row.studentCount,
                          })
                          : row.status === "issued" && row.dueAt
                            ? t("billing.due", { date: dateOnly(row.dueAt) })
                            : ""}
                      </div>
                    </TableCell>
                    <TableCell className="align-top text-end">
                      {/* A new tab, not a fetch: the response is a PDF and the
                          browser's own viewer beats anything rendered here. */}
                      <a
                        href={`/api/my-organization/invoices/${row.id}/pdf${locale === "ar" ? "?lang=ar" : ""}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs underline"
                        data-testid={`link-school-pdf-${row.id}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t("billing.pdf")}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {hasRows && <div className="flex gap-2.5 items-start rounded-lg border bg-muted/40 p-4 max-w-2xl">
          <Info className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t("billing.footnote")}
          </p>
        </div>}
      </CardContent>
    </Card>
  );
}
