import type { Express } from "express";
import multer from "multer";
import path from "path";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { isAdmin, isOrgAdmin, getSuperadminEmails } from "../middleware/auth.middleware";
import { dataExportLimiter } from "../middleware/rateLimiter.middleware";
import { insertQuizQuestionSchema } from "@shared/schema";
import { toPublicUser } from "@shared/userPublic";
import { z } from "zod";
import { isPremiumAssessment } from "../utils/assessmentTier";
import * as fileStorage from "../services/fileStorage";

// Public assets (org logos) are still written to uploads/public and served
// statically. Private data uploads no longer touch disk at all — they go
// straight to the private Spaces bucket via fileStorage.
const makeDiskStorage = (subdir: string) => multer.diskStorage({
  destination: (req, file, cb) => {
    const fs = require('fs');
    const dir = path.join(process.cwd(), 'uploads', subdir);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

const publicDiskStorage = makeDiskStorage('public');

/** Collect a readable stream into a single Buffer. */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

// Configure multer for CSV/JSON data file uploads (private). memoryStorage: the
// CSV holds minors' personal data and never touches local disk — it is parsed
// from the request buffer and stored in the private Spaces bucket.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'text/csv',
      'application/json',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ];
    const allowedExtensions = ['.csv', '.json', '.xls', '.xlsx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed types: CSV, JSON, Excel, TXT'));
    }
  },
});

// Configure multer for image uploads (logos, etc.) — public
const imageUpload = multer({
  storage: publicDiskStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for images
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed. Allowed image types: PNG, JPG, GIF, WebP'));
    }
  },
});

export function registerAdminRoutes(app: Express) {
  // Super Admin Endpoints - Quiz Question Management
  app.get("/api/admin/questions", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { countryId, curriculum, subject, grade, gradeBand, limit, offset } = req.query;
      
      const questions = await storage.getQuizQuestions({
        countryId: countryId as string,
        curriculum: curriculum as string,
        subject: subject as string,
        grade: grade ? parseInt(grade as string) : undefined,
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
      
      // Validate subject exists for the curriculum if both are provided
      if (validatedData.countryId && validatedData.curriculum && validatedData.subject) {
        const validSubject = await storage.getSubjectByCode(
          validatedData.countryId, 
          validatedData.curriculum, 
          validatedData.subject
        );
        if (!validSubject) {
          const availableSubjects = await storage.getSubjectsByCurriculum(
            validatedData.countryId, 
            validatedData.curriculum
          );
          const subjectList = availableSubjects.map(s => s.code).join(", ");
          return res.status(400).json({ 
            message: `Invalid subject '${validatedData.subject}' for ${validatedData.curriculum} curriculum.${subjectList ? ` Valid options: ${subjectList}` : " No subjects available for this curriculum."}`
          });
        }
      }
      
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
          
          // Validate subject exists for the curriculum if both are provided
          if (validatedData.countryId && validatedData.curriculum && validatedData.subject) {
            const validSubject = await storage.getSubjectByCode(
              validatedData.countryId, 
              validatedData.curriculum, 
              validatedData.subject
            );
            if (!validSubject) {
              results.failed++;
              results.errors.push({
                question: questionData.question?.substring(0, 50) + "...",
                error: `Invalid subject '${validatedData.subject}' for ${validatedData.curriculum} curriculum`,
              });
              continue;
            }
          }
          
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
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin (getSuperadminEmails already returns lowercase)
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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
      const { name, adminUserId, totalLicenses, isUnlimitedLicenses = false } = req.body;
      
      if (!name || !adminUserId || (!totalLicenses && !isUnlimitedLicenses)) {
        return res.status(400).json({ message: "Missing required fields: name, adminUserId, and either totalLicenses or isUnlimitedLicenses" });
      }

      const organization = await storage.createOrganization({
        name,
        adminUserId,
        totalLicenses: isUnlimitedLicenses ? 0 : parseInt(totalLicenses),
        usedLicenses: 0,
        isUnlimitedLicenses: Boolean(isUnlimitedLicenses),
      });

      res.status(201).json(organization);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create school" });
    }
  });

  app.get("/api/admin/organizations/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const organization = await storage.getOrganizationById(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }
      res.json(organization);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch school" });
    }
  });

  app.patch("/api/admin/organizations/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin (getSuperadminEmails already returns lowercase)
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
        user.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      let isOrgAdminForThisOrg = false;
      if (user.accountType === "org_admin") {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (userOrg && userOrg.id === req.params.id) {
          isOrgAdminForThisOrg = true;
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      const { name, totalLicenses, isUnlimitedLicenses, logoUrl, countryId, curriculum } = req.body;
      const updates: any = {};
      
      if (name !== undefined) updates.name = name;
      // Only superadmins can change license settings
      if (isSuperadmin) {
        if (totalLicenses !== undefined) updates.totalLicenses = parseInt(totalLicenses);
        if (isUnlimitedLicenses !== undefined) updates.isUnlimitedLicenses = Boolean(isUnlimitedLicenses);
      }
      if (logoUrl !== undefined) updates.logoUrl = logoUrl;
      if (countryId !== undefined) updates.countryId = countryId;
      if (curriculum !== undefined) updates.curriculum = curriculum;

      const organization = await storage.updateOrganization(req.params.id, updates);
      res.json(organization);
    } catch (error) {
      console.error("Error updating organization:", error);
      res.status(500).json({ message: "Failed to update school" });
    }
  });

  // Upload organization logo
  app.post("/api/admin/organizations/:id/logo", isAuthenticated, imageUpload.single("logo"), async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin (getSuperadminEmails already returns lowercase)
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
        user.role === "superadmin";
      
      // Check if user is org admin for THIS specific organization
      let isOrgAdminForThisOrg = false;
      if (user.accountType === "org_admin") {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (userOrg && userOrg.id === req.params.id) {
          isOrgAdminForThisOrg = true;
        }
      }

      if (!isSuperadmin && !isOrgAdminForThisOrg) {
        if (req.file) {
          const fs = await import('fs/promises');
          await fs.default.unlink(req.file.path).catch(() => {});
        }
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Validate file type
      const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(req.file.mimetype)) {
        const fs = await import('fs/promises');
        await fs.default.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: "Invalid file type. Only PNG, JPG, GIF, and WebP are allowed." });
      }

      // Build the URL for the uploaded file
      const logoUrl = `/uploads/${req.file.filename}`;
      
      // Update the organization with the new logo URL
      const organization = await storage.updateOrganization(req.params.id, { logoUrl });
      
      res.json({ logoUrl, organization });
    } catch (error) {
      console.error("Error uploading organization logo:", error);
      if (req.file) {
        const fs = await import('fs/promises');
        await fs.default.unlink(req.file.path).catch(() => {});
      }
      res.status(500).json({ message: "Failed to upload logo" });
    }
  });

  // Organization Member Management - Admin Endpoints
  app.get("/api/admin/organizations/:id/members", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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

      const { username, fullName, grade, passwordComplexity = 'medium', studentId, studentName, studentAge, studentGender } = req.body;
      const organizationId = req.params.id;

      if (!fullName || !grade) {
        return res.status(400).json({ message: "Missing required fields: fullName, grade" });
      }

      // Check available capacity
      const capacity = await storage.getOrganizationAvailableCapacity(organizationId);
      if (!capacity.isUnlimited && capacity.totalAvailable < 1) {
        return res.status(400).json({ 
          message: "No available capacity. All licenses and reward credits have been used." 
        });
      }

      const result = await storage.createUserWithCredentials({
        username,
        fullName,
        grade: grade.toString(),
        studentId: studentId || undefined,
        studentName: studentName || undefined,
        studentAge: studentAge ? parseInt(studentAge.toString()) : undefined,
        studentGender: studentGender || undefined,
        passwordComplexity: passwordComplexity as 'medium' | 'strong',
        organizationId,
      });

      // Consume license with reward credits priority
      const { type } = await storage.consumeLicenseWithRewardPriority(organizationId);

      res.status(201).json({
        ...result,
        user: toPublicUser(result.user), // result.password stays: admin must hand it to the student
        licenseType: type, // 'reward' or 'paid'
      });
    } catch (error: any) {
      console.error("Error creating organization member:", error);
      if (error.message?.includes('Quota exceeded') || error.message?.includes('capacity')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to create organization member" });
    }
  });

  app.post("/api/admin/organizations/:id/members/bulk", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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
      
      // Validation: Check passwordComplexity is valid (only medium and strong allowed for security)
      if (passwordComplexity && !['medium', 'strong'].includes(passwordComplexity)) {
        return res.status(400).json({ message: "Invalid passwordComplexity. Must be 'medium' or 'strong'" });
      }

      const org = await storage.getOrganizationById(organizationId);
      if (!org) {
        return res.status(404).json({ message: "School not found" });
      }

      // Check total available capacity (reward credits + paid licenses)
      const capacity = await storage.getOrganizationAvailableCapacity(organizationId);
      if (!capacity.isUnlimited && members.length > capacity.totalAvailable) {
        return res.status(400).json({ 
          message: `Insufficient capacity: attempting to add ${members.length} students but only ${capacity.totalAvailable} available (${capacity.availableRewardCredits} reward credits + ${capacity.availablePaidLicenses} paid licenses)` 
        });
      }

      const results = {
        success: 0,
        failed: 0,
        rewardCreditsUsed: 0,
        paidLicensesUsed: 0,
        errors: [] as any[],
        credentials: [] as any[],
      };

      for (const memberData of members) {
        try {
          const { username, fullName, grade, studentId, studentName, studentAge, studentGender } = memberData;
          
          if (!fullName || !grade) {
            throw new Error("Missing required fields: fullName and grade");
          }

          const result = await storage.createUserWithCredentials({
            username: username || undefined,
            fullName,
            grade: grade.toString(),
            studentId: studentId || undefined,
            studentName: studentName || undefined,
            studentAge: studentAge ? parseInt(studentAge.toString()) : undefined,
            studentGender: studentGender || undefined,
            passwordComplexity: passwordComplexity as 'medium' | 'strong',
            organizationId,
          });

          // Consume license with reward credits priority
          const { type } = await storage.consumeLicenseWithRewardPriority(organizationId);
          if (type === 'reward') {
            results.rewardCreditsUsed++;
          } else {
            results.paidLicensesUsed++;
          }

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

  app.patch("/api/admin/organizations/:id/members/:memberId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(403).json({ message: "Forbidden" });

      const superadminEmails = getSuperadminEmails();
      const isSuperadmin =
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
        user.role === "superadmin";

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

      const existingMember = await storage.getOrganizationMemberById(req.params.memberId);
      if (!existingMember) {
        return res.status(404).json({ message: "Member not found" });
      }

      // CRITICAL SECURITY: Verify member belongs to the organization in the URL
      if (existingMember.organizationId !== req.params.id) {
        return res.status(403).json({ message: "Forbidden: Member does not belong to this organization" });
      }

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
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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

      // CRITICAL SECURITY: Verify member belongs to the organization in the URL
      if (member.organizationId !== req.params.id) {
        return res.status(403).json({ message: "Forbidden: Member does not belong to this organization" });
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

  app.post("/api/admin/organizations/:id/members/bulk-delete", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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

      const { memberIds } = req.body;
      
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({ message: "memberIds must be a non-empty array" });
      }

      // Validate all members exist, belong to this org, and are not locked
      const members = await Promise.all(
        memberIds.map(id => storage.getOrganizationMemberById(id))
      );

      // CRITICAL SECURITY: Verify all members belong to this organization
      const foreignMembers = members.filter((m, i) => m && m.organizationId !== req.params.id).map((m, i) => memberIds[i]);
      if (foreignMembers.length > 0) {
        return res.status(403).json({ 
          message: "Forbidden: Some members do not belong to this organization",
          foreignMembers 
        });
      }

      const lockedMembers = members.filter((m, i) => m && m.isLocked).map((m, i) => memberIds[i]);
      if (lockedMembers.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete members who have completed assessments",
          lockedMembers 
        });
      }

      const validMemberIds = members.filter(m => m !== undefined).map((m: any) => m.id);
      
      if (validMemberIds.length === 0) {
        return res.status(404).json({ message: "No valid members found" });
      }

      const deletedCount = await storage.bulkDeleteOrganizationMembers(validMemberIds);
      await storage.updateOrganizationQuota(req.params.id, -deletedCount);

      res.json({ 
        success: true, 
        deletedCount,
        message: `Successfully deleted ${deletedCount} member(s)` 
      });
    } catch (error: any) {
      console.error("Error bulk deleting organization members:", error);
      if (error.message?.includes('Cannot decrement')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to bulk delete members" });
    }
  });

  // Bulk reset passwords for organization members
  app.post("/api/admin/organizations/:id/members/bulk-reset-passwords", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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

      const { memberIds } = req.body;
      
      if (!Array.isArray(memberIds) || memberIds.length === 0) {
        return res.status(400).json({ message: "memberIds must be a non-empty array" });
      }

      if (memberIds.length > 100) {
        return res.status(400).json({ message: "Maximum 100 members per batch" });
      }

      const { generatePassword } = await import("../utils/passwordGenerator");
      const { hashPassword } = await import("../utils/passwordHash");

      const results = await Promise.all(memberIds.map(async (memberId: string) => {
        try {
          const member = await storage.getOrganizationMemberById(memberId);
          if (!member) {
            return { userId: memberId, username: null, newPassword: null, success: false, error: "Member not found" };
          }
          
          // CRITICAL SECURITY: Verify member belongs to this organization
          if (member.organizationId !== req.params.id) {
            return { userId: memberId, username: null, newPassword: null, success: false, error: "Member does not belong to this organization" };
          }
          
          const memberUser = await storage.getUser(member.userId);
          if (!memberUser) {
            return { userId: memberId, username: null, newPassword: null, success: false, error: "User not found" };
          }
          
          if (!memberUser.username || !memberUser.passwordHash) {
            return { userId: memberId, username: memberUser.username, newPassword: null, success: false, error: "User does not have local credentials" };
          }
          
          const newPassword = generatePassword("strong");
          const passwordHash = await hashPassword(newPassword);
          
          await storage.upsertUser({
            ...memberUser,
            passwordHash,
          });
          
          // Update the member's password reset tracking
          await storage.updateOrganizationMember(memberId, {
            passwordLastResetAt: new Date(),
            passwordLastResetBy: userId,
          });
          
          return { userId: memberId, username: memberUser.username, newPassword, success: true };
        } catch (error: any) {
          return { userId: memberId, username: null, newPassword: null, success: false, error: error.message || "Unknown error" };
        }
      }));
      
      res.json({ 
        success: true, 
        results,
        summary: {
          total: results.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        }
      });
    } catch (error) {
      console.error("Error bulk resetting passwords:", error);
      res.status(500).json({ message: "Failed to bulk reset passwords" });
    }
  });

  app.post("/api/admin/organizations/:id/members/:memberId/reset-password", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const currentUser = await storage.getUser(userId);
      
      if (!currentUser) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (currentUser.email && superadminEmails.includes(currentUser.email.toLowerCase())) ||
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

      // CRITICAL SECURITY: Verify member belongs to the organization in the URL
      if (member.organizationId !== req.params.id) {
        return res.status(403).json({ message: "Forbidden: Member does not belong to this organization" });
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

  app.get("/api/admin/questions/export", isAuthenticated, isAdmin, dataExportLimiter, async (req, res) => {
    try {
      const { countryId, curriculum, subject, grade, gradeBand, format } = req.query;
      
      const questions = await storage.getQuizQuestions({
        countryId: countryId as string,
        curriculum: curriculum as string,
        subject: subject as string,
        grade: grade ? parseInt(grade as string) : undefined,
        gradeBand: gradeBand as string,
      });

      if (format === "csv") {
        const csvRows = [
          ["Question", "Type", "Subject", "Grade", "Grade Band (Legacy)", "Country", "Curriculum", "Topic", "Difficulty", "Cognitive Level", "Correct Answer", "Options (JSON)", "Explanation"].join(",")
        ];

        questions.forEach((q: any) => {
          const row = [
            `"${q.question.replace(/"/g, '""')}"`,
            q.questionType,
            q.subject,
            q.grade || "",
            q.gradeBand || "",
            q.countryId || "global",
            q.curriculum || "",
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

  // Bulk Export: Student Reports (PDFs in ZIP)
  app.get("/api/admin/organizations/:id/export/reports", isAuthenticated, dataExportLimiter, async (req, res) => {
    let browser: any = null;
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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

      const organizationId = req.params.id;
      const organization = await storage.getOrganizationById(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      // Get all members with completed assessments
      const members = await storage.getOrganizationMembersByOrganizationId(organizationId);
      const completedMembers = members.filter(m => m.hasCompletedAssessment);

      if (completedMembers.length === 0) {
        return res.status(404).json({ message: "No completed assessments found" });
      }

      console.log(`Generating ${completedMembers.length} PDF reports for organization ${organization.name}...`);

      // Import archiver for creating ZIP files
      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 9 } });

      // Set response headers for ZIP download
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${organization.name.replace(/[^a-zA-Z0-9]/g, '_')}_Reports_${Date.now()}.zip"`);

      // Pipe archive to response
      archive.pipe(res);

      // Launch browser once for all PDFs
      // Note: --no-sandbox is required in containerized environments like Replit
      // Security is maintained through strict URL validation below
      const puppeteer = (await import("puppeteer")).default;
      // Respect PUPPETEER_EXECUTABLE_PATH if the deploy env pins a specific
      // binary. Otherwise omit executablePath entirely and let Puppeteer use the
      // browser it manages itself (installed by `puppeteer browsers install`).
      // Deliberately NOT falling back to a `which chromium` lookup: that would
      // silently render with an unknown system Chrome version, and a base-image
      // change could flip which binary is used with no signal.
      const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      browser = await puppeteer.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });

      // SECURITY: Comprehensive URL validation to prevent SSRF attacks
      const validatePdfUrl = (url: string) => {
        try {
          const parsedUrl = new URL(url);
          
          // Only allow http/https protocols (block file://, data://, javascript://, etc.)
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error('Only http/https protocols are allowed');
          }
          
          // Only allow localhost for PDF generation (internal service only)
          const allowedHosts = ['localhost', '127.0.0.1'];
          if (!allowedHosts.includes(parsedUrl.hostname)) {
            throw new Error('Only localhost URLs are allowed for PDF generation');
          }
          
          // Block attempts to use IP representation tricks
          const host = parsedUrl.hostname.toLowerCase();
          if (host.includes('0x') || host.includes('%') || host.includes('::')) {
            throw new Error('IP representation tricks are not allowed');
          }
          
          // Only allow specific port
          const allowedPort = process.env.PORT || '5000';
          if (parsedUrl.port && parsedUrl.port !== allowedPort) {
            throw new Error(`Only port ${allowedPort} is allowed`);
          }
        } catch (e) {
          throw new Error(`Invalid PDF generation URL: ${(e as Error).message}`);
        }
      };

      // Track per-student export results for the summary file
      const SAFETY_NET_WARNING = "[ResultsPrint] Safety-net timeout fired";
      interface StudentExportResult {
        fileName: string;
        displayName: string;
        username: string;
        status: "ok" | "aiInsightsIncomplete" | "failed";
        aiInsightsIncomplete: boolean;
        note?: string;
      }
      const exportResults: StudentExportResult[] = [];

      // Generate each PDF
      for (const member of completedMembers) {
        let page: any = null;
        try {
          const memberUser = await storage.getUser(member.userId);
          if (!memberUser) continue;

          // Find the assessment for this member
          const assessments = await storage.getAssessmentsByUser(member.userId);
          const completedAssessment = assessments.find((a: any) => a.isCompleted);
          
          if (!completedAssessment) continue;

          page = await browser.newPage();

          // Listen for console messages to detect the AI-insights safety-net warning
          let safetyNetFired = false;
          page.on('console', (msg: any) => {
            if (msg.type() === 'warning' && msg.text().includes(SAFETY_NET_WARNING)) {
              safetyNetFired = true;
            }
          });

          // Normalize language to the allowed set — never pass arbitrary DB values as URL params
          const ALLOWED_LANGS = ["en", "ar"] as const;
          const rawLang = memberUser.preferredLanguage || "en";
          const userLang: string = (ALLOWED_LANGS as readonly string[]).includes(rawLang) ? rawLang : "en";
          const printUrl = `http://localhost:${process.env.PORT || 5000}/print/results?assessmentId=${completedAssessment.id}&lang=${userLang}`;
          
          // Validate URL before navigation
          validatePdfUrl(printUrl);

          await page.goto(printUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000,
          });

          await page.waitForFunction(() => (window as any).__REPORT_READY__ === true, {
            timeout: 30000,
          });

          const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
          });

          // Add PDF to archive with safe filename
          const safeFileName = `${memberUser.username || member.id}_${memberUser.firstName}_${memberUser.lastName}.pdf`.replace(/[^a-zA-Z0-9._-]/g, '_');
          archive.append(Buffer.from(pdfBuffer), { name: safeFileName });

          const displayName = [memberUser.firstName, memberUser.lastName].filter(Boolean).join(' ') || memberUser.username || member.id;
          exportResults.push({
            fileName: safeFileName,
            displayName,
            username: memberUser.username || member.id,
            status: safetyNetFired ? "aiInsightsIncomplete" : "ok",
            aiInsightsIncomplete: safetyNetFired,
            ...(safetyNetFired ? { note: "AI insights may be partial — PDF was captured before all LLM content finished loading." } : {}),
          });

          if (safetyNetFired) {
            console.warn(`[BulkExport] Safety-net fired for ${memberUser.username} (${safeFileName}) — AI insights may be incomplete`);
          } else {
            console.log(`Generated PDF for ${memberUser.username} (${safeFileName})`);
          }
        } catch (error) {
          console.error(`Error generating PDF for member ${member.id}:`, error);
          // Record the failure in the summary and continue with next member
          try {
            const memberUser = await storage.getUser(member.userId);
            const displayName = memberUser
              ? ([memberUser.firstName, memberUser.lastName].filter(Boolean).join(' ') || memberUser.username || member.id)
              : member.id;
            exportResults.push({
              fileName: "",
              displayName,
              username: memberUser?.username || member.id,
              status: "failed",
              aiInsightsIncomplete: false,
              note: "PDF generation failed — no file was added to the archive.",
            });
          } catch {
            exportResults.push({
              fileName: "",
              displayName: member.id,
              username: member.id,
              status: "failed",
              aiInsightsIncomplete: false,
              note: "PDF generation failed — no file was added to the archive.",
            });
          }
        } finally {
          // Always close the page to prevent memory leaks
          if (page) {
            try {
              await page.close();
            } catch (closeError) {
              console.error(`Error closing page for member ${member.id}:`, closeError);
            }
          }
        }
      }

      await browser.close();
      browser = null;

      // Append the export summary JSON so admins know which PDFs may have incomplete AI content
      const incompleteCount = exportResults.filter(r => r.aiInsightsIncomplete).length;
      const failedCount = exportResults.filter(r => r.status === "failed").length;
      // Both "ok" and "aiInsightsIncomplete" records produced a PDF file
      const generatedPdfCount = exportResults.filter(r => r.status !== "failed").length;
      const summary = {
        generatedAt: new Date().toISOString(),
        organization: organization.name,
        totalStudents: exportResults.length,
        generatedPdfCount,
        fullAiPdfs: exportResults.filter(r => r.status === "ok").length,
        partialAiPdfs: incompleteCount,
        failedPdfs: failedCount,
        note: incompleteCount > 0
          ? `${incompleteCount} PDF(s) were captured before all AI insights finished loading. ` +
            "The career recommendations are complete, but personalized narrative sections may be missing or partial. " +
            "See the 'students' list below to identify affected reports."
          : "All PDFs were generated with full AI insights.",
        students: exportResults,
      };
      archive.append(Buffer.from(JSON.stringify(summary, null, 2), 'utf-8'), { name: '_export_summary.json' });

      // Finalize archive
      await archive.finalize();
      console.log(`ZIP archive completed with ${exportResults.length} reports (${incompleteCount} with incomplete AI insights, ${failedCount} failed)`);
    } catch (error) {
      console.error("Error generating bulk PDF reports:", error);
      if (browser) {
        try {
          await browser.close();
        } catch (closeError) {
          console.error("Error closing browser:", closeError);
        }
      }
      res.status(500).json({ message: "Failed to generate bulk PDF reports" });
    }
  });

  // Bulk Export: Student Data (CSV)
  app.get("/api/admin/organizations/:id/export/csv", isAuthenticated, dataExportLimiter, async (req, res) => {
    try {
      const userId = (req.user as any).userId;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Check if user is superadmin
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = 
        (user.email && superadminEmails.includes(user.email.toLowerCase())) ||
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

      const organizationId = req.params.id;
      const organization = await storage.getOrganizationById(organizationId);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      // Get all members
      const members = await storage.getOrganizationMembersByOrganizationId(organizationId);

      // Helper function to determine member status
      const getMemberStatus = (member: any, memberUser: any, hasCompletedAssessment: boolean, hasInProgressAssessment: boolean) => {
        if (member.role === 'admin') return 'Admin';
        if (hasCompletedAssessment) return 'Completed';
        if (hasInProgressAssessment) return 'In Progress';
        if (memberUser.lastLoginAt) return 'Active';
        return 'Not Active';
      };

      // CSV Header
      const csvRows = [
        [
          "Username",
          "Full Name",
          "Role",
          "Grade",
          "Gender",
          "Last Login",
          "Status",
          "Assessment Status",
          "Assessment Type",
          "Country",
          "Top Career 1",
          "Top Career 2",
          "Top Career 3",
          "Career Personality (Top)",
          "Top Value",
          "Quiz Score (%)",
          "Completion Date"
        ].join(",")
      ];

      // Process each member
      for (const member of members) {
        const memberUser = await storage.getUser(member.userId);
        if (!memberUser) continue;

        const fullName = `${memberUser.firstName} ${memberUser.lastName}`.trim();
        const assessments = await storage.getAssessmentsByUser(member.userId);
        const completedAssessment = assessments.find((a: any) => a.isCompleted);
        const inProgressAssessment = assessments.find((a: any) => !a.isCompleted);
        const lastLogin = memberUser.lastLoginAt ? new Date(memberUser.lastLoginAt).toLocaleDateString() : '';
        const role = member.role === 'admin' ? 'Admin' : 'Student';
        const status = getMemberStatus(member, memberUser, !!completedAssessment, !!inProgressAssessment);

        if (!completedAssessment) {
          // Member without completed assessment
          csvRows.push([
            `"${(memberUser.username || '').replace(/"/g, '""')}"`,
            `"${fullName.replace(/"/g, '""')}"`,
            `"${role}"`,
            `"${member.grade || ''}"`,
            `"${member.studentGender || ''}"`,
            `"${lastLogin}"`,
            `"${status}"`,
            member.role === 'admin' ? 'N/A' : (inProgressAssessment ? 'In Progress' : 'Not Started'),
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            ""
          ].join(","));
          continue;
        }

        // Get recommendations and fetch career details
        const recommendations = await storage.getRecommendationsByAssessment(completedAssessment.id);
        const topCareers: string[] = [];
        for (const rec of recommendations.slice(0, 3)) {
          const career = await storage.getCareerById(rec.careerId);
          topCareers.push(career?.title || '');
        }

        // Extract assessment data
        const riasecScores = completedAssessment.riasecScores as any;
        // Filter out non-numeric entries like 'top3' and 'ranking' before sorting
        const riasecEntries = riasecScores ? Object.entries(riasecScores).filter(([key, val]) => typeof val === 'number') : [];
        const topRiasecCode = riasecEntries.length > 0 ? riasecEntries.sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '' : '';
        // Map RIASEC codes to full names
        const riasecNames: Record<string, string> = {
          'R': 'Realistic', 'I': 'Investigative', 'A': 'Artistic',
          'S': 'Social', 'E': 'Enterprising', 'C': 'Conventional'
        };
        const topRiasec = riasecNames[topRiasecCode] || topRiasecCode;
        const cvqScores = completedAssessment.cvqScores as any;
        const cvqEntries = cvqScores ? Object.entries(cvqScores).filter(([key, val]) => typeof val === 'number') : [];
        const topValue = cvqEntries.length > 0 ? cvqEntries.sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || '' : '';
        // quizScore can be a number directly or an object with .overall
        const quizScoreRaw = completedAssessment.quizScore;
        const quizScore = typeof quizScoreRaw === 'number' ? quizScoreRaw : ((quizScoreRaw as any)?.overall ? Math.round((quizScoreRaw as any).overall) : 0);
        const completionDate = completedAssessment.completedAt ? new Date(completedAssessment.completedAt).toLocaleDateString() : '';

        const country = completedAssessment.countryId ? await storage.getCountryById(completedAssessment.countryId) : null;

        csvRows.push([
          `"${(memberUser.username || '').replace(/"/g, '""')}"`,
          `"${fullName.replace(/"/g, '""')}"`,
          `"${role}"`,
          `"${member.grade || ''}"`,
          `"${member.studentGender || ''}"`,
          `"${lastLogin}"`,
          `"${status}"`,
          "Completed",
          "Premium", // School students always have premium access
          `"${(country?.name || '').replace(/"/g, '""')}"`,
          `"${(topCareers[0] || '').replace(/"/g, '""')}"`,
          `"${(topCareers[1] || '').replace(/"/g, '""')}"`,
          `"${(topCareers[2] || '').replace(/"/g, '""')}"`,
          `"${topRiasec.replace(/"/g, '""')}"`,
          `"${topValue.replace(/"/g, '""')}"`,
          `${quizScore}`,
          `"${completionDate}"`
        ].join(","));
      }

      const csv = csvRows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${organization.name.replace(/[^a-zA-Z0-9]/g, '_')}_Student_Data_${Date.now()}.csv"`);
      res.send("\uFEFF" + csv); // Add BOM for Excel compatibility
    } catch (error) {
      console.error("Error generating CSV export:", error);
      res.status(500).json({ message: "Failed to generate CSV export" });
    }
  });

  // Export organization students data as file (CSV or JSON) - saved to files table
  app.post("/api/admin/organizations/:id/export-students", isAuthenticated, dataExportLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(403).json({ message: "Forbidden" });
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = (user.email && superadminEmails.includes(user.email.toLowerCase())) || user.role === "superadmin";
      if (!isSuperadmin && user.accountType === "org_admin") {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
      } else if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      const { format = 'csv' } = req.body; // 'csv' or 'json'
      
      const organization = await storage.getOrganizationById(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      const members = await storage.getOrganizationMembersByOrganizationId(req.params.id);

      let fileContent: string;
      let mimeType: string;
      let filename: string;

      if (format === 'json') {
        // JSON export with full member details
        const exportData = [];
        for (const member of members) {
          const memberUser = await storage.getUser(member.userId);
          if (!memberUser) continue;

          const fullName = [memberUser.firstName, memberUser.lastName].filter(Boolean).join(' ');
          const assessments = await storage.getAssessmentsByUser(member.userId);
          const completedAssessment = assessments.find(a => a.isCompleted);

          exportData.push({
            username: memberUser.username,
            fullName,
            grade: member.grade,
            studentId: member.studentId,
            studentName: member.studentName,
            studentAge: member.studentAge,
            studentGender: member.studentGender,
            status: completedAssessment ? 'completed' : 'pending',
            assessmentType: completedAssessment?.assessmentType,
            completedAt: completedAssessment?.completedAt,
            createdAt: member.createdAt,
          });
        }

        fileContent = JSON.stringify(exportData, null, 2);
        mimeType = 'application/json';
        filename = `${organization.name.replace(/[^a-zA-Z0-9]/g, '_')}_Students_${Date.now()}.json`;
      } else {
        // CSV export with formula injection protection
        const sanitizeCSV = (value: string): string => {
          const val = String(value || '').replace(/"/g, '""');
          // Neutralize formula injection by prefixing with single quote
          if (val.length > 0 && /^[=+\-@\t\r]/.test(val)) {
            return `"'${val}"`;
          }
          return `"${val}"`;
        };

        const csvRows = [
          'Username,Full Name,Grade,Gender,Status,Created Date'
        ];

        for (const member of members) {
          const memberUser = await storage.getUser(member.userId);
          if (!memberUser) continue;

          const fullName = [memberUser.firstName, memberUser.lastName].filter(Boolean).join(' ');
          const assessments = await storage.getAssessmentsByUser(member.userId);
          const completedAssessment = assessments.find(a => a.isCompleted);
          const createdDate = member.createdAt ? new Date(member.createdAt).toLocaleDateString() : '';

          csvRows.push([
            sanitizeCSV(memberUser.username || ''),
            sanitizeCSV(fullName),
            sanitizeCSV(member.grade || ''),
            sanitizeCSV(member.studentGender || ''),
            completedAssessment ? 'Completed' : 'Pending',
            sanitizeCSV(createdDate)
          ].join(","));
        }

        fileContent = "\uFEFF" + csvRows.join("\n"); // Add BOM for Excel
        mimeType = 'text/csv';
        filename = `${organization.name.replace(/[^a-zA-Z0-9]/g, '_')}_Students_${Date.now()}.csv`;
      }

      // SECURITY (C1): stream the export directly to the caller; never persist
      // exports of minors' data to the filesystem.
      res.setHeader("Content-Type", `${mimeType}; charset=utf-8`);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(fileContent);
    } catch (error) {
      console.error("Error exporting student data:", error);
      res.status(500).json({ message: "Failed to export student data" });
    }
  });

  // Export organization assessments data
  app.post("/api/admin/organizations/:id/export-assessments", isAuthenticated, dataExportLimiter, async (req: any, res) => {
    try {
      const userId = req.user.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(403).json({ message: "Forbidden" });
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = (user.email && superadminEmails.includes(user.email.toLowerCase())) || user.role === "superadmin";
      if (!isSuperadmin && user.accountType === "org_admin") {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
      } else if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      const { format = 'csv' } = req.body;
      
      const organization = await storage.getOrganizationById(req.params.id);
      if (!organization) {
        return res.status(404).json({ message: "School not found" });
      }

      const members = await storage.getOrganizationMembersByOrganizationId(req.params.id);

      const assessmentsData = [];

      for (const member of members) {
        const memberUser = await storage.getUser(member.userId);
        if (!memberUser) continue;

        const assessments = await storage.getAssessmentsByUser(member.userId);
        const completedAssessment = assessments.find(a => a.isCompleted);
        
        if (completedAssessment) {
          const recommendations = await storage.getRecommendationsByAssessment(completedAssessment.id);
          
          // Get career names for top 3 recommendations
          const topCareerNames: string[] = [];
          for (let i = 0; i < Math.min(3, recommendations.length); i++) {
            const career = await storage.getCareerById(recommendations[i].careerId);
            topCareerNames.push(career?.title || '');
          }

          assessmentsData.push({
            username: memberUser.username || '',
            fullName: [memberUser.firstName, memberUser.lastName].filter(Boolean).join(' '),
            grade: completedAssessment.grade,
            assessmentType: completedAssessment.assessmentType,
            completedAt: completedAssessment.completedAt,
            topCareer1: topCareerNames[0] || '',
            topCareer2: topCareerNames[1] || '',
            topCareer3: topCareerNames[2] || '',
            riasecScores: completedAssessment.riasecScores,
            cvqScores: completedAssessment.cvqScores,
            quizScore: completedAssessment.quizScore,
          });
        }
      }

      let fileContent: string;
      let mimeType: string;
      let filename: string;

      if (format === 'json') {
        fileContent = JSON.stringify(assessmentsData, null, 2);
        mimeType = 'application/json';
        filename = `${organization.name.replace(/[^a-zA-Z0-9]/g, '_')}_Assessments_${Date.now()}.json`;
      } else {
        // CSV export with formula injection protection
        const sanitizeCSV = (value: string): string => {
          const val = String(value || '').replace(/"/g, '""');
          // Neutralize formula injection by prefixing with single quote
          if (val.length > 0 && /^[=+\-@\t\r]/.test(val)) {
            return `"'${val}"`;
          }
          return `"${val}"`;
        };

        const csvRows = [
          'Username,Full Name,Grade,Assessment Type,Completed Date,Top Career 1,Top Career 2,Top Career 3'
        ];

        for (const data of assessmentsData) {
          const completedDate = data.completedAt ? new Date(data.completedAt).toLocaleDateString() : '';
          csvRows.push([
            sanitizeCSV(data.username || ''),
            sanitizeCSV(data.fullName || ''),
            sanitizeCSV(data.grade || ''),
            sanitizeCSV(data.assessmentType || ''),
            sanitizeCSV(completedDate),
            sanitizeCSV(data.topCareer1 || ''),
            sanitizeCSV(data.topCareer2 || ''),
            sanitizeCSV(data.topCareer3 || ''),
          ].join(","));
        }

        fileContent = "\uFEFF" + csvRows.join("\n");
        mimeType = 'text/csv';
        filename = `${organization.name.replace(/[^a-zA-Z0-9]/g, '_')}_Assessments_${Date.now()}.csv`;
      }

      // SECURITY (C1): stream the export directly to the caller; never persist
      // exports of minors' data to the filesystem.
      res.setHeader("Content-Type", `${mimeType}; charset=utf-8`);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(fileContent);
    } catch (error) {
      console.error("Error exporting assessment data:", error);
      res.status(500).json({ message: "Failed to export assessment data" });
    }
  });

  // Bulk import students from CSV file
  app.post("/api/admin/organizations/:id/import-students", isAuthenticated, upload.single("file"), async (req: any, res) => {
    const fileId = req.body.fileId; // Optional: if file was already uploaded via files API
    // Hoisted so the catch block can mark the right row failed, and so the
    // success path knows which object this request created (and may purge).
    let createdFileRecord: any = null;

    try {
      const userId = req.user.userId;
      const user = await storage.getUser(userId);
      if (!user) return res.status(403).json({ message: "Forbidden" });
      const superadminEmails = getSuperadminEmails();
      const isSuperadmin = (user.email && superadminEmails.includes(user.email.toLowerCase())) || user.role === "superadmin";
      if (!isSuperadmin && user.accountType === "org_admin") {
        const userOrg = await storage.getOrganizationByAdminUserId(userId);
        if (!userOrg || userOrg.id !== req.params.id) return res.status(403).json({ message: "Forbidden: Can only access your own organization" });
      } else if (!isSuperadmin) {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      
      const organization = await storage.getOrganizationById(req.params.id);
      if (!organization) {
        // memoryStorage: the upload is still only a buffer and nothing has been
        // written to object storage yet, so there is nothing to clean up.
        return res.status(404).json({ message: "School not found" });
      }

      if (!req.file && !fileId) {
        return res.status(400).json({ message: "No CSV file provided" });
      }

      let csvContent: string;
      let fileRecord: any;

      // If fileId provided, use existing file from files table
      if (fileId) {
        fileRecord = await storage.getFileById(fileId);
        if (!fileRecord) {
          return res.status(404).json({ message: "File not found" });
        }
        // CRITICAL SECURITY: Verify the file belongs to the organization in the URL.
        // The admin is already confined to req.params.id above, so this prevents an
        // org_admin from importing (and thereby reading) another org's uploaded file.
        if (fileRecord.organizationId !== req.params.id) {
          return res.status(403).json({ message: "Forbidden: File does not belong to this organization" });
        }
        // Defense in depth: an import may only ever read a private object.
        if (!fileRecord.filePath.startsWith('private/')) {
          console.error(`Refusing to import file ${fileRecord.id}: filePath is not a private object key`);
          return res.status(403).json({ message: "Forbidden: File is not readable for import" });
        }

        // Update processing status
        await storage.updateFileProcessingStatus(fileId, 'processing');

        // Fetch the previously uploaded CSV back out of object storage.
        try {
          const object = await fileStorage.getStream(fileRecord.filePath);
          csvContent = (await streamToBuffer(object.stream)).toString('utf-8');
        } catch (err: any) {
          if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
            await storage
              .updateFileProcessingStatus(fileId, 'failed', 'Stored file is missing from object storage')
              .catch(() => {});
            return res.status(404).json({ message: "File not found" });
          }
          throw err;
        }
      } else {
        // Store the object BEFORE inserting the row, so a failed upload cannot
        // leave a files row pointing at an object that was never written.
        const key = fileStorage.generateKey('private', req.file!.originalname);
        await fileStorage.put(key, req.file!.buffer, {
          contentType: req.file!.mimetype,
          size: req.file!.size,
          public: false,
        });

        try {
          // Save uploaded file to files table
          fileRecord = await storage.createFile({
            filename: path.posix.basename(key),
            originalFilename: req.file!.originalname,
            mimeType: req.file!.mimetype,
            fileSize: req.file!.size,
            // filePath holds the OBJECT KEY (private/<uuid><ext>), not a disk path.
            filePath: key,
            fileType: 'import_data',
            category: 'student_import',
            description: `Student bulk import for ${organization.name}`,
            uploadedBy: userId,
            organizationId: organization.id,
            isPublic: false,
          });
        } catch (dbError) {
          // Nothing would ever name this key again — remove it rather than
          // leave minors' data in the bucket with no record that it exists.
          await fileStorage.remove(key).catch((cleanupError) => {
            console.error("Orphaned object left in Spaces after failed insert:", key, cleanupError);
          });
          throw dbError;
        }

        createdFileRecord = fileRecord;
        await storage.updateFileProcessingStatus(fileRecord.id, 'processing');

        // Parse from the buffer already in hand — no round trip through Spaces.
        csvContent = req.file!.buffer.toString('utf-8');
      }

      // Parse CSV file
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        await storage.updateFileProcessingStatus(fileRecord.id, 'failed', 'CSV file is empty or has no data rows');
        return res.status(400).json({ message: "CSV file is empty or has no data rows" });
      }

      // Sanitize CSV field to prevent formula injection
      const sanitizeCSVField = (field: string): string => {
        const trimmed = field.trim();
        // Remove leading characters that could trigger formula execution
        if (trimmed.length > 0 && /^[=+\-@\t\r]/.test(trimmed)) {
          return `'${trimmed}`;
        }
        return trimmed;
      };

      // Parse header row (expected: fullName, grade, studentId, studentName, studentAge, studentGender)
      const headers = lines[0].split(',').map(h => sanitizeCSVField(h.replace(/"/g, '')));
      const requiredHeaders = ['fullName'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      
      if (missingHeaders.length > 0) {
        await storage.updateFileProcessingStatus(fileRecord.id, 'failed', `Missing required columns: ${missingHeaders.join(', ')}`);
        return res.status(400).json({ message: `Missing required columns: ${missingHeaders.join(', ')}` });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
        credentials: [] as Array<{ username: string; password: string; fullName: string; grade: string }>,
      };

      // Process each row
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (!row.trim()) continue;

        try {
          // Simple CSV parsing (handles quoted values)
          const values: string[] = [];
          let currentValue = '';
          let insideQuotes = false;

          for (let char of row) {
            if (char === '"') {
              insideQuotes = !insideQuotes;
            } else if (char === ',' && !insideQuotes) {
              values.push(sanitizeCSVField(currentValue.trim()));
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          values.push(sanitizeCSVField(currentValue.trim())); // Push last value with sanitization

          const rowData: any = {};
          headers.forEach((header, index) => {
            rowData[header] = values[index]?.replace(/^"|"$/g, '') || '';
          });

          // Validate required fields
          if (!rowData.fullName) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Missing fullName`);
            continue;
          }

          // Create user with credentials
          const result = await storage.createUserWithCredentials({
            organizationId: organization.id,
            fullName: rowData.fullName,
            grade: rowData.grade || '',
            studentId: rowData.studentId || '',
            studentName: rowData.studentName || '',
            studentAge: rowData.studentAge ? parseInt(rowData.studentAge) : undefined,
            studentGender: rowData.studentGender || '',
            passwordComplexity: organization.passwordComplexity as any,
          });

          // Consume license with reward credits priority
          await storage.consumeLicenseWithRewardPriority(organization.id);

          results.success++;
          results.credentials.push({
            username: result.user.username || '',
            password: result.password,
            fullName: rowData.fullName,
            grade: rowData.grade || '',
          });
        } catch (error: any) {
          results.failed++;
          const errorMsg = error.message?.includes('Quota exceeded') 
            ? `Row ${i + 1}: Quota exceeded` 
            : `Row ${i + 1}: ${error.message || 'Unknown error'}`;
          results.errors.push(errorMsg);
        }
      }

      // Update file processing status
      await storage.updateFileProcessingStatus(
        fileRecord.id,
        results.failed === 0 ? 'completed' : 'completed',
        results.errors.length > 0 ? results.errors.join('; ') : undefined,
        results.success,
        results.failed
      );

      // DATA MINIMISATION: the source CSV holds minors' names, grades, student
      // IDs, ages and genders. Once parsed, those records live in the database
      // and the CSV is a redundant second copy of the same personal data. Purge
      // the OBJECT but keep the files row, which carries the only persisted
      // record that this import happened (status, processed/failed counts,
      // errors, who ran it, when) — no organizationEvents entry is written for
      // bulk imports. Only the object this request created is purged; a file
      // supplied via fileId belongs to the Files API, not to this route.
      if (createdFileRecord) {
        await fileStorage.remove(createdFileRecord.filePath).catch((err) => {
          console.error(
            "Failed to purge imported CSV from Spaces after successful import; it still holds student PII:",
            createdFileRecord.filePath,
            err,
          );
        });
      }

      // SECURITY (C1): build the credentials CSV (minors' plaintext passwords)
      // in memory and return it inline in this response ONLY. It is never
      // written to disk \u2014 the caller builds the downloadable file client-side.
      let credentialsCsv: string | null = null;
      if (results.credentials.length > 0) {
        const sanitizeCSV = (value: string): string => {
          const val = String(value || '').replace(/"/g, '""');
          if (val.length > 0 && /^[=+\-@\t\r]/.test(val)) {
            return `"'${val}"`;
          }
          return `"${val}"`;
        };

        credentialsCsv = '\uFEFF' + [
          'Username,Password,Full Name,Grade',
          ...results.credentials.map(c =>
            `${sanitizeCSV(c.username)},${sanitizeCSV(c.password)},${sanitizeCSV(c.fullName)},${sanitizeCSV(c.grade)}`
          )
        ].join('\n');
      }

      res.json({
        success: true,
        message: `Import completed: ${results.success} succeeded, ${results.failed} failed`,
        stats: {
          success: results.success,
          failed: results.failed,
          errors: results.errors,
        },
        importFile: fileRecord,
        // Inline credentials for client-side download; never persisted server-side.
        credentials: results.credentials,
        credentialsCsv,
      });
    } catch (error: any) {
      console.error("Error importing students:", error);
      
      // Update file processing status if we have a file record. Previously only
      // the fileId branch was marked failed, so a fresh upload that blew up
      // mid-import was left stuck on "processing" forever.
      const failedRecordId = fileId || createdFileRecord?.id;
      if (failedRecordId) {
        await storage.updateFileProcessingStatus(failedRecordId, 'failed', error.message || 'Unknown error').catch(() => {});
      }

      // The stored object is deliberately RETAINED on failure so a failed
      // import can be inspected and retried; it is purged only on success.
      res.status(500).json({ message: "Failed to import students" });
    }
  });
}
