/**
 * A REQUEST IS REFUSED FOR ITS SHAPE BEFORE ANYTHING READS IT.
 *
 * The byte cap is 512 KB and 391 KB of `[1,1,1,...]` is a 200,000-element
 * array. On 2026-11-12 `POST /api/assessments` -- which needs no account and
 * has no rate limit -- ACCEPTED one and STORED it: a row whose `interests`
 * column held 200,000 elements, written by a stranger. `shared/bodyShape.ts`
 * has the measurements, including what the same request costs under zod 4.
 *
 * Judged by the DATABASE wherever a row could have been written. A 413 says
 * the guard answered; only the absence of the row says nothing got past it.
 *
 *   B-00  CONTROL: an ordinary guest assessment is still created
 *   B-01  the measured request is refused 413, quickly, with a small reply
 *   B-02  and NOTHING was stored -- no new row, no oversized array anywhere
 *   B-03  the same through a different column, so B-01 is not about one field
 *   B-04  100,000 levels of nesting is refused, and the server is still up
 *   B-07  a smaller array the door allows is refused by the FIELD's own bound
 *   B-08  and its control: exactly the bound is accepted
 *   B-05  THE EXEMPTION IS REAL: the superadmin bulk question import is not
 *         answered 413 for a 5,001-row body. Whatever it does answer, the
 *         shape guard was not what answered it
 *   B-06  ...AND IT IS BY PATH, NOT BY ROLE: the same superadmin sending the
 *         same oversized array to a non-exempt route IS refused. Without this
 *         B-05 would pass against a guard that waves superadmins through
 */
import { Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
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

/** A guest: cookies and a CSRF token, no account. */
const cookies = new Map();
const absorb = (res) => {
  for (const raw of (res.headers.getSetCookie?.() ?? [])) {
    const [pair] = raw.split(";"); const i = pair.indexOf("=");
    if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
};
absorb(await fetch(`${BASE}/api/auth/user`));
async function guestPost(path, rawJson) {
  const t = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      "X-CSRF-Token": decodeURIComponent(cookies.get("csrf_token") ?? ""),
    },
    body: rawJson,
  });
  absorb(res);
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch {}
  return { status: res.status, body, bytes: text.length, ms: Date.now() - t, sent: rawJson.length };
}

const PAYLOAD = {
  grade: "10", countryId: "uae", curriculum: "MOE National",
  favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["technology"],
};
const HUGE = 200000;
const counts = async () => (await sql(
  `SELECT COUNT(*)::int AS n,
          COALESCE(MAX(cardinality(interests)), 0)::int AS widest_interests,
          COALESCE(MAX(cardinality(strengths)), 0)::int AS widest_strengths
     FROM assessments`))[0];

const made = [];
try {
  // ------------------------------------------------------------------ B-00
  {
    const r = await guestPost("/api/assessments", JSON.stringify(PAYLOAD));
    if (r.body?.id) made.push(r.body.id);
    rec("B-00", "control: an ordinary guest assessment is still created",
      (r.status === 200 || r.status === 201) && typeof r.body?.id === "string",
      `HTTP ${r.status} id=${r.body?.id ? "yes" : "NONE"}`);
  }

  const before = await counts();

  // ------------------------------------------------------------------ B-01
  const r1 = await guestPost("/api/assessments",
    JSON.stringify({ ...PAYLOAD, interests: Array(HUGE).fill(1) }));
  if (r1.body?.id) made.push(r1.body.id);
  rec("B-01", "a 200,000-element array is refused 413 with a small reply",
    r1.status === 413 && r1.body?.code === "BODY_TOO_COMPLEX" && r1.bytes < 500,
    `sent ${(r1.sent / 1024).toFixed(0)}kb -> HTTP ${r1.status} code=${r1.body?.code} reply=${r1.bytes}b in ${r1.ms}ms`);

  // ------------------------------------------------------------------ B-03
  const r3 = await guestPost("/api/assessments",
    // 100,000, not 200,000: quoted strings are four bytes each, and 200,000 of
    // them is over the BYTE cap -- which answers 413 too, from express, with no
    // `reason`. The first draft of this case passed its status check on that.
    JSON.stringify({ ...PAYLOAD, strengths: Array(HUGE / 2).fill("x") }));
  if (r3.body?.id) made.push(r3.body.id);
  rec("B-03", "the same through another column, with valid-looking strings",
    r3.status === 413 && r3.body?.reason === "array_too_long",
    `HTTP ${r3.status} reason=${r3.body?.reason}`);

  // ------------------------------------------------------------------ B-02
  // The one that matters. Before the guard this row existed.
  {
    const after = await counts();
    rec("B-02", "and NOTHING was stored: no new row, no oversized array",
      after.n === before.n && after.widest_interests < 100 && after.widest_strengths < 100,
      `rows ${before.n}->${after.n} widest interests=${after.widest_interests} strengths=${after.widest_strengths}`);
  }

  // ------------------------------------------------------------------ B-04
  {
    const depth = 100000;
    const r = await guestPost("/api/assessments", "[".repeat(depth) + "]".repeat(depth));
    const health = await fetch(`${BASE}/health`).then((x) => x.status).catch(() => 0);
    // 400 is also acceptable: the JSON parser itself may refuse nesting this
    // deep before the guard sees it. What is NOT acceptable is a dead server.
    rec("B-04", "100,000 levels of nesting is refused and the server is up",
      (r.status === 413 || r.status === 400) && health === 200,
      `HTTP ${r.status} reason=${r.body?.reason ?? "-"} health=${health}`);
  }

  // ------------------------------------------------------------------ B-07
  // UNDER the door's limit and still far more than the form can produce: 31
  // interests. The door lets it through by design; the field's own bound
  // refuses it. Judged by the row count again.
  {
    const b = await counts();
    const r = await guestPost("/api/assessments",
      JSON.stringify({ ...PAYLOAD, interests: Array(31).fill("technology") }));
    if (r.body?.id) made.push(r.body.id);
    const a = await counts();
    rec("B-07", "31 interests pass the door and are refused by the field",
      r.status === 400 && /Too many interests/.test(r.body?.message ?? "") && a.n === b.n,
      `HTTP ${r.status} "${r.body?.message}" rows ${b.n}->${a.n}`);
  }
  // ------------------------------------------------------------------ B-08
  // Control for B-07: 30 is accepted, or B-07 would pass against a bound of 1.
  {
    const r = await guestPost("/api/assessments",
      JSON.stringify({ ...PAYLOAD, interests: Array(30).fill("technology") }));
    if (r.body?.id) made.push(r.body.id);
    rec("B-08", "control: exactly 30 interests are accepted",
      (r.status === 200 || r.status === 201) && typeof r.body?.id === "string", `HTTP ${r.status}`);
  }

  // ------------------------------------------------------------- B-05, B-06
  const sa = new Session("bodyShapeSuper");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);
  const rows = Array.from({ length: 5001 }, (_, i) => ({ question: `q${i}` }));
  {
    const r = await sa.post("/api/admin/questions/bulk-upload", { questions: rows });
    rec("B-05", "the bulk question import is EXEMPT (not answered 413)",
      r.status !== 413 && r.body?.code !== "BODY_TOO_COMPLEX" && typeof r.body === "object",
      `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 70)}`);
  }
  {
    // A REAL route, proved real first: with 2 ids it answers JSON from its
    // own handler. Against a path that does not exist the SPA catch-all would
    // answer 200 with HTML and the 413 below would prove nothing about routes.
    const path = "/api/superadmin/users/bulk/reset-passwords";
    const real = await sa.post(path, { userIds: ["no-such-user-a", "no-such-user-b"] });
    const isReal = typeof real.body === "object" && real.body !== null && real.status !== 413;
    const r = await sa.post(path, { userIds: rows.map((_, i) => `id-${i}`) });
    rec("B-06", "...by PATH, not role: the same superadmin is refused elsewhere",
      isReal && r.status === 413 && r.body?.code === "BODY_TOO_COMPLEX",
      `route real=${isReal} (HTTP ${real.status}) -> oversized HTTP ${r.status} code=${r.body?.code}`);
  }
} finally {
  for (const id of made) {
    await sql(`DELETE FROM assessments WHERE id = $1`, [id]).catch(() => {});
  }
  await sql(`DELETE FROM quiz_questions WHERE question LIKE 'q%' AND length(question) < 6`).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
