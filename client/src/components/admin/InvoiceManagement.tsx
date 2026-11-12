/**
 * INVOICES — the bank-transfer sales this system would otherwise never see.
 *
 * Stripe knows amounts and customers, not licences, schools or countries, and
 * a school that pays by transfer never touches it at all. Before this screen
 * the only record of such a sale was a superadmin licence grant with an
 * optional amount typed into it, which is the money without the document.
 *
 * MARKING ONE PAID IS THE ONE ACT HERE THAT CHANGES WHAT A SCHOOL HOLDS, and
 * it is irreversible — `paid` is terminal and the grant row it writes is a
 * ledger entry, not an edit. So it asks first, and the dialog states the
 * figure and the licence count rather than "are you sure".
 *
 * THE PRICE IS NOT AN INPUT. It comes from the school's country through
 * shared/pricing.ts, the same calculation the public checkout quotes from. A
 * price typed here could disagree with what a buyer was shown, with nothing
 * comparing them at runtime — the exact state the pricing module exists to
 * prevent. The dialog therefore QUOTES before it creates, so the figure is on
 * screen before anything is written.
 *
 * OUTSTANDING COUNTS ISSUED ONLY. A draft has not been sent to anybody, so
 * counting it would report money as owed that nobody has been asked for. The
 * server computes it and also reports which CURRENCIES are in that set, since
 * adding across currencies is meaningless — if more than one appears the
 * figure is withheld rather than summed.
 *
 * OVERDUE IS DERIVED, NOT STORED. An issued invoice past its due date is
 * overdue; nothing changes in the database when midnight passes, and a status
 * column that had to be swept would be wrong between sweeps.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { formatMoney } from "@shared/pricing";
import { AlertCircle, FileText, Mail, Plus, Send } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface InvoiceRow {
  id: string;
  number: string;
  organizationId: string | null;
  billToName: string;
  billToEmail: string | null;
  studentCount: number;
  perStudentMinor: number;
  discountPercent: number;
  subtotalMinor: number;
  vatMinor: number;
  totalMinor: number;
  currency: string;
  status: "draft" | "issued" | "paid" | "cancelled";
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  emailSentAt: string | null;
  emailSentCount: number;
  /** null = UNKNOWN. Never rendered as "did not arrive". */
  deliveryStatus: string | null;
  deliveryDetail: string | null;
  createdAt: string | null;
}

interface InvoiceList {
  invoices: InvoiceRow[];
  outstandingMinor: number;
  outstandingCurrencies: string[];
}

interface OrgOption {
  id: string;
  name: string;
  countryId: string | null;
  isUnlimitedLicenses?: boolean;
}

const DUE_OPTIONS = [30, 14, 7, 0];

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
  return Number.isFinite(d.getTime()) ? `\u2066${d.toISOString().slice(0, 10)}\u2069` : null;
}

/** Overdue is a derived view of `issued`, never a stored status. */
function isOverdue(row: InvoiceRow): boolean {
  if (row.status !== "issued" || !row.dueAt) return false;
  const due = new Date(row.dueAt);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}


export default function InvoiceManagement() {
  const { t, i18n } = useTranslation("admin");
  const { toast } = useToast();
  const locale = i18n.language === "ar" ? "ar" : "en";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  // Issuing gives the invoice its date and makes it owed; cancelling cannot be
  // reversed. Both fired on one click.
  const [confirmFor, setConfirmFor] = useState<{ row: InvoiceRow; action: "issue" | "cancel" } | null>(null);

  const { data, isLoading } = useQuery<InvoiceList>({
    queryKey: ["/api/superadmin/invoices", statusFilter],
    queryFn: async () => {
      const qs = statusFilter === "all" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const res = await apiRequest("GET", `/api/superadmin/invoices${qs}`);
      return await res.json();
    },
  });

  const { data: orgData } = useQuery<{ organizations: OrgOption[] } | OrgOption[]>({
    queryKey: ["/api/admin/organizations"],
  });
  const orgs: OrgOption[] = Array.isArray(orgData) ? orgData : (orgData?.organizations ?? []);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/superadmin/invoices"] });
    // Marking one paid writes a grant row and moves the school's total, so
    // every figure on the Licences tab and the schools directory moves with it.
    queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/superadmin/licenses/analytics"] });
  };

  const transition = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "issue" | "cancel" }) => {
      const res = await apiRequest("POST", `/api/superadmin/invoices/${id}/${action}`, {});
      return await res.json();
    },
    onSuccess: (_d, vars) => {
      invalidate();
      toast({
        title: vars.action === "issue" ? t("invoices.issuedToast") : t("invoices.cancelledToast"),
      });
    },
    onError: (e) => toast({
      variant: "destructive",
      title: t("invoices.actionFailed"),
      description: serverErrorMessage(e) ?? undefined,
    }),
  });

  const send = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/superadmin/invoices/${id}/send`, {});
      return await res.json() as { to: string };
    },
    onSuccess: (d) => {
      invalidate();
      toast({ title: t("invoices.sentToast"), description: d?.to });
    },
    onError: (e) => toast({
      variant: "destructive",
      // The server's refusals here are specific and actionable — a draft, a
      // missing address, unset supplier bank details — so its message is shown
      // rather than replaced with a generic failure.
      title: t("invoices.sendFailed"),
      description: serverErrorMessage(e) ?? undefined,
    }),
  });

  const markPaid = useMutation({
    mutationFn: async ({ id, ref }: { id: string; ref: string }) => {
      const res = await apiRequest("POST", `/api/superadmin/invoices/${id}/mark-paid`, {
        paymentReference: ref || undefined,
      });
      return await res.json();
    },
    onSuccess: () => {
      invalidate();
      setPayFor(null);
      setPaymentReference("");
      toast({ title: t("invoices.paidToast") });
    },
    onError: (e) => toast({
      variant: "destructive",
      title: t("invoices.actionFailed"),
      description: serverErrorMessage(e) ?? undefined,
    }),
  });

  const rows = data?.invoices ?? [];
  const drafts = rows.filter((r) => r.status === "draft").length;
  const issued = rows.filter((r) => r.status === "issued");
  const overdue = issued.filter(isOverdue).length;
  const paid = rows.filter((r) => r.status === "paid");
  const paidCurrencies = [...new Set(paid.map((p) => p.currency))];

  /** Statuses with their own badge treatment; lightness differs, not only hue. */
  const statusBadge = (row: InvoiceRow) => {
    if (isOverdue(row)) {
      return <Badge variant="destructive" data-testid={`badge-status-${row.id}`}>{t("invoices.statusOverdue")}</Badge>;
    }
    const map: Record<string, { variant: "default" | "secondary" | "outline"; key: string }> = {
      draft: { variant: "outline", key: "invoices.statusDraft" },
      issued: { variant: "default", key: "invoices.statusIssued" },
      paid: { variant: "secondary", key: "invoices.statusPaid" },
      cancelled: { variant: "outline", key: "invoices.statusCancelled" },
    };
    const m = map[row.status] ?? map.draft;
    return <Badge variant={m.variant} data-testid={`badge-status-${row.id}`}>{t(m.key)}</Badge>;
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle>{t("invoices.title")}</CardTitle>
              <CardDescription>{t("invoices.subtitle")}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40" data-testid="select-invoice-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("invoices.filterAll")}</SelectItem>
                  <SelectItem value="draft">{t("invoices.statusDraft")}</SelectItem>
                  <SelectItem value="issued">{t("invoices.statusIssued")}</SelectItem>
                  <SelectItem value="paid">{t("invoices.statusPaid")}</SelectItem>
                  <SelectItem value="cancelled">{t("invoices.statusCancelled")}</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setCreateOpen(true)} data-testid="button-raise-invoice">
                <Plus className="w-4 h-4 me-2" />
                {t("invoices.raise")}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Outstanding is the question this screen exists to answer. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {t("invoices.outstanding")}
              </p>
              {/* Withheld rather than summed across currencies: a dirham total
                  and a dollar total added together is a figure with no meaning. */}
              {(data?.outstandingCurrencies?.length ?? 0) > 1 ? (
                <>
                  <p className="text-2xl font-bold">{t("invoices.mixedCurrencies")}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {data?.outstandingCurrencies?.join(" · ")}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-bold tabular-nums" data-testid="text-outstanding">
                    {formatMoney(
                      data?.outstandingMinor ?? 0,
                      data?.outstandingCurrencies?.[0] ?? "AED",
                      locale,
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("invoices.outstandingNote", { count: issued.length })}
                  </p>
                </>
              )}
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {t("invoices.settled")}
              </p>
              <p className="text-3xl font-bold tabular-nums">
                {paidCurrencies.length > 1
                  ? t("invoices.mixedCurrencies")
                  : formatMoney(
                    paid.reduce((n, p) => n + p.subtotalMinor, 0),
                    paidCurrencies[0] ?? "AED",
                    locale,
                  )}
              </p>
              {/* The subtotal, not the total: VAT is collected on behalf of the
                  authority and is never revenue. It is zero today, and will not
                  be the day a TRN exists. */}
              <p className="text-sm text-muted-foreground mt-1">
                {t("invoices.settledNote", {
                  count: paid.length,
                  licences: paid.reduce((n, p) => n + p.studentCount, 0),
                })}
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {overdue > 0 ? t("invoices.statusOverdue") : t("invoices.statusDraft")}
              </p>
              <p className="text-3xl font-bold tabular-nums">{overdue > 0 ? overdue : drafts}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {overdue > 0 ? t("invoices.overdueNote") : t("invoices.draftNote")}
              </p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("invoices.loading")}</p>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground">{t("invoices.empty")}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("invoices.colNumber")}</TableHead>
                    <TableHead>{t("invoices.colSchool")}</TableHead>
                    <TableHead className="text-end">{t("invoices.colLicences")}</TableHead>
                    <TableHead className="text-end">{t("invoices.colTotal")}</TableHead>
                    <TableHead>{t("invoices.colStatus")}</TableHead>
                    <TableHead>{t("invoices.colEmail")}</TableHead>
                    <TableHead className="text-end">{t("invoices.colActions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id} data-testid={`row-invoice-${row.id}`}>
                      <TableCell className="align-top">
                        {/* nowrap: this is the identifier a finance department quotes back,
                            and "FP-2026-\n0004" is not that identifier. */}
                        <div className="font-semibold tabular-nums whitespace-nowrap">{row.number}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {row.status === "paid" && row.paidAt
                            ? t("invoices.datePaid", { date: dateOnly(row.paidAt) })
                            : row.issuedAt
                              ? t("invoices.dateIssued", { date: dateOnly(row.issuedAt) })
                              : t("invoices.dateCreated", { date: dateOnly(row.createdAt) })}
                        </div>
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="font-medium">{row.billToName}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {row.billToEmail ?? t("invoices.noBillingContact")}
                        </div>
                      </TableCell>

                      <TableCell className="align-top text-end tabular-nums">
                        <div>{row.studentCount}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {formatMoney(row.perStudentMinor, row.currency, locale)}
                          {row.discountPercent > 0 ? ` · \u2066−${row.discountPercent}%\u2069` : ""}
                        </div>
                      </TableCell>

                      <TableCell className="align-top text-end font-semibold tabular-nums">
                        {formatMoney(row.totalMinor, row.currency, locale)}
                      </TableCell>

                      <TableCell className="align-top">
                        {statusBadge(row)}
                        <div className="text-xs text-muted-foreground mt-2">
                          {row.status === "paid"
                            ? (row.paymentReference
                              ? t("invoices.paidRef", { ref: `\u2066${row.paymentReference}\u2069` })
                              : t("invoices.paidNoRef"))
                            : row.status === "issued" && row.dueAt
                              ? t("invoices.due", { date: dateOnly(row.dueAt) })
                              : row.status === "draft"
                                ? t("invoices.draftHint")
                                : ""}
                        </div>
                      </TableCell>

                      {/* THREE STATES, NOT TWO. A null delivery status means
                          nobody has told us anything — an unregistered webhook,
                          an unset secret and Resend being down all look like
                          this — so it is never rendered as a failure. */}
                      <TableCell className="align-top text-xs">
                        {!row.emailSentAt ? (
                          <span className="text-muted-foreground">{t("invoices.emailNever")}</span>
                        ) : row.deliveryStatus === "bounced" || row.deliveryStatus === "complained" ? (
                          <span className="text-destructive font-medium inline-flex items-start gap-1">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>
                              {t("invoices.emailUndeliverable")}
                              {row.deliveryDetail ? <><br />{row.deliveryDetail}</> : null}
                            </span>
                          </span>
                        ) : row.deliveryStatus === "delivered" ? (
                          <span>{t("invoices.emailDelivered", { date: dateOnly(row.emailSentAt) })}</span>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("invoices.emailSentUnknown", { date: dateOnly(row.emailSentAt) })}
                          </span>
                        )}
                        {row.emailSentCount > 1 && (
                          <div className="text-muted-foreground mt-1">
                            {t("invoices.emailCount", { count: row.emailSentCount })}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="align-top">
                        <div className="flex flex-col items-end gap-1.5">
                          {row.status === "draft" && (
                            <Button
                              size="sm"
                              onClick={() => setConfirmFor({ row, action: "issue" })}
                              disabled={transition.isPending}
                              data-testid={`button-issue-${row.id}`}
                            >
                              {t("invoices.issue")}
                            </Button>
                          )}
                          {row.status === "issued" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => { setPayFor(row); setPaymentReference(""); }}
                                data-testid={`button-mark-paid-${row.id}`}
                              >
                                {t("invoices.markPaid")}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => send.mutate(row.id)}
                                disabled={send.isPending}
                                data-testid={`button-send-${row.id}`}
                              >
                                {send.isPending && send.variables === row.id
                                  ? t("invoices.sending")
                                  : row.emailSentAt
                                  ? <><Send className="w-3.5 h-3.5 me-1.5" />{t("invoices.resend")}</>
                                  : <><Mail className="w-3.5 h-3.5 me-1.5" />{t("invoices.email")}</>}
                              </Button>
                            </>
                          )}
                          {/* A new tab, not a fetch: the response is a PDF and
                              the browser's own viewer is better than anything
                              rendered here. */}
                          <a
                            href={`/api/superadmin/invoices/${row.id}/pdf${locale === "ar" ? "?lang=ar" : ""}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs underline"
                            data-testid={`link-pdf-${row.id}`}
                          >
                            {t("invoices.viewPdf")}
                          </a>
                          {(row.status === "draft" || row.status === "issued") && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground underline"
                              onClick={() => setConfirmFor({ row, action: "cancel" })}
                              disabled={transition.isPending}
                              data-testid={`button-cancel-${row.id}`}
                            >
                              {t("invoices.cancel")}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <AlertDialog open={!!confirmFor} onOpenChange={(open) => !open && setConfirmFor(null)}>
            <AlertDialogContent data-testid="dialog-confirm-invoice">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {confirmFor?.action === "issue" ? t("invoices.confirmIssueTitle") : t("invoices.confirmCancelTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {confirmFor?.action === "issue"
                    ? t("invoices.confirmIssueBody", { number: confirmFor?.row.number ?? "" })
                    : t("invoices.confirmCancelBody", { number: confirmFor?.row.number ?? "" })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("invoices.back")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { const c = confirmFor; setConfirmFor(null); if (c) transition.mutate({ id: c.row.id, action: c.action }); }}
                  data-testid="button-confirm-invoice"
                >
                  {confirmFor?.action === "issue" ? t("invoices.issue") : t("invoices.cancel")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <RaiseInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        orgs={orgs}
        onCreated={invalidate}
      />

      {/* MARK PAID asks first, and states the consequence rather than asking
          "are you sure". `paid` is terminal and the grant it writes is a ledger
          row — there is no undo, only a compensating adjustment. */}
      <Dialog open={!!payFor} onOpenChange={(o) => { if (!o) setPayFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("invoices.markPaidTitle")}</DialogTitle>
            <DialogDescription>
              {payFor && t("invoices.markPaidBody", {
                number: payFor.number,
                amount: formatMoney(payFor.totalMinor, payFor.currency, locale),
                school: payFor.billToName,
                licences: payFor.studentCount,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="payment-ref">{t("invoices.paymentRefLabel")}</Label>
            <Input
              id="payment-ref"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder={t("invoices.paymentRefPlaceholder")}
              data-testid="input-payment-reference"
            />
            <p className="text-xs text-muted-foreground">{t("invoices.paymentRefHint")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayFor(null)}>
              {t("invoices.back")}
            </Button>
            <Button
              onClick={() => payFor && markPaid.mutate({ id: payFor.id, ref: paymentReference.trim() })}
              disabled={markPaid.isPending}
              data-testid="button-confirm-mark-paid"
            >
              {t("invoices.markPaidConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * RAISING ONE. The figure is QUOTED from the server before anything is
 * written, using the same `/api/pricing/quote` the public checkout uses — so
 * the price on this screen and the price a buyer would be charged come from
 * one calculation, with no second copy to drift.
 *
 * No price field, deliberately: see the file header.
 */
function RaiseInvoiceDialog({ open, onOpenChange, orgs, onCreated }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgs: OrgOption[];
  onCreated: () => void;
}) {
  const { t, i18n } = useTranslation("admin");
  const { toast } = useToast();
  const locale = i18n.language === "ar" ? "ar" : "en";

  const [organizationId, setOrganizationId] = useState("");
  const [studentCount, setStudentCount] = useState("50");
  const [billToEmail, setBillToEmail] = useState("");
  const [purchaseOrderRef, setPurchaseOrderRef] = useState("");
  const [dueInDays, setDueInDays] = useState("30");

  const org = orgs.find((o) => o.id === organizationId) ?? null;
  const count = Number(studentCount);
  const countValid = Number.isInteger(count) && count > 0;

  const { data: quote } = useQuery<{
    perStudentMinor: number; totalMinor: number; currency: string;
    discountPercent: number; usesFallbackPrice?: boolean;
  }>({
    queryKey: ["/api/pricing/quote", org?.countryId, count],
    queryFn: async () => {
      // `students`, not `studentCount` — the quote route's own parameter name.
      // Getting it wrong is silent: the route defaults to 1 and the dialog
      // would quote one licence's price for a 500-licence order.
      const res = await apiRequest(
        "GET",
        `/api/pricing/quote?countryId=${encodeURIComponent(org!.countryId!)}&students=${count}`,
      );
      return await res.json();
    },
    enabled: open && !!org?.countryId && countValid,
  });

  const create = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/superadmin/invoices", {
        organizationId,
        studentCount: count,
        billToEmail: billToEmail.trim() || undefined,
        purchaseOrderRef: purchaseOrderRef.trim() || undefined,
        dueInDays: Number(dueInDays),
      });
      return await res.json();
    },
    onSuccess: (d) => {
      onCreated();
      onOpenChange(false);
      setOrganizationId("");
      setBillToEmail("");
      setPurchaseOrderRef("");
      toast({
        title: t("invoices.createdToast", { number: d?.invoice?.number ?? "" }),
        // Surfaced rather than swallowed: an unpriced country bills in dollars,
        // and that should be visible here and not discovered on a receipt.
        description: d?.usesFallbackPrice ? t("invoices.fallbackPriceWarning") : undefined,
      });
    },
    onError: (e) => toast({
      variant: "destructive",
      title: t("invoices.createFailed"),
      description: serverErrorMessage(e) ?? undefined,
    }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("invoices.raiseTitle")}</DialogTitle>
          <DialogDescription>{t("invoices.raiseBody")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invoice-school">{t("invoices.schoolLabel")}</Label>
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger id="invoice-school" data-testid="select-invoice-school">
                <SelectValue placeholder={t("invoices.schoolPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* An unlimited school's total is a number with no meaning, so
                mark-paid refuses it at the server. Said here instead of after
                the money has been taken. */}
            {org?.isUnlimitedLicenses && (
              <p className="text-xs text-destructive">{t("invoices.unlimitedWarning")}</p>
            )}
            {org && !org.countryId && (
              <p className="text-xs text-destructive">{t("invoices.noCountryWarning")}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-count">{t("invoices.licencesLabel")}</Label>
            <Input
              id="invoice-count"
              type="number"
              min={1}
              value={studentCount}
              onChange={(e) => setStudentCount(e.target.value)}
              className="tabular-nums"
              data-testid="input-invoice-count"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="invoice-email">
              {t("invoices.billToEmailLabel")}
              <span className="font-normal text-muted-foreground"> — {t("invoices.optional")}</span>
            </Label>
            <Input
              id="invoice-email"
              type="email"
              value={billToEmail}
              onChange={(e) => setBillToEmail(e.target.value)}
              placeholder="finance@school.ae"
              data-testid="input-invoice-email"
            />
            <p className="text-xs text-muted-foreground">{t("invoices.billToEmailHint")}</p>
          </div>

          {/* Beside the billing contact, because both are things the SCHOOL
              tells us and both decide whether the invoice can be acted on
              rather than queried. */}
          <div className="space-y-2">
            <Label htmlFor="invoice-po">
              {t("invoices.poLabel")}
              <span className="font-normal text-muted-foreground"> — {t("invoices.optional")}</span>
            </Label>
            <Input
              id="invoice-po"
              value={purchaseOrderRef}
              onChange={(e) => setPurchaseOrderRef(e.target.value)}
              placeholder="PO-2026-114"
              maxLength={100}
              data-testid="input-invoice-po"
            />
            <p className="text-xs text-muted-foreground">{t("invoices.poHint")}</p>
          </div>

          {/* THE QUOTE, read-only. Server-calculated, not reproduced here. */}
          {quote && countValid && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("invoices.quoteRate")}</span>
                <span className="tabular-nums">
                  {formatMoney(quote.perStudentMinor, quote.currency, locale)}
                  {quote.discountPercent > 0 ? ` · \u2066−${quote.discountPercent}%\u2069` : ""}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t font-semibold text-base">
                <span>{t("invoices.quoteTotal")}</span>
                <span className="tabular-nums" data-testid="text-quote-total">
                  {formatMoney(quote.totalMinor, quote.currency, locale)}
                </span>
              </div>
              {quote.usesFallbackPrice && (
                <p className="text-xs text-destructive pt-1">{t("invoices.fallbackPriceWarning")}</p>
              )}
              <p className="text-xs text-muted-foreground pt-1">{t("invoices.quoteHint")}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="invoice-due">{t("invoices.termsLabel")}</Label>
            <Select value={dueInDays} onValueChange={setDueInDays}>
              <SelectTrigger id="invoice-due" data-testid="select-invoice-terms">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DUE_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d === 0 ? t("invoices.dueOnReceipt") : t("invoices.dueDays", { count: d })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("invoices.back")}
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!organizationId || !countValid || create.isPending}
            data-testid="button-create-invoice"
          >
            {t("invoices.saveDraft")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
