/**
 * MIGRATION 042 — EXECUTED, NOT READ.
 *
 *   M-01  the UP runs, from the file on disk
 *   M-02  the stored row carries the new question, and its correct answer IS
 *         one of its options (a rewrite that left them disagreeing would mark
 *         every student wrong)
 *   M-03  the Arabic is rewritten too, four options, the correct one first in
 *         both languages (they are aligned by position)
 *   M-04  no row with the old text remains
 *   M-05  CONTROL: a neighbouring question is untouched
 *   M-06  running the UP twice changes nothing more
 *   M-07  the DOWN restores the old row exactly
 *   M-08  the UP works again after the DOWN
 *   M-09  the bank file and the Arabic content file carry the SAME new text
 *         the migration writes, so a fresh seed and a migrated database agree
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

const FILE = "server/migrations/042_rewrite_opec_question.sql";
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


const OLD = "What role does the UAE play in OPEC?";
const NEW = "Which statement about the UAE and OPEC is correct?";
const tag = Math.random().toString(36).slice(2, 7);
const CONTROL = `M42 control question ${tag}?`;
const get = async (q) => sql(
  `SELECT question, options, correct_answer, explanation, question_ar, options_ar, explanation_ar
     FROM quiz_questions WHERE question = $1`, [q]);

// A seeded database already holds the NEW text (the bank file changed in the
// same commit), so the row production has is planted here, as production has it.
const seeded = (await get(NEW)).length;
await sql(`
  DELETE FROM quiz_questions WHERE question IN ('${OLD}', '${NEW}');
  INSERT INTO quiz_questions (question, question_type, options, correct_answer, explanation, question_ar, options_ar, explanation_ar,
                              subject, grade, country_id, curriculum, topic, difficulty, cognitive_level)
  VALUES ('${OLD}', 'multiple_choice',
          '["Major oil producer and influential member", "Observer status only", "Not a member", "Founding member only with no current role"]'::jsonb,
          'Major oil producer and influential member',
          'The UAE is a founding OPEC member and one of the largest oil producers, playing a key role in global energy markets',
          'ما الدور الذي تؤديه الإمارات في منظمة أوبك؟',
          '["منتج نفطي رئيسي وعضو مؤثر", "عضو مراقب فقط", "ليست عضواً", "عضو مؤسس فقط دون دور حالي"]'::jsonb,
          'الإمارات عضو مؤسس في أوبك وأحد أكبر منتجي النفط مع دور محوري في أسواق الطاقة العالمية',
          'Social Studies', 12, 'uae', 'MOE National', 'UAE International Relations - Energy', 'hard', 'analysis'),
         ('${CONTROL}', 'multiple_choice', '["a","b","c","d"]'::jsonb, 'a', 'control', 'ضابط', '["أ","ب","ج","د"]'::jsonb, 'ضابط',
          'Social Studies', 12, 'uae', 'MOE National', 'Control', 'hard', 'analysis');`);
const before = await get(OLD);
const controlBefore = JSON.stringify(await get(CONTROL));

try {
  let upErr = null;
  try { await sql(upSql); } catch (e) { upErr = e.message; }
  rec("M-01", "the UP runs from the file on disk", upErr === null, upErr ?? "");

  const rows = await get(NEW);
  const r = rows[0] ?? {};
  rec("M-02", "new question stored; its correct answer is one of its options",
    rows.length === 1 && Array.isArray(r.options) && r.options.length === 4 && r.options.includes(r.correct_answer) &&
    /1967/.test(r.correct_answer) && /2026/.test(r.correct_answer) && !/founding/i.test(r.explanation),
    `rows=${rows.length} options=${r.options?.length} correct="${r.correct_answer}"`);
  rec("M-03", "Arabic rewritten, four options, correct one first in both",
    Array.isArray(r.options_ar) && r.options_ar.length === 4 && r.options[0] === r.correct_answer &&
    /1967/.test(r.options_ar[0]) && /2026/.test(r.options_ar[0]) && /أوبك/.test(r.question_ar) && !/مؤسس/.test(r.explanation_ar),
    `ar options=${r.options_ar?.length} first="${r.options_ar?.[0]}"`);
  rec("M-04", "no row with the old text remains", (await get(OLD)).length === 0);
  rec("M-05", "CONTROL: a neighbouring question is untouched", JSON.stringify(await get(CONTROL)) === controlBefore);

  const snap = JSON.stringify(await get(NEW));
  await sql(upSql);
  rec("M-06", "running the UP twice changes nothing more",
    JSON.stringify(await get(NEW)) === snap && (await get(NEW)).length === 1);

  let downErr = null;
  try { await sql(downSql); } catch (e) { downErr = e.message; }
  rec("M-07", "the DOWN restores the old row exactly",
    downErr === null && JSON.stringify(await get(OLD)) === JSON.stringify(before) && (await get(NEW)).length === 0,
    downErr ?? "");

  await sql(upSql);
  const again = await get(NEW);
  rec("M-08", "the UP works again after the DOWN", again.length === 1 && JSON.stringify(again) === snap);

  const bank = readFileSync("server/questionBanks/uae/socialStudies.ts", "utf8");
  const arabic = readFileSync("server/migrations/quiz-arabic-content-grades9-12.data.ts", "utf8");
  const a = again[0];
  rec("M-09", "bank and Arabic content files carry the same text as the row",
    bank.includes(`question: "${a.question}"`) && bank.includes(`correctAnswer: "${a.correct_answer}"`) &&
    a.options.every((o) => bank.includes(`"${o}"`)) && bank.includes(a.explanation) && !bank.includes(OLD + '",') &&
    arabic.includes(`question: "${a.question}"`) && arabic.includes(a.question_ar) &&
    a.options_ar.every((o) => arabic.includes(`"${o}"`)) && arabic.includes(a.explanation_ar) && !arabic.includes(OLD),
    `seededWithNew=${seeded}`);
} finally {
  await sql(`DELETE FROM quiz_questions WHERE question = '${CONTROL}';`).catch((e) => console.log("cleanup:", e.message));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
