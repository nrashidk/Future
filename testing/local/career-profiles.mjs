/**
 * A CAREER'S MATCHING PROFILES (2026-11-22).
 *
 * D-cases: deleting a career. Five tables reference careers without a
 * cascade; deleteCareer cleared recommendations only, so every seeded career
 * (each has a personality and a future-skills profile) answered 500
 * "Failed to delete career". Judged by the ROWS, never the status alone.
 *
 *   D-01  THE CASE THAT MATTERS: a seeded career (Chef) deletes, and its
 *         personality and future-skills rows go with it
 *   D-02  control: another career's rows are untouched
 *   D-03  control: a non-superadmin is still refused, and nothing is deleted
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({ connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres` });
  await c.connect();
  try { return await c.query(text, params); } finally { await c.end(); }
}

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(66)} ${note}`);
};
const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));
const rows = async (careerId) => {
  const r = (await sql(
    `SELECT (SELECT COUNT(*)::int FROM career_component_affinities WHERE career_id = '${careerId}') AS p,
            (SELECT COUNT(*)::int FROM career_wef_skill_affinities WHERE career_id = '${careerId}') AS w,
            (SELECT COUNT(*)::int FROM careers WHERE id = '${careerId}') AS c`)).rows[0];
  await pause();
  return r;
};

const { orgs } = await build();
const sa = new Session("cpSuper");
await sa.login(SUPERADMIN.username, SUPERADMIN.password);
const all = (await sa.get("/api/superadmin/careers")).body;
const byTitle = (t) => all.find((c) => c.title === t);
const chef = byTitle("Chef");
const dentist = byTitle("Dentist");
if (!chef || !dentist) throw new Error("seeded careers Chef/Dentist not found");

// ------------------------------------------------------------------ D-03
{
  const admin = new Session("cpAdmin");
  await admin.login(orgs.A.adminUsername, orgs.A.adminPassword);
  await admin.get("/api/auth/user");
  const r = await admin.del(`/api/superadmin/careers/${dentist.id}`);
  const after = await rows(dentist.id);
  rec("D-03", "control: a school admin cannot delete a career",
    r.status === 403 && after.c === 1, `HTTP ${r.status} career=${after.c}`);
}

// ------------------------------------------------------------------ D-01, D-02
{
  const before = await rows(chef.id);
  const otherBefore = await rows(dentist.id);
  const r = await sa.del(`/api/superadmin/careers/${chef.id}`);
  const after = await rows(chef.id);
  const otherAfter = await rows(dentist.id);
  rec("D-01", "a seeded career deletes, with its own profile rows",
    r.status === 200 && before.p > 0 && before.w > 0 && after.c === 0 && after.p === 0 && after.w === 0,
    `HTTP ${r.status} before p=${before.p} w=${before.w} after c=${after.c} p=${after.p} w=${after.w}`);
  rec("D-02", "control: another career's profile rows are untouched",
    otherBefore.p > 0 && otherAfter.p === otherBefore.p && otherAfter.w === otherBefore.w && otherAfter.c === 1,
    `p ${otherBefore.p}->${otherAfter.p} w ${otherBefore.w}->${otherAfter.w}`);
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\ncareer-profiles: ${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
