/**
 * Migration: Populate CVQ values profiles and O*NET codes for all 68 careers.
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
 * was min-max rescaled to 0-100 across THIS country's 68-career catalog, so
 * `security: 0` means "lowest security emphasis among these 68 careers", not
 * "this job has no security". Two careers 40 points apart are ranked, not measured.
 *
 * The bounds are catalog-scoped, which makes the whole table interdependent:
 * ADDING OR REMOVING ANY CAREER INVALIDATES ALL 68 PROFILES. When the catalog
 * changes, REGENERATE THE WHOLE FILE via scripts/generate-cvq-values-profiles.ts -
 * NEVER EDIT A ROW. Hand-editing one career silently desynchronises it from the
 * rescale bounds every other career was computed against.
 *
 * PHASE 3 STAGE 1 REGENERATION (this file): the catalog went 37 -> 68 careers
 * (docs/career-sourcing-map.md section 5; docs/phase3-stage1-done.md). Four of the
 * ten rescale bounds moved, so ALL 37 pre-existing profiles were rewritten - mean
 * shift 6.5 points, max 18. No raw O*NET value changed; only the catalog-relative
 * frame did. That is the SCALE WARNING above behaving exactly as documented.
 *
 * Rescale bounds used for this generation (raw O*NET EX-scale -> 0-100):
 *   achievement    min  50  max  89
 *   benevolence    min  22  max 100
 *   self_direction min  45  max  95
 *   security       min  35  max  85
 *   power          min  39  max  89
 *
 * KNOWN LIMITATION (carried from the dataset, deliberately not hand-corrected):
 *   Entrepreneur is crosswalked to 11-1021.00 (General and Operations Managers), an acknowledged
 *   proxy. That occupation's O*NET Relationships rating yields benevolence
 *   86 rescaled, so a benevolence-led student sees entrepreneurship rank
 *   higher on caring values than the career warrants. The arithmetic is right; the
 *   PROXY is wrong. Re-crosswalking is a separate decision.
 *
 * Source: O*NET 30.0 database, "Work Values.txt", EX scale (874 rated occupations)
 * Generated at: 2026-09-02
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
    title: "Software Engineer",
    onetCode: '15-1299.08',
    valuesProfile: { achievement: 72, benevolence: 44, self_direction: 66, security: 56, power: 78 },
  },
  {
    title: "Data Scientist",
    onetCode: '15-2051.01',
    valuesProfile: { achievement: 72, benevolence: 14, self_direction: 0, security: 46, power: 22 },
  },
  {
    title: "Renewable Energy Engineer",
    onetCode: '17-2199.03',
    valuesProfile: { achievement: 56, benevolence: 36, self_direction: 54, security: 66, power: 56 },
  },
  {
    title: "Healthcare Professional (Nurse)",
    onetCode: '29-1141.00',
    valuesProfile: { achievement: 56, benevolence: 86, self_direction: 54, security: 78, power: 44 },
  },
  {
    title: "Digital Marketing Specialist",
    onetCode: '13-1161.00',
    valuesProfile: { achievement: 28, benevolence: 22, self_direction: 10, security: 42, power: 12 },
  },
  {
    title: "Graphic Designer",
    onetCode: '27-1024.00',
    valuesProfile: { achievement: 72, benevolence: 36, self_direction: 54, security: 38, power: 44 },
  },
  {
    title: "Mechanical Engineer",
    onetCode: '17-2141.00',
    valuesProfile: { achievement: 56, benevolence: 50, self_direction: 54, security: 60, power: 78 },
  },
  {
    title: "Financial Analyst",
    onetCode: '13-2099.01',
    valuesProfile: { achievement: 44, benevolence: 44, self_direction: 54, security: 52, power: 56 },
  },
  {
    title: "Teacher (Secondary Education)",
    onetCode: '25-2031.00',
    valuesProfile: { achievement: 72, benevolence: 100, self_direction: 44, security: 64, power: 22 },
  },
  {
    title: "Environmental Scientist",
    onetCode: '19-2041.00',
    valuesProfile: { achievement: 44, benevolence: 36, self_direction: 44, security: 36, power: 56 },
  },
  {
    title: "Civil Engineer",
    onetCode: '17-2051.00',
    valuesProfile: { achievement: 56, benevolence: 36, self_direction: 76, security: 66, power: 66 },
  },
  {
    title: "Architect",
    onetCode: '17-1011.00',
    valuesProfile: { achievement: 72, benevolence: 29, self_direction: 76, security: 60, power: 78 },
  },
  {
    title: "Electrical Engineer",
    onetCode: '17-2071.00',
    valuesProfile: { achievement: 72, benevolence: 44, self_direction: 54, security: 60, power: 66 },
  },
  {
    title: "Biomedical Engineer",
    onetCode: '17-2031.00',
    valuesProfile: { achievement: 56, benevolence: 58, self_direction: 76, security: 68, power: 56 },
  },
  {
    title: "Pharmacist",
    onetCode: '29-1051.00',
    valuesProfile: { achievement: 28, benevolence: 58, self_direction: 32, security: 64, power: 78 },
  },
  {
    title: "Doctor (General Practitioner)",
    onetCode: '29-1215.00',
    valuesProfile: { achievement: 100, benevolence: 94, self_direction: 88, security: 80, power: 100 },
  },
  {
    title: "Dentist",
    onetCode: '29-1021.00',
    valuesProfile: { achievement: 85, benevolence: 78, self_direction: 100, security: 50, power: 78 },
  },
  {
    title: "Physical Therapist",
    onetCode: '29-1123.00',
    valuesProfile: { achievement: 72, benevolence: 94, self_direction: 54, security: 64, power: 78 },
  },
  {
    title: "Psychologist",
    onetCode: '19-3033.00',
    valuesProfile: { achievement: 79, benevolence: 96, self_direction: 76, security: 46, power: 66 },
  },
  {
    title: "Social Worker",
    onetCode: '21-1022.00',
    valuesProfile: { achievement: 72, benevolence: 94, self_direction: 66, security: 64, power: 34 },
  },
  {
    title: "Lawyer",
    onetCode: '23-1011.00',
    valuesProfile: { achievement: 85, benevolence: 36, self_direction: 76, security: 68, power: 100 },
  },
  {
    title: "Accountant",
    onetCode: '13-2011.00',
    valuesProfile: { achievement: 44, benevolence: 50, self_direction: 44, security: 50, power: 44 },
  },
  {
    title: "Human Resources Manager",
    onetCode: '11-3121.00',
    valuesProfile: { achievement: 56, benevolence: 78, self_direction: 44, security: 58, power: 78 },
  },
  {
    title: "Management Consultant",
    onetCode: '13-1111.00',
    valuesProfile: { achievement: 56, benevolence: 78, self_direction: 54, security: 44, power: 56 },
  },
  {
    title: "Entrepreneur",
    onetCode: '11-1021.00',
    valuesProfile: { achievement: 56, benevolence: 86, self_direction: 76, security: 74, power: 78 },
  },
  {
    title: "Sales Manager",
    onetCode: '11-2022.00',
    valuesProfile: { achievement: 56, benevolence: 36, self_direction: 66, security: 78, power: 44 },
  },
  {
    title: "Marketing Manager",
    onetCode: '11-2021.00',
    valuesProfile: { achievement: 85, benevolence: 72, self_direction: 66, security: 82, power: 66 },
  },
  {
    title: "Product Manager",
    onetCode: '15-1299.09',
    valuesProfile: { achievement: 85, benevolence: 22, self_direction: 66, security: 38, power: 56 },
  },
  {
    title: "UX/UI Designer",
    onetCode: '27-1021.00',
    valuesProfile: { achievement: 44, benevolence: 58, self_direction: 32, security: 46, power: 44 },
  },
  {
    title: "Video Game Designer",
    onetCode: '15-1255.01',
    valuesProfile: { achievement: 85, benevolence: 14, self_direction: 76, security: 44, power: 34 },
  },
  {
    title: "Journalist",
    onetCode: '27-3023.00',
    valuesProfile: { achievement: 72, benevolence: 54, self_direction: 50, security: 38, power: 72 },
  },
  {
    title: "Content Creator",
    onetCode: '27-3043.00',
    valuesProfile: { achievement: 44, benevolence: 36, self_direction: 0, security: 38, power: 12 },
  },
  {
    title: "Photographer",
    onetCode: '27-4021.00',
    valuesProfile: { achievement: 15, benevolence: 50, self_direction: 44, security: 0, power: 12 },
  },
  {
    title: "Chef",
    onetCode: '35-1011.00',
    valuesProfile: { achievement: 44, benevolence: 50, self_direction: 76, security: 32, power: 66 },
  },
  {
    title: "Fashion Designer",
    onetCode: '27-1022.00',
    valuesProfile: { achievement: 72, benevolence: 36, self_direction: 54, security: 18, power: 44 },
  },
  {
    title: "Interior Designer",
    onetCode: '27-1025.00',
    valuesProfile: { achievement: 72, benevolence: 58, self_direction: 66, security: 10, power: 34 },
  },
  {
    title: "Web Developer",
    onetCode: '15-1254.00',
    valuesProfile: { achievement: 44, benevolence: 36, self_direction: 66, security: 58, power: 56 },
  },
  {
    title: "Aerospace Engineer",
    onetCode: '17-2011.00',
    valuesProfile: { achievement: 44, benevolence: 44, self_direction: 54, security: 72, power: 66 },
  },
  {
    title: "Space Scientist (Astrophysicist)",
    onetCode: '19-2011.00',
    valuesProfile: { achievement: 85, benevolence: 0, self_direction: 66, security: 28, power: 78 },
  },
  {
    title: "Cybersecurity Analyst",
    onetCode: '15-1212.00',
    valuesProfile: { achievement: 28, benevolence: 44, self_direction: 54, security: 80, power: 34 },
  },
  {
    title: "AI Research Scientist",
    onetCode: '15-1221.00',
    valuesProfile: { achievement: 72, benevolence: 29, self_direction: 54, security: 70, power: 66 },
  },
  {
    title: "Robotics Engineer",
    onetCode: '17-2199.08',
    valuesProfile: { achievement: 56, benevolence: 22, self_direction: 66, security: 74, power: 56 },
  },
  {
    title: "Nuclear Engineer",
    onetCode: '17-2161.00',
    valuesProfile: { achievement: 72, benevolence: 0, self_direction: 44, security: 72, power: 78 },
  },
  {
    title: "Chemical Engineer",
    onetCode: '17-2041.00',
    valuesProfile: { achievement: 56, benevolence: 36, self_direction: 54, security: 52, power: 78 },
  },
  {
    title: "Risk & Compliance Officer",
    onetCode: '13-1041.00',
    valuesProfile: { achievement: 0, benevolence: 58, self_direction: 32, security: 42, power: 0 },
  },
  {
    title: "Geneticist",
    onetCode: '19-1029.03',
    valuesProfile: { achievement: 72, benevolence: 29, self_direction: 66, security: 42, power: 88 },
  },
  {
    title: "Health Informatics Specialist",
    onetCode: '15-1211.01',
    valuesProfile: { achievement: 44, benevolence: 50, self_direction: 44, security: 56, power: 44 },
  },
  {
    title: "Hospitality Manager",
    onetCode: '11-9081.00',
    valuesProfile: { achievement: 44, benevolence: 100, self_direction: 76, security: 32, power: 34 },
  },
  {
    title: "Tourism & Events Manager",
    onetCode: '13-1121.00',
    valuesProfile: { achievement: 44, benevolence: 86, self_direction: 54, security: 32, power: 56 },
  },
  {
    title: "Airline Pilot",
    onetCode: '53-2011.00',
    valuesProfile: { achievement: 72, benevolence: 58, self_direction: 88, security: 100, power: 78 },
  },
  {
    title: "Agricultural Scientist (Agronomist)",
    onetCode: '19-1013.00',
    valuesProfile: { achievement: 85, benevolence: 36, self_direction: 66, security: 36, power: 66 },
  },
  {
    title: "Food Technologist",
    onetCode: '19-1012.00',
    valuesProfile: { achievement: 44, benevolence: 44, self_direction: 22, security: 56, power: 44 },
  },
  {
    title: "Agricultural Engineer",
    onetCode: '17-2021.00',
    valuesProfile: { achievement: 56, benevolence: 22, self_direction: 66, security: 52, power: 44 },
  },
  {
    title: "Satellite & Remote Sensing Scientist",
    onetCode: '19-2099.01',
    valuesProfile: { achievement: 72, benevolence: 36, self_direction: 54, security: 52, power: 66 },
  },
  {
    title: "Film & TV Producer",
    onetCode: '27-2012.00',
    valuesProfile: { achievement: 79, benevolence: 62, self_direction: 88, security: 28, power: 88 },
  },
  {
    title: "Data Engineer",
    onetCode: '15-1243.00',
    valuesProfile: { achievement: 85, benevolence: 8, self_direction: 54, security: 46, power: 34 },
  },
  {
    title: "Atmospheric & Space Scientist",
    onetCode: '19-2021.00',
    valuesProfile: { achievement: 56, benevolence: 58, self_direction: 44, security: 30, power: 44 },
  },
  {
    title: "Physicist",
    onetCode: '19-2012.00',
    valuesProfile: { achievement: 85, benevolence: 8, self_direction: 76, security: 60, power: 100 },
  },
  {
    title: "Environmental Engineer",
    onetCode: '17-2081.00',
    valuesProfile: { achievement: 72, benevolence: 44, self_direction: 44, security: 64, power: 78 },
  },
  {
    title: "Actuary",
    onetCode: '15-2011.00',
    valuesProfile: { achievement: 28, benevolence: 29, self_direction: 32, security: 52, power: 34 },
  },
  {
    title: "Investment & Financial Manager",
    onetCode: '11-3031.00',
    valuesProfile: { achievement: 56, benevolence: 58, self_direction: 76, security: 80, power: 78 },
  },
  {
    title: "Primary School Teacher",
    onetCode: '25-2021.00',
    valuesProfile: { achievement: 72, benevolence: 86, self_direction: 54, security: 64, power: 34 },
  },
  {
    title: "School Counsellor & Career Advisor",
    onetCode: '21-1012.00',
    valuesProfile: { achievement: 56, benevolence: 100, self_direction: 32, security: 42, power: 44 },
  },
  {
    title: "Curriculum & Instructional Designer",
    onetCode: '25-9031.00',
    valuesProfile: { achievement: 72, benevolence: 78, self_direction: 76, security: 28, power: 44 },
  },
  {
    title: "Cloud & Network Architect",
    onetCode: '15-1241.00',
    valuesProfile: { achievement: 85, benevolence: 8, self_direction: 54, security: 58, power: 34 },
  },
  {
    title: "Industrial Engineer",
    onetCode: '17-2112.00',
    valuesProfile: { achievement: 56, benevolence: 29, self_direction: 66, security: 68, power: 78 },
  },
  {
    title: "Video Editor",
    onetCode: '27-4032.00',
    valuesProfile: { achievement: 44, benevolence: 8, self_direction: 54, security: 16, power: 56 },
  },
  {
    title: "Dietitian & Nutritionist",
    onetCode: '29-1031.00',
    valuesProfile: { achievement: 44, benevolence: 78, self_direction: 66, security: 42, power: 56 },
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
