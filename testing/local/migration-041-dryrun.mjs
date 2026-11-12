/**
 * MIGRATION 041 — EXECUTED, NOT READ.
 *
 * schema-push marks every migration applied without running it, so this file
 * is the only place 041's SQL runs before production boot.
 *
 *   M-01  the UP runs, from the file on disk
 *   M-02  an individual buyer's completed PREMIUM report gains exactly one row,
 *         on their own pool, with the assessment's grade
 *   M-03  CONTROL: the same buyer's FREE report (taken before the purchase)
 *         gains none — or M-02 would pass against "charge every assessment"
 *   M-04  CONTROL: an UNFINISHED premium assessment gains none
 *   M-05  CONTROL: a free account gains none
 *   M-06  CONTROL: a school student and a school admin gain none from this
 *   M-07  CONTROL: a child-profile account is left to 029's rule — no row added
 *   M-08  CONTROL: a superadmin by role gains none
 *   M-09  running the UP twice adds nothing
 *   M-10  the DOWN in the comment block removes the individual's row and
 *         leaves a school's row alone
 *   M-11  the UP works again after the DOWN
 */
import { readFileSync } from "fs";

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

const FILE = "server/migrations/041_backfill_individual_consumptions.sql";
const raw = readFileSync(FILE, "utf8");
const marker = "-- DOWN (manual, not run by the runner):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN block to test`);
const upSql = raw.slice(0, idx);
const downSql = raw
  .slice(idx + marker.length)
  .split("\n")
  .map((l) => l.replace(/^--\s{0,3}/, "").trim())
  .filter((l) => l.length > 0 && !l.startsWith("--"))
  .join("\n");

const tag = Math.random().toString(36).slice(2, 7);
const mkUser = async (label, { premium = false, role = "user", type = "individual" } = {}) =>
  (await sql(
    `INSERT INTO users (id, username, email, first_name, account_type, role, is_premium, purchased_licenses, password_hash)
     VALUES (gen_random_uuid(), $1, $2, 'M41', $3, $4, $5, $6, '$2b$10$notarealhashbutnotnull') RETURNING id`,
    [`m41${label}${tag}`, `m41.${label}.${tag}@futurepath.test`, type, role, premium, premium ? 1 : 0],
  ))[0].id;
const mkAssessment = async (userId, { type = "premium", done = true, grade = "11" } = {}) =>
  (await sql(
    `INSERT INTO assessments
       (id, user_id, is_guest, name, grade, country_id, assessment_type, favorite_subjects, interests,
        current_step, is_completed, completed_at, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, false, 'M41', $2, 'uae', $3, ARRAY['Mathematics','Science','English'],
             ARRAY['Technology'], 7, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, NOW(), NOW()) RETURNING id`,
    [userId, grade, type, done],
  ))[0].id;
const rowsFor = async (assessmentId) =>
  sql(`SELECT pool_owner_type, guardian_user_id, student_user_id, grade, currency
         FROM license_consumptions WHERE assessment_id = $1`, [assessmentId]);

const made = { users: [], orgs: [] };
try {
  // The buyer: one premium report, one free report from before the purchase,
  // one premium assessment still in progress.
  const buyer = await mkUser("buyer", { premium: true });
  const aPremium = await mkAssessment(buyer, { grade: "11" });
  const aFree = await mkAssessment(buyer, { type: "basic" });
  const aOpen = await mkAssessment(buyer, { done: false });

  const free = await mkUser("free");
  const aFreeAcct = await mkAssessment(free, { type: "basic" });

  const admin = await mkUser("admin", { premium: true, type: "org_admin" });
  const student = await mkUser("stud", { type: "org_student" });
  const [org] = await sql(
    `INSERT INTO organizations (id, name, admin_user_id, total_licenses, used_licenses, country_id)
     VALUES (gen_random_uuid(), $1, $2, 10, 0, 'uae') RETURNING id`, [`M41 School ${tag}`, admin]);
  made.orgs.push(org.id);
  await sql(`INSERT INTO organization_members (id, organization_id, user_id, role) VALUES (gen_random_uuid(), $1, $2, 'admin')`, [org.id, admin]);
  await sql(
    `INSERT INTO organization_members (id, organization_id, user_id, role, student_name, student_gender, grade, date_of_birth)
     VALUES (gen_random_uuid(), $1, $2, 'student', 'M41 Student', 'female', '10', '2010-05-01')`, [org.id, student]);
  const aAdmin = await mkAssessment(admin);
  const aStudent = await mkAssessment(student, { grade: "10" });
  // The school's own charge, as the live code would have written it — the row
  // the DOWN must not touch.
  await sql(
    `INSERT INTO license_consumptions (pool_owner_type, organization_id, student_user_id, assessment_id, grade, currency)
     VALUES ('organization', $1, $2, $3, '10', 'paid')`, [org.id, student, aStudent]);

  const parent = await mkUser("parent", { premium: true });
  await sql(
    `INSERT INTO child_profiles (guardian_user_id, name, date_of_birth, gender, grade, country_id, curriculum)
     VALUES ($1, 'M41 Child', '2010-05-01', 'male', '10', 'uae', 'MOE National')`, [parent]);
  const aParent = await mkAssessment(parent);

  const superadmin = await mkUser("super", { premium: true, role: "superadmin" });
  const aSuper = await mkAssessment(superadmin);
  made.users.push(buyer, free, admin, student, parent, superadmin);

  const total = async () => Number((await sql(`SELECT COUNT(*)::int n FROM license_consumptions`))[0].n);
  const before = await total();

  let upErr = null;
  try { await sql(upSql); } catch (e) { upErr = e.message; }
  rec("M-01", "the UP runs from the file on disk", upErr === null, upErr ?? "");

  const r = await rowsFor(aPremium);
  rec("M-02", "an individual buyer's premium report gains exactly one row",
    r.length === 1 && r[0].pool_owner_type === "user" && r[0].guardian_user_id === buyer &&
    r[0].student_user_id === buyer && r[0].grade === "11" && r[0].currency === "paid",
    `rows=${r.length} owner=${r[0]?.pool_owner_type} grade=${r[0]?.grade}`);
  rec("M-03", "CONTROL: the buyer's free report gains none", (await rowsFor(aFree)).length === 0);
  rec("M-04", "CONTROL: an unfinished premium assessment gains none", (await rowsFor(aOpen)).length === 0);
  rec("M-05", "CONTROL: a free account gains none", (await rowsFor(aFreeAcct)).length === 0);
  const sRows = await rowsFor(aStudent);
  rec("M-06", "CONTROL: school student and school admin gain none",
    (await rowsFor(aAdmin)).length === 0 && sRows.length === 1 && sRows[0].pool_owner_type === "organization",
    `admin=${(await rowsFor(aAdmin)).length} student=${sRows.length}/${sRows[0]?.pool_owner_type}`);
  rec("M-07", "CONTROL: a child-profile account gains none from this", (await rowsFor(aParent)).length === 0);
  rec("M-08", "CONTROL: a superadmin by role gains none", (await rowsFor(aSuper)).length === 0);

  const afterFirst = await total();
  await sql(upSql);
  const afterSecond = await total();
  rec("M-09", "running the UP twice adds nothing",
    afterSecond === afterFirst && afterFirst === before + 1,
    `${before} -> ${afterFirst} -> ${afterSecond}`);

  let downErr = null;
  try { await sql(downSql); } catch (e) { downErr = e.message; }
  rec("M-10", "the DOWN removes the individual's row and leaves the school's",
    downErr === null && (await rowsFor(aPremium)).length === 0 && (await rowsFor(aStudent)).length === 1,
    downErr ?? `individual=${(await rowsFor(aPremium)).length} school=${(await rowsFor(aStudent)).length}`);

  await sql(upSql);
  rec("M-11", "the UP works again after the DOWN", (await rowsFor(aPremium)).length === 1);
} finally {
  // One statement: PGlite has one connection and the app holds it.
  const ids = made.users.map((u) => `'${u}'`).join(",") || "''";
  const oids = made.orgs.map((o) => `'${o}'`).join(",") || "''";
  await sql(`
    DELETE FROM license_consumptions WHERE student_user_id IN (${ids});
    DELETE FROM assessments WHERE user_id IN (${ids});
    DELETE FROM child_profiles WHERE guardian_user_id IN (${ids});
    DELETE FROM organization_members WHERE user_id IN (${ids});
    DELETE FROM organizations WHERE id IN (${oids});
    DELETE FROM users WHERE id IN (${ids});`).catch((e) => console.log("cleanup:", e.message));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
