import { describe, it, expect } from 'vitest';
import {
  MAX_STUDENT_AGE_YEARS,
  MIN_STUDENT_AGE_YEARS,
  ageOnDate,
  parseDateOfBirth,
  toDateOnlyString,
  validateDateOfBirth,
} from './dateOfBirth';

describe('parseDateOfBirth', () => {
  it('accepts a well-formed date and returns it unchanged', () => {
    expect(parseDateOfBirth('2010-03-14')).toBe('2010-03-14');
    expect(parseDateOfBirth('2008-12-31')).toBe('2008-12-31');
    expect(parseDateOfBirth('2011-01-01')).toBe('2011-01-01');
  });

  it('is idempotent, so it is safe to apply to already-stored values', () => {
    const once = parseDateOfBirth('2010-03-14');
    expect(parseDateOfBirth(once)).toBe(once);
  });

  it('tolerates surrounding whitespace, because CSV cells carry it', () => {
    expect(parseDateOfBirth('  2010-03-14  ')).toBe('2010-03-14');
    expect(parseDateOfBirth('\t2010-03-14\n')).toBe('2010-03-14');
  });

  it('accepts a leap day in a leap year', () => {
    expect(parseDateOfBirth('2012-02-29')).toBe('2012-02-29');
    expect(parseDateOfBirth('2000-02-29')).toBe('2000-02-29'); // divisible by 400
  });

  it('rejects a leap day in a non-leap year', () => {
    expect(parseDateOfBirth('2011-02-29')).toBeNull();
    expect(parseDateOfBirth('1900-02-29')).toBeNull(); // divisible by 100, not 400
  });

  it('rejects dates that look valid but do not exist', () => {
    // The case a regex alone cannot catch, and the case `new Date()` gets WRONG:
    // it rolls 2011-02-30 forward into March rather than refusing it.
    expect(parseDateOfBirth('2011-02-30')).toBeNull();
    expect(parseDateOfBirth('2011-02-31')).toBeNull();
    expect(parseDateOfBirth('2011-04-31')).toBeNull();
    expect(parseDateOfBirth('2011-06-31')).toBeNull();
    expect(parseDateOfBirth('2011-09-31')).toBeNull();
    expect(parseDateOfBirth('2011-11-31')).toBeNull();
  });

  it('accepts the real last day of every month', () => {
    const lastDays = [
      '2011-01-31', '2011-02-28', '2011-03-31', '2011-04-30',
      '2011-05-31', '2011-06-30', '2011-07-31', '2011-08-31',
      '2011-09-30', '2011-10-31', '2011-11-30', '2011-12-31',
    ];
    for (const day of lastDays) {
      expect(parseDateOfBirth(day)).toBe(day);
    }
  });

  it('rejects out-of-range months and days', () => {
    expect(parseDateOfBirth('2011-00-15')).toBeNull();
    expect(parseDateOfBirth('2011-13-15')).toBeNull();
    expect(parseDateOfBirth('2011-06-00')).toBeNull();
    expect(parseDateOfBirth('2011-06-32')).toBeNull();
  });

  it('rejects any shape but YYYY-MM-DD', () => {
    expect(parseDateOfBirth('2011-2-3')).toBeNull();      // unpadded
    expect(parseDateOfBirth('11-02-03')).toBeNull();      // two-digit year
    expect(parseDateOfBirth('03/14/2010')).toBeNull();    // ambiguous between two real dates
    expect(parseDateOfBirth('14-03-2010')).toBeNull();
    expect(parseDateOfBirth('2010-03-14T00:00:00Z')).toBeNull(); // no time component
    expect(parseDateOfBirth('2010-03-14 ')).toBe('2010-03-14');  // ...but trailing space is fine
  });

  it('rejects non-strings and empties rather than coercing them', () => {
    expect(parseDateOfBirth('')).toBeNull();
    expect(parseDateOfBirth('   ')).toBeNull();
    expect(parseDateOfBirth(null)).toBeNull();
    expect(parseDateOfBirth(undefined)).toBeNull();
    expect(parseDateOfBirth(20100314)).toBeNull();
    expect(parseDateOfBirth(new Date('2010-03-14'))).toBeNull();
    expect(parseDateOfBirth(['2010-03-14'])).toBeNull();
    expect(parseDateOfBirth({ year: 2010 })).toBeNull();
  });
});

describe('ageOnDate', () => {
  it('counts completed years', () => {
    expect(ageOnDate('2010-03-14', '2026-03-14')).toBe(16);
    expect(ageOnDate('2010-01-01', '2026-12-31')).toBe(16);
  });

  it('turns over ON the birthday, not the day after', () => {
    expect(ageOnDate('2010-06-15', '2026-06-14')).toBe(15); // day before
    expect(ageOnDate('2010-06-15', '2026-06-15')).toBe(16); // birthday today
    expect(ageOnDate('2010-06-15', '2026-06-16')).toBe(16); // day after
  });

  it('does not roll over early across a month boundary', () => {
    // The classic off-by-one: comparing months alone would make a 1 July
    // birthday arrive on 30 June.
    expect(ageOnDate('2010-07-01', '2026-06-30')).toBe(15);
    expect(ageOnDate('2010-07-01', '2026-07-01')).toBe(16);
  });

  it('does not roll over early across a year boundary', () => {
    expect(ageOnDate('2010-01-01', '2025-12-31')).toBe(15);
    expect(ageOnDate('2010-01-01', '2026-01-01')).toBe(16);
    expect(ageOnDate('2010-12-31', '2026-01-01')).toBe(15);
    expect(ageOnDate('2010-12-31', '2026-12-31')).toBe(16);
  });

  it('treats 1 March as the birthday of a leap-day child in a non-leap year', () => {
    // Documented choice, not an accident of Date arithmetic: (02,28) sorts
    // before (02,29), so the anniversary lands on 1 March. It can never make a
    // student a year OLDER than they are.
    expect(ageOnDate('2012-02-29', '2025-02-28')).toBe(12);
    expect(ageOnDate('2012-02-29', '2025-03-01')).toBe(13);
  });

  it('turns over on 29 February itself in a leap year', () => {
    expect(ageOnDate('2012-02-29', '2028-02-28')).toBe(15);
    expect(ageOnDate('2012-02-29', '2028-02-29')).toBe(16);
  });

  it('handles a 28 February birthday in a leap year without drifting', () => {
    expect(ageOnDate('2010-02-28', '2028-02-27')).toBe(17);
    expect(ageOnDate('2010-02-28', '2028-02-28')).toBe(18);
    expect(ageOnDate('2010-02-28', '2028-02-29')).toBe(18);
  });

  it('is 0 on the day of birth', () => {
    expect(ageOnDate('2026-09-07', '2026-09-07')).toBe(0);
  });

  it('is null before the date of birth, never negative', () => {
    // A negative age is a plausible-looking value for an impossible state.
    expect(ageOnDate('2010-03-14', '2010-03-13')).toBeNull();
    expect(ageOnDate('2010-03-14', '2009-12-31')).toBeNull();
  });

  it('is null when either date is unparseable', () => {
    expect(ageOnDate('2011-02-30', '2026-09-07')).toBeNull();
    expect(ageOnDate('not-a-date', '2026-09-07')).toBeNull();
    expect(ageOnDate(null, '2026-09-07')).toBeNull();
    expect(ageOnDate('2010-03-14', 'today')).toBeNull();
    expect(ageOnDate('2010-03-14', null)).toBeNull();
  });

  it('never constructs a Date, so it cannot shift across timezones', () => {
    // A Date-based implementation of the same question is timezone-sensitive:
    // this is the bug the module exists to avoid, asserted rather than described.
    expect(new Date('2010-03-14').getDate()).toBe(14); // UTC parse
    expect(ageOnDate('2010-03-14', '2026-03-13')).toBe(15);
    expect(ageOnDate('2010-03-14', '2026-03-14')).toBe(16);
  });
});

describe('validateDateOfBirth', () => {
  // A fixed "today" for every case below, so nothing here rots.
  const TODAY = '2026-09-07';

  it('accepts a plausible student and returns the derived age with it', () => {
    const result = validateDateOfBirth('2010-03-14', TODAY);
    expect(result).toEqual({ ok: true, value: '2010-03-14', age: 16 });
  });

  it('normalizes the value it returns', () => {
    const result = validateDateOfBirth('  2010-03-14  ', TODAY);
    expect(result.ok && result.value).toBe('2010-03-14');
  });

  it('derives the same age as ageOnDate, so the two cannot drift', () => {
    const result = validateDateOfBirth('2012-02-29', TODAY);
    expect(result.ok && result.age).toBe(ageOnDate('2012-02-29', TODAY));
  });

  it('rejects a malformed value as malformed', () => {
    for (const bad of ['', '   ', '03/14/2010', '2011-2-3', 'yesterday', null, 20100314]) {
      const result = validateDateOfBirth(bad, TODAY);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toBe('malformed');
    }
  });

  it('distinguishes a well-formed impossible date from a malformed one', () => {
    // Separate reasons because they are separate admin mistakes: one is the
    // wrong format, the other is a typo in a correct format.
    const result = validateDateOfBirth('2011-02-30', TODAY);
    expect(!result.ok && result.reason).toBe('impossible-date');
    expect(!result.ok && result.message).toContain('2011-02-30');
  });

  it('rejects a future date, including tomorrow', () => {
    expect(!validateDateOfBirth('2026-09-08', TODAY).ok).toBe(true);
    const result = validateDateOfBirth('2026-09-08', TODAY);
    expect(!result.ok && result.reason).toBe('future');
    expect(!result.ok && result.message).toContain('future');
  });

  it('accepts today itself as well-formed, and rejects it on age instead', () => {
    // Born today is not a FORMAT problem; the reason has to name the real one.
    const result = validateDateOfBirth(TODAY, TODAY);
    expect(!result.ok && result.reason).toBe('too-young');
  });

  describe('the plausible-age range', () => {
    it('is wider at the bottom than the assessment input, and identical at the top', () => {
      // Precedent: DemographicsStep.tsx:166-168 has min="13" max="25" on age at
      // ASSESSMENT time. A DOB is recorded at student-create, at or before that,
      // and grade 8 legitimately contains 12-year-olds.
      expect(MIN_STUDENT_AGE_YEARS).toBeLessThan(13);
      expect(MAX_STUDENT_AGE_YEARS).toBe(25);
    });

    it('accepts both bounds inclusively', () => {
      const youngest = `${2026 - MIN_STUDENT_AGE_YEARS}-09-07`; // exactly MIN today
      const oldest = `${2026 - MAX_STUDENT_AGE_YEARS}-09-07`;   // exactly MAX today

      expect(validateDateOfBirth(youngest, TODAY)).toEqual({
        ok: true, value: youngest, age: MIN_STUDENT_AGE_YEARS,
      });
      expect(validateDateOfBirth(oldest, TODAY)).toEqual({
        ok: true, value: oldest, age: MAX_STUDENT_AGE_YEARS,
      });
    });

    it('rejects one day outside either bound', () => {
      // One day younger than MIN: born a day after the qualifying birthday.
      const tooYoung = `${2026 - MIN_STUDENT_AGE_YEARS}-09-08`;
      const tooYoungResult = validateDateOfBirth(tooYoung, TODAY);
      expect(!tooYoungResult.ok && tooYoungResult.reason).toBe('too-young');

      // One day older than MAX: birthday was yesterday, so they are MAX + 1.
      const tooOld = `${2026 - MAX_STUDENT_AGE_YEARS - 1}-09-06`;
      const tooOldResult = validateDateOfBirth(tooOld, TODAY);
      expect(!tooOldResult.ok && tooOldResult.reason).toBe('too-old');
    });

    it('catches the typos the range exists for', () => {
      expect(!validateDateOfBirth('2201-03-14', TODAY).ok).toBe(true); // future year
      expect(!validateDateOfBirth('1911-03-14', TODAY).ok).toBe(true); // transposed century
      const result = validateDateOfBirth('1911-03-14', TODAY);
      expect(!result.ok && result.reason).toBe('too-old');
    });

    it('names the age and the bound in the message, so an admin can fix it', () => {
      const result = validateDateOfBirth('1911-03-14', TODAY);
      expect(!result.ok && result.message).toContain(String(MAX_STUDENT_AGE_YEARS));
      expect(!result.ok && result.message).toContain('1911-03-14');
    });
  });

  it('throws on an invalid asOf rather than failing open', () => {
    // asOf is the server's own reference date, never request input, so a bad one
    // is a programmer error. Returning a rejection would refuse every candidate
    // date and look like strict validation.
    expect(() => validateDateOfBirth('2010-03-14', 'today')).toThrow(TypeError);
    expect(() => validateDateOfBirth('2010-03-14', '2026-02-30')).toThrow(TypeError);
    expect(() => validateDateOfBirth('2010-03-14', '')).toThrow(TypeError);
  });
});

describe('toDateOnlyString', () => {
  it('takes the instant explicitly and reads it in UTC', () => {
    expect(toDateOnlyString(new Date('2026-09-07T00:00:00Z'))).toBe('2026-09-07');
    expect(toDateOnlyString(new Date('2026-09-07T23:59:59Z'))).toBe('2026-09-07');
  });

  it('pads single-digit months and days', () => {
    expect(toDateOnlyString(new Date('2026-01-02T12:00:00Z'))).toBe('2026-01-02');
  });

  it('produces a string this module accepts, closing the loop', () => {
    const today = toDateOnlyString(new Date('2026-09-07T18:30:00Z'));
    expect(parseDateOfBirth(today)).toBe(today);
    expect(ageOnDate('2010-03-14', today)).toBe(16);
  });

  it('resolves an instant to ONE day regardless of the host timezone', () => {
    // The reason this is UTC and not local: an instant late in the UTC day is
    // already tomorrow in UTC+4, and the server must pick one answer.
    const instant = new Date('2026-09-07T21:00:00Z');
    expect(toDateOnlyString(instant)).toBe('2026-09-07');
  });
});
