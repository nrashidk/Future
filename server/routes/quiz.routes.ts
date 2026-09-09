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

/**
 * PER-SUBJECT AND ADDITIVE — there is no total, and no budget being divided.
 * Each chosen subject independently draws
 *   min(base + (isPriority ? priorityBonus : 0), maxQuestionsPerSubject)
 * so the quiz LENGTH GROWS with each subject the student adds:
 *
 *              3 subj   4 subj   5 subj      (priority subjects = min(n, 3))
 *     free        12       14       16       priority 4 each, others 2 each
 *     premium     15       18       21       priority 5 each, others 3 each
 *     school      15       18       21
 *
 * Nothing here varies by grade. `school` and `premium` are identical configs and
 * quiz.tier.test.ts pins that, so a divergence has to be deliberate.
 *
 * There was a fourth field, `tierMultiplier` (1 / 1.2 / 1.2), removed because it
 * was never read — the premium/school gap comes entirely from the higher `base`.
 * A config value that looks like it scales the quiz and does not is worse than
 * no value at all: it invites a reader to reason about a 20% uplift that has
 * never existed.
 */
interface QuizDistributionConfig {
  baseQuestionsPerSubject: number;
  priorityBonus: number;
  maxQuestionsPerSubject: number;
}

const TIER_CONFIGS: Record<string, QuizDistributionConfig> = {
  free: {
    baseQuestionsPerSubject: 2,
    priorityBonus: 2,
    maxQuestionsPerSubject: 4,
  },
  premium: {
    baseQuestionsPerSubject: 3,
    priorityBonus: 2,
    maxQuestionsPerSubject: 5,
  },
  school: {
    baseQuestionsPerSubject: 3,
    priorityBonus: 2,
    maxQuestionsPerSubject: 5,
  },
};

export function calculateQuizDistribution(
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

export type QuizTier = 'free' | 'premium' | 'school';

/**
 * Resolve which quiz distribution a taker gets.
 *
 * BUG #3: this used to read `user.isPremium` as the sole gate:
 *   isPremium ? (isSchoolUser ? 'school' : 'premium') : 'free'
 * A school student's `users.isPremium` column is FALSE - createUserWithCredentials
 * never sets it - and the `true` a school student sees in the client comes from a
 * response-only decoration in auth.routes.ts (`user.isPremium = true`) that is
 * never persisted. So every school student silently fell through to the 'free'
 * distribution server-side (4 questions per priority subject instead of 5) while
 * the client showed them the premium flow.
 *
 * Fix: school membership is entitlement enough on its own - the school already
 * paid. `isPremium` remains the signal for a SELF-PAYING individual only.
 *
 * Deliberately NOT fixed by flipping users.isPremium for org_students: that flag
 * means "this account paid for premium" and is read in ~15 server and ~10 client
 * sites. The v2 license rework (FOLLOWUP.md, Phase 6) has to retire it
 * as an entitlement flag entirely, so widening its meaning now would deepen the
 * conflation it has to untangle - and flipping it would only fix students created
 * AFTER the change, leaving every existing one needing a data backfill.
 */
export function resolveQuizTier(
  isSchoolUser: boolean,
  isPremiumUser: boolean | null | undefined,
): QuizTier {
  if (isSchoolUser) return 'school';
  return isPremiumUser ? 'premium' : 'free';
}

/**
 * Which rows a partial save should write, and which incoming ids are not part of
 * this quiz at all.
 *
 * ROWS ARE RESOLVED THROUGH THE QUIZ'S OWN RESPONSES, never through an id in the
 * request: the caller passes the rows it already loaded for one quiz, and the
 * update is issued against the primary key found in that set. A questionId from
 * another student's quiz cannot match, so a cross-quiz write is impossible by
 * construction rather than by a check that a later edit could drop.
 *
 * UNCHANGED ANSWERS ARE SKIPPED. The client sends the FULL answer set on every
 * debounce — a deliberate choice, because a dropped request then self-heals on
 * the next keystroke instead of leaving a permanent hole — so without this a
 * student answering their twelfth question would issue twelve UPDATEs to store
 * one new answer.
 *
 * Pure, and exported for that reason: there is no express harness in this repo,
 * so the testable seam has to be a function that takes its rows as an argument.
 */
export function selectPartialAnswerUpdates(
  existingResponses: Array<{ id: string; questionId: string; answer: string | null }>,
  incoming: Array<{ questionId: string; answer: string }>,
): { updates: Array<{ id: string; answer: string }>; invalidIds: string[] } {
  const rowByQuestionId = new Map(existingResponses.map((r) => [r.questionId, r]));
  const updates: Array<{ id: string; answer: string }> = [];
  const invalidIds: string[] = [];

  for (const { questionId, answer } of incoming) {
    const row = rowByQuestionId.get(questionId);
    if (!row) {
      invalidIds.push(questionId);
      continue;
    }
    if ((row.answer ?? "") === answer) continue;
    updates.push({ id: row.id, answer });
  }

  return { updates, invalidIds };
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
      const tier: QuizTier = resolveQuizTier(isSchoolUser, user?.isPremium);

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
  
  /**
   * PARTIAL, PRE-SUBMIT SAVE of the answers a student has entered so far.
   *
   * WHY THIS EXISTS. quiz_responses rows are created at generation time with
   * answer: "" and, until this route, the ONLY writer of that column was the
   * submit handler below. In-progress answers lived exclusively in QuizStep's
   * `responses` useState, and step 4 is a conditional render — so the Back
   * button added in 43ec3e6 unmounted the component and destroyed them. A
   * student who answered eight questions, stepped back to check a subject and
   * returned got the same eight questions with every radio cleared. A reload
   * did the same, and had always done the same.
   *
   * IT WRITES `answer` AND NOTHING ELSE. isCorrect and score stay at their
   * generation-time defaults (null / 0), and completedAt is never set here.
   * Scoring is the submit handler's alone; a partial row is an answer nobody
   * has marked yet, which is exactly what it should be until the student says
   * they are done.
   *
   * IT DOES NOT WEAKEN THE SUBMIT GATE. "All questions must be answered"
   * (:455-458 below) compares the ids in the REQUEST BODY against the quiz's
   * rows and never reads the stored answer, so rows written here can neither
   * satisfy that gate nor bypass it. Submit still rescores everything from the
   * payload it is given; these rows are never authoritative at submit time.
   *
   * completedAt IS REFUSED, the same 400 submit returns. The client debounces,
   * so a save can still be in flight when the student presses Submit; without
   * this guard that straggler would rewrite the answers of an already-scored
   * quiz behind its own scores.
   *
   * GUESTS TOO. The quiz is reachable with a guest_token cookie (see generate
   * and submit), so the ownership pair here is theirs as well — a guest's
   * in-progress answers are no less worth keeping than a member's.
   */
  app.patch("/api/assessments/:assessmentId/quiz/responses", async (req: any, res) => {
    try {
      const { assessmentId } = req.params;
      const { responses: userResponses } = req.body;
      const guestToken = req.body.guestToken || req.cookies?.guest_token;

      if (!Array.isArray(userResponses)) {
        return res.status(400).json({ message: "Responses must be an array" });
      }

      // An EMPTY array is accepted as a no-op, where submit 400s on it. This is
      // a full-set sync, and the full set of a quiz nobody has answered yet is
      // legitimately empty. The client never sends it; nothing is gained by
      // making that an error if it ever does.
      for (const response of userResponses) {
        if (typeof response?.questionId !== "string" || response.questionId.trim() === "") {
          return res.status(400).json({ message: "Each response must have a questionId" });
        }
        if (typeof response.answer !== "string") {
          return res.status(400).json({ message: "Each response must have a string answer" });
        }
      }

      const answeredIds = userResponses.map((r: any) => r.questionId);
      if (new Set(answeredIds).size !== answeredIds.length) {
        return res.status(400).json({ message: "Duplicate question IDs in save" });
      }

      const assessment = await storage.getAssessmentById(assessmentId);
      if (!assessment) {
        return res.status(404).json({ message: "Assessment not found" });
      }

      const userId = req.isAuthenticated() ? (req.user.userId) : null;
      const isOwner = req.isAuthenticated() && assessment.userId === userId;
      const isGuestOwner = assessment.isGuest && guestToken && assessment.guestSessionId === guestToken;

      if (!isOwner && !isGuestOwner) {
        return res.status(403).json({ message: "Unauthorized to save answers for this assessment" });
      }

      const quiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (!quiz) {
        return res.status(404).json({ message: "Quiz not found" });
      }

      if (quiz.completedAt) {
        return res.status(400).json({ code: "QUIZ_ALREADY_SUBMITTED", message: "This quiz has already been submitted." });
      }

      const existingResponses = await storage.getQuizResponsesByQuizId(quiz.id);
      const { updates, invalidIds } = selectPartialAnswerUpdates(existingResponses, userResponses);

      if (invalidIds.length > 0) {
        return res.status(400).json({ message: `Invalid question IDs: ${invalidIds.join(', ')}` });
      }

      for (const update of updates) {
        await storage.updateQuizResponse(update.id, { answer: update.answer });
      }

      res.json({ quizId: quiz.id, saved: updates.length });
    } catch (error) {
      console.error("Error saving quiz answers:", error);
      res.status(500).json({ message: "Failed to save quiz answers" });
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
