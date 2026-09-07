/**
 * Student date of birth — the single source of truth for format, validation and
 * age derivation.
 *
 * Canonical format: `'YYYY-MM-DD'`, a date-only string. Nothing here constructs a
 * `Date`, and that is the point.
 *
 * WHY STRINGS, NOT DATES: the column this backs is
 * `organization_members.date_of_birth`, declared `date(..., { mode: "string" })`.
 * A birth date has no time and no timezone. Route it through a JS `Date` and
 * `2010-03-14` becomes an instant, which renders as 13 March anywhere west of
 * Greenwich — moving a student's birthday, and therefore their derived age, by a
 * day. Comparing year/month/day as numbers has no such failure mode. See
 * docs/v2-phase4-step4-recon.md §1a and §4c.
 *
 * WHY `asOf` IS ALWAYS A PARAMETER: age is not a property of a person, it is a
 * property of a person *and a date*. A function that reads the clock internally
 * cannot be tested without freezing time, and — more importantly — it lets a
 * caller be vague about which date the age is "as of". The assessment stores age
 * as of the day the assessment was created (`assessments.age`), which is a
 * different question from "how old is this student today". Callers must say
 * which they mean.
 *
 * Modelled on shared/grade.ts, and deliberately shares its contract: normalize
 * or return null, never guess. These are minors' records — a wrong date of birth
 * is worse than a rejected one.
 */

/** Strict shape. No single-digit months, no slashes, no time component. */
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * The plausible age band for a student whose school is recording their DOB,
 * inclusive at both ends, evaluated at the reference date.
 *
 * WHERE THESE NUMBERS COME FROM. The only age bound that exists anywhere in the
 * product today is `min="13" max="25"` on the assessment's age input
 * (client/src/components/assessment/DemographicsStep.tsx:166-168), and the stated
 * user population is 13-18. Those are the precedent, and the upper bound is taken
 * from it unchanged.
 *
 * THE LOWER BOUND IS DELIBERATELY WIDER THAN 13, for a reason worth stating: the
 * assessment's 13 applies to age *at assessment time*, whereas a DOB is recorded
 * at student-create, which happens at or before that. `SCHOOL_GRADES`
 * (shared/grade.ts) lets a school enrol into grade 8, where a 12-year-old is
 * entirely ordinary. A 13 floor here would reject a real student on the strength
 * of a bound that was written about a different moment in their life.
 *
 * What this range is FOR is catching gross typos — a year of 2201 or 1911, a
 * transposed decade — not adjudicating whether a particular child belongs in
 * grade 8. If the product ever wants a hard enrolment floor, that is a policy
 * decision for the write site, where it can be explained to the admin in a 400;
 * it does not belong in a date helper.
 *
 * Exported so the write sites, the zod schema and any future CHECK constraint
 * all reference one definition rather than three copies of two numbers.
 */
export const MIN_STUDENT_AGE_YEARS = 10;
export const MAX_STUDENT_AGE_YEARS = 25;

/** Parsed calendar parts. Internal — callers deal in strings. */
interface DateParts {
  year: number;
  month: number;
  day: number;
}

/** Proleptic Gregorian, matching Postgres `date`. */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * `'YYYY-MM-DD'` to parts, or null.
 *
 * Rejects, in order: a non-string, the wrong shape, and a date that is
 * well-formed but does not exist. That last case is the one that matters —
 * `'2011-02-30'` and `'2011-04-31'` pass any regex and are not dates, and
 * `new Date('2011-02-30')` would silently roll them forward into March and May
 * rather than refusing them.
 */
function parseParts(raw: unknown): DateParts | null {
  if (typeof raw !== 'string') return null;

  const match = DATE_ONLY_PATTERN.exec(raw.trim());
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return { year, month, day };
}

/** Negative when a is earlier than b, positive when later, 0 when the same day. */
function compareParts(a: DateParts, b: DateParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/**
 * Normalize a date-only value, or null.
 *
 * Contract, matching toCanonicalGrade:
 *  - **Lossless or null.** Never repairs, never rolls over. `'2011-02-30'` is
 *    null, not 1 March.
 *  - **Idempotent.** The output is always valid input.
 *  - Surrounding whitespace is tolerated, because CSV cells carry it.
 *
 * Says nothing about whether the date is a *plausible* birth date — that needs a
 * reference date, so it lives in validateDateOfBirth.
 */
export function parseDateOfBirth(raw: unknown): string | null {
  const parts = parseParts(raw);
  if (parts === null) return null;

  // Re-emitted from the parsed parts rather than returning the trimmed input, so
  // the output is canonical by construction.
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

/**
 * Completed years between a date of birth and a reference date.
 *
 * Returns null when either date is unparseable, and when `asOf` precedes the
 * date of birth — there is no age before you are born, and a negative number
 * would be a plausible-looking value for an impossible state.
 *
 * LEAP-DAY BIRTHS: someone born 29 February has their birthday on 1 March in
 * non-leap years under this comparison, because `(month, day)` of `02-28` sorts
 * before `02-29`. That is a genuine choice — jurisdictions differ, some treating
 * 28 February as the anniversary — and it is made here rather than falling out
 * of `Date` arithmetic by accident. It costs such a student one day of being a
 * year younger, and it can never produce an age that is too high.
 */
export function ageOnDate(dateOfBirth: unknown, asOf: unknown): number | null {
  const birth = parseParts(dateOfBirth);
  const reference = parseParts(asOf);
  if (birth === null || reference === null) return null;

  if (compareParts(reference, birth) < 0) return null;

  const years = reference.year - birth.year;

  // The birthday has not come round yet this year.
  const beforeBirthday =
    reference.month < birth.month ||
    (reference.month === birth.month && reference.day < birth.day);

  return beforeBirthday ? years - 1 : years;
}

/** Why a candidate date of birth was refused. */
export type DateOfBirthRejection =
  | 'malformed'
  | 'impossible-date'
  | 'future'
  | 'too-young'
  | 'too-old';

export type DateOfBirthResult =
  | { ok: true; value: string; age: number }
  | { ok: false; reason: DateOfBirthRejection; message: string };

/**
 * Full validation of a candidate date of birth as of a reference date.
 *
 * On success returns the normalized value AND the derived age, because every
 * caller that validates a DOB is about to want the age too, and deriving it
 * twice is how the two drift.
 *
 * The messages are the ones an admin sees. They live here, once, for the same
 * reason the member PATCH derives its messages from studentDemographicsSchema
 * (server/routes/admin.routes.ts): four write paths describing the same rule in
 * four different sentences is its own kind of bug.
 *
 * THROWS on an invalid `asOf`. That value never comes from a request body — it
 * is the server's own reference date — so a bad one is a programmer error, not
 * user input. Returning a rejection instead would make this function fail OPEN
 * in the most dangerous way available to it: every candidate date would be
 * refused, or worse, silently accepted by a caller that only checks `ok`.
 */
export function validateDateOfBirth(raw: unknown, asOf: string): DateOfBirthResult {
  const reference = parseParts(asOf);
  if (reference === null) {
    throw new TypeError(
      `validateDateOfBirth: asOf must be a 'YYYY-MM-DD' date, received ${JSON.stringify(asOf)}`,
    );
  }

  if (typeof raw !== 'string' || DATE_ONLY_PATTERN.exec(raw.trim()) === null) {
    return {
      ok: false,
      reason: 'malformed',
      message: 'Date of birth must be a date in YYYY-MM-DD format, for example 2010-03-14.',
    };
  }

  const value = parseDateOfBirth(raw);
  if (value === null) {
    // Right shape, not a real day: '2011-02-30', '2011-04-31', '2011-13-01'.
    return {
      ok: false,
      reason: 'impossible-date',
      message: `Date of birth ${raw.trim()} is not a real calendar date.`,
    };
  }

  const age = ageOnDate(value, asOf);
  if (age === null) {
    return {
      ok: false,
      reason: 'future',
      message: 'Date of birth cannot be in the future.',
    };
  }

  if (age < MIN_STUDENT_AGE_YEARS) {
    return {
      ok: false,
      reason: 'too-young',
      message:
        `Date of birth ${value} makes this student ${age}, which is below the minimum of ` +
        `${MIN_STUDENT_AGE_YEARS}. Check for a typo in the year.`,
    };
  }

  if (age > MAX_STUDENT_AGE_YEARS) {
    return {
      ok: false,
      reason: 'too-old',
      message:
        `Date of birth ${value} makes this student ${age}, which is above the maximum of ` +
        `${MAX_STUDENT_AGE_YEARS}. Check for a typo in the year.`,
    };
  }

  return { ok: true, value, age };
}

/**
 * An instant to the `'YYYY-MM-DD'` string this module works in.
 *
 * The one place a `Date` is allowed, and it takes the instant explicitly rather
 * than calling `new Date()` — so "which day is it" stays a decision the caller
 * makes and a test can control.
 *
 * USES UTC, deliberately. A date-only value has to be derived in one fixed zone
 * or the same instant yields two different answers depending on where the code
 * runs; the server is the only party that should ever decide this, never the
 * viewer's browser. The cost is that the product's audience is in UTC+4, so a
 * student's birthday flips up to four hours into their local day. That is
 * acceptable for an age in completed years and is recorded here so the next
 * reader knows it was chosen rather than inherited.
 */
export function toDateOnlyString(instant: Date): string {
  const year = instant.getUTCFullYear();
  const month = String(instant.getUTCMonth() + 1).padStart(2, '0');
  const day = String(instant.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
