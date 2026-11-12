/**
 * A SUPERADMIN GIVES AN INDIVIDUAL ACCOUNT LICENCES.
 *
 * "Add Users" creates a FREE account, and until this route there was no way
 * to make it anything else: the Users directory did not even list it (it
 * showed premium individuals only), and an individual buyer who had used
 * their licences could be helped only by a database edit.
 *
 *   I-01  a new "Add Users" account is free, on no pool -- and IS listed
 *   I-02  giving 2 makes it premium with 2, and the pool reports 2 available
 *   I-03  the licences are real: a report is generated and charged, 2 -> 1
 *   I-04  giving again ADDS (2 + 3 = 5), it does not replace
 *   I-05  a school admin, a school student and a guest are refused, and the
 *         figure does not move
 *   I-06  a school account as the TARGET is refused, figure unmoved
 *   I-07  zero, a negative, a fraction, a string and 1001 are refused
 *   I-08  an unknown user is 404 JSON, not the SPA's 200
 *   I-09  a superadmin is marked as one in the list, and refused licences
 *
 * Every refusal is judged by the stored figure, not the status.
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



const { orgs } = await build();
const sa = new Session("sa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const tag = Math.random().toString(36).slice(2, 6);
const created = await sa.post("/api/superadmin/students", {
  firstName: "Given", lastName: "Licence", email: `given.${tag}@futurepath.test`,
});
const creds = created.body?.credentials ?? {};
const [u] = await sql(`SELECT id FROM users WHERE username = $1`, [creds.username]);
const me = new Session("given");
await me.login(creds.username, creds.password);
const figure = async (id = u.id) =>
  (await sql(`SELECT purchased_licenses AS n, is_premium AS p FROM users WHERE id = $1`, [id]))[0];
const give = (session, id, count) => session.post(`/api/superadmin/users/${id}/licences`, { count });

const list0 = await sa.get("/api/superadmin/students");
const listed = (list0.body ?? []).find?.((r) => r.user?.id === u.id);
const bal0 = await me.get("/api/licenses/me");
const f0 = await figure();
rec("I-01", "a new Add Users account is free, on no pool, and listed",
  f0.p === false && Number(f0.n ?? 0) === 0 && bal0.body?.onPool === false && !!listed && listed.user.isPremium === false && Array.isArray(list0.body),
  `premium=${f0.p} licences=${f0.n} onPool=${bal0.body?.onPool} listed=${!!listed} keys=${listed ? Object.keys(listed.user).includes('purchasedLicenses') : '-'}`);

// The superadmin's own account is an `individual` too: it must be marked,
// or the screen offers it a button I-09's refusal then has to explain.
const saRow = (list0.body ?? []).find((r) => r.user?.username === SUPERADMIN.username);
const saGive = saRow ? await give(sa, saRow.user.id, 5) : { status: 0 };
const [saFig] = saRow ? await sql(`SELECT purchased_licenses AS n FROM users WHERE id = $1`, [saRow.user.id]) : [{}];
rec("I-09", "a superadmin is marked in the list, and refused licences",
  !!saRow && saRow.isSuperadmin === true && listed.isSuperadmin === false &&
  saGive.status === 409 && saGive.body?.code === "TARGET_IS_SUPERADMIN" && Number(saFig.n ?? 0) === 0,
  `marked=${saRow?.isSuperadmin} other=${listed?.isSuperadmin} give=${saGive.status} ${saGive.body?.code ?? ""} stored=${saFig.n ?? 0}`);

const g1 = await give(sa, u.id, 2);
const f1 = await figure();
const bal1 = await me.get("/api/licenses/me");
rec("I-02", "giving 2 makes it premium with 2 available",
  g1.status === 200 && g1.body?.purchasedLicenses === 2 && f1.p === true && Number(f1.n) === 2 &&
  bal1.body?.onPool === true && bal1.body?.available === 2,
  `HTTP ${g1.status} stored=${f1.n}/${f1.p} available=${bal1.body?.available}`);

const run = await completeAssessment(me, { grade: "10", seed: 1, name: "Given Licence" });
const led = await ledgerCount(`guardian_user_id = $1 AND pool_owner_type = 'user'`, [u.id]);
const bal2 = await me.get("/api/licenses/me");
rec("I-03", "the licences are real: one report, one charge, 2 -> 1",
  run.generate?.status === 200 && run.generate?.body?.count > 0 && led === 1 && bal2.body?.available === 1,
  `generate=${run.generate?.status} ledger=${led} available=${bal2.body?.available}`);

const g2 = await give(sa, u.id, 3);
const f2 = await figure();
rec("I-04", "giving again adds: 2 + 3 = 5",
  g2.status === 200 && Number(f2.n) === 5 && g2.body?.purchasedLicenses === 5, `HTTP ${g2.status} stored=${f2.n}`);

const admin = orgs.A.session;
const student = new Session("studA"); await student.login(orgs.A.students[0].username, orgs.A.students[0].password);
const guest = new Session("guest"); await guest.get("/api/reference"); // a first GET, or CSRF answers before auth
const rA = await give(admin, u.id, 50);
const rS = await give(student, u.id, 50);
const rG = await give(guest, u.id, 50);
const f3 = await figure();
rec("I-05", "school admin, student and guest are refused; figure unmoved",
  rA.status === 403 && rS.status === 403 && rG.status === 401 && Number(f3.n) === 5,
  `admin=${rA.status} student=${rS.status} guest=${rG.status} stored=${f3.n}`);

const stu = { id: orgs.A.students[0].userId };
const before = await figure(stu.id);
const rT = await give(sa, stu.id, 5);
const after = await figure(stu.id);
rec("I-06", "a school account as the target is refused; figure unmoved",
  rT.status === 409 && rT.body?.code === "NOT_AN_INDIVIDUAL" && Number(after.n ?? 0) === Number(before.n ?? 0) && after.p === before.p,
  `HTTP ${rT.status} ${rT.body?.code ?? ""} ${before.n}->${after.n}`);

const bad = [];
for (const c of [0, -3, 1.5, "4", 1001]) bad.push((await give(sa, u.id, c)).status);
const f4 = await figure();
rec("I-07", "0, -3, 1.5, \"4\" and 1001 are refused; figure unmoved",
  bad.every((s) => s === 400) && Number(f4.n) === 5, `statuses=${bad.join("/")} stored=${f4.n}`);

const r404 = await give(sa, "00000000-0000-0000-0000-000000000000", 1);
rec("I-08", "an unknown user is a JSON 404",
  r404.status === 404 && r404.body?.message === "User not found", `HTTP ${r404.status} ${r404.body?.message ?? "(no json)"}`);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
