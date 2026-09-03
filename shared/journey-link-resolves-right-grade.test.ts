/**
 * Regression tests for Bug #12: the Career Journey's per-grade "View Results"
 * links all opened the SAME report.
 *
 * The timeline renders one link per grade — /results?grade=grade10,
 * ?grade=grade11 and so on — but Results.tsx read only `assessmentId`. With no
 * id, /api/recommendations answers with the student's LATEST assessment, so
 * every link showed the newest report no matter which grade was clicked.
 *
 * The fix resolves ?grade= against the caller's own assessments with
 * pickLatestForGrade. See docs/v2-phase2-recon.md R4/C10.
 */
import { describe, it, expect } from 'vitest';
import { pickLatestForGrade, toCanonicalGrade } from './grade';

/** What /api/assessments/my returns, trimmed to the fields the resolver reads. */
const grade10 = { id: 'a-10', grade: 'grade10', completedAt: '2024-06-01T00:00:00Z', isCompleted: true };
const grade11 = { id: 'a-11', grade: 'grade11', completedAt: '2025-06-01T00:00:00Z', isCompleted: true };
const grade12 = { id: 'a-12', grade: 'grade12', completedAt: '2026-06-01T00:00:00Z', isCompleted: true };
const myAssessments = [grade10, grade11, grade12];

/** Exactly what Results.tsx does with the query string. */
function resolveFromLink(href: string, records: typeof myAssessments) {
  const grade = toCanonicalGrade(new URLSearchParams(href.split('?')[1] ?? '').get('grade'));
  return pickLatestForGrade(records, grade)?.id ?? null;
}

describe('Journey per-grade link resolves that grade', () => {
  it('opens the requested grade, not the latest assessment', () => {
    // THE BUG: before the fix all three of these resolved to a-12.
    expect(resolveFromLink('/results?grade=grade10', myAssessments)).toBe('a-10');
    expect(resolveFromLink('/results?grade=grade11', myAssessments)).toBe('a-11');
    expect(resolveFromLink('/results?grade=grade12', myAssessments)).toBe('a-12');
  });

  it('gives each grade a distinct report', () => {
    const ids = ['grade10', 'grade11', 'grade12'].map(g => resolveFromLink(`/results?grade=${g}`, myAssessments));
    expect(new Set(ids).size).toBe(3);
  });

  it('resolves a link against a legacy row still stored as a bare number', () => {
    // The school students whose rows the old admin select corrupted are exactly
    // the ones a raw string match would have missed — which is why this fix had
    // to wait on canonicalization.
    const legacy = [{ id: 'a-legacy', grade: '10', completedAt: '2024-06-01T00:00:00Z', isCompleted: true }];
    expect(resolveFromLink('/results?grade=grade10', legacy)).toBe('a-legacy');
  });

  it('resolves a link that carries a bare number against a canonical row', () => {
    expect(resolveFromLink('/results?grade=10', myAssessments)).toBe('a-10');
  });

  it('picks the most recent when a student assessed the same grade twice', () => {
    const retake = { id: 'a-10-retake', grade: 'grade10', completedAt: '2024-11-01T00:00:00Z', isCompleted: true };
    expect(pickLatestForGrade([grade10, retake], 'grade10')?.id).toBe('a-10-retake');
    expect(pickLatestForGrade([retake, grade10], 'grade10')?.id).toBe('a-10-retake');
  });

  it('never returns an in-progress assessment', () => {
    // A draft has no report to show; the caller falls back rather than
    // rendering an empty one.
    const draft = { id: 'a-10-draft', grade: 'grade10', completedAt: null, isCompleted: false };
    expect(pickLatestForGrade([draft], 'grade10')).toBeNull();
    expect(pickLatestForGrade([grade10, draft], 'grade10')?.id).toBe('a-10');
  });

  it('prefers a timestamped record over a completed one with no timestamp', () => {
    const undated = { id: 'a-10-undated', grade: 'grade10', completedAt: null, isCompleted: true };
    expect(pickLatestForGrade([undated, grade10], 'grade10')?.id).toBe('a-10');
    expect(pickLatestForGrade([undated], 'grade10')?.id).toBe('a-10-undated');
  });

  it('returns null for a grade the student has not assessed, never another grade', () => {
    // The caller then falls through to the unscoped query. Silently answering
    // with a different grade's report is the bug being fixed.
    expect(pickLatestForGrade(myAssessments, 'grade8')).toBeNull();
    expect(pickLatestForGrade(myAssessments, 'graduated')).toBeNull();
    expect(pickLatestForGrade([], 'grade10')).toBeNull();
  });

  it('ignores a missing or unusable grade param', () => {
    expect(resolveFromLink('/results', myAssessments)).toBeNull();
    expect(resolveFromLink('/results?assessmentId=a-11', myAssessments)).toBeNull();
    expect(resolveFromLink('/results?grade=', myAssessments)).toBeNull();
    expect(resolveFromLink('/results?grade=NaN', myAssessments)).toBeNull();
    expect(resolveFromLink('/results?grade=7', myAssessments)).toBeNull();
  });

  it('resolves only within the records it is handed', () => {
    // Those come from /api/assessments/my, which scopes to req.user.userId
    // server-side. The resolver takes no user id and cannot widen that scope.
    const someoneElse = [{ id: 'other-10', grade: 'grade10', completedAt: '2024-06-01T00:00:00Z', isCompleted: true }];
    expect(pickLatestForGrade(myAssessments, 'grade10')?.id).toBe('a-10');
    expect(pickLatestForGrade([], 'grade10')).toBeNull();
    expect(pickLatestForGrade(someoneElse, 'grade10')?.id).toBe('other-10');
  });
});
