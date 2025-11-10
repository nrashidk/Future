import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertAssessmentSchema, insertQuizQuestionSchema } from "@shared/schema";
import { z } from "zod";
import { transformQuizQuestionForFrontend, shuffleQuestions, shuffleOptions } from "./utils/quiz";
import { calculateKolbScores } from "./questionBanks/kolb";
import { calculateRiasecScores } from "./questionBanks/riasec";
import Stripe from "stripe";

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

// Career-to-learning-style affinity mapping
// Based on our proprietary learning style framework: Diverging, Assimilating, Converging, Accommodating
function getCareerLearningStyleAffinities(career: any): Record<string, number> {
  const category = career.category?.toLowerCase() || "";
  const title = career.title?.toLowerCase() || "";
  
  // Default: all styles equally viable
  const affinities: Record<string, number> = {
    Diverging: 50,
    Assimilating: 50,
    Converging: 50,
    Accommodating: 50,
  };
  
  // Engineering, Technology, Applied Sciences → Converging (practical application)
  if (category.includes("engineer") || category.includes("technology") || 
      title.includes("engineer") || title.includes("developer") || title.includes("technician")) {
    affinities.Converging = 85;
    affinities.Assimilating = 65;
    affinities.Accommodating = 45;
    affinities.Diverging = 35;
  }
  // Research, Pure Sciences → Assimilating (theoretical models)
  else if (category.includes("research") || category.includes("science") || 
           title.includes("scientist") || title.includes("researcher") || title.includes("analyst")) {
    affinities.Assimilating = 85;
    affinities.Converging = 60;
    affinities.Diverging = 50;
    affinities.Accommodating = 35;
  }
  // Creative, Arts, Design → Diverging (broad cultural interests, imagination)
  else if (category.includes("creative") || category.includes("arts") || category.includes("design") ||
           title.includes("artist") || title.includes("designer") || title.includes("creative")) {
    affinities.Diverging = 85;
    affinities.Accommodating = 60;
    affinities.Assimilating = 40;
    affinities.Converging = 35;
  }
  // Business, Sales, Management → Accommodating (hands-on, adaptive)
  else if (category.includes("business") || category.includes("management") || category.includes("sales") ||
           title.includes("manager") || title.includes("entrepreneur") || title.includes("sales")) {
    affinities.Accommodating = 85;
    affinities.Diverging = 60;
    affinities.Converging = 50;
    affinities.Assimilating = 35;
  }
  // Healthcare, Teaching (mix of practical and reflective) → Balanced
  else if (category.includes("health") || category.includes("education") || category.includes("teaching")) {
    affinities.Diverging = 70;
    affinities.Accommodating = 70;
    affinities.Assimilating = 55;
    affinities.Converging = 55;
  }
  
  return affinities;
}

// Intelligent matching algorithm with subject competency validation and learning style
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
  learningStyleMatch: number | null;
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

  // Calculate interest match (0-100) with flexible, case-insensitive matching
  const interestKeywords: Record<string, string[]> = {
    Technology: ["computer", "software", "engineer", "data", "tech", "IT", "digital", "cyber", "network", "programming", "developer", "analyst", "system"],
    Creative: ["art", "music", "design", "creative", "media", "graphic", "animation", "photography", "writing", "content"],
    Helping: ["health", "medical", "education", "teaching", "social", "care", "nurse", "doctor", "counselor", "support", "service"],
    "Problem Solving": ["math", "analy", "research", "science", "engineer", "consult", "strategy", "solution", "technical"],
    Research: ["research", "science", "biolog", "chemist", "physics", "laboratory", "study", "investigation", "analy"],
    Business: ["business", "finance", "economic", "market", "sales", "accounting", "banking", "commercial", "entrepreneur"],
    Leadership: ["manage", "leader", "director", "executive", "supervisor", "coordinator", "admin", "chief", "head"],
  };

  // Build searchable career text (lowercase for case-insensitive matching)
  const careerSearchText = [
    career.title,
    career.category,
    career.description || "",
    ...(career.relatedSubjects || []),
  ].join(" ").toLowerCase();

  let interestScore = 0;
  for (const interest of assessment.interests) {
    const keywords = interestKeywords[interest] || [];
    const matchCount = keywords.filter(keyword => 
      careerSearchText.includes(keyword.toLowerCase())
    ).length;
    
    if (matchCount > 0) {
      // Award 25 points for primary match, +5 for each additional keyword match (max 35 per interest)
      interestScore += Math.min(25 + (matchCount - 1) * 5, 35);
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

  // Learning Style Match - only for Individual Assessment users with advanced learning style analysis
  let learningStyleMatch: number | null = null;
  
  if (assessment.kolbScores && assessment.assessmentType === 'kolb') {
    const kolbScores = assessment.kolbScores as { learningStyle: string };
    const studentStyle = kolbScores.learningStyle;
    
    // Get career affinity scores for each learning style
    const careerAffinities = getCareerLearningStyleAffinities(career);
    
    // Match student's learning style to career affinity
    learningStyleMatch = careerAffinities[studentStyle] || 50;
    
    console.log(`Learning style match for ${career.title}: ${studentStyle} → ${learningStyleMatch}`);
  }

  // Overall weighted score with 25/25/20/20/10 distribution:
  // - Subject Alignment (preference + competency): 25%
  // - Interest Alignment: 25%
  // - Country Vision Alignment: 20%
  // - Future Market Demand: 20%
  // - Learning Style Match: 10% (only for Individual Assessment users)
  let overallMatchScore: number;
  
  if (learningStyleMatch !== null) {
    // Individual Assessment user with advanced learning style analysis
    overallMatchScore =
      subjectMatchScore * 0.25 +
      interestMatchScore * 0.25 +
      countryVisionAlignment * 0.20 +
      futureMarketDemand * 0.20 +
      learningStyleMatch * 0.10;
  } else {
    // Basic assessment user - redistribute learning style's 10% across other factors
    overallMatchScore =
      subjectMatchScore * 0.275 +
      interestMatchScore * 0.275 +
      countryVisionAlignment * 0.225 +
      futureMarketDemand * 0.225;
  }

  // Generate reasoning with competency insights and learning style
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
  
  // Add learning style insight for premium users
  if (learningStyleMatch !== null && learningStyleMatch > 65) {
    const kolbScores = assessment.kolbScores as { learningStyle: string };
    const learningStyleDescriptions: Record<string, string> = {
      Diverging: "reflective and imaginative approach",
      Assimilating: "analytical and theoretical thinking",
      Converging: "practical problem-solving skills",
      Accommodating: "hands-on and adaptive style",
    };
    const styleDesc = learningStyleDescriptions[kolbScores.learningStyle] || "learning approach";
    reasons.push(`Your ${styleDesc} is well-suited for the demands of this career path`);
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
    learningStyleMatch,
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
      const updateData = { ...req.body };

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
