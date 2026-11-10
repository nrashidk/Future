/**
 * THE 72-HOUR PROMISE, AND WHAT MAKES IT ONE.
 *
 * An unclaimed guest assessment holds an unaccompanied minor's name, age,
 * grade, gender and career-personality profile with no account attached, and
 * the privacy policy says it is deleted 72 hours after completion. The
 * deletion itself was already built and tested (guestAssessmentExpiry.ts).
 * What was NOT tested is the thing that makes it happen.
 *
 * THE SWEEP ONLY EVER FIRED FROM POST /api/assessments — guest assessment
 * CREATION. The design note calls that a virtue: "cleanup frequency tracks
 * actual guest traffic." The other half of that sentence is the defect. No
 * traffic means no cleanup, so the deadline depended on a stranger happening
 * to start an assessment. On 2026-11-10 production's last sweep was
 * 2026-10-27 — fourteen days, `lastAttemptFailed: false`, simply never
 * triggered — while /health reported the raw timestamp and a comment beside
 * it called a long gap "fine".
 *
 * So two things are asserted here, and the second is the one that was missing:
 *   - /health REPORTS a stale sweep as a boolean a monitor can act on, rather
 *     than a timestamp a human has to subtract
 *   - /health TRIGGERS the sweep, because it is the one request that arrives
 *     on a schedule whether or not anyone is using the product
 *
 * GS-05 IS THE CASE THAT MATTERS. A timestamp moving proves the trigger ran;
 * only a deleted row proves it did anything. GS-06 is its control — a guest
 * assessment inside the window must survive, or GS-05 would pass against a
 * sweep that deletes everything.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(62)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

async function health() {
  const r = await fetch(`${BASE}/health`);
  const t = await r.text();
  if (t.trimStart().startsWith("<!DOCTYPE")) return { status: r.status, html: true, body: null };
  try { return { status: r.status, html: false, body: JSON.parse(t) }; }
  catch { return { status: r.status, html: false, body: null, raw: t.slice(0, 200) }; }
}

/** Puts the stored status back to a chosen silence, as SQL — never a bound JS Date. */
async function setSweepStatus({ lastRunAt, lastSuccessAt }) {
  const value = JSON.stringify({ lastRunAt, lastSuccessAt, lastDeletedCount: 0, lastError: null });
  await sql(
    `INSERT INTO system_config (key, value) VALUES ('guest_assessment_sweep_status', $1)
     ON CONFLICT (key) DO UPDATE SET value = $1`, [value],
  );
}

const tag = Math.random().toString(36).slice(2, 7);
const PRODUCTION_SILENCE = "2026-10-27T05:23:48.339Z";

/**
 * A guest assessment, completed `hoursAgo` ago. Timestamps written as SQL
 * intervals: PGlite mis-binds a parameterised JS Date, and a fixture written
 * that way reports an expiry that is not real (CLAUDE.md).
 */
async function guestAssessment(label, hoursAgo) {
  const [row] = await sql(
    `INSERT INTO assessments
       (id, user_id, is_guest, guest_session_id, name, age, grade, gender,
        country_id, assessment_type, favorite_subjects, interests,
        current_step, is_completed, completed_at, created_at, updated_at)
     VALUES (gen_random_uuid(), NULL, true, $1, $2, 15, '10', 'male',
             'uae', 'basic', ARRAY['Mathematics','Science','English'],
             ARRAY['Technology'], 9, true,
             NOW() - ($3 || ' hours')::interval,
             NOW() - ($3 || ' hours')::interval,
             NOW() - ($3 || ' hours')::interval)
     RETURNING id`,
    [`gs-${label}-${tag}`, `Guest ${label} ${tag}`, String(hoursAgo)],
  );
  return row.id;
}
const stillThere = async (id) =>
  (await sql(`SELECT 1 FROM assessments WHERE id = $1`, [id])).length === 1;

const made = [];
try {
  // -------------------------------------------------------------------- GS-00
  // The SPA catch-all answers 200 with HTML for any unmatched URL, so a
  // misspelled path would make every case below "pass" on nothing.
  {
    const h = await health();
    rec("GS-00", "/health is real JSON, not the SPA's 200 HTML",
      !h.html && h.body !== null && typeof h.body.guestSweep === "object",
      `HTTP ${h.status} ${h.html ? "HTML" : "json"}`);
  }

  /**
   * SETTLE BEFORE THE FIRST FIXTURE, and this is not padding.
   *
   * GS-00 hit /health, which now fires a sweep in the background. On a FRESH
   * .pgdata there is no stored status, so nothing throttles that sweep — it
   * runs, and writes a fresh timestamp a moment later. Set the stale fixture
   * without waiting and that write lands on top of it, so GS-01, GS-02 and
   * GS-03 all fail against a product that is working. Cost three minutes
   * believing a real regression; the suite passed on a dirty database because
   * an existing status throttled GS-00's sweep away.
   */
  await new Promise((r) => setTimeout(r, 2500));

  // -------------------------------------------------------------------- GS-01
  // EXACTLY THE PRODUCTION STATE: fourteen days, not failing.
  {
    await setSweepStatus({ lastRunAt: PRODUCTION_SILENCE, lastSuccessAt: PRODUCTION_SILENCE });
    const h = await health();
    const gs = h.body?.guestSweep ?? {};
    rec("GS-01", "a fortnight of silence reports stale:true, not merely a date",
      gs.stale === true && gs.lastAttemptFailed === false,
      `stale=${gs.stale} lastAttemptFailed=${gs.lastAttemptFailed} lastRunAt=${gs.lastRunAt}`);
  }

  // -------------------------------------------------------------------- GS-02
  // THE SECOND TRIGGER. Before this, nothing but a new guest assessment could
  // move this timestamp.
  {
    const before = (await health()).body?.guestSweep?.lastRunAt;
    await new Promise((r) => setTimeout(r, 1500));
    const after = (await health()).body?.guestSweep?.lastRunAt;
    rec("GS-02", "hitting /health MOVES lastRunAt — it fires the sweep itself",
      typeof after === "string" && after !== PRODUCTION_SILENCE && after !== before,
      `${String(before).slice(0, 19)} → ${String(after).slice(0, 19)}`);
  }

  // -------------------------------------------------------------------- GS-03
  {
    const gs = (await health()).body?.guestSweep ?? {};
    rec("GS-03", "stale clears once the sweep has actually run", gs.stale === false,
      `stale=${gs.stale}`);
  }

  // -------------------------------------------------------------------- GS-04
  // The throttle still holds, or an uptime monitor pinging every 60 seconds
  // would sweep 1,440 times a day.
  {
    const before = (await health()).body?.guestSweep?.lastRunAt;
    await new Promise((r) => setTimeout(r, 1200));
    const after = (await health()).body?.guestSweep?.lastRunAt;
    rec("GS-04", "the 30-minute throttle holds — a second ping does not re-run",
      after === before, `unchanged=${after === before}`);
  }

  // -------------------------------------------------------------------- GS-05
  // THE POSITIVE CONTROL, and the only case that proves anything was deleted.
  // A moved timestamp says the trigger ran; a missing row says it worked.
  {
    const expired = await guestAssessment("expired", 100); // > 72h
    made.push(expired);
    await setSweepStatus({ lastRunAt: PRODUCTION_SILENCE, lastSuccessAt: PRODUCTION_SILENCE });
    await health();
    await new Promise((r) => setTimeout(r, 2000));
    const present = await stillThere(expired);
    rec("GS-05", "a /health ping DELETES a guest assessment 100 hours old", !present,
      present ? "STILL PRESENT — the trigger moved a timestamp and nothing else" : "row gone");
  }

  // -------------------------------------------------------------------- GS-06
  // THE CONTROL THAT KEEPS GS-05 HONEST. Without it, a sweep that deleted
  // every guest row would pass.
  {
    const fresh = await guestAssessment("fresh", 2); // well inside 72h
    made.push(fresh);
    await setSweepStatus({ lastRunAt: PRODUCTION_SILENCE, lastSuccessAt: PRODUCTION_SILENCE });
    await health();
    await new Promise((r) => setTimeout(r, 2000));
    rec("GS-06", "a 2-hour-old guest assessment SURVIVES the same ping",
      await stillThere(fresh), (await stillThere(fresh)) ? "kept" : "DELETED INSIDE THE WINDOW");
  }

  // -------------------------------------------------------------------- GS-07
  // stale reads lastSUCCESSat. A sweep failing every 30 minutes keeps
  // lastRunAt fresh while deleting nothing, and that state must not read as
  // healthy — it is the one shaped most like success.
  {
    await setSweepStatus({ lastRunAt: new Date().toISOString(), lastSuccessAt: PRODUCTION_SILENCE });
    const gs = (await health()).body?.guestSweep ?? {};
    rec("GS-07", "a fresh ATTEMPT that never succeeded is still stale",
      gs.stale === true,
      `lastRunAt fresh, lastSuccessAt old → stale=${gs.stale}`);
  }
} finally {
  for (const id of made) { try { await sql(`DELETE FROM assessments WHERE id = $1`, [id]); } catch {} }
  try { await sql(`DELETE FROM assessments WHERE guest_session_id LIKE $1`, [`gs-%-${tag}`]); } catch {}
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
