import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Users, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function GroupPricing() {
  const { t } = useTranslation("pricing");
  useEffect(() => { document.title = `${t("groupPricing.pageTitle")} | Future Pathways`; }, [t]);

  const [, setLocation] = useLocation();
  const [studentCount, setStudentCount] = useState<number>(100);

  const calculatePrice = (count: number): { total: number; perStudent: number; discount: number } => {
    const basePrice = 10;
    let discount = 0;
    if (count >= 1000) discount = 0.20;
    else if (count >= 500) discount = 0.15;
    else if (count >= 100) discount = 0.10;
    const perStudent = basePrice * (1 - discount);
    const total = perStudent * count;
    return { total, perStudent, discount: discount * 100 };
  };

  const pricing = calculatePrice(studentCount);

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

            <Separator />

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.basePrice")}</span>
                <span className="font-semibold">{t("groupPricing.basePriceValue")}</span>
              </div>

              {pricing.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.bulkDiscount")}</span>
                  <span className="text-green-600 font-semibold">-{pricing.discount}%</span>
                </div>
              )}

              <div className="flex justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">{t("groupPricing.pricePerStudent")}</span>
                <span className="font-semibold">${pricing.perStudent.toFixed(2)}</span>
              </div>

              <Separator />

              <div className="flex justify-between text-lg font-bold">
                <span>
                  {t("groupPricing.total", {
                    count: studentCount,
                    unit: studentCount === 1 ? t("groupPricing.student") : t("groupPricing.students"),
                  })}
                </span>
                <span className="text-blue-600">${pricing.total.toFixed(2)}</span>
              </div>
            </div>

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
              onClick={() => setLocation('/tier-selection')}
              data-testid="button-back-to-plans"
            >
              <ArrowLeft className="w-4 h-4 me-2" />
              {t("groupPricing.back")}
            </Button>
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 flex-1"
              onClick={() => setLocation(`/checkout?students=${studentCount}&total=${pricing.total}`)}
              data-testid="button-continue-checkout"
            >
              {t("groupPricing.continue", { amount: pricing.total.toFixed(2) })}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </PageLayout>
  );
}
