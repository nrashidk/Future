/**
 * AN INDIVIDUAL BUYER IS METERED.
 *
 * A premium account with no child profile and no school -- what the public
 * checkout creates for a single buyer -- was on no licence pool at all. The
 * model knew a school's pool and a child profile's, and `licences.mjs` L-06
 * gives its "self-payer" a child profile precisely so that it reads as one.
 * The account without one was never tested, and on production one licence
 * bought any number of premium reports with nothing on the ledger.
 *
 *   S-01  two licences buy two reports, each charged once on the buyer's pool
 *   S-02  the third is refused at CREATE: 402 NO_LICENCES_AVAILABLE, and no
 *         assessment row is written
 *   S-03  the balance route says onPool with nothing left (it said
 *         onPool:false, which the client rendered as nothing at all)
 *   S-04  regenerating a report already charged for costs nothing
 *   S-05  CONTROL: a FREE account is still on no pool and still starts an
 *         assessment -- or everything above passes against "refuse everyone"
 *
 * Judged by the ledger and the assessment rows, never by a status alone.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const COUNTRY = "uae";
const CURRICULUM = "MOE National";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(56)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await client.connect();
  try {
    const { rows } = await client.query(text, params);
    return rows;
  } finally {
    await client.end();
  }
}

const ledgerCount = async (where, params) =>
  Number((await sql(`SELECT COUNT(*)::int AS n FROM license_consumptions WHERE ${where}`, params))[0].n);

function riasec30(seed) {
  const out = {};
  for (const theme of ["R", "I", "A", "S", "E", "C"]) {
    for (let i = 1; i <= 5; i++) out[`${theme}${i}`] = ((i + theme.charCodeAt(0) + seed) % 5) + 1;
  }
  return out;
}
let cvqCache = null;
async function cvqAll(seed) {
  cvqCache ??= (await (await fetch(`${BASE}/api/cvq/items`)).json()).items ?? [];
  const out = {};
  cvqCache.forEach((item, i) => { out[item.id] = ((i + seed) % 5) + 1; });
  return out;
}

/**
 * Take one assessment all the way to a generated report -- which is the only
 * thing that spends a licence. Returns the create and generate responses so a
 * caller can assert on either end: a pool can refuse at create (nothing is
 * spent, so the student is not walked through an assessment nobody can pay
 * for) or at generate (authoritative).
 */
async function completeAssessment(session, { grade, seed = 0, name = "Licence Test" }) {
  const create = await session.post("/api/assessments", {
    favoriteSubjects: ["Mathematics", "Physics", "English"],
    interests: ["Technology", "Healthcare", "Business"],
    countryId: COUNTRY, curriculum: CURRICULUM, grade,
    riasecResponses: riasec30(seed), cvqResponses: await cvqAll(seed),
  });
  const id = create.body?.id;
  if (!id) return { create, generate: null, id: null };

  const gen = await session.post(`/api/assessments/${id}/quiz/generate`, {});
  const qs = gen.body?.questions ?? [];
  if (qs.length) {
    await session.post(`/api/assessments/${id}/quiz/submit`, {
      responses: qs.map((q) => {
        const opt = Array.isArray(q.options) ? q.options[(seed + 1) % q.options.length] : null;
        return { questionId: q.id, answer: typeof opt === "string" ? opt : (opt?.text ?? "a") };
      }),
    });
  }
  await session.patch(`/api/assessments/${id}`, {
    name, age: 15, interests: ["Technology", "Healthcare", "Business"],
    careerAspirations: ["Doctor", "Engineer"], currentStep: 6,
  });
  await session.post("/api/cvq/submit", { assessmentId: id, responses: await cvqAll(seed), durationSeconds: 120 });
  const generate = await session.post(`/api/recommendations/generate/${id}`, {});
  return { create, generate, id };
}


const sa = new Session("sa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const tag = Math.random().toString(36).slice(2, 6);
async function account(first) {
  const created = await sa.post("/api/superadmin/students", {
    firstName: first, lastName: "Solo", email: `${first.toLowerCase()}.${tag}@futurepath.test`,
  });
  const creds = created.body?.credentials ?? {};
  const s = new Session(first);
  await s.login(creds.username, creds.password);
  const [u] = await sql(`SELECT id FROM users WHERE username = $1`, [creds.username]);
  return { s, id: u.id };
}
const assessmentCount = async (id) =>
  Number((await sql(`SELECT COUNT(*)::int n FROM assessments WHERE user_id = $1`, [id]))[0].n);

const buyer = await account("Buyer");
await sql(`UPDATE users SET purchased_licenses = 2, is_premium = true WHERE id = $1`, [buyer.id]);

const first = await completeAssessment(buyer.s, { grade: "10", seed: 1, name: "Buyer Solo" });
const afterFirst = await ledgerCount(`guardian_user_id = $1 AND pool_owner_type = 'user'`, [buyer.id]);
const second = await completeAssessment(buyer.s, { grade: "11", seed: 2, name: "Buyer Solo" });
const afterSecond = await ledgerCount(`guardian_user_id = $1 AND pool_owner_type = 'user'`, [buyer.id]);
rec("S-01", "two licences buy two reports, each charged once",
  first.generate?.status === 200 && second.generate?.status === 200 &&
  first.generate?.body?.count > 0 && afterFirst === 1 && afterSecond === 2,
  `generate=${first.generate?.status}/${second.generate?.status} ledger 0 -> ${afterFirst} -> ${afterSecond}`);

const rowsBefore = await assessmentCount(buyer.id);
const third = await completeAssessment(buyer.s, { grade: "12", seed: 3, name: "Buyer Solo" });
const rowsAfter = await assessmentCount(buyer.id);
rec("S-02", "the third is refused at create and writes no assessment",
  third.create.status === 402 && third.create.body?.code === "NO_LICENCES_AVAILABLE" && rowsAfter === rowsBefore,
  `HTTP ${third.create.status} ${third.create.body?.code ?? ""} assessments ${rowsBefore} -> ${rowsAfter}`);

const bal = await buyer.s.get("/api/licenses/me");
rec("S-03", "the balance route reports the buyer's own pool, empty",
  bal.body?.onPool === true && bal.body?.poolOwnerType === "user" && bal.body?.available === 0,
  `onPool=${bal.body?.onPool} owner=${bal.body?.poolOwnerType} available=${bal.body?.available}`);

const again = await buyer.s.post(`/api/recommendations/generate/${first.id}`, {});
const afterAgain = await ledgerCount(`guardian_user_id = $1`, [buyer.id]);
rec("S-04", "regenerating a charged report costs nothing",
  again.status === 200 && afterAgain === 2, `HTTP ${again.status} ledger=${afterAgain}`);

const free = await account("Free");
const freeBal = await free.s.get("/api/licenses/me");
const freeRun = await completeAssessment(free.s, { grade: "10", seed: 4, name: "Free Solo" });
const freeLedger = await ledgerCount(`student_user_id = $1`, [free.id]);
rec("S-05", "CONTROL: a free account is on no pool and still starts one",
  freeBal.body?.onPool === false && freeRun.create.status === 200 && !!freeRun.id && freeLedger === 0,
  `onPool=${freeBal.body?.onPool} create=${freeRun.create.status} ledger=${freeLedger}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
