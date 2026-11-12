/**
 * Is this text actually Arabic?
 *
 * A translated column that holds its English source is "present" and not
 * translated. True when the value contains at least one Arabic letter.
 */
export function isArabicText(value: string | null | undefined): boolean {
  return typeof value === "string" && /[\u0600-\u06FF]/.test(value);
}
