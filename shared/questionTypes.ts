export type GradeLevel = "8" | "9" | "10" | "11" | "12";
export const ALL_GRADES: GradeLevel[] = ["8", "9", "10", "11", "12"];

export interface QuizQuestionSeed {
  question: string;
  questionType: "multiple_choice";
  options: string[];
  correctAnswer: string;
  explanation?: string;
  
  subject: string;
  grade: GradeLevel;
  countryId: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  cognitiveLevel: "knowledge" | "comprehension" | "application" | "analysis";
}

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

export function flattenQuestionBank(bank: CountryQuestionBank): QuizQuestionSeed[] {
  const questions: QuizQuestionSeed[] = [];
  
  bank.subjects.forEach(subject => {
    ALL_GRADES.forEach(grade => {
      (subject.grades[grade] || []).forEach(q => {
        questions.push({ ...q, grade });
      });
    });
  });
  
  return questions;
}

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
    
    ALL_GRADES.forEach(grade => {
      if (gradeCounts[grade] < 4) {
        warnings.push(`Low coverage for ${subject.subject} Grade ${grade}: ${gradeCounts[grade]} questions`);
      }
    });
  });
  
  return { totalQuestions, bySubject, warnings };
}
