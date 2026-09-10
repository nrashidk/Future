/**
 * THE STUDENT IS NOTIFIED, NOT ASKED.
 *
 * A school student's consent was given by their school, once, as a recorded act
 * by a named administrator who also attested that the school holds guardian
 * consent (organization_consents). The student is not the consenting party, so
 * asking them to agree is a fiction — and the previous screen made that fiction
 * visible: a checkbox labelled "You agree to the Terms of Use and Privacy
 * Policy", pre-ticked and disabled, which the student could neither tick nor
 * untick. Whatever that control was, it was not consent.
 *
 * This replaces it with a plain statement. It names the school, because "your
 * school consented" is unverifiable to a student who is not told which school
 * the system thinks they belong to, and it links the documents, because a
 * student who wants to know what was agreed on their behalf must be able to
 * read it.
 *
 * A STUDENT WHO READS NOTHING LOSES NOTHING. Nothing here gates progression;
 * there is no control to operate and no state to set. That is the point of
 * showing it every time rather than once — it costs a student who does not care
 * nothing at all, and it is always there for one who does.
 */

import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

export function SchoolConsentNotice({ schoolName }: { schoolName?: string | null }) {
  const { t } = useTranslation("assessment");

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-foreground/10 bg-muted/40 px-4 py-3 text-sm text-muted-foreground max-w-3xl mx-auto"
      data-testid="notice-school-consent"
    >
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="font-body leading-relaxed">
        {/* Falls back to a generic phrasing when the org name has not resolved
            yet, rather than rendering "Your school " with a hole in it. */}
        {schoolName
          ? t("demographics.consentOrgNotice", { school: schoolName })
          : t("demographics.consentOrgNoticeGeneric")}{" "}
        <Link href="/terms" className="text-primary hover:underline font-semibold" data-testid="link-consent-terms">
          {t("demographics.termsOfUse")}
        </Link>
        {" "}{t("demographics.and")}{" "}
        <Link href="/privacy" className="text-primary hover:underline font-semibold" data-testid="link-consent-privacy">
          {t("demographics.privacyPolicy")}
        </Link>
        .
      </p>
    </div>
  );
}
