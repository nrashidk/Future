/**
 * GUEST → ACCOUNT CLAIM.
 *
 * A visitor can take an assessment without an account. The row is written with
 * a null `user_id` and a `guest_session_id`, and the browser is given a
 * matching httpOnly `guest_token` cookie. When that person later gets an
 * account, `POST /api/assessments/migrate` transfers the row to them.
 *
 * FOLLOWUP recorded this as broken — "guestSessionId never stored". That is
 * stale; it is stored and the claim is built. What was missing was any test at
 * all, which is the same state the school-owned field lock was in before
 * `school-lock.mjs`: correct-looking code with nothing holding it there.
 *
 * WHY IT IS WORTH A SUITE RATHER THAN A READ. The claim moves a minor's
 * assessment — name, grade, school-less profile, answers, career results — from
 * nobody to somebody. The thing that decides who gets it is a cookie compared
 * against a column, and if that comparison ever stops happening, one person
 * acquires another child's report and nothing in the response looks different:
 * `migratedCount` would simply be larger. Under this repo's own rule that is an
 * access-control finding on minors' data, so it is escalated by one level and
 * tested as an attack, not just as a happy path.
 *
 * C-02 and C-03 are the cases that matter. C-01 and C-07 exist so that a guard
 * which refuses EVERYTHING cannot pass: C-01 proves a legitimate claim still
 * works, and C-07 proves the claimed row is actually usable afterwards rather
 * than merely counted.
 *
 * ONLY TWO FLOWS REACH THIS IN THE PRODUCT, and knowing that shaped the suite:
 * `RegisterParent.tsx` and `AuthCallback.tsx`. `POST /api/register` is retired
 * (410 FREE_TIER_RETIRED), so there is no free self-registration to claim
 * through, and OAuth cannot be exercised offline. Parent registration is
 * therefore the account-creation path used here, and it logs the user in, so
 * one session carries the guest cookie straight through to the claim.
 */
import { Session } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";
const PASSWORD = "LocalTest!Parent1";

const results = [];
const isHtml = (b) => typeof b === "string" && b.trimStart().startsWith("<!DOCTYPE");
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(60)} ${note}`);
};

async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const tag = Math.random().toString(36).slice(2, 8);

/** A guest session with an assessment, and the guest_token cookie that owns it. */
async function makeGuest(label) {
  const s = new Session(`gc-${label}-${tag}`);
  await s.get("/api/auth/user");
  const made = await s.post("/api/assessments", {
    favoriteSubjects: ["mathematics", "physics", "chemistry"],
    interests: ["technology"],
    assessmentType: "basic",
    countryId: "uae", curriculum: "MOE National", grade: "10",
  });
  const token = (s.cookie.match(/(?:^|; )guest_token=([^;]+)/) || [])[1] ?? null;
  return { session: s, id: made.body?.id ?? null, status: made.status, token };
}

/** Register a parent on an EXISTING session, so its guest cookie survives. */
async function registerParentOn(session, label) {
  return session.post("/api/register/parent", {
    firstName: "Claim", lastName: label,
    email: `claim.${label}.${tag}@futurepath.test`,
    password: PASSWORD, confirmPassword: PASSWORD,
    child: { name: "Claim Child", dateOfBirth: "2010-04-04", gender: "male",
             grade: "10", countryId: "uae", curriculum: "MOE National" },
    consentsToProcessing: true, attestsGuardianRelationship: true,
    attestationText: "LOCAL FIXTURE attestation wording",
    locale: "en",
  });
}

const ownerOf = async (id) =>
  (await sql(`SELECT user_id, guest_session_id FROM assessments WHERE id = $1`, [id]))[0] ?? null;

const victim = await makeGuest("victim");
if (!victim.id) throw new Error(`fixture: guest assessment not created (HTTP ${victim.status})`);
if (!victim.token) throw new Error("fixture: no guest_token cookie was issued — nothing to authorize a claim");

try {
  // ------------------------------------------------------------------ C-00
  // The route is real and refuses an anonymous caller. The SPA catch-all
  // answers 200 with HTML for any unmatched URL, so without this the whole
  // file could be measuring a route that does not exist.
  {
    const anon = new Session(`gc-anon-${tag}`);
    await anon.get("/api/auth/user");
    const r = await anon.post("/api/assessments/migrate", { guestAssessmentIds: [victim.id] });
    const ok = r.status === 401 && !isHtml(r.body) && typeof r.body?.message === "string";
    rec("C-00", "route is real and refuses an unauthenticated claim", ok,
      isHtml(r.body) ? "NO SUCH ROUTE" : `HTTP ${r.status}`);
  }

  // ------------------------------------------------------------------ C-02
  // THE ATTACK, and it runs BEFORE the happy path on purpose: while the
  // victim's row is still unclaimed, which is the only window in which stealing
  // it is possible at all. Running it after C-01 would prove far less — the
  // `!assessment.userId` check would refuse it for the wrong reason, and the
  // test would pass against a broken cookie comparison.
  {
    const attacker = await makeGuest("attacker");
    const reg = await registerParentOn(attacker.session, "attacker");
    const r = await attacker.session.post("/api/assessments/migrate", {
      guestAssessmentIds: [victim.id],
    });
    const row = await ownerOf(victim.id);
    const ok = reg.status < 400 && r.body?.migratedCount === 0 && row?.user_id === null;
    rec("C-02", "another account cannot claim an unclaimed guest assessment", !!ok,
      `register=${reg.status} migrated=${r.body?.migratedCount} victim.user_id=${row?.user_id}`);
  }

  // ------------------------------------------------------------------ C-03
  // A FORGED TOKEN. The attacker above held a real token for a different row;
  // this one presents a plausible invented value for the victim's row, which is
  // what a guessing attacker would send.
  {
    const forger = await makeGuest("forger");
    await registerParentOn(forger.session, "forger");
    forger.session.cookie = forger.session.cookie.replace(
      /guest_token=[^;]+/,
      `guest_token=${"f".repeat(victim.token.length)}`,
    );
    const r = await forger.session.post("/api/assessments/migrate", {
      guestAssessmentIds: [victim.id],
    });
    const row = await ownerOf(victim.id);
    rec("C-03", "a forged guest_token claims nothing",
      r.body?.migratedCount === 0 && row?.user_id === null,
      `migrated=${r.body?.migratedCount} victim.user_id=${row?.user_id}`);
  }

  // ------------------------------------------------------------------ C-05
  // No guest cookie at all must be refused explicitly, not treated as a claim
  // of everything in the body.
  {
    const noCookie = await makeGuest("nocookie");
    await registerParentOn(noCookie.session, "nocookie");
    noCookie.session.cookie = noCookie.session.cookie
      .split("; ").filter((c) => !c.startsWith("guest_token=")).join("; ");
    const r = await noCookie.session.post("/api/assessments/migrate", {
      guestAssessmentIds: [victim.id],
    });
    const row = await ownerOf(victim.id);
    rec("C-05", "no guest_token: refused with 400, nothing transferred",
      r.status === 400 && row?.user_id === null, `HTTP ${r.status} victim.user_id=${row?.user_id}`);
  }

  // ------------------------------------------------------------------ C-01
  // THE NEGATIVE CONTROL for everything above: the rightful owner CAN claim.
  // Without this, a migrate that refused every request would pass C-00, C-02,
  // C-03 and C-05 and the feature would be entirely broken.
  let parentUserId = null;
  {
    const reg = await registerParentOn(victim.session, "owner");
    parentUserId = reg.body?.user?.id ?? reg.body?.id ?? null;
    const r = await victim.session.post("/api/assessments/migrate", {
      guestAssessmentIds: [victim.id],
    });
    const row = await ownerOf(victim.id);
    const ok = reg.status < 400 && r.body?.migratedCount === 1
      && !!parentUserId && row?.user_id === parentUserId;
    rec("C-01", "the rightful owner claims it, and the row changes hands", !!ok,
      `register=${reg.status} migrated=${r.body?.migratedCount} user_id matches=${row?.user_id === parentUserId}`);
  }

  // ------------------------------------------------------------------ C-04
  /**
   * Idempotent — and the mechanism is not the one I first assumed, which is
   * worth writing down because the first version of this case asserted the
   * wrong thing and failed against correct code.
   *
   * I expected `migratedCount: 0`, refused by the `!assessment.userId` check.
   * What actually happens is a 400: a successful claim CLEARS the guest_token
   * cookie, so the retry arrives with no guest session at all and never reaches
   * the ownership comparison. The `!userId` check is the second line, not the
   * first.
   *
   * So this asserts the GUARANTEE rather than the route it takes — nothing is
   * transferred and the row still belongs to the same account — and accepts
   * either refusal. Pinning one of them would make this fail if the cookie
   * clearing were moved, which would be a test asserting an implementation
   * detail it does not own.
   */
  {
    const hadTokenBefore = /guest_token=/.test(victim.session.cookie);
    const r = await victim.session.post("/api/assessments/migrate", {
      guestAssessmentIds: [victim.id],
    });
    const row = await ownerOf(victim.id);
    const refused = r.status === 400 || r.body?.migratedCount === 0;
    rec("C-04", "claiming twice transfers nothing the second time",
      refused && row?.user_id === parentUserId,
      `HTTP ${r.status} migrated=${r.body?.migratedCount} cookie before retry=${hadTokenBefore} owner unchanged=${row?.user_id === parentUserId}`);
  }

  // ------------------------------------------------------------------ C-06
  // Runs AFTER registration deliberately: on an anonymous session this is a
  // 401 from the auth middleware, which would pass a status check while proving
  // nothing about the body validation it is meant to exercise. (The first
  // version of this case did exactly that.)
  {
    const r = await victim.session.post("/api/assessments/migrate", { guestAssessmentIds: [] });
    rec("C-06", "an empty id list is rejected by validation, not by auth",
      r.status === 400 && typeof r.body?.message === "string",
      `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 60)}`);
  }

  // ------------------------------------------------------------------ C-07
  // The claim ACHIEVED something. A migratedCount of 1 that leaves the
  // assessment unreachable would satisfy every case above and still be a
  // feature that does not work -- this reads it back through the owner's own
  // API, not the database.
  {
    const mine = await victim.session.get("/api/assessments");
    const list = Array.isArray(mine.body) ? mine.body : mine.body?.assessments ?? [];
    const present = list.some((a) => a.id === victim.id);
    rec("C-07", "the claimed assessment is readable through the owner's API", present,
      `HTTP ${mine.status} items=${list.length}`);
  }
} finally {
  /**
   * The guest assessments created here are removed. The parent ACCOUNTS are
   * deliberately left behind: `child_profiles.guardian_user_id` references
   * users without a cascade, so deleting them means walking a fan-out of
   * child profiles, guardian consents and their own assessments in dependency
   * order — and a teardown that throws halfway, as the first version of this
   * one did, loses the suite's results entirely. Every account is tagged with
   * this run's id, and `build()` already leaves its own orgs and admins, so
   * this matches what the harness does elsewhere rather than inventing a
   * fragile exception.
   *
   * Each statement is independent: a failure in one must not skip the others
   * or crash the run after the assertions have already passed.
   */
  for (const [text, params] of [
    [`DELETE FROM assessments WHERE id = $1`, [victim.id]],
    [`DELETE FROM assessments WHERE guest_session_id IS NOT NULL AND user_id IS NULL
      AND id IN (SELECT id FROM assessments WHERE guest_session_id IS NOT NULL AND user_id IS NULL)
      AND created_at > NOW() - INTERVAL '10 minutes'`, []],
  ]) {
    try { await sql(text, params); } catch (e) { console.error("cleanup:", String(e.message).slice(0, 80)); }
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
