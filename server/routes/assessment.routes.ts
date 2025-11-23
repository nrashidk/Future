import type { Express } from "express";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { isAuthenticated } from "../replitAuth";
import { insertAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import { calculateKolbScores } from "../questionBanks/kolb";
import { calculateRiasecScores } from "../questionBanks/riasec";
import { normalizeSubjects } from "../utils/subjects";

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
      // Normalize payload before validation
      const normalizationResult = normalizeAssessmentPayload(req.body);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const validatedData = insertAssessmentSchema.parse(normalizationResult.normalized);

      // Check if user is authenticated and get userId from appropriate source
      // For local auth: req.user.userId, for Replit auth: req.user.claims.sub
      const userId = req.isAuthenticated() 
        ? (req.user.isLocal ? req.user.userId : req.user.claims.sub) 
        : null;
      const isGuest = !userId;

      // For guest users, generate a cryptographically secure unique guest token
      const guestToken = isGuest ? `guest_${Date.now()}_${randomBytes(16).toString('hex')}` : null;

      // Calculate learning style scores if responses provided (Individual Assessment users)
      let kolbScores = null;
      let riasecScores = null;
      let assessmentType = 'basic';
      
      if (validatedData.kolbResponses && Object.keys(validatedData.kolbResponses).length === 24) {
        try {
          kolbScores = calculateKolbScores(validatedData.kolbResponses);
          assessmentType = 'kolb';
          console.log("Learning style scores calculated:", kolbScores);
        } catch (error) {
          console.error("Error calculating learning style scores:", error);
        }
      }
      
      // Calculate RIASEC scores if responses provided (Individual Assessment users)
      if (validatedData.riasecResponses) {
        try {
          riasecScores = calculateRiasecScores(validatedData.riasecResponses);
          console.log("RIASEC scores calculated:", riasecScores);
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
        }
      }

      const assessment = await storage.createAssessment({
        ...validatedData,
        userId,
        isGuest,
        guestSessionId: guestToken,
        assessmentType,
        kolbScores,
        riasecScores,
      });

      // Debug logging
      console.log("Assessment created:", {
        isGuest,
        assessmentId: assessment.id,
        hasGuestToken: !!guestToken,
        assessmentType
      });

      // Return guest token to frontend for subsequent requests
      res.json({
        ...assessment,
        guestToken: isGuest ? guestToken : undefined
      });
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

      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  // Alias endpoint for backward compatibility
  app.get("/api/assessments", async (req: any, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
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
      
      // Define allowed fields for assessment updates
      const allowedFields = [
        'name', 'age', 'grade', 'gender', 'countryId', 'favoriteSubjects', 
        'interests', 'personalityTraits', 'careerAspirations', 'strengths', 
        'workPreferences', 'kolbResponses', 'riasecResponses', 'cvqResponses',
        'kolbScores', 'riasecScores', 'cvqScores', 'quizScore', 'subjectCompetencies',
        'currentStep', 'currentStepMetadata', 'isCompleted', 'completedAt', 
        'assessmentType', 'educationLevel'
      ];
      
      // Validation: Check for disallowed fields
      const providedFields = Object.keys(req.body);
      const disallowedFields = providedFields.filter(field => !allowedFields.includes(field));
      if (disallowedFields.length > 0) {
        return res.status(400).json({ 
          message: `Disallowed fields: ${disallowedFields.join(', ')}. Only allowed fields: ${allowedFields.join(', ')}` 
        });
      }
      
      // Normalize payload before processing
      const normalizationResult = normalizeAssessmentPayload(req.body);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const updateData = { ...normalizationResult.normalized };

      // Calculate learning style scores if responses provided and complete
      if (updateData.kolbResponses && Object.keys(updateData.kolbResponses).length === 24) {
        try {
          updateData.kolbScores = calculateKolbScores(updateData.kolbResponses);
          updateData.assessmentType = 'kolb';
          console.log("Learning style scores calculated on update:", updateData.kolbScores);
        } catch (error) {
          console.error("Error calculating learning style scores:", error);
        }
      }
      
      // Calculate RIASEC scores if responses provided
      if (updateData.riasecResponses) {
        try {
          updateData.riasecScores = calculateRiasecScores(updateData.riasecResponses);
          console.log("RIASEC scores calculated on update:", updateData.riasecScores);
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
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
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;

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
