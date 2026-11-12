/**
 * THE LICENCE MODEL.
 *
 * One licence = one completed assessment with a generated report. It is spent
 * at report generation, out of a pool that belongs to a school or to a parent
 * account, and the pool is the only thing that bounds how many assessments a
 * student may sit.
 *
 * WHAT THIS REPLACED, AND WHY EACH HALF NEEDED ITS OWN TEST.
 *
 *   Schools were charged at ENROLMENT. organizations.used_licenses was not a
 *   stored total, it was recomputed by counting student rows, so a school that
 *   enrolled 200 and saw 150 finish had still spent 200. Each enrolled student
 *   was then capped at one assessment for life by a boolean that no route
 *   anywhere could reset -- which is why multi-year progression worked for
 *   every population except school students, the one it was built for.
 *
 *   Self-payers were not metered at all. A purchase set the account premium,
 *   and the limit function returned Infinity for any premium account. One
 *   payment bought unlimited reports. The code said the real bound was
 *   users.purchased_licenses; nothing counted against it.
 *
 * L-03 and L-06 are the two assertions that would have failed before this
 * change, in opposite directions: L-03 because a second year was refused, L-06
 * because a fourth report was allowed. The rest guard the edges around them.
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
const A = orgs.A;
const me = A.students[0];

// ------------------------------------------------- L-01  enrolling is free
{
  // The fixture enrols two students into a 50-licence school and completes
  // nothing. Under the old rule this read 2 -- the enrolments themselves.
  const [row] = await sql(
    `SELECT total_licenses, used_licenses, reward_credits_used FROM organizations WHERE id = $1`,
    [A.orgId],
  );
  rec("L-01", "enrolling students spends nothing",
    Number(row.used_licenses) === 0,
    `total=${row.total_licenses} used=${row.used_licenses} reward_used=${row.reward_credits_used}`);
}

// --------------------------------------- L-02  a report spends exactly one
const schoolStu = new Session("schoolStu");
await schoolStu.login(me.username, me.password);
{
  const before = await ledgerCount(`organization_id = $1`, [A.orgId]);
  const r = await completeAssessment(schoolStu, { grade: "10", seed: 1, name: "Student A1" });
  const after = await ledgerCount(`organization_id = $1`, [A.orgId]);
  const [org] = await sql(`SELECT used_licenses FROM organizations WHERE id = $1`, [A.orgId]);

  rec("L-02", "generating a report spends exactly one licence",
    r.generate?.status < 400 && after === before + 1 && Number(org.used_licenses) === after,
    `ledger ${before} -> ${after}, used_licenses=${org.used_licenses}`);
}

// ------------------------- L-03  THE ONE THAT WAS IMPOSSIBLE: a second year
{
  // Same school student, next grade. The old model refused this outright --
  // "Assessment already completed for this allocation" -- with no route
  // anywhere able to grant another. The school has 50 licences; this is the
  // second.
  //
  // THE SCHOOL MOVES THE STUDENT UP FIRST, through its own edit route. This
  // case used to send grade "11" in the student's payload and nothing else —
  // but a school student's grade is the SCHOOL's record, so that assessment
  // was created at grade 10 again: a same-grade repeat labelled as a second
  // year. It passed only because nothing distinguished the two. Since
  // 2026-11-12 a same-grade repeat needs the school's permission
  // (repeat-grade.mjs), which is what made the mislabel visible.
  const moved = await A.session.patch(`/api/admin/organizations/${A.orgId}/members/${me.memberId}`, { grade: "11" });
  if (moved.status >= 400) console.log(`  (L-03 setup: moving the student up failed: HTTP ${moved.status} ${JSON.stringify(moved.body).slice(0, 100)})`);
  const r = await completeAssessment(schoolStu, { grade: "11", seed: 2, name: "Student A1" });
  const spent = await ledgerCount(`student_user_id = $1`, [me.userId]);
  rec("L-03", "a school student can sit a SECOND year (was impossible)",
    r.create.status < 400 && r.generate?.status < 400 && spent === 2,
    r.create.status >= 400
      ? `create refused: HTTP ${r.create.status} ${JSON.stringify(r.create.body).slice(0, 80)}`
      : `${spent} licences spent by this student`);
}

// --------------------------------- L-04  regenerating must not double-charge
{
  const last = (await sql(
    `SELECT assessment_id FROM license_consumptions WHERE student_user_id = $1
     ORDER BY consumed_at DESC LIMIT 1`, [me.userId]))[0]?.assessment_id;
  const before = await ledgerCount(`student_user_id = $1`, [me.userId]);
  const again = await schoolStu.post(`/api/recommendations/generate/${last}`, {});
  const after = await ledgerCount(`student_user_id = $1`, [me.userId]);
  rec("L-04", "regenerating a report does not charge a second time",
    again.status < 400 && after === before,
    `HTTP ${again.status}, ledger ${before} -> ${after}`);
}

// ------------------------------------------ L-05  an exhausted pool refuses
{
  // Drop the school to exactly what it has already spent, so the next create
  // has nothing to draw on. Done in SQL because there is no superadmin route
  // to change a school's licence count -- itself worth noting.
  const spent = await ledgerCount(`organization_id = $1`, [A.orgId]);
  await sql(`UPDATE organizations SET total_licenses = $1 WHERE id = $2`, [spent, A.orgId]);

  const r = await schoolStu.post("/api/assessments", {
    favoriteSubjects: ["Mathematics", "Physics", "English"],
    interests: ["Technology"], countryId: COUNTRY, curriculum: CURRICULUM, grade: "12",
  });
  rec("L-05", "an exhausted school pool refuses a new assessment",
    r.status === 403 && r.body?.code === "NO_LICENCES_AVAILABLE",
    `HTTP ${r.status} ${r.body?.code ?? JSON.stringify(r.body).slice(0, 60)}`);

  await sql(`UPDATE organizations SET total_licenses = 50 WHERE id = $1`, [A.orgId]);
}

// ------------------------------- L-06  a self-payer is bounded by purchases
{
  const sa = new Session("sa");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);
  const tag = Math.random().toString(36).slice(2, 6);
  const created = await sa.post("/api/superadmin/students", {
    firstName: "Self", lastName: "Payer", email: `self.${tag}@futurepath.test`,
  });
  const creds = created.body?.credentials ?? {};
  const solo = new Session("selfPayer");
  await solo.login(creds.username, creds.password);

  // Stand in for a completed purchase of TWO licences, and give the account a
  // child profile so it reads as a parent pool rather than a free account.
  // Licences are granted only by the Stripe webhook and there is still no
  // superadmin route to comp one.
  const [u] = await sql(`SELECT id FROM users WHERE username = $1`, [creds.username]);
  await sql(`UPDATE users SET purchased_licenses = 2, is_premium = true WHERE id = $1`, [u.id]);
  await sql(
    `INSERT INTO child_profiles (guardian_user_id, name, date_of_birth, gender, grade, country_id, curriculum)
     VALUES ($1, 'Self Payer Child', '2010-05-01', 'male', '10', $2, $3)
     ON CONFLICT (guardian_user_id) DO NOTHING`,
    [u.id, COUNTRY, CURRICULUM],
  );

  const first = await completeAssessment(solo, { grade: "10", seed: 3, name: "Self Payer Child" });
  const second = await completeAssessment(solo, { grade: "11", seed: 4, name: "Self Payer Child" });
  const third = await completeAssessment(solo, { grade: "12", seed: 5, name: "Self Payer Child" });
  const spent = await ledgerCount(`guardian_user_id = $1`, [u.id]);

  rec("L-06", "a self-payer gets exactly what they bought, not unlimited",
    first.generate?.status < 400 &&
    second.generate?.status < 400 &&
    third.create.status === 402 &&
    third.create.body?.code === "NO_LICENCES_AVAILABLE" &&
    spent === 2,
    `1st=${first.generate?.status} 2nd=${second.generate?.status} 3rd=${third.create.status} ` +
    `${third.create.body?.code ?? ""}, ledger=${spent} of 2 purchased`);

  // ------------------------------------------- L-07  the balance endpoint
  const bal = await solo.get("/api/licenses/me");
  rec("L-07", "the balance endpoint reports an exhausted pool as zero",
    bal.status === 200 && bal.body?.onPool === true && bal.body?.available === 0,
    `onPool=${bal.body?.onPool} available=${bal.body?.available}`);

  // ------------------------------ L-08  the same-grade repeat warning flag
  // The child profile's grade is 10, and grade 10 was charged in `first`.
  rec("L-08", "a grade already charged for is flagged before a repeat",
    bal.body?.sameGradeAlreadyCharged === true,
    `currentGrade=${bal.body?.currentGrade} alreadyCharged=${bal.body?.sameGradeAlreadyCharged}`);
}

// ------------------------- L-09  reward credits are spent before paid ones
{
  const B = orgs.B;
  const stu = new Session("rewardStu");
  await stu.login(B.students[0].username, B.students[0].password);
  await sql(`UPDATE organizations SET reward_credits = 5 WHERE id = $1`, [B.orgId]);

  const r = await completeAssessment(stu, { grade: "10", seed: 6, name: "Student B1" });
  const [row] = await sql(
    `SELECT currency FROM license_consumptions WHERE organization_id = $1 ORDER BY consumed_at DESC LIMIT 1`,
    [B.orgId],
  );
  const [org] = await sql(
    `SELECT used_licenses, reward_credits_used FROM organizations WHERE id = $1`, [B.orgId]);

  rec("L-09", "a school with reward credits spends those before paid licences",
    r.generate?.status < 400 && row?.currency === "reward" &&
    Number(org.reward_credits_used) === 1 && Number(org.used_licenses) === 0,
    `currency=${row?.currency} reward_used=${org.reward_credits_used} paid_used=${org.used_licenses}`);
}

// ------------------- L-10  a departing student's unspent licence stays home
{
  const before = await ledgerCount(`organization_id = $1`, [A.orgId]);
  const other = A.students[1];

  // THE ROUTE TAKES A MEMBER ROW ID, NOT A USER ID. Passing the user id
  // returns 404 "Member not found", the ledger trivially does not move, and
  // the assertion passes having removed nobody -- which is what the first
  // version of this test did. The removal has to be asserted as having
  // happened before "nothing changed" means anything.
  const [memberRow] = await sql(
    `SELECT id FROM organization_members WHERE user_id = $1 AND organization_id = $2`,
    [other.userId, A.orgId],
  );

  // This student never completed anything, so there is nothing of theirs on
  // the ledger. Removing them must not change the school's balance -- under
  // the old enrolment-counting rule it would have handed back a licence that
  // was never really spent, because the total moved on a roster change rather
  // than on a report.
  // `erase` rather than `detach`: the route requires an explicit disposition,
  // and erase is what recommendedDisposition() returns for a student with no
  // completed assessment -- there is no report of theirs for the school to
  // keep read access to.
  const del = await A.session.req(
    "DELETE",
    `/api/admin/organizations/${A.orgId}/members/${memberRow?.id}`,
    { disposition: "erase" },
  );
  const stillEnrolled = Number(
    (await sql(`SELECT COUNT(*)::int AS n FROM organization_members WHERE id = $1`, [memberRow?.id]))[0].n,
  );
  const after = await ledgerCount(`organization_id = $1`, [A.orgId]);

  rec("L-10", "removing a student who never finished changes nothing spent",
    del.status < 400 && stillEnrolled === 0 && after === before,
    `HTTP ${del.status}, member rows left=${stillEnrolled}, ledger ${before} -> ${after}`);
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
console.log(`\n${"=".repeat(78)}`);
console.log(`licences: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
