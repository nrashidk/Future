/**
 * DRY RUN FOR MIGRATION 030 — removing curricula that have no subjects.
 *
 * UAE offers four curricula and only MOE National has any subjects behind it.
 * Because the assessment makes a student choose three subjects, picking one of
 * the other three is a dead end at the first step, not a degraded experience.
 *
 * THE RISK THIS SCRIPT EXISTS TO MEASURE is not the removal, it is the
 * removal going too far. An earlier migration added validation that refuses an
 * organization or assessment whose curriculum its country does not offer. So
 * dropping a curriculum that is still referenced would convert existing,
 * working rows into permanently invalid ones -- trading a dead end for a
 * lockout, which is worse.
 *
 * Hence three cases, and the middle two are the ones that matter:
 *
 *   1. nothing references the empty curricula  -> all three are removed
 *   2. a school is set to one                  -> that one SURVIVES
 *   3. an assessment records one               -> that one SURVIVES
 *
 * Rows are created through the application rather than by hand-written INSERTs
 * so the script cannot drift from the real schema -- an earlier attempt at
 * this guessed column names, and a skipped setup step made a protected case
 * look like a protection failure.
 */
import { readFile } from "fs/promises";
import { build } from "./fixtures.mjs";

const PORT = process.env.PGLITE_TCP_PORT ?? 55432;
const COUNTRY = "uae";
const ORIGINAL = ["MOE National", "British", "American", "IB"];

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(52)} ${note}`);
};

const { Client } = await import("pg");
const client = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${PORT}/postgres` });
await client.connect();
const q = async (text, params = []) => (await client.query(text, params)).rows;

const SQL = await readFile("server/migrations/030_drop_empty_curricula.sql", "utf8");
const curricula = async () =>
  (await q(`SELECT curricula FROM countries WHERE id = $1`, [COUNTRY]))[0].curricula;
const reset = () =>
  q(`UPDATE countries SET curricula = $1 WHERE id = $2`, [ORIGINAL, COUNTRY]);

// Real rows, built by the application.
const { orgs } = await build();
const A = orgs.A;
const [orgRow] = await q(`SELECT id, country_id, curriculum FROM organizations WHERE id = $1`, [A.orgId]);
console.log(`\nfixture school: country=${orgRow.country_id} curriculum=${orgRow.curriculum}\n`);

// Which curricula actually have subjects, read rather than assumed.
const withSubjects = (await q(
  `SELECT DISTINCT curriculum FROM subjects WHERE country_id = $1 AND is_active`, [COUNTRY]
)).map((r) => r.curriculum);
console.log(`curricula with subjects: ${JSON.stringify(withSubjects)}`);
console.log(`curricula offered:       ${JSON.stringify(ORIGINAL)}\n`);

// ---------------------------------------------- 1. nothing references them
{
  await reset();
  await client.query(SQL);
  const after = await curricula();
  const empties = ORIGINAL.filter((c) => !withSubjects.includes(c));
  rec("D-01", "empty, unreferenced curricula are removed",
    empties.every((c) => !after.includes(c)) && withSubjects.every((c) => after.includes(c)),
    `${JSON.stringify(ORIGINAL)} -> ${JSON.stringify(after)}`);
}

// ------------------------------- 2. a school is set to one: it must survive
{
  await reset();
  await q(`UPDATE organizations SET curriculum = $1 WHERE id = $2`, ["British", A.orgId]);
  // Assert the setup took effect before trusting the result -- a silently
  // skipped setup is what made this case look broken the first time.
  const [check] = await q(`SELECT curriculum FROM organizations WHERE id = $1`, [A.orgId]);
  const setupOk = check.curriculum === "British";

  await client.query(SQL);
  const after = await curricula();
  // Order asserted, not just membership. The UI treats the first entry as the
  // default curriculum for a new school, and the first run of this migration
  // returned ['British','MOE National'] -- silently moving the default.
  rec("D-02", "a curriculum a school still uses is KEPT, in order",
    setupOk && JSON.stringify(after) === JSON.stringify(["MOE National", "British"]),
    setupOk ? `-> ${JSON.stringify(after)}` : "SETUP FAILED -- result proves nothing");

  // and the others still go
  rec("D-03", "the unreferenced ones are still removed alongside it",
    setupOk && !after.includes("American") && !after.includes("IB"),
    `-> ${JSON.stringify(after)}`);
}

// --------------------------- 3. an assessment records one: must survive too
{
  await reset();
  await q(`UPDATE organizations SET curriculum = $1 WHERE id = $2`, ["MOE National", A.orgId]);
  // An assessment carrying a curriculum, created the same way the app does.
  const [stu] = await q(
    `SELECT user_id FROM organization_members WHERE organization_id = $1 AND role = 'student' LIMIT 1`,
    [A.orgId]);
  await q(
    `INSERT INTO assessments (user_id, country_id, curriculum, grade, favorite_subjects, interests)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [stu.user_id, COUNTRY, "IB", "10", ["Mathematics"], ["Technology"]]);
  const recorded = Number((await q(
    `SELECT COUNT(*)::int n FROM assessments WHERE country_id=$1 AND curriculum=$2`,
    [COUNTRY, "IB"]))[0].n);

  await client.query(SQL);
  const after = await curricula();
  rec("D-04", "a curriculum an assessment records is KEPT",
    recorded > 0 && after.includes("IB"),
    recorded > 0 ? `${recorded} assessment(s) -> ${JSON.stringify(after)}` : "SETUP FAILED");

  await q(`DELETE FROM assessments WHERE country_id=$1 AND curriculum=$2`, [COUNTRY, "IB"]);
}

// ------------------------------------------------- idempotence, and the end
{
  await reset();
  await client.query(SQL);
  const once = await curricula();
  await client.query(SQL);
  const twice = await curricula();
  rec("D-05", "re-running the migration changes nothing further",
    JSON.stringify(once) === JSON.stringify(twice), JSON.stringify(twice));

  // The state production should end in: only what a student can complete.
  const final = await curricula();
  rec("D-06", "every remaining curriculum has subjects behind it",
    final.every((c) => withSubjects.includes(c)) && final.length > 0,
    JSON.stringify(final));
}

await client.end();

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`migration 030 dry run: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
