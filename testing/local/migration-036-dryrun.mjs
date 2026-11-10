/**
 * MIGRATION 036 — EXECUTED, NOT READ.
 *
 * `schema-push.mjs` builds the schema from the drizzle definitions and marks
 * every migration applied WITHOUT RUNNING IT, so no .sql file in
 * server/migrations/ is ever executed by the harness. A syntax error first
 * runs at PRODUCTION BOOT, where the runner treats a failure as fatal and
 * Render has already deployed.
 *
 * 036 ALTERs an existing table rather than creating one, which changes what is
 * worth asserting. The risk in an additive migration is not that it fails — it
 * is that it quietly does more than it claims, or that its one constraint is
 * absent and every surface downstream passes against nothing.
 *
 *   M-01  the UP runs at all, from the file on disk
 *   M-02  it adds exactly the four intended columns, all NULLABLE with no
 *         default. Null means UNKNOWN, not failed: an unconfigured webhook, an
 *         unset secret and Resend being down all produce nulls, and a default
 *         of 'sent' would turn every one of those into a confident claim
 *   M-03  provider_message_id is UNIQUE. That constraint is what makes a Svix
 *         redelivery a no-op instead of a second row, and without it every
 *         assertion in resend-webhook.mjs would still pass
 *   M-04  the unique index is PARTIAL. Every token minted-but-not-yet-sent has
 *         a null here, and so does every row issued before this migration —
 *         many nulls must coexist
 *   M-05  THE ADDITIVE CLAIM, verified rather than asserted: the nine columns
 *         035 created are untouched, and existing ROWS survive with their
 *         values intact. An ALTER that rewrote data would be silent
 *   M-06  running the UP twice is harmless — a restored database, a re-pointed
 *         environment, a hand-run catch-up
 *   M-07  the DOWN in the comment block actually works. It is written for a
 *         human to paste, so nothing else ever checks it
 *   M-08  the UP works again after the DOWN: reversible both ways
 *
 * RUN THIS AFTER migration-035-dryrun, not before. That suite ends by
 * re-running 035's UP, which leaves the table without these four columns —
 * so a 035 run followed by anything that reads delivery status will fail for
 * that reason and not a real one. This suite leaves the columns in place.
 */
import { readFileSync } from "fs";
import { randomBytes } from "crypto";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(62)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const FILE = "server/migrations/036_setup_token_delivery.sql";
const raw = readFileSync(FILE, "utf8");

// Parsed from the file rather than retyped: a copy would drift silently, and
// the file is what production runs.
const marker = "-- DOWN (manual, not run by the runner):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN block to test`);
const upSql = raw.slice(0, idx);
const downSql = raw
  .slice(idx + marker.length)
  .split("\n")
  .map((l) => l.replace(/^--\s{0,3}/, "").trim())
  .filter((l) => l.length > 0 && !l.startsWith("--"))
  .join("\n");

const T = "school_setup_tokens";
const NEW = ["delivery_detail", "delivery_status", "delivery_status_at", "provider_message_id"];
const OLD = ["created_at", "expires_at", "id", "organization_id",
             "sent_at", "sent_count", "token", "used_at", "user_id"];

const columns = () =>
  sql(`SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_name = '${T}' ORDER BY column_name`);
const indexDefs = () =>
  sql(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '${T}' ORDER BY indexname`);

// Start from the state 035 leaves: the table without these columns. Dropping
// them is how this suite proves the FILE adds them, rather than reading what
// schema-push already built from the drizzle definitions.
await sql(`ALTER TABLE ${T}
             DROP COLUMN IF EXISTS delivery_detail,
             DROP COLUMN IF EXISTS delivery_status_at,
             DROP COLUMN IF EXISTS delivery_status,
             DROP COLUMN IF EXISTS provider_message_id`);

const tag = randomBytes(4).toString("hex");
const [u] = await sql(
  `INSERT INTO users (id, username, email, account_type, password_hash)
   VALUES (gen_random_uuid(), $1, $2, 'individual', '$2b$10$notarealhashbutnotnull') RETURNING id`,
  [`m036${tag}`, `m036.${tag}@futurepath.test`],
);

// A row that EXISTS BEFORE the migration, so M-05 can prove the ALTER left
// real data alone rather than merely leaving a column list alone. Timestamps
// as SQL intervals, never a bound JS Date — PGlite mis-binds those.
const preToken = `pre_${tag}`;
await sql(
  `INSERT INTO ${T} (user_id, token, expires_at, sent_at, sent_count)
   VALUES ($1, $2, NOW() + INTERVAL '7 days', NOW() - INTERVAL '2 hours', 3)`,
  [u.id, preToken],
);

try {
  // -------------------------------------------------------------------- M-01
  let upError = null;
  try { await sql(upSql); } catch (e) { upError = e; }
  rec("M-01", "the UP runs from the file on disk", upError === null,
    upError ? String(upError.message).slice(0, 90) : "no error");

  // -------------------------------------------------------------------- M-02
  {
    const cols = await columns();
    const added = cols.filter((c) => NEW.includes(c.column_name));
    const allNullableNoDefault = added.every(
      (c) => c.is_nullable === "YES" && (c.column_default === null || c.column_default === undefined),
    );
    rec("M-02", "exactly four columns, all NULLABLE with no default",
      added.length === 4 && allNullableNoDefault,
      added.map((c) => `${c.column_name}:${c.is_nullable}/${c.column_default ?? "none"}`).join(" "));
  }

  // -------------------------------------------------------------------- M-03
  // Judged by whether a DUPLICATE IS ACTUALLY REFUSED, not by reading
  // pg_index: a constraint that exists but does not fire is the same as none.
  {
    const dup = `msg_dup_${tag}`;
    await sql(`INSERT INTO ${T} (user_id, token, expires_at, provider_message_id)
               VALUES ($1, $2, NOW() + INTERVAL '7 days', $3)`, [u.id, `d1_${tag}`, dup]);
    let refused = false;
    try {
      await sql(`INSERT INTO ${T} (user_id, token, expires_at, provider_message_id)
                 VALUES ($1, $2, NOW() + INTERVAL '7 days', $3)`, [u.id, `d2_${tag}`, dup]);
    } catch (e) { refused = String(e.code) === "23505"; }
    rec("M-03", "a SECOND row with the same provider_message_id is refused", refused,
      refused ? "23505 unique_violation" : "DUPLICATE ACCEPTED");
  }

  // -------------------------------------------------------------------- M-04
  // Partial, or every unsent token would collide with every other unsent one.
  {
    let bothInserted = false;
    try {
      await sql(`INSERT INTO ${T} (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [u.id, `n1_${tag}`]);
      await sql(`INSERT INTO ${T} (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
        [u.id, `n2_${tag}`]);
      bothInserted = true;
    } catch { bothInserted = false; }
    const def = (await indexDefs()).find((i) => i.indexname === "school_setup_tokens_provider_msg_idx");
    rec("M-04", "MANY rows may have a null provider_message_id (partial index)",
      bothInserted && /WHERE .*provider_message_id IS NOT NULL/i.test(def?.indexdef ?? ""),
      `two nulls accepted=${bothInserted} partial=${/WHERE/i.test(def?.indexdef ?? "")}`);
  }

  // -------------------------------------------------------------------- M-05
  // THE ADDITIVE CLAIM. A column list surviving is weaker than a ROW surviving
  // with its values: an ALTER that rewrote data would pass the first and fail
  // this one.
  {
    const cols = (await columns()).map((c) => c.column_name);
    const oldIntact = OLD.every((c) => cols.includes(c));
    const [row] = await sql(
      `SELECT sent_count, used_at, delivery_status,
              (sent_at < NOW() - INTERVAL '1 hour') AS sent_at_preserved
         FROM ${T} WHERE token = $1`, [preToken]);
    rec("M-05", "pre-existing rows survive with their values; nothing backfilled",
      oldIntact && row?.sent_count === 3 && row?.used_at === null
        && row?.sent_at_preserved === true && row?.delivery_status === null,
      `nine old cols=${oldIntact} sent_count=${row?.sent_count} sent_at kept=${row?.sent_at_preserved} status=${row?.delivery_status}`);
  }

  // -------------------------------------------------------------------- M-06
  {
    let reError = null;
    try { await sql(upSql); } catch (e) { reError = e; }
    const n = (await columns()).filter((c) => NEW.includes(c.column_name)).length;
    rec("M-06", "running the UP a second time is harmless", reError === null && n === 4,
      reError ? String(reError.message).slice(0, 80) : `no error, ${n} new columns`);
  }

  // -------------------------------------------------------------------- M-07
  {
    let downError = null;
    try { await sql(downSql); } catch (e) { downError = e; }
    const left = (await columns()).filter((c) => NEW.includes(c.column_name)).length;
    const idxGone = !(await indexDefs()).some((i) => i.indexname === "school_setup_tokens_provider_msg_idx");
    rec("M-07", "the DOWN from the comment block rolls back columns AND index",
      downError === null && left === 0 && idxGone,
      downError ? String(downError.message).slice(0, 80) : `columns left=${left} index gone=${idxGone}`);
  }

  // -------------------------------------------------------------------- M-08
  {
    let reupError = null;
    try { await sql(upSql); } catch (e) { reupError = e; }
    const n = (await columns()).filter((c) => NEW.includes(c.column_name)).length;
    const hasIdx = (await indexDefs()).some((i) => i.indexname === "school_setup_tokens_provider_msg_idx");
    rec("M-08", "the UP works again after the DOWN — reversible both ways",
      reupError === null && n === 4 && hasIdx,
      reupError ? String(reupError.message).slice(0, 80) : `${n} columns, index back=${hasIdx}`);
  }
} finally {
  // Leaves the four columns in place; removes only this suite's own rows.
  await sql(`DELETE FROM ${T} WHERE user_id = $1`, [u.id]).catch(() => {});
  await sql(`DELETE FROM users WHERE id = $1`, [u.id]).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
