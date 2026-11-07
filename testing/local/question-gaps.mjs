/**
 * WHERE THE QUESTION BANK IS THIN.
 *
 * A cell is one (country, curriculum, subject, grade), and it is the real unit
 * because that is what the quiz draws from: a student picking three subjects
 * gets five questions per subject AT THEIR GRADE. So a country can hold
 * hundreds of questions and still fail a particular student if the three cells
 * they land on are empty.
 *
 * G-03 is the assertion that matters. A gap table that merely reports what is
 * there is a report; one that notices a cell EMPTIED behind it is a detector.
 * So this suite deliberately removes a cell's questions and asks again.
 *
 * G-06 is its companion in the other direction: the school endpoint must take
 * the school's own country and curriculum rather than accepting them from the
 * request, or it reintroduces exactly the free choice the feature removes.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(56)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const { orgs } = await build();
const A = orgs.A;

// ------------------------------------------------- G-01  the school's own view
let baseline = null;
{
  const r = await A.session.get("/api/contributions/gaps");
  baseline = r.body;
  const cells = baseline?.cells ?? [];
  rec("G-01", "a school admin gets a gap table for their own school",
    r.status === 200 && cells.length > 0 && baseline.countryId === "uae",
    `${cells.length} cells, target ${baseline?.target}/cell, curriculum ${baseline?.curriculum}`);
}

// --------------------------------------------- G-02  it reflects the real bank
{
  // UAE is seeded 10/10/7/7/6 per subject across grades 8-12, so nothing should
  // read as empty and the whole bank should already clear the five-per-cell
  // floor. If this fails, the counting is wrong before any gap logic runs.
  const s = baseline?.summary ?? {};
  const cells = baseline?.cells ?? [];
  const belowTarget = cells.filter((c) => c.count < baseline.target);
  rec("G-02", "a fully seeded curriculum shows no cell below target",
    s.empty === 0 && s.short === 0 && belowTarget.length === 0,
    `empty=${s.empty} short=${s.short} thin=${s.thin} ok=${s.ok}`);
}

// ------------------------- G-03  THE DETECTOR: a cell emptied must be noticed
{
  const before = (baseline?.cells ?? []).find((c) => c.subject === "Arabic" && c.grade === "11");

  /**
   * SET ASIDE, NOT DESTROYED, and put back at the end of this suite.
   *
   * The first version deleted the rows outright. It passed, then failed on the
   * very next run against the same database -- the cell was still empty from
   * the run before, so the baseline G-02 asserts was already wrong. A suite
   * that only works on a fresh database hides the regressions it exists to
   * catch, because a real failure and a leftover look identical.
   *
   * quiz_questions has no is_active column, so the rows are moved wholesale
   * into a holding table and copied back. SELECT * preserves every column,
   * including ones added later, which a hand-written column list would
   * silently drop.
   */
  await sql(`CREATE TABLE IF NOT EXISTS _gap_test_holding AS SELECT * FROM quiz_questions WHERE false`);
  await sql(`DELETE FROM _gap_test_holding`);
  await sql(
    `INSERT INTO _gap_test_holding
     SELECT * FROM quiz_questions WHERE country_id = $1 AND subject = $2 AND grade = $3`,
    ["uae", "Arabic", 11],
  );
  const removed = await sql(
    `DELETE FROM quiz_questions WHERE country_id = $1 AND subject = $2 AND grade = $3 RETURNING id`,
    ["uae", "Arabic", 11],
  );

  const r = await A.session.get("/api/contributions/gaps");
  const cell = (r.body?.cells ?? []).find((c) => c.subject === "Arabic" && c.grade === "11");

  rec("G-03", "emptying one cell is detected, named and counted",
    removed.length > 0 && cell?.status === "empty" && cell?.count === 0 &&
    cell?.shortfall === r.body.target,
    removed.length === 0
      ? "SETUP FAILED -- nothing deleted, the result proves nothing"
      : `Arabic g11: ${before?.count} -> ${cell?.count} (${cell?.status}, short ${cell?.shortfall})`);

  // Worst first, because this list is meant to be worked from the top.
  rec("G-04", "the emptied cell is ranked first",
    r.body?.cells?.[0]?.subject === "Arabic" && r.body.cells[0].grade === "11",
    `top of list: ${r.body?.cells?.[0]?.subject} grade ${r.body?.cells?.[0]?.grade}`);

  // And the rest of the bank is untouched -- a detector that reports
  // everything as empty is as useless as one that reports nothing.
  const stillOk = (r.body?.cells ?? []).filter((c) => c.status === "ok" || c.status === "thin").length;
  rec("G-05", "the other cells are unaffected",
    stillOk === (r.body?.cells?.length ?? 0) - 1,
    `${stillOk} of ${r.body?.cells?.length} still healthy`);
}

// --------------------- G-06  the school cannot ask about someone else's bank
{
  // The school's country and curriculum are properties of the school, not
  // parameters. Passing them must change nothing, or the free choice this
  // feature removes comes straight back in through the query string.
  const r = await A.session.get("/api/contributions/gaps?countryId=nowhere&curriculum=Invented");
  rec("G-06", "query parameters cannot redirect it to another bank",
    r.status === 200 && r.body?.countryId === "uae" && r.body?.curriculum === "MOE National",
    `returned ${r.body?.countryId}/${r.body?.curriculum} despite the query`);
}

// ------------------------------------- G-07  the superadmin sees every curriculum
{
  const sa = new Session("gapSa");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);
  const r = await sa.get("/api/admin/countries/uae/question-gaps");
  const list = r.body?.curricula ?? [];
  rec("G-07", "a superadmin sees the gaps for every curriculum offered",
    r.status === 200 && list.length > 0 && list.every((c) => Array.isArray(c.cells)),
    list.map((c) => `${c.curriculum}: ${c.summary.empty} empty, ${c.summary.totalShortfall} short`).join(" | "));

  const other = await sa.get("/api/admin/countries/nowhere/question-gaps");
  rec("G-08", "an unknown country is a 404", other.status === 404, `HTTP ${other.status}`);
}

// --------------------------------- G-09  a student actually feels the gap
{
  // The point of the table: a cell at zero is not a statistic, it is a student
  // being assessed on another country's curriculum. The quiz still builds --
  // it borrows -- which is precisely why the gap needed surfacing somewhere.
  const g = new Session("gapGuest");
  await g.get("/api/auth/user");
  const made = await g.post("/api/assessments", {
    favoriteSubjects: ["Arabic", "Mathematics", "Science"], interests: ["technology"],
    assessmentType: "basic", countryId: "uae", curriculum: "MOE National", grade: "11",
  });
  const id = made.body?.id;
  const gen = id ? await g.post(`/api/assessments/${id}/quiz/generate`, {}) : null;
  const qs = gen?.body?.questions ?? [];
  const arabic = qs.filter((q) => q.subject === "Arabic").length;

  /**
   * WHAT AN EMPTY CELL ACTUALLY COSTS, and it is worse than "borrowed".
   *
   * The first version of this asserted the quiz still builds by borrowing from
   * other countries. It builds, but it does not borrow: the top-up only fires
   * when the whole paper falls below MIN_QUIZ_QUESTIONS (6). With Arabic
   * emptied the student gets TEN questions instead of fifteen, and NONE of
   * them in Arabic -- one of the three subjects they chose is simply absent
   * from their assessment, silently, and their subject scores are computed
   * from what remains.
   *
   * So the cost of a gap is not a diluted paper, it is a missing subject. That
   * is the strongest argument for pointing contributions at these cells, and
   * it is asserted here rather than described.
   */
  rec("G-09", "an empty cell silently drops that subject from the student's quiz",
    qs.length > 0 && arabic === 0 && qs.length < 15,
    `${qs.length} questions instead of 15, ${arabic} of them Arabic -- the student chose Arabic`);
}

// Put the cell back, so this suite can be run twice in a row and mean the
// same thing both times.
{
  const restored = await sql(
    `INSERT INTO quiz_questions SELECT * FROM _gap_test_holding RETURNING id`,
  );
  await sql(`DROP TABLE IF EXISTS _gap_test_holding`);
  const after = await A.session.get("/api/contributions/gaps");
  const cell = (after.body?.cells ?? []).find((c) => c.subject === "Arabic" && c.grade === "11");
  rec("G-10", "the suite restores the cell it emptied",
    restored.length > 0 && cell?.status !== "empty",
    `${restored.length} restored, Arabic g11 back to ${cell?.count} (${cell?.status})`);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`question-gaps: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
