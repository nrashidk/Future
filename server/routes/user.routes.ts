import type { Express } from "express";
import { isAuthenticated } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
// The erasure sequence lives in services/ because a school admin removing a
// student now runs the same one (admin.routes.ts). Two callers, one definition.
import { eraseUserData, collectBlockingAuditRecords } from "../services/accountErasure";
import { dataExportLimiter, erasureConfirmationLimiter } from "../middleware/rateLimiter.middleware";
import { refuseErasureConfirmation } from "../services/erasureConfirmation";
// Export and data-summary read ONE enumeration, so the file and its count agree.
import { collectSubjectAccess, summarizeSubjectAccess, summarizeErasure } from "../services/subjectAccess";
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
   * GDPR/PDPL subject access: what the system holds about this person, as JSON.
   * The enumeration and what it withholds are in services/subjectAccess.ts; the
   * file's heldButNotIncluded section names what exists but is not in it.
   * Rate limited to 5 requests per hour to prevent abuse
   */
  app.get("/api/users/me/export", isAuthenticated, dataExportLimiter, async (req: any, res) => {
    try {
      const exportData = await collectSubjectAccess(db, req.user.userId);
      if (!exportData) {
        return res.status(404).json({ message: "User not found" });
      }

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
   * Body: { password } for an account with one, otherwise { confirmEmail }.
   */
  app.delete("/api/users/me", isAuthenticated, erasureConfirmationLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userId;

      // Verify user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // ASKED AGAIN, FIRST. A session proves a browser, not the person — see
      // services/erasureConfirmation.ts for the two checks and why they differ
      // in strength. First, so a refused confirmation never opens the
      // transaction below.
      const refusal = await refuseErasureConfirmation(user, req.body);
      if (refusal) {
        return res.status(refusal.status).json({ message: refusal.message, code: refusal.code });
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
        // Codes, which the client translates. No contact address: the one this
        // message used to give cannot receive mail (FOLLOWUP.md, "STEP 6
        // BLOCKED"), and a refusal that points at a dead address reads as a way
        // forward that is not there.
        return res.status(409).json({
          message: "Your account holds records of actions you performed on other people's data, which cannot be deleted without destroying their audit trail.",
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
      // Counted FROM the export's own enumeration. The old count was a second
      // hand-written list with a number on it — the same short list the export
      // had, presented as a total.
      const subject = await collectSubjectAccess(db, req.user.userId);
      if (!subject) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        ...summarizeSubjectAccess(subject),
        // Whether erasure would run, on the same response as the counts. See
        // summarizeErasure for why this is not its own endpoint.
        erasure: await summarizeErasure(db, req.user.userId, subject),
      });
    } catch (error) {
      console.error("Error fetching data summary:", error);
      res.status(500).json({ message: "Failed to fetch data summary" });
    }
  });
}
