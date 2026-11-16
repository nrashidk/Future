/**
 * MIGRATION 048 — EXECUTED, NOT READ.
 *
 *   M-01  the UP runs from the file on disk (after its own DOWN, so the
 *         column the harness's schema-push created is really added by it)
 *   M-02  the UAE row gets "مئوية الإمارات 2071"
 *   M-03  CONTROL: a country with another plan name is left NULL
 *   M-04  CONTROL: an Arabic name someone already set is not overwritten
 *   M-05  running the UP twice changes nothing more
 *   M-06  the DOWN drops the column; M-07 the UP works again after it
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

const FILE = "server/migrations/048_country_vision_plan_ar.sql";
const raw = readFileSync(FILE, "utf8");
const marker = "-- DOWN (manual, not run by the runner):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN block to test`);
const upSql = raw.slice(0, idx);
const downSql = raw.slice(idx + marker.length).split("\n")
  .map((l) => l.replace(/^--\s{0,3}/, "").trim()).filter((l) => l && !l.startsWith("--")).join("\n");
const hasColumn = async () => (await sql(
  `SELECT 1 FROM information_schema.columns WHERE table_name = 'countries' AND column_name = 'vision_plan_ar'`)).length === 1;

const tag = Math.random().toString(36).slice(2, 6);
const OTHER = `m48${tag}`.slice(0, 20);
const KEPT = `m48k${tag}`.slice(0, 20);

try {
  await sql(downSql);
  await sql(`UPDATE countries SET vision_plan = 'UAE Centennial 2071' WHERE id = 'uae'`);
  for (const [id, plan, code] of [[OTHER, "Vision 2030", "ZQA"], [KEPT, "UAE Centennial 2071", "ZQB"]]) {
    await sql(`INSERT INTO countries (id, name, code, mission, vision, vision_plan, priority_sectors, national_goals)
               VALUES ($1, $3, $4, 'm', 'v', $2, ARRAY['x'], ARRAY['y'])`, [id, plan, `M48 ${id}`, code]);
  }

  let err = null; try { await sql(upSql); } catch (e) { err = e.message; }
  rec("M-01", "the UP runs from the file on disk", err === null && await hasColumn(), err ?? "");
  const uae = (await sql(`SELECT vision_plan_ar FROM countries WHERE id = 'uae'`))[0];
  rec("M-02", "UAE gets its Arabic plan name", uae?.vision_plan_ar === "مئوية الإمارات 2071", `ar=${uae?.vision_plan_ar}`);
  const other = (await sql(`SELECT vision_plan_ar FROM countries WHERE id = $1`, [OTHER]))[0];
  rec("M-03", "CONTROL: another plan name is left NULL", other?.vision_plan_ar === null, `ar=${other?.vision_plan_ar}`);

  // M-04: KEPT carries the UAE plan name but is not the UAE row, so it must stay
  // NULL; then a hand-set Arabic name on UAE must survive a second UP.
  const kept = (await sql(`SELECT vision_plan_ar FROM countries WHERE id = $1`, [KEPT]))[0];
  await sql(`UPDATE countries SET vision_plan_ar = 'اسم مختار' WHERE id = 'uae'`);
  await sql(upSql);
  const after = (await sql(`SELECT vision_plan_ar FROM countries WHERE id = 'uae'`))[0];
  rec("M-04", "CONTROL: only UAE is filled, and a set name is not overwritten",
    kept?.vision_plan_ar === null && after?.vision_plan_ar === "اسم مختار", `kept=${kept?.vision_plan_ar} uae=${after?.vision_plan_ar}`);
  await sql(`UPDATE countries SET vision_plan_ar = NULL WHERE id = 'uae'`);
  await sql(upSql); await sql(upSql);
  const twice = (await sql(`SELECT vision_plan_ar FROM countries WHERE id = 'uae'`))[0];
  rec("M-05", "running the UP twice changes nothing more", twice?.vision_plan_ar === "مئوية الإمارات 2071", `ar=${twice?.vision_plan_ar}`);

  await sql(downSql);
  rec("M-06", "the DOWN drops the column", !(await hasColumn()));
  err = null; try { await sql(upSql); } catch (e) { err = e.message; }
  rec("M-07", "the UP works again after the DOWN", err === null && await hasColumn(), err ?? "");
} finally {
  await sql(`DELETE FROM countries WHERE id IN ($1, $2)`, [OTHER, KEPT]);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`); process.exit(1); }
