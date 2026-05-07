export type GradeLevel = "8" | "9" | "10" | "11" | "12";
export const ALL_GRADES: GradeLevel[] = ["8", "9", "10", "11", "12"];

/**
 * Well-known curriculum identifiers.  Add new ones here as additional countries
 * are on-boarded — the type is intentionally extensible via `string & {}` so
 * TypeScript won't reject a new curriculum name, but IDE auto-complete will
 * suggest the known values and flag obvious typos.
 *
 * The canonical value for each country bank is set on `CountryQuestionBank.curriculum`
 * and injected into every question by `flattenQuestionBank`, so individual subject
 * files do NOT need to repeat it — but if they do, the value must match.
 */
export type CurriculumType =
  | "MOE National"    // UAE Ministry of Education National Curriculum
  | "MoE National"    // legacy alias — prefer "MOE National" for new banks
  | "CBSE"            // India — Central Board of Secondary Education
  | "IB"              // International Baccalaureate
  | "Cambridge"       // Cambridge Assessment International Education
  | "SABIS"           // SABIS® International School Network
  | (string & {});    // extensible: any other curriculum name is accepted

/** Canonical curriculum identifiers used for validation warnings. */
export const KNOWN_CURRICULUM_TYPES: readonly string[] = [
  "MOE National",
  "MoE National",
  "CBSE",
  "IB",
  "Cambridge",
  "SABIS",
] as const;

export interface QuizQuestionSeed {
  question: string;
  questionType: "multiple_choice";
  options: string[];
  correctAnswer: string;
  explanation?: string;
  questionAr?: string;   // Arabic translation of the question
  optionsAr?: string[];  // Arabic translations of answer options (same order as options)
  explanationAr?: string; // Arabic translation of explanation

  subject: string;
  grade: GradeLevel;
  countryId: string;
  /** Curriculum this question belongs to.
   *  Optional in subject files — `flattenQuestionBank` always overwrites it with
   *  `CountryQuestionBank.curriculum`, so you only need to set it once on the bank.
   *  If present and it mismatches the bank value, `validateQuestionBank` will warn. */
  curriculum?: CurriculumType;
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
  /** Canonical curriculum identifier for this bank. Injected into every question
   *  by flattenQuestionBank() — set it once here; do not repeat per question. */
  curriculum: CurriculumType;
  subjects: SubjectQuestionBank[];
}

export function flattenQuestionBank(bank: CountryQuestionBank): QuizQuestionSeed[] {
  const questions: QuizQuestionSeed[] = [];
  
  bank.subjects.forEach(subject => {
    ALL_GRADES.forEach(grade => {
      (subject.grades[grade] || []).forEach(q => {
        questions.push({ 
          ...q, 
          grade,
          countryId: bank.countryId,
          curriculum: bank.curriculum,
        });
      });
    });
  });
  
  return questions;
}

export function validateQuestionBank(bank: CountryQuestionBank): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (!bank.countryId || !bank.countryName) {
    errors.push("Country ID and name are required");
  }

  // curriculum is required on the bank — it is injected into every question by flattenQuestionBank
  if (!bank.curriculum || !bank.curriculum.trim()) {
    errors.push(
      `Bank "${bank.countryName}" is missing a curriculum value. ` +
      `Set CountryQuestionBank.curriculum to one of: ${KNOWN_CURRICULUM_TYPES.join(", ")} ` +
      `(or any other curriculum identifier).`
    );
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

        // Warn (non-fatal) if a per-question curriculum is set but mismatches the
        // bank value. flattenQuestionBank will always use the bank value anyway,
        // but the mismatch is a sign the field should be removed or aligned.
        if (q.curriculum && q.curriculum !== bank.curriculum) {
          warnings.push(
            `${subject.subject} Grade ${grade} Q${idx + 1}: per-question curriculum ` +
            `"${q.curriculum}" does not match bank curriculum "${bank.curriculum}". ` +
            `Remove the per-question field or align it with the bank value.`
          );
        }
      });
    });
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
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
