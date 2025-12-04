export type GradeLevel = "8" | "9" | "10" | "11" | "12";
export type GradeBand = "8-9" | "10-12";
export const ALL_GRADES: GradeLevel[] = ["8", "9", "10", "11", "12"];
export const ALL_GRADE_BANDS: GradeBand[] = ["8-9", "10-12"];

// Map grade bands to individual grades for migration
export const GRADE_BAND_TO_GRADES: Record<GradeBand, GradeLevel[]> = {
  "8-9": ["8", "9"],
  "10-12": ["10", "11", "12"]
};

// New structure: Individual grades (preferred for new questions)
export interface QuizQuestionSeed {
  question: string;
  questionType: "multiple_choice";
  options: string[];
  correctAnswer: string;
  explanation?: string;
  
  // Subject-based metadata
  subject: string; // Mathematics, Science, English, Arabic, Social Studies, Computer Science
  grade?: GradeLevel; // New: Individual grade (8, 9, 10, 11, 12)
  gradeBand?: GradeBand; // Legacy: Grade band (8-9, 10-12) - kept for backward compatibility
  countryId: string;
  topic: string; // Specific curriculum topic
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "knowledge" | "comprehension" | "application" | "analysis";
}

// Legacy structure: Grade bands (for existing question banks)
export interface LegacySubjectQuestionBank {
  subject: string;
  grades: {
    "8-9": QuizQuestionSeed[];
    "10-12": QuizQuestionSeed[];
  };
}

export interface LegacyCountryQuestionBank {
  countryId: string;
  countryName: string;
  subjects: LegacySubjectQuestionBank[];
}

// New structure: Individual grades (for future question banks)
export interface SubjectQuestionBank {
  subject: string;
  grades: {
    "8": QuizQuestionSeed[];
    "9": QuizQuestionSeed[];
    "10": QuizQuestionSeed[];
    "11": QuizQuestionSeed[];
    "12": QuizQuestionSeed[];
  };
}

export interface CountryQuestionBank {
  countryId: string;
  countryName: string;
  subjects: SubjectQuestionBank[];
}

// Helper to convert legacy question bank to database-ready questions
export function flattenLegacyQuestionBank(bank: LegacyCountryQuestionBank): QuizQuestionSeed[] {
  const questions: QuizQuestionSeed[] = [];
  
  bank.subjects.forEach(subject => {
    // Process 8-9 grade band
    (subject.grades["8-9"] || []).forEach(q => {
      questions.push({ ...q, gradeBand: "8-9" });
    });
    
    // Process 10-12 grade band
    (subject.grades["10-12"] || []).forEach(q => {
      questions.push({ ...q, gradeBand: "10-12" });
    });
  });
  
  return questions;
}

// Helper to validate legacy question banks
export function validateLegacyQuestionBank(bank: LegacyCountryQuestionBank): { valid: boolean; errors: string[] } {
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

// Helper to check coverage for legacy question banks
export function checkLegacyCoverage(bank: LegacyCountryQuestionBank): {
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
    let totalCount = 0;
    ALL_GRADES.forEach(grade => {
      totalCount += subject.grades[grade]?.length || 0;
    });
    
    if (totalCount === 0) {
      errors.push(`Subject "${subject.subject}" has no questions`);
    }
    
    // Validate each question
    ALL_GRADES.forEach(grade => {
      (subject.grades[grade] || []).forEach((q, idx) => {
        if (!q.question || !q.correctAnswer || !q.options || q.options.length < 2) {
          errors.push(`Question ${idx + 1} in ${subject.subject} Grade ${grade} is invalid`);
        }
        
        if (!q.options.includes(q.correctAnswer)) {
          errors.push(`Correct answer not in options for question: "${q.question.substring(0, 50)}..."`);
        }
      });
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
  bySubject: Record<string, Record<GradeLevel, number> & { total: number }>;
  warnings: string[];
} {
  const bySubject: Record<string, Record<GradeLevel, number> & { total: number }> = {};
  const warnings: string[] = [];
  let totalQuestions = 0;
  
  bank.subjects.forEach((subject) => {
    const gradeCounts: Record<GradeLevel, number> = { "8": 0, "9": 0, "10": 0, "11": 0, "12": 0 };
    let subjectTotal = 0;
    
    ALL_GRADES.forEach(grade => {
      const count = subject.grades[grade]?.length || 0;
      gradeCounts[grade] = count;
      subjectTotal += count;
    });
    
    bySubject[subject.subject] = {
      ...gradeCounts,
      total: subjectTotal
    };
    
    totalQuestions += subjectTotal;
    
    // Warn if coverage is low for any grade
    ALL_GRADES.forEach(grade => {
      if (gradeCounts[grade] < 4) {
        warnings.push(`Low coverage for ${subject.subject} Grade ${grade}: ${gradeCounts[grade]} questions`);
      }
    });
  });
  
  return { totalQuestions, bySubject, warnings };
}
