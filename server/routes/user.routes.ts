import type { Express } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { db } from "../db";
import { users, assessments, recommendations, assessmentQuizzes, quizResponses, cvqResults } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerUserRoutes(app: Express) {
  /**
   * GET /api/users/me/export
   * GDPR Data Export: Returns all user data in a structured JSON format
   * Allows users to download a copy of their personal data
   */
  app.get("/api/users/me/export", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      
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
        assessmentRecommendations[assessment.id] = recs;
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
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      
      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get all user assessments for cascading deletion
      const userAssessments = await storage.getAssessmentsByUser(userId);

      // Delete in proper order (child records first to maintain referential integrity)
      await db.transaction(async (tx) => {
        for (const assessment of userAssessments) {
          // Delete CVQ results
          await tx.delete(cvqResults)
            .where(eq(cvqResults.assessmentId, assessment.id));

          // Delete quiz responses and quizzes
          const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
          if (quiz) {
            await tx.delete(quizResponses)
              .where(eq(quizResponses.assessmentQuizId, quiz.id));
            await tx.delete(assessmentQuizzes)
              .where(eq(assessmentQuizzes.assessmentId, assessment.id));
          }

          // Delete recommendations
          await tx.delete(recommendations)
            .where(eq(recommendations.assessmentId, assessment.id));
        }

        // Delete all user assessments
        await tx.delete(assessments)
          .where(eq(assessments.userId, userId));

        // Note: Sessions are NOT deleted here because:
        // 1. Session table uses 'sid' (session ID), not user ID - schema doesn't support user-based lookup
        // 2. Sessions have 24-hour TTL and will auto-expire
        // 3. Current session is destroyed via req.logout() below
        // This is compliant with GDPR as session cookies don't contain PII

        // Finally, delete the user
        await tx.delete(users)
          .where(eq(users.id, userId));
      });

      // Destroy the current session
      req.logout((err: any) => {
        if (err) {
          console.error("Error logging out after account deletion:", err);
        }
      });

      // Clear session cookie
      res.clearCookie("connect.sid");

      res.json({ 
        success: true, 
        message: "Account and all associated data have been permanently deleted" 
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
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      
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
