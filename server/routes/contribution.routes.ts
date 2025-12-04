import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../replitAuth";
import DOMPurify from "isomorphic-dompurify";
import type { ContributionSubmission } from "@shared/schema";

const router = Router();

// Get superadmin emails from environment variable
function getSuperadminEmails(): string[] {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
}

// Check if user is superadmin
function isSuperadmin(req: Request): boolean {
  const user = req.user as any;
  if (!user) return false;
  
  const superadminEmails = getSuperadminEmails();
  return (!user.isLocal && user.email && superadminEmails.includes(user.email.toLowerCase())) || user.role === "superadmin";
}

// Middleware to check superadmin
function checkSuperadmin(req: Request, res: Response, next: NextFunction) {
  if (!isSuperadmin(req)) {
    return res.status(403).json({ error: "Superadmin access required" });
  }
  next();
}

// Reward configuration
const QUESTIONS_PER_CREDIT = 5; // 5 approved questions = 1 assessment credit
const MAX_MONTHLY_CREDITS = 50; // Maximum credits per month per organization
const MAX_QUESTIONS_PER_SUBMISSION = 50;
const MAX_SUBMISSIONS_PER_DAY = 3; // Per organization (not per user)

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
  approvedQuestionIds: z.array(z.number()).optional(), // Indices of approved questions
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
async function checkOrgAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const member = await storage.getOrganizationMemberByUserId(user.id);
  if (!member || member.role !== "admin") {
    return res.status(403).json({ error: "Must be an organization admin" });
  }

  // Attach org info to request
  (req as any).orgMember = member;
  next();
}

// Get organization's credit balance and submission history
router.get("/balance", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const org = await storage.getOrganizationById(member.organizationId);
    
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }

    // Check if monthly reset is needed
    const now = new Date();
    const lastReset = org.lastContributionResetDate;
    let monthlyCount = org.monthlyContributionCount || 0;
    
    if (!lastReset || lastReset.getMonth() !== now.getMonth() || lastReset.getFullYear() !== now.getFullYear()) {
      // Reset monthly count
      await storage.updateOrganization(org.id, {
        monthlyContributionCount: 0,
        lastContributionResetDate: now,
      });
      monthlyCount = 0;
    }

    const submissions = await storage.getContributionSubmissionsByOrg(org.id);
    const pendingSubmissions = submissions.filter(s => s.status === "pending" || s.status === "in_review");
    const totalApproved = submissions.reduce((sum, s) => sum + (s.approvedCount || 0), 0);
    const totalCreditsEarned = submissions.reduce((sum, s) => sum + (s.creditsAwarded || 0), 0);

    res.json({
      rewardCredits: org.rewardCredits || 0,
      rewardCreditsUsed: org.rewardCreditsUsed || 0,
      availableCredits: (org.rewardCredits || 0) - (org.rewardCreditsUsed || 0),
      monthlyCreditsEarned: monthlyCount,
      monthlyCreditsRemaining: MAX_MONTHLY_CREDITS - monthlyCount,
      questionsPerCredit: QUESTIONS_PER_CREDIT,
      maxMonthlyCredits: MAX_MONTHLY_CREDITS,
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
router.post("/submit", isAuthenticated, checkOrgAdmin, async (req: Request, res: Response) => {
  try {
    const member = (req as any).orgMember;
    const user = req.user as any;
    
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
      submittedByUserId: user.id,
      countryId,
      curriculum,
      subject,
      grade,
      questions: sanitizedQuestions,
      totalQuestions: sanitizedQuestions.length,
    });

    res.status(201).json({
      message: "Questions submitted successfully for review",
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

// Review and approve/reject submission
router.post("/admin/review/:id", isAuthenticated, checkSuperadmin, async (req: Request, res: Response) => {
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

    if (submission.status !== "pending" && submission.status !== "in_review") {
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

      // Add approved questions to the quiz bank
      for (const idx of indicesToApprove) {
        const q = questions[idx];
        if (q) {
          await storage.createQuizQuestion({
            question: q.question,
            questionType: "multiple_choice",
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation || null,
            subject: submission.subject,
            gradeBand: submission.grade <= 9 ? "8-9" : "10-12",
            grade: submission.grade,
            countryId: submission.countryId,
            curriculum: submission.curriculum,
            topic: q.topic,
            difficulty: q.difficulty,
            cognitiveLevel: q.cognitiveLevel,
            sourceType: "school_contribution",
            contributedByOrgId: submission.organizationId,
            contributionSubmissionId: submission.id,
            isLlmGenerated: false,
          });
        }
      }

      // Award credits to organization
      if (creditsAwarded > 0) {
        const org = await storage.getOrganizationById(submission.organizationId);
        if (org) {
          // Check monthly cap
          const currentMonthlyCredits = org.monthlyContributionCount || 0;
          const remainingCap = MAX_MONTHLY_CREDITS - currentMonthlyCredits;
          const actualCredits = Math.min(creditsAwarded, remainingCap);

          if (actualCredits > 0) {
            await storage.updateOrganization(org.id, {
              rewardCredits: (org.rewardCredits || 0) + actualCredits,
              monthlyContributionCount: currentMonthlyCredits + actualCredits,
            });

            // Create reward log
            await storage.createContributionReward({
              organizationId: org.id,
              submissionId: submission.id,
              creditsAwarded: actualCredits,
              approvedQuestions: approvedCount,
              reason: `${approvedCount} approved questions = ${actualCredits} assessment credits`,
              awardedByUserId: user.id,
            });

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
      reviewedByUserId: user.id,
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

export default router;
