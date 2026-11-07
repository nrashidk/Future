/**
 * THE ORG-ADMIN SURFACE NOTHING ELSE TOUCHES.
 *
 * Five endpoints behind the school-admin guard had zero references in any
 * suite. Four of them act on minors' records:
 *
 *   POST   .../members/bulk-reset-passwords   resets student passwords
 *   POST   .../import-students                bulk-creates student records
 *   POST   .../export-assessments             exports assessment data
 *   GET    .../export/reports                 exports reports
 *   POST   .../logo                           file upload
 *
 * The single-member reset-password IS covered by cross-tenant.mjs; its BULK
 * sibling was not. That is the "a control applied to one verb and not its
 * siblings" family exactly, and it is the reason this file leads with it: a
 * cross-tenant bulk password reset is account takeover of other schools'
 * children, which is the worst thing this codebase could do.
 *
 * WHY STATUS CODES PROVE NOTHING HERE. bulk-reset-passwords answers 200 with
 * `success: true` even when EVERY member in the batch was refused — the
 * refusals are per item, inside `results`. A test asserting 200, or asserting
 * `success`, passes identically whether the guard works or is absent.
 *
 * So every destructive case below is judged by EFFECT, not by response:
 * whether the victim's password still logs in afterwards. A password that
 * still works is proof the reset did not happen; a response field is not.
 */
import { build, Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(58)} ${note}`);
};

// The SPA serves index.html for any unmatched path, so a typo in a route
// reads as a wide-open endpoint. A missing route is a broken test, never a
// finding.
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");

/** Can this student still log in with this password? The only real evidence. */
async function canLogIn(username, password) {
  const s = new Session(`probe-${username}`);
  try {
    await s.login(username, password);
    const me = await s.get("/api/auth/user");
    return me.status === 200;
  } catch {
    return false;
  }
}

const { orgs } = await build();
const A = orgs.A;
const B = orgs.B;
const aVictim = A.students[0];
const bVictim = B.students[0];

console.log(`\nA = ${A.name} (${A.orgId})`);
console.log(`B = ${B.name} (${B.orgId})`);
console.log(`B's student under test: ${bVictim.username}\n`);

// ---------------------------------------------------------------- baseline
{
  // Without this, every "still logs in" assertion below could be passing
  // because the student never could log in.
  const ok = await canLogIn(bVictim.username, bVictim.password);
  rec("O-00", "B's student can log in to start with",
    ok, ok ? `${bVictim.username} authenticates` : "BASELINE BROKEN — later cases prove nothing");
}

// ------------------- O-01  A cannot bulk-reset B's students' passwords
{
  const r = await A.session.post(
    `/api/admin/organizations/${B.orgId}/members/bulk-reset-passwords`,
    { memberIds: [bVictim.memberId] });

  // The route is scoped by the :id in the path, so A reaching into B's
  // organization must be refused outright at the guard.
  rec("O-01", "A is refused B's organization id outright",
    !isHtml(r.body) && [401, 403, 404].includes(r.status),
    isHtml(r.body) ? "NO SUCH ROUTE — test is wrong" : `HTTP ${r.status} ${r.body?.message ?? ""}`);

  // And the password is still the one B's student was given.
  const still = await canLogIn(bVictim.username, bVictim.password);
  rec("O-01b", "and B's student's password is untouched",
    still, still ? "original password still authenticates" : "PASSWORD WAS CHANGED — account takeover");
}

// --------- O-02  nor by passing B's member ids to A's OWN organization
{
  /**
   * THE INTERESTING ATTACK, and the one the route's inner check exists for.
   * The path names A's own organization — so the guard at the top passes —
   * and the body smuggles a member belonging to B. Only the per-member
   * `member.organizationId !== req.params.id` check stops this.
   */
  const r = await A.session.post(
    `/api/admin/organizations/${A.orgId}/members/bulk-reset-passwords`,
    { memberIds: [bVictim.memberId] });

  const item = (r.body?.results ?? [])[0];
  // 200 with success:true is what this returns even when everything failed,
  // so the per-item result is what gets asserted.
  rec("O-02", "a foreign member smuggled into A's own batch is refused",
    r.status === 200 && item?.success === false && !item?.newPassword,
    `HTTP ${r.status}, item success=${item?.success}, error="${item?.error ?? "none"}", ` +
    `password handed back: ${!!item?.newPassword}`);

  const still = await canLogIn(bVictim.username, bVictim.password);
  rec("O-02b", "and B's student's password is still untouched",
    still, still ? "original password still authenticates" : "PASSWORD WAS CHANGED — account takeover");
}

// ------------- O-03  a MIXED batch resets only the caller's own members
{
  /**
   * Partial batches are where this kind of guard usually leaks: the refusal
   * is per item, so a batch of one own and one foreign member must do exactly
   * half its work. A guard that gave up on the whole batch would be safe but
   * would also be a different bug.
   */
  const r = await A.session.post(
    `/api/admin/organizations/${A.orgId}/members/bulk-reset-passwords`,
    { memberIds: [aVictim.memberId, bVictim.memberId] });

  const byId = Object.fromEntries((r.body?.results ?? []).map((x) => [x.userId, x]));
  const mine = byId[aVictim.memberId];
  const theirs = byId[bVictim.memberId];

  rec("O-03", "a mixed batch succeeds for its own and fails for the other",
    mine?.success === true && !!mine?.newPassword && theirs?.success === false,
    `own: ${mine?.success} | foreign: ${theirs?.success} (${theirs?.error ?? "no error given"})`);

  // The reset that SHOULD have happened really did: old password dead, new
  // one live. Without this the suite would pass for a route that resets
  // nothing at all.
  if (mine?.newPassword) {
    const oldWorks = await canLogIn(aVictim.username, aVictim.password);
    const newWorks = await canLogIn(aVictim.username, mine.newPassword);
    rec("O-03b", "the legitimate reset actually changed the password",
      !oldWorks && newWorks,
      `old password works: ${oldWorks} (want false), new password works: ${newWorks} (want true)`);
    aVictim.password = mine.newPassword;
  } else {
    rec("O-03b", "the legitimate reset actually changed the password",
      false, "no new password returned — nothing to verify");
  }

  const still = await canLogIn(bVictim.username, bVictim.password);
  rec("O-03c", "B's student is STILL untouched after the mixed batch",
    still, still ? "original password still authenticates" : "PASSWORD WAS CHANGED — account takeover");
}

// ------------------------------- O-04  the batch cap is a real limit
{
  const r = await A.session.post(
    `/api/admin/organizations/${A.orgId}/members/bulk-reset-passwords`,
    { memberIds: Array.from({ length: 101 }, (_, i) => `fake-${i}`) });
  rec("O-04", "a batch over the cap is refused before doing any work",
    r.status === 400 && !r.body?.results,
    `HTTP ${r.status} ${r.body?.message ?? ""}`);
}

// ------------------ O-05  exports of minors' data are org-scoped
{
  // Assessment and report exports carry students' names, grades and career
  // profiles. A cross-tenant read here is a PDPL data-exposure incident, not
  // a permissions nicety.
  const probes = [
    ["O-05", "A cannot export B's assessments",
      () => A.session.post(`/api/admin/organizations/${B.orgId}/export-assessments`, {})],
    ["O-06", "A cannot export B's reports",
      () => A.session.get(`/api/admin/organizations/${B.orgId}/export/reports`)],
    ["O-07", "A cannot export B's students",
      () => A.session.post(`/api/admin/organizations/${B.orgId}/export-students`, {})],
  ];
  for (const [id, what, run] of probes) {
    const r = await run();
    const bodyText = typeof r.body === "string" ? r.body : JSON.stringify(r.body ?? "");
    // Refused by status, AND nothing of B's in whatever came back. Some
    // endpoints answer 200 with an empty set by design, which is not a leak —
    // what matters is that no student of B's appears.
    const leaked = B.students.some((s) => s.username && bodyText.includes(s.username));
    rec(id, what,
      !isHtml(r.body) && ([401, 403, 404].includes(r.status) || !leaked) && !leaked,
      isHtml(r.body) ? "NO SUCH ROUTE — test is wrong"
        : `HTTP ${r.status}, B's students present in response: ${leaked}`);
  }
}

// ------------------------- O-08  import cannot write into another school
{
  const marker = `Imported ${Math.random().toString(36).slice(2, 7)}`;
  const r = await A.session.post(`/api/admin/organizations/${B.orgId}/import-students`, {
    students: [{ fullName: marker, studentName: marker, grade: "10", dateOfBirth: "2010-01-01" }],
  });

  rec("O-08", "A is refused importing students into B",
    !isHtml(r.body) && [400, 401, 403, 404].includes(r.status),
    isHtml(r.body) ? "NO SUCH ROUTE — test is wrong" : `HTTP ${r.status} ${r.body?.message ?? ""}`);

  // The status is not the evidence; the absence of the row is. A 403 that
  // still wrote the student would be worse than no guard, because it looks safe.
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  let n = 0;
  try {
    // student_name lives on organization_members, not users.
    n = Number((await c.query(
      `SELECT count(*)::int n FROM organization_members WHERE student_name = $1`, [marker])).rows[0].n);
  } finally { await c.end(); }
  rec("O-08b", "and no student row was created anywhere",
    n === 0, `${n} row(s) found for "${marker}"`);
}

// ------------------------------ O-09  the logo upload is org-scoped
{
  const r = await A.session.post(`/api/admin/organizations/${B.orgId}/logo`, {});
  // A 400 here is a legitimate refusal too — no multipart body — but it must
  // not be a 200 that accepted something for another school.
  rec("O-09", "A cannot post a logo to B's organization",
    !isHtml(r.body) && r.status !== 200,
    isHtml(r.body) ? "NO SUCH ROUTE — test is wrong" : `HTTP ${r.status} ${r.body?.message ?? ""}`);
}

// ----------------- O-10  a student cannot reach any of it at all
{
  const stu = new Session("aStudent");
  await stu.login(A.students[1].username, A.students[1].password);
  const probes = [
    ["bulk reset", () => stu.post(`/api/admin/organizations/${A.orgId}/members/bulk-reset-passwords`, { memberIds: [aVictim.memberId] })],
    ["export assessments", () => stu.post(`/api/admin/organizations/${A.orgId}/export-assessments`, {})],
    ["import students", () => stu.post(`/api/admin/organizations/${A.orgId}/import-students`, { students: [] })],
  ];
  const outcomes = [];
  for (const [label, run] of probes) {
    const r = await run();
    outcomes.push(`${label}: ${isHtml(r.body) ? "HTML" : r.status}`);
  }
  const allRefused = outcomes.every((o) => /: (401|403|404)$/.test(o));
  rec("O-10", "a student of A reaches none of A's own admin routes",
    allRefused, outcomes.join(" | "));

  // The worst case for this one: a student resetting their classmates'
  // passwords. Checked by effect, like everything else here.
  const stillA = await canLogIn(aVictim.username, aVictim.password);
  rec("O-10b", "and no classmate's password was changed",
    stillA, stillA ? "classmate's password still authenticates" : "A STUDENT RESET A CLASSMATE'S PASSWORD");
}

const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(78)}`);
console.log(`org-admin: ${pass} passed, ${fail.length} failed`);
for (const f of fail) console.log(`  FAIL ${f.id}  ${f.what}`);
if (fail.length) process.exitCode = 1;
