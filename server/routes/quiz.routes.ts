import type { Express } from "express";
import { storage } from "../storage";
import { transformQuizQuestionForFrontend, shuffleQuestions, shuffleOptions } from "../utils/quiz";
import { normalizeSubjects } from "../utils/subjects";

export function registerQuizRoutes(app: Express) {
  // POST /api/assessments/:assessmentId/quiz/generate - Generate quiz for assessment
  app.post("/api/assessments/:assessmentId/quiz/generate", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      // Support both body param (legacy) and httpOnly cookie (secure)
      const guestToken = req.body.guestToken || req.cookies?.guest_token;
      
      // Get assessment to check authorization and get grade/country
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization: Check if user owns assessment or has valid guest token
      const userId = req.isAuthenticated() ? (req.user.isLocal ? req.user.userId : req.user.claims.sub) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
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
      
      // Get question pool based on grade, curriculum, and student's country
      const studentGrade = assessment.grade ? parseInt(assessment.grade as string) : null;
      const gradeBand = studentGrade && studentGrade >= 10 ? "10-12" : "8-9";
      const curriculum = (assessment as any).curriculum || null;
      
      // Try to get individual grade + curriculum specific questions first
      let questionPool: any[] = [];
      
      if (studentGrade && curriculum) {
        questionPool = await storage.getQuizQuestionsByFilters({
          countryId: assessment.countryId,
          grade: studentGrade,
          curriculum: curriculum,
        });
        console.log(`Found ${questionPool.length} questions for grade ${studentGrade}, curriculum ${curriculum}, country ${assessment.countryId}`);
      }
      
      // Fallback: try individual grade without curriculum filter
      if (questionPool.length === 0 && studentGrade) {
        questionPool = await storage.getQuizQuestionsByFilters({
          countryId: assessment.countryId,
          grade: studentGrade,
        });
        console.log(`Fallback: Found ${questionPool.length} questions for grade ${studentGrade}, country ${assessment.countryId}`);
      }
      
      // Fallback: try legacy gradeBand approach
      if (questionPool.length === 0) {
        questionPool = await storage.getQuizQuestionsByGradeAndCountry(gradeBand, assessment.countryId);
        console.log(`Legacy fallback: Found ${questionPool.length} questions for gradeBand ${gradeBand}, country ${assessment.countryId}`);
      }
      
      // Fallback: if no country-specific questions exist, try UAE questions as default
      if (questionPool.length === 0 && assessment.countryId !== 'uae') {
        console.log(`No questions found for country ${assessment.countryId}, falling back to UAE curriculum`);
        questionPool = await storage.getQuizQuestionsByGradeAndCountry(gradeBand, 'uae');
      }
      
      // Fallback: if still no questions, try global questions (countryId = null)
      if (questionPool.length === 0) {
        console.log(`No country questions found, falling back to global questions`);
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
      const userId = req.isAuthenticated() ? (req.user.isLocal ? req.user.userId : req.user.claims.sub) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
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
      const { responses: userResponses } = req.body;
      // Support both body param (legacy) and httpOnly cookie (secure)
      const guestToken = req.body.guestToken || req.cookies?.guest_token;
      
      // Validation: Check if responses is an array
      if (!Array.isArray(userResponses)) {
        return res.status(400).json({ message: "Responses must be an array" });
      }
      
      // Validation: Check for empty responses
      if (userResponses.length === 0) {
        return res.status(400).json({ message: "Responses array cannot be empty" });
      }
      
      // Validation: Check each response has required fields
      for (const response of userResponses) {
        if (!response.questionId || response.answer === undefined || response.answer === null) {
          return res.status(400).json({ message: "Each response must have questionId and answer" });
        }
        if (typeof response.questionId !== 'string' || response.questionId.trim() === '') {
          return res.status(400).json({ message: "Invalid questionId format" });
        }
      }
      
      // Validation: Check for duplicate question IDs
      const answeredIds = userResponses.map((r: any) => r.questionId);
      const uniqueIds = new Set(answeredIds);
      if (answeredIds.length !== uniqueIds.size) {
        return res.status(400).json({ message: "Duplicate question IDs in submission" });
      }
      
      // Get assessment to check authorization
      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }
      
      // Authorization: Check if user owns assessment or has valid guest token
      const userId = req.isAuthenticated() ? (req.user.isLocal ? req.user.userId : req.user.claims.sub) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
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
        return res.status(400).json({ message: "This quiz has already been submitted. Please continue to the next step." });
      }
      
      // Get existing responses to get question IDs
      const existingResponses = await storage.getQuizResponsesByQuizId(quiz.id);
      const questionIds = existingResponses.map(r => r.questionId);
      
      // Validation: Check all submitted question IDs belong to this quiz
      const invalidIds = answeredIds.filter(id => !questionIds.includes(id));
      if (invalidIds.length > 0) {
        return res.status(400).json({ message: `Invalid question IDs: ${invalidIds.join(', ')}` });
      }
      
      // Fetch full question details
      const allQuestions = await storage.getAllQuizQuestions();
      const questions = allQuestions.filter(q => questionIds.includes(q.id));
      
      // Validate all questions are answered
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
          const isCorrect = userResponse.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase();
          
          await storage.updateQuizResponse(existingResponse.id, {
            answer: userResponse.answer,
            isCorrect,
            score: isCorrect ? 1 : 0
          });
          
          // Track per-subject scores
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
      
      // Calculate percentages for each subject
      for (const subject in subjectScores) {
        const { correct, total } = subjectScores[subject];
        subjectScores[subject].percentage = Math.round((correct / total) * 100);
      }
      
      // Calculate overall score
      const overallScore = Math.round((totalCorrect / totalQuestions) * 100);
      
      // Update quiz with scores and mark as completed
      await storage.updateAssessmentQuiz(quiz.id, {
        totalScore: overallScore,
        subjectScores,
        completedAt: new Date()
      });
      
      // Update assessment with quiz score and subject competencies
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
