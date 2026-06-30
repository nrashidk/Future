// backfill_breakdown_apply.cjs — WRITES. Backfills component_breakdown from reasoning, single transaction.
// Same parse + both verify-gates as the dry-run. If ANY row flags during apply, abort + rollback entire tx.
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CHUNK_RE = /^(.+?) \((\d+(?:\.\d+)?)%\): (\d+(?:\.\d+)?)% - (.+)$/;
const LEGACY_KEYS = { subjects: 'subject_match_score', interests: 'interest_match_score', vision: 'country_vision_alignment' };

(async () => {
  const host = new URL(process.env.DATABASE_URL).host;
  console.log('DB host:', host);
  if (!host.includes('ep-floral-rice')) { console.error('ABORT: wrong host.'); process.exit(1); }

  const comp = await pool.query(`SELECT key, name FROM assessment_components`);
  const nameToKey = {};
  comp.rows.forEach(r => { nameToKey[r.name] = r.key; });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const rows = await client.query(`
      SELECT id, career_id, overall_match_score, subject_match_score, interest_match_score,
             country_vision_alignment, reasoning
        FROM recommendations WHERE component_breakdown IS NULL`);
    console.log(`Rows with null breakdown: ${rows.rows.length}`);

    let written = 0;
    for (const r of rows.rows) {
      if (!r.reasoning || !r.reasoning.trim()) throw new Error(`${r.id}: empty reasoning — aborting (did not flag in dry-run)`);
      const chunks = r.reasoning.split(' | ');
      const breakdown = [];
      for (const c of chunks) {
        const m = c.match(CHUNK_RE);
        if (!m) throw new Error(`${r.id}: chunk failed regex "${c.slice(0,60)}" — aborting`);
        const key = nameToKey[m[1]];
        if (!key) throw new Error(`${r.id}: no key for "${m[1]}" — aborting`);
        breakdown.push({ key, displayName: m[1], score: parseFloat(m[3]), weight: parseFloat(m[2]) });
      }
      // Gate 1: derived overall vs stored
      const wsum = breakdown.reduce((s,b)=>s+b.weight,0);
      const derived = wsum > 0 ? breakdown.reduce((s,b)=>s+b.score*b.weight,0)/wsum : 0;
      if (Math.abs(derived - r.overall_match_score) > 0.5)
        throw new Error(`${r.id}: overall mismatch derived ${derived.toFixed(1)} vs ${r.overall_match_score} — aborting`);
      // Gate 2: parsed legacy vs stored columns
      for (const b of breakdown) {
        const col = LEGACY_KEYS[b.key];
        if (col && Math.abs(b.score - r[col]) > 0.15)
          throw new Error(`${r.id}: legacy ${b.key} parsed ${b.score} vs stored ${r[col]} — aborting`);
      }

      const upd = await client.query(
        `UPDATE recommendations SET component_breakdown = $1::jsonb
           WHERE id = $2 AND component_breakdown IS NULL`,
        [JSON.stringify(breakdown), r.id]
      );
      written += upd.rowCount;
    }

    // Final guard: every targeted row should now be non-null.
    const remaining = await client.query(`SELECT count(*)::int n FROM recommendations WHERE component_breakdown IS NULL`);
    console.log(`Written: ${written}. Remaining null after write: ${remaining.rows[0].n}`);
    if (remaining.rows[0].n !== 0) throw new Error(`Expected 0 null remaining, got ${remaining.rows[0].n} — rolling back.`);

    await client.query('COMMIT');
    console.log('COMMITTED. All recommendation rows backfilled.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK — no changes applied:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
