import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Database } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DATA_SUMMARY_QUERY_KEY, type DataSummary } from "@/lib/dataRights";
import { DataExportButton } from "@/components/DataExportButton";
import { ErasureRefusal } from "@/components/ErasureRefusal";

/** Every counted category, in reading order. Zero counts are not listed. */
const CATEGORIES = [
  "assessments",
  "careerRecommendations",
  "careerNarratives",
  "quizzes",
  "quizResponses",
  "cvqResults",
  "wefCompetencyResults",
  "schoolEnrolment",
  "schoolConsentCoveringYou",
  "schoolRemovalRecords",
  "passwordResetRequests",
  "consentAttestationsYouMade",
  "organizationDeletionsYouPerformed",
] as const;

/**
 * Profile's "Your data": what we hold, a copy of it, and the way to delete it.
 *
 * THE COUNTS ARE THE READABLE PART. The export is English JSON for software. The
 * numbers here, under labels in the reader's own language, are what a student
 * can actually read about their own record. Label and number sit in separate
 * cells, so no count lands inside a sentence that would need Arabic plural forms.
 *
 * ONE FETCH. The counts and the answer to "would deletion run" come from the
 * same data-summary response, so this section cannot offer the deletion page to
 * an account the server would refuse. Until that answer arrives, neither the
 * link nor a refusal is shown.
 *
 * NO CONTACT LINE, by decision: the privacy address cannot receive mail yet
 * (FOLLOWUP.md, "STEP 6 BLOCKED"), and both rights here work without one.
 */
export function YourDataSection({ isOrgStudent }: { isOrgStudent: boolean }) {
  const { t } = useTranslation("profile");
  const summary = useQuery<DataSummary>({ queryKey: DATA_SUMMARY_QUERY_KEY });
  const data = summary.data;
  const erasure = data?.erasure;
  const refused = !!erasure && (erasure.blocked || erasure.confirmWith === null);

  return (
    <Card data-testid="section-your-data">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          {t("dataRights.section.title")}
        </CardTitle>
        <CardDescription>{t("dataRights.section.intro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isOrgStudent && <p className="text-sm">{t("dataRights.schoolNote")}</p>}

        <div className="space-y-2">
          <h3 className="font-semibold">{t("dataRights.section.heldTitle")}</h3>
          {summary.isLoading ? (
            <p role="status" className="text-sm text-muted-foreground">{t("dataRights.delete.loading")}</p>
          ) : data ? (
            <ul className="divide-y rounded-md border text-sm" data-testid="list-data-held">
              <li className="px-3 py-2">{t("dataRights.section.categories.account")}</li>
              {CATEGORIES.filter((key) => data.dataCategories[key] > 0).map((key) => (
                <li key={key} className="flex items-center justify-between gap-4 px-3 py-2">
                  <span>{t(`dataRights.section.categories.${key}`)}</span>
                  <span className="font-semibold tabular-nums">{data.dataCategories[key]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p role="alert" className="text-sm text-destructive">{t("dataRights.section.summaryFailed")}</p>
          )}
        </div>

        <div className="space-y-2 border-t pt-6">
          <h3 className="font-semibold">{t("dataRights.section.exportTitle")}</h3>
          <DataExportButton />
        </div>

        <div className="space-y-3 border-t pt-6">
          <h3 className="font-semibold">{t("dataRights.section.deleteTitle")}</h3>
          {erasure && refused ? (
            <ErasureRefusal erasure={erasure} />
          ) : !summary.isLoading ? (
            <>
              <p className="text-sm text-muted-foreground">{t("dataRights.section.deleteBody")}</p>
              <Button asChild variant="outline" className="border-destructive/50 text-destructive" data-testid="link-delete-account">
                <Link href="/profile/delete-account">{t("dataRights.section.deleteLink")}</Link>
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
