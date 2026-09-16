/**
 * THE CHILD IS NOTIFIED, NOT ASKED — the parent-registers equivalent of
 * SchoolConsentNotice, and deliberately NOT a reuse of it.
 *
 * A parent-registered child's consent was given by their parent, first-person,
 * at registration (child_guardian_consents) — a real act, but one that
 * already happened before this screen renders. Showing SchoolConsentNotice's
 * wording here would be false: no school is involved, and "{{school}} set up
 * this assessment for you" names an institution that does not exist for this
 * account. See docs/parent-registers-scoping.md item 4's point on why the
 * two populations cannot share a consent-notice component even though both
 * are "notified, not asked."
 *
 * NO PROPS, UNLIKE SchoolConsentNotice. The org version names a specific
 * school because "your school consented" is unverifiable without saying
 * which one. "Your parent or guardian" needs no name to be unambiguous — a
 * parent-registers account has exactly one guardian, the account holder —
 * so there is nothing here that varies by account the way a school name does.
 */

import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";

export function ParentConsentNotice() {
  const { t } = useTranslation("assessment");

  return (
    <div
      className="flex items-start gap-3 rounded-lg border border-foreground/10 bg-muted/40 px-4 py-3 text-sm text-muted-foreground max-w-3xl mx-auto"
      data-testid="notice-parent-consent"
    >
      <Info className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="font-body leading-relaxed">
        {t("demographics.consentParentNotice")}{" "}
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
