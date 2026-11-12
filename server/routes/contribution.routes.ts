import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { requireSchoolSetup } from "../utils/schoolSetupGate";
import { REVIEWS_REQUIRED, REVIEW_MAJORITY } from "@shared/schema";

/**
 * What a school earns for ONE review that matched the outcome.
 *
 * Deliberately smaller than authoring, which pays one credit per five approved
 * questions. Reviewing is worth paying for -- it is the scarce resource once
 * schools outnumber superadmins -- but it is minutes of work against the hours
 * of writing a question set, and paying them alike would make reviewing the
 * rational thing to do instead of contributing.
 */
const REVIEW_CREDIT_PER_REVIEW = 1;
import { z } from "zod";
import { isAuthenticated } from "../auth";
import DOMPurify from "isomorphic-dompurify";
import type { ContributionSubmission } from "@shared/schema";
import { getCurrentAcademicYear } from "../utils/subjects";
import { getSuperadminEmails } from "../middleware/auth.middleware";
import { actingUserId } from "../utils/actingUser";

const router = Router();



// Check if user is superadmin (async - fetches user from DB to check role)
async function isSuperadmin(req: Request): Promise<boolean> {
  const sessionUser = req.user as any;
  if (!sessionUser) return false;
  
  // Fetch full user from database to get role
  const user = await storage.getUser(sessionUser.userId);
  if (!user) return false;
  
  const superadminEmails = getSuperadminEmails();
  return (user.email && superadminEmails.includes(user.email.toLowerCase())) || user.role === "superadmin";
}

/**
 * A GUARD THAT THROWS MUST ANSWER, NOT REJECT.
 *
 * Express 4 does not await middleware. An async guard whose database read
 * fails returns a rejected promise that nothing is listening to, and this
 * server installs no `unhandledRejection` handler -- so Node's default
 * applies and THE PROCESS EXITS. One dropped connection during one request
 * to a contribution route took the whole site down until Render restarted
 * it, and any automatic check in flight at that moment was lost with it.
 *
 * Found in the harness on 2026-11-12, when a second database client took
 * PGlite's only connection mid-request and the server died rather than
 * answering 500. The two shared guards in auth.middleware.ts already catch;
 * the two written locally in this file did not.
 *
 * FAILS CLOSED: an error is a 500, never `next()`. A guard that cannot tell
 * who is asking has not established that they may proceed.
 */
function guarded(
  name: string,
  check: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await check(req, res, next);
    } catch (error) {
      console.error(`[Contribution] ${name} failed:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Authorization check failed" });
      }
    }
  };
}

// Middleware to check superadmin
const checkSuperadmin = guarded("checkSuperadmin", async (req, res, next) => {
  const isSuper = await isSuperadmin(req);
  if (!isSuper) {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
});

// Reward configuration
const QUESTIONS_PER_CREDIT = 5; // 5 approved questions = 1 assessment credit
const DEFAULT_MAX_YEARLY_CREDITS = 50; // Default maximum credits per YEAR per organization
const MAX_QUESTIONS_PER_SUBMISSION = 50;
const MAX_SUBMISSIONS_PER_DAY = 3; // Per organization (not per user)

// System config keys
const CONFIG_MAX_YEARLY_CREDITS = "rewards.max_yearly_credits";

// Helper to get configurable max yearly credits
async function getMaxYearlyCredits(): Promise<number> {
  const config = await storage.getSystemConfig(CONFIG_MAX_YEARLY_CREDITS);
  if (config) {
    const value = parseInt(config.value, 10);
    if (!isNaN(value) && value > 0) {
      return value;
    }
  }
  return DEFAULT_MAX_YEARLY_CREDITS;
}

/**
 * LLM VERIFICATION, AND WHAT IT MUST SAY WHEN IT DOES NOT HAPPEN.
 *
 * Three things can stop this check running: no Anthropic credential, a non-OK
 * response from Anthropic, or a thrown exception. All three used to return
 * `{ overallScore: 100, verified: true }` — a perfect score from a review that
 * never took place.
 *
 * That mattered because the gate downstream is real: a submission is routed to
 * peer review on `result.verified && result.overallScore >= 50`. A fabricated
 * 100 cleared it every time, so unchecked questions reached peer review
 * labelled as having passed an automatic review, and approved questions earn
 * reward credits that convert to free licences. The content goes into an
 * assessment sat by 13-18 year olds.
 *
 * The trigger needed no code change. A rotated `DB_ENCRYPTION_KEY` makes every
 * stored credential undecryptable, and `storage.getApiCredential` returns
 * `undefined` on a decryption failure — indistinguishable here from "never
 * configured" — so the first path was taken silently. An expired key, a rate
 * limit or an outage took the second.
 *
 * `checkRan` is now the difference between "the LLM read these questions" and
 * "it did not". A failure reports score 0, which does not clear the threshold,
 * so the submission keeps its `pending` status and a superadmin picks it up —
 * and `pending` is already in the superadmin queue, so it stays visible rather
 * than disappearing, which is the failure mode this codebase produced once
 * before by routing submissions out of that queue.
 *
 * The score threshold and the success path are deliberately UNTOUCHED. The
 * defect was failures claiming success, not the passing mark.
 */
async function verifyQuestionsWithLLM(questions: any[], subject: string, grade: number, curriculum: string): Promise<{
  overallScore: number;
  feedback: Array<{ index: number; isValid: boolean; score: number; issues: string[] }>;
  verified: boolean;
  /** False when the check did not run at all. Never conflate with a low score. */
  checkRan: boolean;
}> {
  /**
   * Score 0 and an EMPTY feedback list. Not `isValid: true, score: 100` per
   * question, which is what made this invisible: that shape is
   * indistinguishable from a real pass, both to the routing gate and to the
   * school reading its feedback.
   */
  const notChecked = (reason: string) => {
    console.error(`[Contribution] LLM verification did NOT run (${reason}) — submission left for superadmin review`);
    return { overallScore: 0, feedback: [], verified: false, checkRan: false };
  };

  try {
    // Get Anthropic credentials
    const credential = await storage.getApiCredential("anthropic");
    if (!credential || !credential.apiKey) {
      /**
       * Covers BOTH "never configured" and "configured but undecryptable",
       * because getApiCredential collapses them into undefined. They differ in
       * cause and not in consequence: either way nothing read these questions,
       * so neither may report a score.
       */
      return notChecked("no usable Anthropic credential");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": credential.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1000,
        temperature: 0.3,
        system: `You are an educational content quality reviewer. Evaluate quiz questions for a ${curriculum} curriculum, Grade ${grade}, Subject: ${subject}.

For each question, check:
1. Accuracy: Is the question factually correct?
2. Clarity: Is the question clear and unambiguous?
3. Appropriate Level: Is it suitable for Grade ${grade}?
4. Answer Validity: Is the correct answer actually correct?
5. Option Quality: Are all 4 options distinct and plausible?

Return a JSON object only — no markdown fences, no extra text:
{
  "overallScore": number (0-100),
  "questions": [
    { "index": number, "isValid": boolean, "score": number (0-100), "issues": string[] }
  ]
}

Be strict but fair. Educational quality matters.`,
        messages: [
          {
            role: "user",
            content: `Evaluate these questions:\n${JSON.stringify(questions, null, 2)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      // An expired or revoked key (401), a rate limit (429) or an outage (5xx).
      // None of them is a verdict on the questions.
      console.error("Anthropic API error:", response.status, await response.text());
      return notChecked(`Anthropic HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text || "{}";
    // The prompt asks for bare JSON and the model does not always oblige: a
    // reply wrapped in a ```json fence, or with a sentence before it, made
    // JSON.parse throw, and a throw here is "the check did not run" -- so a
    // review that HAD happened was discarded and the submission left for a
    // person. Take the outermost object; anything with no object in it still
    // throws and is still, correctly, not a verdict.
    const open = rawText.indexOf("{");
    const close = rawText.lastIndexOf("}");
    const content = JSON.parse(open >= 0 && close > open ? rawText.slice(open, close + 1) : rawText);
    
    /**
     * The check RAN. `|| 0` is deliberate and already correct: a missing or
     * unparseable score fails the threshold rather than defaulting to a pass.
     */
    return {
      overallScore: content.overallScore || 0,
      feedback: content.questions || [],
      verified: true,
      checkRan: true,
    };
  } catch (error) {
    // A network failure, or JSON.parse on a reply that was not JSON. The
    // previous comment here said this let the submission "proceed to manual
    // review" -- but score 100 routed it to PEER review instead, past the
    // human it was meant to reach. Score 0 is what actually leaves it pending
    // for a superadmin.
    console.error("LLM verification error:", error);
    return notChecked(error instanceof Error ? error.message : "unknown error");
  }
}

type VerificationResult = Awaited<ReturnType<typeof verifyQuestionsWithLLM>>;

/**
 * WRITES A VERIFICATION RESULT TO A SUBMISSION, AND ROUTES IT.
 *
 * One function because two callers must agree exactly: the background check
 * that follows a submit, and a superadmin's re-check of a submission the first
 * attempt could not read. A second copy of the routing gate is how the two
 * would come to disagree about what "passed" means.
 */
async function applyVerificationResult(submissionId: string, result: VerificationResult) {
  const updateData: any = {
    /**
     * THREE STATES, NOT TWO. "failed" would tell a school its questions
     * were reviewed and rejected; "unavailable" says no review happened.
     * A school told its work failed would rewrite questions nobody read.
     */
    llmVerificationStatus: !result.checkRan
      ? "unavailable"
      : result.verified ? "verified" : "failed",
    llmVerificationScore: result.overallScore,
    llmVerificationFeedback: result.feedback,
    llmVerifiedAt: new Date(),
  };

  /**
   * PASSING THE AUTOMATIC CHECK SENDS IT TO PEER REVIEW, not to a
   * superadmin queue.
   *
   * Waiting for one person does not scale past a handful of schools, and
   * it puts a single judgement behind every question in the bank.
   * Schools teaching the curriculum are better placed to judge and there
   * are many of them, so three of them decide by majority.
   *
   * A submission that FAILS the automatic check does not reach peer
   * review at all -- it keeps its status and a superadmin picks it up.
   * Reviewers' attention is the scarce resource here; spending it on
   * questions a machine already rejected wastes it.
   */
  if (result.verified && result.overallScore >= 50) {
    updateData.status = "peer_review";
  }

  return storage.updateContributionSubmission(submissionId, updateData);
}

// Validation schemas
const questionSchema = z.object({
  question: z.string().min(10).max(1000),
  options: z.array(z.string().min(1).max(500)).length(4),
  correctAnswer: z.string().min(1).max(500),
  explanation: z.string().max(1000).optional(),
  topic: z.string().min(2).max(100),
  difficulty: z.enum(["easy", "medium", "hard"]),
  cognitiveLevel: z.enum(["knowledge", "comprehension", "application", "analysis"]),
});

const submitQuestionsSchema = z.object({
  countryId: z.string().min(1),
  curriculum: z.string().min(1),
  subject: z.string().min(1),
  grade: z.number().int().min(8).max(12),
  questions: z.array(questionSchema).min(1).max(MAX_QUESTIONS_PER_SUBMISSION),
});

const reviewSubmissionSchema = z.object({
  status: z.enum(["approved", "rejected", "needs_changes"]),
  feedback: z.string().max(2000).optional(),
  /**
   * Indices of approved questions, bounded by the same cap as the submission
   * itself: a submission holds at most MAX_QUESTIONS_PER_SUBMISSION questions,
   * so a longer list of indices into it cannot be legitimate. Unbounded, it
   * was the one array in this file with no ceiling — and an unbounded array is
   * what zod's uncapped per-element issue accumulation needs
   * (GHSA-mrhx-c7xc-m3w5).
   *
   * NOT tightened to `.int().nonnegative()`, deliberately. That would be the
   * correct shape for an index, but it rejects input the route accepts today
   * and `indicesToApprove` is consumed below without me having traced every
   * caller — so it is flagged for review rather than changed under cover of a
   * bounding commit.
   */
  approvedQuestionIds: z.array(z.number()).max(MAX_QUESTIONS_PER_SUBMISSION).optional(),
});

// Sanitize question content
function sanitizeQuestion(q: any) {
  return {
    ...q,
    question: DOMPurify.sanitize(q.question),
    options: q.options.map((opt: string) => DOMPurify.sanitize(opt)),
    correctAnswer: DOMPurify.sanitize(q.correctAnswer),
    explanation: q.explanation ? DOMPurify.sanitize(q.explanation) : undefined,
    topic: DOMPurify.sanitize(q.topic),
  };
}

// Check if user is an org admin
const checkOrgAdmin = guarded("checkOrgAdmin", async (req, res, next) => {
  const user = req.user as any;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userId = actingUserId(user);
  if (!userId) {
    // Unreachable behind isAuthenticated, but the type cannot know that, and
    // the alternative is a cast — which is precisely what hid the undefined
    // writes here in the first place.
    return res.status(401).json({ error: "Not authenticated" });
  }

  // First check organizationMembers table
  let member = await storage.getOrganizationMemberByUserId(userId);
  
  // If not found in members table, check if user is an org_admin by accountType
  if (!member || member.role !== "admin") {
    // Get full user record to check accountType
    const fullUser = await storage.getUser(userId);
    
    if (fullUser?.accountType === 'org_admin') {
      // Find organization by admin user ID
      const org = await storage.getOrganizationByAdminUserId(userId);
      if (org) {
        // Create a virtual member object for org_admin users
        member = {
          id: userId,
          userId: userId,
          organizationId: org.id,
          role: "admin",
          createdAt: new Date(),
        } as any;
      } else {
        return res.status(403).json({ error: "Organization not found for admin" });
      }
    } else {
      return res.status(403).json({ error: "Must be an organization admin" });
    }
  }

  // Attach org info to request
  (req as any).orgMember = member;
  next();
});

// Get organization's credit balance and submission history
router.get("/balance", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const org = await storage.getOrganizationById(member.organizationId);
    
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Check if yearly reset is needed
    const currentYear = new Date().getFullYear();
    const lastResetYear = (org as any).lastContributionResetYear || 0;
    let yearlyCount = (org as any).yearlyContributionCount || 0;
    
    if (lastResetYear !== currentYear) {
      // Reset yearly count
      await storage.updateOrganization(org.id, {
        yearlyContributionCount: 0,
        lastContributionResetYear: currentYear,
      } as any);
      yearlyCount = 0;
    }

    const submissions = await storage.getContributionSubmissionsByOrg(org.id);
    /**
     * PEER REVIEW DOES NOT REMOVE SUPERADMIN OVERSIGHT, it just stops being
     * the only path.
     *
     * Routing verified submissions to peer review took them out of this queue
     * entirely, which was a worse bug than the bottleneck it replaced: a
     * submission nobody chose to review would sit at `peer_review` for ever
     * with no one able to see it, and a superadmin could not intervene in one
     * that was going wrong. Including it here restores the backstop -- the
     * superadmin review route still accepts a decision at any point, and that
     * decision settles the submission regardless of the votes cast.
     */
    const pendingSubmissions = submissions.filter(s =>
      s.status === "pending" || s.status === "in_review" ||
      s.status === "llm_verified" || s.status === "peer_review");
    const approvedUnallocated = submissions.filter(s => s.status === "approved" && !(s as any).rewardAllocated);
    const totalApproved = submissions.reduce((sum, s) => sum + (s.approvedCount || 0), 0);
    const totalCreditsEarned = submissions.reduce((sum, s) => sum + (s.creditsAwarded || 0), 0);

    // Get configurable max yearly credits
    const maxYearlyCredits = await getMaxYearlyCredits();

    res.json({
      rewardCredits: org.rewardCredits || 0,
      pendingRewardCredits: (org as any).pendingRewardCredits || 0,
      rewardCreditsUsed: org.rewardCreditsUsed || 0,
      availableCredits: (org.rewardCredits || 0) - (org.rewardCreditsUsed || 0),
      yearlyCreditsEarned: yearlyCount,
      yearlyCreditsRemaining: maxYearlyCredits - yearlyCount,
      questionsPerCredit: QUESTIONS_PER_CREDIT,
      maxYearlyCredits: maxYearlyCredits,
      currentYear: currentYear,
      approvedUnallocatedCount: approvedUnallocated.length,
      stats: {
        totalSubmissions: submissions.length,
        pendingSubmissions: pendingSubmissions.length,
        totalApproved: totalApproved,
        totalCreditsEarned: totalCreditsEarned,
      },
    });
  } catch (error) {
    console.error("Error getting credit balance:", error);
    res.status(500).json({ error: "Failed to get credit balance" });
  }
});

// Get organization's submission history
router.get("/submissions", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const submissions = await storage.getContributionSubmissionsByOrg(member.organizationId);
    
    // Enrich with country names
    const enrichedSubmissions = await Promise.all(submissions.map(async (s) => {
      const country = await storage.getCountryById(s.countryId);
      return {
        ...s,
        countryName: country?.name || s.countryId,
      };
    }));

    res.json(enrichedSubmissions);
  } catch (error) {
    console.error("Error getting submissions:", error);
    res.status(500).json({ error: "Failed to get submissions" });
  }
});

// Submit questions for review
/**
 * THE PEER REVIEW QUEUE — other schools' questions awaiting judgement.
 *
 * Never this school's own, in any country; never one it has already voted on;
 * and only its own country AND curriculum. The same curriculum is not the same
 * syllabus across borders — a British-curriculum school in Saudi Arabia teaches
 * it inside Saudi requirements — so a reviewer from elsewhere would be marking
 * against a syllabus it does not teach while believing it shares one.
 *
 * The author's identity is not in the response at all: a field that
 * reaches the browser has been disclosed whatever the interface does with it,
 * so blindness is achieved by not selecting it rather than by not rendering it.
 */
router.get("/review-queue", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const setupGate = await requireSchoolSetup(storage, member.organizationId);
    if (!setupGate.allowed) {
      return res.status(setupGate.status).json(setupGate.body);
    }

    const queue = await storage.getPeerReviewQueue(member.organizationId);
    res.json({
      reviewsRequired: REVIEWS_REQUIRED,
      majority: REVIEW_MAJORITY,
      submissions: queue,
    });
  } catch (error) {
    console.error("Error reading review queue:", error);
    res.status(500).json({ error: "Failed to read review queue" });
  }
});

/**
 * Cast this school's vote.
 *
 * One vote per SCHOOL, not per administrator -- a school with two admins could
 * otherwise supply a majority by itself, which the unique index on
 * (submission, reviewer org) refuses at the database.
 *
 * The decision settles inside the same transaction as the vote, so two schools
 * voting at once cannot both believe they completed the quorum and settle the
 * submission twice.
 */
router.post("/review/:id", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const setupGate = await requireSchoolSetup(storage, member.organizationId);
    if (!setupGate.allowed) {
      return res.status(setupGate.status).json(setupGate.body);
    }

    const parsed = z.object({
      vote: z.enum(["approve", "reject"]),
      comment: z.string().max(2000).optional(),
    }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid review", details: parsed.error.flatten() });
    }

    const result = await storage.recordContributionReview({
      submissionId: req.params.id,
      reviewerOrgId: member.organizationId,
      reviewerUserId: (req as any).user.userId,
      vote: parsed.data.vote,
      comment: parsed.data.comment,
    });

    if (!result.recorded) {
      // 409 for ALREADY_REVIEWED and NOT_IN_REVIEW alike: in both the request
      // is well-formed and the caller entitled, and it is the state that
      // refuses -- which is what a 409 says and a 500 does not.
      // 403 for the three entitlement refusals: all are properties of who is
      // asking and will not change by retrying, unlike the two 409s.
      const ENTITLEMENT = ["OWN_SUBMISSION", "COUNTRY_MISMATCH", "CURRICULUM_MISMATCH"];
      const status = result.reason === "NOT_FOUND" ? 404
        : ENTITLEMENT.includes(result.reason ?? "") ? 403
          : 409;
      return res.status(status).json({ error: result.reason });
    }

    /**
     * CREDIT THE REVIEWERS WHO WERE RIGHT, once the outcome is settled.
     *
     * Only the schools whose vote matched the outcome. Crediting every review
     * regardless would pay a school to approve everything unread as fast as it
     * could click -- the cheapest way to earn, and one that would fill the bank
     * with whatever the automatic check let through.
     *
     * Credits are PENDING, not granted: allocation stays a superadmin act, the
     * same as authoring rewards, so the reward model has one gate rather than
     * two.
     */
    if (result.decided && result.outcome) {
      const winners = await storage.getReviewersOnMajoritySide(req.params.id, result.outcome);
      for (const orgId of winners) {
        try {
          await storage.incrementPendingRewardCredits(orgId, REVIEW_CREDIT_PER_REVIEW);
        } catch (e) {
          // A credit that fails to land must not fail the review that earned
          // it: the vote is the record, the credit is bookkeeping.
          console.error(`[Contribution] Failed to credit reviewer ${orgId}:`, e);
        }
      }
    }

    res.json({
      recorded: true,
      reviewsSoFar: result.reviewsSoFar,
      reviewsRequired: REVIEWS_REQUIRED,
      decided: result.decided,
      outcome: result.outcome ?? null,
    });
  } catch (error: any) {
    /**
     * The unique index refusing a second vote from the same school, when two
     * arrive simultaneously and both pass the check above. Matched on
     * Postgres's error CODE rather than its message text: drizzle wraps the
     * error, so the message is not reliably reachable -- which is how this
     * case escaped as a 500 the first time.
     */
    const pgCode = error?.code ?? error?.cause?.code;
    if (pgCode === "23505") {
      return res.status(409).json({ error: "ALREADY_REVIEWED" });
    }
    console.error("Error recording review:", error);
    res.status(500).json({ error: "Failed to record review" });
  }
});

/**
 * The reviews on the AUTHOR's own submission: the outcome and what reviewers
 * said, never who said it. Blind runs both ways, so a school cannot learn who
 * rejected its questions and take it personally in the next review round.
 */
router.get("/:id/feedback", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const submission = await storage.getContributionSubmission(req.params.id);
    if (!submission) return res.status(404).json({ error: "Not found" });
    if (submission.organizationId !== member.organizationId) {
      return res.status(403).json({ error: "Not your submission" });
    }

    const reviews = await storage.getReviewFeedbackForAuthor(req.params.id);
    res.json({
      status: submission.status,
      // A rejected submission's questions are discarded -- they never enter
      // the bank -- and the school is told so plainly rather than left to
      // infer it from a status word.
      discarded: submission.status === "rejected",
      reviews,
    });
  } catch (error) {
    console.error("Error reading review feedback:", error);
    res.status(500).json({ error: "Failed to read feedback" });
  }
});

/**
 * WHAT THIS SCHOOL SHOULD WRITE NEXT.
 *
 * The contribute screen let a school pick any subject and any grade, so what
 * got written was what the school was strongest at -- which is the cell least
 * likely to be empty. The weak cells stayed weak, and nothing anywhere said
 * which they were.
 *
 * The school's country and curriculum are NOT parameters: they are fixed
 * properties of the school, guaranteed to exist by the setup gate, and taking
 * them from the request would reintroduce the choice this removes. A school
 * teaches one curriculum; the only open question is subject and grade.
 */
router.get("/gaps", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const setupGate = await requireSchoolSetup(storage, member.organizationId);
    if (!setupGate.allowed) {
      return res.status(setupGate.status).json(setupGate.body);
    }

    const organization = await storage.getOrganizationById(member.organizationId);
    const gaps = await storage.getQuestionGaps(organization!.countryId!, organization!.curriculum!);
    if (!gaps) {
      return res.status(404).json({ error: "Country not found" });
    }
    res.json(gaps);
  } catch (error) {
    console.error("Error reading question gaps:", error);
    res.status(500).json({ error: "Failed to read question gaps" });
  }
});

router.post("/submit", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const user = req.user as any;
    const userId = actingUserId(user);
    if (!userId) return res.status(401).json({ error: "Not authenticated" });
    
    // Organization-scoped rate limiting (3 submissions per day per org)
    const dailySubmissionCount = await storage.getOrganizationDailySubmissionCount(member.organizationId);
    if (dailySubmissionCount >= MAX_SUBMISSIONS_PER_DAY) {
      return res.status(429).json({ 
        error: "Maximum 3 submissions per day per school. Please try again tomorrow." 
      });
    }
    
    // Validate input
    const parsed = submitQuestionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid submission data", 
        details: parsed.error.issues 
      });
    }

    const { countryId, curriculum, subject, grade, questions } = parsed.data;

    // Verify country exists
    const country = await storage.getCountryById(countryId);
    if (!country) {
      return res.status(400).json({ error: "Invalid country" });
    }

    // Validate curriculum is valid for the selected country
    if (curriculum && country.curricula && !country.curricula.includes(curriculum)) {
      return res.status(400).json({ 
        error: `Invalid curriculum '${curriculum}' for ${country.name}. Valid options: ${country.curricula.join(", ")}` 
      });
    }

    // Validate subject exists for the selected country and curriculum
    if (curriculum) {
      const validSubject = await storage.getSubjectByCode(countryId, curriculum, subject);
      if (!validSubject) {
        // Try to get available subjects for better error message
        const availableSubjects = await storage.getSubjectsByCurriculum(countryId, curriculum);
        const subjectList = availableSubjects.map(s => s.code).join(", ");
        return res.status(400).json({ 
          error: `Invalid subject '${subject}' for ${curriculum} curriculum. ${subjectList ? `Valid options: ${subjectList}` : "No subjects available for this curriculum."}` 
        });
      }
    }

    const organization = await storage.getOrganizationById(member.organizationId);

    /**
     * The submission must be for the SCHOOL'S OWN COUNTRY.
     *
     * countryId arrives from the client and was only checked for existence,
     * so a school in one country could file questions against another: pick a
     * country whose curricula happen to include your own and whose subject
     * codes you can read from the public /api/countries routes, and your
     * questions enter that country's bank on approval. Confirmed by test --
     * a UAE school submitted to a freshly created country and got a 201.
     *
     * Nothing malicious is needed for this to bite. The country is a dropdown
     * on a form; a stale selection or a copied request body is enough to file
     * a school's work under the wrong flag, where it then shapes the quizzes
     * of students who are not theirs.
     *
     * Checked rather than silently overridden, to match how curriculum is
     * handled directly below: an admin who picked the wrong country is told
     * so, instead of watching their submission land somewhere they did not
     * choose.
     */
    /**
     * THE SCHOOL MUST BE SET UP BEFORE IT MAY CONTRIBUTE.
     *
     * The two checks below are written as "if the school has one set, it must
     * match" -- which means a school with NEITHER skips both and can submit
     * questions tagged to any country and any curriculum the platform knows
     * about. That state is reachable: the Stripe group-purchase path creates a
     * school inside the payment transaction with neither value available.
     *
     * A school teaches one curriculum. It should never have been choosing.
     */
    const setupGate = await requireSchoolSetup(storage, member.organizationId);
    if (!setupGate.allowed) {
      return res.status(setupGate.status).json(setupGate.body);
    }

    if (organization?.countryId && countryId !== organization.countryId) {
      return res.status(400).json({
        error: `Submitted country '${countryId}' does not match your school's country '${organization.countryId}'. Questions can only be contributed to your own country.`,
      });
    }

    // If organization has a curriculum set, validate the submission matches
    if (organization?.curriculum && curriculum && organization.curriculum !== curriculum) {
      return res.status(400).json({
        error: `Submitted curriculum '${curriculum}' does not match your school's curriculum '${organization.curriculum}'.`
      });
    }

    // Sanitize all questions
    const sanitizedQuestions = questions.map(sanitizeQuestion);

    // Check for duplicates against existing questions
    const existingQuestions = await storage.getQuizQuestionsByCountryAndGrade(countryId, grade, subject);
    const duplicates: number[] = [];
    
    sanitizedQuestions.forEach((q, idx) => {
      const isDuplicate = existingQuestions.some(
        existing => existing.question.toLowerCase().trim() === q.question.toLowerCase().trim()
      );
      if (isDuplicate) {
        duplicates.push(idx);
      }
    });

    if (duplicates.length > 0) {
      return res.status(400).json({ 
        error: "Some questions appear to be duplicates of existing questions",
        duplicateIndices: duplicates,
      });
    }

    // Create submission
    const submission = await storage.createContributionSubmission({
      organizationId: member.organizationId,
      submittedByUserId: userId,
      countryId,
      curriculum,
      subject,
      grade,
      questions: sanitizedQuestions,
      totalQuestions: sanitizedQuestions.length,
    });

    // Trigger LLM verification in background (non-blocking)
    verifyQuestionsWithLLM(sanitizedQuestions, subject, grade, curriculum)
      .then(async (result) => {
        await applyVerificationResult(submission.id, result);
        console.log(`LLM verification complete for submission ${submission.id}: score=${result.overallScore}`);
      })
      .catch((err) => {
        console.error(`LLM verification failed for submission ${submission.id}:`, err);
      });

    res.status(201).json({
      message: "Questions submitted successfully. LLM verification in progress.",
      submissionId: submission.id,
      totalQuestions: sanitizedQuestions.length,
      estimatedCredits: Math.floor(sanitizedQuestions.length / QUESTIONS_PER_CREDIT),
    });
  } catch (error) {
    console.error("Error submitting questions:", error);
    res.status(500).json({ error: "Failed to submit questions" });
  }
});

// ============ SUPERADMIN ENDPOINTS ============

// Get all pending submissions for review
router.get("/admin/pending", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const submissions = await storage.getAllPendingContributionSubmissions();
    
    // Enrich with org and country names
    const enrichedSubmissions = await Promise.all(submissions.map(async (s) => {
      const org = await storage.getOrganizationById(s.organizationId);
      const country = await storage.getCountryById(s.countryId);
      const submitter = await storage.getUser(s.submittedByUserId);
      
      return {
        ...s,
        organizationName: org?.name || "Unknown",
        countryName: country?.name || s.countryId,
        submitterName: submitter?.firstName ? `${submitter.firstName} ${submitter.lastName || ''}` : submitter?.email || "Unknown",
      };
    }));

    res.json(enrichedSubmissions);
  } catch (error) {
    console.error("Error getting pending submissions:", error);
    res.status(500).json({ error: "Failed to get pending submissions" });
  }
});

// Get submission details for review
router.get("/admin/submission/:id", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const submission = await storage.getContributionSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    const org = await storage.getOrganizationById(submission.organizationId);
    const country = await storage.getCountryById(submission.countryId);

    res.json({
      ...submission,
      organizationName: org?.name || "Unknown",
      countryName: country?.name || submission.countryId,
    });
  } catch (error) {
    console.error("Error getting submission:", error);
    res.status(500).json({ error: "Failed to get submission" });
  }
});

/**
 * RE-RUN THE AUTOMATIC CHECK ON A SUBMISSION IT NEVER READ.
 *
 * A submission whose check could not run (no usable credential, Anthropic
 * down, a rate limit) is left `pending` with llmVerificationStatus
 * "unavailable" -- correctly, since nothing read it. But nothing ever tried
 * again either, so once the credential worked the submission still sat there
 * until a superadmin reviewed every question by hand, and it never reached
 * peer review, which is where it would have gone had the check run.
 *
 * SUPERADMIN-TRIGGERED, NOT AUTOMATIC. A background retry needs a schedule,
 * and nothing in this app runs on one. It would also spend Anthropic calls
 * with no one watching, against a failure that is usually a credential a
 * person has to fix first. The person who fixed it is the one pressing this.
 *
 * TWO STATES QUALIFY, both with the review status still `pending`:
 *   - "unavailable": the check reported that it did not run
 *   - "pending" with no result for RECHECK_STALE_MS: the check never reported
 *     anything. It is a background promise, and Render restarts the process on
 *     every deploy, so one in flight at that moment is simply lost and the row
 *     says "check in progress" for ever
 * A "failed" or "verified" submission is REFUSED: the check ran and gave a
 * verdict, and re-rolling a verdict until it passes is not a retry.
 *
 * CLAIMED IN ONE STATEMENT before the call is made, so a double click costs
 * one Anthropic call and not two, and a submission reviewed in the meantime
 * is not dragged back into peer review by a late result.
 *
 * STILL UNAVAILABLE IS A 503, not a 200: the row goes back to "unavailable"
 * and the caller is told the check did not run, in a status a client cannot
 * mistake for a verdict.
 */
const RECHECK_STALE_MS = 10 * 60 * 1000;

router.post("/admin/:id/recheck", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const submission = await storage.getContributionSubmission(req.params.id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found", code: "NOT_FOUND" });
    }

    const claimed = await storage.claimContributionRecheck(
      submission.id,
      new Date(Date.now() - RECHECK_STALE_MS),
    );
    if (!claimed) {
      return res.status(409).json({
        error: "The automatic check already ran on this submission, is still running, or the submission has been reviewed.",
        code: "NOT_RECHECKABLE",
        status: submission.status,
        llmVerificationStatus: submission.llmVerificationStatus,
      });
    }

    const result = await verifyQuestionsWithLLM(
      claimed.questions as any[],
      claimed.subject,
      claimed.grade,
      claimed.curriculum,
    );
    const updated = await applyVerificationResult(claimed.id, result);

    if (!result.checkRan) {
      return res.status(503).json({
        error: "The automatic check still could not run. Check the Anthropic credential and try again.",
        code: "CHECK_UNAVAILABLE",
        llmVerificationStatus: updated.llmVerificationStatus,
      });
    }

    res.json({
      submissionId: updated.id,
      status: updated.status,
      llmVerificationStatus: updated.llmVerificationStatus,
      llmVerificationScore: updated.llmVerificationScore,
    });
  } catch (error) {
    console.error("Error re-running verification:", error);
    res.status(500).json({ error: "Failed to re-run the automatic check" });
  }
});

// Review and approve/reject submission
router.post("/admin/:id/review", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const submissionId = req.params.id;

    const parsed = reviewSubmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ 
        error: "Invalid review data", 
        details: parsed.error.issues 
      });
    }

    const { status, feedback, approvedQuestionIds } = parsed.data;

    const submission = await storage.getContributionSubmission(submissionId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // `peer_review` included: a superadmin overriding an in-flight peer review
    // is exactly the backstop that makes peer review safe to rely on.
    if (submission.status !== "pending" && submission.status !== "in_review" &&
        submission.status !== "llm_verified" && submission.status !== "peer_review") {
      return res.status(400).json({ error: "Submission already reviewed" });
    }

    const questions = submission.questions as any[];
    let approvedCount = 0;
    let rejectedCount = 0;
    let creditsAwarded = 0;

    if (status === "approved") {
      // If approvedQuestionIds provided, only approve those
      const indicesToApprove = approvedQuestionIds || questions.map((_, i) => i);
      approvedCount = indicesToApprove.length;
      rejectedCount = questions.length - approvedCount;

      // Calculate credits (5 questions = 1 credit)
      creditsAwarded = Math.floor(approvedCount / QUESTIONS_PER_CREDIT);

      // FILE THE QUESTIONS UNDER THE SUBJECT **NAME**, NOT THE CODE.
      //
      // quiz_questions.subject is free text with two writers that disagreed.
      // The seeded bank stores the name ("Mathematics", questionBanks/uae/*);
      // this path stored submission.subject, which is the CODE ("mathematics"),
      // because the contribute UI submits s.code (ContributeQuestions.tsx:582)
      // and validation matches subjects.code (:327 above) — so the code form is
      // the only one that can reach here.
      //
      // The serving side never uses codes, and the one thing that could have
      // bridged the two vocabularies is applied to the wrong side. A student's
      // picks are run through normalizeSubjectsAsync (quiz.routes.ts:336), whose
      // alias map does map a code to its canonical name (utils/subjects.ts:62).
      // The stored row is normalized by nothing: the pool is built by an exact,
      // case-sensitive compare of the raw row value against those already-
      // normalized picks (quiz.routes.ts:346). So every question approved through
      // here was unservable: present, correct, and invisible to students forever.
      // Duplicate detection (:349) missed for the same reason.
      //
      // Latent rather than live when fixed — prod had 240 questions, all
      // source_type 'system' and all name-form, and zero contributed rows, so
      // there was nothing to migrate. See FOLLOWUP.md.
      const approvedSubject = await storage.getSubjectByCode(
        submission.countryId,
        submission.curriculum,
        submission.subject,
      );
      if (!approvedSubject) {
        // The subject was removed from the catalogue between submission and
        // review. REFUSE rather than fall back to submission.subject: writing
        // the code is precisely the defect above, and it fails silently — the
        // approval would report success and the questions would never serve.
        return res.status(409).json({
          error:
            `Subject '${submission.subject}' no longer exists for the ${submission.curriculum} ` +
            `curriculum, so these questions cannot be filed under a subject that students can be ` +
            `served. Restore the subject and review again, or reject this submission.`,
          code: "SUBJECT_NOT_IN_CATALOGUE",
        });
      }

      // Add approved questions to the quiz bank
      const academicYear = getCurrentAcademicYear();
      for (const idx of indicesToApprove) {
        const q = questions[idx];
        if (q) {
          await storage.createQuizQuestion({
            question: q.question,
            questionType: "multiple_choice",
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || null,
            subject: approvedSubject.name,
            grade: submission.grade, // Individual grade (8-12) - primary field
            countryId: submission.countryId,
            curriculum: submission.curriculum,
            topic: q.topic,
            difficulty: q.difficulty,
            cognitiveLevel: q.cognitiveLevel,
            sourceType: "school_contribution",
            contributedByOrgId: submission.organizationId,
            contributionSubmissionId: submission.id,
            isLlmGenerated: false,
            academicYear, // Track academic year based on creation date
          });
        }
      }

      // Don't auto-award credits - add to pending for superadmin manual allocation
      if (creditsAwarded > 0) {
        const org = await storage.getOrganizationById(submission.organizationId);
        if (org) {
          // Check yearly cap
          const maxYearlyCredits = await getMaxYearlyCredits();
          const currentYearlyCredits = (org as any).yearlyContributionCount || 0;
          const remainingCap = maxYearlyCredits - currentYearlyCredits;
          const actualCredits = Math.min(creditsAwarded, remainingCap);

          if (actualCredits > 0) {
            // Add to PENDING credits (not actual credits yet)
            await storage.updateOrganization(org.id, {
              pendingRewardCredits: ((org as any).pendingRewardCredits || 0) + actualCredits,
            } as any);

            creditsAwarded = actualCredits;
          }
        }
      }
    } else if (status === "rejected") {
      rejectedCount = questions.length;
    }

    // Update submission status
    await storage.updateContributionSubmission(submissionId, {
      status,
      reviewedByUserId: actingUserId(user),
      reviewedAt: new Date(),
      reviewFeedback: feedback || null,
      approvedCount,
      rejectedCount,
      creditsAwarded,
    });

    res.json({
      message: `Submission ${status}`,
      approvedCount,
      rejectedCount,
      creditsAwarded,
    });
  } catch (error) {
    console.error("Error reviewing submission:", error);
    res.status(500).json({ error: "Failed to review submission" });
  }
});

// Claim an approved submission (gives reward to school and removes from queue)
router.post("/admin/:id/claim", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const submissionId = req.params.id;

    const submission = await storage.getContributionSubmission(submissionId);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    // Can only claim approved submissions
    if (submission.status !== "approved") {
      return res.status(400).json({ error: "Only approved submissions can be claimed" });
    }

    // The claim and the credit movement are ONE transaction, and the claim's
    // conditions are in its own WHERE clause: see storage.claimApprovedContribution.
    const maxYearlyCredits = await getMaxYearlyCredits();
    const currentYear = new Date().getFullYear();
    const claimed = await storage.claimApprovedContribution(submissionId, { maxYearlyCredits, currentYear });
    if (!claimed) {
      // Somebody else's request claimed it between the read above and here.
      return res.status(409).json({ error: "This submission has already been claimed", code: "ALREADY_CLAIMED" });
    }
    if ("refused" in claimed) {
      // Same ceiling, same wording, as "Allocate reward". The submission is
      // left approved and unpaid so the reward can be given next year.
      return res.status(400).json({
        error: `This school has reached the maximum ${maxYearlyCredits} reward credits for ${currentYear}`,
        code: "YEARLY_CAP_REACHED",
      });
    }

    res.json({
      message: claimed.alreadyPaid
        ? "Submission closed. Its reward had already been given."
        : "Submission claimed and reward given to school",
      creditsAwarded: claimed.creditsMoved,
      creditsOverYearlyCap: claimed.capped,
      alreadyPaid: claimed.alreadyPaid,
    });
  } catch (error) {
    console.error("Error claiming submission:", error);
    res.status(500).json({ error: "Failed to claim submission" });
  }
});

// Get reward statistics for all organizations
router.get("/admin/stats", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const stats = await storage.getContributionStats();
    res.json(stats);
  } catch (error) {
    console.error("Error getting stats:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

// Get organizations with pending rewards (for superadmin to allocate)
router.get("/admin/pending-rewards", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const orgs = await storage.getOrganizationsWithPendingRewards();
    res.json(orgs);
  } catch (error) {
    console.error("Error getting pending rewards:", error);
    res.status(500).json({ error: "Failed to get pending rewards" });
  }
});

// Allocate reward credits to an organization (superadmin manual action)
const allocateRewardSchema = z.object({
  credits: z.number().int().min(1).max(50),
  isRewardCredits: z.boolean().default(true), // Flag to mark these as reward credits
});

router.post("/admin/org/:orgId/allocate-reward", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const user = req.user as any;
    const actorId = actingUserId(user);
    if (!actorId) return res.status(401).json({ error: "Not authenticated" });
    
    const parsed = allocateRewardSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    }
    
    const { credits, isRewardCredits } = parsed.data;
    
    const org = await storage.getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    
    // Check yearly cap
    const currentYear = new Date().getFullYear();
    const lastResetYear = (org as any).lastContributionResetYear || 0;
    let yearlyCount = (org as any).yearlyContributionCount || 0;
    
    if (lastResetYear !== currentYear) {
      yearlyCount = 0;
    }
    
    const maxYearlyCredits = await getMaxYearlyCredits();
    const remainingYearlyCap = maxYearlyCredits - yearlyCount;
    const actualCredits = Math.min(credits, remainingYearlyCap);
    
    if (actualCredits <= 0) {
      return res.status(400).json({ 
        error: `This school has reached the maximum ${maxYearlyCredits} reward credits for ${currentYear}` 
      });
    }
    
    // Get pending reward credits
    const pendingCredits = (org as any).pendingRewardCredits || 0;
    const creditsToMove = Math.min(actualCredits, pendingCredits);
    
    // Move credits from pending to actual
    await storage.updateOrganization(org.id, {
      rewardCredits: (org.rewardCredits || 0) + actualCredits,
      pendingRewardCredits: Math.max(0, pendingCredits - creditsToMove),
      yearlyContributionCount: yearlyCount + actualCredits,
      lastContributionResetYear: currentYear,
    } as any);
    
    // Mark approved submissions as reward-allocated
    const submissions = await storage.getContributionSubmissionsByOrg(orgId);
    const approvedUnallocated = submissions.filter(s => 
      s.status === "approved" && !(s as any).rewardAllocated
    );
    
    for (const submission of approvedUnallocated) {
      await storage.updateContributionSubmission(submission.id, {
        rewardAllocated: true,
      } as any);
      
      // Create reward log
      await storage.createContributionReward({
        organizationId: org.id,
        submissionId: submission.id,
        creditsAwarded: submission.creditsAwarded || 0,
        approvedQuestions: submission.approvedCount || 0,
        reason: `Manual allocation by superadmin - ${submission.approvedCount || 0} approved questions`,
        awardedByUserId: actorId,
      });
    }
    
    res.json({
      message: `Successfully allocated ${actualCredits} reward credits to ${org.name}`,
      creditsAllocated: actualCredits,
      newTotalRewardCredits: (org.rewardCredits || 0) + actualCredits,
      yearlyCreditsUsed: yearlyCount + actualCredits,
      yearlyCreditsRemaining: maxYearlyCredits - (yearlyCount + actualCredits),
    });
  } catch (error) {
    console.error("Error allocating reward:", error);
    res.status(500).json({ error: "Failed to allocate reward" });
  }
});

// Get current reward settings (superadmin)
router.get("/admin/settings", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const maxYearlyCredits = await getMaxYearlyCredits();
    res.json({
      maxYearlyCredits,
      questionsPerCredit: QUESTIONS_PER_CREDIT,
      maxQuestionsPerSubmission: MAX_QUESTIONS_PER_SUBMISSION,
      maxSubmissionsPerDay: MAX_SUBMISSIONS_PER_DAY,
    });
  } catch (error) {
    console.error("Error getting settings:", error);
    res.status(500).json({ error: "Failed to get settings" });
  }
});

// Update reward settings (superadmin)
const updateSettingsSchema = z.object({
  maxYearlyCredits: z.number().int().min(1).max(1000),
});

router.post("/admin/settings", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    }

    const { maxYearlyCredits } = parsed.data;

    await storage.upsertSystemConfig(
      CONFIG_MAX_YEARLY_CREDITS,
      String(maxYearlyCredits),
      actingUserId(user)
    );

    res.json({
      message: `Max yearly credits updated to ${maxYearlyCredits}`,
      maxYearlyCredits,
    });
  } catch (error) {
    console.error("Error updating settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

export default router;
