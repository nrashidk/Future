import { normalizeSubjects, getAllowedSubjectSet } from "./subjects";

// Write-boundary bounds for the student-controlled subject fields and the two
// free-text fields that reach the LLM narrative prompt ({{favoriteSubjects}} and
// {{dreamGuidance}}). These cap the injection surface; the fixed 6-tile picker
// never produces values outside these limits, so a violation means a bug or a
// direct-API call.
//
// THESE BOUNDS LIVE AT THE WRITE BOUNDARY AND NOWHERE ELSE. Nothing that READS
// an assessment may enforce them. A rule added today must not retroactively
// invalidate a report a student already has: assessment 1721bae9 (2026-07-07)
// holds EIGHT subjects, which was legal when it was written — MAX_FAVORITE_
// SUBJECTS was 12 then, sized to a 12-tile picker, and only became 5 on
// 2026-08-27 when the umbrella-6 picker landed (0c01c23). That row is not
// evidence of a missing bound; it is evidence of an older one. It still renders,
// still scores, and must keep doing both. Existing rows are grandfathered by
// construction rather than by an exemption someone has to remember to write.
//
// WHAT THE SUBJECT COUNT ACTUALLY CONTROLS, since a wrong version of this has
// been copied around: the quiz is NOT a fixed budget split across the chosen
// subjects. calculateQuizDistribution (server/routes/quiz.routes.ts) is
// per-subject and additive — each subject independently draws
// base + (priority ? bonus : 0), capped — so the total GROWS with each subject
// added. The real totals, by tier and subject count:
//
//              3 subj   4 subj   5 subj        (priority subjects: min(n, 3))
//     free        12       14       16         priority 4 each, others 2 each
//     premium     15       18       21         priority 5 each, others 3 each
//     school      15       18       21         (identical config to premium)
//
// So 18 is not "the total" — it is one of six cells, and a free student at 5
// subjects sits at 16. The cap exists to bound the quiz LENGTH and the prompt
// injection surface, not to protect an arithmetic identity that never held.
export const MIN_FAVORITE_SUBJECTS = 3;    // matches SubjectsStep's MIN_SUBJECTS; create-path only, see below
export const MAX_FAVORITE_SUBJECTS = 5;    // Rule B cap: 6 umbrella tiles, pick at most 5
export const MAX_PRIORITY_SUBJECTS = 3;    // matches SubjectsStep's MAX_PRIORITY_SUBJECTS
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
 * - prioritySubjects: count cap, and a subset check against favoriteSubjects
 *   when both are present in the SAME payload. A priority naming a subject the
 *   student did not choose is inert in calculateQuizDistribution — it iterates
 *   favoriteSubjects and asks whether each is a priority, so an orphan priority
 *   silently does nothing. Rejecting it is how a client bug surfaces as a 400
 *   instead of as a quiz that is quietly shorter than intended.
 * - careerAspirations: genuinely free-text, so length + entry-count caps only
 *   (DOMPurify sanitize already applied upstream).
 *
 * THE MINIMUM IS CREATE-ONLY, and this is the one asymmetry here. `opts.isCreate`
 * turns on MIN_FAVORITE_SUBJECTS. A create always carries the student's finished
 * selection — the POST fires when they leave the Subjects step — so a 1-subject
 * create is never legitimate. A PATCH is different: Assessment.tsx auto-saves
 * the WHOLE array every two seconds while the student is still editing, so a
 * student swapping one subject for another passes through a 2-element state that
 * is entirely valid and would 400 on a symmetric rule. The auto-save swallows
 * errors, so the damage would be silent: progress would simply stop being saved
 * mid-edit.
 *
 * The generation gate (server/utils/assessmentCompleteness.ts) deliberately
 * still requires only a NON-EMPTY list, for the reason recorded in that file:
 * raising a requirement there 400s assessments already in flight.
 *
 * Returns an error string (=> 400) or null when valid.
 */
export async function validatePromptInputFields(
  body: any,
  opts: { isCreate?: boolean } = {},
): Promise<string | null> {
  if (body.favoriteSubjects !== undefined && body.favoriteSubjects !== null) {
    const raw = body.favoriteSubjects;
    if (!Array.isArray(raw)) {
      return "favoriteSubjects must be an array of subject names.";
    }
    if (raw.length > MAX_FAVORITE_SUBJECTS) {
      return `Too many favorite subjects (max ${MAX_FAVORITE_SUBJECTS}).`;
    }
    // Create-path only — see the docblock. A mid-edit PATCH legitimately dips
    // below this and must not be rejected.
    if (opts.isCreate && raw.length < MIN_FAVORITE_SUBJECTS) {
      return `Too few favorite subjects (min ${MIN_FAVORITE_SUBJECTS}).`;
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

  if (body.prioritySubjects !== undefined && body.prioritySubjects !== null) {
    const raw = body.prioritySubjects;
    if (!Array.isArray(raw)) {
      return "prioritySubjects must be an array of subject names.";
    }
    if (raw.length > MAX_PRIORITY_SUBJECTS) {
      return `Too many priority subjects (max ${MAX_PRIORITY_SUBJECTS}).`;
    }
    for (const s of raw) {
      if (typeof s !== "string") {
        return "prioritySubjects must contain only subject names.";
      }
      if (s.length > MAX_SUBJECT_LENGTH) {
        return `Subject name too long (max ${MAX_SUBJECT_LENGTH} characters): "${previewValue(s)}".`;
      }
    }

    // SUBSET CHECK, ONLY WHEN BOTH ARRIVE TOGETHER. A PATCH carrying priorities
    // alone cannot be checked without reading the stored row, and this function
    // is deliberately pure and DB-free apart from the subject whitelist. Both
    // real writers — the auto-save and handleNext in Assessment.tsx — send the
    // two fields in the same payload, so the check covers every live caller.
    //
    // Compared AFTER normalization, on both sides, because that is how the
    // values are stored: an alias on one side and its canonical form on the
    // other name the same subject and must not read as a mismatch.
    if (body.favoriteSubjects !== undefined && body.favoriteSubjects !== null && Array.isArray(body.favoriteSubjects)) {
      const favs = new Set(normalizeSubjects(body.favoriteSubjects.filter((v: unknown) => typeof v === "string")));
      const orphan = normalizeSubjects(raw).find((s) => !favs.has(s));
      if (orphan) {
        return `Priority subject "${previewValue(orphan)}" is not one of the chosen subjects.`;
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
