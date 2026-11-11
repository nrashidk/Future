/**
 * SIGN-IN NAMES THAT A PERSON CAN READ OUT OVER THE TELEPHONE.
 *
 * Until 2026-11-11 every account ever created carried four random hex
 * characters — `nasser.alali.36ad` — appended UNCONDITIONALLY rather than on
 * collision. The collision loop existed at all four call sites and never fired,
 * because the base name was always already unique. The suffix was doing nothing
 * except making every sign-in name unreadable, and a school administrator reads
 * these out to staff.
 *
 * REMOVING IT EXPOSED WHAT IT WAS HIDING. The old generator kept only
 * `[a-z0-9]`, so on a bilingual product sold to UAE schools:
 *
 *     Nasser / Al Ali    ->  nasser.alali.36ad     (fine)
 *     ناصر   / العلي      ->  ..36ad                (two dots)
 *     José   / Pérez     ->  jos.prez.36ad         (accents DELETED)
 *
 * An Arabic-named administrator's sign-in name was two dots and four hex
 * characters, and the random suffix was the only reason that was unique rather
 * than a crash. Dropping the suffix without fixing this would have produced a
 * username of "." — so transliteration is not a nicety bolted on beside the
 * change, it is the half that makes the change safe.
 *
 * THIS IS TRANSLITERATION, NOT TRANSLATION, and it is deliberately lossy and
 * deterministic: ناصر becomes "nasr", not "nasser". A username needs to be
 * stable, typeable on any keyboard and recognisably the person's own name. It
 * does not need to be the spelling they would choose themselves, and a
 * cleverer scheme that produced different output for the same input across
 * versions would be far worse — the name is a credential.
 */

/**
 * Arabic letters to Latin. One pass, no context rules.
 *
 * Emphatic pairs collapse (ص and س both to "s", ض and د both to "d"): keeping
 * them apart needs digraphs or diacritics that nobody can type into a login
 * box, and a collision between two such names is handled by the numbering
 * below like any other.
 */
const ARABIC_MAP: Record<string, string> = {
  "ا": "a", "أ": "a", "إ": "a", "آ": "a", "ٱ": "a",
  "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh",
  "ص": "s", "ض": "d", "ط": "t", "ظ": "z",
  // ع has no English equivalent. "a" rather than an apostrophe or a digit,
  // both of which read as noise in a name.
  "ع": "a", "غ": "gh",
  "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
  "ه": "h", "ة": "a", "و": "w", "ؤ": "w",
  "ي": "y", "ى": "a", "ئ": "y",
  // Hamza carries no sound of its own here; dropped rather than mapped.
  "ء": "",
  // Arabic-Indic digits, which a name can carry in some locales.
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** When nothing survives transliteration. Never a bare "." or an empty string. */
export const USERNAME_FALLBACK = "user";

/** Long enough for a double-barrelled name, short enough to read aloud. */
export const USERNAME_MAX_PART = 24;

/**
 * One name to its Latin form.
 *
 * NFD first, so a Latin letter with a diacritic separates into the letter plus
 * a combining mark and the mark alone is dropped — é becomes "e" rather than
 * disappearing with its vowel, which is what the old `[^a-z0-9]` strip did to
 * "José".
 */
export function transliterateName(input: string): string {
  if (typeof input !== "string") return "";
  let out = "";
  // Strip combining marks (Latin diacritics AND Arabic harakat) before mapping.
  const decomposed = input.normalize("NFD").replace(/[̀-ًͯ-ْٰ]/g, "");
  for (const ch of decomposed) {
    if (Object.prototype.hasOwnProperty.call(ARABIC_MAP, ch)) {
      out += ARABIC_MAP[ch];
      continue;
    }
    const lower = ch.toLowerCase();
    if (/[a-z0-9]/.test(lower)) out += lower;
    // Everything else — spaces, hyphens, apostrophes, punctuation, any script
    // with no mapping — is dropped, exactly as before. "Al-Mansoori" stays
    // "almansoori".
  }
  return out.slice(0, USERNAME_MAX_PART);
}

/**
 * The base sign-in name: `first.last`, with no suffix of any kind.
 *
 * A missing half does not produce a leading or trailing dot. "." was the
 * literal output of the old generator for an Arabic name once the random
 * suffix was removed, and a username that is punctuation alone is not a
 * username.
 */
export function usernameBase(firstName: string, lastName: string): string {
  const first = transliterateName(firstName ?? "");
  const last = transliterateName(lastName ?? "");
  if (first && last) return `${first}.${last}`;
  return first || last || USERNAME_FALLBACK;
}

/**
 * The nth candidate for a base. Attempt 0 is the bare name.
 *
 * Numbered, not random: `nasser.alali2` says "a second Nasser Al Ali", which is
 * what actually happened, and stays readable. The old scheme answered a
 * collision with a fresh 4-hex suffix — unreadable, and no more unique.
 */
export function usernameCandidate(base: string, attempt: number): string {
  if (!Number.isInteger(attempt) || attempt < 0) {
    throw new Error(`usernameCandidate: attempt must be a non-negative integer, got ${attempt}`);
  }
  return attempt === 0 ? base : `${base}${attempt + 1}`;
}

/**
 * Resolves a free name by asking the caller's own existence check.
 *
 * The check is injected rather than imported so this stays pure and testable;
 * every call site previously carried its own hand-rolled loop and the three
 * copies had drifted — one retried with a fresh random suffix, one did not
 * number at all.
 *
 * Bounded. An unbounded loop against a database is a request that never
 * returns, and 50 people with one name is a data-entry fault worth surfacing
 * rather than numbering past.
 */
export const USERNAME_MAX_ATTEMPTS = 50;

export async function resolveUsername(
  firstName: string,
  lastName: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = usernameBase(firstName, lastName);
  for (let attempt = 0; attempt < USERNAME_MAX_ATTEMPTS; attempt++) {
    const candidate = usernameCandidate(base, attempt);
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(
    `Could not find a free sign-in name for "${base}" after ${USERNAME_MAX_ATTEMPTS} attempts.`,
  );
}
