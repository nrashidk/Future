/**
 * Fisher-Yates shuffle algorithm for randomizing array order
 * Returns a new shuffled array without mutating the original
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Shuffles an array of quiz questions randomly
 */
export function shuffleQuestions(questions: any[]): any[] {
  return shuffleArray(questions);
}

/**
 * FNV-1a, 32-bit. Turns the seed string into the integer the PRNG starts from.
 * Not a security primitive and not used as one — see seededPermutation.
 */
function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, well-distributed PRNG over a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates driven by a seeded PRNG: the same seed always yields the same
 * permutation, and different seeds yield unrelated ones.
 *
 * THE POINT IS REPRODUCIBILITY, NOT RANDOMNESS. Option order has to survive a
 * page reload, and nothing persists it — so it has to be recomputable from
 * values that are already stable. Math.random() cannot do that; that is the
 * whole reason the previous shuffle only existed on the generate response.
 */
export function seededPermutation<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(hashSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Transforms quiz questions from database format to frontend format.
 * Merges optionsAr into the options array as a `textAr` field so the frontend
 * can switch display language without index-drift between parallel arrays.
 * Hides correctAnswer for multiple-choice questions.
 *
 * THIS FUNCTION OWNS OPTION PRESENTATION ORDER, and it is the only thing that
 * does. It shuffles the options deterministically from `presentationSeed` plus
 * the question id, so /quiz/generate and both re-read paths
 * (buildExistingQuizPayload, GET /quiz) hand the student the SAME order for the
 * same quiz, without anything being stored.
 *
 * WHY IT LIVES HERE RATHER THAN AT THE CALLERS. Option order used to be shuffled
 * by a separate shuffleOptions() applied only in the generate handler. Because
 * nothing persisted it, every later read served raw DATABASE order — and 239 of
 * the 240 questions in the bank list the correct answer first, so a reload
 * handed the student an answer key: option 0 was correct on essentially every
 * question. A tester clicking position 0 scored a constant 8/12 while believing
 * they were answering at random (docs/quiz-constant-score-recon.md).
 *
 * A shuffle applied at a call site is one a future call site can omit, and
 * omitting it silently restores that bug. Here, `presentationSeed` is REQUIRED,
 * so a caller that does not supply one does not compile.
 *
 * THIS IS OBFUSCATION, NOT A SECURITY BOUNDARY. The permutation is derivable by
 * anyone who knows their own quiz id and reads this file. It closes the
 * accidental exploit and the generate/re-read divergence; it does not make the
 * answer key secret. That requires removing the index-0 bias from the bank
 * itself, which is a separate change.
 *
 * @param presentationSeed Stable per-quiz value — pass `quiz.id`. The question
 *   id is mixed in here, so callers cannot forget the per-question component.
 */
export function transformQuizQuestionForFrontend(question: any, presentationSeed: string): any {
  // Check if options are already in {id, text} format to avoid double-wrapping
  const isAlreadyTransformed =
    Array.isArray(question.options) &&
    question.options.length > 0 &&
    typeof question.options[0] === "object" &&
    "text" in question.options[0];

  const enOptions: string[] = isAlreadyTransformed
    ? question.options.map((o: any) => o.text)
    : question.options ?? [];

  const arOptions: string[] = Array.isArray(question.optionsAr)
    ? question.optionsAr.map((o: any) => (typeof o === "string" ? o : o.text))
    : [];

  // Pair each English option with its translation BEFORE permuting, so the two
  // travel together. This is what makes the parallel-array desync that the old
  // shuffleOptions() had to hand-manage unrepresentable here.
  const paired = enOptions.map((text: string, idx: number) => ({
    text,
    ...(arOptions[idx] !== undefined ? { textAr: arOptions[idx] } : {}),
  }));

  const ordered = seededPermutation(paired, `${presentationSeed}:${question.id}`);

  // Unified option objects: { id, text (EN), textAr? (AR) }
  //
  // IDS ARE ASSIGNED AFTER THE PERMUTATION, BY DISPLAY POSITION — never carried
  // over from the database index. Carrying the original index would leak the
  // answer key through the id even with the visible order shuffled, since the
  // bank puts the correct answer at index 0 almost every time. The client treats
  // the id as an opaque radio value and looks the text up by it
  // (QuizStep.tsx:293), so it does not need to mean anything.
  const transformedOptions = ordered.map((opt, idx: number) => ({
    id: idx.toString(),
    ...opt,
  }));

  return {
    ...question,
    options: transformedOptions,
    // Remove the parallel optionsAr array — it is now merged into options[].textAr
    optionsAr: undefined,
    questionAr: question.questionAr ?? null,
    // Hide correct answers for multiple choice questions
    correctAnswer: question.questionType === "rating" ? question.correctAnswer : undefined,
  };
}
