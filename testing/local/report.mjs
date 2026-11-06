/**
 * A complete assessment, start to finished report — the product's actual
 * output, which 120 tests of plumbing never touched.
 *
 * Runs the whole flow for a guest (free, 2 matches) and for a school student
 * (school tier), then interrogates the report itself: how many matches, which
 * scoring components actually contributed, whether the reasoning is present,
 * and whether the vision component is inert.
 *
 * The last of those is the point. A report renders perfectly whether or not
 * country_sector_categories exists; the only difference is that a third of
 * the basic score silently becomes a constant. Nothing in the product says so,
 * so this suite says it.
 */
import { build, Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(52)} ${note}`);
};
const detail = (r) => isHtml(r.body) ? "NO SUCH ROUTE" : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 110)}`;

const COUNTRY = "uae";
const CURRICULUM = "MOE National";

/** Drives one assessment from creation to generated recommendations. */
/**
 * RIASEC item ids are theme-prefixed -- calculateRiasecScores reads
 * questionId.charAt(0) as the theme -- and the schema requires EXACTLY 30
 * responses, five per theme, each 1-5.
 */
function riasec30() {
  const out = {};
  for (const theme of ["R", "I", "A", "S", "E", "C"]) {
    for (let i = 1; i <= 5; i++) out[`${theme}${i}`] = ((i + theme.charCodeAt(0)) % 5) + 1;
  }
  return out;
}
/**
 * Real CVQ item ids, fetched rather than guessed -- they are CVQ-A1 … CVQ-SD3
 * across five domains, 15 items. Invented ids satisfy the creation schema (it
 * only counts and range-checks) but store no domain scores, so generation
 * then refuses with "Missing: Work Values Assessment (CVQ)".
 */
async function cvq15() {
  const r = await fetch(`${BASE}/api/cvq/items`);
  const items = (await r.json()).items ?? [];
  const out = {};
  items.forEach((item, i) => { out[item.id] = (i % 5) + 1; });
  return out;
}

async function runAssessment(session, label, { subjects, grade = "10", premium = false }) {
  const steps = {};

  /**
   * assessmentType is NOT taken from the client -- the server derives it, and
   * it only becomes "premium" when RIASEC/CVQ responses are supplied AND
   * isEntitledForPremiumAssessment passes. Asking for "school" in the payload
   * is ignored, which is the correct anti-tampering behaviour and is why an
   * earlier version of this test saw 2 matches where it expected 5.
   */
  const made = await session.post("/api/assessments", {
    favoriteSubjects: subjects,
    interests: ["Technology", "Healthcare", "Business"],
    countryId: COUNTRY, curriculum: CURRICULUM, grade,
    ...(premium ? { riasecResponses: riasec30(), cvqResponses: await cvq15() } : {}),
  });
  steps.create = made;
  const id = made.body?.id;
  if (!id) return { id: null, steps };

  // Quiz: generate, then answer every question.
  const gen = await session.post(`/api/assessments/${id}/quiz/generate`, {});
  steps.quizGenerate = gen;
  const questions = gen.body?.questions ?? [];
  if (questions.length > 0) {
    /**
     * correctAnswer is deliberately NOT sent to the client -- it is the answer
     * key -- so a test cannot answer correctly on purpose. Options come back
     * as { id, text }, and the scorer compares the submitted string against
     * question.correctAnswer, so the answer must be a STRING: the option text.
     * Picking the first option gives a realistic mix of right and wrong,
     * which is what a real student produces anyway.
     */
    const responses = questions.map((q) => {
      const opt = Array.isArray(q.options) ? q.options[0] : null;
      return {
        questionId: q.id,
        answer: typeof opt === "string" ? opt : (opt?.text ?? "a"),
      };
    });
    steps.quizSubmit = await session.post(`/api/assessments/${id}/quiz/submit`, { responses });
  }

  // Interests, aspirations and vision alignment live on the assessment record.
  /**
   * Generation refuses an incomplete assessment and names what is missing:
   * "Missing: Name, Age, Career Aspirations". So the record needs the
   * demographics a real student enters at step 1 as well as the later steps --
   * a guest has none of them until the form supplies them.
   */
  steps.patch = await session.patch(`/api/assessments/${id}`, {
    // The columns are `name` and `age` on assessments (not studentName), and
    // careerAspirations is a text ARRAY, not a sentence.
    name: `Report Probe ${label}`,
    age: 15,
    interests: ["Technology", "Healthcare", "Business"],
    careerAspirations: ["Doctor", "Biomedical Engineer"],
    visionAlignment: { healthcare: 5, technology: 4 },
    currentStep: 6,
  });

  // CVQ is stored by its own endpoint; the responses passed at creation only
  // decide the tier.
  if (premium) {
    steps.cvq = await session.post("/api/cvq/submit", {
      assessmentId: id, responses: await cvq15(), durationSeconds: 120,
    });
  }

  steps.generate = await session.post(`/api/recommendations/generate/${id}`, {});
  steps.read = await session.get(`/api/recommendations?assessmentId=${id}`);
  return { id, steps };
}

const { orgs } = await build();

// ------------------------------------------------------------ guest, free tier
console.log("\n--- guest, free tier ---\n");
const guest = new Session("reportGuest");
await guest.get("/api/auth/user");
const g = await runAssessment(guest, "guest", {
  subjects: ["Mathematics", "Biology", "Chemistry"],
});

rec("RP-01", "assessment created", !!g.id, detail(g.steps.create));
rec("RP-02", "quiz generated", (g.steps.quizGenerate?.body?.questions?.length ?? 0) > 0,
  `${g.steps.quizGenerate?.body?.questions?.length ?? 0} questions`);
rec("RP-03", "quiz answers accepted", (g.steps.quizSubmit?.status ?? 500) < 400,
  detail(g.steps.quizSubmit ?? { status: 0, body: null }));
rec("RP-04", "assessment updated with interests and aspirations",
  (g.steps.patch?.status ?? 500) < 400, detail(g.steps.patch));
rec("RP-05", "recommendations generated", (g.steps.generate?.status ?? 500) < 400,
  detail(g.steps.generate));

const recs = Array.isArray(g.steps.read?.body) ? g.steps.read.body : [];
rec("RP-06", "the report has matches", recs.length > 0, `${recs.length} matches`);
rec("RP-07", "free tier is capped at 2 matches", recs.length === 2, `${recs.length} matches`);

// ------------------------------------------------------- the report's contents
if (recs.length > 0) {
  const first = recs[0];
  const keys = Object.keys(first);

  rec("RP-08", "each match names a career", !!(first.careerTitle ?? first.title ?? first.career),
    (first.careerTitle ?? first.title ?? "(none)").toString().slice(0, 40));
  rec("RP-09", "each match carries an overall score",
    typeof first.overallMatchScore === "number" || !isNaN(Number(first.overallMatchScore)),
    `overallMatchScore=${first.overallMatchScore}`);

  /**
   * The reasoning is the product's promise: landing copy says every match
   * comes with the subjects, interests and values that placed it there. If
   * the component breakdown is missing, that promise is unbacked.
   */
  // The breakdown is flat columns, not a nested object: subjectMatchScore,
  // interestMatchScore, countryVisionAlignment, futureMarketDemand.
  const components = ["subjectMatchScore", "interestMatchScore", "countryVisionAlignment", "futureMarketDemand"];
  const present = components.filter((c) => first[c] !== undefined && first[c] !== null);
  rec("RP-10", "each match exposes every scoring component",
    present.length === components.length,
    present.length === components.length
      ? components.map((c) => `${c}=${first[c]}`).join("  ")
      : `missing: ${components.filter((c) => !present.includes(c)).join(", ")}`);

  /**
   * THE SILENT ONE. calculateVisionScore returns VISION_FLOOR (40) for every
   * career when country_sector_categories is empty. The report still renders.
   * If every vision score is identical, the component contributed nothing and
   * a third of a basic score is a constant.
   */
  const visionScores = recs
    .map((r) => Number(r.countryVisionAlignment))
    .filter((v) => !isNaN(v));
  if (visionScores.length < 2) {
    rec("RP-11", "the vision component discriminates between careers", null,
      `only ${visionScores.length} vision score(s) exposed`);
  } else {
    const allSame = visionScores.every((v) => v === visionScores[0]);
    rec("RP-11", "the vision component discriminates between careers", !allSame,
      allSame
        ? `ALL ${visionScores.length} vision scores are ${visionScores[0]} — component is inert, sector map missing`
        : `scores vary: ${visionScores.join(", ")}`);
  }
}

// --------------------------------------------------------- school student tier
console.log("\n--- school student ---\n");
const stu = new Session("reportStudent");
await stu.login(orgs.A.students[0].username, orgs.A.students[0].password);
// "school" and "premium" are the two premium tiers (shared/assessmentTier.ts),
// and the cap is 2 free / 5 premium. The earlier run asked for 2 and got 2,
// which proved nothing about the cap.
const s = await runAssessment(stu, "student", {
  subjects: ["Mathematics", "Physics", "English"], premium: true,
});
rec("RP-12b", "a school student's assessment is derived as premium",
  s.steps.create?.body?.assessmentType === "premium",
  `assessmentType=${s.steps.create?.body?.assessmentType}`);
rec("RP-12", "school student completes an assessment", !!s.id, detail(s.steps.create));
rec("RP-13", "school student's recommendations generate",
  (s.steps.generate?.status ?? 500) < 400, detail(s.steps.generate));
const sRecs = Array.isArray(s.steps.read?.body) ? s.steps.read.body : [];
rec("RP-14", "school tier gets the premium cap of 5 matches", sRecs.length === 5,
  `${sRecs.length} matches`);

// The same inert-vision check on the school student's report, where the
// vision weight is 20% rather than 30%.
{
  const v = sRecs.map((r) => Number(r.countryVisionAlignment)).filter((n) => !isNaN(n));
  if (v.length < 2) {
    rec("RP-16", "school report's vision component discriminates", null, `${v.length} score(s)`);
  } else {
    const same = v.every((x) => x === v[0]);
    rec("RP-16", "school report's vision component discriminates", !same,
      same ? `ALL ${v.length} are ${v[0]} — inert` : `varies: ${v.join(", ")}`);
  }
}

// ----------------------------------------------------------------- the PDF
{
  /**
   * The PDF is a premium feature: a free guest asking for one is refused with
   * "PDF report is a premium feature", which is correct product behaviour and
   * not an authorization failure. An earlier version of this test asked as the
   * guest and recorded the refusal as a bug.
   */
  if (g.id) {
    const guestToken = g.steps.create?.body?.guestSessionId;
    const r = await guest.get(`/api/recommendations/pdf/${g.id}?guestToken=${encodeURIComponent(guestToken ?? "")}`);
    const refusedAsPremium = r.status === 403 && /premium/i.test(JSON.stringify(r.body));
    rec("RP-15", "a free guest is refused the PDF as a premium feature",
      refusedAsPremium, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 70)}`);
  }

  /**
   * The premium student's PDF really renders -- this drives Puppeteer.
   *
   * Fetched as BYTES, not through Session.req: that reads every response with
   * res.text(), which mangles binary. Doing it that way reported a valid-
   * looking "%PDF header, 200 bytes" pass for what was really a corrupted
   * read -- a real report is tens of kilobytes, so the size is the assertion
   * that matters as much as the header.
   */
  if (s.id) {
    const res = await fetch(`${BASE}/api/recommendations/pdf/${s.id}`, {
      headers: { cookie: stu.cookie, "x-forwarded-for": stu.clientIp },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const header = buf.subarray(0, 5).toString("latin1");
    const trailer = buf.subarray(-1024).toString("latin1");
    const ok = res.status === 200 && header === "%PDF-" && /%%EOF/.test(trailer) && buf.length > 10_000;
    rec("RP-17", "the premium report renders as a real, complete PDF", ok,
      res.status === 200
        ? `header=${JSON.stringify(header)} bytes=${buf.length} eof=${/%%EOF/.test(trailer)}`
        : `HTTP ${res.status}`);
    if (ok) {
      const { writeFileSync } = await import("fs");
      writeFileSync("/tmp/claude-0/-home-claude/02cff30d-f3af-5c58-9ad5-4dbfc039eb52/scratchpad/premium-report.pdf", buf);
    }
  }
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`report: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
