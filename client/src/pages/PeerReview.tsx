/**
 * REVIEW ANOTHER SCHOOL'S QUESTIONS (owner, 2026-11-15).
 *
 * The routes behind this (`/api/contributions/review-queue`, `/review/:id`)
 * were built and tested and nothing called them, so no school could vote and
 * every passing submission waited at `peer_review` for a superadmin.
 *
 * What the server already guarantees, and this page only displays: never the
 * school's own work, only its own country AND curriculum, the author never
 * named, one vote per school. Approve or Reject only (owner's decision: no
 * "Needs changes" from peers). A comment is required to reject, here in the
 * page; the route accepts a reject without one.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { SchoolAdminOnly } from "@/components/SchoolAdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorBody, type ContributionQuestion } from "@/components/contributions/feedback";
import { subjectCodeLabel } from "@shared/subjects";
import { ArrowLeft, CheckCircle } from "lucide-react";

export interface ReviewQueue {
  reviewsRequired: number;
  majority: number;
  submissions: Array<{
    id: string;
    subject: string;
    grade: number;
    curriculum: string;
    questions: ContributionQuestion[];
    totalQuestions: number;
    reviewsSoFar: number;
  }>;
}

export const REVIEW_QUEUE_KEY = ["/api/contributions/review-queue"];

function ReviewPage() {
  const { t, i18n } = useTranslation("admin");
  const { toast } = useToast();
  const { data, isLoading, isError } = useQuery<ReviewQueue>({ queryKey: REVIEW_QUEUE_KEY });
  const [vote, setVote] = useState<"approve" | "reject" | null>(null);
  const [comment, setComment] = useState("");
  useEffect(() => { document.title = t("contributions.prPageTitle"); }, [t]);

  const current = data?.submissions[0];
  useEffect(() => { setVote(null); setComment(""); }, [current?.id]);

  const submit = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/contributions/review/${current!.id}`, {
      vote, comment: comment.trim() || undefined,
    })).json(),
    onSuccess: (r: any) => {
      toast({ title: t("contributions.prRecorded"), description: r?.decided ? t("contributions.prDecided") : undefined });
      queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/contributions/balance"] });
    },
    onError: (e) => {
      const code = errorBody(e)?.error;
      toast({
        title: t("contributions.prFailed"),
        description: code === "ALREADY_REVIEWED" || code === "NOT_IN_REVIEW" ? t("contributions.prAlready") : undefined,
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: REVIEW_QUEUE_KEY });
    },
  });

  const back = (
    <Link href="/admin/organizations" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-back-to-school">
      <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("contributions.fbBackToSchool")}
    </Link>
  );

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-4 py-12 text-center text-muted-foreground">{t("contributions.loadingSubmissions")}</div>;
  }
  if (isError || !data) {
    return <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">{back}<p>{t("contributions.prNotSetUp")}</p></div>;
  }
  if (!current) {
    return <div className="max-w-5xl mx-auto px-4 py-8 space-y-4">{back}<p data-testid="text-nothing-to-review">{t("contributions.prAllDone")}</p></div>;
  }

  const rejectNeedsComment = vote === "reject" && !comment.trim();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6" data-testid="page-peer-review">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          {back}
          <h1 className="text-2xl font-bold">{t("contributions.prPageTitle")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="text-review-progress">
            {t("contributions.prWaitingCount", { n: data.submissions.length })} · {subjectCodeLabel(current.subject, i18n.language)} · {t("contributions.gradeN", { n: current.grade })} · {t("contributions.fbQuestionCount", { n: current.questions.length })}
          </p>
        </div>
        <span className="rounded-md bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-200 px-3 py-1.5 text-sm font-medium" data-testid="text-votes-so-far">
          {t("contributions.prVotesSoFar", { n: current.reviewsSoFar, required: data.reviewsRequired })}
        </span>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <div className="space-y-4" style={{ flex: "999 1 520px", minWidth: 0 }}>
          <p className="text-sm text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CheckCircle className="w-4 h-4" />{t("contributions.prPassedCheck")}</p>
          {current.questions.map((q, i) => (
            <Card key={i} data-testid={`card-review-question-${i}`}>
              <CardHeader className="pb-2">
                <CardDescription>{t("contributions.fixQuestionN", { n: i + 1 })} · <bdi>{q.topic}</bdi></CardDescription>
                <CardTitle className="text-base leading-snug"><bdi>{q.question}</bdi></CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="grid sm:grid-cols-2 gap-2 text-sm">
                  {q.options.map((o, j) => (
                    <li key={j} className={`rounded-md border px-3 py-2 flex justify-between gap-2 ${o === q.correctAnswer ? "border-green-600 bg-green-50 dark:bg-green-950/30" : ""}`}>
                      <span>{String.fromCharCode(65 + j)} · <bdi>{o}</bdi></span>
                      {o === q.correctAnswer && <span className="text-xs font-semibold text-green-700 dark:text-green-400">{t("contributions.fbCorrect")}</span>}
                    </li>
                  ))}
                </ol>
                {q.explanation && (
                  <p className="text-sm rounded-md bg-muted/50 px-3 py-2"><b>{t("contributions.prExplanation")}</b> <bdi>{q.explanation}</bdi></p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="rounded-lg border p-5 space-y-4" style={{ flex: "1 1 300px" }}>
          <h2 className="text-base font-semibold">{t("contributions.prYourVote")}</h2>
          <fieldset className="space-y-2">
            <legend className="text-sm text-muted-foreground mb-2">{t("contributions.prVoteQuestion", { grade: current.grade })}</legend>
            {(["approve", "reject"] as const).map((v) => (
              <label key={v} className={`flex gap-3 items-start rounded-md border p-3 cursor-pointer ${vote === v ? (v === "approve" ? "border-green-600 bg-green-50 dark:bg-green-950/30" : "border-red-600 bg-red-50 dark:bg-red-950/30") : ""}`}>
                <input type="radio" name="vote" className="mt-1" checked={vote === v} onChange={() => setVote(v)} data-testid={`radio-vote-${v}`} />
                <span className="text-sm">
                  <b>{v === "approve" ? t("contributions.prApprove") : t("contributions.prReject")}</b><br />
                  <span className="text-muted-foreground">{v === "approve" ? t("contributions.prApproveHint") : t("contributions.prRejectHint")}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="review-comment">{t("contributions.prComment")} <span className="font-normal text-muted-foreground">{t("contributions.prCommentHint")}</span></Label>
            <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={4} data-testid="input-review-comment" />
          </div>
          <Button className="w-full" onClick={() => submit.mutate()} disabled={!vote || rejectNeedsComment || submit.isPending} data-testid="button-submit-vote">
            {submit.isPending ? t("contributions.submitting") : t("contributions.prSubmit")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("contributions.prOneVote")} {t("contributions.reviewCreditNote", { required: data.reviewsRequired, majority: data.majority })}</p>
        </aside>
      </div>
    </div>
  );
}

export default function PeerReview() {
  return (
    <SchoolAdminOnly>
      <PageLayout>
        <ReviewPage />
      </PageLayout>
    </SchoolAdminOnly>
  );
}
