import type { Express } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import {
  users, assessments, recommendations, assessmentQuizzes, quizResponses,
  cvqResults, organizationMembers, wefCompetencyResults,
  organizations, organizationEvents, contributionSubmissions, contributionRewards,
  files, scoringConfigChangeLog, systemAnnouncements, systemConfig,
} from "@shared/schema";
import { eq, or, inArray } from "drizzle-orm";
import { dataExportLimiter } from "../middleware/rateLimiter.middleware";
import { toClientRecommendations } from "../utils/recommendationView";
import { z } from "zod";

/**
 * ERASURE'S DEPENDENT LIST — DERIVED, NOT REMEMBERED.
 *
 * The bug this replaces was not a wrong delete, it was a SHORT LIST. The old
 * sequence deleted cvq_results, quiz_responses, assessment_quizzes,
 * recommendations, assessments, organization_members, users — and omitted
 * wef_competency_results, which is NOT NULL -> assessments with NO ACTION
 * (schema.ts:401). So `delete(assessments)` raised 23503, the transaction rolled
 * back whole, and the right-to-erasure endpoint returned 500 for every user who
 * had ever completed a PREMIUM assessment. School students are forced premium
 * (auth.routes.ts:53) and premium is what writes that row
 * (recommendations.routes.ts:137 -> wefOrchestrator.ts:57), so the population
 * this route exists for is exactly the population it failed for.
 *
 * The full FK graph is enumerated in docs/erasure-dependent-list.md. Two rules
 * came out of it and both are load-bearing here:
 *
 * 1. DELETE BY OWNER, NOT BY PARENT ID. The old code deleted cvq_results inside
 *    a per-assessment loop keyed on assessment_id. cvq_results.assessment_id is
 *    NULLABLE (schema.ts:994) while its user_id is NOT NULL (:995), so a row
 *    written without an assessment was never reached by that loop and then
 *    blocked the users delete instead. Keying on the owner makes the list
 *    complete by construction rather than complete by inspection — which is the
 *    only durable defence against this bug class.
 *
 * 2. SUBJECT ROWS ARE ERASED; ACTOR ROWS ARE NOT. A row naming the user as the
 *    person who DID something belongs to someone else's audit trail. See
 *    collectBlockingAuditRecords below.
 */
export async function eraseUserData(tx: any, userId: string): Promise<void> {
  const owned = await tx
    .select({ id: assessments.id })
    .from(assessments)
    .where(eq(assessments.userId, userId));
  const assessmentIds: string[] = owned.map((a: { id: string }) => a.id);

  if (assessmentIds.length > 0) {
    const quizzes = await tx
      .select({ id: assessmentQuizzes.id })
      .from(assessmentQuizzes)
      .where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
    const quizIds: string[] = quizzes.map((q: { id: string }) => q.id);

    if (quizIds.length > 0) {
      await tx.delete(quizResponses).where(inArray(quizResponses.assessmentQuizId, quizIds));
    }
    await tx.delete(assessmentQuizzes).where(inArray(assessmentQuizzes.assessmentId, assessmentIds));
    await tx.delete(recommendations).where(inArray(recommendations.assessmentId, assessmentIds));
  }

  // BOTH PREDICATES, for cvq_results and wef_competency_results alike, and
  // neither half is redundant:
  //
  //   user_id      catches rows whose assessment_id is null — the case the old
  //                per-assessment loop could not reach (rule 1 above).
  //   assessment_id catches rows pointing at an assessment being deleted here.
  //                 wef_competency_results.user_id is NULLABLE (schema.ts:402)
  //                 and IS null for rows written while the assessment was still
  //                 a guest assessment, so a user_id-only delete would miss
  //                 precisely what a guest-then-registered student accumulated —
  //                 and then fail on delete(assessments) exactly as before.
  const ownedBy = (userCol: any, assessmentCol: any) =>
    assessmentIds.length > 0
      ? or(eq(userCol, userId), inArray(assessmentCol, assessmentIds))
      : eq(userCol, userId);

  await tx.delete(cvqResults).where(ownedBy(cvqResults.userId, cvqResults.assessmentId));
  await tx.delete(wefCompetencyResults)
    .where(ownedBy(wefCompetencyResults.userId, wefCompetencyResults.assessmentId));

  // llm_narrative_cache CASCADEs on assessments (schema.ts:1960), and
  // password_reset_tokens CASCADEs on users (:89). Nothing to write for either.
  await tx.delete(assessments).where(eq(assessments.userId, userId));
  await tx.delete(organizationMembers).where(eq(organizationMembers.userId, userId));
  await tx.delete(users).where(eq(users.id, userId));
}

/**
 * ROWS WHERE THE USER IS AN ACTOR, NOT THE SUBJECT.
 *
 * Each of these names the user as whoever performed an action recorded about a
 * school or about the platform. Erasing a school's activity log because its
 * admin exercised their own erasure right destroys someone else's record, so
 * this route refuses instead — a 409 naming what blocks it, rather than the
 * 23503-shaped 500 the same rows would otherwise produce.
 *
 * NO STUDENT CAN ACCUMULATE ANY OF THESE, verified per row in
 * docs/erasure-dependent-list.md §1c: organization_events.affected_user_id has
 * four write sites and all four target an admin; contributions are gated by
 * checkOrgAdmin; file upload is gated by isAdmin, which is superadmin. So
 * student and ordinary-account erasure runs the full sequence above and this
 * list comes back empty — which is the case the endpoint exists for.
 *
 * Making admin erasure work is a separate decision with a schema change behind
 * it: organizations.admin_user_id and organization_events.performed_by are both
 * NOT NULL with NO ACTION and cannot be nulled as they stand.
 */
export const BLOCKING_AUDIT_SOURCES: Array<{ table: any; column: any; label: string }> = [
  { table: organizations, column: organizations.adminUserId, label: "school records naming you as the registered administrator" },
  { table: organizationEvents, column: organizationEvents.performedBy, label: "school activity-log entries recording actions you performed" },
  { table: organizationEvents, column: organizationEvents.affectedUserId, label: "school activity-log entries recording actions taken on your admin account" },
  { table: files, column: files.uploadedBy, label: "files you uploaded" },
  { table: contributionSubmissions, column: contributionSubmissions.submittedByUserId, label: "question contributions you submitted" },
  { table: contributionSubmissions, column: contributionSubmissions.reviewedByUserId, label: "question contributions you reviewed" },
  { table: contributionRewards, column: contributionRewards.awardedByUserId, label: "contribution rewards you awarded" },
  { table: scoringConfigChangeLog, column: scoringConfigChangeLog.changedBy, label: "scoring-configuration changes you made" },
  { table: systemAnnouncements, column: systemAnnouncements.createdByUserId, label: "system announcements you created" },
  { table: systemConfig, column: systemConfig.updatedByUserId, label: "system settings you updated" },
];

export async function collectBlockingAuditRecords(tx: any, userId: string): Promise<string[]> {
  const blocking: string[] = [];
  for (const source of BLOCKING_AUDIT_SOURCES) {
    const rows = await tx
      .select({ id: source.column })
      .from(source.table)
      .where(eq(source.column, userId))
      .limit(1);
    if (rows.length > 0) blocking.push(source.label);
  }
  return blocking;
}

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
