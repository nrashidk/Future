/**
 * Migration: compute and store the future-readiness verdict for every career.
 *
 * Unlike career-growth-bands.ts, this module carries NO data table. The verdict
 * is DERIVED at backfill time by deriveReadiness() from two inputs that are
 * already in the row or already checked in:
 *
 *   - careers.onetGrowthBand      (written by career-growth-bands.ts)
 *   - the WEF 2025 role mapping   (server/services/futureReadiness.ts)
 *
 * There is deliberately no hand-authored list of "declining careers" anywhere.
 * A human cannot type a career into the excluded set; the only way a career
 * becomes 'declining' is for both published sources to say so. That is the whole
 * safety property — see docs/future-readiness-recon.md §2 for why the softer
 * alternatives were rejected.
 *
 * Title-keyed and idempotent: careers.id differs between the production and
 * staging branches, and re-running recomputes the same verdicts.
 *
 * EXPECTED RESULT ON TODAY'S 68: zero 'declining'. Our catalogue is entirely
 * professional occupations; WEF's fastest-declining list is clerical. The gate
 * ships excluding nothing, which is the correct outcome and not a bug. Its value
 * is as a guard on catalogue GROWTH — see the validateGeneratedCareer hook in
 * server/services/llmCountryService.ts.
 */

import { db } from '../db';
import { careers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { deriveReadiness } from '../services/futureReadiness';
import { isOnetGrowthBand, type OnetGrowthBand } from '../../shared/growthBands';

/** WEF edition the role lists came from. */
export const WEF_EDITION = 2025;

/**
 * Careers expected to land in 'watch' — one source calls them declining and the
 * other does not. A verify-gate, not documentation.
 *
 * Four are O*NET-only (US headcount): the WEF report does not corroborate any of
 * them, and for three of the four it points the other way — it ranks Secondary
 * Education Teachers among the 15 largest absolute job creators globally.
 * One is WEF-only: Graphic Designer, rank 116 of 126, the least declining of
 * WEF's fifteen, which O*NET bands 'slower' (i.e. still growing).
 *
 * None of the five is gated. If that ever changes, it must be because a human
 * changed this list.
 */
export const EXPECTED_WATCH_TITLES = [
  'Graphic Designer',              // WEF-only
  'Journalist',                    // O*NET-only
  'Nuclear Engineer',              // O*NET-only
  'Primary School Teacher',        // O*NET-only
  'Teacher (Secondary Education)', // O*NET-only
] as const;

export async function applyCareerFutureReadiness(): Promise<void> {
  console.log('Deriving future-readiness verdicts for careers...');

  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: careers.id,
        title: careers.title,
        band: careers.onetGrowthBand,
      })
      .from(careers);

    const derivedAt = new Date().toISOString().slice(0, 10);
    const counts: Record<string, number> = {};
    let updated = 0;

    for (const row of rows) {
      const band: OnetGrowthBand | null = isOnetGrowthBand(row.band) ? row.band : null;
      const verdict = deriveReadiness(row.title, band);

      await tx
        .update(careers)
        .set({
          futureReadiness: verdict.readiness,
          futureReadinessSource: {
            rule: 'strict-AND',
            why: verdict.why,
            wefRole: verdict.wefRole,
            wefRank: verdict.wefRank,
            wefVerdict: verdict.wefVerdict,
            wefEdition: WEF_EDITION,
            onetBand: verdict.onetBand,
            onetBandVia: verdict.onetBandVia,
            mappingConfidence: verdict.mappingConfidence,
            derivedAt,
          },
        })
        .where(eq(careers.id, row.id));

      counts[verdict.readiness] = (counts[verdict.readiness] ?? 0) + 1;
      updated++;
    }

    // Gate 1: THE claim this whole change rests on. A career that reaches
    // 'declining' is removed from every student's recommendations, so it may
    // never happen as a side effect of a data refresh.
    const declining = await tx
      .select({ title: careers.title })
      .from(careers)
      .where(eq(careers.futureReadiness, 'declining'));
    if (declining.length > 0) {
      throw new Error(
        `future-readiness backfill aborted: expected NO declining careers in the ` +
          `current catalogue, got ${JSON.stringify(declining.map((r) => r.title))}. ` +
          `A career only becomes declining when BOTH WEF and O*NET agree — if that ` +
          `is genuinely now true, a human must approve it before it ships.`,
      );
    }

    // Gate 2: the review set is the five known single-source disagreements.
    const watching = await tx
      .select({ title: careers.title })
      .from(careers)
      .where(eq(careers.futureReadiness, 'watch'));
    const got = watching.map((r) => r.title).sort();
    const expected = [...EXPECTED_WATCH_TITLES].sort();
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      throw new Error(
        `future-readiness backfill aborted: watch set changed. ` +
          `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
      );
    }

    const summary = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`)
      .join(' ');
    console.log(`Career future-readiness: ${updated} updated (${summary}), 0 declining`);
  });
}
