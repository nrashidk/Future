/**
 * The superadmin and school analytics "Talent Pipeline by Priority Sector".
 * Until 2026-11-14 the query grouped by a json column and failed on EVERY call
 * (500), which the page rendered as "No sector data available yet".
 *   A-01  superadmin, all countries: 200 and an array
 *   A-02  superadmin, UAE: 200, one row per UAE priority sector, skills an array
 *   A-03  a student is still refused (control that the route is not opened up)
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
const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
