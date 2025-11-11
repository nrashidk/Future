/**
 * Subject normalization utilities
 * Maps user-selected subjects to canonical quiz database subjects
 */

// Canonical subjects that exist in quiz_questions database
const CANONICAL_SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Arabic',
  'Social Studies',
  'Computer Science'
] as const;

// Mapping from common subject names to canonical quiz subjects
const SUBJECT_MAP: Record<string, string> = {
  // Science variants
  'Physics': 'Science',
  'Chemistry': 'Science',
  'Biology': 'Science',
  'Physical Science': 'Science',
  'Life Science': 'Science',
  
  // Social Studies variants
  'Economics': 'Social Studies',
  'History': 'Social Studies',
  'Geography': 'Social Studies',
  'Civics': 'Social Studies',
  'Government': 'Social Studies',
  'Sociology': 'Social Studies',
  
  // Computer Science variants
  'Programming': 'Computer Science',
  'Coding': 'Computer Science',
  'IT': 'Computer Science',
  'Technology': 'Computer Science',
  
  // Mathematics variants (already canonical, but adding common aliases)
  'Math': 'Mathematics',
  'Maths': 'Mathematics',
  'Calculus': 'Mathematics',
  'Algebra': 'Mathematics',
  'Geometry': 'Mathematics',
  
  // English variants
  'English Language': 'English',
  'Literature': 'English',
  'Writing': 'English',
  
  // Arabic variants
  'Arabic Language': 'Arabic'
};

/**
 * Normalize a single subject to its canonical form
 */
export function normalizeSubject(subject: string): string {
  return SUBJECT_MAP[subject] || subject;
}

/**
 * Normalize an array of subjects, removing duplicates after normalization
 */
export function normalizeSubjects(subjects: string[]): string[] {
  const normalized = subjects.map(normalizeSubject);
  return Array.from(new Set(normalized)); // Remove duplicates
}

/**
 * Get canonical subjects list
 */
export function getCanonicalSubjects(): readonly string[] {
  return CANONICAL_SUBJECTS;
}
