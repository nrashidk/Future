/**
 * RACES, AGAINST A REAL POSTGRES (2026-11-25).
 *
 * PGlite has one connection, so nothing here can race on it (CLAUDE.md, "A
 * RACE CANNOT BE TESTED IN THIS HARNESS"). Run this suite ONLY with
 * REAL_PG_PORT set on up.ts and schema-push (db-bridge.mjs then bridges to a
 * real server); it refuses otherwise. That the requests really overlap was
 * shown by mutation: the webhook claim rewritten as SELECT-then-INSERT with a
 * 200 ms gap failed webhook-idempotency W-07 with fresh=8 on real Postgres.
 *
 *   R-01  THE ONE THAT MATTERS: one group purchase delivered SIX times at
 *         once under different event ids (the webhook and the browser's
 *         /complete land together in real life) -> one account, one school,
 *         its licences once, ONE setup link
 *   R-02  one school top-up delivered eight times at once under different
 *         event ids -> the licences are added once, one ledger row
 *   R-03  a class of 30 signing in at the same moment from one address -> 30x200
 *   R-05  ...and in that same moment the school's used_licenses must equal its
 *         ledger rows (it drifted low: two charges, counter 1, before the
 *         school row was locked in consumeLicense)
 *   R-04  NOT AN ASSERTION, A MEASUREMENT: a school with ONE licence left and
 *         two students who finish at the same time. Printed as FLAG, because
 *         what should happen is the owner's decision (see the output).
 */
import { build, Session } from "./fixtures.mjs";

if (!process.env.REAL_PG) {
  console.error("REFUSING TO RUN: set REAL_PG=1 (and run up.ts with REAL_PG_PORT). On PGlite every case passes whether the code is atomic or not.");
  process.exit(2);
}
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
if (!SECRET) { console.error("REFUSING TO RUN: STRIPE_WEBHOOK_SECRET unset."); process.exit(2); }
const Stripe = (await import("stripe")).default;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_dummy");
const { Client } = await import("pg");
async function sql(text, params = []) {
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT}/postgres` });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(64)} ${note}`);
};
async function deliver(ev) {
  const payload = JSON.stringify(ev);
  const res = await fetch(`${BASE}/api/webhook/stripe`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET }) },
    body: payload,
  });
  return res.status;
}
const ev = (id, object) => ({
  id, object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000),
  livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null },
  type: "payment_intent.succeeded", data: { object },
});
const tag = Math.random().toString(36).slice(2, 7);

const { orgs } = await build();

// ---------------------------------------------------------------- R-01
{
  const email = `race.${tag}@futurepath.test`;
  const pi = `pi_race_${tag}`;
  const object = {
    id: pi, object: "payment_intent", status: "succeeded", amount: 200000, currency: "aed", customer: null,
    created: Math.floor(Date.now() / 1000) - 5,
    metadata: { userId: "guest", studentCount: "50", expectedAmount: "200000", currency: "AED", countryId: "uae",
      assessmentType: "premium", buyerEmail: email, buyerName: "Race Buyer", buyerPhone: "0500000000", organizationName: `Race School ${tag}` },
  };
  const codes = await Promise.all(Array.from({ length: 6 }, (_, i) => deliver(ev(`evt_r1_${tag}_${i}`, object))));
  await new Promise((r) => setTimeout(r, 1500));
  const [u] = await sql(`SELECT COUNT(*)::int n FROM users WHERE email = $1`, [email]);
  const o = await sql(`SELECT o.id, o.total_licenses FROM organizations o JOIN users u ON u.id = o.admin_user_id WHERE u.email = $1`, [email]);
  const [g] = await sql(`SELECT COUNT(*)::int n, COALESCE(SUM(licenses_delta),0)::int d FROM license_grants WHERE stripe_payment_id = $1`, [pi]);
  const [t] = await sql(`SELECT COUNT(*)::int n FROM school_setup_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = $1 AND t.used_at IS NULL`, [email]);
  rec("R-01", "six simultaneous deliveries: 1 account, 1 school, 50 once, 1 link",
    u.n === 1 && o.length === 1 && o[0].total_licenses === 50 && g.n === 1 && g.d === 50 && t.n === 1,
    `codes=${codes.join(",")} accounts=${u.n} schools=${o.length} total=${o[0]?.total_licenses} grants=${g.n}/${g.d} links=${t.n}`);
}

// ---------------------------------------------------------------- R-02
{
  const A = orgs.A;
  const [before] = await sql(`SELECT total_licenses, admin_user_id FROM organizations WHERE id = $1`, [A.orgId]);
  const pi = `pi_race_topup_${tag}`;
  const object = {
    id: pi, object: "payment_intent", status: "succeeded", amount: 28000, currency: "aed", customer: null,
    metadata: { kind: "school_topup", organizationId: A.orgId, userId: before.admin_user_id, studentCount: "7", expectedAmount: "28000", currency: "AED" },
  };
  const codes = await Promise.all(Array.from({ length: 8 }, (_, i) => deliver(ev(`evt_r2_${tag}_${i}`, object))));
  await new Promise((r) => setTimeout(r, 1000));
  const [after] = await sql(`SELECT total_licenses FROM organizations WHERE id = $1`, [A.orgId]);
  const [g] = await sql(`SELECT COUNT(*)::int n FROM license_grants WHERE stripe_payment_id = $1`, [pi]);
  rec("R-02", "eight simultaneous top-up deliveries add the licences once",
    after.total_licenses - before.total_licenses === 7 && g.n === 1,
    `codes=${codes.join(",")} ${before.total_licenses}->${after.total_licenses} grants=${g.n}`);
}

// ---------------------------------------------------------------- R-03
{
  const accounts = [{ u: orgs.A.adminUsername, p: orgs.A.adminPassword }, ...orgs.A.students.map((s) => ({ u: s.username, p: s.password })),
    { u: orgs.B.adminUsername, p: orgs.B.adminPassword }, ...orgs.B.students.map((s) => ({ u: s.username, p: s.password }))];
  const t0 = Date.now();
  const codes = await Promise.all(Array.from({ length: 30 }, async (_, i) => {
    const s = new Session("lab"); s.clientIp = "10.251.0.1";
    const a = accounts[i % accounts.length];
    return (await s.post("/api/login/username", { username: a.u, password: a.p })).status;
  }));
  const ms = Date.now() - t0;
  rec("R-03", "30 sign-ins at once from one address all succeed",
    codes.every((c) => c === 200), `200s=${codes.filter((c) => c === 200).length}/30 in ${ms} ms`);
}

// ---------------------------------------------------------------- R-04 (FLAG)
{
  const B = orgs.B;
  const kids = B.students.slice(0, 2);
  if (kids.length < 2) {
    console.log("SKIP  R-04  needs two students in school B");
  } else {
    const [o] = await sql(`SELECT total_licenses, used_licenses FROM organizations WHERE id = $1`, [B.orgId]);
    await sql(`UPDATE organizations SET total_licenses = $2 WHERE id = $1`, [B.orgId, o.used_licenses + 1]);
    const riasec = () => { const r = {}; for (const t of ["R","I","A","S","E","C"]) for (let i = 1; i <= 5; i++) r[`${t}${i}`] = ((i + t.charCodeAt(0)) % 5) + 1; return r; };
    const cvq = async () => { const items = (await (await fetch(`${BASE}/api/cvq/items`)).json()).items ?? []; const o = {}; items.forEach((it, i) => { o[it.id] = (i % 5) + 1; }); return o; };
    const sessions = await Promise.all(kids.map(async (k, i) => { const s = new Session(`r4${i}`); await s.login(k.username, k.password); return s; }));
    const made = await Promise.all(sessions.map(async (s) => s.post("/api/assessments", {
      favoriteSubjects: ["Mathematics","Science","English"], interests: ["Technology","Healthcare","Business"],
      countryId: "uae", curriculum: "MOE National", grade: "10", riasecResponses: riasec(), cvqResponses: await cvq() })));
    const ids = made.map((m) => m.body?.id);
    for (let i = 0; i < 2; i++) {
      const s = sessions[i], id = ids[i];
      if (!id) continue;
      const gen = await s.post(`/api/assessments/${id}/quiz/generate`, {});
      await s.post(`/api/assessments/${id}/quiz/submit`, { responses: (gen.body?.questions ?? []).map((q) => ({ questionId: q.id, answer: typeof q.options?.[0] === "string" ? q.options[0] : q.options?.[0]?.text })) });
      await s.patch(`/api/assessments/${id}`, { interests: ["Technology","Healthcare","Business"], careerAspirations: ["Doctor"], visionAlignment: { healthcare: 5 }, currentStep: 6 });
      await s.post("/api/cvq/submit", { assessmentId: id, responses: await cvq(), durationSeconds: 120 });
    }
    const gens = await Promise.all(sessions.map((s, i) => ids[i] ? s.post(`/api/recommendations/generate/${ids[i]}`, {}) : Promise.resolve({ status: 0 })));
    const [after] = await sql(`SELECT total_licenses, used_licenses FROM organizations WHERE id = $1`, [B.orgId]);
    const [ledger] = await sql(`SELECT COUNT(*)::int n FROM license_consumptions WHERE organization_id = $1 AND currency = 'paid'`, [B.orgId]);
    rec("R-05", "two simultaneous charges: used_licenses equals the ledger",
      gens.every((g) => g.status === 200) && after.used_licenses === ledger.n,
      `reports=${gens.map((g) => g.status).join(",")} used_licenses=${after.used_licenses} ledger=${ledger.n}`);
    console.log(`FLAG  R-04  one licence left, two students finish together: creates=${made.map((m) => m.status).join(",")} ` +
      `reports=${gens.map((g) => g.status).join(",")} used ${o.used_licenses}->${after.used_licenses} of ${after.total_licenses}` +
      (after.used_licenses > after.total_licenses ? "  <- OVERDRAWN: the pool is checked when an assessment STARTS, never when the report is charged" : ""));
  }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\nraces: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
