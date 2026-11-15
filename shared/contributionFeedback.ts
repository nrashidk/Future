/**
 * WHAT THE AUTHOR NEEDS TO FIX IT (owner, 2026-11-15).
 *
 * Until now this route returned peer comments only, so a "Needs changes"
 * from a superadmin -- the note that says what to change -- reached the
 * school nowhere: the list did carry it as `reviewFeedback`, and the screen
 * looked for `reviewerFeedback`.
 *
 * The automatic check's notes go to the author WITHOUT its scores (owner's
 * decision): a number invites arguing over the mark instead of fixing the
 * question. Only the `issues` strings leave the server, indexed to the
 * question they are about, and only for a check that actually ran.
 */
export function authorFeedbackDetail(submission: {
  subject: string; grade: number; curriculum: string; countryId: string;
  questions: unknown; reviewFeedback: string | null; reviewedAt: Date | null;
  llmVerificationStatus: string | null; llmVerificationFeedback: unknown; createdAt: Date | null;
}) {
  const ran = submission.llmVerificationStatus === "verified" || submission.llmVerificationStatus === "failed";
  const raw = ran && Array.isArray(submission.llmVerificationFeedback) ? submission.llmVerificationFeedback : [];
  const checkNotes = raw
    .map((f: any) => ({
      // The model numbers questions from 1; the editor indexes from 0.
      questionIndex: Number.isInteger(f?.index) ? f.index - 1 : null,
      issues: Array.isArray(f?.issues) ? f.issues.filter((x: unknown) => typeof x === "string").slice(0, 10) : [],
    }))
    .filter((f) => f.questionIndex !== null && f.issues.length > 0);
  return {
    subject: submission.subject,
    grade: submission.grade,
    curriculum: submission.curriculum,
    countryId: submission.countryId,
    submittedAt: submission.createdAt,
    questions: submission.questions,
    reviewerNote: submission.reviewFeedback ?? null,
    reviewedAt: submission.reviewedAt ?? null,
    checkNotes,
  };
}
