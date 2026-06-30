// cvq_reset_apply.cjs — WRITES. Transactional CVQ reset to 5-domain / 15-item.
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEED = [
  ['CVQ-A1','achievement',1],['CVQ-A2','achievement',2],['CVQ-A3','achievement',3],
  ['CVQ-B1','benevolence',1],['CVQ-B2','benevolence',2],['CVQ-B3','benevolence',3],
  ['CVQ-SD1','self_direction',1],['CVQ-SD2','self_direction',2],['CVQ-SD3','self_direction',3],
  ['CVQ-SE1','security',1],['CVQ-SE2','security',2],['CVQ-SE3','security',3],
  ['CVQ-P1','power',1],['CVQ-P2','power',2],['CVQ-P3','power',3],
];

(async () => {
  const host = new URL(process.env.DATABASE_URL).host;
  console.log('DB host:', host);
  if (!host.includes('ep-floral-rice')) { console.error('ABORT: wrong host.'); process.exit(1); }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(`SELECT count(*)::int n FROM cvq_items`);
    console.log(`cvq_items before: ${before.rows[0].n}`);

    const delRes = await client.query(`DELETE FROM cvq_results`);
    console.log(`cvq_results deleted: ${delRes.rowCount}`);

    const nullRes = await client.query(`UPDATE assessments SET cvq_scores = NULL WHERE cvq_scores IS NOT NULL`);
    console.log(`assessments cvq_scores nulled: ${nullRes.rowCount}`);

    // Re-seed cvq_items: only the 15 IDs in SEED survive; drop everything else.
    const keepIds = SEED.map(s => s[0]);
    const dropRes = await client.query(
      `DELETE FROM cvq_items WHERE id <> ALL($1::text[])`, [keepIds]
    );
    console.log(`cvq_items removed (retired domains): ${dropRes.rowCount}`);

    const after = await client.query(`SELECT count(*)::int n FROM cvq_items`);
    console.log(`cvq_items after: ${after.rows[0].n}`);

    if (after.rows[0].n !== 15) {
      throw new Error(`Expected 15 cvq_items after reset, got ${after.rows[0].n} — rolling back.`);
    }

    await client.query('COMMIT');
    console.log('\nCOMMITTED. Reset complete.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK — no changes applied:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
