/**
 * THE LINK THAT LETS A PAYING BUYER IN — and must let nobody else in.
 *
 * These routes take a credential from the URL and hand back a session. There
 * is no authentication in front of them by design: the token IS the
 * authentication, which makes every guard here load-bearing.
 *
 * What the cases pin, and why each would fail silently:
 *
 *   L-00  the routes are real — the SPA catch-all answers 200 with HTML for
 *         any unmatched URL, so a misspelled path would make every denial
 *         below "pass"
 *   L-01  a live link describes itself without spending itself. GET must not
 *         consume: a buyer who opens the mail on their phone, then finishes on
 *         a laptop, would otherwise find a dead link
 *   L-02  a garbage token is refused 410 with the same code as every other
 *         dead link. Distinguishing expired from used from never-existed would
 *         confirm to a guesser that a value was real
 *   L-03  a weak password is refused AND the token survives, so a buyer who
 *         types "password" has not burnt their only way in
 *   L-04  a strong password sets the hash, spends the token and signs them in
 *   L-05  THE REPLAY, SEQUENTIALLY. The same link used twice is refused the
 *         second time and the password from the first use still works, so
 *         someone holding a copy of the link cannot overwrite it afterwards.
 *         This proves the `used_at IS NULL` filter in the token LOOKUP. It
 *         does NOT prove the second guard — the in-transaction claim that
 *         covers two requests arriving at once — because PGlite allows a
 *         single connection and serialises them. Confirmed by removing that
 *         check: all eight cases still pass. Same limitation CLAUDE.md records
 *         for webhook atomicity
 *   L-06  an EXPIRED token is refused even though it is unused. Expiry is
 *         checked in storage, not by the caller, so no route can forget it
 *   L-07  the password actually logs in through the normal login route, which
 *         is the only proof the hash was written in the format auth.ts reads
 *
 * Tokens are inserted directly rather than driven through a purchase: that
 * path is `setup-invite.mjs`'s job, and coupling the two would mean a change
 * to checkout breaking the tests for the login link.
 */
import { Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
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

const tag = Math.random().toString(36).slice(2, 7);
const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

const email = `setup.${tag}@futurepath.test`;
const username = `setupbuyer${tag}`;
const STRONG = `correct-horse-${tag}-battery`;

// A buyer account with NO password, which is exactly what a group purchase
// leaves behind, plus the school the link sets up.
const [user] = await sql(
  `INSERT INTO users (id, username, email, first_name, last_name, account_type, is_premium, purchased_licenses)
   VALUES (gen_random_uuid(), $1, $2, 'Setup', 'Buyer', 'org_admin', true, 100) RETURNING id`,
  [username, email],
);
const [org] = await sql(
  `INSERT INTO organizations (id, name, admin_user_id, total_licenses, used_licenses, country_id)
   VALUES (gen_random_uuid(), $1, $2, 100, 0, 'uae') RETURNING id`,
  [`Setup School ${tag}`, user.id],
);

/**
 * expires_at is written with a SQL INTERVAL, never a parameterised JS Date.
 *
 * PGlite mis-binds a JS Date against a `timestamp` column: proved in this
 * harness with a temp table holding one past and one future row, where
 * `exp > NOW()` returns the future row correctly, `exp > $1::timestamp` with
 * an ISO string returns it correctly, and `exp > $1` with a JS Date returns
 * NOTHING. Writing the column the same way put a value in it that the database
 * then read as live, and the first draft of this suite reported an expired
 * link being accepted — a product bug that was not one.
 *
 * Only the FIXTURE is affected. The route reads through drizzle, which
 * serialises timestamps itself, and the identical `gt(expiresAt, new Date())`
 * pattern in password-reset.routes.ts demonstrably works against real
 * Postgres in production.
 */
const mkToken = async (opts = {}) => {
  const token = hex(64);
  const interval = opts.expired ? `NOW() - INTERVAL '1 hour'` : `NOW() + INTERVAL '7 days'`;
  await sql(
    `INSERT INTO school_setup_tokens (id, user_id, organization_id, token, expires_at, sent_at, sent_count)
     VALUES (gen_random_uuid(), $1, $2, $3, ${interval}, NOW(), 1)`,
    [user.id, org.id, token],
  );
  return token;
};

/**
 * Driven through Session, not bare fetch, because the CSRF middleware is
 * double-submit: a `csrf_token` cookie echoed in a header on every
 * state-changing request. A session that has never made one holds neither, so
 * its first POST is refused **403 CSRF_MISSING** before these routes are
 * reached at all — the first draft of this suite did exactly that and five
 * cases failed against a guard they were not testing. The GET below issues the
 * cookie.
 */
const anon = new Session(`setup-anon-${tag}`);
await anon.get("/api/auth/user");
const req = (method, path, body) => anon.req(method, path, body);

const tokenRow = (t) => sql(`SELECT used_at FROM school_setup_tokens WHERE token = $1`, [t]);
const passwordHash = () => sql(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);

try {
  // ------------------------------------------------------------------ L-00
  {
    const r = await req("GET", `/api/school/setup/${hex(64)}`);
    rec("L-00", "the route is real: a JSON 410, not the SPA's 200 HTML",
      r.status === 410 && !isHtml(r.body) && r.body?.code === "SETUP_LINK_INVALID",
      `HTTP ${r.status} ${isHtml(r.body) ? "HTML" : JSON.stringify(r.body).slice(0, 50)}`);
  }

  // ------------------------------------------------------------------ L-01
  // GET describes the link WITHOUT spending it. A buyer who opens the mail on
  // a phone and finishes on a laptop must not find a dead link.
  const liveToken = await mkToken();
  {
    const r = await req("GET", `/api/school/setup/${liveToken}`);
    const [row] = await tokenRow(liveToken);
    const ok = r.status === 200
      && r.body?.username === username
      && r.body?.organizationName === `Setup School ${tag}`
      && r.body?.totalLicenses === 100
      && r.body?.needsCurriculum === true   // seeded with a country, no curriculum
      && r.body?.needsCountry === false
      && row.used_at === null;
    rec("L-01", "GET describes the link and does NOT spend it", ok,
      `HTTP ${r.status} org=${r.body?.organizationName} needsCurriculum=${r.body?.needsCurriculum} used=${row.used_at !== null}`);
  }

  // ------------------------------------------------------------------ L-02
  {
    const r = await req("GET", `/api/school/setup/not-a-real-token-${tag}`);
    rec("L-02", "an unknown token is 410 with the same code as every dead link",
      r.status === 410 && r.body?.code === "SETUP_LINK_INVALID",
      `HTTP ${r.status} code=${r.body?.code}`);
  }

  // ------------------------------------------------------------------ L-03
  // A weak password must not burn the token. Judged by the row, because a 400
  // tells you nothing about whether the link survived.
  {
    const r = await req("POST", `/api/school/setup/${liveToken}/password`, { password: "password" });
    const [row] = await tokenRow(liveToken);
    const [u] = await passwordHash();
    rec("L-03", "a weak password is refused and the link still works",
      r.status === 400 && row.used_at === null && u.password_hash === null,
      `HTTP ${r.status} used=${row.used_at !== null} hash=${u.password_hash === null ? "none" : "SET"}`);
  }

  // ------------------------------------------------------------------ L-04
  {
    const r = await req("POST", `/api/school/setup/${liveToken}/password`, { password: STRONG });
    const [row] = await tokenRow(liveToken);
    const [u] = await passwordHash();
    rec("L-04", "a strong password sets the hash and spends the link",
      r.status === 200 && r.body?.success === true && row.used_at !== null && !!u.password_hash,
      `HTTP ${r.status} used=${row.used_at !== null} hash=${u.password_hash ? "set" : "MISSING"} signedIn=${r.body?.signedIn}`);
  }

  // ------------------------------------------------------------------ L-05
  // THE REPLAY. Someone holding a copy of the link must not be able to
  // overwrite the password afterwards.
  {
    const r = await req("POST", `/api/school/setup/${liveToken}/password`, { password: `attacker-${tag}-chosen` });
    const [u] = await passwordHash();
    const s = new Session(`setup-replay-${tag}`);
    let stillWorks = false;
    try { await s.login(username, STRONG); stillWorks = true; } catch { stillWorks = false; }
    rec("L-05", "a replayed link is refused and the first password still works",
      r.status === 410 && stillWorks,
      `HTTP ${r.status} original password still logs in=${stillWorks}`);
  }

  // ------------------------------------------------------------------ L-06
  // Expiry lives in storage, not in the caller, so no route can forget it.
  {
    const expired = await mkToken({ expired: true });
    const g = await req("GET", `/api/school/setup/${expired}`);
    const p = await req("POST", `/api/school/setup/${expired}/password`, { password: `another-${tag}-strong` });
    const [row] = await tokenRow(expired);
    rec("L-06", "an expired but unused link is refused by both routes",
      g.status === 410 && p.status === 410 && row.used_at === null,
      `GET=${g.status} POST=${p.status} used=${row.used_at !== null}`);
  }

  // ------------------------------------------------------------------ L-07
  // The only proof the hash was written in the format auth.ts actually reads.
  // Asserted separately from L-04 because "a hash exists" and "it logs in" are
  // different claims, and this repo has shipped the first without the second.
  {
    const s = new Session(`setup-login-${tag}`);
    let ok = false;
    try { const r = await s.login(username, STRONG); ok = r.status === 200; } catch { ok = false; }
    rec("L-07", "the password logs in through the normal login route", ok,
      ok ? "200 from /api/login/username" : "login refused");
  }
} finally {
  try {
    await sql(`DELETE FROM school_setup_tokens WHERE user_id = $1`, [user.id]);
    await sql(`DELETE FROM organizations WHERE id = $1`, [org.id]);
    await sql(`DELETE FROM users WHERE id = $1`, [user.id]);
  } catch (err) { console.error("cleanup:", String(err.message).slice(0, 80)); }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
