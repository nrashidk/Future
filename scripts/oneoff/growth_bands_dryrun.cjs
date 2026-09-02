// growth_bands_dryrun.cjs — READ-ONLY. No writes, no transaction, no risk.
//
// Prints the before/after for the O*NET growth-band backfill
// (server/migrations/career-growth-bands.ts) and exits non-zero if anything
// about the catalogue would make that backfill unsafe. Run this and read the
// output BEFORE letting seedDatabase apply the change.
//
// Usage:  node --env-file=.env scripts/oneoff/growth_bands_dryrun.cjs
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Mirrors GROWTH_OUTLOOK_EN in shared/growthBands.ts. A .cjs one-off cannot
// import the TS module; shared/growthBands.test.ts pins the TS side against the
// en locale, and the verify query below re-checks the DB against these strings.
const OUTLOOK = {
  much_faster:    'Excellent — 7%+ growth',
  faster:         'Very Good — 5–6% growth',
  average:        'Good — 3–4% growth',
  slower:         'Moderate — 1–2% growth',
  decline:        'Declining — projected decline',
  not_applicable: 'Depends on venture',
};

const EXPECTED_DECLINE = [
  'Journalist', 'Nuclear Engineer', 'Primary School Teacher', 'Teacher (Secondary Education)',
];

(async () => {
  const host = new URL(process.env.DATABASE_URL).host;
  const endpoint = host.split('.')[0];
  const isProd = host.includes('ep-floral-rice');
  console.log(`DB endpoint: ${endpoint}  |  production: ${isProd}`);
  console.log('MODE: DRY RUN — this script issues SELECTs only.\n');

  const client = await pool.connect();
  let problems = 0;
  try {
    const { rows } = await client.query(
      `SELECT title, onet_code, growth_outlook, onet_growth_band
         FROM careers ORDER BY title`);
    console.log(`careers in DB: ${rows.length}\n`);

    // Load the intended bands straight out of the migration module's source, so
    // the dry run cannot drift from what the backfill will actually write.
    const src = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../server/migrations/career-growth-bands.ts'), 'utf-8');
    const intended = new Map();
    const re = /title: "((?:[^"\\]|\\.)*)",\s*\n\s*onetCode: '([^']+)',\s*\n\s*band: '([a-z_]+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) intended.set(m[1], { onetCode: m[2], band: m[3] });
    console.log(`bands parsed from career-growth-bands.ts: ${intended.size}\n`);

    const missing = rows.filter(r => !intended.has(r.title)).map(r => r.title);
    const extra = [...intended.keys()].filter(t => !rows.some(r => r.title === t));
    if (missing.length) { console.error(`✗ in DB but not in the band table: ${JSON.stringify(missing)}`); problems++; }
    if (extra.length)   { console.error(`✗ in the band table but not in DB: ${JSON.stringify(extra)}`); problems++; }

    console.log('title                                  | band            | growth_outlook  BEFORE -> AFTER');
    console.log('-'.repeat(120));
    let changing = 0;
    for (const r of rows) {
      const want = intended.get(r.title);
      if (!want) continue;
      const after = OUTLOOK[want.band];
      const changed = r.growth_outlook !== after;
      if (changed) changing++;
      if (want.band !== 'not_applicable' && !r.onet_code) {
        console.error(`✗ ${r.title}: band claimed but onet_code is NULL`); problems++;
      }
      console.log(
        `${r.title.padEnd(38)} | ${want.band.padEnd(15)} | ${JSON.stringify(r.growth_outlook)} -> ${JSON.stringify(after)}${changed ? '  *' : ''}`);
    }
    console.log('-'.repeat(120));
    console.log(`\nrows whose growth_outlook would change: ${changing} of ${rows.length}`);

    const declining = [...intended.entries()].filter(([, v]) => v.band === 'decline').map(([t]) => t).sort();
    console.log(`\ndecline-band careers: ${JSON.stringify(declining)}`);
    if (JSON.stringify(declining) !== JSON.stringify([...EXPECTED_DECLINE].sort())) {
      console.error(`✗ decline set is not the reviewed four — a human must approve this before it runs.`);
      problems++;
    } else {
      console.log('✓ decline set matches the four reviewed careers.');
    }

    console.log(problems === 0
      ? '\n✓ DRY RUN CLEAN — safe to apply.'
      : `\n✗ ${problems} problem(s) — DO NOT APPLY.`);
    process.exitCode = problems === 0 ? 0 : 1;
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
