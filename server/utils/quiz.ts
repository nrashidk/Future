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
