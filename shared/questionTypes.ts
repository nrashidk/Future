export interface QuizQuestionSeed {
  question: string;
  questionType: "multiple_choice";
  options: string[];
  correctAnswer: string;
  explanation?: string;
  
  // Subject-based metadata
  subject: string; // Mathematics, Science, English, Arabic, Social Studies, Computer Science
  gradeBand: "8-9" | "10-12";
  countryId: string;
  topic: string; // Specific curriculum topic
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "knowledge" | "comprehension" | "application" | "analysis";
}

export interface SubjectQuestionBank {
  subject: string;
  grades: {
    "8-9": QuizQuestionSeed[];
    "10-12": QuizQuestionSeed[];
  };
}

export interface CountryQuestionBank {
  countryId: string;
  countryName: string;
  subjects: SubjectQuestionBank[];
}

// Validation helper
export function validateQuestionBank(bank: CountryQuestionBank): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!bank.countryId || !bank.countryName) {
    errors.push("Country ID and name are required");
  }
  
  if (!bank.subjects || bank.subjects.length === 0) {
    errors.push("At least one subject is required");
  }
  
  bank.subjects.forEach((subject) => {
    const grade89Count = subject.grades["8-9"]?.length || 0;
    const grade1012Count = subject.grades["10-12"]?.length || 0;
    
    if (grade89Count === 0 && grade1012Count === 0) {
      errors.push(`Subject "${subject.subject}" has no questions`);
    }
    
    // Validate each question
    [...(subject.grades["8-9"] || []), ...(subject.grades["10-12"] || [])].forEach((q, idx) => {
      if (!q.question || !q.correctAnswer || !q.options || q.options.length < 2) {
        errors.push(`Question ${idx + 1} in ${subject.subject} is invalid`);
      }
      
      if (!q.options.includes(q.correctAnswer)) {
        errors.push(`Correct answer not in options for question: "${q.question.substring(0, 50)}..."`);
      }
    });
  });
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Coverage check helper
export function checkCoverage(bank: CountryQuestionBank): {
  totalQuestions: number;
  bySubject: Record<string, { "8-9": number; "10-12": number; total: number }>;
  warnings: string[];
} {
  const bySubject: Record<string, { "8-9": number; "10-12": number; total: number }> = {};
  const warnings: string[] = [];
  let totalQuestions = 0;
  
  bank.subjects.forEach((subject) => {
    const grade89Count = subject.grades["8-9"]?.length || 0;
    const grade1012Count = subject.grades["10-12"]?.length || 0;
    const total = grade89Count + grade1012Count;
    
    bySubject[subject.subject] = {
      "8-9": grade89Count,
      "10-12": grade1012Count,
      total
    };
    
    totalQuestions += total;
    
    // Warn if coverage is low
    if (grade89Count < 5) {
      warnings.push(`Low coverage for ${subject.subject} Grade 8-9: ${grade89Count} questions`);
    }
    if (grade1012Count < 5) {
      warnings.push(`Low coverage for ${subject.subject} Grade 10-12: ${grade1012Count} questions`);
    }
  });
  
  return { totalQuestions, bySubject, warnings };
}
