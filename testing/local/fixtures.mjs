/**
 * Builds the fixtures docs/test-plan.md section 0.4 requires, through the
 * application's own API rather than by inserting rows.
 *
 * Going through the API means the setup is itself a test: if organization
 * creation, the consent gate or student enrolment is broken, this fails here
 * rather than producing a database that looks right and a green test run that
 * means nothing.
 *
 * Two organizations, because every cross-tenant test in section 6 needs an "A"
 * and a "B" and there is no way to fake the second one.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:5050";

export { Session };

export const SUPERADMIN = { username: "superadmin", password: "LocalTest!Super1" };

let ipCounter = 0;
// Randomised per process, not just per session: the counter alone gives every
// run the same first IP, so the superadmin's 5-attempts-per-15-minutes bucket
// is shared across runs and the third run of the day is locked out.
const IP_BASE = [10, 1 + Math.floor(Math.random() * 250), Math.floor(Math.random() * 250)];

class Session {
  constructor(name) {
    this.name = name;
    this.cookie = "";
    /**
     * Each session presents its own client IP.
     *
     * The login limiter allows 5 attempts per 15 minutes per IP, and it is
     * in-memory, so without this a test run of any size locks itself out and
     * the only reset is restarting the server. The limiter keys on req.ip,
     * which with `trust proxy` enabled comes from X-Forwarded-For -- so a
     * distinct header gives a distinct bucket.
     *
     * This deliberately does NOT weaken the control: the limiter runs exactly
     * as it does in production, and each simulated client is still held to 5.
     * It is also a working demonstration of why the proxy-addr advisory
     * mattered -- whoever controls this header controls the rate-limit bucket.
     */
    this.clientIp = `${IP_BASE[0]}.${IP_BASE[1]}.${IP_BASE[2]}.${(++ipCounter % 250) + 1}`;
  }
  async req(method, path, body) {
    // The CSRF middleware is double-submit: a csrf_token cookie must be
    // echoed in the x-csrf-token header on every state-changing request. A
    // browser-driven test gets this from the app's own fetch wrapper; an
    // API-driven one has to do it by hand.
    const csrf = (this.cookie.match(/(?:^|; )csrf_token=([^;]+)/) || [])[1];
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        "x-forwarded-for": this.clientIp,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const pair = c.split(";")[0];
      const key = pair.split("=")[0];
      const kept = (this.cookie ? this.cookie.split("; ") : []).filter(
        (x) => x.split("=")[0] !== key,
      );
      kept.push(pair);
      this.cookie = kept.join("; ");
    }
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
    return { status: res.status, body: json };
  }
  get(p) { return this.req("GET", p); }
  post(p, b) { return this.req("POST", p, b); }
  patch(p, b) { return this.req("PATCH", p, b); }
  del(p) { return this.req("DELETE", p); }

  async login(username, password) {
    // Any GET first, to be issued the csrf_token cookie. Login itself is
    // exempt from the check (it establishes the session, so there is no prior
    // token), but everything after it is not.
    await this.get("/api/auth/user");
    const r = await this.post("/api/login/username", { username, password });
    if (r.status !== 200) throw new Error(`login failed for ${username}: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return r;
  }
}

const must = (r, what) => {
  if (r.status >= 400) throw new Error(`${what} -> ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
  return r.body;
};

/**
 * A short id per invocation. The fixtures are re-runnable rather than
 * idempotent: organization creation mints a random admin password and returns
 * it once, so a second run cannot recover the first run's credentials and
 * "reuse if present" would mean fixtures that exist but cannot be logged into.
 * Unique names sidestep that; surplus organizations are harmless, and a truly
 * clean slate comes from rebuilding the database with schema-push.mjs.
 */
const RUN = Math.random().toString(36).slice(2, 7);

export async function build() {
  const sa = new Session("superadmin");
  await sa.login(SUPERADMIN.username, SUPERADMIN.password);

  const orgs = {};
  for (const [tag, name] of [["A", `Al Noor Academy ${RUN}`], ["B", `Falcon International School ${RUN}`]]) {
    const created = must(
      await sa.post("/api/superadmin/organizations/create-with-admin", {
        organizationName: name,
        totalLicenses: 50,
        isUnlimitedLicenses: false,
        countryId: "uae",
        // UAE's curricula are ["MOE National", "British", "American", "IB"] --
        // there is no "MOE". Organization creation accepts a curriculum the
        // country does not offer, and a school created that way can never
        // match a subject, so the contribution feature is dead for it. Using
        // the real value here so the fixtures build a school that works.
        curriculum: "MOE National",
        adminFirstName: `Admin${tag}`,
        adminLastName: "Test",
        adminEmail: `admin.${tag.toLowerCase()}.${RUN}@futurepath.test`,
        adminPhone: "+971500000000",
        adminUsername: `orgadmin${tag.toLowerCase()}${RUN}`,
      }),
      `create org ${tag}`,
    );

    const orgId = created.organization?.id ?? created.id ?? created.organizationId;
    const adminPassword = created.admin?.credentials?.password;
    const adminUsername = created.admin?.credentials?.username ?? `orgadmin${tag.toLowerCase()}${RUN}`;
    if (!orgId) throw new Error(`org ${tag}: no id in ${JSON.stringify(created).slice(0, 300)}`);
    if (!adminPassword) throw new Error(`org ${tag}: no admin password in ${JSON.stringify(created).slice(0, 300)}`);

    orgs[tag] = { tag, name, orgId, adminUsername, adminPassword, students: [] };
  }

  // Each admin consents for its own organization, then enrols students. The
  // consent gate fails closed, so enrolment before consent is expected to 403 --
  // that is test O-03 and is asserted in the suite, not here.
  for (const tag of ["A", "B"]) {
    const o = orgs[tag];
    const s = new Session(`orgadmin${tag}`);
    await s.login(o.adminUsername, o.adminPassword);
    o.session = s;

    // attestationText is required and is stored hashed: the endpoint pins the
    // exact wording the admin saw, so a consent record can never be read back
    // without knowing what was agreed to. Using the real strings from the
    // locale files keeps the fixture honest -- a placeholder here would record
    // a consent to wording no admin ever read.
    const orgsLocale = await (await fetch(`${BASE}/locales/en/orgs.json`)).json().catch(() => null);
    const attestationText = orgsLocale
      ? `${orgsLocale.consentProcessing ?? ""}\n${orgsLocale.consentGuardian ?? ""}`.trim()
      : "";
    must(await s.post("/api/my-organization/consent", {
      consentsToProcessing: true,
      attestsGuardianConsent: true,
      attestationText: attestationText || "LOCAL FIXTURE: consent attestation wording unavailable",
      locale: "en",
    }), `consent ${tag}`);

    for (let i = 1; i <= 2; i++) {
      const r = must(await s.post(`/api/admin/organizations/${o.orgId}/members`, {
        fullName: `Student ${tag}${i}`,
        studentName: `Student ${tag}${i}`,
        grade: "10",
        dateOfBirth: "2010-05-0" + i,
        studentGender: i === 1 ? "male" : "female",
        passwordComplexity: "medium",
      }), `enrol student ${tag}${i}`);
      o.students.push({
        username: r.user?.username ?? r.username,
        password: r.password ?? r.credentials?.password,
        userId: r.user?.id ?? r.userId ?? r.member?.userId,
        memberRow: r.member ?? null,
        memberId: r.member?.id ?? r.id,
      });
    }
  }

  return { sa, orgs, Session, BASE };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { orgs } = await build();
  for (const tag of ["A", "B"]) {
    const o = orgs[tag];
    console.log(`\norg ${tag}: ${o.name}  id=${o.orgId}`);
    console.log(`  admin: ${o.adminUsername} / ${o.adminPassword}`);
    for (const s of o.students) console.log(`  student: ${s.username} / ${s.password}  userId=${s.userId}`);
  }
}
