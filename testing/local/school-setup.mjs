/**
 * SCHOOL SETUP, AND THE REFERENCE VOCABULARY.
 *
 * A school must know its country and its curriculum before it can enrol a
 * student or contribute a question. Both decide which quiz bank a student's
 * assessment draws from and which questions the school may submit.
 *
 * THE STATE THIS GUARDS IS REACHABLE, which is why the gate exists rather than
 * a NOT NULL: the Stripe group-purchase path creates an organization inside
 * the payment transaction, where neither value is available, and a NOT NULL
 * there would roll back a completed purchase. Superadmin creation already
 * demands both. So the gap belongs to the school bought rather than created --
 * the one least likely to be looked at afterwards.
 *
 * S-03 is the one that matters. The contribution route guards country and
 * curriculum as "if the school has one set, it must match", so a school with
 * NEITHER skipped both and could submit questions tagged to any country and
 * any curriculum the platform knows about.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(54)} ${note}`);
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

// Reproduce the bought-school state: an organization with neither value, which
// is what the Stripe path writes.
await sql(`UPDATE organizations SET country_id = NULL, curriculum = NULL WHERE id = $1`, [A.orgId]);
const [bare] = await sql(`SELECT country_id, curriculum FROM organizations WHERE id = $1`, [A.orgId]);
rec("S-00", "a school can exist with neither country nor curriculum",
  bare.country_id === null && bare.curriculum === null,
  `country=${bare.country_id} curriculum=${bare.curriculum}`);

// ------------------------------------------------- S-01  enrolment is blocked
{
  const r = await A.session.post(`/api/admin/organizations/${A.orgId}/members`, {
    fullName: "Blocked Student", studentName: "Blocked Student", grade: "10",
    dateOfBirth: "2010-05-01", studentGender: "male", passwordComplexity: "medium",
  });
  rec("S-01", "it cannot enrol a student",
    r.status === 409 && r.body?.code === "SCHOOL_SETUP_REQUIRED",
    `HTTP ${r.status} ${r.body?.code ?? JSON.stringify(r.body).slice(0, 70)}`);
}

// --------------------------------------------- S-02  bulk enrolment too
{
  const r = await A.session.post(`/api/admin/organizations/${A.orgId}/members/bulk`, {
    students: [{
      fullName: "Bulk One", studentName: "Bulk One", grade: "10",
      dateOfBirth: "2010-05-02", studentGender: "female",
    }],
  });
  rec("S-02", "nor enrol in bulk (the same gate, all three sinks)",
    r.status === 409 && r.body?.code === "SCHOOL_SETUP_REQUIRED",
    `HTTP ${r.status} ${r.body?.code ?? ""}`);
}

// ------------------------------- S-03  THE LEAK: contributing anywhere at all
{
  const r = await A.session.post("/api/contributions/submit", {
    countryId: "uae", curriculum: "MOE National", subject: "mathematics", grade: 10,
    // A FULLY VALID question on purpose. A payload the body schema rejects
    // would return 400 before the gate is ever consulted, and the test would
    // "fail" (or worse, "pass") on a validation error while proving nothing
    // about the thing it names.
    questions: [{
      question: "Leak check: what is 2 + 2?",
      questionType: "multiple_choice",
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctAnswer: "Option B",
      explanation: "Because B is correct.",
      topic: "General", difficulty: "easy", cognitiveLevel: "knowledge",
    }],
  });
  rec("S-03", "nor contribute questions to any country or curriculum",
    r.status === 409 && r.body?.code === "SCHOOL_SETUP_REQUIRED",
    `HTTP ${r.status} ${r.body?.code ?? JSON.stringify(r.body).slice(0, 70)}`);
}

// --------------------------------- S-04  but it CAN fix itself, and then act
{
  // The admin must not be trapped: setting country and curriculum is exactly
  // what the gate is asking for, so that write stays open.
  const fix = await A.session.patch(`/api/admin/organizations/${A.orgId}`, {
    countryId: "uae", curriculum: "MOE National",
  });
  rec("S-04", "the admin can set country and curriculum themselves",
    fix.status < 400, `HTTP ${fix.status}`);

  const r = await A.session.post(`/api/admin/organizations/${A.orgId}/members`, {
    fullName: "Allowed Student", studentName: "Allowed Student", grade: "10",
    dateOfBirth: "2010-05-03", studentGender: "male", passwordComplexity: "medium",
  });
  rec("S-05", "and then enrolment works (the gate is not a permission wall)",
    r.status < 400, `HTTP ${r.status}`);
}

// ------------------------------- S-06  a half-set-up school is still blocked
{
  await sql(`UPDATE organizations SET curriculum = NULL WHERE id = $1`, [A.orgId]);
  const r = await A.session.post(`/api/admin/organizations/${A.orgId}/members`, {
    fullName: "Half Setup", studentName: "Half Setup", grade: "10",
    dateOfBirth: "2010-05-04", studentGender: "female", passwordComplexity: "medium",
  });
  const missing = r.body?.missing ?? [];
  rec("S-06", "country alone is not enough, and it says which is missing",
    r.status === 409 && missing.length === 1 && missing[0] === "curriculum",
    `HTTP ${r.status} missing=${JSON.stringify(missing)}`);
  await sql(`UPDATE organizations SET curriculum = $2 WHERE id = $1`, [A.orgId, "MOE National"]);
}

// ============================================ the reference vocabulary
/**
 * One source for the four lists every prompt, dropdown and validator needs.
 * The reason it exists is drift: a subject NAME on one side and a subject CODE
 * on the other is a defect this codebase has already had, and the Arabic
 * report printed English subject names because the server had no Arabic
 * subject list at all.
 */
{
  const r = await fetch(`${BASE}/api/reference?countryId=uae`);
  const body = await r.json();
  const uae = body.countries?.[0];

  rec("R-01", "the reference endpoint answers for a country",
    r.status === 200 && uae?.id === "uae", `HTTP ${r.status}`);

  rec("R-02", "the country carries both languages",
    !!uae?.name && !!uae?.nameAr && /[؀-ۿ]/.test(uae.nameAr),
    `${uae?.name} / ${uae?.nameAr}`);

  const subjects = uae?.curricula?.[0]?.subjects ?? [];
  const allArabic = subjects.length === 6 && subjects.every((s) => /[؀-ۿ]/.test(s.nameAr));
  rec("R-03", "every subject carries an Arabic name",
    allArabic, subjects.map((s) => s.nameAr).join(", ") || "none");

  rec("R-04", "subjects carry their aliases, so local names resolve",
    subjects.some((s) => (s.aliases ?? []).length > 0),
    `Science aliases: ${(subjects.find((s) => s.name === "Science")?.aliases ?? []).slice(0, 3).join(", ")}`);

  const grades = uae?.grades ?? [];
  // The VALUE must stay Latin digits: it is matched against quiz_questions.grade,
  // and Arabic-Indic digits would silently stop matching.
  const valuesAscii = grades.every((g) => /^[0-9]+$/.test(g.value));
  const labelsArabic = grades.every((g) => /[؀-ۿ]/.test(g.labelAr));
  rec("R-05", "grades keep Latin values but carry Arabic labels",
    grades.length > 0 && valuesAscii && labelsArabic,
    grades.map((g) => `${g.value}=${g.labelAr}`).join(" ") || "none");

  rec("R-06", "the canonical six are listed independently of any country",
    (body.canonicalSubjects ?? []).length === 6 &&
    body.canonicalSubjects.every((s) => s.name && /[؀-ۿ]/.test(s.nameAr)),
    (body.canonicalSubjects ?? []).map((s) => s.name).join(", "));

  const unknown = await fetch(`${BASE}/api/reference?countryId=nowhere`);
  rec("R-07", "an unknown country is a 404, not an empty success",
    unknown.status === 404, `HTTP ${unknown.status}`);
}

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`school-setup + reference: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
