import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, serverErrorMessage } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { StickyNote } from "@/components/StickyNote";
import { Input } from "@/components/ui/input";
import { 
  ClipboardCheck, Eye, CheckCircle, XCircle, AlertCircle, 
  Clock, Building2, User, Calendar, MessageSquare,
  ChevronRight, ChevronDown, GraduationCap, HelpCircle, Settings, Save, X, RefreshCw
} from "lucide-react";

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "knowledge" | "comprehension" | "application" | "analysis";
}

interface LlmQuestionFeedback {
  index: number;
  isValid: boolean;
  score: number;
  issues: string[];
}

interface Submission {
  id: string;
  organizationId: string;
  organizationName?: string;
  submittedByUserId: string;
  submittedByName?: string;
  countryId: string;
  countryName?: string;
  curriculum: string;
  subject: string;
  grade: number;
  questions: Question[];
  /**
   * `pending` and `peer_review` are the two the server actually produces for a
   * submission awaiting a decision. `llm_verified` and `in_review` are kept
   * for rows written before peer review existed; nothing writes them now.
   */
  status: "pending" | "peer_review" | "llm_verified" | "in_review" | "approved" | "rejected" | "needs_changes";
  /** The server's name for the count. This screen used to read
   *  `questionCount`, which the server never sent, so the column was blank. */
  totalQuestions?: number;
  /** Same story: the server sends `submitterName`. */
  submitterName?: string;
  questionCount?: number;
  approvedCount: number;
  creditsAwarded: number;
  reviewerFeedback?: string;
  reviewedByUserId?: string;
  createdAt: string;
  reviewedAt?: string;
  // LLM verification fields
  /** "unavailable" means the automatic check did not run -- no usable
   *  Anthropic credential, an API error, or an exception. Distinct from
   *  "failed", which means it ran and rejected the questions. */
  llmVerificationStatus?: "pending" | "verified" | "failed" | "unavailable";
  llmVerificationScore?: number;
  llmVerificationFeedback?: LlmQuestionFeedback[];
  llmVerifiedAt?: string;
  rewardAllocated?: boolean;
}

interface OrganizationWithPendingRewards {
  id: string;
  name: string;
  pendingRewardCredits: number;
  rewardCredits: number;
  yearlyContributionCount: number;
}

interface ReviewStats {
  totalPending: number;
  totalInReview: number;
  totalApproved: number;
  totalRejected: number;
  avgReviewTime: number;
}

interface RewardSettings {
  maxYearlyCredits: number;
  questionsPerCredit: number;
  maxQuestionsPerSubmission: number;
  maxSubmissionsPerDay: number;
}

/** Mirrors RECHECK_STALE_MS on the server: a check with no result for this
 *  long is not coming -- the process restarted under it. */
const RECHECK_STALE_MS = 10 * 60 * 1000;

/**
 * Whether to OFFER a re-run of the automatic check. Only for a submission
 * still awaiting review whose check did not run, or never reported. A check
 * that ran and gave a verdict is not offered: re-rolling a verdict is not a
 * retry, and the server refuses it.
 */
function canRecheck(sub: Submission): boolean {
  if (sub.status !== "pending") return false;
  if (sub.llmVerificationStatus === "unavailable") return true;
  return sub.llmVerificationStatus === "pending" && !sub.llmVerifiedAt
    && Date.now() - new Date(sub.createdAt).getTime() > RECHECK_STALE_MS;
}

/**
 * A submission awaiting a decision can be reviewed by a superadmin, whatever
 * stage it is at. The server has always accepted a decision on all four; the
 * screen only offered it for the two legacy statuses nothing writes any more,
 * so no submission could be reviewed from here at all.
 */
const REVIEWABLE: ReadonlyArray<Submission["status"]> = ["pending", "peer_review", "llm_verified", "in_review"];

function makeStatusBadge(sub: Submission, t: (key: string) => string) {
  switch (sub.status) {
    case "pending":
      // Three different things share the status `pending`, and they need
      // different actions: re-run the check, wait, or review by hand.
      if (sub.llmVerificationStatus === "unavailable") {
        return <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200"><AlertCircle className="w-3 h-3 me-1" />{t('contributions.notChecked')}</Badge>;
      }
      if (sub.llmVerificationStatus === "verified" || sub.llmVerificationStatus === "failed") {
        return <Badge variant="secondary"><Clock className="w-3 h-3 me-1" />{t('contributions.awaitingManualReview')}</Badge>;
      }
      return <Badge variant="secondary"><Clock className="w-3 h-3 me-1" />{t('contributions.pendingLlm')}</Badge>;
    case "peer_review":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><User className="w-3 h-3 me-1" />{t('contributions.peerReview')}</Badge>;
    case "llm_verified":
      return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200"><CheckCircle className="w-3 h-3 me-1" />{t('contributions.llmVerified')}</Badge>;
    case "in_review":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><HelpCircle className="w-3 h-3 me-1" />{t('contributions.reviewInReview')}</Badge>;
    case "approved":
      return <Badge className="bg-green-500"><CheckCircle className="w-3 h-3 me-1" />{t('contributions.reviewApproved')}</Badge>;
    case "rejected":
      return <Badge variant="destructive"><XCircle className="w-3 h-3 me-1" />{t('contributions.reviewRejected')}</Badge>;
    case "needs_changes":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><AlertCircle className="w-3 h-3 me-1" />{t('contributions.reviewNeedsChanges')}</Badge>;
    default:
      return <Badge variant="secondary">{sub.status}</Badge>;
  }
}

/**
 * A score is shown ONLY when the check ran. A check that did not run stores a
 * score of 0 so that it cannot clear the routing threshold -- and rendering
 * that as "LLM Score: 0%" tells a superadmin the questions were read and
 * found worthless, which is the exact claim "unavailable" exists to avoid.
 */
function makeLlmScoreBadge(sub: Submission, t: (key: string, opts?: any) => string) {
  const ran = sub.llmVerificationStatus === "verified" || sub.llmVerificationStatus === "failed";
  const score = sub.llmVerificationScore;
  if (!ran || typeof score !== "number") return null;
  const color = score >= 80 ? "bg-green-100 text-green-800" : score >= 50 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return <Badge variant="outline" className={color}>{t('contributions.llmScore', { score })}</Badge>;
}

function QuestionCard({ question, index, isSelected, onToggle }: { 
  question: Question; 
  index: number; 
  isSelected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation('admin');

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Checkbox 
          checked={isSelected} 
          onCheckedChange={onToggle}
          data-testid={`checkbox-question-${index}`}
        />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-muted-foreground">Q{index + 1}</span>
            <Badge variant="outline" className="text-xs">{question.topic}</Badge>
            <Badge variant="secondary" className="text-xs capitalize">{question.difficulty}</Badge>
            <Badge variant="secondary" className="text-xs">{question.cognitiveLevel}</Badge>
          </div>
          <p className="font-medium">{question.question}</p>
          
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 p-0 h-auto text-primary"
            onClick={() => setExpanded(!expanded)}
            data-testid={`button-expand-question-${index}`}
          >
            {expanded ? <ChevronDown className="w-4 h-4 me-1" /> : <ChevronRight className="w-4 h-4 me-1" />}
            {expanded ? t('contributions.hideDetails') : t('contributions.showDetails')}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="ms-7 space-y-3 border-s-2 ps-4">
          <div>
            <p className="text-sm text-muted-foreground mb-2">{t('contributions.colOptions')}</p>
            <div className="space-y-1">
              {question.options.map((opt, i) => (
                <div 
                  key={i} 
                  className={`text-sm p-2 rounded ${opt === question.correctAnswer ? 'bg-green-100 text-green-800 font-medium' : 'bg-muted'}`}
                >
                  {String.fromCharCode(65 + i)}. {opt}
                  {opt === question.correctAnswer && <CheckCircle className="w-3 h-3 inline ml-2" />}
                </div>
              ))}
            </div>
          </div>
          {question.explanation && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">{t('contributions.explanationLabel')}</p>
              <p className="text-sm bg-blue-50 p-2 rounded">{question.explanation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContributionReviewQueue() {
  const { toast } = useToast();
  const { t } = useTranslation('admin');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [allocatingOrgId, setAllocatingOrgId] = useState<string | null>(null);
  const [creditsToAllocate, setCreditsToAllocate] = useState<number>(0);
  const [editingMaxCredits, setEditingMaxCredits] = useState(false);
  const [newMaxCredits, setNewMaxCredits] = useState<number>(50);

  const { data: submissions = [], isLoading } = useQuery<Submission[]>({
    queryKey: ['/api/contributions/admin/pending'],
  });

  const { data: stats } = useQuery<ReviewStats>({
    queryKey: ['/api/contributions/admin/stats'],
  });

  const { data: pendingRewardsOrgs = [] } = useQuery<OrganizationWithPendingRewards[]>({
    queryKey: ['/api/contributions/admin/pending-rewards'],
  });

  const { data: settings } = useQuery<RewardSettings>({
    queryKey: ['/api/contributions/admin/settings'],
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (maxYearlyCredits: number) => {
      return apiRequest('POST', '/api/contributions/admin/settings', {
        maxYearlyCredits,
      });
    },
    onSuccess: (data: any) => {
      toast({ 
        title: t('contributions.maxCreditsUpdated'), 
        description: data.message || t('contributions.maxCreditsUpdated'),
      });
      setEditingMaxCredits(false);
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/settings'] });
    },
    onError: (error: any) => {
      toast({ title: t('contributions.updateFailed'), description: error.message, variant: "destructive" });
    },
  });

  const allocateRewardMutation = useMutation({
    mutationFn: async ({ orgId, credits }: { orgId: string; credits: number }) => {
      return apiRequest('POST', `/api/contributions/admin/org/${orgId}/allocate-reward`, {
        credits,
        isRewardCredits: true,
      });
    },
    onSuccess: (data: any) => {
      toast({ 
        title: t('contributions.allocated'), 
        description: data.message || t('contributions.allocatedDesc'),
      });
      setAllocatingOrgId(null);
      setCreditsToAllocate(0);
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/pending-rewards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/organizations'] });
    },
    onError: (error: any) => {
      toast({ title: t('contributions.allocationFailed'), description: error.message, variant: "destructive" });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      return apiRequest('POST', `/api/contributions/admin/${submissionId}/claim`);
    },
    onSuccess: () => {
      toast({ title: t('contributions.claimSuccess'), description: t('contributions.claimSuccessDesc') });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/pending-rewards'] });
    },
    onError: (error: any) => {
      toast({ title: t('contributions.updateFailed'), description: error.message, variant: "destructive" });
    },
  });

  /**
   * Re-runs the automatic check on a submission it never read. The server
   * decides whether the submission qualifies; `canRecheck` below only decides
   * whether to OFFER it, so a stale screen gets a refusal and not a wrong
   * result.
   */
  const recheckMutation = useMutation({
    mutationFn: async (submissionId: string) => {
      const res = await apiRequest('POST', `/api/contributions/admin/${submissionId}/recheck`);
      return res.json();
    },
    onSuccess: (data: { llmVerificationScore?: number }) => {
      toast({
        title: t('contributions.recheckDone'),
        description: t('contributions.recheckDoneDesc', { score: data?.llmVerificationScore ?? 0 }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/pending'] });
      // The tiles too: a check that passes moves the submission from Pending
      // to In Review, and the tiles went on saying "Pending 2 / In Review 0"
      // over a row marked Peer review.
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/stats'] });
    },
    onError: (error: unknown) => {
      toast({
        title: t('contributions.recheckFailed'),
        // The server's sentence carries the reason (no credential, a refused
        // key, a bad reply); the generic line is the fallback.
        description: serverErrorMessage(error) ?? t('contributions.recheckFailedDesc'),
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/stats'] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ submissionId, status, feedback, approvedQuestionIds }: { 
      submissionId: string; 
      status: "approved" | "rejected" | "needs_changes";
      feedback?: string;
      approvedQuestionIds?: number[];
    }) => {
      return apiRequest('POST', `/api/contributions/admin/${submissionId}/review`, {
        status,
        feedback,
        approvedQuestionIds,
      });
    },
    onSuccess: () => {
      toast({ title: t('contributions.reviewComplete'), description: t('contributions.reviewCompleteDesc') });
      setIsReviewDialogOpen(false);
      setSelectedSubmission(null);
      setSelectedQuestions(new Set());
      setFeedback("");
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/pending'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contributions/admin/stats'] });
    },
    onError: (error: any) => {
      toast({ title: t('contributions.updateFailed'), description: error.message, variant: "destructive" });
    },
  });

  const openReviewDialog = (submission: Submission) => {
    setSelectedSubmission(submission);
    setSelectedQuestions(new Set(submission.questions.map((_, i) => i)));
    setFeedback("");
    setIsReviewDialogOpen(true);
  };

  const toggleQuestion = (index: number) => {
    const newSelected = new Set(selectedQuestions);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedQuestions(newSelected);
  };

  const selectAllQuestions = () => {
    if (selectedSubmission) {
      setSelectedQuestions(new Set(selectedSubmission.questions.map((_, i) => i)));
    }
  };

  const deselectAllQuestions = () => {
    setSelectedQuestions(new Set());
  };

  const handleApprove = () => {
    if (!selectedSubmission) return;
    reviewMutation.mutate({
      submissionId: selectedSubmission.id,
      status: "approved",
      feedback: feedback || undefined,
      approvedQuestionIds: Array.from(selectedQuestions),
    });
  };

  const handleReject = () => {
    if (!selectedSubmission) return;
    if (!feedback.trim()) {
      toast({ title: t('contributions.feedbackRequired'), description: t('contributions.feedbackRequiredDesc'), variant: "destructive" });
      return;
    }
    reviewMutation.mutate({
      submissionId: selectedSubmission.id,
      status: "rejected",
      feedback,
    });
  };

  const handleNeedsChanges = () => {
    if (!selectedSubmission) return;
    if (!feedback.trim()) {
      toast({ title: t('contributions.feedbackRequired'), description: t('contributions.changesRequiredDesc'), variant: "destructive" });
      return;
    }
    reviewMutation.mutate({
      submissionId: selectedSubmission.id,
      status: "needs_changes",
      feedback,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StickyNote color="yellow" rotation="1" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-muted-foreground">{t('contributions.pendingReview')}</span>
          </div>
          <p className="text-3xl font-bold">{stats?.totalPending ?? 0}</p>
        </StickyNote>

        <StickyNote color="blue" rotation="-1" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <HelpCircle className="w-5 h-5 text-blue-600" />
            <span className="text-sm text-muted-foreground">{t('contributions.inReview')}</span>
          </div>
          <p className="text-3xl font-bold">{stats?.totalInReview ?? 0}</p>
        </StickyNote>

        <StickyNote color="green" rotation="2" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-muted-foreground">{t('contributions.approved')}</span>
          </div>
          <p className="text-3xl font-bold">{stats?.totalApproved ?? 0}</p>
        </StickyNote>

        <StickyNote color="pink" rotation="-2" className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-5 h-5 text-pink-600" />
            <span className="text-sm text-muted-foreground">{t('contributions.rejected')}</span>
          </div>
          <p className="text-3xl font-bold">{stats?.totalRejected ?? 0}</p>
        </StickyNote>
      </div>

      {/* Reward Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5" />
              <div>
                <CardTitle className="text-lg">{t('contributions.rewardSettings')}</CardTitle>
                <CardDescription>{t('contributions.rewardSettingsDesc')}</CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('contributions.maxYearlyCredits')}</Label>
              {editingMaxCredits ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={newMaxCredits}
                    onChange={(e) => setNewMaxCredits(parseInt(e.target.value) || 50)}
                    className="w-24"
                    data-testid="input-max-yearly-credits"
                  />
                  <Button
                    size="sm"
                    onClick={() => updateSettingsMutation.mutate(newMaxCredits)}
                    disabled={updateSettingsMutation.isPending}
                    data-testid="button-save-max-credits"
                  >
                    <Save className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingMaxCredits(false);
                      setNewMaxCredits(settings?.maxYearlyCredits ?? 50);
                    }}
                    data-testid="button-cancel-edit-credits"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{settings?.maxYearlyCredits ?? 50}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewMaxCredits(settings?.maxYearlyCredits ?? 50);
                      setEditingMaxCredits(true);
                    }}
                    data-testid="button-edit-max-credits"
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('contributions.questionsPerCredit')}</Label>
              <p className="text-2xl font-bold">{settings?.questionsPerCredit ?? 5}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('contributions.maxQuestionsSubmission')}</Label>
              <p className="text-2xl font-bold">{settings?.maxQuestionsPerSubmission ?? 50}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('contributions.maxSubmissionsDay')}</Label>
              <p className="text-2xl font-bold">{settings?.maxSubmissionsPerDay ?? 3}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-6 h-6" />
            <div>
              <CardTitle>{t('contributions.adminTitle')}</CardTitle>
              <CardDescription>{t('contributions.adminDesc')}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-muted-foreground mt-2">{t('contributions.loadingSubmissions')}</p>
            </div>
          ) : submissions.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-muted-foreground">{t('contributions.noSubmissionsPending')}</p>
              <p className="text-sm text-muted-foreground">{t('contributions.allCaughtUp')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('contributions.schoolCol')}</TableHead>
                  <TableHead>{t('contributions.subjectLabel')}</TableHead>
                  <TableHead>{t('contributions.gradeLabel')}</TableHead>
                  <TableHead>{t('contributions.questionsLabel')}</TableHead>
                  <TableHead>{t('contributions.statusLabel')}</TableHead>
                  <TableHead>{t('contributions.submittedLabel')}</TableHead>
                  <TableHead className="text-right">{t('contributions.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map((sub) => (
                  <TableRow key={sub.id} data-testid={`row-review-${sub.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{sub.organizationName || sub.organizationId}</p>
                          <p className="text-xs text-muted-foreground">{sub.submitterName || sub.submittedByName || "—"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{sub.subject}</p>
                        <p className="text-xs text-muted-foreground">{sub.curriculum}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <GraduationCap className="w-3 h-3 me-1" />
                        {t('contributions.gradeN', { n: sub.grade })}
                      </Badge>
                    </TableCell>
                    <TableCell>{sub.totalQuestions ?? sub.questionCount ?? sub.questions?.length ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {makeStatusBadge(sub, t)}
                        {makeLlmScoreBadge(sub, t)}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {REVIEWABLE.includes(sub.status) && (
                          <Button
                            size="sm"
                            onClick={() => openReviewDialog(sub)}
                            data-testid={`button-review-${sub.id}`}
                          >
                            <Eye className="w-4 h-4 me-1" />
                            {t('contributions.reviewBtn')}
                          </Button>
                        )}
                        {canRecheck(sub) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => recheckMutation.mutate(sub.id)}
                            disabled={recheckMutation.isPending}
                            data-testid={`button-recheck-${sub.id}`}
                          >
                            <RefreshCw className="w-4 h-4 me-1" />
                            {t('contributions.recheckBtn')}
                          </Button>
                        )}
                        {sub.status === "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => claimMutation.mutate(sub.id)}
                            disabled={claimMutation.isPending}
                            data-testid={`button-claim-${sub.id}`}
                          >
                            <CheckCircle className="w-4 h-4 me-1" />
                            {t('contributions.claimBtn')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Rewards Section - Schools waiting for reward allocation */}
      {pendingRewardsOrgs.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-orange-500" />
              <div>
                <CardTitle className="flex items-center gap-2">
                  {t('contributions.pendingRewardTitle')}
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                    {t('contributions.pendingRewardSchools', { n: pendingRewardsOrgs.length })}
                  </Badge>
                </CardTitle>
                <CardDescription>{t('contributions.pendingRewardDesc')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('contributions.schoolCol')}</TableHead>
                  <TableHead>{t('contributions.colPendingCredits')}</TableHead>
                  <TableHead>{t('contributions.colCurrentCredits')}</TableHead>
                  <TableHead>{t('contributions.colYearUsed')}</TableHead>
                  <TableHead className="text-right">{t('contributions.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRewardsOrgs.map((org) => (
                  <TableRow key={org.id} data-testid={`row-pending-reward-${org.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{org.name}</span>
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          {t('contributions.pendingRewardBadge')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-bold text-orange-600">{org.pendingRewardCredits}</span>
                    </TableCell>
                    <TableCell>{org.rewardCredits || 0}</TableCell>
                    <TableCell>{org.yearlyContributionCount || 0} / 50</TableCell>
                    <TableCell className="text-right">
                      {allocatingOrgId === org.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            min="1"
                            max={Math.min(org.pendingRewardCredits, 50 - (org.yearlyContributionCount || 0))}
                            value={creditsToAllocate}
                            onChange={(e) => setCreditsToAllocate(parseInt(e.target.value) || 0)}
                            className="w-16 h-8 border rounded px-2 text-center"
                            data-testid={`input-credits-${org.id}`}
                          />
                          <Button
                            size="sm"
                            onClick={() => allocateRewardMutation.mutate({ orgId: org.id, credits: creditsToAllocate })}
                            disabled={allocateRewardMutation.isPending || creditsToAllocate < 1}
                            data-testid={`button-confirm-allocate-${org.id}`}
                          >
                            {t('contributions.confirm')}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setAllocatingOrgId(null); setCreditsToAllocate(0); }}
                            data-testid={`button-cancel-allocate-${org.id}`}
                          >
                            {t('contributions.cancel')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setAllocatingOrgId(org.id); setCreditsToAllocate(org.pendingRewardCredits); }}
                          data-testid={`button-allocate-${org.id}`}
                        >
                          {t('contributions.allocateCredits')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedSubmission && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ClipboardCheck className="w-5 h-5" />
                  {t('contributions.reviewTitle')}
                </DialogTitle>
                <DialogDescription>
                  {t('contributions.reviewDesc', { orgName: selectedSubmission.organizationName || selectedSubmission.organizationId })}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('contributions.subjectLabel')}</p>
                    <p className="font-medium">{selectedSubmission.subject}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('contributions.colCurriculum')}</p>
                    <p className="font-medium">{selectedSubmission.curriculum}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('contributions.gradeLabel')}</p>
                    <p className="font-medium">{t('contributions.gradeN', { n: selectedSubmission.grade })}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('contributions.colCountry')}</p>
                    <p className="font-medium">{selectedSubmission.countryName || selectedSubmission.countryId}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t('contributions.selectedOf', { selected: selectedQuestions.size, total: selectedSubmission.questions.length })}
                    </span>
                    <Button variant="ghost" size="sm" onClick={selectAllQuestions}>{t('contributions.selectAllBtn')}</Button>
                    <Button variant="ghost" size="sm" onClick={deselectAllQuestions}>{t('contributions.deselectAllBtn')}</Button>
                  </div>
                  <Badge variant="secondary">
                    {t('contributions.potentialCredits', { n: Math.floor(selectedQuestions.size / 5) })}
                  </Badge>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                  {selectedSubmission.questions.map((q, i) => (
                    <QuestionCard
                      key={i}
                      question={q}
                      index={i}
                      isSelected={selectedQuestions.has(i)}
                      onToggle={() => toggleQuestion(i)}
                    />
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>{t('contributions.reviewFeedbackLabel')}</Label>
                  <Textarea
                    placeholder={t('contributions.reviewFeedbackPlaceholder')}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="min-h-[100px]"
                    data-testid="input-review-feedback"
                  />
                </div>
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsReviewDialogOpen(false)}
                >
                  {t('contributions.cancel')}
                </Button>
                <Button 
                  variant="outline"
                  className="text-yellow-600 border-yellow-300"
                  onClick={handleNeedsChanges}
                  disabled={reviewMutation.isPending}
                  data-testid="button-needs-changes"
                >
                  <AlertCircle className="w-4 h-4 me-2" />
                  {t('contributions.needsChanges')}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleReject}
                  disabled={reviewMutation.isPending}
                  data-testid="button-reject"
                >
                  <XCircle className="w-4 h-4 me-2" />
                  {t('contributions.reject')}
                </Button>
                <Button 
                  className="bg-green-600"
                  onClick={handleApprove}
                  disabled={reviewMutation.isPending || selectedQuestions.size === 0}
                  data-testid="button-approve"
                >
                  <CheckCircle className="w-4 h-4 me-2" />
                  {t('contributions.approveCount', { n: selectedQuestions.size })}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
