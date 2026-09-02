/**
 * O*NET projected-growth bands — the single source of truth for how a career's
 * growth outlook is stored and displayed.
 *
 * The band is what O*NET actually publishes on an occupation summary page
 * ("Projected growth (2024-2034)"). The specific percentages that used to live
 * in careers.growthOutlook were hand-authored, unsourced, and wrong on 22 of 68
 * rows — see docs/future-readiness-recon.md §1a.
 *
 * IMPORTANT: this is a U.S. Bureau of Labor Statistics projection surfaced by
 * O*NET. It counts U.S. headcount. It is NOT a verdict on whether an occupation
 * has a future: O*NET bands both school-teacher careers as `decline` purely on
 * falling U.S. enrolment, while the WEF Future of Jobs 2025 report ranks
 * Secondary Education Teachers among the 15 LARGEST absolute job creators
 * globally. Nothing may gate a career on this signal alone.
 *
 * Lives in shared/ for two reasons: both client report pages import it (this
 * module replaced a duplicated string parser in Results.tsx and
 * ResultsPrint.tsx), and vitest.config.ts only collects server/** and shared/**,
 * so this is the only location where the logic is testable.
 */

export const ONET_GROWTH_BANDS = [
  "much_faster",
  "faster",
  "average",
  "slower",
  "decline",
  "not_applicable",
] as const;

export type OnetGrowthBand = (typeof ONET_GROWTH_BANDS)[number];

export function isOnetGrowthBand(v: unknown): v is OnetGrowthBand {
  return typeof v === "string" && (ONET_GROWTH_BANDS as readonly string[]).includes(v);
}

/**
 * Verbatim O*NET band label -> our enum. Used by the band refresh/backfill path
 * so the mapping from the source page is written down once, not re-derived.
 */
export const ONET_BAND_BY_LABEL: Record<string, OnetGrowthBand> = {
  "Much faster than average (7% or higher)": "much_faster",
  "Faster than average (5% to 6%)": "faster",
  "Average (3% to 4%)": "average",
  "Slower than average (1% to 2%)": "slower",
  "Decline (-1% or lower)": "decline",
};

/**
 * i18n key per band, in the `results` namespace.
 *
 * One COMPLETE phrase per band — deliberately not a level word plus an
 * interpolated number. The previous design matched `(\d+)% growth` with an
 * UNSIGNED integer and fell back to raw English on any string it could not
 * parse; that is what silently censored "Declining" from every Arabic report.
 * An enum indexing a lookup has no unmatched-input path.
 */
export const GROWTH_BAND_I18N: Record<OnetGrowthBand, string> = {
  much_faster: "growthBandMuchFaster",
  faster: "growthBandFaster",
  average: "growthBandAverage",
  slower: "growthBandSlower",
  decline: "growthBandDecline",
  not_applicable: "growthDepends", // pre-existing key: "Depends on venture"
};

/**
 * The DERIVED English display string persisted to careers.growthOutlook.
 *
 * This function is the ONLY writer of that column. The column is deprecated and
 * kept for backwards compatibility only; it must never be authored by a human,
 * a superadmin form or an LLM. shared/growthBands.test.ts pins these strings
 * against the en locale file so the two cannot drift.
 */
const GROWTH_OUTLOOK_EN: Record<OnetGrowthBand, string> = {
  much_faster: "Excellent — 7%+ growth",
  faster: "Very Good — 5–6% growth",
  average: "Good — 3–4% growth",
  slower: "Moderate — 1–2% growth",
  decline: "Declining — projected decline",
  not_applicable: "Depends on venture",
};

export function growthOutlookFor(band: OnetGrowthBand): string {
  return GROWTH_OUTLOOK_EN[band];
}
