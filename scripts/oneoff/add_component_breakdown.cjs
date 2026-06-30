// add_component_breakdown.cjs — WRITES one DDL statement. Adds nullable jsonb column to recommendations.
const { Pool, neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
neonConfig.webSocketConstructor = ws;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const host = new URL(process.env.DATABASE_URL).host;
  console.log('DB host:', host);
  if (!host.includes('ep-floral-rice')) { console.error('ABORT: wrong host.'); process.exit(1); }

  const client = await pool.connect();
  try {
    // Pre-check: does the column already exist?
    const pre = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='recommendations' AND column_name='component_breakdown'`);
    if (pre.rows.length > 0) {
      console.log('Column component_breakdown already exists — nothing to do.');
      await client.query('ROLLBACK').catch(()=>{});
      return;
    }

    await client.query('BEGIN');
    await client.query(`ALTER TABLE "recommendations" ADD COLUMN "component_breakdown" jsonb`);

    // Verify inside the transaction before committing.
    const post = await client.query(`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_name='recommendations' AND column_name='component_breakdown'`);
    if (post.rows.length !== 1 || post.rows[0].data_type !== 'jsonb' || post.rows[0].is_nullable !== 'YES') {
      throw new Error('Post-check failed: ' + JSON.stringify(post.rows) + ' — rolling back.');
    }
    console.log('Verified column:', JSON.stringify(post.rows[0]));

    await client.query('COMMIT');
    console.log('COMMITTED. component_breakdown added (jsonb, nullable).');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('ROLLED BACK — no changes applied:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
