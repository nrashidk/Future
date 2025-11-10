import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { transformQuizQuestionForFrontend, shuffleQuestions, shuffleOptions } from "./utils/quiz";
import {
  colors,
  layout,
  drawGradientHeader,
  drawStickyCard,
  drawBadge,
  drawCircularBadge,
  drawProgressBar,
  drawMetricRow,
  drawInsightRow,
  getStickyColor,
  ensurePageSpace,
} from "./utils/pdfTheme";

// Helper to enrich assessment with subject competency scores from quiz
async function enrichAssessmentWithCompetencies(assessment: any) {
  // Try to load the latest completed quiz for this assessment
  const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
  
  if (quiz && quiz.completedAt && quiz.subjectScores) {
    // Attach normalized subject competencies to assessment
    return {
      ...assessment,
      subjectCompetencies: quiz.subjectScores
    };
  }
  
  // No quiz data available - return assessment as-is
  return assessment;
}

// Intelligent matching algorithm with subject competency validation
function calculateCareerMatch(
  assessment: any,
  career: any,
  countryData: any,
  jobTrend: any
): {
  overallMatchScore: number;
  subjectMatchScore: number;
  interestMatchScore: number;
  countryVisionAlignment: number;
  futureMarketDemand: number;
  reasoning: string;
  matchedSubjects?: Array<{ subject: string; competency: number }>;
  supportingVisionPriorities?: string[];
} {
  // Calculate subject match with competency validation (0-100)
  const subjectOverlap = assessment.favoriteSubjects.filter((s: string) =>
    career.relatedSubjects.includes(s)
  ).length;
  
  // Base preference alignment score
  const preferenceAlignment = Math.min(
    (subjectOverlap / Math.max(assessment.favoriteSubjects.length, 1)) * 100,
    100
  );
  
  // Calculate competency score from quiz results (only if data exists)
  let hasCompetencyData = false;
  let competencyScore = 0;
  
  if (assessment.subjectCompetencies) {
    const competencies = assessment.subjectCompetencies as Record<string, { correct: number; total: number; percentage: number }>;
    const relevantSubjects = assessment.favoriteSubjects.filter((s: string) =>
      career.relatedSubjects.includes(s)
    );
    
    if (relevantSubjects.length > 0) {
      let totalCompetency = 0;
      let subjectCount = 0;
      
      for (const subject of relevantSubjects) {
        if (competencies[subject]) {
          totalCompetency += competencies[subject].percentage;
          subjectCount++;
        }
      }
      
      if (subjectCount > 0) {
        competencyScore = totalCompetency / subjectCount;
        hasCompetencyData = true;
      }
    }
  }
  
  // Calculate final subject match score
  let subjectMatchScore: number;
  
  if (hasCompetencyData) {
    // Blend preference alignment with demonstrated competency (50/50)
    subjectMatchScore = preferenceAlignment * 0.5 + competencyScore * 0.5;
    
    // Additional penalty for low competency in stated favorite subjects
    if (competencyScore < 50) {
      subjectMatchScore = subjectMatchScore * 0.8; // 20% penalty
    }
  } else {
    // No competency data available - fall back to preference alignment only
    subjectMatchScore = preferenceAlignment;
  }
  
  subjectMatchScore = Math.min(Math.max(subjectMatchScore, 0), 100);

  // Calculate interest match (0-100)
  const interestKeywords: Record<string, string[]> = {
    Technology: ["Computer Science", "Engineering"],
    Creative: ["Art", "Music", "Design"],
    Helping: ["Healthcare", "Education", "Social Work"],
    "Problem Solving": ["Mathematics", "Physics", "Engineering"],
    Research: ["Biology", "Chemistry", "Science"],
    Business: ["Business", "Economics"],
    Leadership: ["Business", "Management"],
  };

  let interestScore = 0;
  for (const interest of assessment.interests) {
    const keywords = interestKeywords[interest] || [];
    if (keywords.some((k) => career.title.includes(k) || career.category.includes(k))) {
      interestScore += 20;
    }
  }
  const interestMatchScore = Math.min(interestScore, 100);

  // Country vision alignment - analyzes how well this career aligns with national priorities
  let visionAlignmentScore = jobTrend?.nationalPriorityAlignment || 50;
  
  // Enhance with direct mission/vision analysis
  if (countryData) {
    const prioritySectors = countryData.prioritySectors || [];
    const nationalGoals = countryData.nationalGoals || [];
    
    // Stop words to filter out generic matches
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
      "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
      "been", "being", "have", "has", "had", "do", "does", "did", "will",
      "would", "should", "could", "may", "might", "must", "can"
    ]);
    
    // Tokenize career-related terms, filter stop words, keep meaningful words (3+ chars)
    const careerTerms = [
      career.title,
      career.category,
      ...career.relatedSubjects,
    ].join(" ").toLowerCase().split(/\s+/)
      .filter(term => term.length >= 3 && !stopWords.has(term));
    
    let sectorMatches = 0;
    let goalMatches = 0;
    
    // Check priority sector alignment with phrase-level matching
    for (const sector of prioritySectors) {
      const sectorPhrase = sector.toLowerCase();
      const sectorTokens = sector.toLowerCase().split(/\s+/)
        .filter(token => token.length >= 3 && !stopWords.has(token));
      
      // Prefer full phrase match
      if (careerTerms.some(term => sectorPhrase.includes(term) && term.length >= 4)) {
        sectorMatches++;
      } else {
        // Otherwise check for meaningful token overlap
        const overlap = sectorTokens.filter(token => 
          careerTerms.some(term => term.includes(token) || token.includes(term))
        ).length;
        if (overlap >= 1) {
          sectorMatches += 0.5; // Partial match
        }
      }
    }
    
    // Check national goals alignment similarly
    for (const goal of nationalGoals) {
      const goalPhrase = goal.toLowerCase();
      const goalTokens = goal.toLowerCase().split(/\s+/)
        .filter(token => token.length >= 3 && !stopWords.has(token));
      
      if (careerTerms.some(term => goalPhrase.includes(term) && term.length >= 4)) {
        goalMatches++;
      } else {
        const overlap = goalTokens.filter(token => 
          careerTerms.some(term => term.includes(token) || token.includes(term))
        ).length;
        if (overlap >= 1) {
          goalMatches += 0.5; // Partial match
        }
      }
    }
    
    // Calculate mission/vision adjustment (-10 to +10 for balanced scoring)
    let missionVisionAdjustment = 0;
    
    // Positive boost for matches (capped at +10)
    if (sectorMatches > 0 || goalMatches > 0) {
      missionVisionAdjustment = Math.min((sectorMatches * 4) + (goalMatches * 2), 10);
    } else {
      // Slight penalty if no alignment with any national priorities (-5)
      missionVisionAdjustment = -5;
    }
    
    // Blend with existing job trend alignment (80% trend, 20% mission/vision adjustment)
    visionAlignmentScore = visionAlignmentScore + (missionVisionAdjustment * 0.2);
    visionAlignmentScore = Math.min(Math.max(visionAlignmentScore, 0), 100);
  }
  
  const countryVisionAlignment = visionAlignmentScore;

  // Future market demand (uses job trend data)
  const futureMarketDemand = jobTrend?.demandScore || 60;

  // Overall weighted score with new 30/30/20/20 distribution:
  // - Subject Alignment (preference + competency): 30%
  // - Interest Alignment: 30%
  // - Country Vision Alignment: 20%
  // - Future Market Demand: 20%
  const overallMatchScore =
    subjectMatchScore * 0.30 +
    interestMatchScore * 0.30 +
    countryVisionAlignment * 0.20 +
    futureMarketDemand * 0.20;

  // Generate reasoning with competency insights
  const reasons: string[] = [];
  if (subjectMatchScore > 70) {
    if (assessment.subjectCompetencies && competencyScore > 70) {
      reasons.push(`Your strong performance in ${assessment.favoriteSubjects.slice(0, 2).join(" and ")} is validated by your demonstrated competency in these subjects`);
    } else {
      reasons.push(`Your interest in ${assessment.favoriteSubjects.slice(0, 2).join(" and ")} aligns well with this career`);
    }
  }
  if (interestMatchScore > 60) {
    reasons.push(`Your interests in ${assessment.interests.slice(0, 2).join(" and ")} match the core activities of this role`);
  }
  if (countryVisionAlignment > 70) {
    reasons.push(`This career directly contributes to your country's priority sectors and national development goals`);
  }
  if (futureMarketDemand > 70) {
    reasons.push(`This field is experiencing high growth and strong demand in your country's job market`);
  }

  const reasoning = reasons.length > 0
    ? reasons.join(". ") + "."
    : "This career offers a balanced match with your profile and local opportunities.";

  // Build structured metadata for frontend display
  const matchedSubjects: Array<{ subject: string; competency: number }> = [];
  const supportingVisionPriorities: string[] = [];

  // Collect matched subjects with competency scores
  if (assessment.subjectCompetencies && hasCompetencyData) {
    const competencies = assessment.subjectCompetencies as Record<string, { percentage: number }>;
    const relevantSubjects = assessment.favoriteSubjects.filter((s: string) =>
      career.relatedSubjects.includes(s)
    );
    
    relevantSubjects.forEach((subject: string) => {
      if (competencies[subject]) {
        matchedSubjects.push({
          subject,
          competency: Math.round(competencies[subject].percentage)
        });
      }
    });
  }

  // Extract supporting vision priorities from country vision plan
  if (countryData?.visionPlan && typeof countryData.visionPlan === 'object') {
    const visionPlan = countryData.visionPlan;
    
    // Collect priority sectors from matching vision categories
    for (const [category, data] of Object.entries(visionPlan as Record<string, any>)) {
      if (data && typeof data === 'object' && data.prioritySectors && Array.isArray(data.prioritySectors)) {
        // Check if this career/subject aligns with this category
        const categoryLower = category.toLowerCase();
        const careerTitleLower = career.title.toLowerCase();
        const careerDescLower = career.description?.toLowerCase() || "";
        
        // Simple matching: if career mentions category keywords or related subjects
        if (careerTitleLower.includes(categoryLower.split(' ')[0]) || 
            careerDescLower.includes(categoryLower.split(' ')[0])) {
          // Add top 2 priority sectors from this category
          const priorities = data.prioritySectors.slice(0, 2);
          supportingVisionPriorities.push(...priorities);
        }
      }
    }
  }

  return {
    overallMatchScore,
    subjectMatchScore,
    interestMatchScore,
    countryVisionAlignment,
    futureMarketDemand,
    reasoning,
    matchedSubjects: matchedSubjects.length > 0 ? matchedSubjects : undefined,
    supportingVisionPriorities: supportingVisionPriorities.length > 0 ? supportingVisionPriorities.slice(0, 3) : undefined,
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const validatedData = insertAssessmentSchema.parse(req.body);

      // Check if user is authenticated
      const userId = req.isAuthenticated() ? req.user.claims.sub : null;
      const isGuest = !userId;

      // For guest users, generate a unique guest token
      const guestToken = isGuest ? `guest_${Date.now()}_${Math.random().toString(36).substring(2, 15)}` : null;

      const assessment = await storage.createAssessment({
        ...validatedData,
        userId,
        isGuest,
        guestSessionId: guestToken, // Store guest token instead of session ID
      });

      // Debug logging
      console.log("Assessment created:", {
        isGuest,
        assessmentId: assessment.id,
        hasGuestToken: !!guestToken
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
      const assessment = await storage.updateAssessment(req.params.id, req.body);
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
      
      // Get question pool based on grade band (country-agnostic for subject competency)
      const gradeBand = assessment.grade && parseInt(assessment.grade as string) >= 10 ? "10-12" : "8-9";
      // Pass null for countryId to get global questions (subject competency is universal)
      const questionPool = await storage.getQuizQuestionsByGradeAndCountry(gradeBand, null);
      
      if (questionPool.length === 0) {
        return res.status(400).json({ message: "No quiz questions available for this grade level" });
      }
      
      // Filter questions by student's favorite subjects
      const favoriteSubjects = assessment.favoriteSubjects || [];
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
          const isCorrect = question.correctAnswer === userResponse.answer;
          const pointsEarned = isCorrect ? 1 : 0;
          
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
      
      // Update quiz record with subject scores and mark as completed
      await storage.updateAssessmentQuiz(quiz.id, {
        completedAt: new Date(),
        totalScore: overallAccuracy,
        subjectScores: subjectScores
      });
      
      res.json({ 
        success: true, 
        score: {
          subjectScores,
          overall: overallAccuracy,
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

  // Generate recommendations
  app.post("/api/recommendations/generate/:assessmentId", async (req, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      if (!assessment.countryId) {
        return res.status(400).json({ message: "Assessment missing country" });
      }

      const country = await storage.getCountryById(assessment.countryId);
      const allCareers = await storage.getAllCareers();

      // Enrich assessment with subject competency scores from quiz
      const enrichedAssessment = await enrichAssessmentWithCompetencies(assessment);

      const recommendations = [];

      for (const career of allCareers) {
        const jobTrend = await storage.getTrendByCareerAndCountry(career.id, assessment.countryId);

        const matchScores = calculateCareerMatch(enrichedAssessment, career, country, jobTrend);

        // Only recommend careers with overall match > 40%
        if (matchScores.overallMatchScore > 40) {
          const actionSteps = [
            `Research ${career.title} programs at universities in your country`,
            `Connect with professionals in this field through networking events or LinkedIn`,
            `Build relevant skills through online courses or certifications`,
            `Seek internships or volunteer opportunities in related organizations`,
          ];

          const recommendation = await storage.createRecommendation({
            assessmentId: assessment.id,
            careerId: career.id,
            ...matchScores,
            actionSteps,
            requiredEducation: career.educationLevel,
          });

          recommendations.push(recommendation);
        }
      }

      // Sort by overall match score
      recommendations.sort((a, b) => b.overallMatchScore - a.overallMatchScore);

      // Return top 5
      res.json(recommendations.slice(0, 5));
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

  // PDF Report Generation
  app.get("/api/recommendations/pdf/:assessmentId", async (req: any, res) => {
    try {
      const assessment = await storage.getAssessmentById(req.params.assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      // Authorization check: verify ownership
      // For registered users, verify authentication
      // For guest assessments, allow access (assessment IDs are UUIDs, hard to guess)
      if (assessment.userId && (!req.isAuthenticated() || req.user.claims.sub !== assessment.userId)) {
        return res.status(403).json({ message: "Unauthorized to access this report" });
      }

      const recommendations = await storage.getRecommendationsByAssessment(assessment.id);
      const country = assessment.countryId ? await storage.getCountryById(assessment.countryId) : null;

      // Create PDF document with custom margins
      const doc = new PDFDocument({ margin: layout.PAGE_MARGIN, size: "A4" });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="career-report-${assessment.id}.pdf"`);

      // Pipe PDF to response
      doc.pipe(res);
      
      let cursorY = 0;

      // ========== HERO HEADER ==========
      const heroHeight = drawGradientHeader(doc, {
        title: "Your Career Pathways!",
        subtitle: "Based on your interests, skills, and country's vision, here are your perfect matches",
        iconLabel: "★",
      });
      cursorY = heroHeight;

      // ========== SUBJECT COMPETENCY SPOTLIGHT (if quiz completed) ==========
      const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
      if (quiz && quiz.completedAt) {
        cursorY = ensurePageSpace(doc, 850, cursorY);
        
        const cardX = layout.PAGE_MARGIN;
        const cardWidth = doc.page.width - layout.PAGE_MARGIN * 2;
        const cardY = cursorY;
        
        const cardHeight = drawStickyCard(doc, {
          x: cardX,
          y: cardY,
          width: cardWidth,
          color: colors.stickyPurple,
          minHeight: 500,
          renderContent: (doc, contentX, contentY, contentWidth) => {
            let innerY = contentY;
            
            // Icon and title
            doc.fontSize(12).fillColor(colors.primary).text("✓", contentX + contentWidth / 2 - 6, innerY, { width: 12 });
            innerY += 20;
            doc.fontSize(20).font("Helvetica-Bold").fillColor(colors.textDark).text(
              "Your Subject Strengths",
              contentX,
              innerY,
              { width: contentWidth, align: "center" }
            );
            innerY += 30;
            
            doc.fontSize(9).font("Helvetica").fillColor(colors.textLight).text(
              "We tested your skills in your favorite subjects to validate your career matches",
              contentX,
              innerY,
              { width: contentWidth, align: "center" }
            );
            innerY += 30;
            
            // Overall competency score
            const overallScore = Math.round(quiz.totalScore);
            doc.fontSize(48).font("Helvetica-Bold").fillColor(colors.primary).text(
              `${overallScore}%`,
              contentX,
              innerY,
              { width: contentWidth, align: "center" }
            );
            innerY += 60;
            
            // Performance label
            let performanceLabel = "Excellent Mastery";
            if (overallScore < 80) performanceLabel = "Strong Understanding";
            if (overallScore < 60) performanceLabel = "Good Foundation";
            if (overallScore < 40) performanceLabel = "Room to Grow";
            
            doc.fontSize(11).font("Helvetica-Bold").fillColor(colors.textMedium).text(
              performanceLabel,
              contentX,
              innerY,
              { width: contentWidth, align: "center" }
            );
            innerY += 30;
            
            // Subject breakdown (top 4 subjects)
            const subjectScores = quiz.subjectScores as Record<string, { correct: number; total: number; percentage: number }> | null;
            if (subjectScores) {
              const sortedSubjects = Object.entries(subjectScores)
                .sort(([, a], [, b]) => b.percentage - a.percentage)
                .slice(0, 4);
              
              const col1X = contentX;
              const col2X = contentX + contentWidth / 2 + 8;
              const colWidth = contentWidth / 2 - 8;
              let subjectY = innerY;
              
              sortedSubjects.forEach(([subject, score], idx) => {
                const x = idx % 2 === 0 ? col1X : col2X;
                const y = subjectY + Math.floor(idx / 2) * 32;
                
                // Subject name and score
                doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.textDark).text(subject, x, y);
                doc.fontSize(10).font("Helvetica-Bold").fillColor(colors.primary).text(
                  `${score.percentage}%`,
                  x + colWidth - 40,
                  y
                );
                
                // Progress bar
                drawProgressBar(doc, { x, y: y + 12, width: colWidth, value: score.percentage, height: 6 });
                
                // Correct/total
                doc.fontSize(7).font("Helvetica").fillColor(colors.textMuted).text(
                  `${score.correct}/${score.total} correct`,
                  x,
                  y + 20
                );
              });
              
              innerY += Math.ceil(sortedSubjects.length / 2) * 32 + 10;
            }
            
            return innerY - contentY;
          },
        });
        
        cursorY += cardHeight + layout.CARD_GAP;
      }

      // ========== CAREER RECOMMENDATIONS ==========
      for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
        const rec: any = recommendations[i]; // Type as any to access matchedSubjects and supportingVisionPriorities
        const career = await storage.getCareerById(rec.careerId);
        
        if (!career) continue;

        cursorY = ensurePageSpace(doc, 850, cursorY);
        
        const cardX = layout.PAGE_MARGIN;
        const cardWidth = doc.page.width - layout.PAGE_MARGIN * 2;
        const cardY = cursorY;
        const cardColor = getStickyColor(i);
        
        const cardHeight = drawStickyCard(doc, {
          x: cardX,
          y: cardY,
          width: cardWidth,
          color: cardColor,
          minHeight: 800,
          renderContent: (doc, contentX, contentY, contentWidth) => {
            let innerY = contentY;
            
            // Career title
            doc.fontSize(18).font("Helvetica-Bold").fillColor(colors.textDark).text(
              career.title,
              contentX,
              innerY,
              { width: contentWidth - 70 }
            );
            
            // Match score badge
            drawCircularBadge(doc, {
              x: contentX + contentWidth - 30,
              y: innerY + 15,
              text: `${Math.round(rec.overallMatchScore)}%`,
              radius: 28,
            });
            
            innerY += 35;
            
            // Description
            doc.fontSize(9).font("Helvetica").fillColor(colors.textMedium);
            const descHeight = doc.heightOfString(career.description, { width: contentWidth, lineGap: 2 });
            doc.text(career.description, contentX, innerY, { width: contentWidth, lineGap: 2 });
            innerY += descHeight + 12;
            
            // Match breakdown (4 metrics in 2x2 grid)
            const metricCol1X = contentX;
            const metricCol2X = contentX + contentWidth / 2 + 8;
            const metricColWidth = contentWidth / 2 - 8;
            
            innerY += drawMetricRow(doc, {
              x: metricCol1X,
              y: innerY,
              width: metricColWidth,
              label: "Subject Match",
              value: rec.subjectMatchScore,
              weight: "30% weight • Validated by quiz",
              icon: "📚",
            });
            
            const metric2Y = innerY;
            innerY += drawMetricRow(doc, {
              x: metricCol2X,
              y: metric2Y,
              width: metricColWidth,
              label: "Interest Match",
              value: rec.interestMatchScore,
              weight: "30% weight",
              icon: "⭐",
            });
            
            innerY += 4;
            const metric3Y = innerY;
            innerY += drawMetricRow(doc, {
              x: metricCol1X,
              y: metric3Y,
              width: metricColWidth,
              label: "Vision Alignment",
              value: rec.countryVisionAlignment,
              weight: "20% weight",
              icon: "🎯",
            });
            
            const metric4Y = metric3Y;
            drawMetricRow(doc, {
              x: metricCol2X,
              y: metric4Y,
              width: metricColWidth,
              label: "Market Demand",
              value: rec.futureMarketDemand,
              weight: "20% weight",
              icon: "📈",
            });
            
            innerY += 12;
            
            // Competency validation badges (if available)
            if (rec.matchedSubjects && rec.matchedSubjects.length > 0) {
              doc.fontSize(8).font("Helvetica-Bold").fillColor(colors.textMuted).text(
                "✓ Validated by Your Competencies",
                contentX,
                innerY
              );
              innerY += 14;
              
              let badgeX = contentX;
              rec.matchedSubjects.slice(0, 3).forEach((item: any) => {
                const badge = drawBadge(doc, {
                  x: badgeX,
                  y: innerY,
                  text: `${item.subject}: ${item.competency}%`,
                  background: colors.competencyBg,
                  foreground: colors.primary,
                  fontSize: 8,
                  paddingX: 8,
                  paddingY: 4,
                });
                badgeX += badge.width + 6;
              });
              innerY += 24;
            }
            
            // Vision priorities (if available)
            if (rec.supportingVisionPriorities && rec.supportingVisionPriorities.length > 0) {
              doc.fontSize(8).font("Helvetica-Bold").fillColor(colors.textMuted).text(
                "🎯 Supports National Vision",
                contentX,
                innerY
              );
              innerY += 14;
              
              let badgeX = contentX;
              rec.supportingVisionPriorities.slice(0, 2).forEach((priority: string) => {
                const badge = drawBadge(doc, {
                  x: badgeX,
                  y: innerY,
                  text: priority,
                  background: colors.visionBg,
                  foreground: colors.textDark,
                  fontSize: 8,
                  paddingX: 8,
                  paddingY: 4,
                });
                badgeX += badge.width + 6;
              });
              innerY += 24;
            }
            
            // Why this career
            doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.textDark).text(
              "✓ Why This Career?",
              contentX,
              innerY
            );
            innerY += 14;
            doc.fontSize(8).font("Helvetica").fillColor(colors.textMedium);
            const reasonHeight = doc.heightOfString(rec.reasoning, { width: contentWidth, lineGap: 2 });
            doc.text(rec.reasoning, contentX, innerY, { width: contentWidth, lineGap: 2 });
            innerY += reasonHeight + 12;
            
            // Education path
            doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.textDark).text(
              "📚 Education Required",
              contentX,
              innerY
            );
            innerY += 14;
            doc.fontSize(8).font("Helvetica").fillColor(colors.textMedium).text(
              career.educationLevel,
              contentX,
              innerY,
              { width: contentWidth }
            );
            innerY += 20;
            
            // Next steps (first 3)
            if (rec.actionSteps && rec.actionSteps.length > 0) {
              doc.fontSize(9).font("Helvetica-Bold").fillColor(colors.textDark).text(
                "➜ Next Steps",
                contentX,
                innerY
              );
              innerY += 14;
              
              rec.actionSteps.slice(0, 3).forEach((step: string, idx: number) => {
                doc.fontSize(8).font("Helvetica").fillColor(colors.textMedium);
                doc.text(`${idx + 1}. `, contentX, innerY, { continued: true });
                const stepHeight = doc.heightOfString(step, { width: contentWidth - 15, lineGap: 2 });
                doc.text(step, { width: contentWidth - 15, lineGap: 2 });
                innerY += stepHeight + 4;
              });
            }
            
            return innerY - contentY;
          },
        });
        
        cursorY += cardHeight + layout.CARD_GAP;
      }

      // ========== FOOTER ==========
      cursorY = ensurePageSpace(doc, 50, cursorY);
      doc.fontSize(8).fillColor(colors.textMuted).font("Helvetica").text(
        `Generated on ${new Date().toLocaleDateString()} | Future Pathways Career Guidance System`,
        0,
        cursorY + 20,
        { align: "center", width: doc.page.width }
      );

      doc.end();
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
      const analytics = await storage.getAnalyticsOverview();
      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics overview:", error);
      res.status(500).json({ message: "Failed to fetch analytics overview" });
    }
  });

  app.get("/api/analytics/countries", async (req, res) => {
    try {
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
      const trends = await storage.getCareerTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/trends", async (req, res) => {
    try {
      const trends = await storage.getCareerTrends();
      res.json(trends);
    } catch (error) {
      console.error("Error fetching career trends:", error);
      res.status(500).json({ message: "Failed to fetch career trends" });
    }
  });

  app.get("/api/analytics/sectors", async (req, res) => {
    try {
      const pipeline = await storage.getSectorPipeline();
      res.json(pipeline);
    } catch (error) {
      console.error("Error fetching sector pipeline:", error);
      res.status(500).json({ message: "Failed to fetch sector pipeline" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
