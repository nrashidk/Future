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

/**
 * Upper-tail chi-square critical values at p = 0.001, indexed by degrees of
 * freedom. df = (number of option positions) - 1, so index 3 covers the
 * four-option questions the banks actually use.
 */
const CHI2_CRITICAL_P001: Record<number, number> = {
  1: 10.828, 2: 13.816, 3: 16.266, 4: 18.467, 5: 20.515,
  6: 22.458, 7: 24.322, 8: 26.124, 9: 27.877,
};

/** Expected count per position must reach this before the test means anything. */
const MIN_EXPECTED_PER_POSITION = 5;

export interface CorrectAnswerSkew {
  optionCount: number;
  questions: number;
  /** Count of questions whose correct answer sits at each index. */
  positions: number[];
  chiSquare: number;
  critical: number;
  /** True once the distribution is too uneven to be chance at p < 0.001. */
  skewed: boolean;
  /** False when the sample is too small to test; `skewed` is then always false. */
  tested: boolean;
}

/**
 * Measures how evenly the correct answer is distributed across option positions.
 *
 * WHY A STATISTICAL TEST AND NOT A PERCENTAGE CAP. A rule like "no position may
 * hold more than 40%" false-positives constantly on small samples: with 20
 * questions over 4 positions the expected count is 5 and ordinary variance
 * reaches 9 or 10 without anything being wrong. Chi-square against uniform
 * scales with the sample instead of ignoring it.
 *
 * THE THRESHOLD IS DELIBERATELY LOOSE. p < 0.001 (df=3 -> 16.266) false-fails
 * one honest bank in a thousand, while the real defect is nowhere near the line:
 * the UAE bank as authored is [239, 1, 0, 0] against an expectation of 60 each,
 * which is chi-square ~712 — about 44x the critical value. A correctly permuted
 * bank of the same size averages ~3. There is no need to tighten it.
 *
 * Questions are grouped by option count so that banks mixing 3- and 4-option
 * questions are each tested against their own uniform expectation rather than a
 * blended one that fits neither.
 */
export function measureCorrectAnswerSkew(questions: QuizQuestionSeed[]): CorrectAnswerSkew[] {
  const byOptionCount = new Map<number, QuizQuestionSeed[]>();
  for (const q of questions) {
    if (!Array.isArray(q.options) || q.options.length < 2) continue;
    if (!q.options.includes(q.correctAnswer)) continue; // a separate error already
    const group = byOptionCount.get(q.options.length);
    if (group) group.push(q);
    else byOptionCount.set(q.options.length, [q]);
  }

  const results: CorrectAnswerSkew[] = [];
  for (const [optionCount, group] of Array.from(byOptionCount.entries()).sort((a, b) => a[0] - b[0])) {
    const positions = new Array(optionCount).fill(0);
    for (const q of group) positions[q.options.indexOf(q.correctAnswer)]++;

    const expected = group.length / optionCount;
    const tested = expected >= MIN_EXPECTED_PER_POSITION;
    const chiSquare = positions.reduce((acc, observed) => {
      const diff = observed - expected;
      return acc + (diff * diff) / expected;
    }, 0);
    const critical = CHI2_CRITICAL_P001[optionCount - 1] ?? Infinity;

    results.push({
      optionCount,
      questions: group.length,
      positions,
      chiSquare: Math.round(chiSquare * 100) / 100,
      critical,
      skewed: tested && chiSquare > critical,
      tested,
    });
  }
  return results;
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
  
  /**
   * AUTHORED SKEW IS A WARNING, NOT AN ERROR — deliberately.
   *
   * Stored option order is randomised on the way into the database
   * (storage.createQuizQuestion -> permuteOptionsForStorage), so the order in a
   * source file is not what students ever see and cannot leak an answer key by
   * itself. Failing the bank for it would reject the UAE bank as it stands today
   * over a property that no longer has any effect.
   *
   * It is still worth saying out loud: a bank that is 239/240 correct-answer-first
   * tells you the author was not varying position, and it means every safeguard
   * between the file and the screen is load-bearing. The assertion that actually
   * protects students is on the STORED distribution, which is where the test
   * lives.
   */
  for (const skew of measureCorrectAnswerSkew(flattenQuestionBank(bank))) {
    if (!skew.skewed) continue;
    warnings.push(
      `Bank "${bank.countryName}": the correct answer is unevenly placed across ` +
      `${skew.optionCount}-option questions (positions ${skew.positions.join('/')} ` +
      `of ${skew.questions}, chi-square ${skew.chiSquare} > ${skew.critical}). ` +
      `Harmless on its own — stored order is randomised at insert — but vary the ` +
      `position when authoring so the file is not itself an answer key.`
    );
  }

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
