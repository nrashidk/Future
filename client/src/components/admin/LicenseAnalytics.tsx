/**
 * LICENCE ANALYTICS — paid against consumed, per school and per country.
 *
 * TWO LEDGERS, NO COUNTERS. Grants record what each school was given and what
 * was paid for it; consumptions record every report generated. Neither figure
 * comes from a column that could have drifted.
 *
 * THE CAVEATS ARE RENDERED, NOT HIDDEN BEHIND A TOOLTIP. The server sends them
 * with the numbers because the limits matter as much as the figures: school
 * revenue is not platform revenue while a parent's own pool sits outside the
 * grants ledger, and a licence count backfilled by migration 032 carries no
 * amount on purpose. A reader who cannot see that will present one as the
 * other.
 *
 * RECONCILIATION IS SHOWN FIRST when it has anything to say. A school whose
 * ledger disagrees with its licence total means some code path changed
 * entitlement without recording it, and every figure below is understated by
 * that amount — so it belongs above the numbers it undermines, not in a
 * separate screen nobody opens.
 */
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { AlertCircle, Coins, Infinity as InfinityIcon, TrendingUp, Users } from "lucide-react";

interface SchoolRow {
  organizationId: string;
  name: string;
  countryId: string | null;
  curriculum: string | null;
  isUnlimited: boolean;
  granted: number;
  grantedFree: number;
  /**
   * PER CURRENCY, never one total. A school paying in AED and a school paying
   * in USD cannot be added together, and almost every school has exactly one
   * entry — the shape exists for the case where that is not true.
   */
  revenue: Array<{ currency: string; amount: number }>;
  purchases: number;
  consumed: number;
  consumedPaid: number;
  consumedReward: number;
  remaining: number | null;
}

interface CountryRow {
  countryId: string | null;
  countryName: string | null;
  countryNameAr: string | null;
  schools: number;
  unlimitedSchools: number;
  granted: number;
  grantedFree: number;
  revenue: Array<{ currency: string; amount: number }>;
  purchases: number;
  consumed: number;
  consumedPaid: number;
  consumedReward: number;
  remaining: number;
}

interface Analytics {
  perSchool: SchoolRow[];
  perCountry: CountryRow[];
  platform: {
    schools: number;
    unlimitedSchools: number;
    granted: number;
    grantedFree: number;
    purchases: number;
    schoolConsumed: number;
    schoolConsumedPaid: number;
    schoolConsumedReward: number;
    guardianConsumed: number;
    totalConsumed: number;
    remainingAtCappedSchools: number;
  };
  revenueByCurrency: Array<{ currency: string; amount: number; purchases: number }>;
  guardianPools: { consumed: number; consumedPaid: number; consumedReward: number };
  caveats: string[];
}

interface Reconciliation {
  mismatchCount: number;
  mismatches: Array<{
    organizationId: string;
    name: string;
    countryId: string | null;
    totalLicenses: number;
    ledgerTotal: number;
    difference: number;
  }>;
}

const money = (amount: number, currency: string) =>
  // Grouped, two decimals, currency code spelled out rather than a symbol:
  // these are USD today on a UAE platform and a $ beside an AED figure would
  // be actively misleading.
  `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/**
 * A revenue cell. One line per currency, an em dash when there is none.
 * Never a single added-up number: the currencies are not interchangeable, and
 * a lone figure in a column would be read as one.
 */
function Revenue({ rows }: { rows: Array<{ currency: string; amount: number }> }) {
  if (!rows?.length) return <>—</>;
  return (
    <div className="space-y-0.5">
      {rows.map((r) => (
        <div key={r.currency} className="whitespace-nowrap">{money(r.amount, r.currency)}</div>
      ))}
    </div>
  );
}

export default function LicenseAnalytics() {
  const { t, i18n } = useTranslation(["admin"]);
  const isAr = i18n.language?.startsWith("ar");

  const { data, isLoading, isError } = useQuery<Analytics>({
    queryKey: ["/api/superadmin/licenses/analytics"],
  });
  const { data: recon } = useQuery<Reconciliation>({
    queryKey: ["/api/superadmin/licenses/reconciliation"],
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">{t("admin:licenseAnalytics.loading")}</p>;
  }
  if (isError || !data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{t("admin:licenseAnalytics.failed")}</p>
        </CardContent>
      </Card>
    );
  }

  const p = data.platform;

  return (
    <div className="space-y-4">
      {/* Above the figures it undermines, not beside them. */}
      {!!recon && recon.mismatchCount > 0 && (
        <Card className="border-destructive/50" data-testid="card-license-reconciliation">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
            <div>
              <CardTitle className="text-base text-destructive">
                {t("admin:licenseAnalytics.reconTitle")}
              </CardTitle>
              <CardDescription>{t("admin:licenseAnalytics.reconDesc")}</CardDescription>
            </div>
            <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin:licenseAnalytics.colSchool")}</TableHead>
                  <TableHead className="text-end">{t("admin:licenseAnalytics.colLicenceTotal")}</TableHead>
                  <TableHead className="text-end">{t("admin:licenseAnalytics.colLedger")}</TableHead>
                  <TableHead className="text-end">{t("admin:licenseAnalytics.colDifference")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recon.mismatches.map((m) => (
                  <TableRow key={m.organizationId}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell className="text-end">{m.totalLicenses}</TableCell>
                    <TableCell className="text-end">{m.ledgerTotal}</TableCell>
                    <TableCell className="text-end text-destructive font-medium">
                      {m.difference > 0 ? `+${m.difference}` : m.difference}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ platform summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin:licenseAnalytics.revenue")}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {data.revenueByCurrency.length === 0 ? (
              <div className="text-2xl font-bold" data-testid="text-license-revenue">—</div>
            ) : (
              // One line per currency. Never added together: Stripe is on USD
              // today and the column allows AED, and a single total would be
              // money in no currency at all.
              <div className="space-y-1" data-testid="text-license-revenue">
                {data.revenueByCurrency.map((r) => (
                  <div key={r.currency} className="text-2xl font-bold leading-tight">
                    {money(r.amount, r.currency)}
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {t("admin:licenseAnalytics.revenueCaption", { count: p.purchases })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin:licenseAnalytics.granted")}</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-license-granted">{p.granted}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin:licenseAnalytics.grantedCaption", { free: p.grantedFree })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin:licenseAnalytics.consumed")}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-license-consumed">{p.totalConsumed}</div>
            <p className="text-xs text-muted-foreground">
              {t("admin:licenseAnalytics.consumedCaption", {
                paid: p.schoolConsumedPaid,
                reward: p.schoolConsumedReward,
                parent: p.guardianConsumed,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2">
            <CardTitle className="text-sm font-medium">{t("admin:licenseAnalytics.remaining")}</CardTitle>
            <InfinityIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-license-remaining">
              {p.remainingAtCappedSchools}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("admin:licenseAnalytics.remainingCaption", { unlimited: p.unlimitedSchools })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ---------------------------------------------------- per country */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin:licenseAnalytics.byCountry")}</CardTitle>
          <CardDescription>{t("admin:licenseAnalytics.byCountryDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="table-licenses-by-country">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin:licenseAnalytics.colCountry")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colSchools")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colGranted")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colConsumed")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colReward")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colRemaining")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colRevenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.perCountry.map((c) => (
                <TableRow key={c.countryId ?? "none"}>
                  <TableCell className="font-medium">
                    {/* A school with no country gets a translated label, not
                        the server's English. */}
                    {isAr && c.countryNameAr
                      ? c.countryNameAr
                      : (c.countryName ?? t("admin:licenseAnalytics.noCountry"))}
                  </TableCell>
                  <TableCell className="text-end">
                    {c.schools}
                    {c.unlimitedSchools > 0 && (
                      <Badge variant="outline" className="ms-2">
                        {t("admin:licenseAnalytics.unlimitedBadge", { count: c.unlimitedSchools })}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-end">{c.granted}</TableCell>
                  <TableCell className="text-end">{c.consumed}</TableCell>
                  <TableCell className="text-end">{c.consumedReward}</TableCell>
                  <TableCell className="text-end">{c.remaining}</TableCell>
                  <TableCell className="text-end"><Revenue rows={c.revenue} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ----------------------------------------------------- per school */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin:licenseAnalytics.bySchool")}</CardTitle>
          <CardDescription>{t("admin:licenseAnalytics.bySchoolDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table data-testid="table-licenses-by-school">
            <TableHeader>
              <TableRow>
                <TableHead>{t("admin:licenseAnalytics.colSchool")}</TableHead>
                <TableHead>{t("admin:licenseAnalytics.colCurriculum")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colGranted")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colConsumed")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colReward")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colRemaining")}</TableHead>
                <TableHead className="text-end">{t("admin:licenseAnalytics.colRevenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.perSchool.map((s) => (
                <TableRow key={s.organizationId}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {s.curriculum ?? t("admin:licenseAnalytics.notSet")}
                  </TableCell>
                  <TableCell className="text-end">
                    {s.isUnlimited ? (
                      <Badge variant="outline">{t("admin:licenseAnalytics.unlimited")}</Badge>
                    ) : s.granted}
                  </TableCell>
                  <TableCell className="text-end">{s.consumed}</TableCell>
                  <TableCell className="text-end">{s.consumedReward}</TableCell>
                  <TableCell className="text-end">
                    {/* An em dash, never 0: an unlimited school has no
                        remaining balance, and 0 reads as exhausted. */}
                    {s.remaining === null ? "—" : s.remaining}
                  </TableCell>
                  <TableCell className="text-end"><Revenue rows={s.revenue} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------- caveats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("admin:licenseAnalytics.caveatsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-xs text-muted-foreground list-disc ms-4" data-testid="list-license-caveats">
            {/* Codes from the server, turned into a sentence in the reader's
                own language here. The server must never send prose: it would
                arrive in English on the Arabic side and name response fields
                nobody reading a dashboard knows. */}
            {data.caveats.map((code) => (
              <li key={code}>{t(`admin:licenseAnalytics.caveat.${code}`)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
