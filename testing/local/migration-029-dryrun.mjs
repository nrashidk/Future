/**
 * DRY RUN FOR MIGRATION 029 — the licence ledger.
 *
 * Staging is unreachable from this sandbox, so this is the next best thing and
 * in one way a better thing: it builds real rows through the real application,
 * REGRESSES them to the pre-029 model by hand, then runs the migration file
 * itself and checks what came out. Nothing here is a reimplementation of the
 * migration -- the SQL under test is read off disk and executed verbatim.
 *
 * The two populations the migration has to get right, and what "right" means:
 *
 *   A SCHOOL was charged at enrolment. used_licenses was the number of
 *   students on the roll, finished or not. After the migration it must be the
 *   number of REPORTS, which is always less than or equal to the roll -- so a
 *   school either keeps its balance or gets licences back, and can never lose
 *   one. This asserts that direction explicitly, because a migration that
 *   silently took capacity away from a paying customer is the failure that
 *   matters here.
 *
 *   A SELF-PAYER was never charged at all. One purchase bought unlimited
 *   reports. After the migration their past reports appear on the ledger, so
 *   an account that took more than it bought starts at zero available rather
 *   than being refunded or retroactively billed: it stops, it is not punished.
 */
import { readFile } from "fs/promises";
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const PORT = process.env.PGLITE_TCP_PORT ?? 55432;

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(56)} ${note}`);
};

const { Client } = await import("pg");
const client = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

function riasec30(seed) {
  const out = {};
  for (const t of ["R", "I", "A", "S", "E", "C"]) for (let i = 1; i <= 5; i++) out[`${t}${i}`] = ((i + t.charCodeAt(0) + seed) % 5) + 1;
  return out;
}
let items = null;
async function cvqAll(seed) {
  items ??= (await (await fetch(`${BASE}/api/cvq/items`)).json()).items ?? [];
  const out = {};
  items.forEach((it, i) => { out[it.id] = ((i + seed) % 5) + 1; });
  return out;
}
async function complete(session, grade, seed, name) {
  const c = await session.post("/api/assessments", {
    favoriteSubjects: ["Mathematics", "Physics", "English"],
    interests: ["Technology", "Healthcare", "Business"],
    countryId: "uae", curriculum: "MOE National", grade,
    riasecResponses: riasec30(seed), cvqResponses: await cvqAll(seed),
  });
  const id = c.body?.id;
  if (!id) return null;
  const g = await session.post(`/api/assessments/${id}/quiz/generate`, {});
  const qs = g.body?.questions ?? [];
  if (qs.length) {
    await session.post(`/api/assessments/${id}/quiz/submit`, {
      responses: qs.map((x) => ({ questionId: x.id, answer: (Array.isArray(x.options) ? x.options[0] : null)?.text ?? "a" })),
    });
  }
  await session.patch(`/api/assessments/${id}`, {
    name, age: 15, interests: ["Technology", "Healthcare", "Business"],
    careerAspirations: ["Doctor"], currentStep: 6,
  });
  await session.post("/api/cvq/submit", { assessmentId: id, responses: await cvqAll(seed), durationSeconds: 120 });
  const r = await session.post(`/api/recommendations/generate/${id}`, {});
  return r.status < 400 ? id : null;
}

console.log("\nbuilding real rows through the application...\n");
const { orgs } = await build();
const A = orgs.A;

// A school student who finishes, out of a roll of two.
const stu = new Session("dryStu");
await stu.login(A.students[0].username, A.students[0].password);
await complete(stu, "10", 1, "Student A1");

// A self-payer who bought ONE and took THREE -- the unbounded case.
const sa = new Session("sa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const tag = Math.random().toString(36).slice(2, 6);
const made = await sa.post("/api/superadmin/students", {
  firstName: "Over", lastName: "Spender", email: `over.${tag}@futurepath.test`,
});
const creds = made.body?.credentials ?? {};
const solo = new Session("overSpender");
await solo.login(creds.username, creds.password);
const [su] = await q(`SELECT id FROM users WHERE username = $1`, [creds.username]);
await q(`UPDATE users SET purchased_licenses = 1, is_premium = true WHERE id = $1`, [su.id]);
await q(
  `INSERT INTO child_profiles (guardian_user_id, name, date_of_birth, gender, grade, country_id, curriculum)
   VALUES ($1,'Over Spender Child','2010-05-01','male','10','uae','MOE National')
   ON CONFLICT (guardian_user_id) DO NOTHING`, [su.id]);

// Three reports on one purchase. The ledger exists in this sandbox, so the
// third would be refused by today's code -- the licences are topped up here to
// MANUFACTURE the pre-029 state the migration has to cope with, which is
// exactly an account that took more than it paid for.
await q(`UPDATE users SET purchased_licenses = 99 WHERE id = $1`, [su.id]);
for (const [i, g] of ["10", "11", "12"].entries()) await complete(solo, g, 10 + i, "Over Spender Child");
await q(`UPDATE users SET purchased_licenses = 1 WHERE id = $1`, [su.id]);

// ----------------------------------------------- REGRESS TO THE OLD MODEL
console.log("\nregressing to the pre-029 model...\n");
await q(`DROP TABLE IF EXISTS license_consumptions`);
await q(`DELETE FROM schema_migrations WHERE name LIKE '029%'`);
// used_licenses as the old code computed it: the roster, not the reports.
await q(`
  UPDATE organizations o SET used_licenses = COALESCE(c.paid,0), reward_credits_used = COALESCE(c.reward,0)
  FROM (SELECT organization_id,
               COUNT(*) FILTER (WHERE license_source='paid')   AS paid,
               COUNT(*) FILTER (WHERE license_source='reward') AS reward
        FROM organization_members WHERE role='student' GROUP BY organization_id) c
  WHERE c.organization_id = o.id`);

const beforeOrg = (await q(
  `SELECT total_licenses, used_licenses FROM organizations WHERE id = $1`, [A.orgId]))[0];
const enrolled = Number((await q(
  `SELECT COUNT(*)::int n FROM organization_members WHERE organization_id=$1 AND role='student'`, [A.orgId]))[0].n);
const reports = Number((await q(
  `SELECT COUNT(*)::int n FROM assessments a JOIN organization_members m ON m.user_id=a.user_id
   WHERE m.organization_id=$1 AND m.role='student' AND a.is_completed`, [A.orgId]))[0].n);

console.log(`  school:     ${enrolled} enrolled, ${reports} finished, used_licenses=${beforeOrg.used_licenses} (old rule: counts enrolments)`);
console.log(`  self-payer: purchased 1, completed 3, nothing counting it\n`);

// ------------------------------------------------------ RUN THE MIGRATION
console.log("running server/migrations/029_license_consumptions.sql ...\n");
const sqlText = await readFile("server/migrations/029_license_consumptions.sql", "utf8");
let migrationError = null;
try {
  await client.query("BEGIN");
  await client.query(sqlText);
  await client.query("COMMIT");
} catch (e) {
  await client.query("ROLLBACK");
  migrationError = e;
}
rec("M-01", "the migration applies cleanly in one transaction", !migrationError,
  migrationError ? String(migrationError.message).slice(0, 160) : "committed");
if (migrationError) process.exit(1);

// ------------------------------------------------------------- ASSERTIONS
const afterOrg = (await q(
  `SELECT total_licenses, used_licenses, reward_credits_used FROM organizations WHERE id=$1`, [A.orgId]))[0];
const schoolLedger = Number((await q(
  `SELECT COUNT(*)::int n FROM license_consumptions WHERE organization_id=$1`, [A.orgId]))[0].n);

rec("M-02", "the school's spend is now its reports, not its roll",
  schoolLedger === reports && Number(afterOrg.used_licenses) === reports,
  `ledger=${schoolLedger} reports=${reports} used_licenses ${beforeOrg.used_licenses} -> ${afterOrg.used_licenses}`);

rec("M-03", "the school never loses capacity in the move",
  Number(afterOrg.used_licenses) <= Number(beforeOrg.used_licenses),
  `available ${beforeOrg.total_licenses - beforeOrg.used_licenses} -> ${afterOrg.total_licenses - afterOrg.used_licenses}`);

const soloLedger = Number((await q(
  `SELECT COUNT(*)::int n FROM license_consumptions WHERE guardian_user_id=$1`, [su.id]))[0].n);
rec("M-04", "the self-payer's past reports all appear on the ledger",
  soloLedger === 3, `${soloLedger} of 3 completed reports recorded`);

const [soloUser] = await q(`SELECT purchased_licenses FROM users WHERE id=$1`, [su.id]);
const available = Math.max(0, Number(soloUser.purchased_licenses) - soloLedger);
rec("M-05", "an over-spent account stops at zero, not refunded or billed",
  available === 0 && Number(soloUser.purchased_licenses) === 1,
  `purchased=${soloUser.purchased_licenses} spent=${soloLedger} available=${available}`);

// One charge per report, never two: the unique constraint is what makes
// regeneration free, and the backfill must not have doubled anything.
const dupes = Number((await q(
  `SELECT COUNT(*)::int n FROM (SELECT assessment_id FROM license_consumptions
   GROUP BY assessment_id HAVING COUNT(*) > 1) d`))[0].n);
rec("M-06", "no assessment is charged twice", dupes === 0, `${dupes} duplicated`);

// Nothing on the ledger may be an unpaid population.
const orphans = Number((await q(
  `SELECT COUNT(*)::int n FROM license_consumptions lc
   LEFT JOIN organization_members m ON m.user_id = lc.student_user_id AND m.role='student'
   LEFT JOIN child_profiles cp ON cp.guardian_user_id = lc.guardian_user_id
   WHERE m.id IS NULL AND cp.id IS NULL`))[0].n);
rec("M-07", "no free or guest assessment was charged", orphans === 0, `${orphans} unattributable rows`);

// Re-running the migration must be harmless: the runner records it, but a
// hand-run during recovery should not double anything either.
const beforeRerun = Number((await q(`SELECT COUNT(*)::int n FROM license_consumptions`))[0].n);
await client.query(sqlText);
const afterRerun = Number((await q(`SELECT COUNT(*)::int n FROM license_consumptions`))[0].n);
rec("M-08", "re-running the migration changes nothing", beforeRerun === afterRerun,
  `${beforeRerun} -> ${afterRerun}`);

// The documented rollback has to actually work.
let downError = null;
try {
  await client.query(`DROP TABLE license_consumptions`);
  await client.query(`
    UPDATE organizations o SET used_licenses = COALESCE(c.paid,0), reward_credits_used = COALESCE(c.reward,0)
    FROM (SELECT organization_id,
                 COUNT(*) FILTER (WHERE license_source='paid')   AS paid,
                 COUNT(*) FILTER (WHERE license_source='reward') AS reward
          FROM organization_members WHERE role='student' GROUP BY organization_id) c
    WHERE c.organization_id = o.id`);
} catch (e) { downError = e; }
const rolledBack = (await q(`SELECT used_licenses FROM organizations WHERE id=$1`, [A.orgId]))[0];
rec("M-09", "the documented rollback restores the old counters", !downError &&
  Number(rolledBack.used_licenses) === Number(beforeOrg.used_licenses),
  downError ? String(downError.message).slice(0, 120) : `used_licenses back to ${rolledBack.used_licenses}`);

await client.end();

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`migration 029 dry run: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
