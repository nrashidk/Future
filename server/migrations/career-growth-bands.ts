/**
 * Migration: populate the O*NET projected-growth band for all 68 careers.
 * Uses career English title as the match key.
 *
 * WHY THIS EXISTS
 * ---------------
 * careers.growthOutlook was a hand-authored display string. It was stale or
 * mis-banded on 22 of 68 rows, and — worse — it could not express decline at
 * all: the client localiser's vocabulary had no declining tier and its regex
 * matched only an UNSIGNED percentage, so the seed author recorded two
 * O*NET-`decline` occupations (Nuclear Engineer, Primary School Teacher) as
 * "Moderate (0% growth)" to stay inside it. See docs/future-readiness-recon.md
 * §1a and docs/future-readiness-plan.md A1.
 *
 * This module makes careers.onetGrowthBand the source of truth and rewrites
 * careers.growthOutlook as a pure derivative of it via growthOutlookFor().
 *
 * SOURCE
 * ------
 * O*NET OnLine occupation summary, field "Projected growth (2024-2034)",
 * fetched per onetCode on 2026-09-02, e.g.
 *   https://www.onetonline.org/link/summary/27-1024.00
 * O*NET surfaces this band from the U.S. Bureau of Labor Statistics Employment
 * Projections program.
 *
 * READ THIS BEFORE USING THE BAND FOR ANYTHING BUT DISPLAY
 * -------------------------------------------------------
 * The band counts U.S. HEADCOUNT. It is not a verdict on whether an occupation
 * has a future. Four careers here band as `decline`; three of them
 * (Nuclear Engineer, Primary School Teacher, Teacher (Secondary Education))
 * are careers the UAE is actively investing in, and the WEF Future of Jobs 2025
 * report ranks Secondary Education Teachers among the 15 LARGEST absolute job
 * creators on earth. Nothing may exclude a career on this signal alone.
 *
 * Same INSERT-only trap as career-values-profiles.ts: the careers seed loop
 * skips existing titles, so these fields only ever reach a from-scratch
 * database. This backfill is what populates the rows that are already there.
 * It is idempotent — re-running it rewrites the same values.
 */

import { db } from '../db';
import { careers } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { growthOutlookFor, type OnetGrowthBand } from '../../shared/growthBands';

export interface CareerGrowthBand {
  title: string;
  /** O*NET-SOC code the band was read from. */
  onetCode: string;
  band: OnetGrowthBand;
  /** The O*NET label verbatim, so the enum value stays traceable to its source. */
  bandVerbatim: string | null;
}

/** Date the bands above were read from O*NET. */
export const GROWTH_BANDS_FETCHED_AT = '2026-09-02';
/** BLS projection vintage the bands belong to. */
export const GROWTH_BANDS_VINTAGE = '2024-2034';

export const CAREER_GROWTH_BANDS: CareerGrowthBand[] = [
  {
    title: "AI Research Scientist",
    onetCode: '15-1221.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Accountant",
    onetCode: '13-2011.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Actuary",
    onetCode: '15-2011.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Aerospace Engineer",
    onetCode: '17-2011.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Agricultural Engineer",
    onetCode: '17-2021.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Agricultural Scientist (Agronomist)",
    onetCode: '19-1013.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Airline Pilot",
    onetCode: '53-2011.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Architect",
    onetCode: '17-1011.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Atmospheric & Space Scientist",
    onetCode: '19-2021.00',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Biomedical Engineer",
    onetCode: '17-2031.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Chef",
    onetCode: '35-1011.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Chemical Engineer",
    onetCode: '17-2041.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Civil Engineer",
    onetCode: '17-2051.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Cloud & Network Architect",
    onetCode: '15-1241.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Content Creator",
    onetCode: '27-3043.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Curriculum & Instructional Designer",
    onetCode: '25-9031.00',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Cybersecurity Analyst",
    onetCode: '15-1212.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Data Engineer",
    onetCode: '15-1243.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Data Scientist",
    onetCode: '15-2051.01',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Dentist",
    onetCode: '29-1021.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Dietitian & Nutritionist",
    onetCode: '29-1031.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Digital Marketing Specialist",
    onetCode: '13-1161.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Doctor (General Practitioner)",
    onetCode: '29-1215.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Electrical Engineer",
    onetCode: '17-2071.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Entrepreneur",
    onetCode: '11-1021.00',
    band: 'not_applicable',
    bandVerbatim: null,
    // REVIEWED EXCEPTION. This onetCode is General and Operations
    // Managers, an acknowledged proxy (see career-values-profiles.ts).
    // O*NET bands it `average`, but a US headcount projection for
    // corporate managers does not describe founding a venture, so the
    // product's existing "Depends on venture" stays the honest display.
  },
  {
    title: "Environmental Engineer",
    onetCode: '17-2081.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Environmental Scientist",
    onetCode: '19-2041.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Fashion Designer",
    onetCode: '27-1022.00',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Film & TV Producer",
    onetCode: '27-2012.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Financial Analyst",
    onetCode: '13-2099.01',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Food Technologist",
    onetCode: '19-1012.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Geneticist",
    onetCode: '19-1029.03',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Graphic Designer",
    onetCode: '27-1024.00',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Health Informatics Specialist",
    onetCode: '15-1211.01',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Healthcare Professional (Nurse)",
    onetCode: '29-1141.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Hospitality Manager",
    onetCode: '11-9081.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Human Resources Manager",
    onetCode: '11-3121.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Industrial Engineer",
    onetCode: '17-2112.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Interior Designer",
    onetCode: '27-1025.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Investment & Financial Manager",
    onetCode: '11-3031.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Journalist",
    onetCode: '27-3023.00',
    band: 'decline',
    bandVerbatim: 'Decline (-1% or lower)',
  },
  {
    title: "Lawyer",
    onetCode: '23-1011.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Management Consultant",
    onetCode: '13-1111.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Marketing Manager",
    onetCode: '11-2021.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Mechanical Engineer",
    onetCode: '17-2141.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Nuclear Engineer",
    onetCode: '17-2161.00',
    band: 'decline',
    bandVerbatim: 'Decline (-1% or lower)',
  },
  {
    title: "Pharmacist",
    onetCode: '29-1051.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Photographer",
    onetCode: '27-4021.00',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Physical Therapist",
    onetCode: '29-1123.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Physicist",
    onetCode: '19-2012.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Primary School Teacher",
    onetCode: '25-2021.00',
    band: 'decline',
    bandVerbatim: 'Decline (-1% or lower)',
  },
  {
    title: "Product Manager",
    onetCode: '15-1299.09',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Psychologist",
    onetCode: '19-3033.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Renewable Energy Engineer",
    onetCode: '17-2199.03',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Risk & Compliance Officer",
    onetCode: '13-1041.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Robotics Engineer",
    onetCode: '17-2199.08',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Sales Manager",
    onetCode: '11-2022.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "Satellite & Remote Sensing Scientist",
    onetCode: '19-2099.01',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "School Counsellor & Career Advisor",
    onetCode: '21-1012.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Social Worker",
    onetCode: '21-1022.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Software Engineer",
    onetCode: '15-1299.08',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Space Scientist (Astrophysicist)",
    onetCode: '19-2011.00',
    band: 'slower',
    bandVerbatim: 'Slower than average (1% to 2%)',
  },
  {
    title: "Teacher (Secondary Education)",
    onetCode: '25-2031.00',
    band: 'decline',
    bandVerbatim: 'Decline (-1% or lower)',
  },
  {
    title: "Tourism & Events Manager",
    onetCode: '13-1121.00',
    band: 'faster',
    bandVerbatim: 'Faster than average (5% to 6%)',
  },
  {
    title: "UX/UI Designer",
    onetCode: '27-1021.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Video Editor",
    onetCode: '27-4032.00',
    band: 'average',
    bandVerbatim: 'Average (3% to 4%)',
  },
  {
    title: "Video Game Designer",
    onetCode: '15-1255.01',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
  {
    title: "Web Developer",
    onetCode: '15-1254.00',
    band: 'much_faster',
    bandVerbatim: 'Much faster than average (7% or higher)',
  },
]

/**
 * The 4 careers O*NET bands as `decline` at the fetch date above.
 *
 * A verify-gate, not documentation: if a refresh ever produces a fifth, the
 * backfill aborts rather than quietly changing what a student is told about a
 * career. Growing the list is a reviewed decision.
 */
export const EXPECTED_DECLINE_TITLES = [
  'Journalist',
  'Nuclear Engineer',
  'Primary School Teacher',
  'Teacher (Secondary Education)',
] as const;

/**
 * Backfill onetGrowthBand + onetGrowthSource and re-derive growthOutlook.
 *
 * Title-keyed: careers.id is a gen_random_uuid() that differs between the
 * production and staging branches, so title is the only stable key across
 * environments. Transactional: a partial application would leave the catalogue
 * with two growth vocabularies at once, which is the bug being fixed.
 */
export async function applyCareerGrowthBands(): Promise<void> {
  console.log('Applying O*NET growth bands for careers...');

  await db.transaction(async (tx) => {
    let updated = 0;
    let notFound = 0;

    for (const item of CAREER_GROWTH_BANDS) {
      const results = await tx
        .select({ id: careers.id })
        .from(careers)
        .where(eq(careers.title, item.title))
        .limit(1);

      if (results.length === 0) {
        console.warn(`  ⚠ Career not found: "${item.title}"`);
        notFound++;
        continue;
      }

      await tx
        .update(careers)
        .set({
          onetGrowthBand: item.band,
          onetGrowthSource: {
            onetCode: item.onetCode,
            bandVerbatim: item.bandVerbatim,
            fetchedAt: GROWTH_BANDS_FETCHED_AT,
            projectionVintage: GROWTH_BANDS_VINTAGE,
            ...(item.band === 'not_applicable'
              ? { note: 'reviewed exception — see docs/future-readiness-plan.md A3' }
              : {}),
          },
          // DERIVED, never authored. growthOutlookFor is the column's only writer.
          growthOutlook: growthOutlookFor(item.band),
        })
        .where(eq(careers.id, results[0].id));
      updated++;
    }

    // Gate: the decline set must be exactly the reviewed four. A fifth means the
    // source moved and a human must look before students see it.
    const declining = await tx
      .select({ title: careers.title })
      .from(careers)
      .where(eq(careers.onetGrowthBand, 'decline'));
    const got = declining.map((r) => r.title).sort();
    const expected = [...EXPECTED_DECLINE_TITLES].sort();
    if (JSON.stringify(got) !== JSON.stringify(expected)) {
      throw new Error(
        `growth-band backfill aborted: decline set changed. ` +
          `expected ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
      );
    }

    // Gate: every row's growthOutlook must now be derivable from its band, i.e.
    // no hand-authored percentage survives anywhere in the catalogue.
    const all = await tx
      .select({
        title: careers.title,
        band: careers.onetGrowthBand,
        outlook: careers.growthOutlook,
      })
      .from(careers);
    const drifted = all.filter(
      (r) => r.outlook !== growthOutlookFor(r.band as OnetGrowthBand),
    );
    if (drifted.length > 0) {
      throw new Error(
        `growth-band backfill aborted: growthOutlook not derived for ` +
          `${JSON.stringify(drifted.map((r) => r.title))}`,
      );
    }

    console.log(`Career growth bands: ${updated} updated, ${notFound} not found`);
  });
}
