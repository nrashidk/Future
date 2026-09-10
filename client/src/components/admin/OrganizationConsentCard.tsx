/**
 * THE SCHOOL'S CONSENT ACT — the org_admin's screen for it.
 *
 * The students are 13-18 and the school creates their accounts on their behalf,
 * so the school is the consenting party. This is where that act is performed and
 * where the record of it is shown back.
 *
 * TWO CHECKBOXES, NOT ONE, and they must stay two. The record stores two
 * separable claims (organization_consents.consents_to_processing and
 * .attests_guardian_consent) and the server rejects a partial affirmation. A
 * single combined tick could not honestly populate both columns — it would let
 * one click stand for a guardian-consent attestation the admin never read
 * separately, which is the claim carrying the legal weight.
 *
 * THE EXACT RENDERED WORDING IS POSTED BACK. attestationTextHash on the record
 * pins what this admin actually saw, so a later reword of these strings cannot
 * be mistaken for what they agreed to. That is why the text is composed here and
 * sent, rather than reconstructed server-side from the same keys.
 *
 * DRIFT IS A NOTICE, NEVER A BLOCK. When the documents have moved since the
 * school attested, this says so and offers re-attestation. It does not withdraw
 * the existing consent and does not stop enrolment: a gate on drift would lock
 * every school out of enrolment on the first typo committed to legal.json.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { ShieldCheck, AlertTriangle } from "lucide-react";

interface ConsentRecord {
  id: string;
  performedByName: string;
  policyVersion: string;
  policyLastUpdated: string;
  createdAt: string | null;
}

interface ConsentResponse {
  consent: ConsentRecord | null;
  currentPolicyVersion: string | null;
  currentPolicyLastUpdated: Record<string, string> | null;
  policyDrifted: boolean;
}

export const ORG_CONSENT_QUERY_KEY = ["/api/my-organization/consent"];

/** Shared with the roster so "has this school consented" has one answer. */
export function useOrganizationConsent(enabled: boolean) {
  return useQuery<ConsentResponse>({
    queryKey: ORG_CONSENT_QUERY_KEY,
    enabled,
  });
}

export function OrganizationConsentCard({ schoolName }: { schoolName: string }) {
  const { t, i18n } = useTranslation("admin");
  const { toast } = useToast();

  const { data, isLoading } = useOrganizationConsent(true);
  const [processing, setProcessing] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [reaffirming, setReaffirming] = useState(false);

  const locale = i18n.language?.startsWith("ar") ? "ar" : "en";
  const school = schoolName || "";

  // Composed here and posted verbatim — see the note on attestationTextHash.
  const attestationText = [
    t("orgs.consentProcessing", { school }),
    t("orgs.consentGuardian", { school }),
  ].join("\n");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/my-organization/consent", {
        consentsToProcessing: true,
        attestsGuardianConsent: true,
        attestationText,
        locale,
      });
      return res.json();
    },
    onSuccess: () => {
      setProcessing(false);
      setGuardian(false);
      setReaffirming(false);
      queryClient.invalidateQueries({ queryKey: ORG_CONSENT_QUERY_KEY });
      toast({ title: t("orgs.consentRecordedTitle") });
    },
    onError: (error: unknown) => {
      toast({
        title: serverErrorMessage(error) || t("orgs.consentError"),
        variant: "destructive",
      });
    },
  });

  if (isLoading) return null;

  const consent = data?.consent ?? null;
  const documentsUnavailable = data?.currentPolicyVersion === null;

  const legalLinks = (
    <>
      <Link href="/terms" className="text-primary hover:underline font-semibold" data-testid="link-org-consent-terms">
        {t("orgs.termsOfUse")}
      </Link>
      {" · "}
      <Link href="/privacy" className="text-primary hover:underline font-semibold" data-testid="link-org-consent-privacy">
        {t("orgs.privacyPolicy")}
      </Link>
    </>
  );

  // RECORDED STATE. Shown rather than hidden: this is the only place the school
  // can see what it attested, who attested it, and against which documents.
  if (consent && !reaffirming) {
    const recordedOn = consent.createdAt
      ? new Date(consent.createdAt).toLocaleDateString(locale === "ar" ? "ar" : "en-GB")
      : "";
    return (
      <Card data-testid="card-org-consent-recorded">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            {t("orgs.consentRecordedTitle")}
          </CardTitle>
          <CardDescription>
            {t("orgs.consentRecordedBy", { name: consent.performedByName, date: recordedOn })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p data-testid="text-org-consent-policy">
            {t("orgs.consentPolicyRef", {
              version: consent.policyVersion,
              lastUpdated: consent.policyLastUpdated,
            })}{" "}
            — {legalLinks}
          </p>
          {data?.policyDrifted && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-foreground" data-testid="notice-org-consent-drift">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
              <div className="space-y-2">
                <p>{t("orgs.consentDrift")}</p>
                <Button size="sm" variant="outline" onClick={() => setReaffirming(true)} data-testid="button-org-consent-reaffirm">
                  {t("orgs.consentReaffirm")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  const bothAffirmed = processing && guardian;

  return (
    <Card className="border-primary/40" data-testid="card-org-consent-form">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary" />
          {t("orgs.consentTitle")}
        </CardTitle>
        <CardDescription>{t("orgs.consentIntro", { school })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {documentsUnavailable ? (
          <p className="text-sm text-destructive" data-testid="text-org-consent-unavailable">
            {t("orgs.consentUnavailable")}
          </p>
        ) : (
          <>
            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-processing"
                checked={processing}
                onCheckedChange={(v) => setProcessing(v === true)}
                className="mt-1"
                data-testid="checkbox-org-consent-processing"
              />
              <Label htmlFor="consent-processing" className="text-sm font-body leading-relaxed cursor-pointer">
                {t("orgs.consentProcessing", { school })} {legalLinks}
              </Label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="consent-guardian"
                checked={guardian}
                onCheckedChange={(v) => setGuardian(v === true)}
                className="mt-1"
                data-testid="checkbox-org-consent-guardian"
              />
              <div className="flex-1">
                <Label htmlFor="consent-guardian" className="text-sm font-body leading-relaxed cursor-pointer">
                  {t("orgs.consentGuardian", { school })}
                </Label>
                <p className="text-xs text-muted-foreground mt-1">{t("orgs.consentGuardianHelp")}</p>
              </div>
            </div>

            {!bothAffirmed && (
              <p className="text-xs text-muted-foreground" data-testid="text-org-consent-both-required">
                {t("orgs.consentBothRequired")}
              </p>
            )}

            <Button
              onClick={() => mutation.mutate()}
              disabled={!bothAffirmed || mutation.isPending}
              data-testid="button-org-consent-submit"
            >
              {mutation.isPending ? t("orgs.consentSubmitting") : t("orgs.consentSubmit")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
