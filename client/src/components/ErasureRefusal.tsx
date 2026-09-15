import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ErasureBlockCode, ErasureStatus } from "@shared/dataRights";
import { isolate } from "@/lib/dataRights";

/**
 * Blocks that go away when the school is deleted. Reasoned from the code, not
 * run against a database (FOLLOWUP.md, "SCHOOL ADMIN ACCOUNTS WHEN A SCHOOL IS
 * DELETED"): the organizations row and its events are deleted with the school,
 * import files carry its organization_id, and contribution submissions cascade.
 * The other sources are superadmin-only, and deleting a school does nothing
 * about them.
 */
const RESOLVED_BY_SCHOOL_DELETION: ReadonlySet<ErasureBlockCode> = new Set<ErasureBlockCode>([
  "school_administrator",
  "school_activity_performed",
  "school_activity_affected",
  "files_uploaded",
  "contributions_submitted",
]);

/**
 * Why this account cannot be deleted here, in the reader's language.
 *
 * NO CONTACT LINE. The only address the product has for this cannot receive
 * mail (FOLLOWUP.md, "STEP 6 BLOCKED"). A school admin whose every block goes
 * away with their school is told the route that does exist: the school's
 * removal. Anyone else is told what blocks the deletion, and nothing that looks
 * like a way forward when it is not one.
 */
export function ErasureRefusal({ erasure }: { erasure: ErasureStatus }) {
  const { t } = useTranslation("profile");
  const { language } = useLanguage();

  const box = "space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm";

  if (!erasure.blocked) {
    // The only other refusal: nothing to confirm with (confirmWith null).
    return (
      <div role="note" className={box} data-testid="erasure-refusal">
        <p className="font-semibold">{t("dataRights.refusal.title")}</p>
        <p>{t("dataRights.refusal.unconfirmable")}</p>
      </div>
    );
  }

  const schools = erasure.administeredSchools.length > 0
    ? new Intl.ListFormat(language, { type: "conjunction" }).format(erasure.administeredSchools.map(isolate))
    : null;
  const resolvedBySchoolDeletion =
    schools != null && erasure.blockingRecords.every((code) => RESOLVED_BY_SCHOOL_DELETION.has(code));

  return (
    <div role="note" className={box} data-testid="erasure-refusal">
      <p className="font-semibold">{t("dataRights.refusal.title")}</p>
      {schools && <p data-testid="text-refusal-admin">{t("dataRights.refusal.adminOf", { schools })}</p>}
      {resolvedBySchoolDeletion ? (
        <p>{t("dataRights.refusal.afterSchoolRemoval")}</p>
      ) : (
        <>
          <p>{t("dataRights.refusal.intro")}</p>
          <ul className="list-disc space-y-1 ps-5">
            {erasure.blockingRecords.map((code) => (
              <li key={code}>{t(`dataRights.refusal.labels.${code}`)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
