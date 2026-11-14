/**
 * The superadmin and school analytics page: the sector pipeline and the
 * nationwide totals. ("Talent Pipeline by Priority Sector":)
 * Until 2026-11-14 the query grouped by a json column and failed on EVERY call
 * (500), which the page rendered as "No sector data available yet".
 *   A-01  superadmin, all countries: 200 and an array
 *   A-02  superadmin, UAE: 200, one row per UAE priority sector, skills an array
 *   A-03  a student is still refused (control that the route is not opened up)
 *   A-04  the superadmin's nationwide overview counts the same students as the
 *         dashboard, and its completion figure is not 100% by construction
 */
import { Session, SUPERADMIN, build } from "./fixtures.mjs";
const results = [];
const rec = (id, what, pass, note = "") => { results.push(pass); console.log(`${pass ? "PASS " : "FAIL "} ${id}  ${what.padEnd(58)} ${note}`); };
const sa = new Session("sa"); await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const a = await sa.get("/api/analytics/sectors");
rec("A-01", "superadmin, all countries: 200 and an array", a.status === 200 && Array.isArray(a.body), `HTTP ${a.status}`);
const u = await sa.get("/api/analytics/sectors?countryId=uae");
const ok = u.status === 200 && Array.isArray(u.body) && u.body.length > 0 && u.body.every((r) => typeof r.sector === "string" && Array.isArray(r.prioritySkills));
rec("A-02", "superadmin, UAE: rows with sector names and skill arrays", ok, `HTTP ${u.status} rows=${Array.isArray(u.body) ? u.body.length : "-"}`);
const { orgs } = await build();
const st = orgs.A.students?.[0];
if (st) {
  const s = new Session("st"); await s.login(st.username, st.password);
  const r = await s.get("/api/analytics/sectors");
  rec("A-03", "a student is refused", r.status === 403, `HTTP ${r.status}`);
}
const ov = await sa.get("/api/analytics/overview");
const m = await sa.get("/api/superadmin/metrics");
rec("A-04", "nationwide overview = dashboard's school-roster figures",
  ov.status === 200 && m.status === 200 && ov.body.totalStudents === m.body.totalStudents &&
  ov.body.completedAssessments === m.body.studentsCompleted && ov.body.completedAssessments <= ov.body.totalStudents,
  `overview ${ov.body?.totalStudents}/${ov.body?.completedAssessments} dashboard ${m.body?.totalStudents}/${m.body?.studentsCompleted}`);
const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
