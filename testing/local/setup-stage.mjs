/**
 * THE SUPERADMIN'S VIEW OF WHERE A SCHOOL IS STUCK — and the one action that
 * follows from it.
 *
 * `shared/schoolSetupStage.test.ts` pins the decision logic as a pure
 * function. This suite pins the two things that file cannot: that the ROUTE
 * feeds it the right columns, and that the resend endpoint refuses when
 * resending would not help.
 *
 * Each case builds a school in a specific state and reads the stage back from
 * `GET /api/superadmin/organizations`, so a wrong column, a missing join or a
 * consent read taken from the wrong table shows up here rather than in
 * production as a human sent to the wrong place.
 *
 * Deletes every school it creates: a left-behind organisation inflates the
 * superadmin counts for every later suite.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

/**
 * Connect per call, and KEEP THE CALLS FEW.
 *
 * PGlite allows ONE connection in total, and the application server holds it:
 * a client kept open for the whole suite starves the app, and superadmin login
 * answers 500. Connecting per statement is the other failure — forty rapid
 * connect/disconnect cycles exhaust it partway with `read ECONNRESET`, which
 * reads like a database fault and is not one.
 *
 * So each school is built in ONE multi-statement call rather than six. The
 * values interpolated there are this suite's own constants (a hex token, an
 * alphanumeric tag, labels written above), never anything from a request.
 */
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const tag = Math.random().toString(36).slice(2, 7);
const hex = (n) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");

const { orgs } = await build();
const A = orgs.A;

const sa = new Session(`stage-super-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const made = [];

/**
 * A school in a chosen state, built from columns rather than by driving the
 * product: this suite is about how the state is REPORTED, and `setup-invite`
 * and `school-setup-link` already prove how it is reached.
 *
 * Timestamps are written as SQL intervals, never bound JS Dates — PGlite
 * mis-binds those against a timestamp column (CLAUDE.md).
 */
async function school(label, { hasPassword, countryId, curriculum, consent, linkUsed, ageDays = 1, students = 0 }) {
  const uname = `stage${label}${tag}`;
  const email = `stage.${label}.${tag}@futurepath.test`;
  const orgName = `Stage ${label} ${tag}`;
  const lit = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

  const studentRows = Array.from({ length: students }, (_, i) => `
    WITH su AS (
      INSERT INTO users (id, username, account_type)
      VALUES (gen_random_uuid(), 'stagestu${label}${i}${tag}', 'student') RETURNING id
    )
    INSERT INTO organization_members (id, organization_id, user_id, role, student_name, student_gender, grade, date_of_birth)
    SELECT gen_random_uuid(), o.id, su.id, 'student', 'Stage Student ${i}', 'female', '10', '2010-05-01'
    FROM su, organizations o WHERE o.name = ${lit(orgName)};`).join("\n");

  // A student row needs student_name, student_gender, grade AND date_of_birth:
  // two separate CHECK constraints, organization_members_student_demographics_check
  // and organization_members_student_dob_check. Both are the schema refusing a
  // half-built minor's record, which is the point of them.
  await sql(`
    WITH u AS (
      INSERT INTO users (id, username, email, first_name, account_type, password_hash)
      VALUES (gen_random_uuid(), ${lit(uname)}, ${lit(email)}, 'Stage', 'org_admin',
              ${hasPassword ? lit("$2b$10$notarealhashbutnotnull") : "NULL"})
      RETURNING id
    ), o AS (
      INSERT INTO organizations (id, name, admin_user_id, total_licenses, used_licenses, country_id, curriculum, created_at)
      SELECT gen_random_uuid(), ${lit(orgName)}, u.id, 100, 0, ${lit(countryId)}, ${lit(curriculum)},
             NOW() - INTERVAL '${ageDays} days'
      FROM u RETURNING id, admin_user_id
    ), m AS (
      INSERT INTO organization_members (id, organization_id, user_id, role, is_primary_admin)
      SELECT gen_random_uuid(), o.id, o.admin_user_id, 'admin', true FROM o RETURNING id
    ), tok AS (
      INSERT INTO school_setup_tokens (id, user_id, organization_id, token, expires_at, sent_at, sent_count, used_at)
      SELECT gen_random_uuid(), o.admin_user_id, o.id, ${lit(hex(64))},
             NOW() + INTERVAL '7 days', NOW(), 1, ${linkUsed ? "NOW()" : "NULL"} FROM o RETURNING id
    )${consent ? `, con AS (
      INSERT INTO organization_consents
        (id, organization_id, organization_name, consents_to_processing, attests_guardian_consent,
         attestation_text_hash, performed_by, performed_by_role, performed_by_name, performed_by_email,
         policy_locale, policy_version, policy_last_updated)
      SELECT gen_random_uuid(), o.id, ${lit(orgName)}, true, true, 'hash', o.admin_user_id,
             'org_admin', 'Stage Admin', ${lit(email)}, 'en', '1.0', NOW() FROM o RETURNING id
    )` : ""}
    SELECT (SELECT id FROM o) AS org_id, (SELECT admin_user_id FROM o) AS user_id;
  `);

  if (students > 0) await sql(studentRows);

  const [row] = await sql(`SELECT id, admin_user_id FROM organizations WHERE name = $1`, [orgName]);
  made.push({ orgId: row.id, userId: row.admin_user_id });
  return row.id;
}

const stageOf = async (orgId) => {
  const r = await sa.get("/api/superadmin/organizations");
  if (r.status !== 200) return { error: r.status };
  const row = (r.body ?? []).find((o) => o.id === orgId);
  return row?.setup ?? { error: "no setup block" };
};

try {
  // ------------------------------------------------------------------ S-00
  // The listing carries a setup block at all. Without this every case below
  // would read `undefined` and compare it to nothing.
  const neverIn = await school("never", { hasPassword: false, countryId: null, curriculum: null, consent: false, linkUsed: false });
  {
    const s = await stageOf(neverIn);
    rec("S-00", "the listing carries a setup block per school", !!s && !s.error,
      s?.error ? String(s.error) : `stage=${s.stage}`);
  }

  // ------------------------------------------------------------------ S-01
  {
    const s = await stageOf(neverIn);
    rec("S-01", "no password: never_signed_in, resend offered",
      s.stage === "never_signed_in" && s.canResend === true,
      `stage=${s.stage} canResend=${s.canResend} sentCount=${s.linkSentCount}`);
  }

  // ------------------------------------------------------------------ S-02
  // THE CASE THE WHOLE DESIGN EXISTS FOR. They are IN but have not finished,
  // so a resend would achieve nothing and must not be offered.
  const stuck = await school("stuck", { hasPassword: true, countryId: "uae", curriculum: null, consent: false, linkUsed: true });
  {
    const s = await stageOf(stuck);
    rec("S-02", "signed in but unfinished: no resend offered",
      s.stage === "setup_incomplete" && s.canResend === false
      && s.missing.includes("curriculum") && s.missing.includes("consent"),
      `stage=${s.stage} canResend=${s.canResend} missing=${(s.missing ?? []).join("+")}`);
  }

  // ------------------------------------------------------------------ S-03
  // CONSENT IS A GATE. Country and curriculum both set, and the school still
  // cannot enrol — proved against the live product in school-setup-link L-11.
  // Reporting it as ready would send a human looking for a bug elsewhere.
  const noConsent = await school("noconsent", { hasPassword: true, countryId: "uae", curriculum: "MOE National", consent: false, linkUsed: true });
  {
    const s = await stageOf(noConsent);
    rec("S-03", "country+curriculum set but no consent is NOT ready",
      s.stage === "setup_incomplete" && JSON.stringify(s.missing) === JSON.stringify(["consent"]),
      `stage=${s.stage} missing=${(s.missing ?? []).join("+")}`);
  }

  // ------------------------------------------------------------------ S-04
  const ready = await school("ready", { hasPassword: true, countryId: "uae", curriculum: "MOE National", consent: true, linkUsed: true, students: 2 });
  {
    const s = await stageOf(ready);
    rec("S-04", "every gate cleared with students: ready",
      s.stage === "ready" && s.canResend === false && (s.missing ?? []).length === 0,
      `stage=${s.stage} missing=${(s.missing ?? []).length}`);
  }

  // ------------------------------------------------------------------ S-05
  // Set up correctly, nobody enrolled, a month old. Nothing is broken: this is
  // a sales follow-up, and mixing it in with the stuck ones means chasing
  // support tickets that do not exist.
  const dormant = await school("dormant", { hasPassword: true, countryId: "uae", curriculum: "MOE National", consent: true, linkUsed: true, ageDays: 45 });
  {
    const s = await stageOf(dormant);
    rec("S-05", "set up, empty and 45 days old: ready_no_students",
      s.stage === "ready_no_students" && s.canResend === false,
      `stage=${s.stage} canResend=${s.canResend}`);
  }

  // ------------------------------------------------------------------ S-06
  // RESEND WORKS, and bumps the count on the EXISTING token rather than
  // minting a new one — a buyer who finally opens the first mail must not find
  // it dead.
  {
    const before = await sql(`SELECT token, sent_count FROM school_setup_tokens WHERE organization_id = $1`, [neverIn]);
    const r = await sa.post(`/api/superadmin/organizations/${neverIn}/resend-setup`);
    const after = await sql(`SELECT token, sent_count FROM school_setup_tokens WHERE organization_id = $1`, [neverIn]);
    rec("S-06", "resend sends, reuses the same token and bumps the count",
      r.status === 200 && after.length === 1 && after[0].token === before[0].token
      && Number(after[0].sent_count) === Number(before[0].sent_count) + 1,
      `HTTP ${r.status} tokens=${after.length} sameToken=${after[0]?.token === before[0]?.token} count=${before[0]?.sent_count}→${after[0]?.sent_count}`);
  }

  // ------------------------------------------------------------------ S-07
  // THE REFUSAL. The server recomputes the stage rather than trusting the
  // client to have hidden the button, and sends nothing to a school that is
  // already in.
  {
    const before = await sql(`SELECT id, sent_count FROM school_setup_tokens WHERE organization_id = $1`, [stuck]);
    const r = await sa.post(`/api/superadmin/organizations/${stuck}/resend-setup`);
    const after = await sql(`SELECT id, sent_count FROM school_setup_tokens WHERE organization_id = $1`, [stuck]);
    // Row COUNT as well as send count. This school's existing token is already
    // used, so a resend that got through would MINT A SECOND live sign-in link
    // for an account already in use — and reading sent_count alone missed that
    // when the guard was removed, because the new row was not the one read.
    const totalSends = (rows) => rows.reduce((n, x) => n + Number(x.sent_count), 0);
    rec("S-07", "resend REFUSED for a school already signed in, no new link",
      r.status === 409 && r.body?.code === "RESEND_NOT_APPLICABLE"
      && after.length === before.length && totalSends(after) === totalSends(before),
      `HTTP ${r.status} code=${r.body?.code} tokens=${before.length}→${after.length} sends=${totalSends(before)}→${totalSends(after)}`);
  }

  // ------------------------------------------------------------------ S-08
  // An org admin must not be able to make the system mail a sign-in link for
  // any school, its own included. Judged by the send count, not the status.
  {
    const before = await sql(`SELECT sent_count FROM school_setup_tokens WHERE organization_id = $1`, [neverIn]);
    const r = await A.session.post(`/api/superadmin/organizations/${neverIn}/resend-setup`);
    const after = await sql(`SELECT sent_count FROM school_setup_tokens WHERE organization_id = $1`, [neverIn]);
    rec("S-08", "an org admin cannot trigger a resend for anyone",
      r.status === 403 && Number(after[0].sent_count) === Number(before[0].sent_count),
      `HTTP ${r.status} count=${before[0]?.sent_count}→${after[0]?.sent_count}`);
  }
} finally {
  for (const { orgId, userId } of made) {
    try {
      await sql(`DELETE FROM school_setup_tokens WHERE organization_id = $1`, [orgId]);
      await sql(`DELETE FROM organization_consents WHERE organization_id = $1`, [orgId]);
      await sql(`DELETE FROM organization_events WHERE organization_id = $1`, [orgId]);
      const studs = await sql(
        `SELECT user_id FROM organization_members WHERE organization_id = $1 AND role = 'student'`, [orgId]);
      await sql(`DELETE FROM organization_members WHERE organization_id = $1`, [orgId]);
      for (const r of studs) await sql(`DELETE FROM users WHERE id = $1`, [r.user_id]);
      await sql(`DELETE FROM organizations WHERE id = $1`, [orgId]);
      await sql(`DELETE FROM users WHERE id = $1`, [userId]);
    } catch (err) { console.error("cleanup:", String(err.message).slice(0, 80)); }
  }
  const left = await sql(`SELECT COUNT(*)::int AS n FROM organizations WHERE name LIKE $1`, [`Stage %${tag}`]);
  if (Number(left[0].n) > 0) console.error(`WARNING: ${left[0].n} stage schools left behind`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
