# Test run — 6 November 2026

Executed against the real application on a real PostgreSQL, in the offline
harness described in `testing/local/README.md`. Commit `53827d3`.

**76 tests run: 76 passed, 0 failed, 10 blocked.**

| Section | Pass | Fail | Blocked | Suite |
|---|---|---|---|---|
| 6. Cross-tenant | 22 | 0 | 0 | `cross-tenant.mjs` |
| 1. Guest | 14 | 0 | 0 | `guest.mjs` |
| 4. School student | 12 | 0 | 0 | `student.mjs` |
| 5 + 7. Org admin & superadmin | 19 | 0 | 0 | `admin.mjs` |
| 2 + 3. Conversion & parent | 12 | 0 | 3 | `parent.mjs` |
| 8. Cross-cutting | 9 | 0 | 4 | `crosscutting.mjs` |

Re-run any of them with `node testing/local/<suite>.mjs` while the harness is
up (`crosscutting.mjs` needs `npx tsx`, because it imports the email builder
from TypeScript source).

---

## What this run does NOT cover

Not scope notes — **the parts of the product that remain untested**, and the
reason each is.

| Untested | Why |
|---|---|
| Google and Microsoft sign-in | Needs a public callback URL; nothing routes out of the sandbox |
| Payment, webhooks, tier upgrade | `api.stripe.com` unreachable |
| Email delivery | `api.resend.com` unreachable. Email *content* was tested; arrival was not |
| File upload acceptance, share links | Writing a file reaches DigitalOcean Spaces, unreachable |
| Path traversal with an *allowed* extension | Refused names never reach path handling; allowed ones reach storage |
| PDF generation on real data | Needs a completed paid assessment |
| Production cookie flags, static serving | The harness runs in development mode, because `secure: NODE_ENV === 'production'` would refuse to set the session cookie over plain http |
| Render, Neon, TLS, CDN | Environment, not code |

**A pass here is a pass for the code, not for the deployment.** The near-miss
earlier this week — production booting only because the deploy installs
devDependencies — lived entirely in that gap.

---

## Findings

### 1. Two consent models for the same age group

Not a bug; the product decision that is still open. Both captured live.

**School student** — notified, never asked:

> "Al Noor Academy set up this assessment for you and agreed to the terms on
> your behalf. You can read them here: Terms of Use and Privacy Policy."

No tick-box anywhere, in either language. Country and curriculum appear as
plain text under "Set by your school", with the reason given — *"Your school
chose the country and curriculum for everyone it enrols, so these are not
yours to change. Ask your school administrator if either looks wrong."* There
is no form control to re-enable from devtools.

**Guest aged 15** — ticks the box themselves, beneath:

> "Note: Users under 18 require parental or institutional consent."

Nothing implements that sentence. The code says so itself
(`DemographicsStep.tsx:379`): *"UNCHANGED, AND STILL UNBACKED… no parental
mechanism exists behind it."*

Same product, same ages, opposite treatment. The lawyer question decides which
is right; until it is answered, sections 2 and 3 test a flow that may change.

### 2. `isAdmin` means superadmin

`GET /api/admin/organizations/:id` is guarded by `isAdmin`, which resolves to
superadmin only — email in `SUPERADMIN_EMAILS`, or `role === "superadmin"`. The
handler then fetches **any** organization by id with no `organizationId` check
at all.

Not currently exploitable: an org admin gets 403. But the cross-tenant pass on
that endpoint is a **role** gate, not a scoping one, and it holds only while
`isAdmin` stays superadmin-only. A middleware named `isAdmin` that means
superadmin is a trap for whoever edits it next.

**Suggested:** rename to `isSuperadmin`, or add the `organizationId` check so
the handler is safe regardless of who reaches it.

### 3. Rejected uploads returned 500 — fixed in `53827d3`

multer's `fileFilter` refusals and `LIMIT_FILE_SIZE` both reached Express's
default error handler. A caller sending a `.exe` was told the server had
broken, and every rejected upload filed itself as a server fault in error
monitoring. Now 400 with `FILE_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE`.

### 4. The migration runner cannot build a fresh environment

`index.ts:211` awaits `runMigrations()` with no catch, so a failed migration
kills the boot — which is why a running production app is proof that all 28
applied, 026 included. But migration 013 re-adds a CHECK constraint that
`drizzle-kit push` has already created, so **a fresh environment built with
`db:push` and then started will not boot.** It bit this harness immediately.

Existing environments are unaffected. The next staging rebuild is not.

### 5. "0 assessments completed" on the landing page

Honest, unlike the testimonial that was removed, but it advertises emptiness to
every visitor. Same class of decision.

---

## What was confirmed working

Each of these was proved by the control doing its job, usually by blocking the
test first.

- **Cross-tenant isolation.** 22 reaches from school A to school B — roster,
  assessment, recommendations, PDF, quiz answers, files, delete, enrolment,
  export, password reset, analytics — all refused. Analytics stays A-scoped
  whether B's id is passed in the query or no filter is given. A student cannot
  read a peer in their own school either, tested against a real assessment.
- **The consent gate fails closed.** A new school cannot enrol anyone before
  recording consent: 409, with a message naming what is missing.
- **Date of birth is mandatory for students** — the field that establishes the
  student is a minor.
- **Privilege escalation on email change is blocked.** Superadmin status is
  recomputed per request from the user's email, so writing an email is an
  escalation surface: a reserved address is refused 403 `RESERVED_EMAIL`,
  case-insensitively, and a duplicate 409 `EMAIL_TAKEN`.
- **Consent is enforced server-side**, not only in the form: registration with
  consent withheld is refused with "Consent to processing must be affirmed."
- **Password reset does not leak account existence** — identical status and
  body for a known and an unknown address.
- **CSRF** is enforced, including for guests (double-submit; the test harness
  has to carry the token).
- **Login rate limiting** is real — 5 per 15 minutes per IP. It locked the test
  runner out twice.
- **Zod validation** rejects malformed write bodies with field-level errors.
- **The upload allowlist checks MIME *and* extension** — a `.csv` with an
  executable MIME type and an `.exe` with a CSV MIME type are both refused.
- **No API key material** in the superadmin prompt-template payload.
- **Quiz length is 15 at 3, 4 and 5 subjects** — measured by generating three
  real assessments, not taken on trust.
- **Arabic**: RTL with no horizontal overflow, no unresolved i18n keys across
  nine routes, all ten namespaces key-aligned, and the password-reset email is
  RTL with the current brand and the sticky-note styling intact.

---

## A note on the failures that were not failures

Five "findings" in the first runs were defects in the tests, not the product.
They are recorded because each is a trap the next person will hit:

1. **The SPA catch-all serves `index.html` for any unmatched path**, so a
   mistyped API URL returns 200 with HTML and reads exactly like a wide-open
   endpoint. Three "holes" were typos. The harness now detects HTML and reports
   a broken test.
2. **`GET /api/recommendations` answers `200 []` rather than 403** for a
   non-owned assessment, deliberately — a 403-vs-empty difference would confirm
   which assessment ids belong to real students. Correct anti-enumeration
   design, nearly reported as a leak.
3. **Uploads are superadmin-gated**, so testing them as an org admin produced
   403 "Admin access required" and recorded the allowlist as working on
   evidence that said nothing about it.
4. **Arabic has six i18next plural categories to English's two**, so
   `_two`/`_few`/`_many` keys exist only in `ar`. Reported as six missing
   English keys on the first pass.
5. **The consent-gate test passed on a missing-field error** before the payload
   was corrected, proving nothing about consent.

The pattern in all five: a test can pass or fail for a reason that has nothing
to do with what it claims to measure. Where a result here is surprising, the
first question is whether the test is right.
