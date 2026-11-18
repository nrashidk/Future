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
// A-05  ONE STUDENT, ONE SECTOR (owner's rule, 2026-11-18): each student is
// counted once, in the sector of the top career of their LATEST report. Before
// it every card showed every student. Two students of school A are planted:
// S1 has an older report topped by a Healthcare career and a newer one topped
// by a Technology career; S2 has one report topped by the Healthcare career
// with the Technology career lower down. Judged as school A's admin, so the
// count is the school's two students and nobody else's:
//   - the cards add up to 2 (not 3: S1's older report must not count)
//   - exactly two cards are non-zero, one each (not every card the same)
{
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  const studs = (await c.query(`SELECT user_id FROM organization_members WHERE organization_id = $1 AND role = 'student' ORDER BY user_id LIMIT 2`, [orgs.A.orgId])).rows.map((r) => r.user_id);
  const health = (await c.query(`SELECT id FROM careers WHERE category = 'Healthcare' ORDER BY id LIMIT 1`)).rows[0].id;
  const tech = (await c.query(`SELECT id FROM careers WHERE category = 'Technology' ORDER BY id LIMIT 1`)).rows[0].id;
  const mk = async (uid, ago) => (await c.query(
    `INSERT INTO assessments (user_id, country_id, grade, favorite_subjects, interests, is_completed, completed_at)
     VALUES ($1, 'uae', 'grade10', '{}', '{}', true, NOW() - ($2 || ' hours')::interval) RETURNING id`, [uid, String(ago)])).rows[0].id;
  const rec2 = async (aid, career, score) => c.query(
    `INSERT INTO recommendations (assessment_id, career_id, overall_match_score, subject_match_score, interest_match_score,
       country_vision_alignment, future_market_demand, reasoning, action_steps, required_education)
     VALUES ($1, $2, $3, 50, 50, 70, 50, 'x', '{}', 'x')`, [aid, career, score]);
  const a1old = await mk(studs[0], 48); await rec2(a1old, health, 90); await rec2(a1old, tech, 60);
  const a1new = await mk(studs[0], 1);  await rec2(a1new, tech, 85); await rec2(a1new, health, 70);
  const a2 = await mk(studs[1], 2);     await rec2(a2, health, 88); await rec2(a2, tech, 40);
  const r = await orgs.A.session.get("/api/analytics/sectors?countryId=uae");
  await c.query(`DELETE FROM recommendations WHERE assessment_id = ANY($1::text[])`, [[a1old, a1new, a2]]);
  await c.query(`DELETE FROM assessments WHERE id = ANY($1::text[])`, [[a1old, a1new, a2]]);
  await c.end();
  const counts = Array.isArray(r.body) ? r.body.map((x) => x.studentCount) : [];
  const total = counts.reduce((a, b) => a + b, 0);
  const nonZero = counts.filter((n) => n > 0);
  rec("A-05", "each student once, in their latest top career's sector",
    r.status === 200 && total === 2 && nonZero.length === 2 && nonZero.every((n) => n === 1),
    `HTTP ${r.status} counts=${JSON.stringify(Array.isArray(r.body) ? r.body.filter((x) => x.studentCount).map((x) => [x.sector, x.studentCount]) : r.body)} total=${total}`);
}

const failed = results.filter((p) => !p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
