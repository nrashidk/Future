import { describe, it, expect } from 'vitest';
import {
  CANONICAL_GRADES,
  SCHOOL_GRADES,
  gradeSortKey,
  gradeToNumber,
  isCanonicalGrade,
  nextGrade,
  toCanonicalGrade,
} from './grade';

describe('CANONICAL_GRADES', () => {
  it('is the full set, in ascending order, with graduated last', () => {
    expect([...CANONICAL_GRADES]).toEqual([
      'grade8', 'grade9', 'grade10', 'grade11', 'grade12', 'graduated',
    ]);
  });

  it('excludes graduated from the enrolment set', () => {
    // 'graduated' is a state a student reaches, never a grade a school enrols into.
    expect([...SCHOOL_GRADES]).toEqual(['grade8', 'grade9', 'grade10', 'grade11', 'grade12']);
  });

  it('includes grade8, which the Journey timeline used to omit', () => {
    expect(CANONICAL_GRADES).toContain('grade8');
  });
});

describe('toCanonicalGrade', () => {
  it('is idempotent on canonical input', () => {
    // Load-bearing: migration 013 relies on re-application being a no-op, and
    // the write sites call this on values that may already be canonical.
    for (const g of CANONICAL_GRADES) {
      expect(toCanonicalGrade(g)).toBe(g);
      expect(toCanonicalGrade(toCanonicalGrade(g))).toBe(g);
    }
  });

  it('converts the bare-numeric format the admin select used to emit', () => {
    expect(toCanonicalGrade('8')).toBe('grade8');
    expect(toCanonicalGrade('10')).toBe('grade10');
    expect(toCanonicalGrade('12')).toBe('grade12');
  });

  it('accepts a number, because a JSON body can send one', () => {
    expect(toCanonicalGrade(10)).toBe('grade10');
    expect(toCanonicalGrade(8)).toBe('grade8');
    expect(toCanonicalGrade(10.5)).toBeNull();
  });

  it('tolerates spacing, casing and ordinal suffixes', () => {
    expect(toCanonicalGrade(' Grade 10 ')).toBe('grade10');
    expect(toCanonicalGrade('GRADE10')).toBe('grade10');
    expect(toCanonicalGrade('10th')).toBe('grade10');
  });

  it("maps the parseInt artifact 'NaN' to null rather than guessing", () => {
    // The member PATCH ran parseInt on a text column: parseInt('grade10') is NaN.
    // The original grade is destroyed; null is the honest answer.
    expect(toCanonicalGrade('NaN')).toBeNull();
    expect(toCanonicalGrade('nan')).toBeNull();
  });

  it('never coerces an unsupported grade to a neighbour', () => {
    // These are minors' records: a wrong grade is worse than a missing one.
    expect(toCanonicalGrade('7')).toBeNull();
    expect(toCanonicalGrade('13')).toBeNull();
    expect(toCanonicalGrade('grade7')).toBeNull();
  });

  it('rejects ambiguous or empty input', () => {
    expect(toCanonicalGrade('89')).toBeNull();     // two grades' worth of digits
    expect(toCanonicalGrade('1012')).toBeNull();
    expect(toCanonicalGrade('')).toBeNull();
    expect(toCanonicalGrade('   ')).toBeNull();
    expect(toCanonicalGrade(null)).toBeNull();
    expect(toCanonicalGrade(undefined)).toBeNull();
    expect(toCanonicalGrade({})).toBeNull();
    expect(toCanonicalGrade(['grade10'])).toBeNull();
  });

  it('preserves graduated, which a numeric canonical form could not express', () => {
    expect(toCanonicalGrade('graduated')).toBe('graduated');
    expect(toCanonicalGrade(' Graduated ')).toBe('graduated');
  });
});

describe('isCanonicalGrade', () => {
  it('accepts only exact canonical tokens', () => {
    expect(isCanonicalGrade('grade10')).toBe(true);
    expect(isCanonicalGrade('graduated')).toBe(true);
    expect(isCanonicalGrade('10')).toBe(false);
    expect(isCanonicalGrade('Grade10')).toBe(false);
    expect(isCanonicalGrade(10)).toBe(false);
    expect(isCanonicalGrade(null)).toBe(false);
  });
});

describe('gradeToNumber', () => {
  it('extracts the number from either stored format', () => {
    expect(gradeToNumber('grade10')).toBe(10);
    expect(gradeToNumber('10')).toBe(10);
    expect(gradeToNumber('Grade 8')).toBe(8);
    expect(gradeToNumber(11)).toBe(11);
  });

  it('has no number for graduated, absent or corrupt values', () => {
    expect(gradeToNumber('graduated')).toBeNull();
    expect(gradeToNumber('NaN')).toBeNull();
    expect(gradeToNumber('')).toBeNull();
    expect(gradeToNumber(null)).toBeNull();
    expect(gradeToNumber(undefined)).toBeNull();
    expect(gradeToNumber('unknown')).toBeNull();
  });

  it('is tolerant where toCanonicalGrade is strict', () => {
    // Reader-side counterpart: it mirrors the digit extraction already shipped
    // in the quiz and premium-narrative readers, which accept grades this
    // module refuses to STORE.
    expect(toCanonicalGrade('7')).toBeNull();
    expect(gradeToNumber('7')).toBe(7);
  });
});

describe('gradeSortKey', () => {
  it('orders grade8 < ... < grade12 < graduated < unknown', () => {
    const shuffled = ['graduated', 'grade12', 'grade8', 'grade11', 'grade9', 'grade10'];
    const sorted = [...shuffled].sort((a, b) => gradeSortKey(a) - gradeSortKey(b));
    expect(sorted).toEqual(['grade8', 'grade9', 'grade10', 'grade11', 'grade12', 'graduated']);
  });

  it('fixes the lexical sort that is wrong under BOTH stored formats', () => {
    // 'grade10' < 'grade8' and '10' < '8' as strings. This is why the org grade
    // stats could not use localeCompare.
    expect('grade10' < 'grade8').toBe(true);
    expect('10' < '8').toBe(true);
    expect(gradeSortKey('grade10')).toBeGreaterThan(gradeSortKey('grade8'));
    expect(gradeSortKey('10')).toBeGreaterThan(gradeSortKey('8'));
  });

  it('sorts legacy and canonical spellings of one grade to the same position', () => {
    expect(gradeSortKey('10')).toBe(gradeSortKey('grade10'));
  });

  it('parks unrecognized and absent values after graduated', () => {
    expect(gradeSortKey('Unknown')).toBeGreaterThan(gradeSortKey('graduated'));
    expect(gradeSortKey(null)).toBeGreaterThan(gradeSortKey('graduated'));
    expect(gradeSortKey('NaN')).toBeGreaterThan(gradeSortKey('graduated'));
  });
});

describe('nextGrade', () => {
  it('advances one school year', () => {
    expect(nextGrade('grade8')).toBe('grade9');
    expect(nextGrade('grade9')).toBe('grade10');
    expect(nextGrade('grade10')).toBe('grade11');
    expect(nextGrade('grade11')).toBe('grade12');
  });

  it('advances grade12 to graduated', () => {
    expect(nextGrade('grade12')).toBe('graduated');
  });

  it('has nothing after graduated', () => {
    expect(nextGrade('graduated')).toBeNull();
  });

  it('canonicalizes its input first, so legacy rows advance correctly', () => {
    expect(nextGrade('10')).toBe('grade11');
    expect(nextGrade(10)).toBe('grade11');
    expect(nextGrade('Grade 12')).toBe('graduated');
  });

  it('refuses to advance a value it cannot identify', () => {
    expect(nextGrade('NaN')).toBeNull();
    expect(nextGrade('7')).toBeNull();
    expect(nextGrade(null)).toBeNull();
    expect(nextGrade('')).toBeNull();
  });

  it('walks the whole ladder from grade8 to graduated', () => {
    const walked: string[] = ['grade8'];
    let current = nextGrade('grade8');
    while (current !== null) {
      walked.push(current);
      current = nextGrade(current);
    }
    expect(walked).toEqual([...CANONICAL_GRADES]);
  });
});
