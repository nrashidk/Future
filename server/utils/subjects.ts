/**
 * Subject normalization utilities
 * Maps user-selected subjects to canonical quiz database subjects
 * 
 * This module provides both a static fallback mapping and dynamic 
 * database-driven alias resolution for curriculum-specific subjects.
 */

import { storage } from "../storage";

// Default canonical subjects that exist in quiz_questions database
const DEFAULT_CANONICAL_SUBJECTS = [
  'Mathematics',
  'Science',
  'English',
  'Arabic',
  'Social Studies',
  'Computer Science'
] as const;

// Fallback mapping from common subject names to canonical quiz subjects
// This is used when database subjects are not available
const DEFAULT_SUBJECT_MAP: Record<string, string> = {
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
  
  // Mathematics variants
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

// Cache for subject alias mappings
let subjectAliasCache: Record<string, string> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Build subject alias map from database
 * Creates a mapping from alias names to canonical subject names
 * Note: We map to subject.name (e.g., "Mathematics") which is what quiz questions use
 */
async function buildSubjectAliasMap(countryId?: string | null, curriculum?: string | null): Promise<Record<string, string>> {
  try {
    // Get subjects from database
    let subjects;
    if (countryId && curriculum) {
      subjects = await storage.getSubjectsByCurriculum(countryId, curriculum);
    } else if (countryId) {
      subjects = await storage.getSubjectsByCountry(countryId);
    } else {
      subjects = await storage.getAllSubjects();
    }
    
    const aliasMap: Record<string, string> = {};
    
    for (const subject of subjects) {
      // Canonical identifier is subject.name (e.g., "Mathematics")
      // This matches what's stored in quiz questions
      const canonicalName = subject.name;
      
      // Map the subject's own name to canonical (case-insensitive)
      aliasMap[subject.name.toLowerCase()] = canonicalName;
      // Map the code to canonical
      aliasMap[subject.code.toLowerCase()] = canonicalName;
      
      // Map each alias to the canonical subject name
      if (subject.aliases && Array.isArray(subject.aliases)) {
        for (const alias of subject.aliases) {
          aliasMap[alias.toLowerCase()] = canonicalName;
        }
      }
    }
    
    return aliasMap;
  } catch (error) {
    console.warn("Failed to build subject alias map from database, using fallback:", error);
    return {};
  }
}

/**
 * Get cached or fresh subject alias map
 */
async function getSubjectAliasMap(countryId?: string | null, curriculum?: string | null): Promise<Record<string, string>> {
  const now = Date.now();
  
  // Return cached if still valid (only for non-specific lookups)
  if (!countryId && !curriculum && subjectAliasCache && (now - cacheTimestamp) < CACHE_TTL) {
    return subjectAliasCache;
  }
  
  const aliasMap = await buildSubjectAliasMap(countryId, curriculum);
  
  // Only cache non-specific lookups
  if (!countryId && !curriculum) {
    subjectAliasCache = aliasMap;
    cacheTimestamp = now;
  }
  
  return aliasMap;
}

/**
 * Normalize a single subject to its canonical form using database aliases
 * Falls back to static mapping if database lookup fails
 */
export async function normalizeSubjectAsync(
  subject: string, 
  countryId?: string | null, 
  curriculum?: string | null
): Promise<string> {
  const aliasMap = await getSubjectAliasMap(countryId, curriculum);
  
  // Try database aliases first (case-insensitive)
  const lowerSubject = subject.toLowerCase();
  if (aliasMap[lowerSubject]) {
    return aliasMap[lowerSubject];
  }
  
  // Fall back to static mapping
  if (DEFAULT_SUBJECT_MAP[subject]) {
    return DEFAULT_SUBJECT_MAP[subject];
  }
  
  // Return original if no mapping found
  return subject;
}

/**
 * Synchronous normalize - uses static fallback only
 * For backward compatibility with existing code
 */
export function normalizeSubject(subject: string): string {
  return DEFAULT_SUBJECT_MAP[subject] || subject;
}

/**
 * Normalize an array of subjects using database aliases
 */
export async function normalizeSubjectsAsync(
  subjects: string[],
  countryId?: string | null,
  curriculum?: string | null
): Promise<string[]> {
  const normalizedPromises = subjects.map(s => normalizeSubjectAsync(s, countryId, curriculum));
  const normalized = await Promise.all(normalizedPromises);
  return Array.from(new Set(normalized)); // Remove duplicates
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
 * Get canonical subjects list
 */
export function getCanonicalSubjects(): readonly string[] {
  return DEFAULT_CANONICAL_SUBJECTS;
}

/**
 * Get available subjects for a curriculum from database
 */
export async function getAvailableSubjects(countryId: string, curriculum: string): Promise<string[]> {
  try {
    const subjects = await storage.getSubjectsByCurriculum(countryId, curriculum);
    return subjects.map(s => s.name);
  } catch (error) {
    console.warn("Failed to get subjects from database, using fallback:", error);
    return [...DEFAULT_CANONICAL_SUBJECTS];
  }
}

/**
 * Clear subject alias cache (useful after subject updates)
 */
export function clearSubjectCache(): void {
  subjectAliasCache = null;
  cacheTimestamp = 0;
}

/**
 * Calculate the academic year for a given date
 * Academic year runs from September to June:
 * - Sep 2025 to Jun 2026 = "2025-2026"
 * - Sep 2026 to Jun 2027 = "2026-2027"
 * 
 * For dates in Jul-Aug, we assign to the upcoming academic year
 * (as these are typically summer preparation months)
 */
export function calculateAcademicYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0-11 (0 = January, 8 = September)
  const year = date.getFullYear();
  
  // September (8) through December (11) -> current year to next year
  // January (0) through June (5) -> previous year to current year
  // July (6) through August (7) -> treat as upcoming academic year
  
  if (month >= 8) {
    // September to December: academic year starts this calendar year
    return `${year}-${year + 1}`;
  } else if (month <= 5) {
    // January to June: academic year started previous calendar year
    return `${year - 1}-${year}`;
  } else {
    // July and August: assign to upcoming academic year (prep months)
    return `${year}-${year + 1}`;
  }
}

/**
 * Get the current academic year
 */
export function getCurrentAcademicYear(): string {
  return calculateAcademicYear(new Date());
}
