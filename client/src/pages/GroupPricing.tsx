import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { paymentsAreLive } from "@shared/paymentsLive";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Users, ArrowLeft, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";
import { quotePrice, formatMoney } from "@shared/pricing";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PricingCountry { id: string; name: string; nameAr: string | null; currency: string | null }

interface ServerQuote {
  countryId: string | null;
  currency: string;
  unitPriceMinor: number;
  perStudentMinor: number;
  totalMinor: number;
  discountPercent: number;
  studentCount: number;
  usesFallbackPrice: boolean;
}

const SUPPORT_EMAIL = "support@futurepath.ae";

/** Read once at module load: the key cannot change without a redeploy. */
const paymentsLive = paymentsAreLive(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

export default function GroupPricing() {
  // i18n for the locale, so money is grouped the reader's way.
  const { t, i18n } = useTranslation("pricing");
  const isAr = i18n.language?.startsWith("ar");
  useEffect(() => { document.title = `${t("groupPricing.pageTitle")} | ${t("appName")}`; }, [t]);

  const [, setLocation] = useLocation();

  /**
   * BACK TO WHEREVER THEY CAME FROM, not to a fixed page.
   *
   * This used to go to /tier-selection unconditionally — a chooser between
   * individual and group plans, written for individuals. A school arriving
   * from the home page's "For schools" link has never seen that page, so
   * offering to go "back" to it sends them somewhere new and irrelevant.
   *
   * history.length > 1 is the test for "there is something to go back to":
   * on a tab opened straight onto this URL there is not, and the old
   * destination is then the only sensible one.
   */
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) window.history.back();
    else setLocation("/tier-selection");
  };
  const [studentCount, setStudentCount] = useState<number>(100);
  const [countryId, setCountryId] = useState<string>("");

  /**
   * The countries a buyer can pick, and the price for the one they picked.
   *
   * THE QUOTE COMES FROM THE SERVER, not from a calculation here. The tiers
   * used to be written out in this file by hand AND again in
   * payment.routes.ts; they agreed, which is worse than disagreeing, because
   * nothing compares them at runtime. Now the figure on this page is the
   * figure the card will be charged, because it is the same function reading
   * the same country row.
   */
  const { data: countryData } = useQuery<{ countries: PricingCountry[] }>({
    queryKey: ["/api/pricing/countries"],
  });
  const countries = countryData?.countries ?? [];

  /**
   * Preselect when there is exactly one country to sell in, which is the
   * situation today. With several, the buyer must choose: guessing their
   * country would quote a price in money they do not use.
   */
  useEffect(() => {
    if (!countryId && countries.length === 1) setCountryId(countries[0].id);
  }, [countries, countryId]);

  /**
   * Debounced, because the count is a number input and every keystroke would
   * otherwise be a request. 300ms is below the point where the figure feels
   * detached from the typing.
   */
  const [debouncedCount, setDebouncedCount] = useState(studentCount);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedCount(studentCount), 300);
    return () => clearTimeout(id);
  }, [studentCount]);

  const { data: quote, isFetching: quoteLoading } = useQuery<ServerQuote>({
    queryKey: ["/api/pricing/quote", { students: debouncedCount, countryId }],
    queryFn: async () => {
      const qs = new URLSearchParams({ students: String(debouncedCount) });
      if (countryId) qs.set("countryId", countryId);
      const r = await fetch(`/api/pricing/quote?${qs}`);
      if (!r.ok) throw new Error("quote failed");
      return r.json();
    },
  });

  /**
   * A LOCAL QUOTE ONLY UNTIL THE SERVER'S ARRIVES, so the card is never blank
   * on first paint. It is replaced the moment the real one lands and is never
   * what the buyer is sent to checkout with — `continueToCheckout` is disabled
   * until the server has answered.
   */
  const pricing = quote ?? { ...quotePrice({ studentCount }), usesFallbackPrice: false };

  /**
   * WITH A CHOICE TO MAKE, NO PRICE UNTIL IT IS MADE.
   *
   * Quoting the USD fallback to a visitor who has not picked yet shows a UAE
   * school a dollar price — the exact thing charging locally is meant to
   * stop — and it changes under them once they choose. Better to ask first
   * than to show a number that is about to be wrong.
   */
  const mustChooseCountry = countries.length > 1 && !countryId;
  const canContinue = !!quote && !quoteLoading && !mustChooseCountry;

  return (
    <PageLayout variant="gradient">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {t("groupPricing.heading")}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            {t("groupPricing.subheading")}
          </p>
        </div>

        <Card className="max-w-2xl mx-auto" data-testid="card-group-pricing">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t("groupPricing.cardTitle")}
            </CardTitle>
            <CardDescription>
              {t("groupPricing.cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="student-count">{t("groupPricing.studentCountLabel")}</Label>
              <Input
                id="student-count"
                type="number"
                min="1"
                value={studentCount}
                onChange={(e) => setStudentCount(Math.max(1, parseInt(e.target.value) || 1))}
                data-testid="input-student-count"
                className="text-lg"
              />
            </div>

            {/* Shown only when there is a choice to make. One country means no
                decision, and an empty dropdown is worse than none. */}
            {countries.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="country">{t("groupPricing.countryLabel")}</Label>
                <Select value={countryId} onValueChange={setCountryId}>
                  <SelectTrigger id="country" data-testid="select-country">
                    <SelectValue placeholder={t("groupPricing.countryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {isAr && c.nameAr ? c.nameAr : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {t("groupPricing.countryHelp")}
                </p>
              </div>
            )}

            <Separator />

            {mustChooseCountry ? (
              <p className="text-sm text-muted-foreground py-6 text-center"
                 data-testid="text-choose-country-first">
                {t("groupPricing.chooseCountryFirst")}
              </p>
            ) : (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.basePrice")}</span>
                {/* The amount is a parameter, not part of the sentence. It was
                    written into the translation as "$10.00 per student", which
                    meant the headline price lived in two locale files and
                    nothing moved it when the real price changed. */}
                <span className="font-semibold" data-testid="text-base-price">
                  {t("groupPricing.basePriceValue", {
                    amount: formatMoney(pricing.unitPriceMinor, pricing.currency, i18n.language),
                  })}
                </span>
              </div>

              {pricing.discountPercent > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.bulkDiscount")}</span>
                  {/* U+2066/U+2069 isolate: "-10%" is nothing but neutral characters, so
                      the bidi algorithm renders it "10%-" inside Arabic text. Same
                      fault and same fix as the invoice screens. */}
                  <span className="text-green-600 font-semibold">
                    {`\u2066-${pricing.discountPercent}%\u2069`}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.pricePerStudent")}</span>
                <span className="font-semibold" data-testid="text-price-per-student">
                  {formatMoney(pricing.perStudentMinor, pricing.currency, i18n.language)}
                </span>
              </div>

              <Separator />

              <div className="flex justify-between text-lg font-bold">
                <span>
                  {t("groupPricing.total", {
                    count: studentCount,
                    unit: studentCount === 1 ? t("groupPricing.student") : t("groupPricing.students"),
                  })}
                </span>
                <span className="text-blue-600" data-testid="text-price-total">
                  {formatMoney(pricing.totalMinor, pricing.currency, i18n.language)}
                </span>
              </div>
            </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
              <div className="text-sm font-semibold mb-2">{t("groupPricing.discountTiersTitle")}</div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.tier1")}</span>
                  <span className="font-semibold text-green-600">{t("groupPricing.discount1")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.tier2")}</span>
                  <span className="font-semibold text-green-600">{t("groupPricing.discount2")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.tier3")}</span>
                  <span className="font-semibold text-green-600">{t("groupPricing.discount3")}</span>
                </div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col sm:flex-row gap-3">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={goBack}
              data-testid="button-back-to-plans"
            >
              <ArrowLeft className="w-4 h-4 me-2" />
              {t("groupPricing.back")}
            </Button>
            {/**
              * WHAT THIS BUTTON OFFERS DEPENDS ON WHETHER A CARD CAN ACTUALLY
              * BE CHARGED.
              *
              * With test keys — which is production today — a real school's
              * real card is declined and a test card takes licences for
              * nothing. Advertising a card form in that state is advertising a
              * rehearsal, so the page offers the way schools genuinely pay
              * instead: an invoice settled by bank transfer.
              *
              * It is the PUBLIC OFFER that changes, not the route. /checkout
              * still works when reached directly, which is how the purchase
              * flow is tested while the keys are test keys. The day live keys
              * are set on Render this flips back with no code change.
              */}
            {paymentsLive ? (
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 flex-1"
                onClick={() => setLocation(`/checkout?students=${studentCount}${countryId ? `&country=${encodeURIComponent(countryId)}` : ""}`)}
                data-testid="button-continue-checkout"
                disabled={!canContinue}
              >
                {t("groupPricing.continue", { amount: formatMoney(pricing.totalMinor, pricing.currency, i18n.language) })}
              </Button>
            ) : (
              <Button
                asChild
                className="w-full bg-blue-600 hover:bg-blue-700 flex-1"
                data-testid="button-request-invoice"
              >
                <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  t("groupPricing.enquirySubject"),
                )}&body=${encodeURIComponent(
                  t("groupPricing.enquiryBody", {
                    students: studentCount,
                    amount: formatMoney(pricing.totalMinor, pricing.currency, i18n.language),
                  }),
                )}`}>
                  <Mail className="w-4 h-4 me-2" />
                  {t("groupPricing.requestInvoice")}
                </a>
              </Button>
            )}
          </CardFooter>
          {!paymentsLive && (
            <div className="px-6 pb-6 -mt-2">
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                {t("groupPricing.howSchoolsPay")}
              </p>
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
