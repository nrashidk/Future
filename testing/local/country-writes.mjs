/**
 * THE FIVE COUNTRY WRITE ROUTES, WHOSE GUARDS NOTHING ASSERTED.
 *
 * `new-country.mjs` builds a country and a school inside it and never once
 * asks whether a non-superadmin is refused — it contains no 403 assertion at
 * all. So five routes in `country.routes.ts` were reviewed and never run
 * against an unprivileged caller, and all five are the shape this repo
 * distrusts on purpose: the middleware chain carries only `isAuthenticated`
 * and the real check is `checkSuperadmin` as the first statement of the
 * handler. Deleting four lines there leaves a route whose registration still
 * reads as protected.
 *
 * WHAT THESE ROUTES DECIDE, which is why they are worth the effort:
 *
 *   PUT /api/admin/countries/:id writes `curricula`, `subjects` and
 *   `gradeLevels`. Those pick the quiz bank every student in the country draws
 *   from — a cell is one (country, curriculum, subject, grade) and an empty
 *   cell silently removes a subject from a student's paper rather than
 *   degrading it. It is also the route that seeds a curriculum's six subjects
 *   when it is offered, so writing it wrongly is how a curriculum becomes a
 *   dead end at step one.
 *
 *   POST /api/admin/countries adds a country to the catalogue; the two LLM
 *   routes populate and repopulate its question bank.
 *
 * `PATCH /api/admin/countries/:id/license-price` is NOT re-tested here —
 * `pricing.mjs` already denies it to an org admin and judges it by reading the
 * stored price back. Only the school-student rung is added, since that is the
 * lowest-privileged authenticated caller and the one whose own assessment the
 * bank feeds.
 *
 * JUDGED BY THE STORED ROW on every denial. A 403 that nonetheless wrote
 * would read as safe, and this repo has twice produced a 200 with the field
 * silently dropped.
 *
 * DELETES EVERY COUNTRY IT INVENTS. `pricing` and `migration-033-dryrun` both
 * left countries behind once, and `school-setup`'s catalogue count then
 * reported 247 of 250 and failed — a true statement about another suite's
 * litter that reads exactly like a catalogue bug.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const tag = Math.random().toString(36).slice(2, 7);
const { orgs } = await build();
const A = orgs.A;

const sa = new Session(`cw-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

// A GET first, so the session holds a csrf_token cookie: without one the first
// state-changing request is refused 403 CSRF_MISSING before authentication is
// consulted, and a guest case would assert against the wrong guard entirely.
const guest = new Session(`cw-guest-${tag}`);
await guest.get("/api/auth/user");

const studentCreds = A.students?.[0] ?? null;
let student = null;
if (studentCreds?.username && studentCreds?.password) {
  student = new Session(`cw-student-${tag}`);
  await student.login(studentCreds.username, studentCreds.password);
}
if (!student) {
  console.error("REFUSING TO RUN: no student session — the lowest-privileged rung is the point of this suite.");
  process.exit(2);
}

const INVENTED = [`cw1${tag}`.slice(0, 8), `cw2${tag}`.slice(0, 8)];

const countryRow = async (id) => (await sql(
  `SELECT id, name, curricula, subjects, grade_levels, license_price_minor, license_currency
     FROM countries WHERE id = $1`, [id]))[0] ?? null;
const countryCount = async () => Number((await sql(`SELECT COUNT(*)::int AS n FROM countries`))[0].n);

/**
 * `code` is REQUIRED and must be 2–3 UPPERCASE LETTERS — the create schema
 * rejects anything else, and the first draft of this suite omitted it and got
 * a 400 on the positive control while all three denials passed. That is the
 * failure mode worth naming: the denials pass against a create route that
 * cannot create anything, so without C-04 this suite would have been green and
 * worthless. The tag is lowercase alphanumeric, so letters only, uppercased,
 * padded to two.
 */
const codeFor = (seed) => (seed.replace(/[^a-z]/g, "").toUpperCase() + "XX").slice(0, 3);

const newCountryBody = (id, name) => ({
  id,
  code: codeFor(id),
  name,
  nameAr: `بلد ${tag}`,
  flag: "🏳",
  mission: "Invented by country-writes.mjs.",
  vision: "Deleted again by country-writes.mjs.",
  prioritySectors: ["Education"],
  nationalGoals: ["Test goal"],
  curricula: ["British"],
  subjects: ["Mathematics"],
  gradeLevels: ["10"],
});

try {
  // ------------------------------------------------------------------ C-00
  // The routes are real. The SPA catch-all answers 200 with HTML for any
  // unmatched URL, so a single typo in a path would make every denial below
  // "pass" while testing nothing.
  {
    const r = await sa.put(`/api/admin/countries/definitely-not-a-country-${tag}`, { name: "x" });
    rec("C-00", "routes are real: unknown country is a JSON 404, not SPA HTML",
      r.status === 404 && !isHtml(r.body) && typeof r.body?.message === "string",
      `HTTP ${r.status} body=${isHtml(r.body) ? "HTML" : JSON.stringify(r.body).slice(0, 44)}`);
  }

  // =================================================================
  // POST /api/admin/countries
  // =================================================================
  const beforeCount = await countryCount();

  // ------------------------------------------------------------------ C-01
  {
    const r = await guest.post("/api/admin/countries", newCountryBody(INVENTED[0], `Guestland ${tag}`));
    const made = await countryRow(INVENTED[0]);
    rec("C-01", "guest cannot add a country", r.status === 401 && made === null,
      `HTTP ${r.status} row=${made ? "CREATED" : "none"}`);
  }

  // ------------------------------------------------------------------ C-02
  {
    const r = await student.post("/api/admin/countries", newCountryBody(INVENTED[0], `Studentland ${tag}`));
    const made = await countryRow(INVENTED[0]);
    rec("C-02", "school STUDENT cannot add a country", r.status === 403 && made === null,
      `HTTP ${r.status} row=${made ? "CREATED" : "none"}`);
  }

  // ------------------------------------------------------------------ C-03
  {
    const r = await A.session.post("/api/admin/countries", newCountryBody(INVENTED[0], `Orgland ${tag}`));
    const made = await countryRow(INVENTED[0]);
    const after = await countryCount();
    rec("C-03", "org admin cannot add a country, catalogue size unmoved",
      r.status === 403 && made === null && after === beforeCount,
      `HTTP ${r.status} row=${made ? "CREATED" : "none"} count=${beforeCount}→${after}`);
  }

  // ------------------------------------------------------------------ C-04
  // THE POSITIVE CONTROL. Without it a route that refused everybody would pass
  // C-01 to C-03 while the feature was dead for its only intended user.
  {
    const r = await sa.post("/api/admin/countries", newCountryBody(INVENTED[0], `Superland ${tag}`));
    const made = await countryRow(INVENTED[0]);
    rec("C-04", "superadmin CAN add a country, and the row exists",
      r.status < 400 && made !== null && made.name === `Superland ${tag}`,
      `HTTP ${r.status} row=${made ? made.name : "none"}`);
  }

  // =================================================================
  // PUT /api/admin/countries/:id — the quiz-bank route
  // =================================================================
  const target = INVENTED[0];
  const baseline = await countryRow(target);
  if (!baseline) {
    rec("C-05", "PUT cases need the country C-04 created", false, "C-04 did not create it");
  } else {
    const hostile = {
      name: baseline.name,
      curricula: ["American", "IB"],
      subjects: ["Physics"],
      gradeLevels: ["12"],
    };

    // ---------------------------------------------------------------- C-05
    {
      const r = await guest.put(`/api/admin/countries/${target}`, hostile);
      const now = await countryRow(target);
      rec("C-05", "guest cannot rewrite a country's curricula",
        r.status === 401 && JSON.stringify(now.curricula) === JSON.stringify(baseline.curricula),
        `HTTP ${r.status} curricula=${JSON.stringify(now.curricula)}`);
    }

    // ---------------------------------------------------------------- C-06
    // THE ONE THAT MATTERS MOST. A school student rewriting the curricula,
    // subjects and grades that decide which quiz bank their own paper is drawn
    // from — and an empty or wrong cell removes a subject from that paper
    // silently.
    {
      const r = await student.put(`/api/admin/countries/${target}`, hostile);
      const now = await countryRow(target);
      const intact = JSON.stringify(now.curricula) === JSON.stringify(baseline.curricula)
        && JSON.stringify(now.subjects) === JSON.stringify(baseline.subjects)
        && JSON.stringify(now.grade_levels) === JSON.stringify(baseline.grade_levels);
      rec("C-06", "school STUDENT cannot rewrite the quiz-bank dimensions",
        r.status === 403 && intact,
        `HTTP ${r.status} curricula/subjects/grades intact=${intact}`);
    }

    // ---------------------------------------------------------------- C-07
    {
      const r = await A.session.put(`/api/admin/countries/${target}`, hostile);
      const now = await countryRow(target);
      const intact = JSON.stringify(now.curricula) === JSON.stringify(baseline.curricula)
        && JSON.stringify(now.subjects) === JSON.stringify(baseline.subjects);
      rec("C-07", "org admin cannot rewrite a country's curricula", r.status === 403 && intact,
        `HTTP ${r.status} intact=${intact}`);
    }

    // ---------------------------------------------------------------- C-08
    // POSITIVE CONTROL, and it asserts the write LANDED rather than just a
    // 200: the denials above all pass trivially against a PUT that never
    // writes anything at all.
    {
      const r = await sa.put(`/api/admin/countries/${target}`, hostile);
      const now = await countryRow(target);
      rec("C-08", "superadmin CAN rewrite curricula, and it lands",
        r.status < 400 && JSON.stringify(now.curricula) !== JSON.stringify(baseline.curricula),
        `HTTP ${r.status} curricula ${JSON.stringify(baseline.curricula)}→${JSON.stringify(now.curricula)}`);
    }
  }

  // =================================================================
  // The two LLM routes. The superadmin check is the FIRST statement in each
  // handler, so a denial is reached long before any Anthropic call — these are
  // safe with no network. No positive control: the happy path needs a live
  // credential and cannot run here (same limitation as llm-gate's success
  // branch).
  // =================================================================
  for (const [id, label, path] of [
    ["C-09", "generate-questions", `/api/admin/countries/uae/generate-questions`],
    ["C-10", "repopulate", `/api/admin/countries/uae/repopulate`],
  ]) {
    const before = Number((await sql(`SELECT COUNT(*)::int AS n FROM quiz_questions WHERE country_id = 'uae'`))[0].n);
    const rs = await student.post(path, { subject: "Mathematics", grade: "10", count: 1 });
    const ro = await A.session.post(path, { subject: "Mathematics", grade: "10", count: 1 });
    const after = Number((await sql(`SELECT COUNT(*)::int AS n FROM quiz_questions WHERE country_id = 'uae'`))[0].n);
    rec(id, `${label}: student and org admin both refused, bank unchanged`,
      rs.status === 403 && ro.status === 403 && after === before,
      `student=${rs.status} orgadmin=${ro.status} questions=${before}→${after}`);
  }

  // ------------------------------------------------------------------ C-11
  // The school-student rung on the price route. pricing.mjs covers the org
  // admin and judges it by the stored price; this adds the lowest-privileged
  // caller and does the same.
  {
    const before = await countryRow("uae");
    const r = await student.patch(`/api/admin/countries/uae/license-price`, { price: 1, currency: "AED" });
    const after = await countryRow("uae");
    rec("C-11", "school STUDENT cannot change a country's licence price",
      r.status === 403 && Number(after.license_price_minor) === Number(before.license_price_minor),
      `HTTP ${r.status} price=${before.license_price_minor}→${after.license_price_minor}`);
  }
} finally {
  // Invented countries go, and so does anything that references them, or the
  // delete fails on a foreign key and the litter stays.
  //
  // EIGHT TABLES REFERENCE `countries`, enumerated from the live foreign-key
  // catalogue rather than guessed. Deleting quiz_questions alone is not enough:
  // C-08's PUT offers a curriculum, and offering one SEEDS ITS SIX SUBJECTS, so
  // the country leaves `subjects` rows behind and the delete fails on
  // `subjects_country_id_fkey` — which is exactly what the first run did. The
  // WARNING below is what caught it, so it stays.
  const REFERENCING = [
    "assessments", "careers", "child_profiles", "contribution_submissions",
    "country_priority_sectors", "job_market_trends", "quiz_questions", "subjects",
  ];
  for (const id of INVENTED) {
    for (const t of REFERENCING) {
      try {
        await sql(`DELETE FROM ${t} WHERE country_id = $1`, [id]);
      } catch (err) {
        console.error(`cleanup ${t} for ${id}:`, String(err.message).slice(0, 80));
      }
    }
    try {
      await sql(`DELETE FROM countries WHERE id = $1`, [id]);
    } catch (err) {
      console.error(`cleanup ${id}:`, String(err.message).slice(0, 90));
    }
  }
  const left = await sql(`SELECT id FROM countries WHERE id = ANY($1)`, [INVENTED]);
  if (left.length) console.error(`WARNING: invented countries still present: ${left.map((r) => r.id).join(", ")}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
