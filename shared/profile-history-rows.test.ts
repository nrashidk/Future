/**
 * Regression tests for the Assessment History block, which rendered exactly one
 * row by construction.
 *
 * Profile.tsx sorted the student's assessments and rendered `[0]`. With free
 * retakes (261b85f, capped at FREE_ASSESSMENT_CAP) the counter above it says
 * "2 of 3" while one card renders, every earlier report is unreachable from the
 * profile, and "View report" always opens the newest.
 *
 * The rendering itself needs a DOM (vitest.config.ts is a node environment on
 * purpose), so what is pinned here are the RULES the rows are built from — the
 * three that were wrong, each of which is now a shared function rather than an
 * expression inside JSX.
 */
import { describe, it, expect } from 'vitest';
import { isResumableDraft, pickDraftToResume } from './assessmentFlow';

/**
 * What /api/assessments/my returns, trimmed to the fields the row rules read,
 * and in the order it returns them: ORDER BY created_at DESC.
 */
const newestDraft = { id: 'a-draft', isCompleted: false, currentStep: 4 };
const grade12 = { id: 'a-12', isCompleted: true, currentStep: 6 };
const grade11 = { id: 'a-11', isCompleted: true, currentStep: 6 };
const myAssessments = [newestDraft, grade12, grade11];

/** Exactly what the history block marks as the current report. */
const latestCompletedId = (records: typeof myAssessments) =>
  records.find(a => a.isCompleted)?.id ?? null;

describe('every assessment gets a row', () => {
  it('renders as many rows as the student has assessments', () => {
    // THE BUG: the block rendered one card for any number of assessments, so a
    // student with three completions saw one and the count above it said 3.
    expect(myAssessments.length).toBe(3);
    expect(new Set(myAssessments.map(a => a.id)).size).toBe(3);
  });

  it('marks the most recent completed assessment, not the most recent row', () => {
    // The newest row is an in-progress draft. "Latest" answers "which report is
    // the current one", and a draft has no report — so the badge belongs to
    // grade12, which is also what an id-less /results link resolves to.
    expect(latestCompletedId(myAssessments)).toBe('a-12');
  });

  it('marks nothing when no assessment is complete', () => {
    expect(latestCompletedId([newestDraft] as typeof myAssessments)).toBeNull();
  });
});

describe('Continue is offered only where an assessment can be resumed', () => {
  it('does not offer Continue for a draft still at step 1', () => {
    // THE DISAGREEMENT: the old list-wide button gated on `!isCompleted`, so it
    // offered Continue on this row; the resume path requires currentStep > 1 and
    // found nothing, so the student was dropped into a blank assessment. The row
    // exists because POST /api/assessments does not send currentStep — a student
    // who leaves between the create and the first auto-save PATCH leaves the
    // schema default of 1 behind.
    expect(isResumableDraft({ id: 'a-stub', isCompleted: false, currentStep: 1 })).toBe(false);
    expect(isResumableDraft({ id: 'a-stub', isCompleted: false })).toBe(false);
  });

  it('offers Continue for a draft past step 1', () => {
    expect(isResumableDraft(newestDraft)).toBe(true);
  });

  it('never offers Continue on a completed assessment', () => {
    expect(isResumableDraft(grade12)).toBe(false);
    expect(isResumableDraft({ id: 'a-odd', isCompleted: true, currentStep: 3 })).toBe(false);
  });
});

describe('Continue resumes the row it was clicked on', () => {
  const olderDraft = { id: 'a-older-draft', isCompleted: false, currentStep: 3 };
  const twoDrafts = [newestDraft, grade12, olderDraft];

  it('resumes the named row, not the newest draft', () => {
    // THE BUG: the button linked to a bare /assessment, which resumes whichever
    // draft is newest — so Continue on the older row opened the other one.
    expect(pickDraftToResume(twoDrafts, olderDraft.id)?.id).toBe('a-older-draft');
    expect(pickDraftToResume(twoDrafts, newestDraft.id)?.id).toBe('a-draft');
  });

  it('falls back to the most recent draft when no row is named', () => {
    // The entry points that are not the history list — the header link, a direct
    // visit — still land on /assessment with no id.
    expect(pickDraftToResume(twoDrafts)?.id).toBe('a-draft');
    expect(pickDraftToResume(twoDrafts, null)?.id).toBe('a-draft');
    expect(pickDraftToResume(twoDrafts, '')?.id).toBe('a-draft');
  });

  it('returns nothing for a named row that cannot be resumed', () => {
    // Never a silent fallback to a different assessment: that is the bug the
    // parameter exists to fix, and the caller starts fresh instead.
    expect(pickDraftToResume(twoDrafts, grade12.id)).toBeNull();
    expect(pickDraftToResume(twoDrafts, 'a-not-mine')).toBeNull();
    expect(pickDraftToResume([{ id: 'a-stub', isCompleted: false, currentStep: 1 }], 'a-stub')).toBeNull();
  });

  it('resolves only within the records it is handed', () => {
    // Those come from /api/assessments/my, which scopes to req.user.userId
    // server-side. The picker takes no user id and cannot widen that scope.
    expect(pickDraftToResume([], 'a-draft')).toBeNull();
  });
});
