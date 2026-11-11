/**
 * SIGN-IN NAMES, ASSERTED THROUGH THE REAL ROUTE.
 *
 * `shared/username.test.ts` proves the rule. This proves the PRODUCT USES IT —
 * which is a different claim, and the one that was false before 2026-11-11:
 * `generateUsername` appended four random hex characters unconditionally, and
 * three hand-rolled collision loops at three call sites had drifted apart (one
 * retried with a fresh random suffix, one had no give-up branch at all and
 * would create an account with a username it had just confirmed was taken).
 *
 * Judged on the username in the RESPONSE and nothing else, because that is the
 * string a school administrator is given and has to read out to staff.
 *
 *   U-01  a Latin name becomes first.last, with NO suffix of any kind
 *   U-02  AN ARABIC NAME IS TRANSLITERATED, not erased. Before this it
 *         produced "..36ad", and without the random suffix it would have been
 *         the single character "."
 *   U-03  an accented Latin name keeps its letters — "José Pérez" was
 *         "jos.prez", with the accented vowels DELETED
 *   U-04  a second person of the same name is numbered readably
 *   U-05  and a third, so U-04 cannot pass against a scheme that only ever
 *         produces one alternative
 *
 * Uses `/api/superadmin/organizations/create-with-admin`, whose body field is
 * `organizationName` — `name` is answered "Organization name is required", and
 * a wrong PATH is answered 200 with the SPA's HTML, which is the trap
 * CLAUDE.md warns about. U-00 rules both out before anything else is believed.
 */
import { Session, SUPERADMIN } from "./fixtures.mjs";

const results = [];
const rec = (id, what, pass, note = "") => {
  results.push({ id, what, pass });
  console.log(`${pass ? "PASS " : "FAIL "} ${id.padEnd(5)} ${what.padEnd(58)} ${note}`);
};

const tag = Math.random().toString(36).slice(2, 7);
const sa = new Session(`uname-${tag}`);
await sa.login(SUPERADMIN.username, SUPERADMIN.password);

const made = [];

/** Creates a school and returns the admin username the route handed back. */
async function createAdmin(firstName, lastName, label) {
  const r = await sa.post("/api/superadmin/organizations/create-with-admin", {
    organizationName: `Uname ${label} ${tag}`,
    adminFirstName: firstName,
    adminLastName: lastName,
    adminEmail: `uname.${label}.${tag}@futurepath.test`,
    totalLicenses: 5,
    countryId: "uae",
    curriculum: "MOE National",
  });
  const orgId = r.body?.organization?.id;
  if (orgId) made.push(orgId);
  return { status: r.status, username: r.body?.admin?.credentials?.username ?? null, raw: r.body };
}

/** Four hex characters hanging off the end — the thing being removed. */
const hasHexSuffix = (u) => typeof u === "string" && /\.[0-9a-f]{4}$/.test(u);

try {
  // ----------------------------------------------------------------- U-00
  // The route is real and the body shape is right. Without this, every case
  // below could be asserting against the SPA catch-all or a 400.
  const latin = await createAdmin("Nasser", "Al Ali", "latin");
  rec("U-00", "the create route is real and answers 201 with credentials",
    latin.status === 201 && typeof latin.username === "string",
    `HTTP ${latin.status} username=${latin.username ?? JSON.stringify(latin.raw).slice(0, 60)}`);

  // ----------------------------------------------------------------- U-01
  rec("U-01", "a Latin name is first.last with no suffix",
    latin.username === "nasser.alali" && !hasHexSuffix(latin.username),
    `${latin.username}`);

  // ----------------------------------------------------------------- U-02
  // THE CASE THAT MATTERS. "..36ad" before; "." if the suffix had been
  // removed without transliteration.
  {
    const r = await createAdmin("ناصر", "العلي", "arabic");
    const u = r.username ?? "";
    rec("U-02", "an ARABIC name transliterates rather than vanishing",
      u === "nasr.alaly" && /^[a-z0-9.]+$/.test(u) && u.replace(/\./g, "").length > 0,
      `${u}`);
  }

  // ----------------------------------------------------------------- U-03
  // The old strip deleted the accented letter with its vowel: "jos.prez".
  {
    const r = await createAdmin("José", "Pérez", "accent");
    rec("U-03", "an accented name keeps its letters",
      r.username === "jose.perez", `${r.username}`);
  }

  // ----------------------------------------------------------------- U-04
  {
    const r = await createAdmin("Nasser", "Al Ali", "dup1");
    rec("U-04", "a second person of the same name is numbered",
      r.username === "nasser.alali2" && !hasHexSuffix(r.username), `${r.username}`);
  }

  // ----------------------------------------------------------------- U-05
  // The control for U-04: a scheme that answered every collision with the
  // same single alternative would pass U-04 and fail here.
  {
    const r = await createAdmin("Nasser", "Al Ali", "dup2");
    rec("U-05", "and a third keeps counting",
      r.username === "nasser.alali3", `${r.username}`);
  }
} finally {
  // Schools invented here must not be left behind: the superadmin metrics and
  // the catalogue counts other suites assert on would read them as real.
  for (const id of made) {
    await sa.del(`/api/superadmin/organizations/${id}`).catch(() => {});
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log(`FAILED: ${failed.map((f) => f.id).join(", ")}`);
  process.exit(1);
}
