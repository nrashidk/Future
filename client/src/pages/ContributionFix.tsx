/**
 * FIX A "NEEDS CHANGES" SUBMISSION AND SEND IT BACK (owner, 2026-11-15).
 *
 * The same submission is edited in place; the automatic check runs again and
 * a fix does not count toward the school's daily limit — both decided on the
 * server (POST /api/contributions/:id/resubmit). Subject and grade stay as
 * they were: changing them would make it a different submission.
 */
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { SchoolAdminOnly } from "@/components/SchoolAdminOnly";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useContributionFeedback, errorBody, type ContributionQuestion } from "@/components/contributions/feedback";
import { subjectCodeLabel } from "@shared/subjects";
import { ArrowLeft, Send, Trash2 } from "lucide-react";

interface Draft extends Omit<ContributionQuestion, "correctAnswer"> {
  correctIndex: number;
}

const toDraft = (q: ContributionQuestion): Draft => ({
  ...q,
  explanation: q.explanation ?? "",
  options: [0, 1, 2, 3].map((i) => q.options?.[i] ?? ""),
  correctIndex: Math.max(0, (q.options ?? []).indexOf(q.correctAnswer)),
});

/** The server's own rules (contribution.routes.ts questionSchema), checked first. */
function draftProblem(d: Draft): boolean {
  return d.question.trim().length < 10 || d.options.some((o) => !o.trim()) || d.topic.trim().length < 2;
}

function FixPage() {
  const { t, i18n } = useTranslation("admin");
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useContributionFeedback(id);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  useEffect(() => { document.title = t("contributions.fixTitle"); }, [t]);
  useEffect(() => { if (data && !drafts) setDrafts(data.questions.map(toDraft)); }, [data, drafts]);

  const send = useMutation({
    mutationFn: async () => {
      const questions = drafts!.map(({ correctIndex, ...d }) => ({
        ...d,
        question: d.question.trim(),
        options: d.options.map((o) => o.trim()),
        correctAnswer: d.options[correctIndex].trim(),
        topic: d.topic.trim(),
        explanation: d.explanation?.trim() || undefined,
      }));
      return (await apiRequest("POST", `/api/contributions/${id}/resubmit`, { questions })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contributions/submissions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contributions/balance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contributions", id ?? "", "feedback"] });
      toast({ title: t("contributions.fixSentTitle"), description: t("contributions.fixSentDesc") });
      navigate("/admin/organizations");
    },
    onError: (e) => {
      const body = errorBody(e);
      const dup = Array.isArray(body?.duplicateIndices) ? body.duplicateIndices[0] : undefined;
      const description = body?.error === "NOT_WAITING_FOR_CHANGES"
        ? t("contributions.fixNotWaiting")
        : typeof dup === "number"
          ? t("contributions.fixDuplicate", { n: dup + 1 })
          : t("contributions.fixInvalid");
      toast({ title: t("contributions.fixFailed"), description, variant: "destructive" });
    },
  });

  const back = (
    <Link href={`/my-school/contributions/${id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-back-to-feedback">
      <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("contributions.fixBackToFeedback")}
    </Link>
  );

  if (isLoading || (data && !drafts)) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-muted-foreground">{t("contributions.loadingSubmissions")}</div>;
  }
  if (isError || !data || !drafts) {
    return <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">{back}<p>{t("contributions.fbNotFound")}</p></div>;
  }
  if (data.status !== "needs_changes") {
    return <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">{back}<p data-testid="text-not-waiting">{t("contributions.fixNotWaiting")}</p></div>;
  }

  const update = (i: number, patch: Partial<Draft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const notesFor = (i: number) => data.checkNotes.filter((n) => n.questionIndex === i).flatMap((n) => n.issues);
  const anyProblem = drafts.some(draftProblem);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6" data-testid="page-contribution-fix">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {back}
          <h1 className="text-2xl font-bold">{t("contributions.fixTitle")}</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md border px-3 py-1.5">{t("contributions.forSchoolCurriculum", { curriculum: data.curriculum })}</span>
          <span className="rounded-md border px-3 py-1.5">{subjectCodeLabel(data.subject, i18n.language)} · {t("contributions.gradeN", { n: data.grade })}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="space-y-4" style={{ flex: "999 1 520px", minWidth: 0 }}>
          {drafts.map((d, i) => (
            <Card key={i} className={notesFor(i).length ? "border-amber-400" : ""} data-testid={`card-fix-question-${i}`}>
              <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">{t("contributions.fixQuestionN", { n: i + 1 })}</CardTitle>
                {drafts.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} data-testid={`button-fix-remove-${i}`}>
                    <Trash2 className="w-4 h-4 me-1" />{t("contributions.fixRemove")}
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {notesFor(i).length > 0 && (
                  <ul className="list-disc ps-5 text-sm text-amber-800 dark:text-amber-300 space-y-1">
                    {notesFor(i).map((n, k) => <li key={k} dir="auto">{n}</li>)}
                  </ul>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor={`fix-q-${i}`}>{t("contributions.questionLabel")}</Label>
                  <Textarea id={`fix-q-${i}`} value={d.question} onChange={(e) => update(i, { question: e.target.value })} data-testid={`input-fix-question-${i}`} />
                </div>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium mb-1">{t("contributions.fixOptionsLegend")}</legend>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {d.options.map((o, j) => (
                      <label key={j} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${d.correctIndex === j ? "border-primary bg-primary/5" : ""}`}>
                        <input type="radio" name={`correct-${i}`} checked={d.correctIndex === j} onChange={() => update(i, { correctIndex: j })} aria-label={t("contributions.fixMarkCorrect")} data-testid={`radio-fix-correct-${i}-${j}`} />
                        <span className="text-sm font-medium">{String.fromCharCode(65 + j)}</span>
                        <Input value={o} onChange={(e) => update(i, { options: d.options.map((x, k) => (k === j ? e.target.value : x)) })} className="border-0 shadow-none focus-visible:ring-0 h-8 px-1" aria-label={t("contributions.option", { n: String.fromCharCode(65 + j) })} data-testid={`input-fix-option-${i}-${j}`} />
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`fix-topic-${i}`}>{t("contributions.topicLabel")}</Label>
                    <Input id={`fix-topic-${i}`} value={d.topic} onChange={(e) => update(i, { topic: e.target.value })} data-testid={`input-fix-topic-${i}`} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`fix-exp-${i}`}>{t("contributions.explanationLabel")}</Label>
                    <Textarea id={`fix-exp-${i}`} value={d.explanation ?? ""} onChange={(e) => update(i, { explanation: e.target.value })} className="min-h-[40px]" data-testid={`input-fix-explanation-${i}`} />
                  </div>
                </div>
                {draftProblem(d) && <p className="text-sm text-destructive">{t("contributions.fixInvalid")}</p>}
              </CardContent>
            </Card>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground max-w-xl">{t("contributions.fixNote")}</p>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link href={`/my-school/contributions/${id}`}>{t("contributions.cancel")}</Link></Button>
              <Button onClick={() => send.mutate()} disabled={anyProblem || send.isPending} data-testid="button-fix-send">
                <Send className="w-4 h-4 me-2" />{send.isPending ? t("contributions.fixSending") : t("contributions.fixSendBtn")}
              </Button>
            </div>
          </div>
        </div>

        <aside className="rounded-lg border p-4 space-y-2" style={{ flex: "1 1 260px" }} data-testid="aside-what-to-fix">
          <h2 className="text-sm font-semibold">{t("contributions.fixWhatToFix")}</h2>
          <p className="text-sm whitespace-pre-line" dir="auto">{data.reviewerNote || t("contributions.fbNoReviewerNote")}</p>
        </aside>
      </div>
    </div>
  );
}

export default function ContributionFix() {
  return (
    <SchoolAdminOnly>
      <PageLayout>
        <FixPage />
      </PageLayout>
    </SchoolAdminOnly>
  );
}
