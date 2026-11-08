/**
 * SCHOOL-OWNED FIELDS — the school states them, the student does not.
 *
 * A school admin enrols a student and records their name, grade, gender and
 * date of birth; the school itself carries the country and curriculum. Those
 * six select the quiz bank and scope the career catalogue, so a student who
 * edits them detaches their own report from the school that paid for it.
 *
 * server/routes/assessment.routes.ts overrides all six on both POST and PATCH.
 * assessment.school-owned-fields.test.ts covers the resolution rule as a pure
 * function. NOTHING COVERED IT THROUGH A REAL ROUTE WITH A REAL SESSION, which
 * is the only thing that proves the function is actually reached — a correct
 * rule wired to nothing passes every unit test it has.
 *
 * WHAT EACH CASE MEASURES, and why it is not obvious:
 *
 *   K-00  the routes are real. The SPA catch-all answers 200 with HTML for any
 *         unmatched URL, so a misspelled path would otherwise "pass" below.
 *   K-01  POST carrying six foreign values stores the SCHOOL's six
 *   K-02  PATCH carrying a foreign countryId stores the school's country
 *   K-03  ...a different grade stores the school's grade
 *   K-04  ...a different name and gender store the school's
 *   K-05  ...curriculum stores the school's. This is the trap: curriculum was
 *         safe only because it was LEFT OFF the PATCH allowlist, which is an
 *         accident, not a lock. A future hand adding 'curriculum' to that array
 *         must not re-open it, and this is the case that says so.
 *   K-06  age is re-derived to the SAME number, not whatever was sent. The
 *         overwrite is anchored to the assessment's creation date, so it can
 *         only ever reproduce what POST stored — an age that moved between two
 *         autosaves would change a figure already printed in a parent's PDF.
 *   K-07  the student's OWN fields still persist. Without this, a handler that
 *         discarded every PATCH would pass K-02 through K-06.
 *   K-08  a taker with NO school is NOT locked. One branch is not the
 *         behaviour: a lock that applied to everybody would pass all of the
 *         above while breaking every self-paying parent.
 *
 * Expected values are READ FROM THE DATABASE, never hardcoded. The school's
 * grade is canonicalized on enrolment, so asserting a literal "10" here would
 * pin this suite to today's canonical form rather than to the school's record.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

/** One connection per query: PGlite allows a single one, and holding it open
 *  across the HTTP calls below starves the application. */
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
const student = A.students[0];

// THE SCHOOL'S RECORD, straight from the rows the admin wrote.
const [member] = await sql(
  `SELECT student_name, grade, student_gender, date_of_birth FROM organization_members WHERE user_id = $1`,
  [student.userId],
);
const [org] = await sql(`SELECT country_id, curriculum FROM organizations WHERE id = $1`, [A.orgId]);
if (!member) throw new Error("fixture: no organization_members row for the student");
if (!org?.country_id || !org?.curriculum) throw new Error("fixture: org A missing country or curriculum");

console.log(
  `school record -> name=${member.student_name} grade=${member.grade} gender=${member.student_gender} ` +
  `dob=${member.date_of_birth} country=${org.country_id} curriculum=${org.curriculum}\n`,
);

/**
 * A SECOND COUNTRY HAS TO EXIST FOR THIS TEST TO MEAN ANYTHING.
 *
 * The seed ships one country. POST /api/assessments validates countryId
 * against the catalogue and 400s on an unknown id BEFORE the school override
 * runs, so passing a made-up country proves nothing about the lock — it only
 * proves the validator works. A real, switchable second country is the only
 * thing the lock can be seen to refuse.
 *
 * Cloned from the existing row through a temp table so it stays valid as the
 * countries schema changes, in ONE call because each sql() call is its own
 * connection and a temp table would not survive between them.
 *
 * DELETED AGAIN in the finally block below. pricing.mjs and
 * migration-033-dryrun.mjs both left invented countries behind once, and
 * school-setup's catalogue count then reported 247 of 250 and failed — a true
 * statement about another suite's mess that reads exactly like a catalogue bug.
 */
const LOCK_SUFFIX = Math.random().toString(36).slice(2, 6);
const FOREIGN_COUNTRY_ID = `zzlock${LOCK_SUFFIX}`;
// countries.code is varchar(3) AND unique, so it cannot carry the long id.
const FOREIGN_COUNTRY_CODE = `Z${LOCK_SUFFIX.slice(0, 2).toUpperCase()}`;
await sql(`
  CREATE TEMPORARY TABLE school_lock_src AS SELECT * FROM countries WHERE id = '${org.country_id}';
  UPDATE school_lock_src SET
    id = '${FOREIGN_COUNTRY_ID}',
    name = 'Lockland Test Republic',
    code = '${FOREIGN_COUNTRY_CODE}',
    curricula = ARRAY['Lockland National'],
    license_price_minor = NULL,
    license_currency = NULL;
  INSERT INTO countries SELECT * FROM school_lock_src;
  DROP TABLE school_lock_src;
`);

/** Deliberately wrong values, none of which the school holds. */
const FOREIGN = {
  name: "Impostor Name",
  grade: member.grade === "grade12" ? "grade9" : "grade12",
  gender: member.student_gender === "male" ? "female" : "male",
  countryId: FOREIGN_COUNTRY_ID,
  curriculum: "Lockland National",
};

try {

const s = new Session("schoolLockStudent");
await s.login(student.username, student.password);

/** The persisted row, read from the database rather than from the response:
 *  a handler could echo the request back without ever writing it. */
const persisted = async (id) =>
  (await sql(
    `SELECT name, age, grade, gender, country_id, curriculum, career_aspirations FROM assessments WHERE id = $1`,
    [id],
  ))[0];

// ------------------------------------------------------------------ K-01 + K-00
const created = await s.post("/api/assessments", {
  favoriteSubjects: ["Mathematics", "Science", "English"],
  interests: ["technology"],
  assessmentType: "basic",
  name: FOREIGN.name,
  grade: FOREIGN.grade,
  gender: FOREIGN.gender,
  countryId: FOREIGN.countryId,
  curriculum: FOREIGN.curriculum,
});

{
  const isJson = created.body && typeof created.body === "object" && typeof created.body.id === "string";
  const bogus = await s.post("/api/assessmentsX", { assessmentType: "basic" });
  const bogusDiffers = !(bogus.body && typeof bogus.body === "object" && typeof bogus.body.id === "string");
  rec("K-00", "routes are real; misspelled sibling does not answer like them", isJson && bogusDiffers,
    `real=${created.status}/${typeof created.body} bogus=${bogus.status}/${typeof bogus.body === "string" ? "html" : "json"}`);
}

const id = created.body?.id;
if (!id) {
  rec("K-01", "POST stores the school's six, not the six that were sent", false,
    `no id: ${created.status} ${JSON.stringify(created.body).slice(0, 160)}`);
} else {
  const row = await persisted(id);
  const ok =
    row.name === member.student_name &&
    row.grade === member.grade &&
    row.gender === member.student_gender &&
    row.country_id === org.country_id &&
    row.curriculum === org.curriculum;
  rec("K-01", "POST stores the school's six, not the six that were sent", ok,
    `name=${row.name} grade=${row.grade} gender=${row.gender} country=${row.country_id} curr=${row.curriculum}`);
}

const ageAfterPost = id ? (await persisted(id)).age : null;

// ------------------------------------------------------------------ K-02..K-06
if (id) {
  const patchAndRead = async (body) => {
    const r = await s.patch(`/api/assessments/${id}`, body);
    return { status: r.status, body: r.body, row: await persisted(id) };
  };

  {
    const { status, row } = await patchAndRead({ countryId: FOREIGN.countryId });
    rec("K-02", "PATCH foreign countryId -> school's country persists",
      row.country_id === org.country_id, `HTTP ${status}, stored=${row.country_id}`);
  }
  {
    const { status, row } = await patchAndRead({ grade: FOREIGN.grade });
    rec("K-03", "PATCH different grade -> school's grade persists",
      row.grade === member.grade, `HTTP ${status}, stored=${row.grade}`);
  }
  {
    const { status, row } = await patchAndRead({ name: FOREIGN.name, gender: FOREIGN.gender });
    rec("K-04", "PATCH different name+gender -> school's persist",
      row.name === member.student_name && row.gender === member.student_gender,
      `HTTP ${status}, stored=${row.name}/${row.gender}`);
  }
  {
    // The allowlist omits 'curriculum'; that is an accident, not the lock. The
    // lock is the override, and it must hold whether or not the field arrives.
    const { status, row } = await patchAndRead({ curriculum: FOREIGN.curriculum });
    rec("K-05", "PATCH curriculum -> school's curriculum persists (not the allowlist's doing)",
      row.curriculum === org.curriculum, `HTTP ${status}, stored=${row.curriculum}`);
  }
  {
    const { status, row } = await patchAndRead({ age: 99 });
    rec("K-06", "PATCH age 99 -> re-derived to the same snapshot POST stored",
      row.age === ageAfterPost && row.age !== 99, `HTTP ${status}, stored=${row.age}, afterPost=${ageAfterPost}`);
  }
  {
    // text[] on the column, string[] on the client — not a bare string.
    const mine = `Astronaut ${Math.random().toString(36).slice(2, 6)}`;
    const { status, row } = await patchAndRead({ careerAspirations: [mine] });
    const stored = typeof row.career_aspirations === "string"
      ? row.career_aspirations
      : JSON.stringify(row.career_aspirations ?? "");
    rec("K-07", "the student's OWN field still persists (not a discard-everything handler)",
      stored.includes(mine), `HTTP ${status}, stored=${stored.slice(0, 60)}`);
  }
} else {
  for (const k of ["K-02", "K-03", "K-04", "K-05", "K-06", "K-07"]) {
    rec(k, "skipped — no assessment was created", false);
  }
}

// ------------------------------------------------------------------ K-08
{
  /**
   * A taker with NO member row. The superadmin account has none, so the lock
   * must not touch it — otherwise the override would apply to every self-paying
   * parent and guest as well, and K-02..K-06 would pass while the product broke
   * for everyone outside a school.
   */
  const sa = new Session("schoolLockNoSchool");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);
  const r = await sa.post("/api/assessments", {
    favoriteSubjects: ["Mathematics", "Science", "English"],
    interests: ["technology"],
    assessmentType: "basic",
    name: "Self Payer",
    grade: "11",
    gender: "female",
    countryId: org.country_id,
    curriculum: org.curriculum,
  });
  const freeId = r.body?.id;
  if (!freeId) {
    rec("K-08", "a taker with no school is NOT locked", false,
      `no id: ${r.status} ${JSON.stringify(r.body).slice(0, 140)}`);
  } else {
    const chosen = "Grade Twelve Self Chosen";
    await sa.patch(`/api/assessments/${freeId}`, { name: chosen, grade: "12" });
    const row = await persisted(freeId);
    rec("K-08", "a taker with no school is NOT locked", row.name === chosen && row.grade === "12",
      `stored=${row.name}/${row.grade}`);
    await sql(`DELETE FROM assessments WHERE id = $1`, [freeId]);
  }
}

} finally {
  // The invented country goes, whatever happened above. Any assessment still
  // pointing at it goes first, or the delete fails on a foreign key and the
  // country survives to break the next suite's catalogue count.
  await sql(`DELETE FROM assessments WHERE country_id = $1`, [FOREIGN_COUNTRY_ID]);
  await sql(`DELETE FROM countries WHERE id = $1`, [FOREIGN_COUNTRY_ID]);
  const [{ count }] = await sql(`SELECT COUNT(*)::int AS count FROM countries WHERE id = $1`, [FOREIGN_COUNTRY_ID]);
  console.log(`\ncleanup: invented country ${FOREIGN_COUNTRY_ID} remaining rows = ${count}`);
  if (count !== 0) console.log("WARNING: invented country survived — the next suite's catalogue count will be wrong");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
