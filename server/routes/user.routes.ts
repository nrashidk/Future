import type { Express } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
// The erasure sequence lives in services/ because a school admin removing a
// student now runs the same one (admin.routes.ts). Two callers, one definition.
import { eraseUserData, collectBlockingAuditRecords } from "../services/accountErasure";
import { dataExportLimiter } from "../middleware/rateLimiter.middleware";
import { toClientRecommendations } from "../utils/recommendationView";
import { z } from "zod";

export function registerUserRoutes(app: Express) {
  /**
   * PATCH /api/users/me/language
   * Update user's preferred language (en or ar)
   */
  app.patch("/api/users/me/language", isAuthenticated, async (req: any, res) => {
    try {
      const schema = z.object({ language: z.enum(["en", "ar"]) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid language. Must be 'en' or 'ar'." });
      }
      const userId = req.user.userId;
      await db.update(users)
        .set({ preferredLanguage: parsed.data.language })
        .where(eq(users.id, userId));
      res.json({ success: true, language: parsed.data.language });
    } catch (error) {
      console.error("Error updating language preference:", error);
      res.status(500).json({ message: "Failed to update language preference" });
    }
  });

  /**
   * GET /api/users/me/export
   * GDPR Data Export: Returns all user data in a structured JSON format
   * Allows users to download a copy of their personal data
   * Rate limited to 5 requests per hour to prevent abuse
   */
  app.get("/api/users/me/export", isAuthenticated, dataExportLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      // Fetch user profile
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Fetch all user assessments
      const userAssessments = await storage.getAssessmentsByUser(userId);

      // Fetch recommendations for each assessment
      const assessmentRecommendations: Record<string, any[]> = {};
      for (const assessment of userAssessments) {
        const recs = await storage.getRecommendationsByAssessment(assessment.id);
        // The export is student-facing too, and the same bare `db.select()` feeds
        // it. Withholding the scoring-regime identifiers does NOT narrow the
        // subject-access right: they describe the algorithm that ran, not the
        // person it ran on, and every score, reasoning and action step the row
        // holds about the student is still exported in full.
        assessmentRecommendations[assessment.id] = toClientRecommendations(recs);
      }

      // Fetch quiz data for each assessment
      const assessmentQuizData: Record<string, any> = {};
      for (const assessment of userAssessments) {
        const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
        if (quiz) {
          const responses = await storage.getQuizResponsesByQuizId(quiz.id);
          assessmentQuizData[assessment.id] = { quiz, responses };
        }
      }

      // Fetch CVQ results for each assessment
      const assessmentCvqResults: Record<string, any> = {};
      for (const assessment of userAssessments) {
        const cvqResult = await storage.getCvqResultByAssessmentId(assessment.id);
        if (cvqResult) {
          assessmentCvqResults[assessment.id] = cvqResult;
        }
      }

      // Compile complete data export
      const exportData = {
        exportedAt: new Date().toISOString(),
        exportVersion: "1.0",
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          accountType: user.accountType,
          isPremium: user.isPremium,
          createdAt: user.createdAt,
        },
        assessments: userAssessments.map(assessment => ({
          ...assessment,
          recommendations: assessmentRecommendations[assessment.id] || [],
          quizData: assessmentQuizData[assessment.id] || null,
          cvqResult: assessmentCvqResults[assessment.id] || null,
        })),
      };

      // Set headers for file download
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="user-data-export-${Date.now()}.json"`);
      
      res.json(exportData);
    } catch (error) {
      console.error("Error exporting user data:", error);
      res.status(500).json({ message: "Failed to export user data" });
    }
  });

  /**
   * DELETE /api/users/me
   * GDPR Right to Erasure: Deletes all user data and account
   * This is a destructive, irreversible operation
   */
  app.delete("/api/users/me", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // The blocking check runs INSIDE the transaction, on the same snapshot the
      // deletes would use, so it cannot be raced by a concurrent write that adds
      // an audit row between the check and the erasure.
      let blocking: string[] = [];
      await db.transaction(async (tx) => {
        blocking = await collectBlockingAuditRecords(tx, userId);
        if (blocking.length > 0) return; // nothing written; the tx commits empty
        await eraseUserData(tx, userId);
      });

      if (blocking.length > 0) {
        return res.status(409).json({
          message: "Your account holds records of actions you performed on other people's data, which cannot be deleted without destroying their audit trail. Contact privacy@futurepath.ae to have this handled individually.",
          code: "ERASURE_BLOCKED_BY_AUDIT_RECORDS",
          blockingRecords: blocking,
        });
      }

      // Destroy the current session immediately to invalidate server-side state
      await new Promise<void>((resolve) => {
        req.session.destroy((err: any) => {
          if (err) console.error("Error destroying session after account deletion:", err);
          resolve();
        });
      });

      // Clear the correct auth cookie (fp_session, not the express-session default connect.sid)
      res.clearCookie("fp_session", { path: "/", httpOnly: true });

      // SAY WHAT WAS DELETED, NOT "everything". The previous string —
      // "Account and all associated data have been permanently deleted" — is a
      // claim this route cannot make. organization_consents retains
      // performed_by_name and performed_by_email (schema.ts:1561-1562, both NOT
      // NULL) by deliberate design (:1553-1558): an attestation that dissolves
      // when its author leaves the school is not a record. That is empty for
      // students, who never attest, but the sentence was untrue for anyone who
      // had. An enumeration is both honest and more useful than a superlative.
      res.json({
        success: true,
        message: "Your account has been permanently deleted, along with your assessments, quiz responses, recommendations, career values results, WEF competency results and school enrolment record.",
        deleted: [
          "account",
          "assessments",
          "quiz responses",
          "recommendations",
          "career values results",
          "WEF competency results",
          "school enrolment record",
        ],
      });
    } catch (error) {
      console.error("Error deleting user account:", error);
      res.status(500).json({ message: "Failed to delete account" });
    }
  });

  /**
   * GET /api/users/me/data-summary
   * Returns a summary of what data is stored for the user
   * Useful for transparency before export or deletion
   */
  app.get("/api/users/me/data-summary", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userAssessments = await storage.getAssessmentsByUser(userId);
      
      let totalRecommendations = 0;
      let totalQuizResponses = 0;
      let totalCvqResults = 0;

      for (const assessment of userAssessments) {
        const recs = await storage.getRecommendationsByAssessment(assessment.id);
        totalRecommendations += recs.length;

        const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
        if (quiz) {
          const responses = await storage.getQuizResponsesByQuizId(quiz.id);
          totalQuizResponses += responses.length;
        }

        const cvqResult = await storage.getCvqResultByAssessmentId(assessment.id);
        if (cvqResult) {
          totalCvqResults++;
        }
      }

      res.json({
        accountCreated: user.createdAt,
        dataCategories: {
          profileData: true,
          assessments: userAssessments.length,
          careerRecommendations: totalRecommendations,
          quizResponses: totalQuizResponses,
          cvqResults: totalCvqResults,
        },
        totalRecords: 1 + userAssessments.length + totalRecommendations + totalQuizResponses + totalCvqResults,
      });
    } catch (error) {
      console.error("Error fetching data summary:", error);
      res.status(500).json({ message: "Failed to fetch data summary" });
    }
  });
}
