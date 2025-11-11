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
 * Shuffles the answer options for a single question while preserving correctAnswer linkage
 * Returns a new question object with shuffled options and updated correctAnswer reference
 */
export function shuffleOptions(question: any): any {
  if (!Array.isArray(question.options) || question.options.length === 0) {
    return question;
  }

  // Create a mapping of original option text to new shuffled index
  const shuffledOptions = shuffleArray(question.options);
  
  // Find the new position of the correct answer
  let newCorrectAnswer = question.correctAnswer;
  if (question.questionType === "multiple_choice" && question.correctAnswer) {
    const correctAnswerText = question.correctAnswer;
    const newIndex = shuffledOptions.findIndex((opt) => opt === correctAnswerText);
    // Keep correctAnswer as the actual text value (not index)
    newCorrectAnswer = newIndex >= 0 ? shuffledOptions[newIndex] : correctAnswerText;
  }

  return {
    ...question,
    options: shuffledOptions,
    correctAnswer: newCorrectAnswer
  };
}

/**
 * Transforms quiz questions from database format to frontend format
 * Converts options from string[] to {id, text}[] and handles sensitive data
 */
export function transformQuizQuestionForFrontend(question: any): any {
  // Check if options are already in {id, text} format to avoid double-wrapping
  const isAlreadyTransformed = 
    Array.isArray(question.options) && 
    question.options.length > 0 &&
    typeof question.options[0] === 'object' &&
    'text' in question.options[0];

  // Transform options from string array to object array with id and text
  const transformedOptions = isAlreadyTransformed
    ? question.options // Already transformed
    : Array.isArray(question.options)
    ? question.options.map((text: string, idx: number) => ({
        id: idx.toString(),
        text
      }))
    : question.options; // Invalid format, return as-is

  return {
    ...question,
    options: transformedOptions,
    // Hide correct answers for multiple choice questions
    correctAnswer: question.questionType === "rating" ? question.correctAnswer : undefined
  };
}
