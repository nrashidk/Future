import type { Express } from "express";
import { storage } from "../storage";
import { transformQuizQuestionForFrontend, shuffleQuestions, shuffleOptions } from "../utils/quiz";
import { normalizeSubjectsAsync } from "../utils/subjects";
import { printTokenAuthorizes } from "../utils/printToken";

/** Detect preferred language from standard Accept-Language or custom X-Language header */
function getRequestLanguage(req: any): string {
  const acceptLang = (req.headers["accept-language"] || "").toLowerCase();
  const xLang = (req.headers["x-language"] || "").toLowerCase();
  if (acceptLang.startsWith("ar") || xLang === "ar") return "ar";
  return "en";
}

/** Shape a transformed question so `question.question` is in the requested language */
function applyLanguageToQuestion(question: any, lang: string): any {
  if (lang !== "ar") return question;
  return {
    ...question,
    question: question.questionAr || question.question,
  };
}

interface QuizDistributionConfig {
  baseQuestionsPerSubject: number;
  priorityBonus: number;
  maxQuestionsPerSubject: number;
  tierMultiplier: number;
}

const TIER_CONFIGS: Record<string, QuizDistributionConfig> = {
  free: {
    baseQuestionsPerSubject: 2,
    priorityBonus: 2,
    maxQuestionsPerSubject: 4,
    tierMultiplier: 1,
  },
  premium: {
    baseQuestionsPerSubject: 3,
    priorityBonus: 2,
    maxQuestionsPerSubject: 5,
    tierMultiplier: 1.2,
  },
  school: {
    baseQuestionsPerSubject: 3,
    priorityBonus: 2,
    maxQuestionsPerSubject: 5,
    tierMultiplier: 1.2,
  },
};

function calculateQuizDistribution(
  favoriteSubjects: string[],
  prioritySubjects: string[],
  tier: 'free' | 'premium' | 'school'
): Map<string, number> {
  const config = TIER_CONFIGS[tier];
  const distribution = new Map<string, number>();
  
  for (const subject of favoriteSubjects) {
    const isPriority = prioritySubjects.includes(subject);
    let questionsForSubject = config.baseQuestionsPerSubject;
    
    if (isPriority) {
      questionsForSubject += config.priorityBonus;
    }
    
    questionsForSubject = Math.min(questionsForSubject, config.maxQuestionsPerSubject);
    distribution.set(subject, questionsForSubject);
  }
  
  return distribution;
}

function getTotalQuestionsFromDistribution(distribution: Map<string, number>): number {
  let total = 0;
  distribution.forEach(count => total += count);
  return total;
}

export function registerQuizRoutes(app: Express) {
  app.post("/api/assessments/:assessmentId/quiz/generate", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      const guestToken = req.body.guestToken || req.cookies?.guest_token;
      
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      const userId = req.isAuthenticated() ? (req.user.userId) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
      const isGuestOwner = assessment.isGuest && guestToken && assessment.guestSessionId === guestToken;
      
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
      
      const existingQuiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (existingQuiz) {
        const responses = await storage.getQuizResponsesByQuizId(existingQuiz.id);
        const questionIds = responses.map(r => r.questionId);
        const lang = getRequestLanguage(req);
        
        const allQuestions = await storage.getAllQuizQuestions();
        const questions = allQuestions
          .filter(q => questionIds.includes(q.id))
          .map(q => applyLanguageToQuestion(transformQuizQuestionForFrontend(q), lang));
        
        return res.json({ 
          quizId: existingQuiz.id, 
          questions,
          responses: responses.map(r => ({ questionId: r.questionId, answer: r.answer })),
          completed: !!existingQuiz.completedAt
        });
      }
      
      // Extract numeric grade from strings like "grade11", "11", or just the number
      let studentGrade: number | null = null;
      if (assessment.grade) {
        const gradeStr = String(assessment.grade);
        // Try to extract number from string like "grade11" or just "11"
        const match = gradeStr.match(/(\d+)/);
        if (match) {
          studentGrade = parseInt(match[1], 10);
        }
      }
      const curriculum = (assessment as any).curriculum || null;
      
      console.log(`Quiz generation: parsed grade ${studentGrade} from "${assessment.grade}", curriculum: ${curriculum}`);
      
      let questionPool: any[] = [];
      
      if (studentGrade && curriculum) {
        questionPool = await storage.getQuizQuestionsByFilters({
          countryId: assessment.countryId,
          grade: studentGrade,
          curriculum: curriculum,
        });
        console.log(`Found ${questionPool.length} questions for grade ${studentGrade}, curriculum ${curriculum}, country ${assessment.countryId}`);
      }
      
      if (questionPool.length === 0 && studentGrade) {
        questionPool = await storage.getQuizQuestionsByFilters({
          countryId: assessment.countryId,
          grade: studentGrade,
        });
        console.log(`Fallback: Found ${questionPool.length} questions for grade ${studentGrade}, country ${assessment.countryId}`);
      }
      
      if (questionPool.length === 0 && studentGrade) {
        questionPool = await storage.getQuizQuestionsByFilters({
          countryId: null,
          grade: studentGrade,
        });
        console.log(`Global fallback: Found ${questionPool.length} questions for grade ${studentGrade}, global`);
      }
      
      if (questionPool.length === 0 && studentGrade) {
        const nearbyGrades = [studentGrade - 1, studentGrade + 1].filter(g => g >= 8 && g <= 12);
        for (const nearbyGrade of nearbyGrades) {
          questionPool = await storage.getQuizQuestionsByFilters({
            grade: nearbyGrade,
          });
          if (questionPool.length > 0) {
            console.log(`Nearby grade fallback: Found ${questionPool.length} questions for grade ${nearbyGrade}`);
            break;
          }
        }
      }
      
      if (questionPool.length === 0) {
        return res.status(400).json({ message: "No quiz questions available for this grade level and country" });
      }
      
      // Normalize subjects using curriculum-aware async function for better alias resolution
      // curriculum variable is already defined above (line 110)
      const favoriteSubjects = await normalizeSubjectsAsync(
        (assessment.favoriteSubjects as string[]) || [],
        assessment.countryId,
        curriculum || undefined
      );
      const prioritySubjects = await normalizeSubjectsAsync(
        ((assessment as any).prioritySubjects as string[]) || [],
        assessment.countryId,
        curriculum || undefined
      );
      const subjectQuestions = questionPool.filter(q => favoriteSubjects.includes(q.subject));
      
      if (subjectQuestions.length === 0) {
        return res.status(400).json({ 
          message: "No quiz questions available for your favorite subjects. Please update your subject preferences." 
        });
      }
      
      let user = null;
      let isSchoolUser = false;
      if (assessment.userId) {
        user = await storage.getUser(assessment.userId);
        if (user) {
          const orgMember = await storage.getOrganizationMemberByUserId(user.id);
          isSchoolUser = !!orgMember;
        }
      }
      const tier: 'free' | 'premium' | 'school' = user?.isPremium 
        ? (isSchoolUser ? 'school' : 'premium') 
        : 'free';
      
      const distribution = calculateQuizDistribution(favoriteSubjects, prioritySubjects, tier);
      const targetTotal = getTotalQuestionsFromDistribution(distribution);
      
      console.log(`Quiz distribution for ${tier} tier:`, Object.fromEntries(distribution));
      console.log(`Target total questions: ${targetTotal}`);
      
      const selectedQuestions: any[] = [];
      
      for (const [subject, targetCount] of Array.from(distribution)) {
        const questionsForSubject = subjectQuestions.filter(q => q.subject === subject);
        const shuffled = shuffleQuestions(questionsForSubject);
        const available = Math.min(targetCount, shuffled.length);
        selectedQuestions.push(...shuffled.slice(0, available));
        
        if (available < targetCount) {
          console.log(`Warning: Only ${available} questions available for ${subject}, wanted ${targetCount}`);
        }
      }
      
      const MIN_QUESTIONS = 6;
      if (selectedQuestions.length < MIN_QUESTIONS) {
        const remaining = subjectQuestions.filter(q => !selectedQuestions.some(sq => sq.id === q.id));
        const needed = MIN_QUESTIONS - selectedQuestions.length;
        const shuffled = shuffleQuestions(remaining);
        selectedQuestions.push(...shuffled.slice(0, needed));
        
        if (selectedQuestions.length < MIN_QUESTIONS) {
          return res.status(400).json({ 
            message: `Not enough questions available for your subjects. We need at least ${MIN_QUESTIONS} questions, but only found ${selectedQuestions.length}. Please select more subjects or contact support.`,
            availableQuestions: selectedQuestions.length,
            requiredQuestions: MIN_QUESTIONS
          });
        }
      }
      
      const finalShuffledQuestions = shuffleQuestions(selectedQuestions);
      const questionsWithShuffledOptions = finalShuffledQuestions.map(q => shuffleOptions(q));
      
      const quiz = await storage.createAssessmentQuiz({
        assessmentId,
        questionsCount: questionsWithShuffledOptions.length,
        totalScore: 0,
        subjectScores: {}
      });
      
      for (const question of questionsWithShuffledOptions) {
        await storage.createQuizResponse({
          assessmentQuizId: quiz.id,
          questionId: question.id,
          answer: "",
          isCorrect: null,
          score: 0
        });
      }
      
      const lang = getRequestLanguage(req);
      const questionsForFrontend = questionsWithShuffledOptions
        .map(q => applyLanguageToQuestion(transformQuizQuestionForFrontend(q), lang));
      
      const distributionInfo = Object.fromEntries(
        Array.from(distribution).map(([subject, target]) => {
          const actual = selectedQuestions.filter(q => q.subject === subject).length;
          return [subject, { target, actual, isPriority: prioritySubjects.includes(subject) }];
        })
      );
      
      res.json({ 
        quizId: quiz.id, 
        questions: questionsForFrontend, 
        responses: [], 
        completed: false,
        distribution: distributionInfo,
        totalQuestions: questionsWithShuffledOptions.length
      });
    } catch (error) {
      console.error("Error generating quiz:", error);
      res.status(500).json({ message: "Failed to generate quiz" });
    }
  });
  
  app.get("/api/assessments/:assessmentId/quiz", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      const guestToken = req.query.guestToken || req.cookies?.guest_token;
      const userId = req.isAuthenticated() ? (req.user.userId) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
      const isGuestOwner = assessment.isGuest && guestToken && assessment.guestSessionId === guestToken;
      // Server-side PDF render: a print token scoped to THIS assessment
      // authorizes the read (headless browser carries no session cookie).
      const isPrintTokenOwner = printTokenAuthorizes(req.query.printToken, assessmentId);
      if (!isOwner && !isGuestOwner && !isPrintTokenOwner) {
        return res.status(403).json({ message: "Unauthorized to view this quiz" });
      }
      
      const quiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found for this assessment" });
      }
      
      const responses = await storage.getQuizResponsesByQuizId(quiz.id);
      const questionIds = responses.map(r => r.questionId);
      
      const lang = getRequestLanguage(req);
      const allQuestions = await storage.getAllQuizQuestions();
      const questions = allQuestions
        .filter(q => questionIds.includes(q.id))
        .map(q => applyLanguageToQuestion(transformQuizQuestionForFrontend(q), lang));
      
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
  
  app.post("/api/assessments/:assessmentId/quiz/submit", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      const { responses: userResponses } = req.body;
      const guestToken = req.body.guestToken || req.cookies?.guest_token;
      
      if (!Array.isArray(userResponses)) {
        return res.status(400).json({ message: "Responses must be an array" });
      }
      
      if (userResponses.length === 0) {
        return res.status(400).json({ message: "Responses array cannot be empty" });
      }
      
      for (const response of userResponses) {
        if (!response.questionId || response.answer === undefined || response.answer === null) {
          return res.status(400).json({ message: "Each response must have questionId and answer" });
        }
        if (typeof response.questionId !== 'string' || response.questionId.trim() === '') {
          return res.status(400).json({ message: "Invalid questionId format" });
        }
      }
      
      const answeredIds = userResponses.map((r: any) => r.questionId);
      const uniqueIds = new Set(answeredIds);
      if (answeredIds.length !== uniqueIds.size) {
        return res.status(400).json({ message: "Duplicate question IDs in submission" });
      }
      
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      const userId = req.isAuthenticated() ? (req.user.userId) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
      const isGuestOwner = assessment.isGuest && guestToken && assessment.guestSessionId === guestToken;
      
      if (!isOwner && !isGuestOwner) {
        return res.status(403).json({ message: "Unauthorized to submit quiz for this assessment" });
      }
      
      const quiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }
      
      if (quiz.completedAt) {
        return res.status(400).json({ code: "QUIZ_ALREADY_SUBMITTED", message: "This quiz has already been submitted. Please continue to the next step." });
      }
      
      const existingResponses = await storage.getQuizResponsesByQuizId(quiz.id);
      const questionIds = existingResponses.map(r => r.questionId);
      
      const invalidIds = answeredIds.filter(id => !questionIds.includes(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({ message: `Invalid question IDs: ${invalidIds.join(', ')}` });
      }
      
      const allQuestions = await storage.getAllQuizQuestions();
      const questions = allQuestions.filter(q => questionIds.includes(q.id));
      
      const missingAnswers = questionIds.filter((id: string) => !answeredIds.includes(id));
      
      if (missingAnswers.length > 0) {
        return res.status(400).json({ message: "All questions must be answered" });
      }
      
      const subjectScores: Record<string, { correct: number; total: number; percentage: number }> = {};
      let totalCorrect = 0;
      let totalQuestions = 0;
      
      for (const userResponse of userResponses) {
        const question = questions.find((q: any) => q.id === userResponse.questionId);
        if (!question) continue;
        
        if (question.questionType === "multiple_choice" && !question.correctAnswer) {
          console.error(`Question ${question.id} missing correctAnswer`);
          continue;
        }
        
        const existingResponse = existingResponses.find(r => r.questionId === question.id);
        if (existingResponse) {
          const isCorrect = userResponse.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
          
          await storage.updateQuizResponse(existingResponse.id, {
            answer: userResponse.answer,
            isCorrect,
            score: isCorrect ? 1 : 0
          });
          
          if (!subjectScores[question.subject]) {
            subjectScores[question.subject] = { correct: 0, total: 0, percentage: 0 };
          }
          subjectScores[question.subject].total++;
          if (isCorrect) {
            subjectScores[question.subject].correct++;
            totalCorrect++;
          }
          totalQuestions++;
        }
      }
      
      for (const subject in subjectScores) {
        const { correct, total } = subjectScores[subject];
        subjectScores[subject].percentage = Math.round((correct / total) * 100);
      }
      
      const overallScore = Math.round((totalCorrect / totalQuestions) * 100);
      
      await storage.updateAssessmentQuiz(quiz.id, {
        totalScore: overallScore,
        subjectScores,
        completedAt: new Date()
      });
      
      await storage.updateAssessment(assessmentId, {
        quizScore: overallScore,
        subjectCompetencies: subjectScores
      });
      
      res.json({ 
        success: true, 
        totalScore: overallScore,
        subjectScores,
        message: "Quiz completed successfully" 
      });
    } catch (error) {
      console.error("Error submitting quiz:", error);
      res.status(500).json({ message: "Failed to submit quiz" });
    }
  });
}
