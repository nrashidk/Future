import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertAssessmentSchema, insertQuizQuestionSchema, insertCvqResultSchema } from "@shared/schema";
import { z } from "zod";
import { transformQuizQuestionForFrontend, shuffleQuestions, shuffleOptions } from "./utils/quiz";
import { calculateKolbScores } from "./questionBanks/kolb";
import { calculateRiasecScores } from "./questionBanks/riasec";
import { generateRecommendations } from "./services/matching";
import Stripe from "stripe";
import { normalizeSubjects } from "./utils/subjects";

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
    delete normalized.educationLevel; // Remove duplicate
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Countries routes
  app.get("/api/countries", async (_req, res) => {
    try {
      const countries = await storage.getAllCountries();
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries:", error);
      res.status(500).json({ message: "Failed to fetch countries" });
    }
  });

  app.get("/api/countries/:id", async (req, res) => {
    try {
      const country = await storage.getCountryById(req.params.id);
      if (!country) {
        return res.status(404).json({ message: "Country not found" });
      }
      res.json(country);
    } catch (error) {
      console.error("Error fetching country:", error);
      res.status(500).json({ message: "Failed to fetch country" });
    }
  });

  // Assessment routes
  app.post("/api/assessments", async (req: any, res) => {
    try {
      // Normalize payload before validation
      const normalizationResult = normalizeAssessmentPayload(req.body);
      if (normalizationResult.error) {
        return res.status(400).json({ message: normalizationResult.error });
      }
      const validatedData = insertAssessmentSchema.parse(normalizationResult.normalized);

      // Check if user is authenticated
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      const isGuest = !userId;

      // For guest users, generate a unique guest token
      const guestToken = isGuest ? `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}` : null;

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
          // Continue with basic assessment if scoring fails
        }
      }
      
      // Calculate RIASEC scores if responses provided (Individual Assessment users)
      if (validatedData.riasecResponses) {
        try {
          riasecScores = calculateRiasecScores(validatedData.riasecResponses);
          console.log("RIASEC scores calculated:", riasecScores);
        } catch (error) {
          console.error("Error calculating RIASEC scores:", error);
          // Continue without RIASEC if scoring fails
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

      const userId = req.user.claims.sub;
      const assessments = await storage.getAssessmentsByUser(userId);
      res.json(assessments);
    } catch (error) {
      console.error("Error fetching assessments:", error);
      res.status(500).json({ message: "Failed to fetch assessments" });
    }
  });

  app.patch("/api/assessments/:id", async (req: any, res) => {
    try {
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

  // Quiz API Endpoints
  
  // POST /api/assessments/:assessmentId/quiz/generate - Generate quiz for assessment
  app.post("/api/assessments/:assessmentId/quiz/generate", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      const { guestToken } = req.body; // Guest token from frontend
      
      // Get assessment to check authorization and get grade/country
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization: Check if user owns assessment or has valid guest token
      const isOwner = req.isAuthenticated() && assessment.userId === req.user.claims.sub;
      const isGuestOwner = assessment.isGuest && guestToken && assessment.guestSessionId === guestToken;
      
      // Debug logging
      console.log("Quiz Generate Auth Debug:", {
        isAuthenticated: req.isAuthenticated(),
        assessmentIsGuest: assessment.isGuest,
        hasGuestToken: !!guestToken,
        tokensMatch: assessment.guestSessionId === guestToken,
        isOwner,
        isGuestOwner
      });
      
      if (!isOwner && !isGuestOwner) {
        return res.status(403).json({ message: "Unauthorized to generate quiz for this assessment" });
      }
      
      // Check if quiz already exists - idempotent operation
      const existingQuiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (existingQuiz) {
        // Fetch quiz responses to get question IDs
        const responses = await storage.getQuizResponsesByQuizId(existingQuiz.id);
        const questionIds = responses.map(r => r.questionId);
        
        // Fetch full question details
        const allQuestions = await storage.getAllQuizQuestions();
        const questions = allQuestions
          .filter(q => questionIds.includes(q.id))
          .map(transformQuizQuestionForFrontend);
        
        return res.json({ 
          quizId: existingQuiz.id, 
          questions,
          responses: responses.map(r => ({ questionId: r.questionId, answer: r.answer })),
          completed: !!existingQuiz.completedAt
        });
      }
      
      // Get question pool based on grade band and student's country
      const gradeBand = assessment.grade && parseInt(assessment.grade as string) >= 10 ? "10-12" : "8-9";
      
      // Try to get country-specific questions first
      let questionPool = await storage.getQuizQuestionsByGradeAndCountry(gradeBand, assessment.countryId);
      
      // Fallback: if no country-specific questions exist, try UAE questions as default
      if (questionPool.length === 0 && assessment.countryId !== 'uae') {
        console.log(`No questions found for country ${assessment.countryId}, falling back to UAE curriculum`);
        questionPool = await storage.getQuizQuestionsByGradeAndCountry(gradeBand, 'uae');
      }
      
      // Fallback: if still no questions, try global questions (countryId = null)
      if (questionPool.length === 0) {
        console.log(`No UAE questions found, falling back to global questions`);
        questionPool = await storage.getQuizQuestionsByGradeAndCountry(gradeBand, null);
      }
      
      if (questionPool.length === 0) {
        return res.status(400).json({ message: "No quiz questions available for this grade level and country" });
      }
      
      // Filter questions by student's favorite subjects
      // Defensively normalize subjects for legacy assessments that might have non-canonical subjects
      const favoriteSubjects = normalizeSubjects((assessment.favoriteSubjects as string[]) || []);
      const subjectQuestions = questionPool.filter(q => favoriteSubjects.includes(q.subject));
      
      if (subjectQuestions.length === 0) {
        return res.status(400).json({ 
          message: "No quiz questions available for your favorite subjects. Please update your subject preferences." 
        });
      }
      
      // Ensure we have enough questions for a valid quiz
      const TARGET_QUESTIONS = 6;
      if (subjectQuestions.length < TARGET_QUESTIONS) {
        return res.status(400).json({ 
          message: `Not enough questions available for your favorite subjects. We need at least ${TARGET_QUESTIONS} questions, but only found ${subjectQuestions.length}. Please select more subjects or contact support.`,
          availableQuestions: subjectQuestions.length,
          requiredQuestions: TARGET_QUESTIONS
        });
      }
      
      // Randomly select exactly 6 questions from favorite subjects
      // Try to distribute evenly across subjects if possible
      const selectedQuestions: any[] = [];
      const questionsPerSubject = Math.floor(TARGET_QUESTIONS / favoriteSubjects.length);
      const remainder = TARGET_QUESTIONS % favoriteSubjects.length;
      
      for (let i = 0; i < favoriteSubjects.length; i++) {
        const subject = favoriteSubjects[i];
        const questionsForSubject = subjectQuestions.filter(q => q.subject === subject);
        const count = questionsPerSubject + (i < remainder ? 1 : 0);
        const shuffled = shuffleQuestions(questionsForSubject);
        selectedQuestions.push(...shuffled.slice(0, Math.min(count, questionsForSubject.length)));
      }
      
      // If we still need more questions (edge case), add random ones from pool
      if (selectedQuestions.length < TARGET_QUESTIONS) {
        const remaining = subjectQuestions.filter(q => !selectedQuestions.some(sq => sq.id === q.id));
        const needed = TARGET_QUESTIONS - selectedQuestions.length;
        const shuffled = shuffleQuestions(remaining);
        selectedQuestions.push(...shuffled.slice(0, needed));
      }
      
      // Shuffle final selection to avoid predictable ordering
      const finalShuffledQuestions = shuffleQuestions(selectedQuestions);
      
      // Final validation: ensure we have exactly TARGET_QUESTIONS
      if (finalShuffledQuestions.length < TARGET_QUESTIONS) {
        return res.status(400).json({ 
          message: `Unable to generate complete quiz. Only ${finalShuffledQuestions.length} questions available for your subjects.`,
          availableQuestions: finalShuffledQuestions.length,
          requiredQuestions: TARGET_QUESTIONS
        });
      }
      
      // Shuffle answer options for each question
      const questionsWithShuffledOptions = finalShuffledQuestions.map(q => shuffleOptions(q));
      
      // Create assessment quiz record with empty subject scores
      const quiz = await storage.createAssessmentQuiz({
        assessmentId,
        questionsCount: questionsWithShuffledOptions.length,
        totalScore: 0,
        subjectScores: {}
      });
      
      // Create placeholder quiz_responses for each selected question
      for (const question of questionsWithShuffledOptions) {
        await storage.createQuizResponse({
          assessmentQuizId: quiz.id,
          questionId: question.id,
          answer: "",
          isCorrect: null,
          score: 0
        });
      }
      
      // Transform questions for frontend (format options and hide answers)
      const questionsForFrontend = questionsWithShuffledOptions.map(transformQuizQuestionForFrontend);
      
      res.json({ quizId: quiz.id, questions: questionsForFrontend, responses: [], completed: false });
    } catch (error) {
      console.error("Error generating quiz:", error);
      res.status(500).json({ message: "Failed to generate quiz" });
    }
  });
  
  // GET /api/assessments/:assessmentId/quiz - Get existing quiz
  app.get("/api/assessments/:assessmentId/quiz", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      
      // Get assessment to check authorization
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization check
      const isOwner = req.isAuthenticated() && assessment.userId === req.user.claims.sub;
      // Note: GET quiz doesn't require guest token as quiz data is already safe (no correct answers exposed)
      const isGuestOwner = assessment.isGuest;
      if (!isOwner && !isGuestOwner) {
        return res.status(403).json({ message: "Unauthorized to view this quiz" });
      }
      
      // Get quiz
      const quiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found for this assessment" });
      }
      
      // Get responses
      const responses = await storage.getQuizResponsesByQuizId(quiz.id);
      const questionIds = responses.map(r => r.questionId);
      
      // Fetch full question details
      const allQuestions = await storage.getAllQuizQuestions();
      const questions = allQuestions
        .filter(q => questionIds.includes(q.id))
        .map(transformQuizQuestionForFrontend);
      
      res.json({ 
        quizId: quiz.id, 
        questions,
        responses: responses.map(r => ({ questionId: r.questionId, answer: r.answer })),
        completed: !!quiz.completedAt,
        subjectScores: quiz.subjectScores || {},
        totalScore: quiz.totalScore || 0
      });
    } catch (error) {
      console.error("Error fetching quiz:", error);
      res.status(500).json({ message: "Failed to fetch quiz" });
    }
  });
  
  // POST /api/assessments/:assessmentId/quiz/submit - Submit quiz responses and calculate score
  app.post("/api/assessments/:assessmentId/quiz/submit", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      const { responses: userResponses, guestToken } = req.body;
      
      if (!Array.isArray(userResponses)) {
        return res.status(400).json({ message: "Responses must be an array" });
      }
      
      // Get assessment to check authorization
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization: Check if user owns assessment or has valid guest token
      const isOwner = req.isAuthenticated() && assessment.userId === req.user.claims.sub;
      const isGuestOwner = assessment.isGuest && guestToken && assessment.guestSessionId === guestToken;
      
      if (!isOwner && !isGuestOwner) {
        return res.status(403).json({ message: "Unauthorized to submit quiz for this assessment" });
      }
      
      // Get quiz
      const quiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }
      
      if (quiz.completedAt) {
        return res.status(400).json({ message: "Quiz already completed" });
      }
      
      // Get existing responses to get question IDs
      const existingResponses = await storage.getQuizResponsesByQuizId(quiz.id);
      const questionIds = existingResponses.map(r => r.questionId);
      
      // Fetch full question details
      const allQuestions = await storage.getAllQuizQuestions();
      const questions = allQuestions.filter(q => questionIds.includes(q.id));
      
      // Validate all questions are answered
      const answeredIds = userResponses.map((r: any) => r.questionId);
      const missingAnswers = questionIds.filter((id: string) => !answeredIds.includes(id));
      
      if (missingAnswers.length > 0) {
        return res.status(400).json({ message: "All questions must be answered" });
      }
      
      // Calculate per-subject competency scores
      const subjectScores: Record<string, { correct: number; total: number; percentage: number }> = {};
      let totalCorrect = 0;
      let totalQuestions = 0;
      
      for (const userResponse of userResponses) {
        const question = questions.find((q: any) => q.id === userResponse.questionId);
        if (!question) continue;
        
        // Validate answer format (correctAnswer for multiple_choice questions)
        if (question.questionType === "multiple_choice" && !question.correctAnswer) {
          console.error(`Question ${question.id} missing correctAnswer`);
          continue;
        }
        
        // Update existing quiz_response with the answer
        const existingResponse = existingResponses.find(r => r.questionId === question.id);
        if (existingResponse) {
          // Calculate if answer is correct
          // userResponse.answer is the option index (e.g., "0", "1", "2", "3")
          // question.options is an array of option texts
          // question.correctAnswer is the text of the correct answer
          const selectedOptionIndex = parseInt(userResponse.answer);
          const options = question.options as string[];
          const selectedAnswer = options && options[selectedOptionIndex];
          const isCorrect = selectedAnswer === question.correctAnswer;
          const pointsEarned = isCorrect ? 1 : 0;
          
          // Debug logging
          console.log(`[Quiz Debug] Question ${question.id}:`, {
            userAnswer: userResponse.answer,
            selectedIndex: selectedOptionIndex,
            selectedAnswer,
            correctAnswer: question.correctAnswer,
            isCorrect,
            optionsType: typeof question.options,
            optionsLength: Array.isArray(question.options) ? question.options.length : 'N/A'
          });
          
          // Update response
          await storage.updateQuizResponse(existingResponse.id, {
            answer: userResponse.answer,
            isCorrect,
            score: pointsEarned
          });
          
          // Track subject-level scores
          const subject = question.subject;
          if (!subjectScores[subject]) {
            subjectScores[subject] = { correct: 0, total: 0, percentage: 0 };
          }
          subjectScores[subject].correct += pointsEarned;
          subjectScores[subject].total += 1;
          
          // Track overall scores
          totalCorrect += pointsEarned;
          totalQuestions += 1;
        }
      }
      
      // Calculate subject percentages
      for (const subject in subjectScores) {
        const { correct, total } = subjectScores[subject];
        subjectScores[subject].percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
      }
      
      // Calculate overall accuracy
      const overallAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
      
      // Calculate breakdown scores for UI display
      // Vision Awareness: Based on Social Studies + awareness subjects
      const visionScore = subjectScores["Social Studies"]?.percentage || 
                         subjectScores["Arabic"]?.percentage || 
                         overallAccuracy;
      
      // Sector Competency: Based on technical subjects (Math, Science, Computer Science)
      const techSubjects = ["Mathematics", "Science", "Computer Science"];
      const techScores = techSubjects.map(s => subjectScores[s]?.percentage || 0).filter(s => s > 0);
      const sectorScore = techScores.length > 0 
        ? Math.round(techScores.reduce((a, b) => a + b, 0) / techScores.length)
        : overallAccuracy;
      
      // Personal Alignment: Based on language and soft subjects (English, Arabic)
      const softSubjects = ["English", "Arabic"];
      const softScores = softSubjects.map(s => subjectScores[s]?.percentage || 0).filter(s => s > 0);
      const motivationScore = softScores.length > 0
        ? Math.round(softScores.reduce((a, b) => a + b, 0) / softScores.length)
        : overallAccuracy;
      
      // Update quiz record with subject scores and mark as completed
      await storage.updateAssessmentQuiz(quiz.id, {
        completedAt: new Date(),
        totalScore: overallAccuracy,
        subjectScores: subjectScores
      });
      
      // Update assessment record with quiz score and subject competencies
      await storage.updateAssessment(assessmentId, {
        quizScore: overallAccuracy,
        subjectCompetencies: subjectScores
      });
      
      res.json({ 
        success: true, 
        score: {
          subjectScores,
          overall: overallAccuracy,
          vision: visionScore,
          sector: sectorScore,
          motivation: motivationScore,
          totalQuestions,
          totalCorrect
        },
        message: "Quiz submitted successfully" 
      });
    } catch (error) {
      console.error("Error submitting quiz:", error);
      res.status(500).json({ message: "Failed to submit quiz" });
    }
  });

  // CVQ routes
  app.get("/api/cvq/items", async (req, res) => {
    try {
      const version = req.query.version as string | undefined;
      const items = await storage.getCvqItems(version);
      res.json(items);
    } catch (error) {
      console.error("Error fetching CVQ items:", error);
      res.status(500).json({ message: "Failed to fetch CVQ items" });
    }
  });

  app.post("/api/cvq/submit", isAuthenticated, async (req: any, res) => {
    try {
      const validatedData = insertCvqResultSchema.parse(req.body);
      
      // Get userId from authenticated request
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      
      // Create CVQ result with userId
      const result = await storage.createCvqResult({
        ...validatedData,
        userId
      });
      
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid CVQ data", errors: error.errors });
      }
      console.error("Error submitting CVQ:", error);
      res.status(500).json({ message: "Failed to submit CVQ" });
    }
  });

  app.get("/api/cvq/result/latest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.isLocal ? req.user.userId : req.user.claims.sub;
      const result = await storage.getCvqResultByUserId(userId);
      
      if (!result) {
        return res.status(404).json({ message: "No CVQ result found" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching CVQ result:", error);
      res.status(500).json({ message: "Failed to fetch CVQ result" });
    }
  });

  app.get("/api/cvq/result/:assessmentId", async (req, res) => {
    try {
      const result = await storage.getCvqResultByAssessmentId(req.params.assessmentId);
      
      if (!result) {
        return res.status(404).json({ message: "No CVQ result found for this assessment" });
      }
      
      res.json(result);
    } catch (error) {
      console.error("Error fetching CVQ result:", error);
      res.status(500).json({ message: "Failed to fetch CVQ result" });
    }
  });

  // Generate recommendations using dynamic matching service
  app.post("/api/recommendations/generate/:assessmentId", async (req, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // STRICT VALIDATION: Check all required components are complete
      const user = assessment.userId ? await storage.getUser(assessment.userId) : null;
      const isPremium = user?.isPremium || false;

      const missingComponents: string[] = [];

      // Core fields required for both tiers
      if (!assessment.name) missingComponents.push("Name");
      if (!assessment.age) missingComponents.push("Age");
      if (!assessment.grade) missingComponents.push("Grade");
      if (!assessment.favoriteSubjects || (assessment.favoriteSubjects as string[]).length === 0) {
        missingComponents.push("Favorite Subjects");
      }
      if (!assessment.countryId) missingComponents.push("Country Selection");

      if (isPremium) {
        // Premium tier requirements
        if (assessment.quizScore === null || assessment.quizScore === undefined) {
          missingComponents.push("Subject Competency Quiz");
        }

        // Check Kolb assessment (stored as JSONB in assessments table)
        if (!assessment.kolbScores || Object.keys(assessment.kolbScores as object).length === 0) {
          missingComponents.push("Learning Style Assessment (Kolb)");
        }

        // Check RIASEC assessment (stored as JSONB in assessments table)
        if (!assessment.riasecScores || Object.keys(assessment.riasecScores as object).length === 0) {
          missingComponents.push("Personality Assessment (RIASEC)");
        }

        // Check CVQ assessment (stored in cvq_results table)
        const cvqResult = await storage.getCvqResultByAssessmentId(assessment.id);
        if (!cvqResult) {
          missingComponents.push("Values Assessment (CVQ)");
        }

        if (!assessment.careerAspirations || (assessment.careerAspirations as string[]).length === 0) {
          missingComponents.push("Career Aspirations");
        }
      } else {
        // Free tier requirements
        if (!assessment.interests || (assessment.interests as string[]).length === 0) {
          missingComponents.push("Interests");
        }
        if (!assessment.personalityTraits || (assessment.personalityTraits as string[]).length === 0) {
          missingComponents.push("Personality Traits");
        }
        if (assessment.quizScore === null || assessment.quizScore === undefined) {
          missingComponents.push("Subject Competency Quiz");
        }
      }

      // If any components missing, return validation error
      if (missingComponents.length > 0) {
        return res.status(400).json({
          message: "Assessment incomplete",
          missingComponents,
          isPremium,
        });
      }

      // Use new matching service to generate recommendations
      const careerMatches = await generateRecommendations(storage, req.params.assessmentId);

      // Persist recommendations to database
      const recommendations = [];
      for (const match of careerMatches) {
        const career = match.career;

        const actionSteps = [
          `Research ${career.title} programs at universities in your country`,
          `Connect with professionals in this field through networking events or LinkedIn`,
          `Build relevant skills through online courses or certifications`,
          `Seek internships or volunteer opportunities in related organizations`,
        ];

        // Build overall reasoning from component scores
        const reasoningParts = match.componentScores
          .filter(c => c.score > 0)
          .map(c => `${c.displayName}: ${c.reasoning}`)
          .join("; ");

        const recommendation = await storage.createRecommendation({
          assessmentId: assessment.id,
          careerId: career.id,
          overallMatchScore: match.overallScore,
          subjectMatchScore: match.componentScores.find(c => c.key === "subjects")?.score || 0,
          interestMatchScore: match.componentScores.find(c => c.key === "interests")?.score || 0,
          countryVisionAlignment: match.componentScores.find(c => c.key === "vision")?.score || 0,
          futureMarketDemand: match.componentScores.find(c => c.key === "market")?.score || 0,
          reasoning: reasoningParts,
          actionSteps,
          requiredEducation: career.educationLevel,
        });

        recommendations.push(recommendation);
      }

      res.json(recommendations);
    } catch (error) {
      console.error("Error generating recommendations:", error);
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Get recommendations with career details
  app.get("/api/recommendations", async (req: any, res) => {
    try {
      // For demo, get the latest assessment
      let assessmentId = req.query.assessmentId;

      if (!assessmentId) {
        if (req.isAuthenticated()) {
          const userAssessments = await storage.getAssessmentsByUser(req.user.claims.sub);
          if (userAssessments.length > 0) {
            assessmentId = userAssessments[0].id;
          }
        }
      }

      if (!assessmentId) {
        return res.json([]);
      }

      const recommendations = await storage.getRecommendationsByAssessment(assessmentId);

      // Enrich with career details
      const enriched = await Promise.all(
        recommendations.map(async (rec) => {
          const career = await storage.getCareerById(rec.careerId);
          return { ...rec, career };
        })
      );

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching recommendations:", error);
      res.status(500).json({ message: "Failed to fetch recommendations" });
    }
  });

  // Careers routes
  app.get("/api/careers", async (_req, res) => {
    try {
      const careers = await storage.getAllCareers();
      res.json(careers);
    } catch (error) {
      console.error("Error fetching careers:", error);
      res.status(500).json({ message: "Failed to fetch careers" });
    }
  });

  // PDF Report Generation using Puppeteer
  app.get("/api/recommendations/pdf/:assessmentId", async (req: any, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // Authorization check: verify ownership
      if (assessment.userId && (!req.isAuthenticated() || req.user.claims.sub !== assessment.userId)) {
        return res.status(403).json({ message: "Unauthorized to access this report" });
      }

      // Import Puppeteer
      const puppeteer = await import("puppeteer");

      // Launch headless browser with system Chromium
      const browser = await puppeteer.default.launch({
        headless: true,
        executablePath: 'chromium-browser',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ],
      });

      const page = await browser.newPage();

      // Navigate to print-optimized page
      const baseUrl = process.env.NODE_ENV === 'production' 
        ? `https://${req.get('host')}`
        : `http://localhost:${process.env.PORT || 5000}`;
      
      const printUrl = `${baseUrl}/print/results?assessmentId=${assessment.id}`;
      
      await page.goto(printUrl, {
        waitUntil: 'networkidle0',
        timeout: 30000,
      });

      // Wait for report data to be fully loaded
      await page.waitForFunction(() => (window as any).__REPORT_READY__ === true, {
        timeout: 30000,
      });

      // Generate PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      });

      await browser.close();

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="career-report-${assessment.id}.pdf"`);

      // Send PDF
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ message: "Failed to generate PDF report" });
    }
  });

  // Guest to Registered User Migration
  app.post("/api/assessments/migrate", isAuthenticated, async (req: any, res) => {
    try {
      const { guestAssessmentIds, guestSessionId } = req.body;
      const userId = req.user.claims.sub;

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

  // Analytics Endpoints
  app.get("/api/analytics/overview", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const analytics = await storage.getAnalyticsOverview(countryId);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/analytics/countries", async (req, res) => {
    try {
      // Get all countries with completed assessments (no filter)
      const analytics = await storage.getAnalyticsOverview();
      const countries = analytics.countriesBreakdown.map(c => ({
        countryId: c.countryId,
        countryName: c.countryName,
        studentCount: c.count
      }));
      res.json(countries);
    } catch (error) {
      console.error("Error fetching countries analytics:", error);
      res.status(500).json({ message: "Failed to fetch countries analytics" });
    }
  });

  app.get("/api/analytics/country/:id", async (req, res) => {
    try {
      const analytics = await storage.getCountryAnalytics(req.params.id);
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching country analytics:", error);
      res.status(500).json({ message: "Failed to fetch country analytics" });
    }
  });

  app.get("/api/analytics/careers", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const trends = await storage.getCareerTrends(countryId);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const trends = await storage.getCareerTrends(countryId);
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/sectors", async (req, res) => {
    try {
      const countryId = req.query.countryId as string | undefined;
      const pipeline = await storage.getSectorPipeline(countryId);
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching sector pipeline:", error);
      res.status(500).json({ message: "Failed to fetch sector pipeline" });
    }
  });

  // Admin middleware
  const isAdmin = (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    if (req.user.isLocal) {
      return res.status(403).json({ message: "Forbidden: Admin access required" });
    }
    
    const userId = req.user.claims.sub;
    storage.getUser(userId).then(user => {
      if (!user || user.role !== "superadmin") {
        return res.status(403).json({ message: "Forbidden: Admin access required" });
      }
      next();
    }).catch(() => {
      res.status(500).json({ message: "Authorization check failed" });
    });
  };

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

  // Organization Management - Super Admin Endpoints
  app.get("/api/admin/organizations", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const organizations = await storage.getAllOrganizations();
      res.json(organizations);
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
  app.get("/api/admin/organizations/:id/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const members = await storage.getOrganizationMembersByOrganizationId(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching organization members:", error);
      res.status(500).json({ message: "Failed to fetch organization members" });
    }
  });

  app.post("/api/admin/organizations/:id/members", isAuthenticated, isAdmin, async (req, res) => {
    try {
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

  app.post("/api/admin/organizations/:id/members/bulk", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { members, passwordComplexity = 'medium' } = req.body;
      const organizationId = req.params.id;

      if (!Array.isArray(members) || members.length === 0) {
        return res.status(400).json({ message: "Members must be a non-empty array" });
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
          const { username, fullName, grade } = memberData;
          
          if (!username || !fullName || !grade) {
            throw new Error("Missing required fields");
          }

          const result = await storage.createUserWithCredentials({
            username,
            fullName,
            grade: grade.toString(),
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

  app.delete("/api/admin/organizations/:id/members/:memberId", isAuthenticated, isAdmin, async (req, res) => {
    try {
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

  app.post("/api/admin/organizations/:id/members/:memberId/reset-password", isAuthenticated, isAdmin, async (req, res) => {
    try {
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

      const { generatePassword } = await import("./utils/passwordGenerator");
      const { hashPassword } = await import("./utils/passwordHash");

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

  // ===== STRIPE PAYMENT ROUTES =====
  // Initialize Stripe only if keys are configured
  let stripe: Stripe | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-10-29.clover",
    });
  }

  // Create payment intent for premium assessment
  app.post("/api/create-payment-intent", async (req: any, res) => {
    if (!stripe) {
      return res.status(503).json({ 
        message: "Payment system not configured. Please add STRIPE_SECRET_KEY to your environment." 
      });
    }

    try {
      // SECURITY FIX: Ignore client-provided amount, calculate server-side
      const { studentCount = 1 } = req.body;

      // Validate student count
      if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 100000) {
        return res.status(400).json({ message: "Invalid student count. Must be between 1 and 100,000" });
      }

      // SERVER-SIDE PRICING CALCULATION
      const basePrice = 10.00; // $10 per student
      let discount = 0;
      
      if (studentCount >= 1000) {
        discount = 0.20; // 20% off for 1000+
      } else if (studentCount >= 500) {
        discount = 0.15; // 15% off for 500+
      } else if (studentCount >= 100) {
        discount = 0.10; // 10% off for 100+
      }

      const total = basePrice * studentCount * (1 - discount);
      const amountInCents = Math.round(total * 100);

      // Minimum payment validation
      if (amountInCents < 50) {
        return res.status(400).json({ message: "Invalid amount. Minimum is $0.50 USD" });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInCents,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
        metadata: {
          userId: req.isAuthenticated() ? req.user.claims.sub : "guest",
          studentCount: studentCount.toString(),
          expectedAmount: amountInCents.toString(),
          assessmentType: "kolb_premium"
        }
      });

      // Return server-calculated total for UI display
      res.json({ 
        clientSecret: paymentIntent.client_secret,
        amount: total, // Server-calculated amount in dollars
        studentCount
      });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Mark user as premium after successful payment
  app.post("/api/upgrade-to-premium", async (req: any, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Must be logged in to upgrade" });
    }

    try {
      const { paymentIntentId } = req.body;

      if (!stripe || !paymentIntentId) {
        return res.status(400).json({ message: "Invalid request" });
      }

      // SECURITY FIX: Verify payment was successful AND amount is correct
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({ message: "Payment not completed" });
      }

      // Verify user matches the payment metadata
      if (paymentIntent.metadata.userId !== req.user.claims.sub) {
        return res.status(403).json({ message: "Payment does not belong to this user" });
      }

      // Validate payment amount matches expected amount
      const expectedAmount = paymentIntent.metadata.expectedAmount;
      if (!expectedAmount || paymentIntent.amount !== parseInt(expectedAmount)) {
        console.error(`Payment amount mismatch: expected ${expectedAmount}, got ${paymentIntent.amount}`);
        return res.status(400).json({ message: "Payment amount verification failed" });
      }

      // Prevent duplicate premium upgrades
      const existingUser = await storage.getUser(req.user.claims.sub);
      if (existingUser && existingUser.isPremium) {
        return res.json({ success: true, user: existingUser, message: "Already premium" });
      }

      // Update user to premium
      const updatedUser = await storage.updateUserPremiumStatus(
        req.user.claims.sub,
        paymentIntent.customer as string || null
      );

      res.json({ success: true, user: updatedUser });
    } catch (error: any) {
      console.error("Error upgrading user:", error);
      res.status(500).json({ message: "Failed to upgrade account" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
