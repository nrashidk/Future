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
 *
 * M-cases: "Matches like" (owner, 2026-11-22). A career added from the form
 * had no personality, values or future-skills profile and scored ~20 points
 * behind its twin (Chef 68.9, the form's copy ~46). It now takes the three
 * profiles of a career the superadmin chooses.
 *   M-01  control: added WITHOUT a choice, it still has all four gaps
 *   M-02  added "like Chef": no gaps, and the same rows Chef has (incl. its
 *         sector placement, which is what decides vision for Chef)
 *   M-03  THE CASE THAT MATTERS: for the same student it scores EXACTLY what
 *         Chef scores (it was ~46 against 68.9)
 *   M-04  an existing career is fixed from the edit form, nothing else changed
 *   M-05  an unknown career to match is refused, and nothing is created
 *   M-06  a career cannot match like itself
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
            (SELECT COUNT(*)::int FROM country_sector_categories WHERE career_id = '${careerId}') AS s,
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

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
function riasec30() { const o = {}; for (const t of ["R","I","A","S","E","C"]) for (let i = 1; i <= 5; i++) o[`${t}${i}`] = ((i + t.charCodeAt(0)) % 5) + 1; return o; }
async function cvq15() { const items = (await (await fetch(`${BASE}/api/cvq/items`)).json()).items ?? []; const o = {}; items.forEach((it, i) => { o[it.id] = (i % 5) + 1; }); return o; }
const gapsOf = async (id) => ((await sa.get("/api/superadmin/careers")).body.find((c) => c.id === id) ?? {}).matchingGaps;
const formCareer = (title, extra = {}) => ({
  title, description: "Added in a test", requiredSkills: ["Cooking"], relatedSubjects: ["Science"],
  category: chef.category, educationLevel: chef.educationLevel, onetGrowthBand: chef.onetGrowthBand, ...extra,
});

// ------------------------------------------------------------------ M-01
const plain = await sa.post("/api/superadmin/careers", formCareer("ZZ Plain Career"));
rec("M-01", "control: added without a choice, all four profiles missing",
  plain.status === 201 && JSON.stringify(await gapsOf(plain.body.id)) === '["personality","values","futureSkills","sectorPlacement"]',
  `HTTP ${plain.status} gaps=${JSON.stringify(await gapsOf(plain.body?.id))}`);

// ------------------------------------------------------------------ M-02
// Same fields as Chef, so only the profiles can make the scores differ in M-03.
const copy = await sa.post("/api/superadmin/careers", {
  ...formCareer("ZZ Chef Twin"), description: chef.description, requiredSkills: chef.requiredSkills,
  relatedSubjects: chef.relatedSubjects, matchLikeCareerId: chef.id,
});
{
  const c = await rows(copy.body?.id), src = await rows(chef.id);
  const vals = (await sql(`SELECT (SELECT values_profile::text FROM careers WHERE id='${copy.body?.id}') = (SELECT values_profile::text FROM careers WHERE id='${chef.id}') AS same`)).rows[0].same;
  await pause();
  rec("M-02", "added like Chef: no gaps, Chef's rows copied",
    copy.status === 201 && JSON.stringify(await gapsOf(copy.body.id)) === "[]" && c.p === src.p && c.w === src.w && c.s === src.s && src.s > 0 && vals === true,
    `HTTP ${copy.status} p ${c.p}/${src.p} w ${c.w}/${src.w} sector ${c.s}/${src.s} values=${vals}`);
}

// ------------------------------------------------------------------ M-03
{
  const st = new Session("cpStudent");
  const s1 = orgs.A.students[0];
  await st.login(s1.username, s1.password);
  const made = await st.post("/api/assessments", { favoriteSubjects: ["Mathematics","Science","English"], interests: ["Technology","Healthcare","Business"], countryId: "uae", curriculum: "MOE National", grade: "10", riasecResponses: riasec30(), cvqResponses: await cvq15() });
  const id = made.body?.id;
  const gen = await st.post(`/api/assessments/${id}/quiz/generate`, {});
  await st.post(`/api/assessments/${id}/quiz/submit`, { responses: (gen.body?.questions ?? []).map((q) => ({ questionId: q.id, answer: typeof q.options?.[0] === "string" ? q.options[0] : q.options?.[0]?.text })) });
  await st.patch(`/api/assessments/${id}`, { name: "Probe", age: 15, interests: ["Technology","Healthcare","Business"], careerAspirations: ["Doctor"], visionAlignment: { healthcare: 5, technology: 4 }, currentStep: 6 });
  await st.post("/api/cvq/submit", { assessmentId: id, responses: await cvq15(), durationSeconds: 120 });
  await st.post(`/api/recommendations/generate/${id}`, {});
  const recs = (await st.get(`/api/recommendations?assessmentId=${id}`)).body ?? [];
  const score = (t) => recs.find((r) => r.career?.title === t)?.overallMatchScore;
  const a = score("Chef"), b = score("ZZ Chef Twin");
  rec("M-03", "for the same student the copy scores exactly what Chef scores",
    made.body?.assessmentType === "premium" && a != null && b != null && Number(a) === Number(b),
    `type=${made.body?.assessmentType} Chef=${a} twin=${b} top=${recs.map((r) => r.career?.title).join("|")}`);
}

// ------------------------------------------------------------------ M-04
{
  const r = await sa.patch(`/api/superadmin/careers/${plain.body.id}`, { matchLikeCareerId: chef.id });
  const title = (await sql(`SELECT title FROM careers WHERE id='${plain.body.id}'`)).rows[0]?.title;
  await pause();
  rec("M-04", "fixed from the edit form; nothing else changed",
    r.status === 200 && JSON.stringify(await gapsOf(plain.body.id)) === "[]" && title === "ZZ Plain Career",
    `HTTP ${r.status} gaps=${JSON.stringify(await gapsOf(plain.body.id))} title=${title}`);
}

// ------------------------------------------------------------------ M-05, M-06
{
  const r = await sa.post("/api/superadmin/careers", formCareer("ZZ Orphan", { matchLikeCareerId: "no-such-career" }));
  const n = (await sql(`SELECT COUNT(*)::int AS n FROM careers WHERE title='ZZ Orphan'`)).rows[0].n;
  await pause();
  rec("M-05", "an unknown career to match is refused; nothing created",
    r.status === 400 && r.body?.error === "MATCH_LIKE_NOT_FOUND" && n === 0, `HTTP ${r.status} ${r.body?.error} rows=${n}`);
  const self = await sa.patch(`/api/superadmin/careers/${copy.body.id}`, { matchLikeCareerId: copy.body.id });
  rec("M-06", "a career cannot match like itself",
    self.status === 400 && self.body?.error === "MATCH_LIKE_SELF", `HTTP ${self.status} ${self.body?.error}`);
}

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
