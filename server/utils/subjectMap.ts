/**
 * Pure subject-vocabulary data + synchronous normalizers.
 *
 * STORAGE-FREE BY DESIGN. This module must NOT import `../storage` or `../db`.
 * `server/services/matching.ts` imports it, and `server/db.ts` throws at module
 * load when DATABASE_URL is unset — so a storage import here would give the
 * scoring core a runtime dependency on a live database connection and break the
 * DB-free service tests (see server/services/visionScore.test.ts).
 *
 * `server/utils/subjects.ts` re-exports everything below and layers the
 * database-backed async alias resolution on top.
 */

// Default canonical subjects that exist in quiz_questions database.
// This is also the student-facing vocabulary: client/src/components/assessment/
// SubjectsStep.tsx offers exactly these six tiles ("the umbrella-6").
export const DEFAULT_CANONICAL_SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Arabic',
  'Social Studies',
  'Computer Science'
] as const;

// Fallback mapping from common subject names to canonical quiz subjects
// This is used when database subjects are not available
export const DEFAULT_SUBJECT_MAP: Record<string, string> = {
  // Science variants
  'Physics': 'Science',
  'Chemistry': 'Science',
  'Biology': 'Science',
  'Physical Science': 'Science',
  'Life Science': 'Science',
  'Health Science': 'Science',
  'Environmental Science': 'Science',
  'Engineering': 'Science',
  
  // Social Studies variants
  'Economics': 'Social Studies',
  'History': 'Social Studies',
  'Geography': 'Social Studies',
  'Civics': 'Social Studies',
  'Government': 'Social Studies',
  'Sociology': 'Social Studies',
  'Psychology': 'Social Studies',
  
  // Computer Science variants
  'Programming': 'Computer Science',
  'Coding': 'Computer Science',
  'IT': 'Computer Science',
  'Technology': 'Computer Science',
  
  // Mathematics variants
  'Math': 'Mathematics',
  'Maths': 'Mathematics',
  'Calculus': 'Mathematics',
  'Algebra': 'Mathematics',
  'Geometry': 'Mathematics',
  'Statistics': 'Mathematics',
  
  // English variants
  'English Language': 'English',
  'Literature': 'English',
  'Writing': 'English',
  'Communication': 'English',
  
  // Arabic variants
  'Arabic Language': 'Arabic',
  
  // Art variants
  'Art': 'Art',
  'Art & Design': 'Art',
  'Visual Arts': 'Art',
  
  // Music variants
  'Music': 'Music',
  'Performing Arts': 'Music',
  
  // Business variants
  'Business': 'Business',
  'Business Studies': 'Business'
};

/**
 * Synchronous normalize - uses static fallback only
 * For backward compatibility with existing code
 */
export function normalizeSubject(subject: string): string {
  return DEFAULT_SUBJECT_MAP[subject] || subject;
}

/**
 * Synchronous normalize - uses static fallback only
 * For backward compatibility with existing code
 */
export function normalizeSubjects(subjects: string[]): string[] {
  const normalized = subjects.map(normalizeSubject);
  return Array.from(new Set(normalized)); // Remove duplicates
}

/**
 * Project a career's `relatedSubjects` tags onto the STUDENT's vocabulary.
 *
 * Career tags are curriculum-flavoured ("Physics", "Health Science") while a
 * student's favoriteSubjects are normalized to the umbrella-6 before storage,
 * so the two can only meet on the umbrella-6.
 *
 * Steps: normalize each tag -> dedupe -> keep only umbrella-6 members.
 *
 * Tags with no umbrella-6 home (Art, Design, Business, Music, Physical
 * Education, Education, ...) are DROPPED, not kept: a student can never select
 * them, so retaining them would only inflate the denominator and penalise the
 * career. `Art`/`Music`/`Business` self-map in DEFAULT_SUBJECT_MAP for the
 * getAllowedSubjectSet() whitelist, but are unreachable by the picker.
 *
 * Note this is deliberately the SYNC normalizer: the ComponentCalculator
 * contract in matching.ts is synchronous, so DB-configured curriculum aliases
 * do not apply to career tags. That is a documented limitation, not an
 * oversight.
 */
export function normalizeCareerSubjects(relatedSubjects: string[] | null | undefined): string[] {
  if (!relatedSubjects || relatedSubjects.length === 0) return [];
  const canonical = new Set<string>(DEFAULT_CANONICAL_SUBJECTS);
  return Array.from(
    new Set(relatedSubjects.map(normalizeSubject))
  ).filter(s => canonical.has(s));
}
