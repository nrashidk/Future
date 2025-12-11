import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { isAuthenticated } from "../auth";
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

// LLM Verification Service
async function verifyQuestionsWithLLM(questions: any[], subject: string, grade: number, curriculum: string): Promise<{
  overallScore: number;
  feedback: Array<{ index: number; isValid: boolean; score: number; issues: string[] }>;
  verified: boolean;
}> {
  try {
    // Get OpenAI credentials
    const credential = await storage.getApiCredential("openai");
    if (!credential || !credential.apiKey) {
      console.log("OpenAI API key not configured, skipping LLM verification");
      return { overallScore: 100, feedback: questions.map((_, i) => ({ index: i, isValid: true, score: 100, issues: [] })), verified: true };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${credential.apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an educational content quality reviewer. Evaluate quiz questions for a ${curriculum} curriculum, Grade ${grade}, Subject: ${subject}. 

For each question, check:
1. Accuracy: Is the question factually correct?
2. Clarity: Is the question clear and unambiguous?
3. Appropriate Level: Is it suitable for Grade ${grade}?
4. Answer Validity: Is the correct answer actually correct?
5. Option Quality: Are all 4 options distinct and plausible?

Return a JSON object with:
{
  "overallScore": number (0-100),
  "questions": [
    { "index": number, "isValid": boolean, "score": number (0-100), "issues": string[] }
  ]
}

Be strict but fair. Educational quality matters.`
          },
          {
            role: "user",
            content: `Evaluate these questions:\n${JSON.stringify(questions, null, 2)}`
          }
        ],
        temperature: 0.3,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      console.error("OpenAI API error:", response.status, await response.text());
      return { overallScore: 100, feedback: questions.map((_, i) => ({ index: i, isValid: true, score: 100, issues: [] })), verified: true };
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    
    return {
      overallScore: content.overallScore || 0,
      feedback: content.questions || [],
      verified: true,
    };
  } catch (error) {
    console.error("LLM verification error:", error);
    // If LLM fails, still allow submission to proceed to manual review
    return { overallScore: 100, feedback: questions.map((_, i) => ({ index: i, isValid: true, score: 100, issues: [] })), verified: true };
  }
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

  // First check organizationMembers table
  let member = await storage.getOrganizationMemberByUserId(user.id);
  
  // If not found in members table, check if user is an org_admin by accountType
  if (!member || member.role !== "admin") {
    // Get full user record to check accountType
    const fullUser = await storage.getUser(user.id);
    
    if (fullUser?.accountType === 'org_admin') {
      // Find organization by admin user ID
      const org = await storage.getOrganizationByAdminUserId(user.id);
      if (org) {
        // Create a virtual member object for org_admin users
        member = {
          id: user.id,
          userId: user.id,
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
}

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
    const pendingSubmissions = submissions.filter(s => s.status === "pending" || s.status === "in_review" || s.status === "llm_verified");
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

    // If organization has a curriculum set, validate the submission matches
    const organization = await storage.getOrganizationById(member.organizationId);
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
      submittedByUserId: user.id,
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
        const updateData: any = {
          llmVerificationStatus: result.verified ? "verified" : "failed",
          llmVerificationScore: result.overallScore,
          llmVerificationFeedback: result.feedback,
          llmVerifiedAt: new Date(),
        };
        
        // If LLM verified, update status to llm_verified for superadmin review
        if (result.verified && result.overallScore >= 50) {
          updateData.status = "llm_verified";
        }
        
        await storage.updateContributionSubmission(submission.id, updateData);
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
        awardedByUserId: user.id,
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
      user.id
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
