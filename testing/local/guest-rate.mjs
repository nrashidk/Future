/**
 * A STRANGER CANNOT START ASSESSMENTS WITHOUT LIMIT -- AND A CLASSROOM CAN.
 *
 * `POST /api/assessments` needs no account and had no rate limit, so rows
 * could be written as fast as requests could be sent. The limit added is per
 * address and applies to GUESTS ONLY, because the obvious per-address limit
 * on everyone is the wrong one here: a school lab is thirty signed-in
 * students behind one address.
 *
 *   R-00  control: a guest can start an assessment
 *   R-01  the first 60 from one address are all accepted
 *   R-02  the 61st from that address is refused 429, and no row is written
 *   R-03  a DIFFERENT address is unaffected -- or R-02 would pass against a
 *         limit that is global rather than per address
 *   R-04  THE CASE THAT MATTERS: a signed-in school student at the SAME,
 *         exhausted address still starts an assessment. Without this the
 *         whole suite passes against a limiter that locks a classroom out
 *
 * Uses its own made-up addresses, so the in-memory counters it fills belong
 * to nobody else's suite.
 */
import { build, Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
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

const LIMIT = 60;
const oct = () => 1 + Math.floor(Math.random() * 250);
const LAB = `10.77.${oct()}.${oct()}`;
const ELSEWHERE = `10.78.${oct()}.${oct()}`;
const PAYLOAD = {
  grade: "10", countryId: "uae", curriculum: "MOE National",
  favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["technology"],
};

/** A guest at a given address: its own cookies, no account. */
async function guest(ip) {
  const cookies = new Map();
  const absorb = (res) => {
    for (const raw of (res.headers.getSetCookie?.() ?? [])) {
      const [pair] = raw.split(";"); const i = pair.indexOf("=");
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  };
  absorb(await fetch(`${BASE}/api/auth/user`, { headers: { "x-forwarded-for": ip } }));
  return async () => {
    const res = await fetch(`${BASE}/api/assessments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "x-forwarded-for": ip,
        Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        "X-CSRF-Token": decodeURIComponent(cookies.get("csrf_token") ?? ""),
      },
      body: JSON.stringify(PAYLOAD),
    });
    absorb(res);
    const text = await res.text(); let body = null; try { body = JSON.parse(text); } catch {}
    return { status: res.status, id: body?.id ?? null };
  };
}

const { orgs } = await build();
const made = [];
const rows = async () => (await sql(`SELECT COUNT(*)::int AS n FROM assessments`))[0].n;

try {
  const lab = await guest(LAB);

  // ------------------------------------------------------------------ R-00
  const first = await lab(); if (first.id) made.push(first.id);
  rec("R-00", "control: a guest can start an assessment",
    (first.status === 200 || first.status === 201) && !!first.id, `HTTP ${first.status}`);

  // ------------------------------------------------------------------ R-01
  let accepted = 1; const statuses = new Set();
  for (let i = 1; i < LIMIT; i++) {
    const r = await lab(); statuses.add(r.status);
    if (r.id) { made.push(r.id); accepted++; }
  }
  rec("R-01", `the first ${LIMIT} from one address are all accepted`,
    accepted === LIMIT, `${accepted}/${LIMIT} accepted, statuses seen: ${[...statuses].join(",")}`);

  // ------------------------------------------------------------------ R-02
  {
    const before = await rows();
    const r = await lab(); if (r.id) made.push(r.id);
    const after = await rows();
    rec("R-02", `the ${LIMIT + 1}st is refused 429 and writes no row`,
      r.status === 429 && after === before, `HTTP ${r.status} rows ${before}->${after}`);
  }

  // ------------------------------------------------------------------ R-03
  {
    const other = await guest(ELSEWHERE);
    const r = await other(); if (r.id) made.push(r.id);
    rec("R-03", "a different address is unaffected",
      (r.status === 200 || r.status === 201) && !!r.id, `HTTP ${r.status}`);
  }

  // ------------------------------------------------------------------ R-04
  {
    const student = orgs.A.students[0];
    const s = new Session(`rate-stu-${Date.now()}`);
    s.clientIp = LAB; // the exhausted address
    await s.login(student.username, student.password);
    const r = await s.post("/api/assessments", PAYLOAD);
    if (r.body?.id) made.push(r.body.id);
    const [row] = r.body?.id ? await sql(`SELECT user_id FROM assessments WHERE id = $1`, [r.body.id]) : [];
    rec("R-04", "a signed-in student at the exhausted address still starts one",
      (r.status === 200 || r.status === 201) && !!row?.user_id,
      `HTTP ${r.status} from ${LAB} stored with user=${row?.user_id ? "yes" : "NO"}`);
  }
} finally {
  // One statement, not one per row: the app holds PGlite's only connection.
  if (made.length) await sql(`DELETE FROM assessments WHERE id = ANY($1::varchar[])`, [made]).catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
