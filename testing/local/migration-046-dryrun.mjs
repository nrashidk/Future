/**
 * MIGRATION 046 — EXECUTED, NOT READ.
 *
 *   M-01  the UP runs, from the file on disk
 *   M-02  the stored row no longer offers the correct answer twice: four
 *         DISTINCT VALUES (as numbers, not as strings — 5/14 and 10/28 were
 *         distinct strings), and the correct answer is still one of them
 *   M-03  the Arabic options are the same four, in the same order
 *   M-04  CONTROL: a neighbouring question that also contains "10/28" as an
 *         option is untouched (the UPDATE is scoped to this one question)
 *   M-05  running the UP twice changes nothing more
 *   M-06  the DOWN restores the old row exactly
 *   M-07  the UP works again after the DOWN
 *   M-08  the bank file and the Arabic content file carry the same options
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

const FILE = "server/migrations/046_probability_question_duplicate_option.sql";
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

const Q = "A box contains 5 red balls and 3 blue balls. If two balls are drawn without replacement, what is the probability both are red?";
const tag = Math.random().toString(36).slice(2, 7);
const CONTROL = `M46 control question ${tag}?`;
const get = async (q) => sql(
  `SELECT question, options, correct_answer, options_ar FROM quiz_questions WHERE question = $1`, [q]);
const value = (s) => { const [a, b] = String(s).split("/").map(Number); return b ? a / b : a; };

// A seeded database already holds the NEW options (the bank file changed in
// the same commit), so the row production has is put back as production has it.
await sql(`
  UPDATE quiz_questions SET options = '["5/14", "10/28", "5/8", "25/64"]'::jsonb,
                            options_ar = '["5/14", "10/28", "5/8", "25/64"]'::jsonb
   WHERE question = '${Q}';
  INSERT INTO quiz_questions (question, question_type, options, correct_answer, explanation, question_ar, options_ar, explanation_ar,
                              subject, grade, country_id, curriculum, topic, difficulty, cognitive_level)
  VALUES ('${CONTROL}', 'multiple_choice', '["1/2","10/28","3/4","1"]'::jsonb, '1/2', 'control', 'ضابط',
          '["1/2","10/28","3/4","1"]'::jsonb, 'ضابط', 'Mathematics', 10, 'uae', 'MOE National', 'Control', 'hard', 'analysis');`);
const before = await get(Q);
const controlBefore = JSON.stringify(await get(CONTROL));
if (before.length !== 1) throw new Error(`expected the seeded question once, found ${before.length}`);

try {
  let upErr = null;
  try { await sql(upSql); } catch (e) { upErr = e.message; }
  rec("M-01", "the UP runs from the file on disk", upErr === null, upErr ?? "");

  const r = (await get(Q))[0] ?? {};
  const values = (r.options ?? []).map(value);
  rec("M-02", "four distinct VALUES, and the correct answer is one of them",
    values.length === 4 && new Set(values.map((v) => v.toFixed(9))).size === 4 &&
    r.options.includes(r.correct_answer) && r.correct_answer === "5/14",
    `options=${JSON.stringify(r.options)} correct=${r.correct_answer}`);
  rec("M-03", "the Arabic options are the same four in the same order",
    JSON.stringify(r.options_ar) === JSON.stringify(r.options), `ar=${JSON.stringify(r.options_ar)}`);
  rec("M-04", "CONTROL: another question offering 10/28 is untouched",
    JSON.stringify(await get(CONTROL)) === controlBefore);

  const snap = JSON.stringify(await get(Q));
  await sql(upSql);
  rec("M-05", "running the UP twice changes nothing more", JSON.stringify(await get(Q)) === snap);

  let downErr = null;
  try { await sql(downSql); } catch (e) { downErr = e.message; }
  rec("M-06", "the DOWN restores the old row exactly",
    downErr === null && JSON.stringify(await get(Q)) === JSON.stringify(before), downErr ?? "");

  await sql(upSql);
  rec("M-07", "the UP works again after the DOWN", JSON.stringify(await get(Q)) === snap);

  const bank = readFileSync("server/questionBanks/uae/mathematics.ts", "utf8");
  const arabic = readFileSync("server/migrations/quiz-arabic-content-grades9-12.data.ts", "utf8");
  const want = JSON.parse(snap)[0].options.map((o) => `"${o}"`).join(", ");
  rec("M-08", "bank and Arabic content files carry the same options as the row",
    bank.includes(`options: [${want}]`) && arabic.includes(`optionsAr: [${want}]`) &&
    !bank.includes('"5/14", "10/28"') && !arabic.includes('"5/14", "10/28"'), `want=[${want}]`);
} finally {
  await sql(`DELETE FROM quiz_questions WHERE question = '${CONTROL}';`).catch((e) => console.log("cleanup:", e.message));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
