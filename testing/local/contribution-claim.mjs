/**
 * AN APPROVED SUBMISSION'S REWARD IS GIVEN ONCE.
 *
 * `POST /api/contributions/admin/:id/claim` moves a submission's credits from
 * the school's pending figure to its reward credits. Reward credits are spent
 * before paid licences, so a credit paid twice is a free assessment.
 *
 * It could be paid twice, and no suite touched this route. "Allocate reward"
 * pays the same credits for the same school and marks its submissions
 * `reward_allocated` while leaving them `approved` -- and the claim never
 * read that flag. So allocate, then claim, paid the reward again.
 *
 * Every case is judged by the school's THREE FIGURES in the database, never
 * by the response.
 *
 *   K-00  the route is real (JSON 404 for an unknown id, not the SPA's 200)
 *   K-01  a school admin cannot claim its own submission; nothing moves
 *   K-02  a claim moves exactly the submission's credits, pending -> reward,
 *         and closes the submission
 *   K-03  claiming it again moves nothing
 *   K-04  THE CASE THAT MATTERS: a submission already paid by allocation is
 *         closed and pays NOTHING more
 *   K-05  a submission that is not approved is refused, nothing moves
 *   K-06  at the school's yearly ceiling the claim is refused, nothing moves
 *   K-07  part-way to the ceiling, only what fits is paid
 *   K-08  control: last year's count does not block this year
 *
 * What this cannot show: two claims arriving at the same instant. PGlite has
 * one connection and serialises them (CLAUDE.md), so a concurrency case here
 * would pass against the old code too. The claim is one conditional UPDATE
 * inside a transaction, which is correct on its own terms.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(60)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const { orgs } = await build();
const A = orgs.A;
const sa = new Session("claimSuper");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const orgId = (await A.session.get("/api/my-organization")).body?.id;
const [{ admin_user_id: adminId }] = await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [orgId]);

const figures = async () => (await sql(
  `SELECT pending_reward_credits AS pending, reward_credits AS reward,
          yearly_contribution_count AS yearly FROM organizations WHERE id = $1`, [orgId]))[0];
const statusOf = async (id) => (await sql(
  `SELECT status, reward_allocated FROM contribution_submissions WHERE id = $1`, [id]))[0];
const show = (f) => `pending=${f.pending} reward=${f.reward} yearly=${f.yearly}`;

/** One statement per fixture: the app holds PGlite's only connection. */
async function plant(status, credits, allocated = false) {
  const [row] = await sql(
    `INSERT INTO contribution_submissions
       (organization_id, submitted_by_user_id, country_id, curriculum, subject, grade,
        questions, total_questions, status, approved_count, credits_awarded, reward_allocated)
     VALUES ($1, $2, 'uae', 'MOE National', 'mathematics', 10, '[]'::jsonb, 10, $3, $4, $5, $6)
     RETURNING id`, [orgId, adminId, status, credits * 5, credits, allocated]);
  return row.id;
}
const made = [];
const claim = (session, id) => session.post(`/api/contributions/admin/${id}/claim`, {});

try {
  // ------------------------------------------------------------------ K-00
  {
    const r = await claim(sa, "00000000-0000-0000-0000-000000000000");
    rec("K-00", "the route is real", r.status === 404 && !isHtml(r.body), `HTTP ${r.status}`);
  }

  const first = await plant("approved", 2); made.push(first);
  await sql(`UPDATE organizations SET pending_reward_credits = 2, reward_credits = 0,
                    yearly_contribution_count = 0 WHERE id = $1`, [orgId]);

  // ------------------------------------------------------------------ K-01
  {
    const before = await figures();
    const r = await claim(A.session, first);
    const after = await figures();
    rec("K-01", "a school admin cannot claim its own submission",
      r.status === 403 && show(after) === show(before) && (await statusOf(first)).status === "approved",
      `HTTP ${r.status} ${show(after)}`);
  }

  // ------------------------------------------------------------------ K-02
  {
    const r = await claim(sa, first);
    const after = await figures(); const st = await statusOf(first);
    rec("K-02", "a claim moves exactly its credits and closes the submission",
      r.status === 200 && after.pending === 0 && after.reward === 2 && after.yearly === 2
        && st.status === "claimed",
      `HTTP ${r.status} ${show(after)} status=${st.status}`);
  }

  // ------------------------------------------------------------------ K-03
  {
    const r = await claim(sa, first);
    const after = await figures();
    rec("K-03", "claiming it again moves nothing",
      r.status >= 400 && after.reward === 2 && after.yearly === 2,
      `HTTP ${r.status} ${show(after)}`);
  }

  // ------------------------------------------------------------------ K-04
  // Allocation has ALREADY paid this one: reward is 2+3, pending is 0, and
  // the row says so. Before the fix the claim added its 3 again.
  {
    const paid = await plant("approved", 3, true); made.push(paid);
    await sql(`UPDATE organizations SET pending_reward_credits = 0, reward_credits = 5,
                      yearly_contribution_count = 5 WHERE id = $1`, [orgId]);
    const r = await claim(sa, paid);
    const after = await figures(); const st = await statusOf(paid);
    rec("K-04", "a submission already paid by allocation pays NOTHING more",
      r.status === 200 && r.body?.creditsAwarded === 0
        && after.reward === 5 && after.yearly === 5 && st.status === "claimed",
      `HTTP ${r.status} moved=${r.body?.creditsAwarded} ${show(after)} status=${st.status}`);
  }

  // ------------------------------------------------------------------ K-05
  {
    const pending = await plant("pending", 4); made.push(pending);
    const before = await figures();
    const r = await claim(sa, pending);
    const after = await figures();
    rec("K-05", "a submission that is not approved is refused",
      r.status === 400 && show(after) === show(before) && (await statusOf(pending)).status === "pending",
      `HTTP ${r.status} ${show(after)}`);
  }

  /**
   * THE YEARLY CEILING. "Allocate reward" has always stopped at the school's
   * yearly maximum (50 unless configured); the claim did not. Years are
   * written as SQL so the fixture cannot disagree with the server's clock.
   */
  const YEAR = `EXTRACT(YEAR FROM NOW())::int`;

  // ------------------------------------------------------------------ K-06
  // AT the ceiling: refused, and the submission is left approved and unpaid
  // -- not closed with nothing paid, which would forfeit an earned reward.
  {
    const id = await plant("approved", 3); made.push(id);
    await sql(`UPDATE organizations SET pending_reward_credits = 3, reward_credits = 50,
                      yearly_contribution_count = 50, last_contribution_reset_year = ${YEAR} WHERE id = $1`, [orgId]);
    const before = await figures();
    const r = await claim(sa, id);
    const after = await figures(); const st = await statusOf(id);
    rec("K-06", "at the yearly ceiling the claim is refused and nothing moves",
      r.status === 400 && r.body?.code === "YEARLY_CAP_REACHED"
        && show(after) === show(before) && st.status === "approved" && st.reward_allocated === false,
      `HTTP ${r.status} code=${r.body?.code} ${show(after)} status=${st.status}`);
  }

  // ------------------------------------------------------------------ K-07
  // Two short of the ceiling with five to give: two are paid.
  {
    const id = await plant("approved", 5); made.push(id);
    await sql(`UPDATE organizations SET pending_reward_credits = 5, reward_credits = 48,
                      yearly_contribution_count = 48, last_contribution_reset_year = ${YEAR} WHERE id = $1`, [orgId]);
    const r = await claim(sa, id);
    const after = await figures(); const st = await statusOf(id);
    rec("K-07", "part-way to the ceiling, only what fits is paid",
      r.status === 200 && r.body?.creditsAwarded === 2 && r.body?.creditsOverYearlyCap === 3
        && after.reward === 50 && after.yearly === 50 && after.pending === 0 && st.status === "claimed",
      `HTTP ${r.status} paid=${r.body?.creditsAwarded} over=${r.body?.creditsOverYearlyCap} ${show(after)}`);
  }

  // ------------------------------------------------------------------ K-08
  // Control for K-06: the same full count, but LAST year's. The ceiling is
  // yearly, so this pays in full -- or K-06 would pass against a ceiling that
  // never resets.
  {
    const id = await plant("approved", 3); made.push(id);
    await sql(`UPDATE organizations SET pending_reward_credits = 3, reward_credits = 50,
                      yearly_contribution_count = 50, last_contribution_reset_year = ${YEAR} - 1 WHERE id = $1`, [orgId]);
    const r = await claim(sa, id);
    const after = await figures();
    rec("K-08", "control: last year's count does not block this year",
      r.status === 200 && r.body?.creditsAwarded === 3 && after.reward === 53 && after.yearly === 3,
      `HTTP ${r.status} paid=${r.body?.creditsAwarded} ${show(after)}`);
  }
} finally {
  for (const id of made) await sql(`DELETE FROM contribution_submissions WHERE id = $1`, [id]).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
