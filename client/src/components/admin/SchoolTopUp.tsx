/**
 * "NEED MORE LICENCES?" — the two doors a school has (owner, 2026-11-14).
 *
 *   Request invoice → a DRAFT invoice at this price, and an email to us. The
 *                     school sees nothing until we issue it.
 *   Pay online      → a card form; the licences are added when it clears.
 *
 * The price is the server's (`/api/my-organization/licences/quote`), from the
 * school's own country, for the top-up quantity alone. Nothing here computes
 * money.
 *
 * TEST MODE IS SAID OUT LOUD. While the publishable key is a test key a real
 * card is declined, so the button carries the words rather than pretending.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient, serverErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { paymentsAreLive } from "@shared/paymentsLive";
import { formatMoney } from "@shared/pricing";
import { CreditCard, Loader2, Send } from "lucide-react";

const PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY as string | undefined;
let stripePromise: Promise<Stripe | null> | null = null;
const getStripe = () => {
  if (!PUBLISHABLE_KEY) return null;
  if (!stripePromise) stripePromise = loadStripe(PUBLISHABLE_KEY);
  return stripePromise;
};

interface Quote {
  licences: number;
  currency: string;
  discountPercent: number;
  totalMinor: number;
  perStudentMinor: number;
  cardPaymentsAvailable: boolean;
}

function refreshNow() {
  queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
  queryClient.invalidateQueries({ queryKey: ["/api/my-organization/invoices"] });
  queryClient.invalidateQueries({ queryKey: ["/api/licenses/me"] });
}

/**
 * Refresh now AND again shortly after. Seen live 2026-11-14: a paid top-up
 * added its licences (50 -> 52) but the tiles still read the old figure
 * until a reload — whichever of the confirm call and the webhook granted, the
 * one refresh could land before the grant did. Two late refetches cost
 * nothing and make the screen right whichever path wins.
 */
function refreshBalances() {
  refreshNow();
  setTimeout(refreshNow, 3000);
  setTimeout(refreshNow, 10000);
}

async function confirmTopUp(paymentIntentId: string) {
  // The webhook may already have added them; this call adds nothing then.
  // A failure is LOGGED, not swallowed: the webhook still grants, but a
  // confirm route that never works is a fault worth seeing.
  try {
    await apiRequest("POST", "/api/my-organization/licences/confirm", { paymentIntentId });
  } catch (e) {
    console.error("[TopUp] confirm failed; relying on the webhook", e);
  }
}

function PayForm({ paymentIntentId, totalLabel, onDone }: { paymentIntentId: string; totalLabel: string; onDone: () => void }) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);

  const pay = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: "if_required",
      });
      if (error) {
        toast({ title: t("billing.topUp.payFailed"), description: error.message, variant: "destructive" });
        return;
      }
      if (paymentIntent?.status === "succeeded") {
        await confirmTopUp(paymentIntentId);
        refreshBalances();
        toast({ title: t("billing.topUp.paidTitle"), description: t("billing.topUp.paidBody") });
        onDone();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PaymentElement />
      <Button className="w-full" onClick={pay} disabled={!stripe || busy} data-testid="button-topup-confirm-pay">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("billing.topUp.payAmount", { amount: totalLabel })}
      </Button>
    </div>
  );
}

export default function SchoolTopUp() {
  const { t, i18n } = useTranslation("admin");
  const { toast } = useToast();
  const [countText, setCountText] = useState("");
  const [po, setPo] = useState("");
  const [debounced, setDebounced] = useState<number | null>(null);
  const [payment, setPayment] = useState<{ clientSecret: string; paymentIntentId: string; totalLabel: string } | null>(null);
  const live = paymentsAreLive(PUBLISHABLE_KEY);
  const locale = i18n.language === "ar" ? "ar" : "en";

  // A card that needs the bank's own check (3-D Secure) leaves this page and
  // comes back to it with ?payment_intent=…&redirect_status=… — the dialog
  // and its success handler are gone by then, so the return is handled here.
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const pi = qs.get("payment_intent");
    const status = qs.get("redirect_status");
    if (!pi || !status) return;
    ["payment_intent", "payment_intent_client_secret", "redirect_status"].forEach((k) => qs.delete(k));
    const rest = qs.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    if (status === "failed") {
      toast({ title: t("billing.topUp.payFailed"), variant: "destructive" });
      return;
    }
    // "processing" is rare for cards: refresh anyway, the webhook grants later.
    confirmTopUp(pi).then(() => {
      refreshBalances();
      if (status === "succeeded") toast({ title: t("billing.topUp.paidTitle"), description: t("billing.topUp.paidBody") });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const count = /^\d+$/.test(countText.trim()) ? Number(countText.trim()) : null;
  useEffect(() => {
    const id = setTimeout(() => setDebounced(count && count >= 1 ? count : null), 300);
    return () => clearTimeout(id);
  }, [count]);

  const quote = useQuery<Quote>({
    queryKey: ["/api/my-organization/licences/quote", debounced],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/my-organization/licences/quote?count=${debounced}`);
      return res.json();
    },
    enabled: debounced != null,
    retry: false,
  });

  const request = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/my-organization/licences/request", { count: debounced, purchaseOrderRef: po.trim() || undefined })).json(),
    onSuccess: () => {
      toast({ title: t("billing.topUp.requestedTitle"), description: t("billing.topUp.requestedBody") });
      setCountText("");
      setPo("");
    },
    onError: (e) => toast({ title: t("billing.topUp.requestFailed"), description: serverErrorMessage(e) ?? undefined, variant: "destructive" }),
  });

  const startPay = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/my-organization/licences/payment-intent", { count: debounced })).json(),
    onSuccess: (d: any) => setPayment({ clientSecret: d.clientSecret, paymentIntentId: d.paymentIntentId, totalLabel: formatMoney(d.totalMinor, d.currency, locale) }),
    onError: (e) => toast({ title: t("billing.topUp.payFailed"), description: serverErrorMessage(e) ?? undefined, variant: "destructive" }),
  });

  const q = quote.data;
  const ready = debounced != null && !!q && !quote.isFetching;
  const quoteError = quote.isError ? serverErrorMessage(quote.error) : null;
  const canCard = !!q?.cardPaymentsAvailable && !!getStripe();

  return (
    <div className="rounded-lg border p-4 space-y-4" data-testid="section-topup">
      <div>
        <p className="font-semibold">{t("billing.topUp.title")}</p>
        <p className="text-sm text-muted-foreground">{t("billing.topUp.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 items-end">
        <div className="space-y-1.5">
          <Label htmlFor="topup-count">{t("billing.topUp.howMany")}</Label>
          <Input id="topup-count" inputMode="numeric" value={countText} onChange={(e) => setCountText(e.target.value)} data-testid="input-topup-count" />
        </div>
        <div className="space-y-1.5">
          <Label>{t("billing.topUp.price")}</Label>
          <p className="h-10 flex items-center font-semibold tabular-nums" data-testid="text-topup-price">
            {quoteError
              ? <span className="text-sm font-normal text-destructive">{quoteError}</span>
              : ready
                ? <>
                    {formatMoney(q!.totalMinor, q!.currency, locale)}
                    <span className="ms-2 text-xs font-normal text-muted-foreground">
                      {q!.discountPercent > 0
                        ? t("billing.topUp.eachWithDiscount", { each: formatMoney(q!.perStudentMinor, q!.currency, locale), percent: `⁦${q!.discountPercent}%⁩` })
                        : t("billing.topUp.each", { each: formatMoney(q!.perStudentMinor, q!.currency, locale) })}
                    </span>
                  </>
                : "—"}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topup-po">{t("billing.topUp.po")}</Label>
          <Input id="topup-po" maxLength={100} value={po} onChange={(e) => setPo(e.target.value)} data-testid="input-topup-po" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {canCard && (
          <Button onClick={() => startPay.mutate()} disabled={!ready || startPay.isPending} data-testid="button-topup-pay">
            <CreditCard className="w-4 h-4 me-2" />
            {live ? t("billing.topUp.payOnline") : t("billing.topUp.payOnlineTest")}
          </Button>
        )}
        <Button variant="outline" onClick={() => request.mutate()} disabled={!ready || request.isPending} data-testid="button-topup-request">
          <Send className="w-4 h-4 me-2" />
          {t("billing.topUp.requestInvoice")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{canCard ? t("billing.topUp.note") : t("billing.topUp.noteInvoiceOnly")}</p>

      <Dialog open={!!payment} onOpenChange={(o) => !o && setPayment(null)}>
        <DialogContent data-testid="dialog-topup-pay">
          <DialogHeader>
            <DialogTitle>{t("billing.topUp.payTitle", { count: debounced ?? 0 })}</DialogTitle>
            <DialogDescription>{live ? payment?.totalLabel : t("billing.topUp.testModeNote")}</DialogDescription>
          </DialogHeader>
          {payment && getStripe() && (
            <Elements stripe={getStripe()} options={{ clientSecret: payment.clientSecret, appearance: { theme: "stripe" }, locale: i18n.language === "ar" ? "ar" : "en" }}>
              <PayForm
                paymentIntentId={payment.paymentIntentId}
                totalLabel={payment.totalLabel}
                onDone={() => { setPayment(null); setCountText(""); setPo(""); }}
              />
            </Elements>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
