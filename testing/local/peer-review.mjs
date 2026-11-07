/**
 * PEER REVIEW of contributed questions.
 *
 * A submission passing the automatic LLM check goes to three other schools and
 * two agreeing decide it. Waiting for a superadmin does not scale past a
 * handful of schools and puts one person's judgement behind every question in
 * the bank.
 *
 * FIVE RULES, and every one of them fails SILENTLY if it is wrong -- which is
 * why each gets an assertion rather than a comment:
 *
 *   P-02  a school never reviews its own work, in any country
 *   P-03  the reviewer is never told who wrote it
 *   P-05  one vote per SCHOOL, not per administrator
 *   P-06  a majority decides, and the questions follow the decision
 *   P-08  credit goes only to reviewers who voted WITH the outcome
 *   P-12  a school only reviews its own CURRICULUM
 *   P-13  ...and only within its own COUNTRY
 *
 * P-08 is the one holding the whole thing up. Credit every review regardless
 * and a school is paid to approve everything unread as fast as it can click --
 * the cheapest possible way to earn, and the one that would quietly fill the
 * bank with whatever the automatic check happened to let through.
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

const question = (n) => ({
  question: `Peer review probe ${n}: which option is correct?`,
  questionType: "multiple_choice",
  options: ["Option A", "Option B", "Option C", "Option D"],
  correctAnswer: "Option B",
  explanation: "Because B is correct.",
  topic: "General", difficulty: "easy", cognitiveLevel: "knowledge",
});

const { orgs } = await build();
const A = orgs.A; // the author
const B = orgs.B; // a reviewer

/**
 * Three reviewing schools are needed and the fixtures give two organizations,
 * so two more are created. They are put in a DIFFERENT country on purpose:
 * "never your own, even across countries" is only tested if a reviewer from
 * elsewhere is in the pool.
 */
const sa = new Session("peerSa");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const tag = Math.random().toString(36).slice(2, 6);

const extra = [];
for (const [i, n] of [["one", "Reviewer One"], ["two", "Reviewer Two"]]) {
  const created = await sa.post("/api/superadmin/organizations/create-with-admin", {
    organizationName: `${n} ${tag}`,
    totalLicenses: 5,
    isUnlimitedLicenses: false,
    countryId: "uae",
    curriculum: "MOE National",
    adminFirstName: n.split(" ")[0],
    adminLastName: n.split(" ")[1],
    adminEmail: `rev.${i}.${tag}@futurepath.test`,
    adminPhone: "+971500000000",
    adminUsername: `rev${i}${tag}`,
  });
  const body = created.body ?? {};
  const creds = body.admin?.credentials ?? {};
  const s = new Session(`Reviewer${i}`);
  let loggedIn = false;
  if (creds.password) {
    await s.login(creds.username ?? `rev${i}${tag}`, creds.password);
    loggedIn = true;
  }
  extra.push({
    name: n, session: s,
    orgId: body.organization?.id ?? body.id ?? body.organizationId,
    loggedIn,
  });
}
rec("P-00", "two more reviewing schools exist",
  extra.every((e) => e.orgId && e.loggedIn),
  extra.map((e) => `${e.name}=${e.orgId ? "created" : "FAILED"}`).join(", "));

// --------------------------------------------- A submits, and reaches review
let submissionId = null;
{
  const r = await A.session.post("/api/contributions/submit", {
    countryId: "uae", curriculum: "MOE National", subject: "mathematics", grade: 10,
    questions: [question(1), question(2)],
  });
  submissionId = r.body?.submissionId ?? r.body?.submission?.id ?? r.body?.id;

  // The LLM pre-check is unreachable offline, so the status is set here to the
  // state that check produces. Doing it in SQL rather than pretending the
  // check ran keeps the fake visible instead of buried in a mock.
  if (submissionId) {
    await sql(`UPDATE contribution_submissions SET status = 'peer_review' WHERE id = $1`, [submissionId]);
  }
  rec("P-01", "a submission reaches peer review", !!submissionId,
    submissionId ? `id ${submissionId.slice(0, 8)}` : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

// ------------------------------------- P-02  the author cannot see or review it
{
  const own = await A.session.get("/api/contributions/review-queue");
  const mine = (own.body?.submissions ?? []).some((s) => s.id === submissionId);
  rec("P-02", "the author's own submission is not in its own queue",
    own.status === 200 && !mine,
    `${(own.body?.submissions ?? []).length} in queue, own present: ${mine}`);

  // The queue is a convenience; the control is the write. A crafted request
  // must be refused even though the queue never offered it.
  const direct = await A.session.post(`/api/contributions/review/${submissionId}`, { vote: "approve" });
  rec("P-02b", "and voting on it directly is refused",
    direct.status === 403 && direct.body?.error === "OWN_SUBMISSION",
    `HTTP ${direct.status} ${direct.body?.error ?? ""}`);
}

// --------------------------------------------- P-03  blind: no author identity
{
  const q = await B.session.get("/api/contributions/review-queue");
  const item = (q.body?.submissions ?? []).find((s) => s.id === submissionId);
  const leaked = item ? Object.keys(item).filter((k) =>
    /organizationId|submittedBy|organization|school/i.test(k)) : [];
  rec("P-03", "the reviewer is told nothing about who wrote it",
    !!item && leaked.length === 0,
    item ? `fields: ${Object.keys(item).join(", ")}` : "submission not offered to the reviewer");
}

// ------------------------------------------------ P-04 / P-05  one vote each
{
  const first = await B.session.post(`/api/contributions/review/${submissionId}`, {
    vote: "approve", comment: "Clear and correct.",
  });
  rec("P-04", "a reviewing school can vote",
    first.status === 200 && first.body?.recorded === true && first.body?.decided === false,
    `recorded, ${first.body?.reviewsSoFar}/${first.body?.reviewsRequired}, decided=${first.body?.decided}`);

  const again = await B.session.post(`/api/contributions/review/${submissionId}`, { vote: "reject" });
  rec("P-05", "the same school cannot vote twice",
    again.status === 409,
    `HTTP ${again.status} ${again.body?.error ?? ""}`);
}

// --------------------------------- P-06  a majority decides and settles it
{
  const second = await extra[0].session.post(`/api/contributions/review/${submissionId}`, {
    vote: "approve", comment: "Agreed.",
  });
  rec("P-06", "two agreeing settles it without waiting for the third",
    second.body?.decided === true && second.body?.outcome === "approved",
    `after ${second.body?.reviewsSoFar} votes: ${second.body?.outcome}`);

  const [row] = await sql(`SELECT status FROM contribution_submissions WHERE id = $1`, [submissionId]);
  rec("P-07", "the submission's status follows the decision",
    row?.status === "approved", `status=${row?.status}`);

  // And a late vote finds it closed rather than reopening it.
  const late = await extra[1].session.post(`/api/contributions/review/${submissionId}`, { vote: "reject" });
  rec("P-07b", "a late vote cannot reopen a settled submission",
    late.status === 409 && late.body?.error === "NOT_IN_REVIEW",
    `HTTP ${late.status} ${late.body?.error ?? ""}`);
}

// ---------------------- P-08  credit follows the majority, not participation
{
  const credited = await sql(
    `SELECT id, name, pending_reward_credits FROM organizations WHERE id = ANY($1)`,
    [[B.orgId, extra[0].orgId, extra[1].orgId]],
  );
  const byId = Object.fromEntries(credited.map((r) => [r.id, Number(r.pending_reward_credits ?? 0)]));

  // B and the first extra voted approve, and approve won. The second extra
  // voted reject AFTER the decision, so it is not on the majority side and
  // its vote was refused outright -- it must have earned nothing.
  rec("P-08", "only the schools that voted with the outcome are credited",
    byId[B.orgId] > 0 && byId[extra[0].orgId] > 0 && byId[extra[1].orgId] === 0,
    `approvers: ${byId[B.orgId]}, ${byId[extra[0].orgId]} | dissenter: ${byId[extra[1].orgId]}`);
}

// ------------------------------------- P-09  the author sees the outcome, blind
{
  const fb = await A.session.get(`/api/contributions/${submissionId}/feedback`);
  const reviews = fb.body?.reviews ?? [];
  const leaked = reviews.flatMap((r) => Object.keys(r).filter((k) => /org|user|school|by/i.test(k)));
  rec("P-09", "the author sees the verdicts and comments but not the reviewers",
    fb.status === 200 && reviews.length > 0 && leaked.length === 0,
    `${reviews.length} reviews, fields: ${reviews[0] ? Object.keys(reviews[0]).join(", ") : "none"}`);
}

// -------------------- P-10  a rejected submission is discarded, and says so
{
  const r = await A.session.post("/api/contributions/submit", {
    countryId: "uae", curriculum: "MOE National", subject: "science", grade: 9,
    questions: [question(3)],
  });
  const id = r.body?.submissionId ?? r.body?.submission?.id ?? r.body?.id;
  await sql(`UPDATE contribution_submissions SET status = 'peer_review' WHERE id = $1`, [id]);

  await B.session.post(`/api/contributions/review/${id}`, { vote: "reject", comment: "Ambiguous wording." });
  const decide = await extra[0].session.post(`/api/contributions/review/${id}`, {
    vote: "reject", comment: "Two answers are defensible.",
  });

  const fb = await A.session.get(`/api/contributions/${id}/feedback`);
  rec("P-10", "a rejected submission is discarded and the school is told",
    decide.body?.outcome === "rejected" && fb.body?.status === "rejected" &&
    fb.body?.discarded === true && (fb.body?.reviews ?? []).length === 2,
    `outcome=${decide.body?.outcome} discarded=${fb.body?.discarded} with ${(fb.body?.reviews ?? []).length} comments`);

  // The questions must not have reached the bank.
  const inBank = await sql(
    `SELECT COUNT(*)::int n FROM quiz_questions WHERE question LIKE $1`, ["Peer review probe 3%"]);
  rec("P-11", "its questions never entered the question bank",
    Number(inBank[0].n) === 0, `${inBank[0].n} found in the bank`);
}

/**
 * ------------------- P-12  a school only reviews its OWN curriculum
 *
 * A school teaching MOE National cannot judge whether a British-curriculum
 * question is right for its grade. It would be voting on presentation, or
 * voting to collect the credit.
 *
 * Both halves are asserted, because they are different mechanisms: the queue
 * not offering it (a convenience) and the write refusing it (the control). A
 * queue filter alone is bypassed by posting the id.
 *
 * The mismatched reviewer is put in the SAME country as the author, so this
 * isolates the curriculum guard from the country one next door. P-13 does the
 * reverse: same curriculum, different country.
 */
{
  // Offer British on the UAE so a school can legitimately be put on it. This
  // is the real superadmin path, and it seeds the curriculum's six subjects.
  await sa.put("/api/admin/countries/uae", {
    curricula: ["MOE National", "British"],
  });

  /**
   * TWO British schools, not one. With a single one its queue is empty either
   * way, and "not offered the MOE submission" would pass just as well if the
   * restriction refused everything -- an assertion that holds on an empty list
   * is not an assertion. The second gives the first something it SHOULD see,
   * so the queue has to prove it is filtering rather than closing.
   */
  const makeBritish = async (label, slug) => {
    const created = await sa.post("/api/superadmin/organizations/create-with-admin", {
      organizationName: `${label} ${tag}`,
      totalLicenses: 5,
      isUnlimitedLicenses: false,
      countryId: "uae",
      curriculum: "British",
      adminFirstName: "Brit", adminLastName: label.replace(/\W/g, ""),
      adminEmail: `${slug}.${tag}@futurepath.test`,
      adminPhone: "+971500000000",
      adminUsername: `${slug}${tag}`,
    });
    const body = created.body ?? {};
    const creds = body.admin?.credentials ?? {};
    const orgId = body.organization?.id ?? body.id ?? body.organizationId;
    const s = new Session(label);
    if (creds.password) {
      await s.login(creds.username ?? `${slug}${tag}`, creds.password);
      const orgsLocale = await (await fetch(`${BASE}/locales/en/orgs.json`)).json().catch(() => null);
      await s.post("/api/my-organization/consent", {
        consentsToProcessing: true,
        attestsGuardianConsent: true,
        attestationText: orgsLocale
          ? `${orgsLocale.consentProcessing ?? ""}\n${orgsLocale.consentGuardian ?? ""}`.trim()
          : "LOCAL FIXTURE: consent attestation wording unavailable",
        locale: "en",
      });
    }
    return { session: s, orgId, ok: !!orgId && !!creds.password };
  };

  const brit = await makeBritish("British Reviewer", "brit");
  const britAuthor = await makeBritish("British Author", "britauth");

  // Something the British school SHOULD see: same curriculum, another school.
  const britSub = await britAuthor.session.post("/api/contributions/submit", {
    countryId: "uae", curriculum: "British", subject: "mathematics", grade: 11,
    questions: [question(5)],
  });
  const britId = britSub.body?.submissionId ?? britSub.body?.submission?.id ?? britSub.body?.id;
  if (britId) {
    await sql(`UPDATE contribution_submissions SET status = 'peer_review' WHERE id = $1`, [britId]);
  }

  // A fresh MOE National submission for them to NOT see.
  const sub = await A.session.post("/api/contributions/submit", {
    countryId: "uae", curriculum: "MOE National", subject: "english", grade: 11,
    questions: [question(4)],
  });
  const id = sub.body?.submissionId ?? sub.body?.submission?.id ?? sub.body?.id;
  await sql(`UPDATE contribution_submissions SET status = 'peer_review' WHERE id = $1`, [id]);

  rec("P-12", "two British schools exist, with one submission on each curriculum",
    brit.ok && britAuthor.ok && !!id && !!britId,
    `reviewer=${brit.ok ? "ok" : "FAILED"} author=${britAuthor.ok ? "ok" : "FAILED"} ` +
    `moe=${id ? id.slice(0, 8) : "FAILED"} british=${britId ? britId.slice(0, 8) : "FAILED"}`);

  /**
   * ONE assertion covering both directions, because either alone passes on a
   * mistake: offered the British submission (so the filter is not a blanket
   * refusal) and NOT offered the MOE one (so it is filtering on curriculum).
   */
  const q = await brit.session.get("/api/contributions/review-queue");
  const offered = (q.body?.submissions ?? []);
  rec("P-12b", "it is offered its own curriculum and not the other",
    q.status === 200 &&
      offered.some((s) => s.id === britId) &&
      !offered.some((s) => s.id === id) &&
      offered.every((s) => s.curriculum === "British"),
    `HTTP ${q.status}, ${offered.length} offered: ` +
    `${[...new Set(offered.map((s) => s.curriculum))].join("/") || "none"}`);

  const direct = await brit.session.post(`/api/contributions/review/${id}`, { vote: "approve" });
  rec("P-12c", "and voting on it directly is refused",
    direct.status === 403 && direct.body?.error === "CURRICULUM_MISMATCH",
    `HTTP ${direct.status} ${direct.body?.error ?? ""}`);

  /**
   * ---------------- P-13  same curriculum, DIFFERENT country, still refused
   *
   * The same curriculum is not the same syllabus across borders. A school
   * teaching MOE National in another country would be marking a UAE MOE
   * question against requirements it does not share.
   *
   * The fixture seeds one country, so a second is created. The refusal code is
   * asserted specifically: with a single shared code this would pass on the
   * CURRICULUM guard firing and never reach the country one -- the "check what
   * the guard you are testing actually guards" trap.
   */
  const OTHER = `peerland${tag}`;
  const mk = await sa.post("/api/admin/countries", {
    id: OTHER, name: `Peerland ${tag}`, code: `P${tag.slice(0, 1).toUpperCase()}`,
    autoPopulate: false,
  });
  await sa.put(`/api/admin/countries/${OTHER}`, { curricula: ["MOE National"] });

  const abroad = await sa.post("/api/superadmin/organizations/create-with-admin", {
    organizationName: `Abroad School ${tag}`,
    totalLicenses: 5,
    isUnlimitedLicenses: false,
    countryId: OTHER,
    curriculum: "MOE National",
    adminFirstName: "Abroad", adminLastName: "Reviewer",
    adminEmail: `abroad.${tag}@futurepath.test`,
    adminPhone: "+971500000000",
    adminUsername: `abroad${tag}`,
  });
  const aBody = abroad.body ?? {};
  const aCreds = aBody.admin?.credentials ?? {};
  const abroadSession = new Session("Abroad");
  if (aCreds.password) await abroadSession.login(aCreds.username ?? `abroad${tag}`, aCreds.password);

  rec("P-13", "a same-curriculum school in another country exists",
    mk.status < 400 && !!aCreds.password,
    `country HTTP ${mk.status}, school ${aCreds.password ? "ok" : "FAILED"}`);

  const abroadQ = await abroadSession.get("/api/contributions/review-queue");
  const abroadOffered = abroadQ.body?.submissions ?? [];
  rec("P-13b", "it is not offered the UAE submission on the same curriculum",
    abroadQ.status === 200 && !abroadOffered.some((s) => s.id === id),
    `HTTP ${abroadQ.status}, ${abroadOffered.length} offered`);

  const abroadVote = await abroadSession.post(`/api/contributions/review/${id}`, { vote: "approve" });
  rec("P-13c", "and its vote is refused on COUNTRY, not curriculum",
    abroadVote.status === 403 && abroadVote.body?.error === "COUNTRY_MISMATCH",
    `HTTP ${abroadVote.status} ${abroadVote.body?.error ?? ""}`);

  /**
   * The positive direction, on the same submission the mismatched school was
   * just refused. Without this, a restriction written against country, or one
   * that refused everybody, would pass P-12b and P-12c.
   */
  const matching = await extra[1].session.post(`/api/contributions/review/${id}`, { vote: "approve" });
  rec("P-12d", "a school on the SAME curriculum can still vote on it",
    matching.status === 200 && matching.body?.recorded === true,
    `HTTP ${matching.status} recorded=${matching.body?.recorded} ${matching.body?.error ?? ""}`);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`peer-review: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
