/**
 * A COUNTRY WITH A SECTOR MAP COULD NOT BE DELETED, and one without needed
 * its subjects deleted one at a time first.
 *
 *   D-01  a country with subjects AND a sector map is deleted in one request,
 *         and none of its configuration rows are left behind
 *   D-02  control: a country a school belongs to is still refused, 409
 *   D-03  and that refusal removed NOTHING (one transaction)
 *
 * Judged by rows.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";
const results = [];
const rec = (id, what, pass, note = "") => { results.push({ id, pass }); console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`); };
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await client.connect();
  try { return (await client.query(text, params)).rows; } finally { await client.end(); }
}
const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const counts = async (id) => (await sql(`
  SELECT (SELECT COUNT(*)::int FROM countries WHERE id = '${id}') AS country,
         (SELECT COUNT(*)::int FROM subjects WHERE country_id = '${id}') AS subjects,
         (SELECT COUNT(*)::int FROM country_priority_sectors WHERE country_id = '${id}') AS sectors,
         (SELECT COUNT(*)::int FROM country_sector_categories c JOIN country_priority_sectors s ON s.id = c.sector_id WHERE s.country_id = '${id}') AS rules,
         (SELECT COUNT(*)::int FROM country_sector_wef_skills k JOIN country_priority_sectors s ON s.id = k.sector_id WHERE s.country_id = '${id}') AS skills`))[0];

const { orgs } = await build();
const sa = new Session("sa"); await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const plant = async (id, code) => {
  const mk = await sa.post("/api/admin/countries", { id, name: `Delete ${code}`, code });
  await pause();
  await sa.req("PUT", `/api/admin/countries/${id}`, { curricula: ["Testing Curriculum"] });   // seeds six subjects
  await pause();
  await sql(`INSERT INTO country_priority_sectors (id, country_id, name, display_order) VALUES ('sec-${id}', '${id}', 'Energy', 1);
             INSERT INTO country_sector_categories (sector_id, career_category, relevance) VALUES ('sec-${id}', 'Engineering', 90);
             INSERT INTO country_sector_wef_skills (sector_id, wef_skill_id, importance)
               SELECT 'sec-${id}', id, 80 FROM wef_skills LIMIT 1;`);
  await pause();
  return mk.status;
};

// ------------------------------------------------------------------ D-01
{
  const made = await plant("zzdel", "ZD");
  const before = await counts("zzdel");
  const del = await sa.req("DELETE", "/api/admin/countries/zzdel");
  await pause();
  const after = await counts("zzdel");
  rec("D-01", "a country with subjects and a sector map is deleted whole",
    made === 201 && before.subjects >= 6 && before.sectors === 1 && before.rules === 1 && before.skills === 1 &&
    del.status === 200 && Object.values(after).every((v) => v === 0),
    `HTTP ${del.status} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
}

// ------------------------------------------------------------------ D-02, D-03
{
  await plant("zzkeep", "ZK");
  await sql(`UPDATE organizations SET country_id = 'zzkeep' WHERE id = '${orgs.B.orgId}'`);
  await pause();
  const before = await counts("zzkeep");
  const del = await sa.req("DELETE", "/api/admin/countries/zzkeep");
  await pause();
  const after = await counts("zzkeep");
  rec("D-02", "control: a country a school belongs to is refused", del.status === 409 && after.country === 1, `HTTP ${del.status} country rows=${after.country}`);
  rec("D-03", "the refusal removed none of its configuration", JSON.stringify(before) === JSON.stringify(after), `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  // leave nothing behind for other suites
  await sql(`UPDATE organizations SET country_id = 'uae' WHERE id = '${orgs.B.orgId}'`);
  await pause();
  await sa.req("DELETE", "/api/admin/countries/zzkeep");
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`); process.exit(1); }
