/**
 * A PARENT REGISTERS A STUDENT ACCOUNT, STAYS FREE, AND MUST CONFIRM THE
 * EMAIL ADDRESS (owner's decision, 2026-11-13).
 *
 * Two changes, asserted through the real routes and judged by the ROWS:
 *
 * 1. An unpaid account with a child profile is a FREE account. From
 *    2026-09-16 it was refused 402 PAYMENT_REQUIRED before it could start
 *    anything. It may now take the assessment, bounded by the free cap, and
 *    is on NO licence pool.
 *      F-03  it can start an assessment (was 402)
 *      F-04  it is on no pool -- consumeLicense writes a row for anyone on
 *            one WITHOUT checking a balance, so "on a pool at zero" would
 *            charge a free report against a licence not yet bought
 *      F-05  CONTROL: the free cap still stops it at three
 *
 * 2. The address must be confirmed within 72 hours or the account is erased.
 *      F-01  registration records the due date, ~72 hours out, unconfirmed
 *      F-06  Resend leaves exactly ONE live link, and it is a new one
 *      F-07  a wrong or malformed link confirms nobody
 *      F-08  the right link confirms; opened twice it still says so
 *      F-09  an expired link is refused 410 and confirms nobody
 *      F-10  nothing to resend once confirmed
 *      S-01  THE CASE THAT MATTERS: an overdue, unconfirmed, unpaid account
 *            is GONE after one /health ping -- user, child profile, assessment
 *      S-02  CONTROL: not yet due survives
 *      S-03  CONTROL: overdue but CONFIRMED survives
 *      S-04  CONTROL: overdue, unconfirmed but PAID survives
 *      S-05  CONTROL: an account that was never asked (NULL due date) survives
 *            -- without these four, S-01 passes against a sweep that deletes
 *            every account
 *
 * The link's value exists only in the mail, and the table holds its SHA-256,
 * so a known token is PLANTED by hash. Timestamps are written as SQL
 * intervals, never bound JS Dates (CLAUDE.md: PGlite mis-binds them).
 *
 * NOT COVERED: that a free report, once GENERATED, wrote no ledger row
 * (generation is not driven here; shared/licensePool.test.ts pins the rule
 * consumeLicense reads), and that the mail is delivered (no provider offline).
 */
import { createHash, randomBytes } from "crypto";
import { Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(64)} ${note}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}
const sha = (t) => createHash("sha256").update(t).digest("hex");
const stamp = Date.now();
const PASSWORD = "Str0ng!Passw0rd";

async function register(tag) {
  const s = new Session(tag);
  await s.get("/api/auth/user"); // CSRF cookie first, or the POST is a 403 from the wrong guard
  const email = `free.${tag}.${stamp}@futurepath.test`;
  const r = await s.post("/api/register/parent", {
    firstName: "Free", lastName: tag, email, password: PASSWORD, confirmPassword: PASSWORD,
    child: { name: `Child ${tag}`, dateOfBirth: "2010-04-04", gender: "female",
             grade: "grade10", countryId: "uae", curriculum: "MOE National" },
    consentsToProcessing: true, attestsGuardianRelationship: true,
    attestationText: "LOCAL FIXTURE attestation wording", locale: "en",
  });
  return { s, email, status: r.status, body: r.body, id: r.body?.user?.id ?? null };
}
const ASSESSMENT = { favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["reading"] };
const userRow = async (id) => (await sql(
  `SELECT id, is_premium,
          email_confirmation_due_at IS NOT NULL AS has_due,
          EXTRACT(EPOCH FROM (email_confirmation_due_at - NOW())) / 3600 AS hours_left,
          email_confirmed_at IS NOT NULL AS confirmed
     FROM users WHERE id = $1`, [id]))[0];

// ------------------------------------------------------------ registration
const a = await register("a");
rec("F-00", "registration answers 200 with a real user id", a.status === 200 && !!a.id,
  `HTTP ${a.status} ${JSON.stringify(a.body).slice(0, 100)}`);
{
  const row = await userRow(a.id);
  const h = Number(row?.hours_left);
  rec("F-01", "the row owes a confirmation ~72 hours out, unconfirmed, unpaid",
    row?.has_due === true && h > 71.5 && h <= 72 && row.confirmed === false && row.is_premium === false,
    `hours_left=${h.toFixed(2)} confirmed=${row?.confirmed} premium=${row?.is_premium}`);
  const me = await a.s.get("/api/auth/user");
  rec("F-02", "/api/auth/user carries the two dates the banner reads",
    typeof me.body?.emailConfirmationDueAt === "string" && me.body?.emailConfirmedAt === null,
    `due=${me.body?.emailConfirmationDueAt} confirmed=${me.body?.emailConfirmedAt}`);
}

// ------------------------------------------------------ free, not paywalled
const created = [];
{
  const r = await a.s.post("/api/assessments", ASSESSMENT);
  if (r.body?.id) created.push(r.body.id);
  const rows = await sql(`SELECT count(*)::int AS n FROM assessments WHERE user_id = $1`, [a.id]);
  rec("F-03", "an unpaid registered account STARTS an assessment (was 402)",
    r.status === 200 && rows[0].n === 1, `HTTP ${r.status} code=${r.body?.code ?? "-"} rows=${rows[0].n}`);

  const lic = await a.s.get("/api/licenses/me");
  rec("F-04", "it is on NO licence pool", lic.status === 200 && lic.body?.onPool === false,
    `HTTP ${lic.status} ${JSON.stringify(lic.body).slice(0, 80)}`);

  for (let i = 0; i < 2; i++) {
    const more = await a.s.post("/api/assessments", ASSESSMENT);
    if (more.body?.id) created.push(more.body.id);
  }
  await sql(`UPDATE assessments SET is_completed = true, completed_at = NOW() WHERE user_id = $1`, [a.id]);
  const before = (await sql(`SELECT count(*)::int AS n FROM assessments WHERE user_id = $1`, [a.id]))[0].n;
  const fourth = await a.s.post("/api/assessments", ASSESSMENT);
  const after = (await sql(`SELECT count(*)::int AS n FROM assessments WHERE user_id = $1`, [a.id]))[0].n;
  rec("F-05", "CONTROL: with three completed, a fourth is refused by the free cap",
    before === 3 && fourth.status === 403 && fourth.body?.code === "FREE_ASSESSMENT_CAP_REACHED" && after === 3,
    `HTTP ${fourth.status} code=${fourth.body?.code} rows ${before}->${after}`);
}

// ------------------------------------------------------------ confirmation
{
  const before = await sql(`SELECT token_hash FROM email_confirmation_tokens WHERE user_id = $1`, [a.id]);
  const r = await a.s.post("/api/email-confirmation/resend", { locale: "en" });
  const after = await sql(`SELECT token_hash FROM email_confirmation_tokens WHERE user_id = $1 AND used_at IS NULL`, [a.id]);
  rec("F-06", "Resend leaves exactly ONE live link, and a new one",
    r.status === 200 && before.length === 1 && after.length === 1 && before[0].token_hash !== after[0].token_hash,
    `HTTP ${r.status} before=${before.length} after=${after.length}`);
}
const anon = new Session("anon");
await anon.get("/api/auth/user");
{
  const wrong = await anon.post("/api/email-confirmation/confirm", { token: randomBytes(32).toString("hex") });
  const malformed = await anon.post("/api/email-confirmation/confirm", { token: "' OR 1=1 --" });
  const row = await userRow(a.id);
  rec("F-07", "a wrong link and a malformed one confirm nobody",
    wrong.status === 404 && malformed.status === 404 && row.confirmed === false,
    `wrong=${wrong.status} malformed=${malformed.status} confirmed=${row.confirmed}`);
}
{
  const token = randomBytes(32).toString("hex");
  await sql(`INSERT INTO email_confirmation_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '1 hour')`, [a.id, sha(token)]);
  // From a session that is NOT signed in: the parent may open the mail elsewhere.
  const first = await anon.post("/api/email-confirmation/confirm", { token });
  const row = await userRow(a.id);
  const second = await anon.post("/api/email-confirmation/confirm", { token });
  rec("F-08", "the right link confirms, with no session; twice is still a yes",
    first.status === 200 && first.body?.outcome === "confirmed" && row.confirmed === true &&
    second.status === 200 && second.body?.outcome === "already_confirmed",
    `first=${first.status}/${first.body?.outcome} confirmed=${row.confirmed} second=${second.status}/${second.body?.outcome}`);

  const again = await a.s.post("/api/email-confirmation/resend", { locale: "en" });
  rec("F-10", "nothing to resend once confirmed (409)",
    again.status === 409 && again.body?.code === "NOT_PENDING", `HTTP ${again.status} ${again.body?.code}`);
}
{
  const b = await register("b");
  const token = randomBytes(32).toString("hex");
  await sql(`INSERT INTO email_confirmation_tokens (user_id, token_hash, expires_at)
             VALUES ($1, $2, NOW() - INTERVAL '1 hour')`, [b.id, sha(token)]);
  const r = await anon.post("/api/email-confirmation/confirm", { token });
  const row = await userRow(b.id);
  rec("F-09", "an expired link is refused 410 and confirms nobody",
    r.status === 410 && r.body?.code === "LINK_EXPIRED" && row.confirmed === false,
    `HTTP ${r.status} ${r.body?.code} confirmed=${row.confirmed}`);
  await sql(`DELETE FROM email_confirmation_tokens WHERE user_id = $1`, [b.id]);
}

// ------------------------------------------------------------------ sweep
await sleep(1500);
const overdue = await register("overdue");
const young = await register("young");
const confirmedOld = await register("confirmedold");
const paid = await register("paid");
const never = await register("never");
await overdue.s.post("/api/assessments", ASSESSMENT);
const OLD = `NOW() - INTERVAL '1 hour'`;
await sql(`UPDATE users SET email_confirmation_due_at = ${OLD} WHERE id = ANY($1)`,
  [[overdue.id, confirmedOld.id, paid.id]]);
await sql(`UPDATE users SET email_confirmed_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [confirmedOld.id]);
await sql(`UPDATE users SET is_premium = true, purchased_licenses = 1 WHERE id = $1`, [paid.id]);
await sql(`UPDATE users SET email_confirmation_due_at = NULL WHERE id = $1`, [never.id]);

const present = async (id) => (await sql(`SELECT count(*)::int AS n FROM users WHERE id = $1`, [id]))[0].n === 1;
const allThere = (await Promise.all([overdue, young, confirmedOld, paid, never].map((u) => present(u.id)))).every(Boolean);

// Make the throttled sweep due, then ping /health, which fires it.
await sql(
  `INSERT INTO system_config (key, value) VALUES ('guest_assessment_sweep_status', $1)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  [JSON.stringify({ lastRunAt: "2026-01-01T00:00:00.000Z", lastSuccessAt: "2026-01-01T00:00:00.000Z",
    lastDeletedCount: 0, lastError: null })]);
await fetch(`${BASE}/health`);
await sleep(4000);

{
  const gone = !(await present(overdue.id));
  const child = (await sql(`SELECT count(*)::int AS n FROM child_profiles WHERE guardian_user_id = $1`, [overdue.id]))[0].n;
  const assess = (await sql(`SELECT count(*)::int AS n FROM assessments WHERE user_id = $1`, [overdue.id]))[0].n;
  rec("S-01", "overdue + unconfirmed + unpaid is ERASED: user, child, assessment",
    allThere && gone && child === 0 && assess === 0,
    `seeded=${allThere} user_gone=${gone} child_rows=${child} assessments=${assess}`);
  rec("S-02", "CONTROL: not yet due survives", await present(young.id));
  rec("S-03", "CONTROL: overdue but CONFIRMED survives", await present(confirmedOld.id));
  rec("S-04", "CONTROL: overdue, unconfirmed but PAID survives", await present(paid.id));
  rec("S-05", "CONTROL: never asked (NULL due date) survives", await present(never.id));
  const sa = new Session("sa");
  const login = await sa.login(SUPERADMIN.username, SUPERADMIN.password).catch(() => null);
  const who = await sa.get("/api/auth/user");
  rec("S-06", "CONTROL: the superadmin is still there and can sign in", who.status === 200 && !!who.body?.id,
    `HTTP ${who.status}`);
}

// Leave nothing behind for the suites that count accounts.
for (const u of [a, young, confirmedOld, paid, never]) {
  await sql(`DELETE FROM assessments WHERE user_id = $1`, [u.id]);
  await sql(`DELETE FROM child_guardian_consents WHERE performed_by = $1`, [u.id]).catch(() => {});
  await sql(`DELETE FROM child_profiles WHERE guardian_user_id = $1`, [u.id]);
  await sql(`DELETE FROM users WHERE id = $1`, [u.id]);
}
await sql(`DELETE FROM users WHERE email LIKE $1`, [`free.b.${stamp}%`]).catch(() => {});

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
