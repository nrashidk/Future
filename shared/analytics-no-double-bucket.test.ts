/**
 * Regression tests for the analytics "Grade 10 twice" bug.
 *
 * Symptom: the grade-distribution chart rendered TWO bars both labelled
 * "Grade 10". Cause: the query grouped on the raw text column, where school
 * students were stored as '10' and everyone else as 'grade10'; the client then
 * stripped the 'grade' prefix off the label, so the two groups printed the same
 * word. The bug was never in the label.
 *
 * These exercise mergeGradeCounts, which server/storage.ts getAnalyticsOverview
 * applies to the grouped rows. See docs/v2-phase2-recon.md R1/R2.
 */
import { describe, it, expect } from 'vitest';
import { mergeGradeCounts } from './grade';

describe('analytics grade distribution: no double bucket', () => {
  it('merges the two spellings of one grade into a single bucket', () => {
    const rows = [
      { grade: 'grade10', count: 5 },   // self-pay + guest students
      { grade: '10', count: 3 },        // school students, via the old admin select
      { grade: 'grade9', count: 4 },
    ];

    expect(mergeGradeCounts(rows)).toEqual([
      { grade: 'grade9', count: 4 },
      { grade: 'grade10', count: 8 },
    ]);
  });

  it('emits one bucket per grade even from a fully mixed table', () => {
    const rows = [
      { grade: 'grade8', count: 1 },
      { grade: '8', count: 1 },
      { grade: 'Grade 8', count: 1 },
      { grade: '8th', count: 1 },
    ];

    const merged = mergeGradeCounts(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({ grade: 'grade8', count: 4 });
  });

  it('makes the top-grade metric pick the true winner, not a split half', () => {
    // THE ACTUAL REGRESSION. Grade 10 really has 8 students and grade 9 has 7,
    // but split across two buckets grade 10 shows as 5 and 3 — so the
    // max-by-count metric reported grade 9 as the top grade.
    const rows = [
      { grade: 'grade10', count: 5 },
      { grade: '10', count: 3 },
      { grade: 'grade9', count: 7 },
    ];

    const topOfRaw = rows.reduce((a, b) => (b.count > a.count ? b : a));
    expect(topOfRaw.grade).toBe('grade9');            // the bug

    const topOfMerged = mergeGradeCounts(rows).reduce((a, b) => (b.count > a.count ? b : a));
    expect(topOfMerged).toEqual({ grade: 'grade10', count: 8 });
  });

  it('returns buckets in grade order, not lexical or count order', () => {
    const rows = [
      { grade: 'graduated', count: 1 },
      { grade: '12', count: 2 },
      { grade: 'grade8', count: 99 },
      { grade: 'grade11', count: 3 },
      { grade: '9', count: 4 },
      { grade: 'grade10', count: 5 },
    ];

    expect(mergeGradeCounts(rows).map(r => r.grade)).toEqual([
      'grade8', 'grade9', 'grade10', 'grade11', 'grade12', 'graduated',
    ]);
  });

  it('conserves the total headcount', () => {
    const rows = [
      { grade: 'grade10', count: 5 },
      { grade: '10', count: 3 },
      { grade: 'graduated', count: 2 },
      { grade: 'grade8', count: 1 },
    ];
    const total = rows.reduce((n, r) => n + r.count, 0);
    expect(mergeGradeCounts(rows).reduce((n, r) => n + r.count, 0)).toBe(total);
  });

  it('keeps an unrecognized value in its own bucket rather than folding it into a real grade', () => {
    // Mirrors the migration's `ELSE raw`: a weird value stays visible in the
    // chart instead of silently inflating a grade it may not belong to.
    const merged = mergeGradeCounts([
      { grade: 'grade10', count: 5 },
      { grade: 'Year 13', count: 2 },
    ]);

    expect(merged).toContainEqual({ grade: 'grade10', count: 5 });
    expect(merged).toContainEqual({ grade: 'Year 13', count: 2 });
    expect(merged.find(r => r.grade === 'grade10')!.count).toBe(5);
  });

  it("does not fold 'NaN' into any grade", () => {
    const merged = mergeGradeCounts([
      { grade: 'grade10', count: 5 },
      { grade: 'NaN', count: 2 },
    ]);
    expect(merged.find(r => r.grade === 'grade10')!.count).toBe(5);
    expect(merged.find(r => r.grade === 'NaN')!.count).toBe(2);
  });

  it('drops rows carrying no grade at all', () => {
    expect(mergeGradeCounts([
      { grade: null, count: 7 },
      { grade: undefined, count: 7 },
      { grade: '   ', count: 7 },
      { grade: 'grade10', count: 1 },
    ])).toEqual([{ grade: 'grade10', count: 1 }]);
  });

  it('is a no-op on an already-canonical distribution', () => {
    // Post-migration state: merging must not disturb correct data.
    const rows = [
      { grade: 'grade8', count: 1 },
      { grade: 'grade9', count: 2 },
      { grade: 'grade10', count: 3 },
      { grade: 'graduated', count: 4 },
    ];
    expect(mergeGradeCounts(rows)).toEqual(rows);
  });

  it('handles an empty distribution', () => {
    expect(mergeGradeCounts([])).toEqual([]);
  });
});
