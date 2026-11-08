/**
 * CHECKOUT PREFLIGHT — refusing before the card, not after it.
 *
 * /api/checkout/complete has two refusals that only run once Stripe has
 * already charged the buyer: an SSO email with no password (400 "login
 * first") and a buyer who already owns a school (409, from
 * createGroupPurchaseTransaction). For a group purchase that is a school-sized
 * charge taken for nothing. /api/checkout/preflight answers the same two
 * questions before the card is confirmed.
 *
 * WHAT EACH CASE MEASURES, and why it is not obvious:
 *
 *   X-00  the route EXISTS. The SPA catch-all answers 200 with HTML for any
 *         unmatched URL, so every other case here could "pass" against a
 *         route that was never registered. This pins a real JSON body and
 *         proves a deliberately misspelled sibling path behaves differently.
 *   X-01  a brand-new email is ALLOWED. Without this, a preflight hardcoded to
 *         refuse everything passes every other case in this file.
 *   X-02  an SSO account (password_hash NULL) is refused, with the code that
 *         says WHICH guard refused
 *   X-03  ...at studentCount 1 as well, because /complete's OAuth refusal is
 *         not scoped to group purchases either
 *   X-04  an existing LOCAL account with no school is ALLOWED. /complete
 *         serves that buyer today, so refusing it here would be a new product
 *         rule smuggled in as a bug fix
 *   X-05  a buyer who already owns a school is refused, and told which school
 *   X-06  ...but NOT at studentCount 1, because the transaction that throws
 *         only runs for a group purchase. Over-refusing here would block an
 *         individual top-up that works
 *   X-07  an AUTHENTICATED school owner is refused too. This is the hole that
 *         is easy to miss: /complete's logged-in branch skips the OAuth check
 *         entirely, but still reaches createGroupPurchaseTransaction, so a
 *         logged-in owner buying a second time is charged and then met with
 *         the 409 like anybody else
 *   X-08  ...and that same owner may still buy an individual licence
 *   X-09  a request with no email is refused with a JSON error, not a 200
 *   X-10  the email is matched case- and whitespace-insensitively. A buyer who
 *         capitalises the address they registered with would otherwise sail
 *         past both guards and be charged
 *
 * Every assertion reads the response BODY. A status alone proves nothing here.
 */
import { build, Session, SUPERADMIN } from "./fixtures.mjs";

const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(6)} ${what.padEnd(58)} ${note}`);
};

/** One connection per query: PGlite allows a single one, and holding it open
 *  across the HTTP calls below starves the application. */
async function sql(text, params = []) {
  const { Client } = await import("pg");
  const c = new Client({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${process.env.PGLITE_TCP_PORT ?? 55432}/postgres`,
  });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

const { orgs } = await build();
const tag = Math.random().toString(36).slice(2, 6);

/** A guest session still needs the csrf_token cookie a GET issues. */
async function guest() {
  const s = new Session(`pf${tag}${Math.random().toString(36).slice(2, 5)}`);
  await s.get("/api/auth/user");
  return s;
}

const preflight = async (session, body) => session.post("/api/checkout/preflight", body);

/**
 * THE SSO FIXTURE, INSERTED DIRECTLY, because the API cannot produce it: an
 * account with password_hash NULL is what Google and Microsoft registration
 * leaves behind, and there is no Google here. NULL is the real state, not a
 * convenience — nothing about it is tidied to make a case pass.
 */
const ssoEmail = `sso.buyer.${tag}@futurepath.test`;
const localEmail = `local.buyer.${tag}@futurepath.test`;
const freshEmail = `nobody.${tag}@futurepath.test`;

await sql(
  `INSERT INTO users (email, first_name, last_name, oauth_provider, oauth_provider_id, password_hash)
   VALUES ($1, 'Sso', 'Buyer', 'google', $2, NULL)`,
  [ssoEmail, `g-${tag}`],
);
// A local account with a password and NO organization: the branch /complete
// serves today by incrementing licences.
await sql(
  `INSERT INTO users (email, first_name, last_name, password_hash)
   VALUES ($1, 'Local', 'Buyer', '$2b$10$notarealhashnotarealhashnotarealhashnotarealhashnotar')`,
  [localEmail],
);

const ownerEmail = (
  await sql(`SELECT u.email FROM users u JOIN organizations o ON o.admin_user_id = u.id WHERE o.id = $1`, [orgs.A.orgId])
)[0]?.email;
if (!ownerEmail) throw new Error("fixture: org A has no admin_user_id -> owner email; cannot test ORG_EXISTS");

try {
  // ---------------------------------------------------------------- X-00
  {
    const g = await guest();
    const real = await preflight(g, { email: freshEmail, studentCount: 50 });
    // A JSON object with an `ok` boolean can only have come from the handler.
    const isJson = real.status === 200 && real.body && typeof real.body === "object" && typeof real.body.ok === "boolean";
    const bogus = await g.post("/api/checkout/preflightX", { email: freshEmail, studentCount: 50 });
    const bogusIsNotOurs = !(bogus.body && typeof bogus.body === "object" && typeof bogus.body.ok === "boolean");
    rec("X-00", "route is real; misspelled sibling does not answer like it", isJson && bogusIsNotOurs,
      `real=${real.status}/${typeof real.body} bogus=${bogus.status}/${typeof bogus.body === "string" ? "html" : "json"}`);
  }

  // ---------------------------------------------------------------- X-01
  {
    const r = await preflight(await guest(), { email: freshEmail, studentCount: 50 });
    rec("X-01", "brand-new email is allowed (not a refuse-everything stub)", r.body?.ok === true,
      JSON.stringify(r.body).slice(0, 90));
  }

  // ---------------------------------------------------------------- X-02
  {
    const r = await preflight(await guest(), { email: ssoEmail, studentCount: 50 });
    rec("X-02", "SSO account refused, as LOGIN_REQUIRED", r.body?.ok === false && r.body?.code === "LOGIN_REQUIRED",
      JSON.stringify(r.body).slice(0, 90));
  }

  // ---------------------------------------------------------------- X-03
  {
    const r = await preflight(await guest(), { email: ssoEmail, studentCount: 1 });
    rec("X-03", "SSO refusal is not scoped to group purchases", r.body?.ok === false && r.body?.code === "LOGIN_REQUIRED",
      JSON.stringify(r.body).slice(0, 90));
  }

  // ---------------------------------------------------------------- X-04
  {
    const r = await preflight(await guest(), { email: localEmail, studentCount: 50 });
    rec("X-04", "existing local account with no school still allowed", r.body?.ok === true,
      JSON.stringify(r.body).slice(0, 90));
  }

  // ---------------------------------------------------------------- X-05
  {
    const r = await preflight(await guest(), { email: ownerEmail, studentCount: 50 });
    rec("X-05", "school owner refused as ORG_EXISTS, naming the school",
      r.body?.ok === false && r.body?.code === "ORG_EXISTS" && r.body?.organizationName === orgs.A.name,
      JSON.stringify(r.body).slice(0, 110));
  }

  // ---------------------------------------------------------------- X-06
  {
    const r = await preflight(await guest(), { email: ownerEmail, studentCount: 1 });
    rec("X-06", "owner may still buy an individual licence", r.body?.ok === true,
      JSON.stringify(r.body).slice(0, 90));
  }

  // ---------------------------------------------------------------- X-07
  {
    const s = new Session(`pfOwner${tag}`);
    await s.login(orgs.A.adminUsername, orgs.A.adminPassword);
    // A DIFFERENT email in the body than the account's own, deliberately: the
    // logged-in branch of /complete charges the session's user regardless of
    // what was typed, so the check must follow the session, not the form.
    const r = await preflight(s, { email: freshEmail, studentCount: 50 });
    rec("X-07", "logged-in owner refused by session, not by typed email",
      r.body?.ok === false && r.body?.code === "ORG_EXISTS",
      JSON.stringify(r.body).slice(0, 110));

    // -------------------------------------------------------------- X-08
    const r1 = await preflight(s, { email: freshEmail, studentCount: 1 });
    rec("X-08", "logged-in owner may still buy an individual licence", r1.body?.ok === true,
      JSON.stringify(r1.body).slice(0, 90));
  }

  // ---------------------------------------------------------------- X-09
  {
    const r = await preflight(await guest(), { studentCount: 50 });
    rec("X-09", "missing email -> 400 with a JSON message", r.status === 400 && typeof r.body?.message === "string",
      `${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }

  // ---------------------------------------------------------------- X-10
  {
    const shouted = `   ${ownerEmail.toUpperCase()}   `;
    const r = await preflight(await guest(), { email: shouted, studentCount: 50 });
    rec("X-10", "email matched case- and whitespace-insensitively",
      r.body?.ok === false && r.body?.code === "ORG_EXISTS",
      JSON.stringify(r.body).slice(0, 90));
  }
} finally {
  // A suite that invents rows must remove them again: these two emails are
  // unique-constrained, so leaving them behind makes the next run's insert fail
  // and reads exactly like a schema fault.
  await sql(`DELETE FROM users WHERE email = ANY($1)`, [[ssoEmail, localEmail]]);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
