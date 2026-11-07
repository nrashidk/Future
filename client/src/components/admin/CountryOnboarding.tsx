/**
 * COUNTRY ONBOARDING — one flow, held open until the country is usable.
 *
 * Setting up a country used to mean crossing the superadmin's tabs: create it
 * under Countries, add its curricula under Countries again, add subjects under
 * SUBJECTS, add questions on another page entirely, then come back to
 * Countries to run Repopulate for the sector map. Separate screens, no order
 * between them, and nothing anywhere saying which steps were still outstanding.
 *
 * That is how the UAE ended up offering three curricula with no subjects
 * behind them for months. None of the steps were wrong; they were just
 * optional and invisible.
 *
 * So this is a checklist rather than a form. It takes its state from the
 * readiness endpoint, which already knows precisely what is missing and why,
 * and it keeps the superadmin here until that endpoint says the country is
 * ready. Two things make that possible now: subjects no longer need a step at
 * all, because offering a curriculum creates them, and readiness gives this
 * component a real finish line instead of a guess.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO is let a superadmin add curricula freely
 * while they are here. A country is created with its national curriculum only,
 * because every curriculum offered is a commitment to fill with questions, and
 * the suggestions are shown with that cost stated rather than as a list to
 * tick through.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Circle, AlertTriangle, Loader2, Sparkles, RefreshCw, ArrowRight,
} from "lucide-react";

interface Readiness {
  countryId: string;
  ready: boolean;
  blockers: string[];
  warnings: string[];
  checks: {
    hasVision: boolean;
    hasCurricula: boolean;
    sectorMapRows: number;
    curricula: Array<{
      curriculum: string;
      subjectCount: number;
      questionCount: number;
      ready: boolean;
    }>;
  };
}

type StepState = "done" | "todo" | "warn";

function StepRow({
  state, title, detail, action,
}: {
  state: StepState;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  // The icon carries the state, so it must not be the ONLY thing that does --
  // colour and icon alone fail for anyone who cannot distinguish them, and the
  // detail line below always states the position in words.
  const Icon = state === "done" ? CheckCircle2 : state === "warn" ? AlertTriangle : Circle;
  const tone =
    state === "done" ? "text-green-600"
      : state === "warn" ? "text-amber-600"
        : "text-muted-foreground";

  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-b-0">
      <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{title}</p>
        <p className="text-sm text-muted-foreground break-words">{detail}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default function CountryOnboarding({
  countryId,
  countryName,
  suggestedCurricula = [],
  onDone,
}: {
  countryId: string;
  countryName: string;
  suggestedCurricula?: string[];
  onDone?: () => void;
}) {
  const { t } = useTranslation("admin");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addedCurricula, setAddedCurricula] = useState<string[]>([]);

  const { data: readiness, isLoading, refetch } = useQuery<Readiness>({
    queryKey: [`/api/admin/countries/${countryId}/readiness`],
    // Each action below changes readiness, so the panel re-reads rather than
    // predicting what the action did.
    refetchOnMount: true,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/admin/countries/${countryId}/readiness`] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/countries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/countries"] });
  };

  // Repopulate is what generates the sector map; it is also the repair path for
  // a country whose research came back thin.
  const sectorMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/admin/countries/${countryId}/repopulate`)).json(),
    onSuccess: () => {
      invalidateAll();
      refetch();
      toast({ title: t("countries.onboarding.sectorDone") });
    },
    onError: (e: unknown) =>
      toast({ title: t("countries.errorTitle"), description: serverErrorMessage(e), variant: "destructive" }),
  });

  const addCurriculumMutation = useMutation({
    mutationFn: async (curriculum: string) => {
      const current = readiness?.checks.curricula.map((c) => c.curriculum) ?? [];
      // The update route is what seeds the new curriculum's subjects, so this
      // is a full curricula list rather than an append endpoint.
      return apiRequest("PUT", `/api/admin/countries/${countryId}`, {
        curricula: [...current, curriculum],
      });
    },
    onSuccess: (_r, curriculum) => {
      setAddedCurricula((prev) => [...prev, curriculum]);
      invalidateAll();
      refetch();
      toast({
        title: t("countries.onboarding.curriculumAdded", { curriculum }),
        description: t("countries.onboarding.curriculumAddedDesc"),
      });
    },
    onError: (e: unknown) =>
      toast({ title: t("countries.errorTitle"), description: serverErrorMessage(e), variant: "destructive" }),
  });

  if (isLoading || !readiness) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("countries.onboarding.checking")}
      </div>
    );
  }

  const { checks } = readiness;
  const offered = checks.curricula;

  // A curriculum below the quiz minimum still works -- the paper is filled by
  // borrowing from other countries -- so it is a warning rather than a blocker,
  // and it is stated that way instead of being hidden.
  const thinCurricula = offered.filter((c) => c.questionCount < 6);

  const pending = suggestedCurricula.filter(
    (c) => !addedCurricula.includes(c) && !offered.some((o) => o.curriculum === c),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{countryName}</p>
          <p className="text-sm text-muted-foreground">
            {readiness.ready
              ? t("countries.onboarding.readyNow")
              : t("countries.onboarding.stepsLeft", { count: readiness.blockers.length })}
          </p>
        </div>
        {readiness.ready ? (
          <Badge className="bg-green-600 hover:bg-green-600 shrink-0">
            <CheckCircle2 className="w-3 h-3 me-1" />
            {t("countries.onboarding.ready")}
          </Badge>
        ) : (
          <Badge variant="destructive" className="shrink-0">
            <AlertTriangle className="w-3 h-3 me-1" />
            {t("countries.onboarding.notReady")}
          </Badge>
        )}
      </div>

      <div className="rounded-lg border px-4">
        <StepRow
          state="done"
          title={t("countries.onboarding.stepCreated")}
          detail={t("countries.onboarding.stepCreatedDesc", { id: countryId })}
        />

        <StepRow
          state={checks.hasVision ? "done" : "todo"}
          title={t("countries.onboarding.stepVision")}
          detail={
            checks.hasVision
              ? t("countries.onboarding.stepVisionDone")
              : t("countries.onboarding.stepVisionTodo")
          }
          action={
            checks.hasVision ? undefined : (
              <Button
                size="sm" variant="outline"
                onClick={() => sectorMutation.mutate()}
                disabled={sectorMutation.isPending}
                data-testid="button-onboarding-research"
              >
                {sectorMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><Sparkles className="w-4 h-4 me-1" />{t("countries.onboarding.research")}</>}
              </Button>
            )
          }
        />

        <StepRow
          state={checks.hasCurricula ? "done" : "todo"}
          title={t("countries.onboarding.stepCurricula")}
          detail={
            offered.length
              ? offered.map((c) => `${c.curriculum} (${c.subjectCount})`).join(", ")
              : t("countries.onboarding.stepCurriculaTodo")
          }
        />

        {/* The sector map is the step that is both invisible and decisive: with
            no rows every career scores identically for national-vision
            alignment, so a report comes out looking complete while saying
            nothing about the country. */}
        <StepRow
          state={checks.sectorMapRows > 0 ? "done" : "todo"}
          title={t("countries.onboarding.stepSectorMap")}
          detail={
            checks.sectorMapRows > 0
              ? t("countries.onboarding.stepSectorMapDone", { count: checks.sectorMapRows })
              : t("countries.onboarding.stepSectorMapTodo")
          }
          action={
            checks.sectorMapRows > 0 ? undefined : (
              <Button
                size="sm"
                onClick={() => sectorMutation.mutate()}
                disabled={sectorMutation.isPending}
                data-testid="button-onboarding-sectors"
              >
                {sectorMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <><RefreshCw className="w-4 h-4 me-1" />{t("countries.onboarding.generate")}</>}
              </Button>
            )
          }
        />

        {/* NOT GREEN WHEN THERE ARE NO CURRICULA.
            "every offered curriculum has enough questions" is vacuously true
            of a country offering none, and the first render of this panel duly
            showed a tick beside an empty question bank -- a country with
            nothing in it reporting one step complete. A step cannot be done
            before the thing it measures exists. */}
        <StepRow
          state={offered.length === 0 ? "todo" : thinCurricula.length === 0 ? "done" : "warn"}
          title={t("countries.onboarding.stepQuestions")}
          detail={
            offered.length === 0
              ? t("countries.onboarding.stepQuestionsNoCurricula")
              : thinCurricula.length === 0
                ? t("countries.onboarding.stepQuestionsDone")
                : t("countries.onboarding.stepQuestionsThin", {
                    list: thinCurricula.map((c) => `${c.curriculum} (${c.questionCount})`).join(", "),
                  })
          }
        />
      </div>

      {/* Blockers in full, because "not ready" without the reason sends the
          superadmin back to guessing across tabs, which is the problem this
          panel exists to remove. */}
      {readiness.blockers.length > 0 && (
        <ul className="text-sm text-destructive space-y-1 list-disc ps-5">
          {readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}

      {pending.length > 0 && (
        <div className="rounded-lg border border-dashed p-4 space-y-2">
          <p className="text-sm font-medium">{t("countries.onboarding.alsoTaught")}</p>
          <p className="text-sm text-muted-foreground">
            {t("countries.onboarding.alsoTaughtDesc")}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {pending.map((c) => (
              <Button
                key={c} size="sm" variant="outline"
                onClick={() => addCurriculumMutation.mutate(c)}
                disabled={addCurriculumMutation.isPending}
                data-testid={`button-onboarding-add-${c}`}
              >
                {t("countries.onboarding.addCurriculum", { curriculum: c })}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onDone} data-testid="button-onboarding-later">
          {t("countries.onboarding.finishLater")}
        </Button>
        <Button onClick={onDone} disabled={!readiness.ready} data-testid="button-onboarding-done">
          {t("countries.onboarding.done")}
          <ArrowRight className="w-4 h-4 ms-1" />
        </Button>
      </div>
    </div>
  );
}
