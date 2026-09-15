/**
 * Every date in this app is read by a UAE audience, in either language —
 * not by whatever locale the viewer's browser happens to be set to.
 * `.toLocaleDateString()` with no locale argument renders MM/DD/YYYY
 * (US month-first) on a US-configured browser regardless of the app's own
 * language, which an Arabic-reading student can misread as an earlier date
 * — 9/18 read as day 9 of month 18, i.e. as September the 9th, three days
 * before the date actually meant. 'en-AE' and 'ar-AE' both order DD/MM/YYYY,
 * the UAE convention in either language (verified directly:
 * `new Date(...).toLocaleDateString('en-AE')` and `('ar-AE')` both produce
 * day-month-year; `'en-US'`, which several call sites in this codebase pass
 * for the English branch, does not).
 */
export function localeForLanguage(language: string): string {
  return language === "ar" ? "ar-AE" : "en-AE";
}

/**
 * Default options are explicit 2-digit day/month so the output is always
 * unambiguous (18/09/2026, never 18/9/2026) — pass different options for a
 * context that wants a month name instead (e.g. { month: "short" }).
 */
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

export function formatLocalizedDate(
  date: Date | string,
  language: string,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_OPTIONS,
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(localeForLanguage(language), options);
}
