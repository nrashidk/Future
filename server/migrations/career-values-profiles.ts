/**
 * Migration: Populate CVQ values profiles and O*NET codes for all 37 careers.
 * Uses career English title as the match key.
 *
 * GENERATED FILE - DO NOT HAND-EDIT.
 * Generated from scripts/cvq-values-profiles.proposed.json
 * (itself produced by scripts/generate-cvq-values-profiles.ts from the O*NET 30.0
 * "Work Values.txt" flat file). server/migrations/career-values-profiles.test.ts
 * asserts this module still deep-equals that JSON, so drift fails the test suite.
 *
 * Why a .ts module and not a runtime read of the JSON: the production build is
 * `esbuild server/index.ts --bundle --outdir=dist` and runs as `node dist/index.js`.
 * scripts/ is a data-prep directory and is not guaranteed to be deployed alongside
 * the bundle, so the data has to be compiled in. This mirrors how every other bulk
 * dataset in this repo is shipped (career-arabic-content.ts, wefSkillsData.ts,
 * riasecAffinities.ts, the UAE_SECTOR_CATEGORY_RULES in seed.ts).
 *
 * ---------------------------------------------------------------------------
 * SCALE WARNING - read before touching anything here
 * ---------------------------------------------------------------------------
 * These values are CATALOG-RELATIVE POSITIONS, NOT OCCUPATIONAL FACTS. Each domain
 * was min-max rescaled to 0-100 across THIS country's 37-career catalog, so
 * `security: 0` means "lowest security emphasis among these 37 careers", not
 * "this job has no security". Two careers 40 points apart are ranked, not measured.
 *
 * The bounds are catalog-scoped, which makes the whole table interdependent:
 * ADDING OR REMOVING ANY CAREER INVALIDATES ALL 37 PROFILES. When the catalog
 * changes, REGENERATE THE WHOLE FILE via scripts/generate-cvq-values-profiles.ts -
 * NEVER EDIT A ROW. Hand-editing one career silently desynchronises it from the
 * rescale bounds every other career was computed against.
 *
 * Rescale bounds used for this generation (raw O*NET EX-scale -> 0-100):
 *   achievement    min  56  max  89
 *   benevolence    min  33  max 100
 *   self_direction min  45  max  95
 *   security       min  35  max  76
 *   power          min  45  max  89
 *
 * KNOWN LIMITATION (carried from the dataset, deliberately not hand-corrected):
 *   Entrepreneur is crosswalked to 11-1021.00 (General and Operations Managers), an acknowledged
 *   proxy. That occupation's O*NET Relationships rating yields benevolence
 *   84 rescaled, so a benevolence-led student sees entrepreneurship rank
 *   higher on caring values than the career warrants. The arithmetic is right; the
 *   PROXY is wrong. Re-crosswalking is a separate decision.
 *
 * Source: O*NET 30.0 database, "Work Values.txt", EX scale (874 rated occupations)
 * Generated at: 2026-08-29
 */

import { db } from '../db';
import { careers } from '../../shared/schema';
import { eq } from 'drizzle-orm';

/** The five active CVQ domains. Mirrors CVQ_DOMAINS in shared/schema.ts. */
export interface CareerValuesProfile {
  achievement: number;
  benevolence: number;
  self_direction: number;
  security: number;
  power: number;
}

export interface CareerValuesContent {
  title: string;
  /** O*NET-SOC code the profile was derived from. */
  onetCode: string;
  valuesProfile: CareerValuesProfile;
}

export const CAREER_VALUES_PROFILES: CareerValuesContent[] = [
  {
    title: 'Software Engineer',
    onetCode: '15-1299.08',
    valuesProfile: { achievement: 67, benevolence: 34, self_direction: 66, security: 68, power: 75 },
  },
  {
    title: 'Data Scientist',
    onetCode: '15-2051.01',
    valuesProfile: { achievement: 67, benevolence: 0, self_direction: 0, security: 56, power: 11 },
  },
  {
    title: 'Renewable Energy Engineer',
    onetCode: '17-2199.03',
    valuesProfile: { achievement: 48, benevolence: 25, self_direction: 54, security: 80, power: 50 },
  },
  {
    title: 'Healthcare Professional (Nurse)',
    onetCode: '29-1141.00',
    valuesProfile: { achievement: 48, benevolence: 84, self_direction: 54, security: 95, power: 36 },
  },
  {
    title: 'Digital Marketing Specialist',
    onetCode: '13-1161.00',
    valuesProfile: { achievement: 15, benevolence: 9, self_direction: 10, security: 51, power: 0 },
  },
  {
    title: 'Graphic Designer',
    onetCode: '27-1024.00',
    valuesProfile: { achievement: 67, benevolence: 25, self_direction: 54, security: 46, power: 36 },
  },
  {
    title: 'Mechanical Engineer',
    onetCode: '17-2141.00',
    valuesProfile: { achievement: 48, benevolence: 42, self_direction: 54, security: 73, power: 75 },
  },
  {
    title: 'Financial Analyst',
    onetCode: '13-2099.01',
    valuesProfile: { achievement: 33, benevolence: 34, self_direction: 54, security: 63, power: 50 },
  },
  {
    title: 'Teacher (Secondary Education)',
    onetCode: '25-2031.00',
    valuesProfile: { achievement: 67, benevolence: 100, self_direction: 44, security: 78, power: 11 },
  },
  {
    title: 'Environmental Scientist',
    onetCode: '19-2041.00',
    valuesProfile: { achievement: 33, benevolence: 25, self_direction: 44, security: 44, power: 50 },
  },
  {
    title: 'Civil Engineer',
    onetCode: '17-2051.00',
    valuesProfile: { achievement: 48, benevolence: 25, self_direction: 76, security: 80, power: 61 },
  },
  {
    title: 'Architect',
    onetCode: '17-1011.00',
    valuesProfile: { achievement: 67, benevolence: 18, self_direction: 76, security: 73, power: 75 },
  },
  {
    title: 'Electrical Engineer',
    onetCode: '17-2071.00',
    valuesProfile: { achievement: 67, benevolence: 34, self_direction: 54, security: 73, power: 61 },
  },
  {
    title: 'Biomedical Engineer',
    onetCode: '17-2031.00',
    valuesProfile: { achievement: 48, benevolence: 51, self_direction: 76, security: 83, power: 50 },
  },
  {
    title: 'Pharmacist',
    onetCode: '29-1051.00',
    valuesProfile: { achievement: 15, benevolence: 51, self_direction: 32, security: 78, power: 75 },
  },
  {
    title: 'Doctor (General Practitioner)',
    onetCode: '29-1215.00',
    valuesProfile: { achievement: 100, benevolence: 93, self_direction: 88, security: 98, power: 100 },
  },
  {
    title: 'Dentist',
    onetCode: '29-1021.00',
    valuesProfile: { achievement: 82, benevolence: 75, self_direction: 100, security: 61, power: 75 },
  },
  {
    title: 'Physical Therapist',
    onetCode: '29-1123.00',
    valuesProfile: { achievement: 67, benevolence: 93, self_direction: 54, security: 78, power: 75 },
  },
  {
    title: 'Psychologist',
    onetCode: '19-3033.00',
    valuesProfile: { achievement: 76, benevolence: 96, self_direction: 76, security: 56, power: 61 },
  },
  {
    title: 'Social Worker',
    onetCode: '21-1022.00',
    valuesProfile: { achievement: 67, benevolence: 93, self_direction: 66, security: 78, power: 25 },
  },
  {
    title: 'Lawyer',
    onetCode: '23-1011.00',
    valuesProfile: { achievement: 82, benevolence: 25, self_direction: 76, security: 83, power: 100 },
  },
  {
    title: 'Accountant',
    onetCode: '13-2011.00',
    valuesProfile: { achievement: 33, benevolence: 42, self_direction: 44, security: 61, power: 36 },
  },
  {
    title: 'Human Resources Manager',
    onetCode: '11-3121.00',
    valuesProfile: { achievement: 48, benevolence: 75, self_direction: 44, security: 71, power: 75 },
  },
  {
    title: 'Management Consultant',
    onetCode: '13-1111.00',
    valuesProfile: { achievement: 48, benevolence: 75, self_direction: 54, security: 54, power: 50 },
  },
  {
    title: 'Entrepreneur',
    onetCode: '11-1021.00',
    valuesProfile: { achievement: 48, benevolence: 84, self_direction: 76, security: 90, power: 75 },
  },
  {
    title: 'Sales Manager',
    onetCode: '11-2022.00',
    valuesProfile: { achievement: 48, benevolence: 25, self_direction: 66, security: 95, power: 36 },
  },
  {
    title: 'Marketing Manager',
    onetCode: '11-2021.00',
    valuesProfile: { achievement: 82, benevolence: 67, self_direction: 66, security: 100, power: 61 },
  },
  {
    title: 'Product Manager',
    onetCode: '15-1299.09',
    valuesProfile: { achievement: 82, benevolence: 9, self_direction: 66, security: 46, power: 50 },
  },
  {
    title: 'UX/UI Designer',
    onetCode: '27-1021.00',
    valuesProfile: { achievement: 33, benevolence: 51, self_direction: 32, security: 56, power: 36 },
  },
  {
    title: 'Video Game Designer',
    onetCode: '15-1255.01',
    valuesProfile: { achievement: 82, benevolence: 0, self_direction: 76, security: 54, power: 25 },
  },
  {
    title: 'Journalist',
    onetCode: '27-3023.00',
    valuesProfile: { achievement: 67, benevolence: 46, self_direction: 50, security: 46, power: 68 },
  },
  {
    title: 'Content Creator',
    onetCode: '27-3043.00',
    valuesProfile: { achievement: 33, benevolence: 25, self_direction: 0, security: 46, power: 0 },
  },
  {
    title: 'Photographer',
    onetCode: '27-4021.00',
    valuesProfile: { achievement: 0, benevolence: 42, self_direction: 44, security: 0, power: 0 },
  },
  {
    title: 'Chef',
    onetCode: '35-1011.00',
    valuesProfile: { achievement: 33, benevolence: 42, self_direction: 76, security: 39, power: 61 },
  },
  {
    title: 'Fashion Designer',
    onetCode: '27-1022.00',
    valuesProfile: { achievement: 67, benevolence: 25, self_direction: 54, security: 22, power: 36 },
  },
  {
    title: 'Interior Designer',
    onetCode: '27-1025.00',
    valuesProfile: { achievement: 67, benevolence: 51, self_direction: 66, security: 12, power: 25 },
  },
  {
    title: 'Web Developer',
    onetCode: '15-1254.00',
    valuesProfile: { achievement: 33, benevolence: 25, self_direction: 66, security: 71, power: 50 },
  },
];

/**
 * Backfill values_profile and onet_code onto the careers that already exist.
 *
 * The careers seed loop (server/seed.ts) is INSERT-only - it skips any title that
 * is already present - so adding these fields to the seed array alone would never
 * reach a database that has already been seeded. This is the mechanism that does.
 *
 * Idempotent: a plain UPDATE ... SET to identical values, safe to run on every boot.
 * Scoped strictly to its own two columns and to one career id at a time, so it can
 * never touch another column or another row.
 */
export async function applyCareerValuesProfiles(): Promise<void> {
  console.log('Applying CVQ values profiles for careers...');
  let updated = 0;
  let notFound = 0;

  for (const item of CAREER_VALUES_PROFILES) {
    const results = await db
      .select({ id: careers.id })
      .from(careers)
      .where(eq(careers.title, item.title))
      .limit(1);

    if (results.length === 0) {
      console.warn(`  ⚠ Career not found: "${item.title}"`);
      notFound++;
      continue;
    }

    await db
      .update(careers)
      .set({
        valuesProfile: item.valuesProfile,
        onetCode: item.onetCode,
      })
      .where(eq(careers.id, results[0].id));
    updated++;
  }

  console.log(`Career values profiles: ${updated} updated, ${notFound} not found`);
}
