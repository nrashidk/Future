/**
 * Subject normalization utilities
 * Maps user-selected subjects to canonical quiz database subjects
 * 
 * This module provides both a static fallback mapping and dynamic 
 * database-driven alias resolution for curriculum-specific subjects.
 */

import { storage } from "../storage";
import {
  DEFAULT_CANONICAL_SUBJECTS,
  DEFAULT_SUBJECT_MAP,
  normalizeSubject,
  normalizeSubjects,
  normalizeCareerSubjects,
} from "./subjectMap";

// The pure subject vocabulary and the synchronous normalizers live in
// ./subjectMap.ts, which imports neither storage nor db so that DB-free
// consumers (server/services/matching.ts) can use them. Re-exported here so
// every existing importer of ./subjects keeps working unchanged.
export {
  DEFAULT_CANONICAL_SUBJECTS,
  DEFAULT_SUBJECT_MAP,
  normalizeSubject,
  normalizeSubjects,
  normalizeCareerSubjects,
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
 * Get canonical subjects list
 */
export function getCanonicalSubjects(): readonly string[] {
  return DEFAULT_CANONICAL_SUBJECTS;
}

/**
 * Build the set of subject values considered VALID at the write boundary,
 * used to whitelist favoriteSubjects before it reaches the LLM prompt.
 *
 * Derived from the SAME sources normalizeSubjects() uses, so the whitelist can
 * never drift out of sync with the normalizer and false-reject a legitimate
 * pick:
 *   - DEFAULT_CANONICAL_SUBJECTS   (the 6 canonical quiz subjects)
 *   - Object.values(DEFAULT_SUBJECT_MAP)  (normalized outputs, incl. the
 *     self-mapped Art / Music / Business)
 *   - the cached DB alias map keys + values (subject names, codes, aliases and
 *     their canonical targets) — so DB-only curriculum subjects that the static
 *     map does not rewrite still pass.
 *
 * All entries are lowercased; callers compare `value.toLowerCase()`. The check
 * is meant to run AFTER normalizeSubjects(): a raw UI value like "Physics"
 * normalizes to "Science" (present here), while an injection/garbage string
 * passes through normalization unchanged and is absent → rejected.
 *
 * On a DB error getSubjectAliasMap() returns {}, leaving the static union,
 * which still covers every one of the 12 fixed picker tiles.
 */
export async function getAllowedSubjectSet(
  countryId?: string | null,
  curriculum?: string | null
): Promise<Set<string>> {
  const allowed = new Set<string>();

  for (const s of DEFAULT_CANONICAL_SUBJECTS) allowed.add(s.toLowerCase());
  for (const v of Object.values(DEFAULT_SUBJECT_MAP)) allowed.add(v.toLowerCase());

  // Reuses the cached alias map (keys are already lowercased names/codes/aliases)
  const aliasMap = await getSubjectAliasMap(countryId, curriculum);
  for (const key of Object.keys(aliasMap)) allowed.add(key);
  for (const val of Object.values(aliasMap)) allowed.add(val.toLowerCase());

  return allowed;
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
