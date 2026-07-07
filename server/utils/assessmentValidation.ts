import { normalizeSubjects, getAllowedSubjectSet } from "./subjects";

// Write-boundary bounds for the two student free-text fields that reach the
// LLM narrative prompt ({{favoriteSubjects}} and {{dreamGuidance}}). These cap
// the injection surface; the fixed 12-tile picker never produces values near
// these limits, so a violation means a bug or direct-API abuse.
export const MAX_FAVORITE_SUBJECTS = 12;   // picker has 12 tiles; normalization only shrinks
export const MAX_SUBJECT_LENGTH = 64;      // generous for any real subject name
export const MAX_ASPIRATION_ENTRIES = 10;  // UI splits a textarea on \n (existing max: 1)
export const MAX_ASPIRATION_LENGTH = 300;  // free-text dream; existing max element len: 61

// Truncate an offending value for a safe, bounded error message / log line.
function previewValue(v: unknown): string {
  const s = String(v);
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

/**
 * Validate the two student-controlled free-text fields that flow into the LLM
 * prompt. Shared by POST (create) and PATCH (update) so enforcement is
 * identical on both paths — PATCH runs no zod, so this is the ONLY guard there.
 *
 * Partial-update safe: each field is validated only when present, so a PATCH
 * that does not touch subjects/aspirations is never rejected for them.
 *
 * - favoriteSubjects: reject (400) any element that is not a recognized subject
 *   AFTER normalization (normalizeSubjects maps Physics→Science etc.), plus
 *   count and per-element length caps. Whitelist source: getAllowedSubjectSet().
 * - careerAspirations: genuinely free-text, so length + entry-count caps only
 *   (DOMPurify sanitize already applied upstream).
 *
 * Returns an error string (=> 400) or null when valid.
 */
export async function validatePromptInputFields(body: any): Promise<string | null> {
  if (body.favoriteSubjects !== undefined && body.favoriteSubjects !== null) {
    const raw = body.favoriteSubjects;
    if (!Array.isArray(raw)) {
      return "favoriteSubjects must be an array of subject names.";
    }
    if (raw.length > MAX_FAVORITE_SUBJECTS) {
      return `Too many favorite subjects (max ${MAX_FAVORITE_SUBJECTS}).`;
    }
    for (const s of raw) {
      if (typeof s !== "string") {
        return "favoriteSubjects must contain only subject names.";
      }
      if (s.length > MAX_SUBJECT_LENGTH) {
        return `Subject name too long (max ${MAX_SUBJECT_LENGTH} characters): "${previewValue(s)}".`;
      }
    }

    // Whitelist check runs on the NORMALIZED values (Physics→Science, Art→Art),
    // matching how the value is stored and how getAllowedSubjectSet is derived.
    const normalized = normalizeSubjects(raw);
    const allowed = await getAllowedSubjectSet();
    for (const s of normalized) {
      if (!allowed.has(s.toLowerCase())) {
        return `Unrecognized subject: "${previewValue(s)}". Please choose from the available subjects.`;
      }
    }
  }

  if (body.careerAspirations !== undefined && body.careerAspirations !== null) {
    const arr = body.careerAspirations;
    if (!Array.isArray(arr)) {
      return "careerAspirations must be an array.";
    }
    if (arr.length > MAX_ASPIRATION_ENTRIES) {
      return `Too many career aspiration entries (max ${MAX_ASPIRATION_ENTRIES}).`;
    }
    for (const a of arr) {
      if (typeof a !== "string") {
        return "careerAspirations must contain only text.";
      }
      if (a.length > MAX_ASPIRATION_LENGTH) {
        return `Career aspiration entry too long (max ${MAX_ASPIRATION_LENGTH} characters).`;
      }
    }
  }

  return null;
}
