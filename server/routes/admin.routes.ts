import type { Express } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { isAdmin, isOrgAdmin } from "../middleware/auth.middleware";
import { insertQuizQuestionSchema } from "@shared/schema";
import { z } from "zod";

/**
 * Get superadmin emails from environment variable
 */
const getSuperadminEmails = (): string[] => {
  return (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim())
    .filter(e => e.length > 0);
};

export function registerAdminRoutes(app: Express) {
  // Super Admin Endpoints - Quiz Question Management
  app.get("/api/admin/questions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { countryId, subject, gradeBand, limit, offset } = req.query;
      
      const questions = await storage.getQuizQuestions({
        countryId: countryId as string,
        subject: subject as string,
        gradeBand: gradeBand as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      });
      
      res.json(questions);
    } catch (error) {
      console.error("Error fetching quiz questions:", error);
      res.status(500).json({ message: "Failed to fetch quiz questions" });
    }
  });

  app.post("/api/admin/questions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const validatedData = insertQuizQuestionSchema.parse(req.body);
      const question = await storage.createQuizQuestion(validatedData);
      res.status(201).json(question);
    } catch (error) {
      console.error("Error creating quiz question:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid question data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create quiz question" });
    }
  });

  app.patch("/api/admin/questions/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const validatedData = insertQuizQuestionSchema.partial().parse(req.body);
      const question = await storage.updateQuizQuestion(req.params.id, validatedData);
      if (!question) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json(question);
    } catch (error) {
      console.error("Error updating quiz question:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid question data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update quiz question" });
    }
  });

  app.delete("/api/admin/questions/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const deleted = await storage.deleteQuizQuestion(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Question not found" });
      }
      res.json({ success: true, message: "Question deleted successfully" });
    } catch (error) {
      console.error("Error deleting quiz question:", error);
      res.status(500).json({ message: "Failed to delete quiz question" });
    }
  });

  // Bulk operations
  app.post("/api/admin/questions/bulk-upload", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { questions, format } = req.body;
      
      if (!Array.isArray(questions)) {
        return res.status(400).json({ message: "Questions must be an array" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as any[],
      };

      for (const questionData of questions) {
        try {
          const validatedData = insertQuizQuestionSchema.parse(questionData);
          await storage.createQuizQuestion(validatedData);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            question: questionData.question?.substring(0, 50) + "...",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error bulk uploading questions:", error);
      res.status(500).json({ message: "Failed to bulk upload questions" });
    }
  });

  // Organization Management - Accessible by both superadmins and org admins
  // Org admins see only their organization, superadmins see all
  app.get("/api/admin/organizations", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) ||
        user.role === "superadmin";
      
      // Check if user is org admin
      const isOrgAdminUser = user.accountType === "org_admin";

      if (!isSuperadmin && !isOrgAdminUser) {
        return res.status(403).json({ message: "Forbidden: Admin or Organization Admin access required" });
      }

      // Superadmins get all organizations
      if (isSuperadmin) {
        const organizations = await storage.getAllOrganizations();
        return res.json(organizations);
      }
      
      // Org admins get only their organization
      const organization = await storage.getOrganizationByAdminUserId(userId);
      if (!organization) {
        return res.json([]);  // Return empty array if no organization found
      }
      
      res.json([organization]);  // Return as array to match superadmin response format
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  app.post("/api/admin/organizations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { name, adminUserId, totalLicenses } = req.body;
      
      if (!name || !adminUserId || !totalLicenses) {
        return res.status(400).json({ message: "Missing required fields: name, adminUserId, totalLicenses" });
      }

      const organization = await storage.createOrganization({
        name,
        adminUserId,
        totalLicenses: parseInt(totalLicenses),
        usedLicenses: 0,
      });

      res.status(201).json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  app.get("/api/admin/organizations/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const organization = await storage.getOrganizationById(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }
      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  app.patch("/api/admin/organizations/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { name, totalLicenses } = req.body;
      const updates: any = {};
      
      if (name !== undefined) updates.name = name;
      if (totalLicenses !== undefined) updates.totalLicenses = parseInt(totalLicenses);

      const organization = await storage.updateOrganization(req.params.id, updates);
      res.json(organization);
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ message: "Failed to update organization" });
    }
  });

  // Organization Member Management - Admin Endpoints
  app.get("/api/admin/organizations/:id/members", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) ||
        user.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      const isOrgAdminForThisOrg = user.accountType === "org_admin";
      if (isOrgAdminForThisOrg) {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) {
          return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const members = await storage.getOrganizationMembersByOrganizationId(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching organization members:", error);
      res.status(500).json({ message: "Failed to fetch organization members" });
    }
  });

  app.post("/api/admin/organizations/:id/members", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) ||
        user.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      const isOrgAdminForThisOrg = user.accountType === "org_admin";
      if (isOrgAdminForThisOrg) {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) {
          return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { username, fullName, grade, passwordComplexity = 'medium' } = req.body;
      const organizationId = req.params.id;

      if (!fullName || !grade) {
        return res.status(400).json({ message: "Missing required fields: fullName, grade" });
      }

      const result = await storage.createUserWithCredentials({
        username,
        fullName,
        grade: grade.toString(),
        passwordComplexity: passwordComplexity as 'easy' | 'medium' | 'strong',
        organizationId,
      });

      await storage.updateOrganizationQuota(organizationId, 1);

      res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating organization member:", error);
      if (error.message?.includes('Quota exceeded')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create organization member" });
    }
  });

  app.post("/api/admin/organizations/:id/members/bulk", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) ||
        user.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      const isOrgAdminForThisOrg = user.accountType === "org_admin";
      if (isOrgAdminForThisOrg) {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) {
          return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const { members, passwordComplexity = 'medium' } = req.body;
      const organizationId = req.params.id;

      // Validation: Check if members is an array
      if (!Array.isArray(members)) {
        return res.status(400).json({ message: "Members must be an array" });
      }
      
      // Validation: Check for empty array
      if (members.length === 0) {
        return res.status(400).json({ message: "Members array cannot be empty" });
      }
      
      // Validation: Check array size limit (max 500 members per request)
      const MAX_BULK_SIZE = 500;
      if (members.length > MAX_BULK_SIZE) {
        return res.status(400).json({ 
          message: `Bulk upload limited to ${MAX_BULK_SIZE} members per request. Please split into multiple requests.` 
        });
      }
      
      // Validation: Check each member has required fields and valid format
      for (let i = 0; i < members.length; i++) {
        const member = members[i];
        if (!member || typeof member !== 'object') {
          return res.status(400).json({ message: `Member at index ${i} must be an object` });
        }
        if (!member.fullName || typeof member.fullName !== 'string' || member.fullName.trim() === '') {
          return res.status(400).json({ message: `Member at index ${i} missing or invalid fullName` });
        }
        if (!member.grade) {
          return res.status(400).json({ message: `Member at index ${i} missing grade` });
        }
      }
      
      // Validation: Check passwordComplexity is valid
      if (passwordComplexity && !['easy', 'medium', 'strong'].includes(passwordComplexity)) {
        return res.status(400).json({ message: "Invalid passwordComplexity. Must be 'easy', 'medium', or 'strong'" });
      }

      const org = await storage.getOrganizationById(organizationId);
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const availableLicenses = org.totalLicenses - org.usedLicenses;
      if (members.length > availableLicenses) {
        return res.status(400).json({ 
          message: `Insufficient licenses: attempting to add ${members.length} students but only ${availableLicenses} licenses available` 
        });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as any[],
        credentials: [] as any[],
      };

      for (const memberData of members) {
        try {
          const { username, fullName, grade, studentId } = memberData;
          
          if (!fullName || !grade) {
            throw new Error("Missing required fields: fullName and grade");
          }

          const result = await storage.createUserWithCredentials({
            username: username || undefined,
            fullName,
            grade: grade.toString(),
            studentId: studentId || undefined,
            passwordComplexity: passwordComplexity as 'easy' | 'medium' | 'strong',
            organizationId,
          });

          await storage.updateOrganizationQuota(organizationId, 1);

          results.success++;
          results.credentials.push({
            username: result.user.username,
            password: result.password,
            fullName: `${result.user.firstName} ${result.user.lastName}`.trim(),
            grade: result.member.grade || '',
          });
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            member: memberData,
            error: error.message || "Unknown error",
          });
        }
      }

      res.json(results);
    } catch (error) {
      console.error("Error bulk creating members:", error);
      res.status(500).json({ message: "Failed to bulk create members" });
    }
  });

  app.patch("/api/admin/organizations/:id/members/:memberId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { fullName, grade } = req.body;
      const updates: any = {};
      
      if (fullName !== undefined) updates.fullName = fullName;
      if (grade !== undefined) updates.grade = parseInt(grade);

      const member = await storage.updateOrganizationMember(req.params.memberId, updates);
      res.json(member);
    } catch (error) {
      console.error("Error updating organization member:", error);
      res.status(500).json({ message: "Failed to update organization member" });
    }
  });

  app.delete("/api/admin/organizations/:id/members/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && user.email && superadminEmails.includes(user.email)) ||
        user.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      const isOrgAdminForThisOrg = user.accountType === "org_admin";
      if (isOrgAdminForThisOrg) {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) {
          return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const member = await storage.getOrganizationMemberById(req.params.memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      if (member.isLocked) {
        return res.status(400).json({ message: "Cannot delete member who has completed an assessment" });
      }

      await storage.deleteOrganizationMember(req.params.memberId);
      await storage.updateOrganizationQuota(req.params.id, -1);

      res.json({ success: true, message: "Member deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting organization member:", error);
      if (error.message?.includes('Cannot decrement')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to delete organization member" });
    }
  });

  app.post("/api/admin/organizations/:id/members/:memberId/reset-password", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).isLocal ? (req.user as any).userId : (req.user as any).claims.sub;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (!(req.user as any).isLocal && currentUser.email && superadminEmails.includes(currentUser.email)) ||
        currentUser.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      const isOrgAdminForThisOrg = currentUser.accountType === "org_admin";
      if (isOrgAdminForThisOrg) {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) {
          return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const { passwordComplexity = 'medium' } = req.body;
      const memberId = req.params.memberId;

      const member = await storage.getOrganizationMemberById(memberId);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }

      const user = await storage.getUser(member.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { generatePassword } = await import("../utils/passwordGenerator");
      const { hashPassword } = await import("../utils/passwordHash");

      const newPassword = generatePassword(passwordComplexity as 'easy' | 'medium' | 'strong');
      const passwordHash = await hashPassword(newPassword);

      await storage.upsertUser({
        id: user.id,
        passwordHash,
      });

      res.json({ 
        success: true, 
        password: newPassword,
        username: user.username 
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  app.get("/api/admin/questions/export", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { countryId, subject, gradeBand, format } = req.query;
      
      const questions = await storage.getQuizQuestions({
        countryId: countryId as string,
        subject: subject as string,
        gradeBand: gradeBand as string,
      });

      if (format === "csv") {
        const csvRows = [
          ["Question", "Type", "Subject", "Grade Band", "Country", "Topic", "Difficulty", "Cognitive Level", "Correct Answer", "Options (JSON)", "Explanation"].join(",")
        ];

        questions.forEach((q: any) => {
          const row = [
            `"${q.question.replace(/"/g, '""')}"`,
            q.questionType,
            q.subject,
            q.gradeBand,
            q.countryId || "global",
            q.topic,
            q.difficulty,
            q.cognitiveLevel,
            `"${q.correctAnswer.replace(/"/g, '""')}"`,
            `"${JSON.stringify(q.options).replace(/"/g, '""')}"`,
            `"${(q.explanation || '').replace(/"/g, '""')}"`,
          ];
          csvRows.push(row.join(","));
        });

        const csv = csvRows.join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="quiz-questions-${Date.now()}.csv"`);
        res.send(csv);
      } else {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="quiz-questions-${Date.now()}.json"`);
        res.json(questions);
      }
    } catch (error) {
      console.error("Error exporting questions:", error);
      res.status(500).json({ message: "Failed to export questions" });
    }
  });
}
