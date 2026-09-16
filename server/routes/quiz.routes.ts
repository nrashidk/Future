import type { Express } from "express";
import { storage } from "../storage";
import { transformQuizQuestionForFrontend, shuffleQuestions } from "../utils/quiz";
import { normalizeSubjectsAsync } from "../utils/subjects";
import { printTokenAuthorizes } from "../utils/printToken";
import { isUniqueViolation } from "../utils/pgErrors";

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
 * FIXED AT 15 QUESTIONS TOTAL, identical for every tier — TIER_CONFIGS (base +
 * priority bonus, capped per subject) is gone, and so is the per-tier gap it
 * produced. That gap — free 12/14/16, premium and school 15/18/21 across
 * 3/4/5 subjects — was the ONLY reason premium's subject scores measured more
 * reliably than free's (test-retest r 0.40 vs 0.36, SD 2.4 vs 4.7 on a
 * one-subject career): more questions per subject, nothing else. Removing it
 * is deliberate. Premium's value is RIASEC + CVQ + the fuller report now, not
 * a longer quiz — a premium student already answers 30 RIASEC + 15 CVQ items,
 * and the old premium/school total of 21 quiz questions would have put them
 * at 66 items in one sitting.
 *
 * The 15 are split by how many subjects were chosen, priority subjects first:
 *
 *   3 subjects: 5, 5, 5
 *   4 subjects: 4, 4, 4, 3
 *   5 subjects: 3, 3, 3, 3, 3
 *
 * Checked against the live bank, not just the seed source: 240 rows, 6
 * subjects × grades 8-12, "uae"/"MOE National" — the only bucket that exists.
 * The thinnest cell is grade 12 at 6 per subject; the widest ask above is 5.
 * Clears with a question to spare even there.
 *
 * NOT the abandoned 18-question "Rule B" design (FOLLOWUP.md, "QUIZ (Rule
 * B)"), which needed 6/6/6 at 3 subjects and was paused for exactly this
 * reason — grade 12's 6-question cell left it zero room. This ships without
 * the verified-question bank top-up that design was blocked on; a reader of
 * that FOLLOWUP entry should not assume the same blocker applies here.
 *
 * ONLY 3-5 SUBJECTS ARE COVERED, matching MIN/MAX_FAVORITE_SUBJECTS
 * (assessmentValidation.ts). A row from before the umbrella-6 picker
 * (2026-08-27) can hold more — assessmentValidation.ts documents one with
 * eight — but such a row already has a quiz (this route generates once per
 * assessment; see the existingQuiz short-circuit below), so it never reaches
 * this function again. The only way a length outside 3-5 gets here is a
 * pre-cap assessment that was never quizzed and is resumed today; the table
 * lookup below returns nothing for it and the caller's existing MIN_QUESTIONS
 * backfill (unweighted, but functional) is what serves it — not a new gap,
 * the same fallback that already exists for any shortfall.
 */
const QUIZ_DISTRIBUTION_BY_SUBJECT_COUNT: Record<number, readonly number[]> = {
  3: [5, 5, 5],
  4: [4, 4, 4, 3],
  5: [3, 3, 3, 3, 3],
};

export function calculateQuizDistribution(
  favoriteSubjects: string[],
  prioritySubjects: string[],
): Map<string, number> {
  const distribution = new Map<string, number>();
  const counts = QUIZ_DISTRIBUTION_BY_SUBJECT_COUNT[favoriteSubjects.length];
  if (!counts) return distribution;

  // Priority subjects first, in the order the student ranked them; the rest
  // keep the order they were chosen in.
  const ordered = [
    ...favoriteSubjects.filter((s) => prioritySubjects.includes(s)),
    ...favoriteSubjects.filter((s) => !prioritySubjects.includes(s)),
  ];
  ordered.forEach((subject, i) => distribution.set(subject, counts[i]));

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

/**
 * The payload for a quiz that already exists — the ONE builder for it.
 *
 * Two callers return this: the pre-insert duplicate check, and the convergence
 * path when a concurrent generate lost the insert race. "Returns the same
 * payload as the existing-quiz branch" is a promise worth making structural
 * rather than by copy, because the two are reached under different conditions
 * and only one of them is ever exercised in ordinary use.
 *
 * `questions` is derived from the stored response rows, not from a fresh
 * selection: the rows ARE the quiz, one per question chosen when it was
 * generated, and re-selecting would hand the student a different paper.
 */
export async function buildExistingQuizPayload(quiz: { id: string; completedAt: Date | null }, lang: string) {
  const responses = await storage.getQuizResponsesByQuizId(quiz.id);
  const questionIds = responses.map(r => r.questionId);

  const allQuestions = await storage.getAllQuizQuestions();
  const questions = allQuestions
    .filter(q => questionIds.includes(q.id))
    .map(q => applyLanguageToQuestion(transformQuizQuestionForFrontend(q, quiz.id), lang));

  return {
    quizId: quiz.id,
    questions,
    responses: responses.map(r => ({ questionId: r.questionId, answer: r.answer })),
    completed: !!quiz.completedAt,
  };
}

/**
 * Wait for the winner of a generate race to finish writing its response rows.
 *
 * The winner inserts the quiz row, then its N response rows one at a time. A
 * loser that catches 23505 and reads immediately can therefore see the quiz with
 * none or only some of its questions — and would return a short paper that the
 * student cannot submit, because submit requires an answer for every row that
 * exists by then (quiz.routes.ts:604-607, :617-620).
 *
 * `questionsCount` is written at creation and says how many rows to expect, so
 * the wait has a definite target and a definite end. Bounded hard: this runs
 * inside a request, and a caller waiting is only better than a caller failing
 * for as long as the wait is short.
 *
 * If the rows never arrive — the winner died mid-loop — this returns what it
 * has rather than erroring. That is a genuinely broken quiz either way, and it
 * is the SAME state the pre-insert duplicate check has always returned for such
 * a row; failing here would only make the race path stricter than the ordinary
 * path for the same underlying damage. It is logged so it can be seen.
 */
export async function awaitQuizResponses(quizId: string, expected: number): Promise<void> {
  const ATTEMPTS = 10;
  const DELAY_MS = 100;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const responses = await storage.getQuizResponsesByQuizId(quizId);
    if (responses.length >= expected) return;
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  const responses = await storage.getQuizResponsesByQuizId(quizId);
  console.warn(
    `[quiz] quiz ${quizId} still holds ${responses.length}/${expected} response rows after ` +
    `${(ATTEMPTS * DELAY_MS) / 1000}s — returning it as-is; the generate that created it may have died mid-write`
  );
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
      
      // CHECK-THEN-ACT, and it is no longer the only thing standing between a
      // student and two quizzes. This read is the fast path — it answers every
      // ordinary repeat request without attempting an insert — but two
      // concurrent generates can both reach it before either insert commits.
      // What stops them now is assessment_quizzes_assessment_id_unique_idx
      // (migration 019); the loser's insert raises 23505 and converges below.
      const existingQuiz = await storage.getAssessmentQuizByAssessmentId(assessmentId);
      if (existingQuiz) {
        return res.json(await buildExistingQuizPayload(existingQuiz, getRequestLanguage(req)));
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
      // Resolved and logged for diagnostics only now — the distribution below
      // no longer varies by tier, so `tier` feeds nothing downstream of this.
      const tier: QuizTier = resolveQuizTier(isSchoolUser, user?.isPremium);

      const distribution = calculateQuizDistribution(favoriteSubjects, prioritySubjects);
      const targetTotal = getTotalQuestionsFromDistribution(distribution);

      console.log(`Quiz distribution for ${tier} tier (same for all tiers):`, Object.fromEntries(distribution));
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
      
      /**
       * Question ORDER is shuffled here; option order is not, and must not be.
       * transformQuizQuestionForFrontend owns option order and derives it
       * deterministically from the quiz id, so that generate and the two re-read
       * paths agree. Shuffling options here as well would randomise the array
       * this handler passes down, the transform would then permute on top of a
       * different starting order, and generate would diverge from every later
       * read again — the exact bug this replaces.
       */
      const finalShuffledQuestions = shuffleQuestions(selectedQuestions);
      
      /**
       * THE RACE ENDS HERE, BY CONVERGING — not by failing.
       *
       * Migration 019 made assessment_id unique, so of two concurrent generates
       * exactly one insert succeeds and the other raises 23505. Without this
       * branch that error fell into the route's generic catch below and became
       * an opaque 500, which QuizStep renders as "unable to generate" beside a
       * button that SKIPS THE QUIZ ENTIRELY (QuizStep.tsx:404-421) — telling a
       * student their quiz could not be made while a perfectly good one exists
       * for their assessment. That is a worse outcome than the duplicate row the
       * constraint prevents, and it would ship the moment the index does.
       *
       * The right answer to "someone else just created this" is the quiz they
       * created. Both halves of a double-click then get the same paper, which is
       * what the student already believed was happening.
       *
       * IDEMPOTENT, NOT MERELY RECOVERED: this returns the identical payload the
       * pre-insert check above returns, from the same builder, so a caller
       * cannot tell which path served it. The only difference is the wait for
       * the winner's response rows, which the fast path does not need.
       *
       * The questions selected above are DISCARDED on this path. They were a
       * valid paper, but the winner's is the one whose rows are in the table and
       * the one submit will score.
       */
      let quiz;
      try {
        quiz = await storage.createAssessmentQuiz({
          assessmentId,
          questionsCount: finalShuffledQuestions.length,
          totalScore: 0,
          subjectScores: {}
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const winner = await storage.getAssessmentQuizByAssessmentId(assessmentId);
        if (!winner) {
          // The constraint fired, so a row was there when the insert ran. If it
          // is gone now something deleted it in between (deleteAssessmentQuiz,
          // via the subjects-changed invalidation) — genuinely exceptional, and
          // not something to paper over with a second insert attempt.
          throw error;
        }

        console.log(`[quiz] concurrent generate for assessment ${assessmentId}; converging on quiz ${winner.id}`);
        await awaitQuizResponses(winner.id, winner.questionsCount);
        return res.json(await buildExistingQuizPayload(winner, getRequestLanguage(req)));
      }
      
      for (const question of finalShuffledQuestions) {
        await storage.createQuizResponse({
          assessmentQuizId: quiz.id,
          questionId: question.id,
          answer: "",
          isCorrect: null,
          score: 0
        });
      }
      
      const lang = getRequestLanguage(req);
      const questionsForFrontend = finalShuffledQuestions
        .map(q => applyLanguageToQuestion(transformQuizQuestionForFrontend(q, quiz.id), lang));
      
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
        totalQuestions: finalShuffledQuestions.length
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
      //
      // recoveryToken is a SEPARATE, distinctly-named query param — the guest
      // report-recovery email link (mintGuestRecoveryToken) — checked through
      // the same printTokenAuthorizes verifier but never folded into
      // `printToken` itself; see that function's doc comment for why.
      const isTokenAuthorized =
        printTokenAuthorizes(req.query.printToken, assessmentId) ||
        printTokenAuthorizes(req.query.recoveryToken, assessmentId);
      if (!isOwner && !isGuestOwner && !isTokenAuthorized) {
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
        .map(q => applyLanguageToQuestion(transformQuizQuestionForFrontend(q, quiz.id), lang));
      
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
