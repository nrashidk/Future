/**
 * A GUEST'S NAME, AGE AND GENDER ARE NEVER STORED.
 *
 * An anonymous visitor with no account used to be required to enter all three
 * before they could continue, so a thirteen-year-old could type their real
 * name and age into a public web form, with nobody's permission, and it was
 * written to the database. The Terms said the opposite — that a parent,
 * guardian or school consents before any assessment — and on this path none
 * of the three does. What existed was a tick confirming the STUDENT agrees to
 * the Terms, which is a terms acceptance and not a guardian's consent.
 *
 * THE FORM NO LONGER ASKS. That is UX, and UX is not a control: a crafted POST
 * would still store whatever it liked. So the cases below SEND the fields
 * anyway and judge the stored ROW, never the response — which is why this
 * suite exists rather than a screenshot of the step.
 *
 * GI-03 is the case that matters. GI-06 is its control: an authenticated
 * student must KEEP their details, because a school holds them with a consent
 * attestation behind them, and a change that wiped those would be a different
 * bug wearing this one's clothes.
 */
import { build, Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
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
  try {
    return (await c.query(text, params)).rows;
  } finally {
    await c.end();
  }
}

const tag = Math.random().toString(36).slice(2, 7);
const IDENTITY = { name: `Crafted Guest ${tag}`, age: 14, gender: "female" };

/**
 * A GUEST STILL NEEDS A CSRF TOKEN, and getting this wrong answers every case
 * with 403 before the route is reached — the first draft of this suite did
 * exactly that and reported 0/7 against working code.
 *
 * `validateCsrf` runs before authentication, and a never-used session has no
 * `csrf_token` cookie, so the first state-changing request is refused
 * CSRF_MISSING. A GET first mints one. Cookies are accumulated by hand because
 * `fetch` has no jar, and the guest flow depends on `guest_token` surviving
 * from the POST to the PATCH — dropping it would make GI-04 assert against the
 * ownership guard rather than against the withholding.
 */
class GuestJar {
  constructor() { this.cookies = new Map(); }
  absorb(res) {
    for (const raw of (res.headers.getSetCookie?.() ?? [])) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      if (i > 0) this.cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
  get header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
  get csrf() { return decodeURIComponent(this.cookies.get("csrf_token") ?? ""); }
  async prime() {
    this.absorb(await fetch(`${BASE}/api/auth/user`, { headers: { Cookie: this.header } }));
    return this;
  }
  async send(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: this.header,
        "X-CSRF-Token": this.csrf,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    this.absorb(res);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
}

const BASE_PAYLOAD = {
  grade: "10", countryId: "uae", curriculum: "MOE National",
  favoriteSubjects: ["Mathematics", "Science", "English"],
  interests: ["technology"],
};

/** A guest POST, carrying whatever the caller wants it to carry. */
async function guestCreate(extra = {}) {
  const jar = await new GuestJar().prime();
  const r = await jar.send("POST", "/api/assessments", { ...BASE_PAYLOAD, ...extra });
  return { status: r.status, body: r.body, jar };
}

const rowOf = async (id) =>
  (await sql(`SELECT name, age, gender, grade, user_id FROM assessments WHERE id = $1`, [id]))[0] ?? null;

const made = [];
const { orgs } = await build();

try {
  // -------------------------------------------------------------------- GI-00
  // Without this, every case below could "pass" against a route that refuses
  // guests outright — the 403 the first draft of this suite actually got.
  {
    const r = await guestCreate();
    if (r.body?.id) made.push(r.body.id);
    rec("GI-00", "a guest can still create an assessment at all",
      (r.status === 201 || r.status === 200) && !!r.body?.id,
      `HTTP ${r.status} id=${r.body?.id ? "yes" : "NONE"}`);
  }

  // -------------------------------------------------------------------- GI-01
  {
    const r = await guestCreate();
    if (r.body?.id) made.push(r.body.id);
    const row = await rowOf(r.body?.id);
    rec("GI-01", "a plain guest assessment stores no name, age or gender",
      !!row && row.name === null && row.age === null && row.gender === null,
      `name=${row?.name} age=${row?.age} gender=${row?.gender}`);
  }

  // -------------------------------------------------------------------- GI-02
  // Grade is NOT dropped with the rest: it selects the question pool, so a
  // change that took it would break the quiz with no error at this end.
  {
    const r = await guestCreate();
    if (r.body?.id) made.push(r.body.id);
    const row = await rowOf(r.body?.id);
    rec("GI-02", "GRADE survives — the quiz pool is selected by it",
      row?.grade === "10", `grade=${row?.grade}`);
  }

  // -------------------------------------------------------------------- GI-03
  // THE CASE THAT MATTERS. The form not showing three inputs is UX; this is
  // the control. A request that sends them is ACCEPTED and the values
  // discarded, rather than refused — refusing would break any client still
  // sending the old payload, and the goal is that the data is not stored, not
  // that the caller is punished.
  {
    const r = await guestCreate(IDENTITY);
    if (r.body?.id) made.push(r.body.id);
    const row = await rowOf(r.body?.id);
    rec("GI-03", "a CRAFTED POST sending all three stores none of them",
      !!row && row.name === null && row.age === null && row.gender === null,
      `sent name/${IDENTITY.age}/${IDENTITY.gender} → stored ${row?.name}/${row?.age}/${row?.gender}`);
  }

  // -------------------------------------------------------------------- GI-04
  // A PATCH is the second door into the same columns, and "a control applied
  // to one verb and not its sibling" is a family this repo keeps producing.
  {
    const created = await guestCreate();
    const id = created.body?.id;
    if (id) made.push(id);
    const res = await created.jar.send("PATCH", `/api/assessments/${id}`, IDENTITY);
    const row = await rowOf(id);
    rec("GI-04", "a crafted PATCH cannot write them either",
      res.status === 200 && !!row && row.name === null && row.age === null && row.gender === null,
      `HTTP ${res.status} stored ${row?.name}/${row?.age}/${row?.gender}`);
  }

  // -------------------------------------------------------------------- GI-05
  // NULLED, NOT MERELY OMITTED. A dropped key on a PATCH means "leave the
  // column alone", so a value written before this change must be actively
  // CLEARED by the next write rather than preserved because nobody mentioned
  // it. This is the difference between `delete payload.name` and `= null`.
  {
    const created = await guestCreate();
    const id = created.body?.id;
    if (id) made.push(id);
    // Planted directly, standing in for a row that predates the change.
    await sql(`UPDATE assessments SET name = $2, age = 13, gender = 'male' WHERE id = $1`,
      [id, `Legacy ${tag}`]);
    const before = await rowOf(id);
    const res = await created.jar.send("PATCH", `/api/assessments/${id}`,
      { name: "anything", age: 99, gender: "other" });
    const after = await rowOf(id);
    rec("GI-05", "a pre-existing value is CLEARED by the next write, not kept",
      before?.name !== null && after?.name === null && after?.age === null && after?.gender === null,
      `HTTP ${res.status} "${before?.name}"/${before?.age} → ${after?.name}/${after?.age}`);
  }

  // -------------------------------------------------------------------- GI-06
  // THE CONTROL. Without it every case above would pass against code that
  // wiped these columns for everybody.
  //
  // An org student's name, age and gender come from the member record the
  // school created, behind a guardian-consent attestation the school signed.
  // The server OVERRIDES the payload with those values for an org student, so
  // this case sends the crafted identity too: the right answer is not "the
  // crafted values were stored" but "the SCHOOL's were", which is a stronger
  // assertion than merely non-null.
  {
    const student = orgs.A.students?.[0];
    if (!student?.username) {
      rec("GI-06", "an AUTHENTICATED student keeps the SCHOOL's details", false,
        "no org student in the fixture — the control could not run");
    } else {
      const s = new Session(`gi-stu-${tag}`);
      await s.login(student.username, student.password);
      const res = await s.post("/api/assessments", { ...BASE_PAYLOAD, ...IDENTITY });
      if (res.body?.id) made.push(res.body.id);
      const row = await rowOf(res.body?.id);
      const kept = !!row && row.user_id !== null
        && row.name !== null && row.age !== null && row.gender !== null;
      const schoolsOwn = !!row && row.name !== IDENTITY.name;
      rec("GI-06", "an AUTHENTICATED student keeps the SCHOOL's details",
        kept && schoolsOwn,
        `HTTP ${res.status} stored ${row?.name}/${row?.age}/${row?.gender} crafted-ignored=${schoolsOwn}`);
    }
  }
} finally {
  for (const id of made) {
    try { await sql(`DELETE FROM assessments WHERE id = $1`, [id]); } catch {}
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
