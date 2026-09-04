import type { Express } from "express";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { insertAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import { calculateRiasecScores } from "../questionBanks/riasec";
import { normalizeSubjects } from "../utils/subjects";
import { validatePromptInputFields } from "../utils/assessmentValidation";
import { sanitizeRequestBody } from "../utils/sanitize";
import { printTokenAuthorizes } from "../utils/printToken";

/**
 * Normalize assessment payload before validation
 * - Promotes educationLevel → grade for backwards compatibility
 * - Normalizes favorite subjects to canonical quiz subjects
 * - Returns { normalized: data } on success or { error: message } on validation failure
 */
function normalizeAssessmentPayload(body: any): { normalized?: any; error?: string } {
  const normalized = { ...body };
  
  // Handle educationLevel → grade migration with coercion and conflict detection
  if (normalized.educationLevel && !normalized.grade) {
    console.log(`[Normalization] Promoting educationLevel → grade: ${normalized.educationLevel}`);
    normalized.grade = String(normalized.educationLevel).trim();
    delete normalized.educationLevel;
  } else if (normalized.educationLevel && normalized.grade) {
    // Both fields present - coerce to strings and compare
    const educationLevelNorm = String(normalized.educationLevel).trim();
    const gradeNorm = String(normalized.grade).trim();
    
    if (educationLevelNorm !== gradeNorm) {
      return {
        error: `Conflicting grade fields: educationLevel (${normalized.educationLevel}) does not match grade (${normalized.grade}). Please provide only one.`
      };
    }
    console.log(`[Normalization] Removing duplicate educationLevel field (matches grade: ${normalized.grade})`);
    delete normalized.educationLevel;
  }
  
  // Normalize favorite subjects to canonical quiz subjects
  if (normalized.favoriteSubjects && Array.isArray(normalized.favoriteSubjects)) {
    const originalSubjects = [...normalized.favoriteSubjects];
    normalized.favoriteSubjects = normalizeSubjects(normalized.favoriteSubjects);
    
    // Log normalization for debugging
    if (JSON.stringify(originalSubjects) !== JSON.stringify(normalized.favoriteSubjects)) {
      console.log(`[Normalization] Subjects normalized: ${originalSubjects.join(', ')} → ${normalized.favoriteSubjects.join(', ')}`);
    }
  }
  
  return { normalized };
}

export function registerAssessmentRoutes(app: Express) {
  app.post("/api/assessments", async (req: any, res) => {
    try {
      // Sanitize user input to prevent XSS
      const sanitizedBody = sanitizeRequestBody(req.body);

      // Bound/whitelist the free-text fields that reach the LLM prompt
      // (favoriteSubjects, careerAspirations) before anything is persisted.
      const promptFieldError = await validatePromptInputFields(sanitizedBody);
      if (promptFieldError) {
        return res.status(400).json({ message: promptFieldError });
      }

      // Normalize payload before validation
      const normalizationResult = normalizeAssessmentPayload(sanitizedBody);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const validatedData = insertAssessmentSchema.parse(normalizationResult.normalized);

      // Check if user is authenticated and get userId
      const userId = req.isAuthenticated() 
        ? (req.user.userId) 
        : null;
      const isGuest = !userId;

      // For guest users, generate a cryptographically secure unique guest token
      const guestToken = isGuest ? `guest_${Date.now()}_${randomBytes(16).toString('hex')}` : null;

      // Calculate RIASEC scores if responses provided (premium users)
      let riasecScores = null;
      let assessmentType = 'basic';
      
      if (validatedData.riasecResponses) {
        try {
          riasecScores = calculateRiasecScores(validatedData.riasecResponses);
          assessmentType = 'premium';
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
        }
      }

      if (validatedData.cvqResponses) {
        assessmentType = 'premium';
      }

      // For organization students, inherit curriculum from their organization
      let assessmentCurriculum = validatedData.curriculum;
      
      if (userId) {
        const user = await storage.getUser(userId);
        if (user?.accountType === "org_student") {
          const orgMember = await storage.getOrganizationMemberByUserId(userId);

          // LICENSE GUARD (org_student only): a school license grants a student a
          // limited number of assessment allocations. Block creation when the
          // student has no unused allocation left.
          //
          // Framed as "does the student have an available (unused) allocation?"
          // rather than "have they ever completed one." Today the license grants a
          // single lifetime allocation, so a consumed allocation == one completed
          // assessment (hasCompletedAssessment === true). Keeping the check
          // allocation-shaped lets PD2 relax it without rewriting the guard.
          //
          // PD2: when per-period re-assessment is added, an allocated new period
          // grants a fresh allocation here — compute unused allocations for the
          // active period instead of reading the single hasCompletedAssessment flag.
          //
          // Fail-open on a missing orgMember row: a properly-enrolled org_student
          // always has one, so this near-impossible case biases toward not blocking
          // a legitimate student rather than fail-closed.
          const hasUnusedAllocation = !(orgMember?.hasCompletedAssessment ?? false);
          if (!hasUnusedAllocation) {
            return res.status(403).json({
              message: "Assessment already completed for this allocation",
            });
          }

          if (orgMember) {
            const organization = await storage.getOrganizationById(orgMember.organizationId);
            if (organization?.curriculum) {
              // Override curriculum with organization's curriculum for org students
              assessmentCurriculum = organization.curriculum;
            }
          }
        }
      }

      const assessment = await storage.createAssessment({
        ...validatedData,
        userId,
        isGuest,
        guestSessionId: guestToken,
        assessmentType,
        riasecScores,
        curriculum: assessmentCurriculum,
      });

      // Set guest token in httpOnly cookie for security (prevents XSS token theft)
      if (isGuest && guestToken) {
        res.cookie("guest_token", guestToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          path: "/",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });
      }

      // Return assessment without exposing guest token in response body
      res.json(assessment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error("Error creating assessment:", error);
      res.status(500).json({ message: "Failed to create assessment" });
    }
  });

  app.get("/api/assessments/my", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.userId;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  // Get a single assessment by ID (supports guest token auth)
  app.get("/api/assessments/:id", async (req: any, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.id);
      if (!assessment) {
        // Anti-enumeration: return the same 403 as the not-owned case below so a
        // missing ID is indistinguishable from one the caller doesn't own.
        return res.status(403).json({ message: "Unauthorized to access this assessment" });
      }

      // Server-side PDF render: a print token scoped to THIS assessment
      // authorizes the read (the headless browser carries no session cookie or
      // guest token). Scoped to req.params.id exactly — a token minted for
      // assessment A can never read B (see printTokenAuthorizes). This route
      // supplies the basic-info fields the report needs, so it must accept it.
      const isPrintTokenOwner = printTokenAuthorizes(req.query.printToken, req.params.id);

      // Ownership check: authenticated user must own it, or guest token must match
      if (assessment.userId) {
        if (!isPrintTokenOwner && (!req.isAuthenticated() || req.user.userId !== assessment.userId)) {
          return res.status(403).json({ message: "Unauthorized to access this assessment" });
        }
      } else {
        // Guest assessment: verify via cookie or query param
        const guestToken = req.cookies?.guest_token || req.query.guestToken;
        if (!isPrintTokenOwner && (!guestToken || guestToken !== assessment.guestSessionId)) {
          return res.status(403).json({ message: "Unauthorized to access this assessment" });
        }
      }

      res.json(assessment);
    } catch (error) {
      console.error("Error fetching assessment:", error);
      res.status(500).json({ message: "Failed to fetch assessment" });
    }
  });

  // Alias endpoint for backward compatibility
  app.get("/api/assessments", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.userId;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  app.patch("/api/assessments/:id", async (req: any, res) => {
    try {
      // Validation: Ensure request body is an object
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        return res.status(400).json({ message: "Request body must be an object" });
      }

      // Ownership verification — fetch assessment first, then check caller has rights
      const existingAssessment = await storage.getAssessmentById(req.params.id);
      if (!existingAssessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      if (existingAssessment.userId) {
        // Authenticated user assessment — caller must be that user
        if (!req.isAuthenticated || !req.isAuthenticated() || req.user?.userId !== existingAssessment.userId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      } else if (existingAssessment.guestSessionId) {
        // Guest assessment — verify via guest_token cookie
        const guestToken = req.cookies?.guest_token;
        if (!guestToken || guestToken !== existingAssessment.guestSessionId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      // Sanitize user input to prevent XSS
      const sanitizedBody = sanitizeRequestBody(req.body);
      
      // Define allowed fields for assessment updates.
      // SECURITY (M1): server-derived fields are intentionally NOT client-writable.
      // assessmentType (the free/premium flag), quizScore, isCompleted, riasecScores
      // and cvqScores are computed server-side — letting the client PATCH them allowed
      // a free user to self-upgrade to premium (assessmentType: 'premium') and to forge
      // scores/completion. assessmentType and riasecScores are still derived below from
      // the client-supplied *Responses, so the legitimate premium upgrade path is intact.
      //
      // 'curriculum' IS client-writable, and has to be: the student picks it in
      // CountryStep alongside the country, and the quiz filters its question
      // pool on {countryId, grade, curriculum}. It was missing from this list,
      // so every PATCH silently dropped it (POST already accepted it) and the
      // column stayed NULL for any assessment saved through the update path —
      // which is all of them after the first save. The org-student override
      // below mirrors POST so a school's curriculum still wins.
      const allowedFields = [
        'name', 'age', 'grade', 'gender', 'countryId', 'curriculum', 'favoriteSubjects',
        'prioritySubjects', 'interests', 'personalityTraits', 'careerAspirations',
        'strengths', 'workPreferences', 'riasecResponses', 'cvqResponses',
        'subjectCompetencies',
        'currentStep', 'currentStepMetadata', 'completedAt',
        'educationLevel'
      ];
      
      // Mass-assignment defense (M1): silently drop any field not on the allowlist
      // (e.g. the server-derived assessmentType/scores) and process only the allowed
      // ones, instead of rejecting the whole request. This keeps legit clients that
      // still send a now-disallowed field working, while preventing premium/score
      // escalation via unexpected fields.
      const filteredBody: Record<string, any> = {};
      for (const field of allowedFields) {
        if (sanitizedBody[field] !== undefined) {
          filteredBody[field] = sanitizedBody[field];
        }
      }

      // Same prompt-field bounds/whitelist as POST. PATCH runs no zod, so this
      // is the only guard here. Partial-update safe: fields absent from the
      // payload are skipped, so a PATCH that doesn't touch subjects/aspirations
      // is never rejected for them.
      const promptFieldError = await validatePromptInputFields(filteredBody);
      if (promptFieldError) {
        return res.status(400).json({ message: promptFieldError });
      }

      // Normalize payload before processing
      const normalizationResult = normalizeAssessmentPayload(filteredBody);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const updateData = { ...normalizationResult.normalized };

      // Calculate RIASEC scores if responses provided
      if (updateData.riasecResponses) {
        try {
          updateData.riasecScores = calculateRiasecScores(updateData.riasecResponses);
          updateData.assessmentType = 'premium';
          console.log("RIASEC scores calculated on update:", updateData.riasecScores);
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
        }
      }

      if (updateData.cvqResponses) {
        updateData.assessmentType = 'premium';
      }

      // Org students inherit their school's curriculum, exactly as POST does
      // (see the create handler above). Without this, adding 'curriculum' to the
      // allowlist would let an org student's own pick silently override on the
      // next PATCH the curriculum the create path had just forced. Gated on the
      // field actually being present so a normal auto-save that doesn't touch
      // curriculum costs no extra queries.
      if (updateData.curriculum !== undefined && existingAssessment.userId) {
        const owner = await storage.getUser(existingAssessment.userId);
        if (owner?.accountType === "org_student") {
          const orgMember = await storage.getOrganizationMemberByUserId(existingAssessment.userId);
          if (orgMember) {
            const organization = await storage.getOrganizationById(orgMember.organizationId);
            if (organization?.curriculum) {
              updateData.curriculum = organization.curriculum;
            }
          }
        }
      }

      const assessment = await storage.updateAssessment(req.params.id, updateData);
      res.json(assessment);
    } catch (error) {
      console.error("Error updating assessment:", error);
      res.status(500).json({ message: "Failed to update assessment" });
    }
  });

  app.post("/api/assessments/migrate", isAuthenticated, async (req: any, res) => {
    try {
      const { guestAssessmentIds, guestSessionId } = req.body;
      const userId = req.user.userId;

      if (!Array.isArray(guestAssessmentIds) || guestAssessmentIds.length === 0) {
        return res.status(400).json({ message: "No assessments to migrate" });
      }

      if (!guestSessionId) {
        return res.status(400).json({ message: "Guest session ID required for migration" });
      }

      const migratedCount = await storage.migrateGuestAssessments(guestAssessmentIds, userId, guestSessionId);

      res.json({ 
        success: true, 
        migratedCount,
        message: `Successfully migrated ${migratedCount} assessment(s) to your account` 
      });
    } catch (error) {
      console.error("Error migrating assessments:", error);
      res.status(500).json({ message: "Failed to migrate assessments" });
    }
  });
}
