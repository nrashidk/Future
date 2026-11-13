/**
 * THE AUTOMATIC QUESTION CHECK MUST NOT REPORT 100 WHEN IT DID NOT RUN.
 *
 * `verifyQuestionsWithLLM` (contribution.routes.ts) has four return paths and
 * three of them are failures: no Anthropic credential, a non-OK response from
 * Anthropic, and any thrown exception. All three returned
 * `{ overallScore: 100, verified: true }`.
 *
 * The routing gate downstream is real — `result.verified && result.overallScore
 * >= 50` sends a submission to peer review — so a perfect score from a check
 * that never happened sails straight through it. A school's questions reach
 * peer review labelled as having passed an automatic review that did not occur,
 * and approved questions earn reward credits, which convert to free licences.
 * The content ends up in an assessment taken by 13-18 year olds.
 *
 * The trigger needs no code change. A rotated `DB_ENCRYPTION_KEY` makes every
 * stored credential undecryptable, `storage.getApiCredential` returns
 * `undefined` on a decryption failure — indistinguishable from "never
 * configured" — and the first failure path is taken. An expired Anthropic key,
 * a rate limit or an outage takes the second.
 *
 * WHAT THIS SUITE CAN AND CANNOT SEE. The harness has no network, so the path
 * where the LLM genuinely runs cannot be exercised here — that one needs a real
 * key. Every case below is therefore a FAILURE path, which is exactly where the
 * defect is, but it means this suite cannot prove the happy path still works.
 * The diff that accompanies it adds one field to the success branch and leaves
 * the threshold untouched, so that branch is reviewable by eye.
 *
 * Verification runs in the BACKGROUND after a 201, so each case polls the row
 * rather than reading the response.
 */
import crypto from "crypto";
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(58)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

/**
 * A credential encrypted under a DIFFERENT key than the one the app holds —
 * `up.ts` runs with "0".repeat(64). This is what a rotated DB_ENCRYPTION_KEY
 * leaves behind, and it is the honest fixture for it: the row is real, the
 * ciphertext is real, and only the key is wrong. Nothing here is weakened to
 * make a case pass.
 */
function encryptUnder(keyHex, plaintext) {
  const iv = crypto.randomBytes(16);
  const c = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  let enc = c.update(plaintext, "utf8", "hex");
  enc += c.final("hex");
  return `${enc}:${iv.toString("hex")}:${c.getAuthTag().toString("hex")}`;
}

const { orgs } = await build();
const A = orgs.A;
const a = A.session;

const sa = new Session("llmGateSuper");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const orgRow = (await a.get("/api/my-organization")).body;
const countryId = orgRow?.countryId ?? "uae";
const curriculum = orgRow?.curriculum ?? "MOE";
const subjects = (await sa.get(`/api/countries/${countryId}/curricula/${curriculum}/subjects`)).body;
const subject = Array.isArray(subjects) && subjects.length ? subjects[0].code : null;
if (!subject) throw new Error("fixture: org A's curriculum offers no subjects; cannot submit");

const question = (text) => ({
  question: text,
  questionType: "multiple_choice",
  options: ["Option A", "Option B", "Option C", "Option D"],
  correctAnswer: "Option B",
  explanation: "Because B is correct.",
  topic: "General",
  difficulty: "easy",
  cognitiveLevel: "knowledge",
});

async function submit(label) {
  const r = await a.post("/api/contributions/submit", {
    countryId, curriculum, subject, grade: 10,
    questions: [question(`${label} — is this checked? ${Math.random().toString(36).slice(2, 7)}`)],
  });
  return r;
}

/** Verification is a background promise; wait for it to write the row. */
async function awaitVerification(submissionId, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let row = null;
  while (Date.now() < deadline) {
    const got = await sql(
      `SELECT status, llm_verification_status, llm_verification_score, llm_verified_at
       FROM contribution_submissions WHERE id = $1`, [submissionId]);
    row = got[0] ?? null;
    if (row && row.llm_verified_at !== null) return row;
    await new Promise((r) => setTimeout(r, 400));
  }
  return row;
}

/**
 * EXACTLY TWO SUBMISSIONS, and the reason is a limit that already bit this
 * suite: a school may submit THREE TIMES PER DAY. An earlier draft used one
 * submission per case, so the fourth got a 429 -- and L-05 "passed" against
 * that 429's body, which is the pass-on-an-error trap in a test written to
 * avoid it. Each submission below is asserted to be a 201 BEFORE anything is
 * read from it, and the later cases re-read the second submission rather than
 * making a third.
 */
try {
  // ---------------------------------------------- submission 1: no credential
  await sql(`DELETE FROM api_credentials WHERE provider = 'anthropic'`);
  const s1 = await submit("no-credential");

  // ------------------------------------------------------------------ L-00
  // The route is real. The SPA catch-all answers 200 with HTML for any
  // unmatched URL, so without this every case here could be measuring nothing.
  const s1ok = s1.status === 201 && !isHtml(s1.body) && typeof s1.body?.submissionId === "string";
  rec("L-00", "submit route is real and returns a submission id", s1ok,
    isHtml(s1.body) ? "NO SUCH ROUTE" : `HTTP ${s1.status} ${JSON.stringify(s1.body).slice(0, 60)}`);

  // ------------------------------------------------------------------ L-01
  // NO CREDENTIAL AT ALL. The check cannot run, so it must not claim a score.
  if (!s1ok) {
    rec("L-01", "no credential: not scored 100, not routed to peer review", false,
      `submission was not accepted (HTTP ${s1.status}) — nothing to measure`);
  } else {
    const row = await awaitVerification(s1.body.submissionId);
    const ok = row
      && Number(row.llm_verification_score) < 50
      && row.llm_verification_status !== "verified"
      && row.status !== "peer_review";
    rec("L-01", "no credential: not scored 100, not routed to peer review", !!ok,
      row ? `score=${row.llm_verification_score} llm=${row.llm_verification_status} status=${row.status}`
          : "verification never wrote the row");
  }

  // ------------------------------------- submission 2: undecryptable credential
  // A real row, real ciphertext, wrong key -- what a regenerated
  // DB_ENCRYPTION_KEY leaves behind.
  await sql(`DELETE FROM api_credentials WHERE provider = 'anthropic'`);
  await sql(
    `INSERT INTO api_credentials (provider, api_key, is_active) VALUES ('anthropic', $1, true)`,
    [encryptUnder("1".repeat(64), "sk-ant-a-real-looking-secret-value-0123456789")],
  );
  const s2 = await submit("undecryptable");
  const s2ok = s2.status === 201 && typeof s2.body?.submissionId === "string";
  const row2 = s2ok ? await awaitVerification(s2.body.submissionId) : null;

  // ------------------------------------------------------------------ L-02
  {
    const ok = s2ok && row2
      && Number(row2.llm_verification_score) < 50
      && row2.llm_verification_status !== "verified"
      && row2.status !== "peer_review";
    rec("L-02", "undecryptable credential: not scored 100, not routed", !!ok,
      !s2ok ? `submission was not accepted (HTTP ${s2.status})`
        : row2 ? `score=${row2.llm_verification_score} llm=${row2.llm_verification_status} status=${row2.status}`
               : "verification never wrote the row");
  }

  // ------------------------------------------------------------------ L-03
  // An unchecked submission must stay VISIBLE. Dropping it out of the
  // superadmin queue would trade a fail-open for a submission nobody can see,
  // which this codebase has already done once with peer_review.
  {
    const queue = await sa.get("/api/contributions/admin/pending");
    const list = Array.isArray(queue.body) ? queue.body : [];
    const present = s2ok && list.some((s) => s.id === s2.body.submissionId);
    rec("L-03", "an unchecked submission is still visible to a superadmin", !!present,
      `queue=${queue.status} items=${list.length} looking for=${s2ok ? "yes" : "no submission"}`);
  }

  // ------------------------------------------------------------------ L-04
  // The status must SAY the check did not run, rather than reusing "failed".
  // The questions did not fail a review; no review happened. A school told its
  // questions "failed" would rewrite work that was never read.
  rec("L-04", "status distinguishes 'could not check' from 'failed'",
    row2?.llm_verification_status === "unavailable",
    `llm_verification_status=${row2?.llm_verification_status}`);

  // ------------------------------------------------------------------ L-05
  // Nothing in the submit response leaks the stored ciphertext or a key. Tied
  // to a submission asserted to be a 201, so it cannot pass on an error body.
  {
    const body = JSON.stringify(s2.body ?? "");
    const leaks = /sk-ant|api_key|apiKey|[0-9a-f]{32,}/i.test(body);
    rec("L-05", "submit response leaks no credential material", s2ok && !leaks,
      `accepted=${s2ok} ${body.length} bytes leak=${leaks}`);
  }

  /**
   * THE RE-CHECK. `POST /api/contributions/admin/:id/recheck` re-runs the
   * automatic check on a submission the first attempt never read.
   *
   * Every case REUSES submission 2 and moves it between states in SQL: a third
   * submission would be the school's daily limit, and the fourth a 429 this
   * suite has already been fooled by once. The credential is still the
   * undecryptable one, so a re-check that RUNS answers 503 here -- there is no
   * network, and the success branch is covered by
   * `contribution.recheck.test.ts` with fetch mocked instead.
   *
   * Timestamps are written as SQL, never as a bound Date (see CLAUDE.md).
   */
  const id2 = s2ok ? s2.body.submissionId : null;
  const rowOf = async () => (await sql(
    `SELECT status, llm_verification_status AS llm, llm_verification_score AS score,
            llm_verified_at::text AS at, updated_at::text AS upd
       FROM contribution_submissions WHERE id = $1`, [id2]))[0];
  const recheck = (session, id = id2) => session.post(`/api/contributions/admin/${id}/recheck`, {});

  if (!id2) {
    rec("L-06", "re-check cases", false, "submission 2 was not accepted — nothing to measure");
  } else {
    // ---------------------------------------------------------------- L-06
    // A SCHOOL cannot re-run the check on its own work. Judged by the row:
    // llm_verified_at must not move.
    {
      const before = await rowOf();
      const r = await recheck(a);
      const after = await rowOf();
      rec("L-06", "a school admin cannot trigger a re-check",
        r.status === 403 && !isHtml(r.body) && after.at === before.at && after.llm === "unavailable",
        `HTTP ${r.status} verified_at moved=${after.at !== before.at}`);
    }

    // ---------------------------------------------------------------- L-07
    // THE CASE THAT MATTERS. An "unavailable" submission IS re-checked: the
    // timestamp MOVES (the check was attempted again), and because it still
    // cannot run, the answer is 503 and the row is "unavailable" again -- not
    // stuck at the "pending" the claim wrote, and not routed anywhere.
    {
      const before = await rowOf();
      await new Promise((r) => setTimeout(r, 1100));
      const r = await recheck(sa);
      const after = await rowOf();
      rec("L-07", "an unavailable submission is re-checked; still-down is a 503",
        r.status === 503 && r.body?.code === "CHECK_UNAVAILABLE"
          && after.llm === "unavailable" && after.status === "pending"
          && Number(after.score) === 0 && after.at !== before.at,
        `HTTP ${r.status} code=${r.body?.code} llm=${after.llm} status=${after.status} verified_at moved=${after.at !== before.at}`);
    }

    // ---------------------------------------------------------------- L-08
    // A VERDICT IS NOT RE-ROLLED. "failed" means the check ran and scored the
    // questions; asking again until it passes is not a retry.
    {
      await sql(`UPDATE contribution_submissions
                    SET llm_verification_status = 'failed', llm_verification_score = 20
                  WHERE id = $1`, [id2]);
      const before = await rowOf();
      const r = await recheck(sa);
      const after = await rowOf();
      rec("L-08", "a FAILED verdict is refused, and the row is untouched",
        r.status === 409 && r.body?.code === "NOT_RECHECKABLE"
          && after.llm === "failed" && Number(after.score) === 20 && after.at === before.at,
        `HTTP ${r.status} code=${r.body?.code} llm=${after.llm} score=${after.score}`);
    }

    // ---------------------------------------------------------------- L-09
    // A check IN FLIGHT is left alone, or a double click is two Anthropic
    // calls and two results racing to write one row.
    {
      await sql(`UPDATE contribution_submissions
                    SET llm_verification_status = 'pending', llm_verification_score = NULL,
                        llm_verified_at = NULL, updated_at = NOW()
                  WHERE id = $1`, [id2]);
      const r = await recheck(sa);
      const after = await rowOf();
      rec("L-09", "a check still in flight is refused",
        r.status === 409 && r.body?.code === "NOT_RECHECKABLE"
          && after.llm === "pending" && after.at === null,
        `HTTP ${r.status} code=${r.body?.code} llm=${after.llm} verified_at=${after.at}`);
    }

    // ---------------------------------------------------------------- L-10
    // The control for L-09: the SAME row, an hour old. A check that never
    // reported -- the process restarted under it -- must be re-runnable, or
    // L-09 would pass against a route that refuses every "pending" for ever.
    {
      await sql(`UPDATE contribution_submissions
                    SET updated_at = NOW() - INTERVAL '1 hour' WHERE id = $1`, [id2]);
      const r = await recheck(sa);
      const after = await rowOf();
      rec("L-10", "a check that never reported (an hour stale) IS re-run",
        r.status === 503 && r.body?.code === "CHECK_UNAVAILABLE"
          && after.llm === "unavailable" && after.at !== null,
        `HTTP ${r.status} code=${r.body?.code} llm=${after.llm} verified_at set=${after.at !== null}`);
    }

    // ---------------------------------------------------------------- L-11
    // A submission a superadmin has ALREADY DECIDED is not touched, whatever
    // its check status says: a late result must not drag a rejected
    // submission into peer review.
    {
      await sql(`UPDATE contribution_submissions SET status = 'rejected' WHERE id = $1`, [id2]);
      const before = await rowOf();
      const r = await recheck(sa);
      const after = await rowOf();
      rec("L-11", "a submission already decided is refused",
        r.status === 409 && r.body?.code === "NOT_RECHECKABLE"
          && after.status === "rejected" && after.llm === "unavailable" && after.at === before.at,
        `HTTP ${r.status} code=${r.body?.code} status=${after.status} llm=${after.llm}`);
      await sql(`UPDATE contribution_submissions SET status = 'pending' WHERE id = $1`, [id2]);
    }

    // ---------------------------------------------------------------- L-13
    // THE TILES' FIELD NAMES, pinned. The superadmin screen reads
    // totalPending / totalInReview / totalApproved / totalRejected, the route
    // used to send none of them, and `?? 0` drew four zeros above a queue with
    // submissions in it. Asserted as NUMBERS, and totalPending as at least the
    // two this suite made, so an absent field cannot pass as a zero.
    {
      const r = await sa.get("/api/contributions/admin/stats");
      const b = r.body ?? {};
      const names = ["totalPending", "totalInReview", "totalApproved", "totalRejected", "totalNeedsChanges"];
      const allNumbers = names.every((n) => typeof b[n] === "number");
      rec("L-13", "the stats route sends the four figures the tiles read",
        r.status === 200 && !isHtml(r.body) && allNumbers && b.totalPending >= 2,
        `HTTP ${r.status} ${names.map((n) => `${n}=${b[n]}`).join(" ")}`);
    }

    // ---------------------------------------------------------------- L-12
    // An unknown id is a JSON 404, not the SPA's 200.
    {
      const r = await recheck(sa, "00000000-0000-0000-0000-000000000000");
      rec("L-12", "an unknown submission is a JSON 404",
        r.status === 404 && r.body?.code === "NOT_FOUND", `HTTP ${r.status} code=${r.body?.code}`);
    }

    // ---------------------------------------------------------------- L-14
    // "NEEDS CHANGES" IS NOT A REJECTION (owner, 2026-11-14). A rejection is
    // final; needs-changes goes back to the school and returns. They were one
    // figure. Judged by BOTH tiles: needs-changes moves by one and rejected
    // does not move, or this passes against a route that counts it twice.
    {
      const before = (await sa.get("/api/contributions/admin/stats")).body ?? {};
      const picked = await sql(`UPDATE contribution_submissions SET status = 'needs_changes'
        WHERE id = (SELECT id FROM contribution_submissions WHERE status NOT IN ('rejected','needs_changes') LIMIT 1)
        RETURNING id`);
      const after = (await sa.get("/api/contributions/admin/stats")).body ?? {};
      rec("L-14", "needs-changes has its own figure and is not counted as rejected",
        typeof after.totalNeedsChanges === "number" &&
        after.totalNeedsChanges === before.totalNeedsChanges + 1 &&
        after.totalRejected === before.totalRejected,
        `needsChanges ${before.totalNeedsChanges}->${after.totalNeedsChanges} rejected ${before.totalRejected}->${after.totalRejected} picked=${JSON.stringify(picked?.rows ?? picked).slice(0,60)}`);
    }
  }
} finally {
  await sql(`DELETE FROM api_credentials WHERE provider = 'anthropic'`);
}

const failed = results.filter((r) => r.pass === false);
const blocked = results.filter((r) => r.pass === null);
console.log(`\n${results.length - failed.length - blocked.length}/${results.length} passed${blocked.length ? `, ${blocked.length} blocked` : ""}`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
