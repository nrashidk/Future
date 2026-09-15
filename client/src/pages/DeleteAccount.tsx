import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, serverErrorCode } from "@/lib/queryClient";
import { DATA_SUMMARY_QUERY_KEY, isolate, type DataSummary } from "@/lib/dataRights";
import { DataExportButton } from "@/components/DataExportButton";
import { ErasureRefusal } from "@/components/ErasureRefusal";

/**
 * Deleting your own account, in three steps a 13–18 year old can follow alone.
 *
 *   what     what is deleted, with counts, and what is NOT deleted where that is
 *            true for this reader (data-summary's erasure.keptAfterErasure)
 *   copy     the export, offered while there is still something to export.
 *            Skipping is a button that says so, never the default path.
 *   confirm  the password, or the typed email for an account without one. The
 *            server checks either (services/erasureConfirmation.ts); this page
 *            only asks.
 *
 * THE FINAL BUTTON IS LAST, AND ALONE ON ITS ROW. The confirm step's actions are
 * a plain flex-col at every width, in DOM order: keep, then delete. Never the
 * col-reverse the dialog footers carry, which put a destructive action first
 * below 640px (FOLLOWUP.md, "A LAYOUT CLASS REVERSED THE DISPOSITION BUTTONS").
 * Source order is a claim, so the positions are measured rendered.
 *
 * A REFUSED ACCOUNT NEVER SEES A STEP. data-summary says whether erasure would
 * run, so a refused reader is given the reason instead of a form that ends in a
 * 409.
 */

type Step = "what" | "copy" | "confirm";

/** The HTTP status apiRequest's error starts with; null when no response arrived. */
function responseStatus(error: unknown): number | null {
  const match = error instanceof Error ? /^(\d{3}): /.exec(error.message) : null;
  return match ? Number(match[1]) : null;
}

export default function DeleteAccount() {
  const { t } = useTranslation("profile");
  useEffect(() => {
    document.title = `${t("dataRights.delete.pageTitle")} | ${t("appName")}`;
  }, [t]);

  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("what");
  const [copyStarted, setCopyStarted] = useState(false);
  const [secret, setSecret] = useState("");
  const [deleted, setDeleted] = useState(false);

  const summary = useQuery<DataSummary>({
    queryKey: DATA_SUMMARY_QUERY_KEY,
    enabled: !!user && !deleted,
  });

  // Each step replaces the last in place. Move the reader to its heading rather
  // than leaving focus on a button that no longer exists.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, [step]);

  const erase = useMutation({
    mutationFn: () =>
      apiRequest(
        "DELETE",
        "/api/users/me",
        summary.data?.erasure.confirmWith === "email" ? { confirmEmail: secret } : { password: secret },
      ),
    onSuccess: () => setDeleted(true),
    onError: (error) => {
      // Blocked since the summary was read. Re-read it, and the refusal renders.
      if (serverErrorCode(error) === "ERASURE_BLOCKED_BY_AUDIT_RECORDS") summary.refetch();
    },
  });

  // "NOTHING WAS DELETED" ONLY WHERE IT IS TRUE. A response from the route means
  // its transaction either committed or did not, and a refusal or a 500 means
  // it did not. No response — a dropped connection, a gateway timeout — means
  // nobody on this side knows, and the sentence says that instead.
  const errorMessage = (() => {
    if (!erase.isError) return null;
    const code = serverErrorCode(erase.error);
    const status = responseStatus(erase.error);
    if (code === "ERASURE_PASSWORD_INCORRECT") return t("dataRights.delete.errors.passwordIncorrect");
    if (code === "ERASURE_EMAIL_MISMATCH") return t("dataRights.delete.errors.emailMismatch");
    if (status === 429) return t("dataRights.delete.errors.tooManyAttempts");
    if (status === 404) return t("dataRights.delete.errors.notFound");
    if (status === null || status >= 502) return t("dataRights.delete.errors.unreachable");
    return t("dataRights.delete.errors.failed");
  })();

  const shell = (children: ReactNode) => (
    <main id="main-content" className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <header className="border-b bg-background/80">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-4">
          <span className="flex items-center gap-2 font-bold">
            <GraduationCap className="h-6 w-6 text-primary" />
            Future Pathways
          </span>
          {!deleted && (
            <Link href="/profile" className="text-sm underline-offset-4 hover:underline" data-testid="link-back-to-profile">
              {t("dataRights.delete.backToProfile")}
            </Link>
          )}
        </div>
      </header>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Card>
          <CardContent className="space-y-6 p-6">{children}</CardContent>
        </Card>
      </div>
    </main>
  );

  // Before the auth guard: the session is gone the moment this is true.
  if (deleted) {
    return shell(
      <>
        <h1 className="text-2xl font-bold" data-testid="text-account-deleted">{t("dataRights.delete.doneTitle")}</h1>
        <p>{t("dataRights.delete.doneBody")}</p>
        {/* A full load, so nothing cached about the deleted account survives. */}
        <Button onClick={() => window.location.assign("/")} data-testid="button-go-home">
          {t("dataRights.delete.goHome")}
        </Button>
      </>,
    );
  }

  if (isLoading || (user && summary.isLoading)) {
    return shell(<p role="status">{t("dataRights.delete.loading")}</p>);
  }

  if (!user) {
    navigate("/");
    return null;
  }

  if (summary.isError || !summary.data) {
    return shell(<p role="alert">{t("dataRights.delete.loadFailed")}</p>);
  }

  const { dataCategories: counts, erasure } = summary.data;
  const title = <h1 className="text-2xl font-bold">{t("dataRights.delete.pageTitle")}</h1>;
  const stepHeading = (text: string, className = "") => (
    <h2 ref={headingRef} tabIndex={-1} className={`text-lg font-semibold outline-none ${className}`}>
      {text}
    </h2>
  );
  const keepAccount = (className: string) => (
    <Button asChild variant="outline" className={className} data-testid="button-keep-account">
      <Link href="/profile">{t("dataRights.delete.keepAccount")}</Link>
    </Button>
  );

  if (erasure.blocked || erasure.confirmWith === null) {
    return shell(
      <>
        {title}
        <ErasureRefusal erasure={erasure} />
        <Button asChild variant="outline">
          <Link href="/profile">{t("dataRights.delete.backToProfile")}</Link>
        </Button>
      </>,
    );
  }

  if (step === "what") {
    // The seven things DELETE /api/users/me reports deleting, in its order.
    const items: Array<{ key: string; count?: number }> = [
      { key: "account" },
      { key: "assessments", count: counts.assessments },
      { key: "quizResponses", count: counts.quizResponses },
      { key: "recommendations", count: counts.careerRecommendations },
      { key: "values", count: counts.cvqResults },
      { key: "competencies", count: counts.wefCompetencyResults },
      ...(counts.schoolEnrolment > 0 ? [{ key: "school" }] : []),
    ];
    return shell(
      <>
        {title}
        <section className="space-y-4">
          {stepHeading(t("dataRights.delete.whatTitle"))}
          <p>{t("dataRights.delete.whatIntro")}</p>
          {/* Label and number as separate cells, never "3 assessments": a
              count inside a sentence needs Arabic plural forms (§1.5). */}
          <ul className="divide-y rounded-md border" data-testid="list-deleted-items">
            {items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-4 px-3 py-2">
                <span>{t(`dataRights.delete.items.${item.key}`)}</span>
                {item.count !== undefined && <span className="font-semibold tabular-nums">{item.count}</span>}
              </li>
            ))}
          </ul>
          {user.isOrgStudent && <p className="text-sm">{t("dataRights.schoolNote")}</p>}
        </section>

        {erasure.keptAfterErasure.length > 0 && (
          <section className="space-y-2" data-testid="section-not-deleted">
            <h2 className="text-lg font-semibold">{t("dataRights.delete.keptTitle")}</h2>
            <ul className="list-disc space-y-2 ps-5">
              {erasure.keptAfterErasure.map((kept) => (
                <li key={`${kept.code}:${kept.organizationName ?? ""}`}>
                  {t(`dataRights.delete.kept.${kept.code}`, {
                    school: isolate(kept.organizationName ?? t("dataRights.delete.unnamedSchool")),
                  })}
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          {keepAccount("")}
          <Button onClick={() => setStep("copy")} data-testid="button-step-continue">
            {t("dataRights.delete.continue")}
          </Button>
        </div>
      </>,
    );
  }

  if (step === "copy") {
    return shell(
      <>
        {title}
        <section className="space-y-4">
          {stepHeading(t("dataRights.delete.copyTitle"))}
          <p>{t("dataRights.delete.copyBody")}</p>
          <DataExportButton onStarted={() => setCopyStarted(true)} />
        </section>
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          {keepAccount("")}
          {copyStarted ? (
            <Button onClick={() => setStep("confirm")} data-testid="button-step-continue">
              {t("dataRights.delete.continue")}
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setStep("confirm")} data-testid="button-continue-without-copy">
              {t("dataRights.delete.continueWithoutCopy")}
            </Button>
          )}
        </div>
      </>,
    );
  }

  const byEmail = erasure.confirmWith === "email";
  const ready = byEmail ? secret.trim().length > 0 : secret.length > 0;

  return shell(
    <>
      {title}
      {/* noValidate: the server's refusal is the check, and it reaches the reader
          translated. The browser's own "include an @" bubble is in the browser's
          language, not the page's, and on this screen that is an English
          sentence over an Arabic form. */}
      <form
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !erase.isPending) erase.mutate();
        }}
      >
        <section className="space-y-4">
          {stepHeading(t("dataRights.delete.confirmTitle"), "text-destructive")}
          <p>{t("dataRights.delete.confirmBody")}</p>
          <div className="space-y-2">
            <Label htmlFor="erasure-confirmation">
              {byEmail ? t("dataRights.delete.emailLabel") : t("dataRights.delete.passwordLabel")}
            </Label>
            {byEmail && user.email && (
              <p className="text-sm text-muted-foreground" data-testid="text-account-email">
                {t("dataRights.delete.emailIs")} <span dir="ltr" className="font-medium">{user.email}</span>
              </p>
            )}
            {/* Left-to-right in an Arabic page too: a password or an address is
                typed as Latin characters, and a caret that runs backwards is
                how a typo goes unseen. */}
            <Input
              id="erasure-confirmation"
              type={byEmail ? "email" : "password"}
              dir="ltr"
              autoComplete={byEmail ? "off" : "current-password"}
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                if (erase.isError) erase.reset();
              }}
              aria-invalid={erase.isError}
              data-testid="input-erasure-confirmation"
            />
          </div>
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive" data-testid="text-erasure-error">
              {errorMessage}
            </p>
          )}
        </section>

        <div className="flex flex-col gap-3 border-t pt-6">
          {keepAccount("w-full")}
          <Button
            type="submit"
            variant="destructive"
            className="w-full"
            disabled={!ready || erase.isPending}
            data-testid="button-delete-account-final"
          >
            {erase.isPending ? t("dataRights.delete.deleting") : t("dataRights.delete.deleteButton")}
          </Button>
        </div>
      </form>
    </>,
  );
}
