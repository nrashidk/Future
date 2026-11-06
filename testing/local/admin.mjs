/**
 * Sections 5 and 7 of docs/test-plan.md: organization admin and superadmin.
 *
 * API-level. These two roles are defined by what they are allowed to do, so
 * the tests are mostly "does the privileged action work for the right person
 * and fail for everyone else" -- which is a server question, not a UI one.
 *
 * The superadmin email tests matter more than their size suggests: superadmin
 * status is recomputed per request from the user's email against
 * SUPERADMIN_EMAILS, so any endpoint that writes an email is a
 * privilege-escalation surface.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
function rec(id, what, pass, note = "") {
  if (pass !== null && isHtml(note)) { pass = null; note = "NO SUCH ROUTE"; }
  results.push({ id, what, pass, note });
  console.log(`${pass === null ? "BLOCK" : pass ? "PASS " : "FAIL "} ${id.padEnd(7)} ${what.padEnd(52)} ${note}`);
}

const { orgs } = await build();
const A = orgs.A, B = orgs.B;
const a = A.session;

console.log(`\n--- Section 5: organization admin (${A.name}) ---\n`);

// O-01 dashboard data.
//
// NOT via /api/admin/organizations/:id. That route is guarded by isAdmin,
// which despite its name resolves to superadmin only (email in
// SUPERADMIN_EMAILS, or role === "superadmin"), so an org admin gets 403 --
// correct, and worth recording because it means the cross-tenant X-01 pass is
// a ROLE gate, not a scoping one: that handler fetches any organization by id
// with no organizationId check whatsoever. It is safe only while isAdmin stays
// superadmin-only. An org admin reads its own school through /api/my-organization.
{
  const r = await a.get("/api/my-organization");
  rec("O-01", "admin reads own organization (via my-organization)",
    r.status === 200, isHtml(r.body) ? r.body : `HTTP ${r.status}`);
  const r2 = await a.get(`/api/admin/organizations/${A.orgId}`);
  rec("O-01b", "the superadmin-only org route refuses an org admin",
    r2.status === 403, `HTTP ${r2.status}`);
}

// O-03 the consent gate fails closed: a BRAND NEW org that has not consented
// must not be able to enrol. Uses a third org so A and B stay usable.
{
  const sa = new Session("superadmin2");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);
  const tag = Math.random().toString(36).slice(2, 7);
  const made = await sa.post("/api/superadmin/organizations/create-with-admin", {
    organizationName: `Unconsented School ${tag}`, totalLicenses: 10, isUnlimitedLicenses: false,
    countryId: "uae", curriculum: "MOE",
    adminFirstName: "NoConsent", adminLastName: "Admin",
    adminEmail: `noconsent.${tag}@futurepath.test`, adminPhone: "+971500000000",
    adminUsername: `noconsent${tag}`,
  });
  const orgId = made.body?.organization?.id ?? made.body?.id;
  const creds = made.body?.admin?.credentials;
  if (!orgId || !creds) {
    rec("O-03", "enrolment blocked before consent", null, `could not create org (${made.status})`);
  } else {
    const s = new Session("noconsent");
    await s.login(creds.username, creds.password);
    const r = await s.post(`/api/admin/organizations/${orgId}/members`, {
      fullName: "Too Early", studentName: "Too Early", grade: "10",
      dateOfBirth: "2010-01-01", studentGender: "male",
    });
    rec("O-03", "enrolment blocked before consent is given",
      r.status >= 400, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
  }
}

// O-04 single enrolment (already exercised by fixtures, asserted here)
rec("O-04", "admin enrolled students during setup", A.students.length === 2, `${A.students.length} students`);

// O-07 a student without a date of birth must be refused: DOB is NOT NULL for
// students, and it is the field that establishes they are a minor.
{
  const r = await a.post(`/api/admin/organizations/${A.orgId}/members`, {
    fullName: "No DOB", studentName: "No DOB", grade: "10", studentGender: "male",
  });
  rec("O-07", "student without date of birth is refused", r.status >= 400,
    `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

// O-06 bulk import with one good row and one bad: good rows must survive.
{
  const r = await a.post(`/api/admin/organizations/${A.orgId}/members/bulk`, {
    members: [
      { fullName: "Bulk Good", studentName: "Bulk Good", grade: "11", dateOfBirth: "2009-03-03", studentGender: "female" },
      { fullName: "Bulk Bad", studentName: "Bulk Bad", grade: "11", studentGender: "male" },
    ],
  });
  const body = JSON.stringify(r.body);
  const partial = /created|success/i.test(body) && /error|failed|skipped/i.test(body);
  rec("O-06", "bulk import reports per-row outcome, keeps good rows",
    r.status < 500 && partial, `HTTP ${r.status} ${body.slice(0, 110)}`);
}

// O-08 / O-10 exports are scoped to the caller's own organization
{
  const r = await a.get(`/api/admin/organizations/${A.orgId}/export/csv`);
  const text = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  rec("O-08", "export of own org succeeds and excludes other schools",
    r.status === 200 && !text.includes(B.name), `HTTP ${r.status}, ${text.length} bytes`);
}

// O-13 analytics scoped to own org
{
  const r = await a.get("/api/analytics/overview");
  rec("O-13", "admin reads analytics for own school", r.status === 200,
    isHtml(r.body) ? r.body : `HTTP ${r.status}`);
}

// O-16 org admin cannot act as superadmin
{
  const r = await a.get("/api/superadmin/organizations");
  rec("O-16", "org admin cannot reach superadmin", r.status >= 400, `HTTP ${r.status}`);
}

console.log(`\n--- Section 7: superadmin ---\n`);

const sa = new Session("superadmin");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

// A-03 every superadmin surface loads
for (const [path, name] of [
  ["/api/superadmin/metrics", "metrics"],
  ["/api/superadmin/organizations", "organizations"],
  ["/api/superadmin/llm-prompts", "LLM prompts"],
  ["/api/superadmin/translations/coverage", "translation coverage"],
]) {
  const r = await sa.get(path);
  rec(`A-03:${name}`, `superadmin reads ${name}`, r.status === 200,
    isHtml(r.body) ? r.body : `HTTP ${r.status}`);
}

// A-13 the customer's OpenAI key must never reach the client.
{
  const r = await sa.get("/api/superadmin/llm-prompts");
  const body = JSON.stringify(r.body);
  const leaks = /sk-[A-Za-z0-9]{8,}|apiKey"\s*:\s*"[^"]{8,}|encryptedKey/i.test(body);
  rec("A-13", "no API key material in the prompt-template payload", !leaks,
    leaks ? "KEY-LIKE STRING PRESENT" : `${body.length} bytes, clean`);
}

// A-07..A-10 the email-change escalation guards.
const target = A.students[0].userId;
{
  const r = await sa.patch(`/api/superadmin/users/${target}/email`, { email: `moved.${Date.now()}@futurepath.test` });
  rec("A-07", "superadmin can change an ordinary user's email", r.status === 200,
    isHtml(r.body) ? r.body : `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}
{
  // The escalation attempt: give an ordinary user a reserved address, which
  // would make them superadmin on the next request.
  const r = await sa.patch(`/api/superadmin/users/${target}/email`, { email: "super@futurepath.test" });
  rec("A-08", "cannot move a reserved (superadmin) address onto a user",
    r.status === 403, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
}
{
  const r = await sa.patch(`/api/superadmin/users/${target}/email`, { email: "SUPER@FUTUREPATH.TEST" });
  rec("A-08b", "the reserved-address check is case-insensitive",
    r.status === 403, `HTTP ${r.status}`);
}
{
  // Must be an address that genuinely exists. The first attempt used a
  // constructed one that did not, so the 200 meant "accepted a free address",
  // not "allowed a duplicate".
  const who = await a.get("/api/auth/user");
  const existing = who.body?.email;
  if (!existing) {
    rec("A-10", "duplicate address is refused", null, "could not read an existing email to collide with");
  } else {
    const r = await sa.patch(`/api/superadmin/users/${target}/email`, { email: existing });
    rec("A-10", `duplicate address is refused (${existing})`,
      [400, 409].includes(r.status), `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }
}

// A-12 translation overrides are known not to persist
{
  // The field is lang, not locale: with the wrong name the request fails
  // validation at 400 and never reaches the 501 this test is about.
  const r = await sa.patch("/api/superadmin/translations/common", { lang: "en", key: "x", value: "y" });
  rec("A-12", "translation override returns the documented 501",
    r.status === 501, `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
}

const pass = results.filter((r) => r.pass === true).length;
const fail = results.filter((r) => r.pass === false);
const skip = results.filter((r) => r.pass === null);
console.log(`\n${"=".repeat(78)}`);
console.log(`admin: ${pass} passed, ${fail.length} failed, ${skip.length} blocked`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}  ${f.note}`);
if (fail.length) process.exitCode = 1;
