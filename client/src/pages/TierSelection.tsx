import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, User, Users, BarChart3, TrendingUp, Settings, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { readReturnTo, withReturnTo } from "@/lib/returnTo";
import { quotePrice, formatMoney, VOLUME_TIERS } from "@shared/pricing";

export default function TierSelection() {
  const { t, i18n } = useTranslation("pricing");

  /**
   * The undiscounted list price, for display only. A single licence gets no
   * volume discount, so one student is exactly the headline figure.
   */
  const listPrice = quotePrice({ studentCount: 1 });

  /**
   * The ends of the bulk range, computed from the tiers rather than written
   * out. These were the literal string "$8.00–$9.00" in both locale files —
   * correct only while the price and every tier stayed exactly as they were,
   * and silently wrong the moment either moved.
   */
  const bestBulk = quotePrice({ studentCount: VOLUME_TIERS[0].minStudents });
  const smallestBulk = quotePrice({
    studentCount: VOLUME_TIERS[VOLUME_TIERS.length - 2].minStudents,
  });
  useEffect(() => { document.title = `${t("tierSelection.pageTitle")} | ${t("appName")}`; }, [t]);

  const [, setLocation] = useLocation();
  // This page is reached from six places — the report (twice), Checkout,
  // Profile, GroupPricing and the free-cap notice — so "back" cannot be a
  // fixed destination. It had none at all before, which dead-ended anyone
  // who opened it from their report and changed their mind.
  const [returnTo] = useState(() => readReturnTo(window.location.search));

  // The self-pay route is parent-registers-for-child now
  // (docs/parent-registers-scoping.md): the account, the child's identity
  // and consent all have to exist before Stripe is ever reached, so this
  // points at registration, not at Checkout directly. RegisterParent
  // forwards to /checkout?students=1 itself once the account exists.
  //
  // `next=checkout` tells RegisterParent this visitor pressed a BUY button:
  // since 2026-11-13 registering is free and no longer leads to payment by
  // itself. And a visitor who is ALREADY signed in goes straight to
  // Checkout — sending them to register again ends in "an account with this
  // email already exists", which is where the free-cap screen's Upgrade
  // button led.
  const { isAuthenticated, user } = useAuth();
  const handleIndividualTier = () => {
    // An account that has already paid is NOT sent to the card form: a second
    // card payment by a premium account grants nothing (Profile.tsx).
    if (isAuthenticated && user?.isPremium) {
      setLocation('/profile');
      return;
    }
    if (isAuthenticated) {
      setLocation(withReturnTo('/checkout?students=1&total=10', returnTo));
      return;
    }
    setLocation(withReturnTo('/register/parent?next=checkout', returnTo));
  };

  const handleGroupTier = () => {
    setLocation(withReturnTo('/group-pricing', returnTo));
  };

  return (
    <PageLayout variant="gradient">
      <div className="container mx-auto px-4 py-16">
        <Button variant="ghost" asChild className="mb-6" data-testid="link-back">
          <Link href={returnTo ?? "/"}>
            <ArrowLeft className="w-4 h-4 me-2" />
            {returnTo ? t("tierSelection.backToReport") : t("tierSelection.backHome")}
          </Link>
        </Button>
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
            {t("tierSelection.heading")}
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">
            {t("tierSelection.subheading")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto mb-12">
          {/* Individual Assessment */}
          <Card className="relative border-2 border-purple-500 shadow-lg flex flex-col" data-testid="card-tier-individual">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <User className="w-6 h-6 text-purple-600" />
                <CardTitle className="text-2xl">{t("tierSelection.individual.title")}</CardTitle>
              </div>
              <CardDescription>{t("tierSelection.individual.description")}</CardDescription>
              {/* Formatted from the shared price, not written into the markup.
                  A price typed in JSX becomes a lie the moment the real one
                  changes, and nothing fails when it does. */}
              <div className="text-3xl font-bold mt-4" data-testid="text-tier-individual-price">
                {formatMoney(listPrice.unitPriceMinor, listPrice.currency, i18n.language)}
                <span className="text-sm font-normal text-gray-500">{t("tierSelection.individual.perStudent")}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="space-y-3">
                {(["feature1","feature2","feature3","feature4","feature5","feature6","feature7","feature8"] as const).map((k, i) => (
                  <div key={k} className="flex items-start gap-2">
                    <Check className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                    <span className={i === 1 ? "text-sm font-semibold" : "text-sm"}>
                      {t(`tierSelection.individual.${k}`)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-purple-600 hover:bg-purple-700"
                onClick={handleIndividualTier}
                data-testid="button-select-individual"
              >
                {t("tierSelection.individual.cta", {
                  amount: formatMoney(listPrice.unitPriceMinor, listPrice.currency, i18n.language),
                })}
              </Button>
            </CardFooter>
          </Card>

          {/* Group Assessment */}
          <Card className="relative border-2 border-blue-500 shadow-lg flex flex-col" data-testid="card-tier-group">
            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-6 h-6 text-blue-600" />
                <CardTitle className="text-2xl">{t("tierSelection.group.title")}</CardTitle>
              </div>
              <CardDescription>{t("tierSelection.group.description")}</CardDescription>
              <div className="mt-4">
                <div className="text-3xl font-bold">
                  <span className="text-sm font-normal text-gray-500 line-through" data-testid="text-tier-group-list-price">
                    {formatMoney(listPrice.unitPriceMinor, listPrice.currency, i18n.language)}
                  </span>
                  {" "}
                  {t("tierSelection.group.discountRange", {
                    low: formatMoney(bestBulk.perStudentMinor, bestBulk.currency, i18n.language),
                    high: formatMoney(smallestBulk.perStudentMinor, smallestBulk.currency, i18n.language),
                  })}
                  <span className="text-sm font-normal text-gray-500">{t("tierSelection.group.discountLabel")}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
              <div className="text-sm font-semibold text-blue-600 mb-2">{t("tierSelection.group.everythingPlus")}</div>
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{t("tierSelection.group.feature1")}</span>
                    <span className="ms-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("tierSelection.group.comingSoon")}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{t("tierSelection.group.feature2")}</span>
                    <span className="ms-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("tierSelection.group.comingSoon")}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{t("tierSelection.group.feature3")}</span>
                    <span className="ms-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("tierSelection.group.comingSoon")}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Settings className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm font-semibold">{t("tierSelection.group.feature4")}</span>
                    <span className="ms-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("tierSelection.group.comingSoon")}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm">{t("tierSelection.group.feature5")}</span>
                    <span className="ms-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("tierSelection.group.comingSoon")}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-sm">{t("tierSelection.group.feature6")}</span>
                    <span className="ms-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t("tierSelection.group.comingSoon")}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm">{t("tierSelection.group.feature7")}</span>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={handleGroupTier}
                data-testid="button-select-group"
              >
                {t("tierSelection.group.cta")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
