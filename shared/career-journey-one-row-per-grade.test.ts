/**
 * Regression tests for the Career Journey's one-assessment-per-grade assumption.
 *
 * getStudentCareerEvolution returned one entry per ASSESSMENT while every reader
 * treated an entry as a GRADE. That held only while a student could take the
 * assessment once per grade; free retakes (261b85f, capped at
 * FREE_ASSESSMENT_CAP) made three Grade 12 assessments reachable, and then:
 *
 *   - persistenceScore divided by the entry count, so a career picked in all
 *     three same-grade retakes scored 100% "consistency across grades";
 *   - the response field named totalGrades reported 3 for one grade;
 *   - the timeline's `find` showed whichever entry came first — the OLDEST,
 *     since the progression query orders completedAt ASC — while the profile's
 *     history marks the newest as the current report;
 *   - the insights panel, gated on `gradeDetails.length > 1`, narrated interests
 *     evolving across grades for a student who had one.
 *
 * The fix collapses to the latest assessment per canonical grade, server-side.
 */
import { describe, it, expect } from 'vitest';
import { collapseToLatestPerGrade } from './grade';

/** Assessment rows as the progression query returns them, trimmed to what the collapse reads. */
const g10 = { id: 'a-10', grade: 'grade10', completedAt: '2024-06-01T00:00:00Z', isCompleted: true };
const g11 = { id: 'a-11', grade: 'grade11', completedAt: '2025-06-01T00:00:00Z', isCompleted: true };
const g12 = { id: 'a-12', grade: 'grade12', completedAt: '2026-01-15T00:00:00Z', isCompleted: true };
const g12Retake = { id: 'a-12-b', grade: 'grade12', completedAt: '2026-03-01T00:00:00Z', isCompleted: true };
const g12Third = { id: 'a-12-c', grade: 'grade12', completedAt: '2026-05-01T00:00:00Z', isCompleted: true };

const ids = (rows: ReadonlyArray<{ id: string }>) =>
  collapseToLatestPerGrade(rows).map(r => r.record.id);
const grades = (rows: ReadonlyArray<{ id: string }>) =>
  collapseToLatestPerGrade(rows).map(r => r.grade);

describe('three assessments at one grade are one grade', () => {
  const threeAtGrade12 = [g12, g12Retake, g12Third];

  it('collapses same-grade retakes to a single entry', () => {
    // THE BUG: three entries, all labelled grade12, read downstream as three grades.
    expect(collapseToLatestPerGrade(threeAtGrade12)).toHaveLength(1);
    expect(grades(threeAtGrade12)).toEqual(['grade12']);
  });

  it('keeps the most recently completed one', () => {
    // Consistent with what the profile's history marks as the current report and
    // with what a per-grade link resolves to (pickLatestForGrade). The old
    // timeline showed the oldest, so the two pages disagreed.
    expect(ids(threeAtGrade12)).toEqual(['a-12-c']);
    expect(ids([g12Third, g12, g12Retake])).toEqual(['a-12-c']);
  });

  it('makes the distinct-grade count the entry count', () => {
    // totalGrades and the persistence divisor both read this length.
    const collapsed = collapseToLatestPerGrade([g10, g11, ...threeAtGrade12]);
    expect(collapsed).toHaveLength(3);
    expect(new Set(collapsed.map(c => c.grade)).size).toBe(3);
  });

  it('leaves a genuine multi-grade trajectory alone', () => {
    expect(ids([g10, g11, g12])).toEqual(['a-10', 'a-11', 'a-12']);
  });
});

describe('persistence is measured against grades, not assessments', () => {
  /** What progress.routes.ts computes for one career, post-collapse. */
  const persistence = (
    rows: ReadonlyArray<{ id: string; grade: string }>,
    appearsIn: (id: string) => boolean,
  ) => {
    const collapsed = collapseToLatestPerGrade(rows);
    const distinctGrades = new Set(collapsed.map(c => c.grade)).size;
    const appearances = collapsed.filter(c => appearsIn(c.record.id)).length;
    return distinctGrades > 0 ? appearances / distinctGrades : 0;
  };

  it('does not score a career 100% consistent off one grade', () => {
    // THE BUG: picked in all three Grade 12 retakes, this career scored 3/3 and
    // rendered as a 75%+ badge under a heading claiming consistency across
    // grades. Post-collapse it is one grade out of one — still 100%, but of a
    // single grade, which the panel only renders once there is more than one.
    const rows = [g12, g12Retake, g12Third];
    expect(persistence(rows, id => id === 'a-12-c')).toBe(1);
    expect(collapseToLatestPerGrade(rows)).toHaveLength(1);
  });

  it('scores a career that survived one of three grades at one third', () => {
    const rows = [g10, g11, g12, g12Retake];
    expect(persistence(rows, id => id === 'a-10')).toBeCloseTo(1 / 3);
    expect(persistence(rows, () => true)).toBe(1);
  });

  it('never divides by zero', () => {
    expect(persistence([], () => true)).toBe(0);
  });
});

describe('bucketing follows the same rules as the rest of the grade module', () => {
  it('folds a legacy bare number into its canonical grade', () => {
    // The school students whose rows the old admin select wrote as '10' are
    // exactly the ones a raw-string bucket would split into two grades.
    const legacy = { id: 'a-legacy', grade: '10', completedAt: '2024-01-01T00:00:00Z', isCompleted: true };
    expect(collapseToLatestPerGrade([legacy, g10])).toHaveLength(1);
    expect(ids([legacy, g10])).toEqual(['a-10']); // g10 completed later
  });

  it('keeps an unrecognized grade under its own label rather than guessing', () => {
    const odd = { id: 'a-odd', grade: 'Year 13', completedAt: '2026-01-01T00:00:00Z', isCompleted: true };
    expect(grades([g10, odd])).toEqual(['grade10', 'Year 13']);
  });

  it('puts every ungraded row in one bucket, not one each', () => {
    const noGrade1 = { id: 'a-x', grade: null, completedAt: '2024-01-01T00:00:00Z', isCompleted: true };
    const noGrade2 = { id: 'a-y', grade: '  ', completedAt: '2025-01-01T00:00:00Z', isCompleted: true };
    expect(grades([noGrade1, noGrade2])).toEqual(['Unknown']);
    expect(ids([noGrade1, noGrade2])).toEqual(['a-y']);
  });

  it('orders by grade, never lexically', () => {
    // 'grade10' < 'grade9' as strings; the timeline reads this order for
    // gradesAppeared.
    const g9 = { id: 'a-9', grade: 'grade9', completedAt: '2023-06-01T00:00:00Z', isCompleted: true };
    const graduated = { id: 'a-grad', grade: 'graduated', completedAt: '2027-06-01T00:00:00Z', isCompleted: true };
    expect(grades([graduated, g10, g9, g12])).toEqual(['grade9', 'grade10', 'grade12', 'graduated']);
  });

  it('ignores an in-progress row, which has no report behind it', () => {
    const draft = { id: 'a-draft', grade: 'grade12', completedAt: null, isCompleted: false };
    expect(ids([g12, draft])).toEqual(['a-12']);
    expect(collapseToLatestPerGrade([draft])).toHaveLength(0);
  });

  it('prefers a timestamped record over a completed one with no timestamp', () => {
    const undated = { id: 'a-undated', grade: 'grade12', completedAt: null, isCompleted: true };
    expect(ids([undated, g12])).toEqual(['a-12']);
    expect(ids([undated])).toEqual(['a-undated']);
  });
});
