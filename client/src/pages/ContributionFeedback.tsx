/**
 * WHAT THE REVIEWERS SAID ABOUT ONE OF MY SCHOOL'S SUBMISSIONS
 * (a page, not a dialog — owner, 2026-11-15).
 *
 * Until now a school could see that a submission "Needs Changes" and nothing
 * else: the reviewer's note reached the browser under a name the screen did
 * not read, and nothing showed the automatic check's notes or other schools'
 * comments. The check's notes are shown WITHOUT its scores (owner's
 * decision); the server never sends them.
 */
import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { PageLayout } from "@/components/layout/PageLayout";
import { SchoolAdminOnly } from "@/components/SchoolAdminOnly";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { makeStatusBadge } from "@/components/admin/ContributeQuestions";
import { useContributionFeedback } from "@/components/contributions/feedback";
import { subjectCodeLabel } from "@shared/subjects";
import { fmtDate } from "@/lib/formatDate";
import { ArrowLeft, CheckCircle, Pencil } from "lucide-react";

function FeedbackPage() {
  const { t, i18n } = useTranslation("admin");
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useContributionFeedback(id);
  useEffect(() => { document.title = t("contributions.fbPageTitle"); }, [t]);

  const back = (
    <Link href="/admin/organizations" className="inline-flex items-center gap-1 text-sm text-primary hover:underline" data-testid="link-back-to-school">
      <ArrowLeft className="w-4 h-4 rtl:rotate-180" /> {t("contributions.fbBackToSchool")}
    </Link>
  );

  if (isLoading) {
    return <div className="max-w-4xl mx-auto px-4 py-12 text-center text-muted-foreground">{t("contributions.loadingSubmissions")}</div>;
  }
  if (isError || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
        {back}
        <p data-testid="text-feedback-not-found">{t("contributions.fbNotFound")}</p>
      </div>
    );
  }

  const notesFor = (i: number) => data.checkNotes.filter((n) => n.questionIndex === i).flatMap((n) => n.issues);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6" data-testid="page-contribution-feedback">
      {back}

      <div className="space-y-2">
        <div>{makeStatusBadge(data.status, t)}</div>
        <h1 className="text-2xl font-bold" data-testid="text-feedback-title">
          {subjectCodeLabel(data.subject, i18n.language)} · {t("contributions.gradeN", { n: data.grade })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("contributions.fbQuestionCount", { n: data.questions.length })}
          {data.submittedAt && <> · {t("contributions.fbSubmittedOn", { date: fmtDate(data.submittedAt) })}</>}
        </p>
        {data.status === "needs_changes" && <p className="text-sm">{t("contributions.fbNeedsChangesIntro")}</p>}
        {data.discarded && <p className="text-sm">{t("contributions.fbRejectedIntro")}</p>}
      </div>

      <Card className="bg-muted/40" data-testid="card-reviewer-note">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("contributions.fbReviewerNote")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-line" dir="auto">{data.reviewerNote || t("contributions.fbNoReviewerNote")}</p>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t("contributions.fbQuestionByQuestion")}</h2>
          {data.checkNotes.length > 0 && <p className="text-xs text-muted-foreground">{t("contributions.fbCheckNotesSource")}</p>}
        </div>
        {data.questions.map((q, i) => {
          const notes = notesFor(i);
          return (
            <Card key={i} data-testid={`card-feedback-question-${i}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base"><bdi>{i + 1}.</bdi> <bdi>{q.question}</bdi></CardTitle>
                <CardDescription dir="auto">{q.topic}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ol className="grid sm:grid-cols-2 gap-2 text-sm">
                  {q.options.map((o, j) => (
                    <li key={j} className={`rounded-md border px-3 py-2 flex justify-between gap-2 ${o === q.correctAnswer ? "border-green-600 bg-green-50 dark:bg-green-950/30" : ""}`}>
                      <span>{String.fromCharCode(65 + j)} · <bdi>{o}</bdi></span>
                      {o === q.correctAnswer && <span className="text-xs font-semibold text-green-700 dark:text-green-400 inline-flex items-center gap-1"><CheckCircle className="w-3 h-3" />{t("contributions.fbCorrect")}</span>}
                    </li>
                  ))}
                </ol>
                {notes.length > 0 ? (
                  <ul className="list-disc ps-5 text-sm space-y-1" data-testid={`list-check-notes-${i}`}>
                    {notes.map((n, k) => <li key={k} dir="auto">{n}</li>)}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("contributions.fbNoNotesForQuestion")}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t("contributions.fbPeerComments")}</h2>
        {data.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("contributions.fbNoPeerComments")}</p>
        ) : (
          <ul className="space-y-2">
            {data.reviews.map((r, i) => (
              <li key={i} className="rounded-md border p-3 text-sm">
                <span className="font-medium">{t("contributions.fbReviewerN", { n: i + 1 })}</span>
                {" · "}
                {r.vote === "approve" ? t("contributions.fbVoteApprove") : t("contributions.fbVoteReject")}
                {r.comment && <p className="mt-1 whitespace-pre-line" dir="auto">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.status === "needs_changes" && (
        <div className="flex justify-end">
          <Button asChild data-testid="button-fix-submission">
            <Link href={`/my-school/contributions/${id}/fix`}><Pencil className="w-4 h-4 me-2" />{t("contributions.fbFixBtn")}</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ContributionFeedback() {
  return (
    <SchoolAdminOnly>
      <PageLayout>
        <FeedbackPage />
      </PageLayout>
    </SchoolAdminOnly>
  );
}
