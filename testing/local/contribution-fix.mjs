/**
 * A SCHOOL FIXES A "NEEDS CHANGES" SUBMISSION AND SENDS IT BACK
 * (owner, 2026-11-15: edit in place, the check runs again, a fix does not
 * count toward the daily limit, the check's notes go without scores).
 *
 * Judged by the ROW, never by the response alone.
 *
 *   X-00  the author's feedback carries the reviewer's note and the check's
 *         notes, and no score
 *   X-01  THE CASE THAT MATTERS: another school cannot resubmit it; 404 and
 *         the row is unchanged
 *   X-02  the author resubmits: same row, new questions, back to pending,
 *         check reset, created_at kept, no new row
 *   X-03  a second resubmit is refused 409; the row does not change again
 *   X-04  a submission not waiting for changes is refused 409 (control that
 *         the state check is real, not the route refusing everything)
 *   X-05  an invalid body is refused 400 and changes nothing
 *   X-06  a student cannot resubmit
 *   X-07  another school cannot read the feedback either
 *   X-08  a NEW submission with no country or curriculum takes the school's
 *         (the form no longer asks)
 *   X-09  control: a curriculum that is not the school's is still refused
 *   X-10  the school's list does not hand over the reviewing superadmin's id
 *   X-11  the peer-review queue counts the votes already cast (it read 0
 *         for every submission: an unqualified column in a subquery)
 */
import { build, Session } from "./fixtures.mjs";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(64)} ${note}`);
};
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const { orgs } = await build();
const A = orgs.A, B = orgs.B;
const [{ admin_user_id: adminId }] = await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [A.orgId]);

const OLD = [
  { question: "ZZ old: which of these is a factor of 12?", options: ["3", "4", "5", "7"], correctAnswer: "4", topic: "Factors", difficulty: "easy", cognitiveLevel: "knowledge" },
];
const NEW = [
  { question: "ZZ fixed: which of these numbers is a factor of 12?", options: ["4", "5", "7", "9"], correctAnswer: "4", explanation: "12 / 4 = 3", topic: "Factors", difficulty: "easy", cognitiveLevel: "knowledge" },
];
const feedback = [{ index: 1, score: 65, issues: ["Two options are correct: 3 and 4."], isValid: false }];

async function plant(status) {
  const [r] = await sql(
    `INSERT INTO contribution_submissions
       (organization_id, submitted_by_user_id, country_id, curriculum, subject, grade, questions, total_questions,
        status, llm_verification_status, llm_verification_score, llm_verification_feedback, review_feedback, created_at)
     VALUES ($1, $2, 'uae', 'MOE National', 'mathematics', 10, $3::jsonb, 1, $4, 'verified', 45, $5::jsonb,
             'Question 1 has two correct options.', NOW() - INTERVAL '2 days')
     RETURNING id`, [A.orgId, adminId, JSON.stringify(OLD), status, JSON.stringify(feedback)]);
  return r.id;
}
const row = async (id) => (await sql(
  `SELECT status, questions, total_questions, llm_verification_status AS llm, llm_verification_score AS score,
          created_at < NOW() - INTERVAL '1 day' AS old_created FROM contribution_submissions WHERE id = $1`, [id]))[0];
const rowCount = async () => (await sql(`SELECT count(*)::int n FROM contribution_submissions WHERE organization_id = $1`, [A.orgId]))[0].n;
const firstQ = (r) => r.questions?.[0]?.question;

const made = [];
try {
  const id = await plant("needs_changes"); made.push(id);

  const fb = await A.session.get(`/api/contributions/${id}/feedback`);
  const fbJson = JSON.stringify(fb.body ?? "");
  rec("X-00", "author's feedback has the note and the check's notes, no score",
    !isHtml(fb.body) && fb.status === 200 && fb.body?.reviewerNote === "Question 1 has two correct options."
      && fb.body?.checkNotes?.[0]?.questionIndex === 0 && !/score/i.test(fbJson),
    `HTTP ${fb.status} note=${JSON.stringify(fb.body?.reviewerNote)} notes=${JSON.stringify(fb.body?.checkNotes)}`);

  const before = await row(id);
  const byB = await B.session.post(`/api/contributions/${id}/resubmit`, { questions: NEW });
  const afterB = await row(id);
  rec("X-01", "another school's resubmit: 404 and the row unchanged",
    !isHtml(byB.body) && byB.status === 404 && afterB.status === "needs_changes" && firstQ(afterB) === firstQ(before),
    `HTTP ${byB.status} status=${afterB.status} q=${firstQ(afterB)}`);

  const n0 = await rowCount();
  const ok = await A.session.post(`/api/contributions/${id}/resubmit`, { questions: NEW });
  await new Promise((r) => setTimeout(r, 400));
  const after = await row(id);
  const n1 = await rowCount();
  rec("X-02", "author resubmits: same row, new text, pending, check reset, no new row",
    ok.status === 200 && after.status === "pending" && firstQ(after) === NEW[0].question
      && after.score !== 45 && after.llm !== "verified" && after.old_created === true && n1 === n0,
    `HTTP ${ok.status} status=${after.status} llm=${after.llm} score=${after.score} oldCreated=${after.old_created} rows ${n0}->${n1}`);

  const again = await A.session.post(`/api/contributions/${id}/resubmit`, { questions: OLD });
  const after2 = await row(id);
  rec("X-03", "a second resubmit is refused 409; nothing changes",
    again.status === 409 && firstQ(after2) === NEW[0].question,
    `HTTP ${again.status} ${again.body?.error} q=${firstQ(after2)}`);

  const pendingId = await plant("pending"); made.push(pendingId);
  const notWaiting = await A.session.post(`/api/contributions/${pendingId}/resubmit`, { questions: NEW });
  rec("X-04", "a submission not waiting for changes is refused 409",
    notWaiting.status === 409 && firstQ(await row(pendingId)) === OLD[0].question, `HTTP ${notWaiting.status}`);

  const id2 = await plant("needs_changes"); made.push(id2);
  const bad = await A.session.post(`/api/contributions/${id2}/resubmit`, { questions: [{ question: "short" }] });
  const r2 = await row(id2);
  rec("X-05", "an invalid body is refused 400 and changes nothing",
    bad.status === 400 && r2.status === "needs_changes" && firstQ(r2) === OLD[0].question, `HTTP ${bad.status}`);

  const stu = new Session("fixStudent");
  await stu.login(A.students[0].username, A.students[0].password);
  const byStudent = await stu.post(`/api/contributions/${id2}/resubmit`, { questions: NEW });
  rec("X-06", "a student cannot resubmit", byStudent.status === 403 && (await row(id2)).status === "needs_changes",
    `HTTP ${byStudent.status}`);

  const readB = await B.session.get(`/api/contributions/${id2}/feedback`);
  rec("X-07", "another school cannot read the feedback",
    !isHtml(readB.body) && [403, 404].includes(readB.status) && !JSON.stringify(readB.body).includes("two correct options"),
    `HTTP ${readB.status}`);

  const fresh = { subject: "science", grade: 9, questions: [{ ...NEW[0], question: "ZZ new: which gas do plants take in for photosynthesis?", options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"], correctAnswer: "Carbon dioxide", topic: "Photosynthesis" }] };
  const sub = await A.session.post(`/api/contributions/submit`, fresh);
  if (sub.body?.submissionId) made.push(sub.body.submissionId);
  const [newRow] = sub.body?.submissionId ? await sql(`SELECT country_id, curriculum FROM contribution_submissions WHERE id = $1`, [sub.body.submissionId]) : [];
  const [school] = await sql(`SELECT country_id, curriculum FROM organizations WHERE id = $1`, [A.orgId]);
  rec("X-08", "new submission without country/curriculum takes the school's",
    sub.status === 201 && newRow?.country_id === school.country_id && newRow?.curriculum === school.curriculum,
    `HTTP ${sub.status} ${JSON.stringify(newRow)} school=${JSON.stringify(school)} ${sub.body?.error ?? ""}`);

  const wrong = await A.session.post(`/api/contributions/submit`, { ...fresh, curriculum: "Not A Curriculum" });
  rec("X-09", "a curriculum that is not the school's is still refused", wrong.status === 400, `HTTP ${wrong.status} ${wrong.body?.error ?? ""}`);

  await sql(`UPDATE contribution_submissions SET reviewed_by_user_id = $2 WHERE id = $1`, [id2, adminId]);
  const list = await A.session.get(`/api/contributions/submissions`);
  const mine = Array.isArray(list.body) ? list.body.find((x) => x.id === id2) : null;
  rec("X-10", "the school's list carries no reviewer id", !!mine && !("reviewedByUserId" in mine), `keys=${mine ? Object.keys(mine).length : "none"}`);

  const [{ admin_user_id: bAdmin }] = await sql(`SELECT admin_user_id FROM organizations WHERE id = $1`, [B.orgId]);
  const [{ id: pr }] = await sql(
    `INSERT INTO contribution_submissions (organization_id, submitted_by_user_id, country_id, curriculum, subject, grade, questions, total_questions, status)
     VALUES ($1, $2, 'uae', 'MOE National', 'science', 9, '[]'::jsonb, 1, 'peer_review') RETURNING id`, [B.orgId, bAdmin]);
  made.push(pr);
  await sql(`INSERT INTO contribution_reviews (submission_id, reviewer_org_id, reviewer_user_id, vote) VALUES ($1, $2, $3, 'approve')`, [pr, B.orgId, bAdmin]);
  const queue = (await A.session.get(`/api/contributions/review-queue`)).body;
  const item = queue?.submissions?.find?.((x) => x.id === pr);
  rec("X-11", "the review queue counts votes already cast", item?.reviewsSoFar === 1, `reviewsSoFar=${item?.reviewsSoFar}`);
} finally {
  for (const id of made) await sql(`DELETE FROM contribution_submissions WHERE id = $1`, [id]);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\ncontribution-fix: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
