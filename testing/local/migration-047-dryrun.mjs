/**
 * MIGRATION 047 — EXECUTED, NOT READ. Files the questions of peer-approved
 * submissions that never reached the bank (the defect fixed in
 * storage.recordContributionReview the same day).
 *
 *   M-01  the UP runs, from the file on disk
 *   M-02  THE CASE THAT MATTERS: a peer-approved submission with nothing in
 *         the bank gets its questions, under the subject's NAME, its grade,
 *         country, curriculum and school, the same options (shuffled) with
 *         the correct answer among them
 *   M-03  CONTROL: a superadmin-approved submission whose questions are
 *         already filed gets no second copy
 *   M-04  CONTROL: an approved submission no school voted on is not touched
 *         (the superadmin path files at approval; none filed there means it
 *         was approved some other way, not by this defect)
 *   M-05  CONTROL: a peer-REJECTED submission files nothing
 *   M-06  running the UP twice files nothing more
 *   M-07  the DOWN removes what the UP filed (it is broader; see the .sql)
 *   M-08  the UP works again after the DOWN
 */
import { readFileSync } from "fs";
import { build } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(62)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const FILE = "server/migrations/047_file_peer_approved_questions.sql";
const raw = readFileSync(FILE, "utf8");
const marker = "-- DOWN (manual, not run by the runner):";
const idx = raw.indexOf(marker);
if (idx < 0) throw new Error(`${FILE} has no DOWN block to test`);
const upSql = raw.slice(0, idx);
const downSql = raw.slice(idx + marker.length).split("\n")
  .map((l) => l.replace(/^--\s{0,3}/, "").trim()).filter((l) => l && !l.startsWith("--")).join("\n");

const { orgs } = await build();
const A = orgs.A, B = orgs.B;
const [{ admin_user_id: aAdmin }] = await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [A.orgId]);
const [{ admin_user_id: bAdmin }] = await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [B.orgId]);
const tag = Math.random().toString(36).slice(2, 7);
const qs = (label) => JSON.stringify([1, 2].map((n) => ({
  question: `M47 ${label} ${tag} q${n}: which is correct?`, options: ["Right", "Wrong 1", "Wrong 2", "Wrong 3"],
  correctAnswer: "Right", explanation: "Because.", topic: "Probe", difficulty: "easy", cognitiveLevel: "knowledge",
})));
async function plant(label, status, withVote, vote = "approve") {
  const [{ id }] = await sql(
    `INSERT INTO contribution_submissions (organization_id, submitted_by_user_id, country_id, curriculum, subject, grade,
       questions, total_questions, status)
     VALUES ($1, $2, 'uae', 'MOE National', 'mathematics', 10, $3::jsonb, 2, $4) RETURNING id`,
    [A.orgId, aAdmin, qs(label), status]);
  if (withVote) {
    await sql(`INSERT INTO contribution_reviews (submission_id, reviewer_org_id, reviewer_user_id, vote) VALUES ($1, $2, $3, $4)`,
      [id, B.orgId, bAdmin, vote]);
  }
  return id;
}
const filed = (id) => sql(
  `SELECT question, subject, grade, country_id, curriculum, options, correct_answer, source_type, contributed_by_org_id
     FROM quiz_questions WHERE contribution_submission_id = $1 ORDER BY question`, [id]);

const made = [];
try {
  const peer = await plant("peer", "approved", true); made.push(peer);
  const admin = await plant("admin", "approved", true); made.push(admin);
  await sql(`INSERT INTO quiz_questions (question, question_type, options, correct_answer, subject, grade, country_id, curriculum,
               topic, difficulty, cognitive_level, source_type, contributed_by_org_id, contribution_submission_id)
             VALUES ('M47 admin ${tag} already filed', 'multiple_choice', '["a","b","c","d"]'::jsonb, 'a', 'Mathematics', 10,
               'uae', 'MOE National', 'Probe', 'easy', 'knowledge', 'school_contribution', $1, $2)`, [A.orgId, admin]);
  const noVote = await plant("novote", "approved", false); made.push(noVote);
  const rejected = await plant("rejected", "rejected", true, "reject"); made.push(rejected);

  let upErr = null;
  try { await sql(upSql); } catch (e) { upErr = e.message; }
  rec("M-01", "the UP runs from the file on disk", upErr === null, upErr ?? "");

  const p = await filed(peer);
  rec("M-02", "the peer-approved submission's two questions are filed, by NAME",
    p.length === 2 && p.every((r) => r.subject === "Mathematics" && r.grade === 10 && r.country_id === "uae"
      && r.curriculum === "MOE National" && r.source_type === "school_contribution" && r.contributed_by_org_id === A.orgId
      && r.correct_answer === "Right" && r.options.length === 4 && r.options.includes("Right")
      && [...r.options].sort().join() === ["Right", "Wrong 1", "Wrong 2", "Wrong 3"].sort().join()),
    `${p.length} filed ${JSON.stringify(p[0] ?? {}).slice(0, 160)}`);
  rec("M-03", "CONTROL: an already-filed submission gets no second copy", (await filed(admin)).length === 1);
  rec("M-04", "CONTROL: an approved submission nobody voted on is untouched", (await filed(noVote)).length === 0);
  rec("M-05", "CONTROL: a peer-rejected submission files nothing", (await filed(rejected)).length === 0);

  await sql(upSql);
  rec("M-06", "running the UP twice files nothing more", (await filed(peer)).length === 2);

  let downErr = null;
  try { await sql(downSql); } catch (e) { downErr = e.message; }
  rec("M-07", "the DOWN removes the peer-filed questions",
    downErr === null && (await filed(peer)).length === 0, downErr ?? "");

  await sql(upSql);
  rec("M-08", "the UP works again after the DOWN", (await filed(peer)).length === 2);
} finally {
  for (const id of made) {
    await sql(`DELETE FROM quiz_questions WHERE contribution_submission_id = $1`, [id]).catch(() => {});
    await sql(`DELETE FROM contribution_reviews WHERE submission_id = $1`, [id]).catch(() => {});
    await sql(`DELETE FROM contribution_submissions WHERE id = $1`, [id]).catch((e) => console.log("cleanup:", e.message));
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\nmigration-047-dryrun: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
