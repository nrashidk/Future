/**
 * CVQ career values-profile generator — O*NET 30.0 Work Values → 5 seeded CVQ domains.
 *
 * DATA-PREP ONLY. This script reads a local O*NET flat file and writes review
 * artifacts to scripts/. It does NOT touch the database, seed.ts, or matching.ts.
 *
 * Input (not in the repo — download, do not hand-edit):
 *   https://www.onetcenter.org/dl_files/database/db_30_0_text.zip  →  "Work Values.txt"
 *   sha256(db_30_0_text.zip) = b7388aadeb3edef2a59fd292ac4e9b72d3e9266c65a136b7b8cc42b23003ce5a
 *
 * Usage:
 *   npx tsx scripts/generate-cvq-values-profiles.ts "<path to Work Values.txt>"
 *
 * Why the flat file and not the API: the O*NET Web Services v2.0 Work Values
 * endpoint returns HTTP 404 (see docs/VALUES_PROFILE_DERIVATION_METHODOLOGY.md §0).
 * The descriptor is frozen, not withdrawn — it still ships in the bulk database
 * (874 occupations, EX scale, analyst-rated 2008, unchanged through 30.0).
 */

import * as fs from 'fs';
import * as path from 'path';
import { CAREER_ONET_CROSSWALK } from './parse-onet-values';

// ---------------------------------------------------------------------------
// 1a. ACCEPTED substitutions — crosswalk codes with NO O*NET work-values data
// ---------------------------------------------------------------------------
// Three of the 37 crosswalk codes are 2018-SOC occupations introduced after the
// Work Values descriptor was frozen, so they are absent from the 874 rated
// occupations. Each is redirected to the nearest-content RATED occupation,
// chosen so it duplicates no other career's code.
//
// STATUS: ACCEPTED (confirmed decision). These are not provisional.
const SUBSTITUTIONS: Record<string, { from: string; to: string; toTitle: string; why: string }> = {
  'Software Engineer': {
    from: '15-1252.00', // Software Developers — no work-values data
    to: '15-1299.08',
    toTitle: 'Computer Systems Engineers/Architects',
    why: 'Design-and-build software/systems work, the closest rated match to Software Developers; Computer Programmers (15-1251.00) is the narrower code-to-spec role.',
  },
  'Financial Analyst': {
    from: '13-2051.00', // Financial and Investment Analysts — no work-values data
    to: '13-2099.01',
    toTitle: 'Financial Quantitative Analysts',
    why: 'Same financial-analysis work under the residual 13-2099 code; the rated occupation nearest to Financial and Investment Analysts.',
  },
  'Product Manager': {
    from: '13-1082.00', // Project Management Specialists — no work-values data
    to: '15-1299.09',
    toTitle: 'Information Technology Project Managers',
    why: 'Project-management content on a technology product; 13-1111.00 (Management Analysts) would duplicate Management Consultant.',
  },
};

// ---------------------------------------------------------------------------
// 1b. CROSSWALK CORRECTIONS — codes that HAVE data but point at the wrong job
// ---------------------------------------------------------------------------
// Distinct from §1a: these codes are rated, so nothing failed loudly. The code
// simply did not denote the occupation the crosswalk comment claimed. Applied
// here rather than in scripts/parse-onet-values.ts so that the original
// crosswalk stays the untouched record of what the DB currently believes.
const CROSSWALK_CORRECTIONS: Record<string, { from: string; fromTitle: string; to: string; toTitle: string; why: string }> = {
  'UX/UI Designer': {
    from: '15-1255.01',
    fromTitle: 'Video Game Designers',
    to: '27-1021.00',
    toTitle: 'Commercial and Industrial Designers',
    why:
      'The crosswalk comment said "Web and Digital Interface Designers", but that is 15-1255.00 — and 15-1255.00 has NO work-values data. 15-1255.01 is Video Game Designers, a different occupation that the Video Game Designer career should hold (see below). ' +
      'Of the rated occupations, 27-1021.00 is the only one whose content is user-centred design: "combine artistic talent with research on product use, marketing, and materials to create the most functional and appealing product design" — the same design-research-then-design process as UX/UI, differing only in medium. ' +
      'Rejected alternatives: 15-1254.00 Web Developers (the SOC-lineage ancestor of 15-1255.00, but it is the code-writing half of the split AND duplicates the Web Developer career); 27-1024.00 Graphic Designers (the aesthetic half, duplicates the Graphic Designer career); 17-2112.01 Human Factors Engineers and Ergonomists (closest on usability research, but engineering-framed and its achievement rating of 89 would make UX/UI Designer one of the most achievement-driven careers in the catalog).',
  },
  'Video Game Designer': {
    from: '27-1014.00',
    fromTitle: 'Special Effects Artists and Animators',
    to: '15-1255.01',
    toTitle: 'Video Game Designers',
    why:
      'O*NET 30.0 has an exact-title rated occupation for this career, 15-1255.01 Video Game Designers. The previous code, 27-1014.00, is Special Effects Artists and Animators — a neighbouring but different craft (VFX/animation production, not game design). ' +
      '15-1255.01 is freed by the UX/UI Designer correction above, so no duplicate is created.',
  },
};

// ---------------------------------------------------------------------------
// 2. O*NET Work Value → CVQ domain map (pure, no blends)
// ---------------------------------------------------------------------------
// Six O*NET work values → the five SEEDED CVQ domains (shared/schema.ts:740).
// Universalism and hedonism are NOT emitted: the CVQ instrument no longer
// measures them, and calculateCvqScore intersects the two key sets, so any
// value written there is silently discarded at match time.
//
//   Achievement        → achievement    (1:1)
//   Recognition        → power          (1:1)
//   Independence       → self_direction (1:1)
//   Relationships      → benevolence    (1:1, FULL — no universalism split)
//   Support         ┐
//   Working Conditions ┘ → security     (arithmetic mean of the two)
//
// Rejected: Recognition split 0.6 power / 0.4 achievement. That blend drives
// achievement and power to near-collinearity across the catalog — two nominal
// domains carrying one signal, wasting two of the five Euclidean dimensions.

/** O*NET EX ("extent") ratings run 1..7, not 0..7. The floor is 1. */
function normalize(v: number): number {
  return ((v - 1) / (7 - 1)) * 100;
}

export interface CvqValuesProfile {
  achievement: number;
  benevolence: number;
  self_direction: number;
  security: number;
  power: number;
}

interface OnetWorkValues {
  achievement: number;
  workingConditions: number;
  recognition: number;
  relationships: number;
  support: number;
  independence: number;
}

function mapToCvq(v: OnetWorkValues): CvqValuesProfile {
  const r = (x: number) => Math.round(Math.min(100, Math.max(0, x)));
  return {
    achievement: r(normalize(v.achievement)),
    benevolence: r(normalize(v.relationships)),
    self_direction: r(normalize(v.independence)),
    security: r((normalize(v.support) + normalize(v.workingConditions)) / 2),
    power: r(normalize(v.recognition)),
  };
}

// ---------------------------------------------------------------------------
// 3. RESCALED normalization — the APPLIED scale (confirmed decision)
// ---------------------------------------------------------------------------
// Each domain is min-max stretched to 0..100 across THIS COUNTRY'S career
// catalog, after the raw O*NET mapping above.
//
// Why rescaled and not raw:
//   - Reports need WITHIN-country consistency, not cross-country comparability.
//     A student's profile is only ever matched against their own country's
//     catalog, so catalog-relative is the frame that matters.
//   - CVQ profiles are curriculum-independent, so the catalog is the only
//     population the scale has to be stable over.
//   - Raw O*NET ratings occupy a narrow band (analysts rarely use the ends of
//     the 1..7 scale), which compresses Euclidean distance and blunts matching.
//   - It passes all three helper-pattern validity probes; raw passes only one.
//
// Accepted costs, stated plainly so nobody is surprised later:
//   1. A rescaled value is a CATALOG RANK POSITION, not an occupational fact.
//      "security = 0" means "lowest security emphasis in this catalog", NOT
//      "this job offers no security". Never surface a raw domain number to a
//      student as though it described the occupation in absolute terms.
//   2. The bounds are catalog-scoped: ADDING OR REMOVING A CAREER CHANGES EVERY
//      OTHER CAREER'S STORED PROFILE. This dataset must be regenerated whole,
//      never edited row-by-row.
//   3. Cross-country divergence is accepted: the same occupation in two
//      countries can hold different profiles. That is by design.
const DOMAINS = ['achievement', 'benevolence', 'self_direction', 'security', 'power'] as const;
type Domain = (typeof DOMAINS)[number];

type Bounds = Record<Domain, { min: number; max: number }>;

function computeBounds(profiles: CvqValuesProfile[]): Bounds {
  return Object.fromEntries(DOMAINS.map(d => {
    const xs = profiles.map(p => p[d]);
    return [d, { min: Math.min(...xs), max: Math.max(...xs) }];
  })) as Bounds;
}

function rescale(profile: CvqValuesProfile, bounds: Bounds): CvqValuesProfile {
  return Object.fromEntries(DOMAINS.map(d => {
    const { min, max } = bounds[d];
    // Degenerate domain (every career identical): keep the midpoint rather than
    // dividing by zero. Cannot happen with real O*NET data; guarded anyway.
    if (max === min) return [d, 50];
    return [d, Math.round(((profile[d] - min) / (max - min)) * 100)];
  })) as unknown as CvqValuesProfile;
}

// ---------------------------------------------------------------------------
// 4. Parse
// ---------------------------------------------------------------------------
const ELEMENT_FIELD: Record<string, keyof OnetWorkValues> = {
  Achievement: 'achievement',
  'Working Conditions': 'workingConditions',
  Recognition: 'recognition',
  Relationships: 'relationships',
  Support: 'support',
  Independence: 'independence',
};

function parseWorkValues(file: string): Map<string, OnetWorkValues> {
  const out = new Map<string, OnetWorkValues>();
  const lines = fs.readFileSync(file, 'utf-8').split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const [code, , elementName, scaleId, dataValue] = line.split('\t');
    if (scaleId !== 'EX') continue; // EX = extent rating; VH = high-point code
    const field = ELEMENT_FIELD[elementName];
    if (!field) continue;
    if (!out.has(code)) {
      out.set(code, {
        achievement: NaN, workingConditions: NaN, recognition: NaN,
        relationships: NaN, support: NaN, independence: NaN,
      });
    }
    out.get(code)![field] = parseFloat(dataValue);
  }
  // Every rated occupation must carry all six values — no partial rows.
  for (const [code, v] of out) {
    const missing = Object.entries(v).filter(([, x]) => Number.isNaN(x)).map(([k]) => k);
    if (missing.length) throw new Error(`${code} missing work values: ${missing.join(', ')}`);
  }
  return out;
}

function parseOccupationTitles(file: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n').slice(1)) {
    const [code, title] = line.split('\t');
    if (code && title) out.set(code, title);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 5. Stats + validity probes (analysis only — nothing here is persisted)
// ---------------------------------------------------------------------------
function sd(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length);
}

function pearson(xs: number[], ys: number[]): number {
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}

/**
 * Mirrors calculateCvqScore (server/services/matching.ts) for the 5 seeded
 * domains. Replicated, not imported — matching.ts is off-limits to this script
 * and the function is not exported. Kept identical so the probe predicts real
 * match behaviour.
 */
export function cvqMatchScore(student: Record<string, number>, career: CvqValuesProfile): number {
  const shared = DOMAINS.filter(d => typeof student[d] === 'number');
  const ss = shared.reduce((acc, d) => acc + (student[d] - career[d]) ** 2, 0);
  const maxDistance = Math.sqrt(shared.length * 100 * 100);
  return Math.max(0, 100 - (Math.sqrt(ss) / maxDistance) * 100);
}

/**
 * Discriminant-validity probes: benevolence-heavy "helper" students.
 *
 * Student CVQ domain scores are ((mean Likert - 1) / 4) * 100 over 3 items
 * (cvq.routes.ts:96-104), so only 25-point steps are reachable: 1→0, 2→25,
 * 3→50, 4→75, 5→100. Every probe below is a real reachable response pattern.
 * PRIMARY is the headline test; the other two are the sensitivity check, because
 * a single hand-picked student is not evidence.
 */
const HELPER_PROBES: Array<{ name: string; short: string; primary?: boolean; scores: Record<Domain, number> }> = [
  {
    name: 'PRIMARY — benevolence 5/5/5, achievement 4, self-direction 4, security 4, power 2',
    short: 'PRIMARY',
    primary: true,
    scores: { benevolence: 100, achievement: 75, self_direction: 75, security: 75, power: 25 },
  },
  {
    name: 'flat-neutral — benevolence 5, everything else 3',
    short: 'flat-neutral',
    scores: { benevolence: 100, achievement: 50, self_direction: 50, security: 50, power: 50 },
  },
  {
    name: 'modest-achievement — benevolence 5, achievement 3, self-direction 4, security 4, power 2',
    short: 'modest-achievement',
    scores: { benevolence: 100, achievement: 50, self_direction: 75, security: 75, power: 25 },
  },
];

const HELPERS = ['Healthcare Professional (Nurse)', 'Social Worker', 'Psychologist'];
const FOILS = ['Photographer', 'Accountant'];

// ---------------------------------------------------------------------------
// 6. Main
// ---------------------------------------------------------------------------
interface Row {
  title: string;
  code: string;
  originalCode: string;
  substituted: boolean;
  corrected: boolean;
  onetTitle: string;
  raw: OnetWorkValues;
  rawProfile: CvqValuesProfile;
  profile: CvqValuesProfile; // rescaled — the applied values
}

function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('usage: npx tsx scripts/generate-cvq-values-profiles.ts "<path to Work Values.txt>"');
    process.exit(1);
  }
  const occTitles = parseOccupationTitles(path.join(path.dirname(input), 'Occupation Data.txt'));
  const wv = parseWorkValues(input);
  console.log(`O*NET occupations with work-values (EX) ratings: ${wv.size}`);

  const careers = Object.entries(CAREER_ONET_CROSSWALK);
  const gaps: string[] = [];
  const staged: Omit<Row, 'profile'>[] = [];

  for (const [title, originalCode] of careers) {
    const sub = SUBSTITUTIONS[title];
    const fix = CROSSWALK_CORRECTIONS[title];
    if (sub && fix) throw new Error(`${title} has both a substitution and a correction — resolve by hand`);
    const code = sub ? sub.to : fix ? fix.to : originalCode;
    if (!wv.has(originalCode)) gaps.push(`${title} (${originalCode})`);
    const raw = wv.get(code);
    if (!raw) throw new Error(`No work-values data for ${title} → ${code}`);
    staged.push({
      title, code, originalCode,
      substituted: Boolean(sub),
      corrected: Boolean(fix),
      onetTitle: sub?.toTitle ?? fix?.toTitle ?? occTitles.get(code) ?? '(title unavailable)',
      raw, rawProfile: mapToCvq(raw),
    });
  }

  // RESCALED is the applied scale — bounds over this catalog only.
  const bounds = computeBounds(staged.map(s => s.rawProfile));
  const rows: Row[] = staged.map(s => ({ ...s, profile: rescale(s.rawProfile, bounds) }));

  console.log(`Careers in crosswalk: ${careers.length}; unresolved before substitution: ${gaps.length}`);
  gaps.forEach(g => console.log(`  gap: ${g}`));
  console.log(`Crosswalk corrections applied: ${Object.keys(CROSSWALK_CORRECTIONS).length}`);

  // duplicate-code guard
  const byCode = new Map<string, string[]>();
  rows.forEach(r => byCode.set(r.code, [...(byCode.get(r.code) ?? []), r.title]));
  const dupes = [...byCode].filter(([, t]) => t.length > 1);
  console.log(dupes.length ? `DUPLICATE CODES: ${JSON.stringify(dupes)}` : 'No duplicate O*NET codes across the 37 careers.');

  // ---- per-domain spread: raw vs applied (rescaled) ----
  interface Spread { domain: Domain; min: number; max: number; range: number; mean: number; sd: number; distinct: number }
  const spreadOf = (pick: (r: Row) => CvqValuesProfile): Spread[] =>
    DOMAINS.map(d => {
      const xs = rows.map(r => pick(r)[d]);
      return {
        domain: d,
        min: Math.min(...xs), max: Math.max(...xs), range: Math.max(...xs) - Math.min(...xs),
        mean: xs.reduce((a, b) => a + b, 0) / xs.length, sd: sd(xs),
        distinct: new Set(xs).size,
      };
    });
  const rawSpread = spreadOf(r => r.rawProfile);
  const appliedSpread = spreadOf(r => r.profile);

  console.log('\nPer-domain spread — RAW (O*NET scale) vs APPLIED (rescaled):');
  console.log('domain           raw:min  max  range     sd |  rescaled:min  max  range     sd  distinct');
  DOMAINS.forEach((d, i) => {
    const a = rawSpread[i], b = appliedSpread[i];
    console.log(
      `${d.padEnd(14)} ${String(a.min).padStart(8)} ${String(a.max).padStart(4)} ${String(a.range).padStart(6)} ${a.sd.toFixed(1).padStart(6)} | ` +
      `${String(b.min).padStart(12)} ${String(b.max).padStart(4)} ${String(b.range).padStart(6)} ${b.sd.toFixed(1).padStart(6)} ${String(b.distinct).padStart(9)}`
    );
  });

  // ---- collinearity: the five domains must carry five signals, not fewer ----
  const pairs: Array<[Domain, Domain, number]> = [];
  for (let i = 0; i < DOMAINS.length; i++) {
    for (let j = i + 1; j < DOMAINS.length; j++) {
      pairs.push([DOMAINS[i], DOMAINS[j], pearson(rows.map(r => r.profile[DOMAINS[i]]), rows.map(r => r.profile[DOMAINS[j]]))]);
    }
  }
  pairs.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));
  console.log('\nInter-domain correlation on the applied profiles (|r| descending):');
  pairs.forEach(([a, b, r]) => console.log(`  ${a} ↔ ${b}: r=${r.toFixed(3)}`));

  // ---- validity probes ----
  function runProbe(student: Record<string, number>, profiles: Array<{ title: string; profile: CvqValuesProfile }>) {
    const ranked = profiles
      .map(r => ({ title: r.title, score: cvqMatchScore(student, r.profile), benevolence: r.profile.benevolence }))
      .sort((a, b) => b.score - a.score);
    const rank = (t: string) => ranked.findIndex(r => r.title === t) + 1;
    const worstHelper = Math.max(...HELPERS.map(rank));
    const bestFoil = Math.min(...FOILS.map(rank));
    return { ranked, rank, worstHelper, bestFoil, pass: worstHelper < bestFoil };
  }

  const rawView = rows.map(r => ({ title: r.title, profile: r.rawProfile }));
  const appliedView = rows.map(r => ({ title: r.title, profile: r.profile }));

  console.log('\nDiscriminant validity — helper students, APPLIED (rescaled) profiles:');
  let primaryProbe: ReturnType<typeof runProbe> | null = null;
  const probeResults = HELPER_PROBES.map(probe => {
    const applied = runProbe(probe.scores, appliedView);
    const raw = runProbe(probe.scores, rawView);
    if (probe.primary) primaryProbe = applied;
    console.log(`\n  ${probe.primary ? '[PRIMARY] ' : ''}${probe.name}`);
    console.log(`    helpers: ${HELPERS.map(h => `${h}=#${applied.rank(h)}`).join(', ')}`);
    console.log(`    foils:   ${FOILS.map(f => `${f}=#${applied.rank(f)}`).join(', ')}`);
    console.log(`    → ${applied.pass ? 'PASS' : 'FAIL'} (rescaled)   |   raw would be ${raw.pass ? 'PASS' : 'FAIL'}`);
    return { probe, applied, raw };
  });
  const allPass = probeResults.every(p => p.applied.pass);
  console.log(`\nHelper-pattern validity, rescaled: ${probeResults.filter(p => p.applied.pass).length}/3 PASS` +
    ` | raw: ${probeResults.filter(p => p.raw.pass).length}/3 PASS`);

  console.log('\nFull ranking under the PRIMARY helper student (applied profiles):');
  primaryProbe!.ranked.forEach((r, i) =>
    console.log(`  ${String(i + 1).padStart(2)}. ${r.title.padEnd(34)} ${r.score.toFixed(1)}  (benevolence ${r.benevolence})`));

  // ---- known limitation: Entrepreneur ----
  const entrepreneur = rows.find(r => r.title === 'Entrepreneur')!;
  const entRank = primaryProbe!.rank('Entrepreneur');
  console.log(`\nKNOWN LIMITATION — Entrepreneur → ${entrepreneur.code} (${entrepreneur.onetTitle}): ` +
    `benevolence raw ${entrepreneur.rawProfile.benevolence} / applied ${entrepreneur.profile.benevolence}, ` +
    `ranks #${entRank}/37 for the PRIMARY helper student. Mapping KEPT for now — flagged, not hidden.`);

  // ---- artifacts ----
  const outDir = path.join(process.cwd(), 'scripts');
  const generatedAt = new Date().toISOString().slice(0, 10);

  const dataset = {
    generatedAt,
    source: 'O*NET 30.0 database, "Work Values.txt", EX scale (874 rated occupations)',
    scale: 'RESCALED — raw (value-1)/(7-1)*100 per O*NET work value, then per-domain min-max rescaled to 0-100 across this country\'s 37-career catalog',
    scaleWarning:
      'A rescaled value is a CATALOG-RELATIVE position, not an occupational fact. security=0 means "lowest security emphasis in this catalog", not "no security". Bounds are catalog-scoped: adding or removing a career changes every other career\'s profile — regenerate whole, never edit a row.',
    domains: DOMAINS,
    rescaleBounds: bounds,
    status: 'PROPOSED — not applied to the database, seed.ts, or matching.ts',
    knownLimitations: [
      {
        career: 'Entrepreneur',
        onetCode: entrepreneur.code,
        onetTitle: entrepreneur.onetTitle,
        issue:
          'Crosswalked to General and Operations Managers, an acknowledged proxy. That occupation\'s O*NET Relationships rating is 6.33, giving benevolence ' +
          `${entrepreneur.rawProfile.benevolence} raw / ${entrepreneur.profile.benevolence} rescaled — so a benevolence-heavy student is told entrepreneurship fits their caring values ` +
          `(ranks #${entRank} of 37 for the PRIMARY helper probe). The rating is accurate for operations managers, who do supervise and develop staff; the PROXY is what is wrong, not the arithmetic.`,
        decision: 'KEPT for now. Flagged, deliberately not hand-authored. Re-crosswalking is a separate decision.',
        producedProfile: entrepreneur.profile,
      },
    ],
    careers: rows.map(r => ({
      title: r.title,
      onetCode: r.code,
      onetTitle: r.onetTitle,
      ...(r.substituted ? { crosswalkCode: r.originalCode, substituted: true } : {}),
      ...(r.corrected ? { crosswalkCode: r.originalCode, corrected: true } : {}),
      ...(r.title === 'Entrepreneur' ? { knownLimitation: true } : {}),
      valuesProfile: r.profile,
      rawProfile: r.rawProfile,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'cvq-values-profiles.proposed.json'), JSON.stringify(dataset, null, 2) + '\n');
  console.log(`\nWrote scripts/cvq-values-profiles.proposed.json (${rows.length} careers, rescaled)`);

  // ---- human-readable summary ----
  const spreadTable = DOMAINS.map((d, i) => {
    const a = rawSpread[i], b = appliedSpread[i];
    return `| \`${d}\` | ${a.min}–${a.max} | ${a.range} | ${a.sd.toFixed(1)} | **${b.min}–${b.max}** | **${b.range}** | **${b.sd.toFixed(1)}** | ${b.distinct}/37 |`;
  }).join('\n');

  const subRows = Object.entries(SUBSTITUTIONS).map(([career, sub]) =>
    `| ${career} | \`${sub.from}\` — ${occTitles.get(sub.from) ?? '?'} *(no data)* | **\`${sub.to}\` — ${sub.toTitle}** | ${sub.why} |`
  ).join('\n');

  const fixRows = Object.entries(CROSSWALK_CORRECTIONS).map(([career, fix]) =>
    `| ${career} | \`${fix.from}\` — ${fix.fromTitle} | **\`${fix.to}\` — ${fix.toTitle}** | ${fix.why} |`
  ).join('\n');

  const profileRows = [...rows]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map(r => {
      const mark = r.substituted ? ' ⚠️sub' : r.corrected ? ' 🔧fix' : '';
      const lim = r.title === 'Entrepreneur' ? ' 🚩' : '';
      return `| ${r.title}${mark}${lim} | \`${r.code}\` | ${r.onetTitle} | ${r.profile.achievement} | ${r.profile.benevolence} | ${r.profile.self_direction} | ${r.profile.security} | ${r.profile.power} | ${r.rawProfile.achievement}/${r.rawProfile.benevolence}/${r.rawProfile.self_direction}/${r.rawProfile.security}/${r.rawProfile.power} |`;
    })
    .join('\n');

  const probeRows = probeResults.map(({ probe, applied, raw }) =>
    `| ${probe.name} | ${HELPERS.map(h => `#${applied.rank(h)}`).join(' / ')} | ${FOILS.map(f => `#${applied.rank(f)}`).join(' / ')} | **${applied.pass ? 'PASS' : 'FAIL'}** | ${raw.pass ? 'PASS' : 'FAIL'} |`
  ).join('\n');

  const rankingRows = primaryProbe!.ranked
    .map((r, i) => `| ${i + 1} | ${r.title}${r.title === 'Entrepreneur' ? ' 🚩' : ''} | ${r.score.toFixed(1)} | ${r.benevolence} |`)
    .join('\n');

  const corrPairs = pairs.map(([a, b, r]) => `| \`${a}\` ↔ \`${b}\` | ${r.toFixed(3)} |`).join('\n');

  const md = `# CVQ career values profiles — PROPOSED (O*NET 30.0 Work Values, RESCALED)

> **STATUS: DATA PREP ONLY — NOT APPLIED.** Nothing here has been written to the
> database, \`server/seed.ts\`, or \`server/services/matching.ts\`.
>
> Regenerate with:
> \`npx tsx scripts/generate-cvq-values-profiles.ts "<path>/Work Values.txt"\`

Generated ${generatedAt}. ${rows.length} careers. Normalization: **RESCALED** (confirmed decision).

## 1. Provenance

| | |
|---|---|
| Source | O*NET 30.0 database (text), file \`Work Values.txt\` |
| URL | \`https://www.onetcenter.org/dl_files/database/db_30_0_text.zip\` |
| sha256 (zip) | \`b7388aadeb3edef2a59fd292ac4e9b72d3e9266c65a136b7b8cc42b23003ce5a\` |
| Rows used | \`Scale ID = EX\` (extent rating). \`VH\` (high-point) rows ignored. |
| Occupations rated | **${wv.size}** of the 1 016 in O*NET 30.0 |
| Careers in crosswalk | **${careers.length}** — matches the ${careers.length} live rows in \`careers\` |
| Duplicate O*NET codes | ${dupes.length === 0 ? '**none**' : JSON.stringify(dupes)} |

The Work Values descriptor is **frozen, not withdrawn** — analyst ratings from 2008,
still shipped in the bulk database. It is unavailable over Web Services v2.0
(\`…/details/work_values\` → HTTP 404), which is why this uses the flat file.

## 2. Normalization: RESCALED (confirmed)

\`\`\`
raw      = (onet_value - 1) / (7 - 1) * 100          # O*NET EX floor is 1, not 0
applied  = (raw - domain_min) / (domain_max - domain_min) * 100   # over these ${rows.length} careers
\`\`\`

**Why rescaled.** Reports need *within-country* consistency, not cross-country
comparability; a student is only ever matched against their own country's catalog.
CVQ profiles are curriculum-independent, so the catalog is the only population the
scale must be stable over. Raw O*NET ratings sit in a narrow band (analysts rarely
use the ends of the 1–7 scale), which compresses Euclidean distance and blunts
matching — see §4. Rescaled passes **all three** helper-pattern probes; raw passes
${probeResults.filter(p => p.raw.pass).length}.

**Accepted costs — read before using a domain number in a report:**

1. A rescaled value is a **catalog rank position, not an occupational fact**.
   \`security = 0\` means *lowest security emphasis in this catalog*, **not** "this
   job offers no security". Do not surface raw domain numbers to students as
   absolute statements about the occupation.
2. Bounds are catalog-scoped: **adding or removing one career rewrites every other
   career's profile.** Regenerate the whole dataset; never edit a row by hand.
3. Cross-country divergence is accepted by design — the same occupation may hold
   different profiles in different countries.

Rescale bounds actually used (raw scale):

| domain | min | max |
|---|---|---|
${DOMAINS.map(d => `| \`${d}\` | ${bounds[d].min} | ${bounds[d].max} |`).join('\n')}

## 3. Crosswalk changes

### 3a. Substitutions — crosswalk code has NO work-values data (ACCEPTED)

Three crosswalk codes are 2018-SOC occupations created after the Work Values
descriptor was frozen, so they are absent from the ${wv.size} rated occupations. Each is
redirected to the nearest rated occupation, chosen to collide with no other
career's code. **Status: accepted.**

| Career | Crosswalk code (no data) | Substitute (has data) | Rationale |
|---|---|---|---|
${subRows}

### 3b. Corrections — code HAS data but denotes the wrong occupation

These failed silently: the code was rated, so nothing errored; it simply was not
the job the crosswalk comment named.

| Career | Was | Now | Rationale |
|---|---|---|---|
${fixRows}

Applied in this generator, not in \`scripts/parse-onet-values.ts\`, so the original
crosswalk stays the untouched record of what the database currently believes.

## 4. Per-domain spread — discrimination under RESCALED

| domain | raw range | raw Δ | raw sd | **applied range** | **applied Δ** | **applied sd** | distinct values |
|---|---|---|---|---|---|---|---|
${spreadTable}

Rescaling does not *invent* discrimination — the ordering is untouched, it is a
monotone per-domain transform. What it does is stop each domain from wasting most
of the 0–100 space: raw spans of ${rawSpread.map(s => s.range).join('/')} become the full 0–100,
so the Euclidean distance that \`calculateCvqScore\` computes actually uses its range.
The \`distinct values\` column is the direct discrimination check: a domain that
collapsed careers onto one another would show few distinct values.

**Honest caveat on that column.** Discrimination is not uniform across domains.
\`${[...appliedSpread].sort((a, b) => a.distinct - b.distinct)[0].domain}\` is the weakest, with only
${[...appliedSpread].sort((a, b) => a.distinct - b.distinct)[0].distinct} distinct levels across ${rows.length} careers, because its raw O*NET span is the
narrowest (${rawSpread.find(r => r.domain === [...appliedSpread].sort((a, b) => a.distinct - b.distinct)[0].domain)!.min}–${rawSpread.find(r => r.domain === [...appliedSpread].sort((a, b) => a.distinct - b.distinct)[0].domain)!.max}) — analysts simply did not spread occupations far apart on it.
Rescaling stretches that span but cannot create levels that were never rated, so
ties remain ties. \`${[...appliedSpread].sort((a, b) => b.distinct - a.distinct)[0].domain}\` is the strongest at ${[...appliedSpread].sort((a, b) => b.distinct - a.distinct)[0].distinct}/${rows.length}.
The five domains are still carrying five distinguishable signals — see the
correlation table below — but a report should not lean on \`${[...appliedSpread].sort((a, b) => a.distinct - b.distinct)[0].domain}\` alone to
separate two careers.

### Inter-domain correlation (applied profiles)

Five domains must carry five signals. Highest \\|r\\| first:

| pair | r |
|---|---|
${corrPairs}

## 5. Validity — three benevolence-heavy "helper" students

Student CVQ scores are \`((mean Likert - 1) / 4) * 100\` over 3 items
(\`cvq.routes.ts:96-104\`), so only 0/25/50/75/100 are reachable. Every probe is a
real reachable response pattern. Ranks are over all ${rows.length} careers using a replica of
\`calculateCvqScore\` (Euclidean distance over the 5 shared domains).

Helpers = Nurse / Social Worker / Psychologist. Foils = Photographer / Accountant.
**PASS** = every helper ranks above every foil.

| Helper student | Helper ranks | Foil ranks | RESCALED (applied) | raw (rejected) |
|---|---|---|---|---|
${probeRows}

**Result: ${probeResults.filter(p => p.applied.pass).length}/3 PASS under rescaled${allPass ? ' — all three helper patterns pass' : ''}.**

Raw passes only ${probeResults.filter(p => p.raw.pass).length}/3, and the failure mechanism is precisely the one rescaling fixes.
Under both secondary patterns Psychologist falls behind Accountant. Compare the two
occupations on the raw scale: Accountant is \`${rows.find(r => r.title === 'Accountant')!.rawProfile.achievement}/${rows.find(r => r.title === 'Accountant')!.rawProfile.benevolence}/${rows.find(r => r.title === 'Accountant')!.rawProfile.self_direction}/${rows.find(r => r.title === 'Accountant')!.rawProfile.security}/${rows.find(r => r.title === 'Accountant')!.rawProfile.power}\` — every domain
bunched in the 60s, including a benevolence of ${rows.find(r => r.title === 'Accountant')!.rawProfile.benevolence} for one of the least
relationship-oriented occupations in the catalog. Against a mid-scale student that
near-central profile is close on *every* axis, while Psychologist
(\`${rows.find(r => r.title === 'Psychologist')!.rawProfile.achievement}/${rows.find(r => r.title === 'Psychologist')!.rawProfile.benevolence}/${rows.find(r => r.title === 'Psychologist')!.rawProfile.self_direction}/${rows.find(r => r.title === 'Psychologist')!.rawProfile.security}/${rows.find(r => r.title === 'Psychologist')!.rawProfile.power}\`) is penalised for its genuinely high achievement and
self-direction. The benevolence gap that the probe is actually testing — 3 points for
Psychologist vs ${100 - rows.find(r => r.title === 'Accountant')!.rawProfile.benevolence} for Accountant — is too compressed to outweigh it. Rescaled,
Accountant's benevolence drops to ${rows.find(r => r.title === 'Accountant')!.profile.benevolence} against Psychologist's ${rows.find(r => r.title === 'Psychologist')!.profile.benevolence}, the intended
signal dominates, and the helper ordering holds.

## 6. 🚩 KNOWN LIMITATION — Entrepreneur (mapping KEPT, flagged not fixed)

**Entrepreneur → \`${entrepreneur.code}\` ${entrepreneur.onetTitle}** — an acknowledged proxy
(\`scripts/onet-crosswalk-corrected.md\`), and the profile it produces is wrong in a way
that matters for the students this product serves.

| | achievement | benevolence | self_direction | security | power |
|---|---|---|---|---|---|
| raw | ${entrepreneur.rawProfile.achievement} | **${entrepreneur.rawProfile.benevolence}** | ${entrepreneur.rawProfile.self_direction} | ${entrepreneur.rawProfile.security} | ${entrepreneur.rawProfile.power} |
| applied (rescaled) | ${entrepreneur.profile.achievement} | **${entrepreneur.profile.benevolence}** | ${entrepreneur.profile.self_direction} | ${entrepreneur.profile.security} | ${entrepreneur.profile.power} |

General and Operations Managers carry an O*NET Relationships rating of **6.33**, because
operations managers really do supervise, coach and develop staff. Entrepreneurs, as
students understand the word, do not necessarily. The consequence is visible in §7:
**Entrepreneur ranks #${entRank} of ${rows.length}** for the PRIMARY helper student — a benevolence-heavy
15-year-old is told entrepreneurship fits their caring values.

**The arithmetic is right; the proxy is wrong.** Decision for now: **KEEP the mapping,
flag it here.** Deliberately *not* hand-authored — inventing a profile would put an
unsourced number in a dataset whose whole claim is that every number traces to O*NET.
Re-crosswalking Entrepreneur is a separate decision.

## 7. Full ranking under the PRIMARY helper student (applied profiles)

| # | Career | CVQ match | benevolence |
|---|---|---|---|
${rankingRows}

## 8. Other flags (not fixed here)

- **Data Scientist → \`15-2051.01\`.** The crosswalk comment says "Data Scientists", but
  in O*NET 30.0 \`15-2051.01\` is **Business Intelligence Analysts**; Data Scientists is
  \`15-2051.00\`, which has *no* work-values data. So this is an undocumented
  substitution that happens to be defensible (BI Analysts is the nearest rated
  occupation to Data Scientists) — but it is not what the comment claims. Left as-is;
  worth folding into §3a explicitly on the next pass.
- All ${rows.length} careers currently have \`onet_code\` NULL and \`values_profile\` NULL in the
  database, so the premium CVQ component (25% of the premium score) returns \`null\`
  for every career today. This dataset is what fills that in — a separate, later step.
- \`security\` is the only non-1:1 mapping rule (mean of Support and Working
  Conditions). It is a judgement call and remains the one mapping decision that has
  never been independently reviewed.

## 9. All ${rows.length} profiles (applied = rescaled; raw shown for traceability)

⚠️sub = O*NET code substituted per §3a · 🔧fix = crosswalk corrected per §3b · 🚩 = known limitation §6

| Career | O*NET code | O*NET occupation | ach | ben | self-dir | sec | pow | raw a/b/s/se/p |
|---|---|---|---|---|---|---|---|---|
${profileRows}
`;
  fs.writeFileSync(path.join(outDir, 'cvq-profiles-proposed.md'), md);
  console.log('Wrote scripts/cvq-profiles-proposed.md');
}

if (process.argv[1] && process.argv[1].endsWith('generate-cvq-values-profiles.ts')) {
  main();
}
