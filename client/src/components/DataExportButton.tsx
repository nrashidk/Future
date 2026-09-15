import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadDataExport, type ExportOutcome } from "@/lib/dataRights";

/**
 * The subject-access download, with the sentence that says what the file is.
 *
 * THAT SENTENCE MUST NOT PROMISE A READABLE DOCUMENT. The export is JSON for
 * software, with English keys and English notes, whatever language the reader
 * uses. What a reader can actually read is the translated counts on Profile.
 */
export function DataExportButton({ onStarted }: { onStarted?: () => void }) {
  const { t } = useTranslation("profile");
  const [state, setState] = useState<"idle" | "preparing" | ExportOutcome>("idle");

  const run = async () => {
    setState("preparing");
    const outcome = await downloadDataExport();
    setState(outcome);
    if (outcome === "started") onStarted?.();
  };

  const status = {
    idle: null,
    preparing: t("dataRights.export.preparing"),
    started: t("dataRights.export.started"),
    rateLimited: t("dataRights.export.rateLimited"),
    failed: t("dataRights.export.failed"),
  }[state];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("dataRights.export.what")}</p>
      <Button type="button" onClick={run} disabled={state === "preparing"} data-testid="button-download-data">
        <Download />
        {t("dataRights.export.button")}
      </Button>
      <p
        role="status"
        aria-live="polite"
        className={`text-sm ${state === "rateLimited" || state === "failed" ? "text-destructive" : "text-muted-foreground"}`}
        data-testid="text-download-status"
      >
        {status}
      </p>
    </div>
  );
}
