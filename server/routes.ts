import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertAssessmentSchema } from "@shared/schema";
import { z } from "zod";
import PDFDocument from "pdfkit";

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

      // For guest users, ensure session is saved by marking it as modified
      if (isGuest) {
        req.session.isGuest = true;
        await new Promise((resolve, reject) => {
          req.session.save((err: any) => {
            if (err) reject(err);
            else resolve(null);
          });
        });
      }

      const assessment = await storage.createAssessment({
        ...validatedData,
        userId,
        isGuest,
        guestSessionId: isGuest ? req.session.id : null,
      });

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
      
      // Get assessment to check authorization and get grade/country
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization: Check if user owns assessment or matches guest session
      const isOwner = req.isAuthenticated() && assessment.userId === req.user.claims.sub;
      const isGuestOwner = assessment.isGuest && req.session.id === assessment.guestSessionId;
      
      // Debug logging
      console.log("Quiz Generate Auth Debug:", {
        isAuthenticated: req.isAuthenticated(),
        assessmentIsGuest: assessment.isGuest,
        requestSessionId: req.session.id,
        assessmentGuestSessionId: assessment.guestSessionId,
        isOwner,
        isGuestOwner,
        sessionObject: req.session
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
          .map((q: any) => ({
            ...q,
            correctAnswer: q.questionType === "rating" ? q.correctAnswer : undefined
          }));
        
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
        const shuffled = questionsForSubject.sort(() => Math.random() - 0.5);
        selectedQuestions.push(...shuffled.slice(0, Math.min(count, questionsForSubject.length)));
      }
      
      // If we still need more questions (edge case), add random ones from pool
      if (selectedQuestions.length < TARGET_QUESTIONS) {
        const remaining = subjectQuestions.filter(q => !selectedQuestions.some(sq => sq.id === q.id));
        const needed = TARGET_QUESTIONS - selectedQuestions.length;
        const shuffled = remaining.sort(() => Math.random() - 0.5);
        selectedQuestions.push(...shuffled.slice(0, needed));
      }
      
      // Shuffle final selection to avoid predictable ordering
      selectedQuestions.sort(() => Math.random() - 0.5);
      
      // Final validation: ensure we have exactly TARGET_QUESTIONS
      if (selectedQuestions.length < TARGET_QUESTIONS) {
        return res.status(400).json({ 
          message: `Unable to generate complete quiz. Only ${selectedQuestions.length} questions available for your subjects.`,
          availableQuestions: selectedQuestions.length,
          requiredQuestions: TARGET_QUESTIONS
        });
      }
      
      // Create assessment quiz record with empty subject scores
      const quiz = await storage.createAssessmentQuiz({
        assessmentId,
        questionsCount: selectedQuestions.length,
        totalScore: 0,
        subjectScores: {}
      });
      
      // Create placeholder quiz_responses for each selected question
      for (const question of selectedQuestions) {
        await storage.createQuizResponse({
          assessmentQuizId: quiz.id,
          questionId: question.id,
          answer: "",
          isCorrect: null,
          score: 0
        });
      }
      
      // Return questions without correct answers for multiple_choice
      const questionsForFrontend = selectedQuestions.map((q: any) => ({
        ...q,
        correctAnswer: q.questionType === "rating" ? q.correctAnswer : undefined
      }));
      
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
      const isOwner = req.user && assessment.userId === req.user.id;
      const isGuestOwner = assessment.isGuest && req.session.id === assessment.guestSessionId;
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
        .map((q: any) => ({
          ...q,
          correctAnswer: q.questionType === "rating" ? q.correctAnswer : undefined
        }));
      
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
      const { responses: userResponses } = req.body;
      
      if (!Array.isArray(userResponses)) {
        return res.status(400).json({ message: "Responses must be an array" });
      }
      
      // Get assessment to check authorization
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization check
      const isOwner = req.user && assessment.userId === req.user.id;
      const isGuestOwner = assessment.isGuest && req.session.id === assessment.guestSessionId;
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

      // Create PDF document
      const doc = new PDFDocument({ margin: 50 });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="career-report-${assessment.id}.pdf"`);

      // Pipe PDF to response
      doc.pipe(res);

      // Title
      doc.fontSize(24).fillColor("#6B46C1").text("Future Pathways", { align: "center" });
      doc.fontSize(16).fillColor("#374151").text("Career Guidance Report", { align: "center" });
      doc.moveDown(2);

      // Student Info
      doc.fontSize(14).fillColor("#1F2937").text("Student Profile", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor("#4B5563");
      doc.text(`Name: ${assessment.name || "Guest User"}`);
      doc.text(`Age: ${assessment.age}`);
      doc.text(`Grade: ${assessment.grade}`);
      doc.text(`Country: ${country?.name || "Not specified"}`);
      doc.moveDown();
      doc.text(`Favorite Subjects: ${assessment.favoriteSubjects.join(", ")}`);
      doc.text(`Interests: ${assessment.interests.join(", ")}`);
      doc.moveDown(2);

      // Quiz Results (if completed)
      const quiz = await storage.getAssessmentQuizByAssessmentId(assessment.id);
      if (quiz && quiz.completedAt) {
        doc.fontSize(14).fillColor("#1F2937").text("Subject Competency Assessment", { underline: true });
        doc.moveDown(0.5);
        
        doc.fontSize(11).fillColor("#4B5563");
        doc.text(`Overall Score: ${Math.round(quiz.totalScore)}%`, { continued: true });
        
        // Color code based on performance
        const overallScore = quiz.totalScore;
        let performanceText = "";
        let performanceColor = "#4B5563";
        if (overallScore >= 80) {
          performanceText = " - Excellent";
          performanceColor = "#10B981"; // Green
        } else if (overallScore >= 60) {
          performanceText = " - Good";
          performanceColor = "#3B82F6"; // Blue
        } else if (overallScore >= 40) {
          performanceText = " - Fair";
          performanceColor = "#F59E0B"; // Orange
        } else {
          performanceText = " - Needs Improvement";
          performanceColor = "#EF4444"; // Red
        }
        doc.fillColor(performanceColor).text(performanceText);
        
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor("#6B7280");
        doc.text("Subject Performance:");
        doc.fontSize(8).fillColor("#6B7280");
        
        // Display subject scores from jsonb
        const subjectScores = quiz.subjectScores as Record<string, { correct: number; total: number; percentage: number }> | null;
        if (subjectScores) {
          for (const [subject, scores] of Object.entries(subjectScores)) {
            doc.text(`  • ${subject}: ${scores.percentage}% (${scores.correct}/${scores.total} correct)`);
          }
        }
        
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor("#4B5563");
        doc.text("✓ Your quiz results validate your subject preferences and help identify careers that match your actual competencies.");
        doc.text("• Careers recommended below align with subjects where you demonstrated strong performance.");
        
        doc.moveDown(2);
      }

      // Recommendations
      doc.fontSize(14).fillColor("#1F2937").text("Top Career Recommendations", { underline: true });
      doc.moveDown(1);

      for (let i = 0; i < Math.min(recommendations.length, 5); i++) {
        const rec = recommendations[i];
        const career = await storage.getCareerById(rec.careerId);
        
        if (!career) continue;

        doc.fontSize(13).fillColor("#6B46C1").text(`${i + 1}. ${career.title}`, { underline: false });
        doc.moveDown(0.3);
        
        doc.fontSize(10).fillColor("#4B5563");
        doc.text(`Overall Match: ${Math.round(rec.overallMatchScore)}%`);
        doc.text(`Category: ${career.category}`);
        doc.text(`Education Required: ${career.educationLevel}`);
        doc.moveDown(0.3);
        
        doc.fontSize(9).fillColor("#6B7280");
        doc.text(career.description, { width: 500 });
        doc.moveDown(0.5);

        // Match Breakdown
        doc.fontSize(9).fillColor("#374151").text("Match Breakdown:");
        doc.fontSize(8).fillColor("#6B7280");
        doc.text(`  • Subject Alignment: ${Math.round(rec.subjectMatchScore)}% (30% weight)`);
        doc.text(`  • Interest Alignment: ${Math.round(rec.interestMatchScore)}% (30% weight)`);
        doc.text(`  • Country Vision Alignment: ${Math.round(rec.countryVisionAlignment)}% (20% weight)`);
        doc.text(`  • Future Market Demand: ${Math.round(rec.futureMarketDemand)}% (20% weight)`);
        doc.moveDown(0.5);

        // Action Steps
        doc.fontSize(9).fillColor("#374151").text("Next Steps:");
        doc.fontSize(8).fillColor("#6B7280");
        rec.actionSteps.forEach((step: string) => {
          doc.text(`  • ${step}`, { width: 500 });
        });
        
        if (i < recommendations.length - 1) {
          doc.moveDown(1.5);
        }
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(8).fillColor("#9CA3AF").text(
        `Generated on ${new Date().toLocaleDateString()} | Future Pathways Career Guidance System`,
        { align: "center" }
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
