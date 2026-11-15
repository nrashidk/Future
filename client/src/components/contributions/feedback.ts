import { useQuery } from "@tanstack/react-query";

export interface ContributionQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "knowledge" | "comprehension" | "application" | "analysis";
}

/** What GET /api/contributions/:id/feedback answers (shared/contributionFeedback.ts). */
export interface ContributionFeedback {
  status: string;
  discarded: boolean;
  reviews: Array<{ vote: string; comment: string | null; createdAt: string }>;
  subject: string;
  grade: number;
  curriculum: string;
  submittedAt: string | null;
  questions: ContributionQuestion[];
  reviewerNote: string | null;
  reviewedAt: string | null;
  checkNotes: Array<{ questionIndex: number; issues: string[] }>;
}

export function useContributionFeedback(id: string | undefined) {
  return useQuery<ContributionFeedback>({
    queryKey: ["/api/contributions", id ?? "", "feedback"],
    enabled: !!id,
  });
}

/** The JSON body of an error thrown by apiRequest ("<status>: <body>"). */
export function errorBody(error: unknown): any {
  if (!(error instanceof Error)) return null;
  const m = error.message.match(/^\d{3}: ([\s\S]*)$/);
  try { return JSON.parse(m ? m[1] : error.message); } catch { return null; }
}
