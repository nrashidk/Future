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
 * Shuffles an array of indices to produce a reusable permutation.
 */
function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * Shuffles an array of quiz questions randomly
 */
export function shuffleQuestions(questions: any[]): any[] {
  return shuffleArray(questions);
}

/**
 * Shuffles the answer options for a single question while preserving correctAnswer linkage.
 * Applies the SAME permutation to optionsAr (Arabic options) so that option IDs remain
 * synchronized between English and Arabic — critical for language-agnostic scoring.
 */
export function shuffleOptions(question: any): any {
  if (!Array.isArray(question.options) || question.options.length === 0) {
    return question;
  }

  // Generate one permutation and apply it to both English and Arabic options
  const permutation = shuffleIndices(question.options.length);
  const shuffledOptions = permutation.map((i) => question.options[i]);

  // Apply the identical permutation to Arabic options (keeps IDs in sync)
  const shuffledOptionsAr =
    Array.isArray(question.optionsAr) && question.optionsAr.length === question.options.length
      ? permutation.map((i) => question.optionsAr[i])
      : question.optionsAr;

  // Update correctAnswer reference to the new (shuffled) position
  let newCorrectAnswer = question.correctAnswer;
  if (question.questionType === "multiple_choice" && question.correctAnswer) {
    const correctAnswerText = question.correctAnswer;
    const newIndex = shuffledOptions.findIndex((opt) => opt === correctAnswerText);
    newCorrectAnswer = newIndex >= 0 ? shuffledOptions[newIndex] : correctAnswerText;
  }

  return {
    ...question,
    options: shuffledOptions,
    optionsAr: shuffledOptionsAr,
    correctAnswer: newCorrectAnswer,
  };
}

/**
 * Transforms quiz questions from database format to frontend format.
 * Merges optionsAr into the options array as a `textAr` field so the frontend
 * can switch display language without index-drift between parallel arrays.
 * Hides correctAnswer for multiple-choice questions.
 */
export function transformQuizQuestionForFrontend(question: any): any {
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

  // Unified option objects: { id, text (EN), textAr? (AR) }
  const transformedOptions = enOptions.map((text: string, idx: number) => ({
    id: idx.toString(),
    text,
    ...(arOptions[idx] !== undefined ? { textAr: arOptions[idx] } : {}),
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
