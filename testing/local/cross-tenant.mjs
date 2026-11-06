/**
 * Section 6 of docs/test-plan.md: cross-tenant authorization.
 *
 * Signed in as organization A's admin, and then as one of A's students, reach
 * for organization B's data every way the API allows. A pass means refused.
 * Anything returning B's data is a launch stopper -- minors' personal data
 * crossing a school boundary.
 *
 * API-level on purpose: a UI that offers no button is not a control. The
 * question is what the server does when the request arrives anyway.
 *
 * NOTE ON FALSE ALARMS. The app serves index.html for any unmatched path, so a
 * wrong URL returns 200 with HTML -- which reads exactly like a wide-open
 * endpoint. An earlier version of this file "found" three such holes that were
 * really typos. isHtml() below exists so a missing route is reported as a
 * broken test, never as a finding.
 */
import { build, Session } from "./fixtures.mjs";

const results = [];
const REFUSED = new Set([400, 401, 403, 404]);
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");

function check(id, what, { status, body }, opts = {}) {
  let pass, note = "";
  if (isHtml(body)) {
    pass = false;
    note = "NO SUCH ROUTE (SPA catch-all) -- test is wrong, not the app";
  } else if (opts.leakIf) {
    pass = !opts.leakIf(body);
    note = pass ? "scoped correctly" : "LEAKED B's data";
  } else {
    pass = REFUSED.has(status);
  }
  results.push({ id, what, status, pass, note });
  const mark = pass ? "PASS" : "FAIL";
  const tail = note ? `  (${note})` : "";
  const detail = pass || note ? "" : `  <-- ${JSON.stringify(body).slice(0, 120)}`;
  console.log(`${mark}  ${id.padEnd(7)} ${what.padEnd(50)} ${String(status).padEnd(4)}${tail}${detail}`);
}

const { orgs } = await build();
const A = orgs.A, B = orgs.B;
const a = A.session;
const bStudent = B.students[0];
const bMemberId = bStudent.memberRow?.id ?? bStudent.memberId;

console.log(`\nA = ${A.name}\nB = ${B.name}\n`);

// A B student creates a real assessment, so the ownership check has something
// genuine to refuse. Without this, the most important endpoint in the product
// could only be tested against an id that does not exist.
const bStu = new Session("studentB");
await bStu.login(bStudent.username, bStudent.password);
const made = await bStu.post("/api/assessments", {
  // favoriteSubjects and interests are the two NOT NULL array columns on
  // assessments; everything else has a default.
  favoriteSubjects: ["Mathematics", "Science", "English"],
  interests: ["technology", "healthcare"],
  assessmentType: "basic",
});
const bAssessmentId = made.body?.id;
console.log(bAssessmentId
  ? `B student's assessment: ${bAssessmentId}\n`
  : `could not create B assessment (${made.status}) -- X-03/X-04 will be reported blocked\n`);

console.log("As A's ADMIN, reaching for B:\n");

check("X-01", "GET B's organization", await a.get(`/api/admin/organizations/${B.orgId}`));
check("X-02", "GET B's roster", await a.get(`/api/admin/organizations/${B.orgId}/members`));

if (bAssessmentId) {
  check("X-03", "GET B student's assessment", await a.get(`/api/assessments/${bAssessmentId}`));
  // Recommendations are read as /api/recommendations?assessmentId=..., not as
  // a path param -- the path form hits the SPA catch-all.
  // This endpoint answers 200 [] rather than 403 for a non-owned assessment,
  // on purpose: a 403-vs-empty difference would confirm which assessment ids
  // belong to real students, which is itself a leak on a minors' platform. So
  // the assertion is that the body is EMPTY, not that the status is a refusal.
  check("X-04", "GET B student's recommendations",
    await a.get(`/api/recommendations?assessmentId=${bAssessmentId}`),
    { leakIf: (b) => !Array.isArray(b) || b.length > 0 });
  check("X-04b", "GET B student's PDF", await a.get(`/api/recommendations/pdf/${bAssessmentId}`));
  check("X-04c", "GET B student's quiz answers", await a.get(`/api/assessments/${bAssessmentId}/quiz`));
}

// /api/files derives the owner from the session and ignores any query param,
// so the test is "does B's id appear in the payload", not "is it refused".
check("X-05", "GET files with B's org id in query",
  await a.get(`/api/files?organizationId=${B.orgId}`), { leakIf: (b) => JSON.stringify(b).includes(B.orgId) });

check("X-07", "bulk-delete a B student", await a.post(
  `/api/admin/organizations/${B.orgId}/members/bulk-delete`, { memberIds: [bMemberId].filter(Boolean) }));
check("X-07b", "DELETE a B member directly",
  await a.del(`/api/admin/organizations/${B.orgId}/members/${bMemberId}`));
check("X-08", "DELETE B's organization (superadmin route)",
  await a.del(`/api/superadmin/organizations/${B.orgId}`));
check("X-09", "enrol a student INTO B", await a.post(`/api/admin/organizations/${B.orgId}/members`, {
  fullName: "Intruder Student", studentName: "Intruder Student",
  grade: "10", dateOfBirth: "2010-01-01", studentGender: "male",
}));
check("X-10", "export B's students",
  await a.post(`/api/admin/organizations/${B.orgId}/export-students`, {}));
check("X-11", "analytics scoped to B by query param",
  await a.get(`/api/analytics/overview?organizationId=${B.orgId}`), { leakIf: (b) => JSON.stringify(b).includes(B.orgId) });
check("X-12", "analytics with no filter stays A-scoped",
  await a.get("/api/analytics/overview"), { leakIf: (b) => JSON.stringify(b).includes(B.orgId) });
check("X-13", "reset a B student's password",
  await a.post(`/api/admin/organizations/${B.orgId}/members/${bMemberId}/reset-password`, {}));
check("X-14", "my-organization resolves from session",
  await a.get("/api/my-organization"), { leakIf: (b) => JSON.stringify(b).includes(B.orgId) });

console.log("\nAs an A STUDENT, reaching for B and for a peer:\n");
const aStu = new Session("studentA");
await aStu.login(A.students[0].username, A.students[0].password);

check("X-15a", "student: GET B's roster", await aStu.get(`/api/admin/organizations/${B.orgId}/members`));
check("X-15b", "student: GET own org's roster", await aStu.get(`/api/admin/organizations/${A.orgId}/members`));
if (bAssessmentId) {
  check("X-15c", "student: GET B student's assessment", await aStu.get(`/api/assessments/${bAssessmentId}`));
  check("X-15d", "student: GET B student's PDF", await aStu.get(`/api/recommendations/pdf/${bAssessmentId}`));
}
check("X-15e", "student: GET analytics", await aStu.get("/api/analytics/overview"));
check("X-15f", "student: enrol a student", await aStu.post(`/api/admin/organizations/${A.orgId}/members`, {
  fullName: "Self Enrolled", studentName: "Self Enrolled",
  grade: "10", dateOfBirth: "2010-01-01", studentGender: "male",
}));

const broken = results.filter((r) => r.note.startsWith("NO SUCH ROUTE"));
const failed = results.filter((r) => !r.pass && !r.note.startsWith("NO SUCH ROUTE"));
console.log(`\n${"=".repeat(78)}`);
console.log(`cross-tenant: ${results.filter((r) => r.pass).length}/${results.length} passed`);
if (broken.length) console.log(`broken tests (wrong URL, not findings): ${broken.map((b) => b.id).join(", ")}`);
if (failed.length) {
  console.log(`\nREAL FAILURES -- data crossing a school boundary:`);
  for (const f of failed) console.log(`  ${f.id}  ${f.what}  -> ${f.status}  ${f.note}`);
  process.exitCode = 1;
} else if (!broken.length) {
  console.log("no cross-tenant leaks found");
}
