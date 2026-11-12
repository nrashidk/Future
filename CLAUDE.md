# CLAUDE.md — how to work in this repository

This replaces the April 2026 security-audit brief that used to live here. That
brief described a read-only audit in phases, told you not to modify any file,
and listed findings to go and confirm. The audit is finished, its findings are
fixed, and following those instructions now would stop you doing any work at
all. What was worth keeping from it is kept below.

## The product

A career-guidance platform for school students, futurepath.ae. A student
answers an interest and values questionnaire, sits a short subject quiz, and
gets a report matching them to careers, weighted by their subjects, their
interests, and their country's national priorities.

Stack: React + Vite + TypeScript (client), Express + TypeScript (server),
Drizzle ORM on Neon serverless Postgres, Passport (local + Google +
Microsoft), express-session with connect-pg-simple, Stripe, Resend, Anthropic
API for report narratives, Puppeteer for PDFs, Multer for uploads. Hosted on
Render. Bilingual English/Arabic throughout, including the PDF.

## ⚠️ The users are minors

**End users are school students aged 13–18.** The system stores their names,
schools, grade levels, assessment answers and career-personality profiles.
School admins create and manage student accounts on their behalf.

Two consequences, both binding:

- This is minors' personal data under UAE PDPL (Federal Decree-Law 45/2021). A
  data-exposure bug is high severity by default.
- **Escalate any authorization or access-control finding by one severity
  level.** An IDOR that would be HIGH on an adult product is CRITICAL here.

There is a data-subject registry at `server/services/subjectAccess.ts` with a
test that fails when a new column references a person and has not been
classified as that person's data or someone else's action. It has caught real
omissions twice. When it fails, classify the column — do not silence it.

## Do not touch without being asked

- **`server/auth.ts`** — bcrypt hashing, rate limiting, account lockout,
  password complexity, session regeneration on login, cookie flags. Reviewed
  and correct. Flag a genuine bug if you find one; do not restyle or refactor.
- Stripe webhook signature verification.
- CSRF middleware wiring order in `server/routes.ts` (auth → CSRF → routes is
  deliberate).
- DOMPurify usage, helmet, Drizzle parameterized queries.

Superadmin status is recomputed from the database on every request, by email
against `SUPERADMIN_EMAILS` or by role, and never read from the session. **Any
endpoint that can write a user's email is a privilege-escalation surface** —
treat changes there as security-critical.

`isSuperadminOnly` (in `server/middleware/auth.middleware.ts`) means nationwide
superadmin, not "any admin". `isOrgAdmin` is the one scoped to a single school.
Routes behind the former do no organization scoping and need none; do not widen
one to admit org admins without adding that scoping.

## replit.md — context, not truth

`replit.md` describes the intended architecture and lists security controls a
previous builder claimed to have implemented. Read it to understand what each
part is *supposed* to do, then verify against the code. A claim in there is an
allegation, never evidence. The app no longer runs on Replit.

## Working rules

1. **Run real tools. Do not reason from the code alone.** Most of the genuine
   findings in this repo came from executing something, not from reading.
2. **Cite file and line** for every finding.
3. **If you are unsure whether something is a bug, say so and leave it alone.**
   Label it for human review rather than "fixing" it.
4. **One issue per commit.** Small, reviewable diffs. Never bundle unrelated
   changes, never do a sweeping "refactor for security".
5. **Deploying straight to production is the owner's deliberate choice right
   now, and that changes the day a real school signs up.** Production is
   `ep-floral-rice-...`, staging is `ep-soft-recipe-...`, and a staging deploy
   target does exist. It is not being used because production holds only the
   owner's own test data — no real schools, no real students — so the extra
   hop buys nothing and staging had drifted ten migrations behind by
   2026-11-08.

   Do not argue for staging-first while that is true. It was argued at the
   owner this morning on the strength of the old wording here, and it cost him
   the better part of an hour.

   **THE TRIGGER: the first real school with real students.** From then on the
   old rule applies in full — reversible migration, dry-run against data
   shaped like production, before/after counts shown — and it needs enforcing
   rather than writing down, because migrations apply themselves at boot and
   Render deploys on every push to `main`. Nothing currently stops a migration
   reaching live data within one deploy. A risky change has to wait on a
   branch; leaving it unrun is not a hold.

   Write the migration reversibly and dry-run it in the harness regardless.
   That part is cheap and has caught real faults with no production data
   involved at all.
6. Never add a second SPF record to the domain. Never disable TLS verification
   or unset `HTTPS_PROXY`.

## The offline test harness

`testing/local/` runs the whole application with no network: PGlite (Postgres
in WASM) behind a TCP server, bridged to a WebSocket that the app's own Neon
driver connects to unmodified. No production code changes to support it.

```
rm -rf ./.pgdata
PGLITE_DIR=./.pgdata node testing/local/schema-push.mjs
PGLITE_DIR=./.pgdata npx tsx testing/local/up.ts     # serves on :5050
node testing/local/<suite>.mjs
```

Suites: `guest`, `student`, `parent`, `admin`, `cross-tenant`, `report`,
`username`,
`progression`, `licences`, `new-country`, `contribution`, `crosscutting`,
`school-setup`, `question-gaps`, `peer-review`, `grants`, `pricing`,
`org-admin`, `checkout-preflight`, `school-lock`, `webhook-idempotency`,
`llm-gate`, `guest-claim`, `admin-writes`, `webhook-group-backstop`,
`superadmin-writes`, `country-writes`, `setup-invite`, `school-setup-link`,
`setup-stage`, `superadmin-delete-user`, `resend-webhook`, `guest-sweep`,
`guest-identity`, `invoices`, `invoice-pdf`, `body-shape`,
`contribution-claim`, `guest-rate`, `repeat-grade`, plus
`invoice-send`, plus
`migration-029-dryrun`, `migration-030-dryrun`, `migration-032-dryrun`,
`migration-033-dryrun`, `migration-034-dryrun`, `migration-035-dryrun`,
`migration-036-dryrun`, `migration-037-dryrun`, `migration-038-dryrun` and
`migration-039-dryrun`, plus `premium-solo`, `individual-licences` and
`migration-041-dryrun`.

`webhook-idempotency`, `webhook-group-backstop` and `setup-invite` need two
environment
variables, on `up.ts` AND on themselves, or every case is answered by the
route's own 503/500 and proves nothing. They refuse to run without the second
rather than passing:

```
PGLITE_DIR=./.pgdata STRIPE_SECRET_KEY=sk_test_dummy \
  STRIPE_WEBHOOK_SECRET=whsec_localtestsecret npx tsx testing/local/up.ts
STRIPE_SECRET_KEY=sk_test_dummy STRIPE_WEBHOOK_SECRET=whsec_localtestsecret \
  node testing/local/webhook-idempotency.mjs
```

`resend-webhook` and `invoice-send` need `RESEND_WEBHOOK_SECRET` the same way,
on `up.ts` AND on themselves, and refuse to run without it — the route answers 503 with no secret,
so every case would "pass" against a handler it never reached:

```
PGLITE_DIR=./.pgdata RESEND_WEBHOOK_SECRET=whsec_bG9jYWx0ZXN0c2VjcmV0 \
  npx tsx testing/local/up.ts
RESEND_WEBHOOK_SECRET=whsec_bG9jYWx0ZXN0c2VjcmV0 \
  node testing/local/resend-webhook.mjs
```

**Never run anything that reads the licence ledger after
`migration-029-dryrun` on the same database.** 029's suite ends with its DOWN,
which DROPS `license_consumptions`; `migration-041-dryrun` run next fails with
"relation does not exist", which reads like a broken migration and is not one.

**Run `migration-036-dryrun` AFTER `migration-035-dryrun`, never before.** 035's
suite ends by re-running its own UP, which leaves `school_setup_tokens` without
036's four delivery columns — so anything reading delivery status after a 035
run fails for that reason and not a real one. 036's suite leaves them in place.

`migration-034-dryrun`, `migration-035-dryrun` and `migration-036-dryrun`
EXECUTE the .sql file,
which nothing else does —
`schema-push` marks every migration applied without running it, so a syntax
error in a migration first runs at production boot, where a failure is fatal.
It also runs the DOWN block from the file's trailing comment, since that block
is written for a human to paste and nothing else ever checks that it works.

`grants` runs migration 032 itself before asserting anything: schema-push
creates the tables and marks migrations applied **without running them**, so
the backfill never happens in the harness and schools created by `seed.ts` have
no ledger row. Reconciliation then correctly flags a state that only exists
here. Any suite that asserts on reconciliation needs to do the same.
`testing/local/README.md` has the details.

`invoice-send` needs, on `up.ts`, the `INVOICE_*` supplier variables
(`INVOICE_LEGAL_NAME` and `INVOICE_LEGAL_NAME_AR` included) as
well — the send route refuses with `SUPPLIER_DETAILS_MISSING` rather than
mailing a school a bill carrying `[YOUR IBAN]`, so without them E-06 onward
fail for that reason and not a real one.

`invoice-pdf` needs a Chromium: `PUPPETEER_EXECUTABLE_PATH` on `up.ts`, the
same one `report.mjs` needs. It reads every response as BYTES — `res.text()`
on a PDF reports a valid `%PDF` header and ~200 bytes for a megabyte file —
and counts pages from the rendered file, because the report's pagination bug
was in the CSS reading as correct while a selector matched the wrong sibling.

**A CHECK CONSTRAINT THAT LIVES ONLY IN THE .sql DOES NOT EXIST IN THE
HARNESS.** `schema-push` builds the tables from the DRIZZLE definitions and
marks every migration applied without running it — so a constraint written in
`server/migrations/NNN.sql` and not also declared on the drizzle table is live
in production and absent here. The gap is invisible and it lies in the
dangerous direction: a suite passes against a table that accepts a row
production would refuse. Found on 2026-11-10 by mutation — removing the
invoice transition guard let a DRAFT be marked paid, and
`invoices_issued_has_date` should have refused that row at the database and
did not. **Declare checks in BOTH places, with the same constraint name** so
`db:push` sees no drift; `invoices` and `organization_members` both do.

**THE SAME IS TRUE OF INDEXES, and one was missing.** Found on 2026-11-10 by
inserting two rows: `school_setup_tokens_provider_msg_idx` (unique, partial)
existed only in `036.sql`, so production refused a duplicate
`provider_message_id` with 23505 and the harness accepted it. Every assertion
in `resend-webhook.mjs` had been passing against a table more permissive than
the real one. Both tables that carry delivery columns now declare the index on
the drizzle table too, with `.where()` matching the .sql exactly.

**`server/migrations/` is for migrations and nothing else.** The runner
applies EVERY `.sql` file in that directory at boot and records it as applied,
and a failure is fatal — so a stray file there is an outage, not a warning. A
read-only verification script dropped in beside the migrations was picked up on
the next boot, and `psql` meta-commands like `\echo` are rejected by the pg
driver with a syntax error. Verification and one-off SQL belong in `scripts/`.

**A suite that invents countries must delete them again.** `pricing` and
`migration-033-dryrun` both create countries, and leaving them behind made
`school-setup`'s catalogue count report 247 of 250 and fail — a true statement
about a state another suite created, which reads exactly like a catalogue bug.

**Run suites one at a time with a pause between them.** PGlite allows a single
connection, so back-to-back suites exhaust it and fail with "Connection
terminated unexpectedly", which reads exactly like a schema fault and is not
one. A suite that fails in a batch and passes alone was never broken. Suites
also share one database, so state accumulates — confirm any failure on a fresh
`.pgdata` before believing it.

## How tests lie here — read this before trusting a pass

Every item below is a false pass that was actually produced in this repo and
caught afterwards. A green test here means less than you think.

- **The SPA catch-all returns 200 with HTML for any unmatched URL.** A test
  that hits a misspelled route gets 200 and "passes". Three nonexistent IDOR
  holes were once reported this way. Assert on the response body, not the
  status.
- **Some endpoints return `200 []` instead of 403 on purpose** —
  anti-enumeration. Reading that as a leak is wrong; so is reading it as proof
  of access.
- **Check what the guard you are testing actually guards.** An upload
  allowlist "verified" as an org admin proved nothing: uploads are
  superadmin-gated, so the 403 came from the role check and never reached the
  allowlist.
- **Never ask the client to claim something the server derives.** A premium-cap
  test that sent a tier in the request body tested nothing.
- **Read binary responses as bytes.** `res.text()` on a PDF reports a valid
  `%PDF` header and 200 bytes for a one-megabyte file.
- **An assertion that passes on an error is not an assertion.** A consent-gate
  test once passed on a missing-field validation error.
- **A webhook fixture missing one metadata field proves nothing, with a 200.**
  `handlePaymentIntentSucceeded` returns early — silently, 200 — on a missing
  `userId`, and again if `expectedAmount` does not equal `amount`. A fixture
  without `userId: "guest"` therefore never reaches the grant at all. The first
  draft of `webhook-group-backstop.mjs` did that: signature verification passed,
  the event claim was written, `duplicate: true` came back on redelivery, and
  six assertions failed for the wrong reason while one passed. Build the fixture
  from what `create-payment-intent` and `stamp-buyer` actually write, and make a
  case assert something POSITIVE happened, not just a status.
- **Do not "correct" a fixture to make a new test pass.** Deliberately invalid
  fixture data was once tidied up, and the test then passed while asserting
  nothing.
- **A pass on HTTP 404 is a pass on nothing.** A test that a removal changed no
  balances passed because the route path was wrong and nobody was removed.
- **One branch is not the behaviour.** A licence guard scoped to school
  students was tested with a school student, returned 403, and was written up
  as "the feature does not work for anyone". It worked for everyone else.
- **PGlite has ONE connection and the APP holds it.** A suite that opens a
  client per statement exhausts it partway with `read ECONNRESET`; a suite that
  keeps one client open for its whole run starves the server instead, and
  superadmin login answers 500. `setup-stage.mjs` builds each school in ONE
  multi-statement call for exactly this reason. Neither failure names its
  cause, and a server left in that state stays broken until it is restarted —
  so restart `up.ts` before believing the next failure.
- **A PARAMETERISED JS `Date` IS MIS-BOUND BY PGLITE, so a timestamp fixture
  written that way lies.** Proved with a temp table holding one past and one
  future row: `WHERE exp > NOW()` returns the future row correctly, and so does
  `WHERE exp > $1::timestamp` with an ISO string — but `WHERE exp > $1` with a
  JS Date returns NOTHING. Writing the column the same way is worse: an
  `expires_at` inserted as a past JS Date was read back by the database as
  still live, and `school-setup-link.mjs` reported an expired sign-in link
  being accepted. That was the FIXTURE, not the product — the routes read
  through drizzle, which serialises timestamps itself, and the identical
  `gt(expiresAt, new Date())` in `password-reset.routes.ts` works against real
  Postgres. **Write timestamps in a suite as SQL (`NOW() - INTERVAL '1 hour'`),
  never as a bound Date**, and confirm any expiry failure against the real
  product path before believing it.
- **A RACE CANNOT BE TESTED IN THIS HARNESS, and a concurrency test here will
  pass whether the code is atomic or not.** PGlite allows a single connection,
  so requests fired in parallel are serialized by the bridge and never overlap.
  Proved by trying: `webhook-idempotency` W-07 sends eight simultaneous
  deliveries of one event id, and replacing the atomic
  `ON CONFLICT DO NOTHING ... RETURNING` with an explicit SELECT-then-INSERT
  left it passing. Write the atomic statement anyway — it is correct on its own
  terms — but verifying atomicity needs real Postgres with real concurrent
  connections, and a green concurrency assertion here is not that verification.

When a test passes, check the evidence in its own output — a count that moved,
a status that is specific, a row that actually changed.

## Bug families this codebase keeps producing

- **An async guard with no catch takes the SERVER down, not the request.**
  Express 4 does not await middleware, and `server/index.ts` installs no
  `unhandledRejection` handler, so a rejected promise from a guard is Node's
  default: the process exits. `checkSuperadmin` and `checkOrgAdmin` in
  `contribution.routes.ts` were written locally without one — the shared
  guards in `auth.middleware.ts` catch — so a single dropped database
  connection during a contribution request stopped the site until Render
  restarted it. Found 2026-11-12 when a second client took PGlite's only
  connection and `up.ts` died instead of answering 500. Both now go through
  `guarded()`, which answers 500 and never `next()`.
  `contribution.guardFailure.test.ts` (4 cases); without the catch three of
  them hang unanswered and vitest reports the unhandled rejection.
  **And the default itself is replaced**: `utils/processGuards.ts` installs
  an `unhandledRejection` listener that logs loudly and keeps serving, so the
  next handler written with an await outside a try/catch costs ONE request
  (it hangs until the client gives up) instead of the whole site. A log line
  starting `[unhandledRejection]` is a handler that needs its own catch.
  `uncaughtException` is deliberately left to exit.
- **Substring instead of token.** Eight-plus instances. Matching `"Science"`
  inside `"Social Science"`, or a phrase inside a longer phrase that contains
  it. Match on tokens or whole strings, and assert the negative case.
- **Accepted at creation, broken for ever, visible nowhere.** A school with a
  curriculum its country does not offer; an assessment with the same mismatch;
  a country with no sector map; a curriculum with no subjects. Each was
  accepted silently and only surfaced when a student hit a dead end. When
  adding anything configurable, ask what happens if it is left empty, and make
  that state visible — `storage.getCountryReadiness` is the pattern.
- **A control applied to one verb and not its siblings.** Ownership checked on
  PATCH and not GET or DELETE. When you fix an authorization gap, check every
  verb and every sibling route.
- **An outer column inside a drizzle `sql` subquery renders UNQUALIFIED.**
  `sql\`(SELECT ... FROM license_grants g WHERE g.organization_id = ${organizations.id})\``
  emits `WHERE g.organization_id = "id"`, and Postgres resolves a bare `"id"`
  against the *innermost* table — so it compared each grant's own primary key
  to an organization id. Valid SQL, no error, every figure silently zero.
  Spelling the table name into the subquery fixes it and breaks the same silent
  way if the table is ever renamed. Prefer separate `GROUP BY` aggregates
  merged in code: nothing to mis-resolve, and each query is verifiable by
  reading it. `storage.getLicenseAnalytics` documents both this and the
  row-multiplication trap next to it.
- **Joining one row to two one-to-many tables multiplies it.** A school with 3
  grant rows and 40 consumption rows joined to both at once is 120 rows, and
  reports 120 of each. Aggregate each side separately.
- **Check-then-act across connections.** Reading a balance on the pooled `db`
  handle and writing it inside a transaction decides from a snapshot taken
  outside that transaction, and takes a second connection while one is held.
  Read on `tx`. `storage.consumeLicense` documents this.

## Things that look wrong and are not

- Arabic `_two`, `_few`, `_many` translation keys exist only in `ar`. That is
  i18next plural handling, not missing English keys.
- `direction: rtl` on a container already makes `text-align: start` resolve to
  the right for everything inside it. Do **not** add a blanket
  `[dir="rtl"] p, div, h1 { text-align: start }` — a rule that matches an
  element beats a value it inherits, and that one silently un-centred every
  heading in the Arabic PDF.
- Which Stripe mode is live depends entirely on the key in the environment;
  live keys are still pending, so payment flows exercise test mode.

## The licence model

One licence = one completed assessment with a generated report. Spent at
**report generation**, from a pool belonging to a school or to a parent account
(one account, one child, enforced at the schema). Enrolling costs nothing,
abandoning a half-finished assessment costs nothing, and a student who leaves
takes nothing, because the licence was attached to the pool and never to them.

**Two ledgers, one for each direction.** `license_grants` records every change
to a school's entitlement — a Stripe purchase, a superadmin comp, a correction
— one row each, signed, so a reduction is a row and not an edit. Its Stripe
payment id is unique *where present* (a partial index), which is what makes a
webhook redelivery safe instead of granting the licences twice. A purchase
names its money and nothing else may, so a comp can never appear in revenue.
It is **additive for now**: `organizations.total_licenses` is still the value
licence enforcement reads, and the sum of deltas is reconciled against it
rather than replacing it. That reconciliation is the point — it catches a code
path that changes entitlement without recording it, and it is readable at
`GET /api/superadmin/licenses/reconciliation`. Unlimited schools are excluded,
because their total is a number with no meaning.

Three paths write to it: the Stripe group purchase, superadmin school creation,
and the superadmin licence add/remove route. **An amount is optional input on
the two superadmin paths** and the only source for a school that paid by bank
transfer — money this system never sees. With an amount the row is a purchase;
without one an increase is a comp and a decrease an adjustment. Nothing is
guessed, so a top-up with no amount reports as granted rather than as revenue.

`shared/licenseGrants.ts` holds that amount-to-kind rule, pure and tested,
because one of its callers runs **inside the Stripe purchase transaction**: a
purchase without an amount is refused by the check constraint, and a refused
insert there rolls back a payment already taken. A try/catch does not save it —
in Postgres a failed statement aborts the surrounding transaction regardless —
so the kind must be decided correctly before the insert. `NaN` from a Stripe
payload with no `amount` is the case that matters. An unexplained licence count
is recoverable from Stripe; a lost sale is not.

**THREE KINDS OF TAKER ARE ON A POOL, and until 2026-11-12 the code knew
two.** A school student (the school's pool), an account with a child profile
(its own), and — the one that was missing — **a premium account with no child
profile and no school, which is what the public checkout creates for a single
buyer.** That account was on NO pool: `consumeLicense` returned null and
`getLicenseCapacityForStudent` returned null, the free cap excludes premium
accounts, so nothing charged it and nothing refused it. **One licence bought
any number of premium reports.** This file said that hole was closed ("The
Infinity ... gone"); it was closed for the child-profile account only, and
`licences.mjs` L-06 gives its "self-payer" a child profile precisely so that
it reads as one — the account without one was never tested. Found on the
premium walk (three licences, a report generated, `/api/licenses/me`
answering `onPool: false`), then proved by running: one licence, three
reports, ledger 0.
`shared/licensePool.ts` (9 tests) is the rule, pure because the charge runs
inside the generation transaction and the capacity read runs outside it.
A superadmin stays off every pool (their premium flag is not a purchase), and
so does a school admin. Creation refuses an exhausted buyer **402
`NO_LICENCES_AVAILABLE`**, and `/assessment` has a screen for it
(`screen-personal-pool-empty`) that offers the existing reports and a mailto —
NOT checkout, where a card payment by a premium account grants nothing.
Migration 041 backfills the premium reports these accounts had already
generated, so the ledger and the profile's own count agree.
`premium-solo.mjs` (5 cases; S-05 is the control that a free account is still
on no pool). Against the old code S-01 to S-04 fail with `ledger 0 -> 0 -> 0`
and a third assessment created. `migration-041-dryrun.mjs` (11 cases, six of
them controls). **Not covered / still open:** the profile's "Used" figure is
still counted in the browser from completed premium assessments rather than
read from the ledger; an individual's own grade is typed per assessment, so
there is no same-grade repeat warning for them.

**A SUPERADMIN GIVES AN INDIVIDUAL LICENCES FROM THE USERS TAB**
(`POST /api/superadmin/users/:id/licences`, `{count}` 1–1000, the ticket
button on an individual's row). Found the same evening: the owner made a test
account with "Add Users", was told it was premium, and it was not. **"Add
Users" creates a FREE account, and the Users directory listed premium
individuals only — so the account vanished from the list the moment the
dialog closed**, and nothing in the product could make it premium. The
"accepted at creation, visible nowhere" family again. The list now shows every
individual with a Free or Premium badge and its licence count, and the type
filter has Free.
The route ADDS and never sets or removes, in one UPDATE with the arithmetic
in SQL and `account_type = 'individual'` in its WHERE clause. A school account
is refused 409 `NOT_AN_INDIVIDUAL` (schools have their own route and ledger);
a superadmin is refused because their account is on no pool. **There is no
grants ledger for individuals**: the only record is the security log line
(`Superadmin gave licences to an individual account`), so these are not
revenue and not reportable. If they must be, that is a table.
`individual-licences.mjs` (8 cases), judged by the stored figure. I-03 is the
one that proves the licences are real (a report generated and charged, 2 → 1).
Mutation-tested by dropping the role guard, the account-type checks and the
list change: I-01, I-05, I-06 and I-07 fail, with a school admin and a student
each adding 50. **Flagged, not changed:** the superadmin's own account now
appears in the list as Free with a button the route refuses; and the edit-email
dialog invalidates `/api/superadmin/all-students`, a query key nothing uses, so
the list does not refresh after an email change.

Stripe cannot answer any licence question. It knows amounts and customers, not
licences, schools, countries or curricula, and reward credits never touch it
because they are earned rather than bought.

`license_consumptions` is the ledger of spending and the only accounting record
for it.
`organizations.used_licenses` and `.reward_credits_used` are derived by
counting ledger rows, never incremented — a counter set from a count cannot
drift, and nothing should ever add to or subtract from those columns. The
assessment id is unique on the ledger, which is what makes regenerating a
report free instead of double-charging.

**Repeating a grade is the SCHOOL's decision** (owner, 2026-11-12, migration
040). A school student who already has a CHARGED report for the grade the
school has them in is refused a new assessment — `POST /api/assessments`,
**403 `REPEAT_NOT_ALLOWED`** — unless their school has allowed one:
`organization_members.repeat_allowed`, set per student from the roster
(`POST /api/admin/organizations/:id/members/:memberId/repeat`, the school's
own admin or a superadmin, students only). **One permission is one attempt**:
starting the repeat clears it. A new grade is not a repeat, so moving a
student up needs no permission. Before this the pool was the only limit and
one student could spend a school's whole balance. A parent's own pool is
unchanged: allowed, costs a licence, and warns first (the warning screen is
real now — see the student walk under open items). `/api/licenses/me` returns
`repeatBlocked` so `/assessment` says so before any answering.
`repeat-grade.mjs` (10 cases), judged by assessment rows and the flag: R-08
is the control that a new grade is free, without which the suite passes
against "one assessment for life"; R-04 includes another school reaching the
member through its OWN organization id. Mutation-tested: without the guard
R-02 and R-07 fail, without the member-belongs check R-04 reports
`viaOwnOrg=200 flag=true`. The charge is planted on the ledger in SQL (no
Anthropic offline). **`licences.mjs` L-03 had been a same-grade repeat
labelled "a second year"** — it sent grade 11 in the student's payload while
the school's record stayed at 10; it now moves the student up through the
school's edit route first. **Not covered:** an assessment already in progress
when the rule arrived can still be finished and charged. Reward credits
— earned by schools contributing approved questions — are spent before paid
licences. `shared/assessmentLimits.ts` holds the free-tier anti-abuse cap and
nothing else: a pooled taker's limit is their balance, and an unknown balance
fails closed at zero.

## Licence pricing

`shared/pricing.ts` is the ONLY price calculation. The volume tiers were once
written out by hand in both `payment.routes.ts` and `GroupPricing.tsx`, and
the price itself was literal text in four more places including both locale
bundles. They agreed, which is the dangerous state: nothing compares them at
runtime, so a change to one quotes a buyer one price and charges another with
no error anywhere.

Each country stores its own price in **minor units** (`license_price_minor`)
with its own `license_currency`. Both or neither — a database constraint, not
just a code rule, because a price with no currency is how a country bills 3700
*cents* for a 37 dirham licence. A country with no price falls back to the USD
default and `countryPricing` **reports that it fell back**, so an unpriced
country is visible rather than discovered on a receipt.

**Not a converter.** The dirham and the riyal are both pegged to the dollar, so
a live rate buys nothing and adds a way for checkout to fail when a rate
service is down, plus two identical sales a month apart recording different
amounts. The opening prices WERE the exact peg conversion of the old $10 — AED
36.73, SAR 37.50 — rounded to the true figure rather than up to a presentable
37.00, because rounding up is a price rise nobody asked for.

**UAE is now AED 40.00, set deliberately on 2026-11-09** and verified live:
`priceMinor` 4000, `usesFallbackPrice` false, and `/api/pricing/quote` returns
40 / 36 / 34 / 32 per student across the 0/10/15/20% tiers (AED 17,000 for 500
students). 36.73 was a conversion artifact rather than a chosen price, and it
read as one in a quote. Changing it is a one-row UPDATE through
`PATCH /api/admin/countries/:id/license-price`, which **requires `currency`
alongside `price`** — sending `price` alone is refused with `INVALID_CURRENCY`,
which is the both-or-neither constraint doing its job.

**Production has exactly ONE country row: UAE.** There is no Saudi row, so
SAR 37.50 is seed data that is not live and no buyer can select it. The
client-selected-country arbitrage described below is therefore not reachable
today — but it returns the moment a second country is added at a different
peg-equivalent price.

Three things that fail SILENTLY and are handled centrally:
- **Currency exponents.** 1000 minor units is ten dirhams but ONE dinar. The
  Gulf three-decimal currencies (KWD, BHD, OMR, JOD) mischarge by a factor of
  ten if read as two-decimal. Never divide money by a hardcoded 100 — use
  `toMajor`.
- **Stripe rejects a three-decimal amount that is not a multiple of ten**, so
  a Kuwaiti price would fail at checkout for that country alone.
- **The minimum charge is per currency.** The old `< 50` check with the message
  "Minimum is $0.50 USD" is 0.50 AED against a dirham price — an amount it
  passes and Stripe then refuses, after the card is filled in.

**A PRICE IS SET IN MAJOR UNITS, ALWAYS.** `PATCH
/api/admin/countries/:id/license-price` takes 36.73 and stores 3673, and the
superadmin country table shows and edits the same figure a buyer is charged.
Nobody should type or read fils. Before that route existed the only way to
change a price was editing an INTEGER column by hand, where typing the number
you mean stores one hundredth of it — and 3673 was in fact read back as the
price, which is what prompted it. `toMinor` rejects rather than rounds a
figure finer than the currency allows (36.731 AED is not a price), and
`price: null` CLEARS a price, which is not the same as zero: a cleared country
falls back to USD and says so, while zero is refused by the constraint.

Rounding happens once, at the end. Rounding per student and multiplying drifts
a few fils on a large order, which surfaces as the page and the receipt
disagreeing for no explicable reason.

**The country is client-selected at checkout and that is currently safe only
because prices are equivalent at the peg.** A group buyer has no account, so
there is nothing server-side to derive it from. The price is never read from
the request — only the country id, which selects a row. The day a market is
priced genuinely lower, a school could select it, pay that price, and have its
country corrected afterwards: **real regional pricing needs the country locked
to the purchase first.** An unknown country is refused rather than quietly
charged in dollars.

## The reference vocabulary

`GET /api/reference` returns the four controlled lists — countries, curricula,
subjects, grades — each with English and Arabic, plus the canonical six
subjects independent of any country. Build prompts, dropdowns and validation
messages from it rather than assembling them per caller: the vocabularies have
drifted before (a subject NAME on one side and a CODE on the other), and the
Arabic report printed English subject names because the server had no Arabic
subject list at all.

Grade VALUES stay Latin digits — they are matched against
`quiz_questions.grade`, and Arabic-Indic digits would silently stop matching.
Only the labels are localised. `shared/subjects.ts` holds the server-side
Arabic names, copied from the client locale bundle because the server cannot
read it; change both together.

## A school is not operational until it has a country and a curriculum

Both decide which quiz bank a student's assessment draws from and which
questions the school may contribute. `server/utils/schoolSetupGate.ts` blocks
enrolment (all three sinks) and contribution with 409 until both are set, in
the same shape as the consent gate beside it. The columns stay nullable
because the Stripe group-purchase path creates an organization inside the
payment transaction where neither value exists — a NOT NULL there would roll
back a paid purchase.

## Question gaps

`storage.getQuestionGaps(countryId, curriculum)` reports the bank cell by
cell, where a cell is one (country, curriculum, subject, grade). That is the
unit the quiz draws from: a student picking three subjects gets FIVE questions
per subject at THEIR grade, so a country can hold hundreds of questions and
still fail a student whose three cells are empty.

An empty cell does not degrade the paper, it removes a subject from it. The
top-up only fires below `MIN_QUIZ_QUESTIONS` for the whole quiz, so a student
who picked Arabic with that cell empty gets ten questions instead of fifteen
and none of them Arabic — silently, with their subject scores computed from
what is left. `question-gaps.mjs` G-09 asserts exactly that.

Schools read it at `GET /api/contributions/gaps`, scoped to their own school:
country and curriculum are properties of the school, never request
parameters, or the free choice this removes comes back through the query
string. Superadmins read every curriculum of a country at
`/api/admin/countries/:id/question-gaps`, so generation and contribution aim
at the same cells.

## Peer review of contributed questions

**"Passing the automatic check" means the check RAN and scored >= 50.** It used
to mean rather less. `verifyQuestionsWithLLM` has four return paths and three
are failures — no usable Anthropic credential, a non-OK response from
Anthropic, any thrown exception — and all three returned
`{ overallScore: 100, verified: true }`. The routing gate
(`result.verified && result.overallScore >= 50`) is real, so a fabricated 100
cleared it every time: unchecked questions reached peer review labelled as
having passed an automatic review, and approved ones earn reward credits that
convert to free licences, in an assessment sat by 13–18 year olds.

The trigger needed no code change. A rotated `DB_ENCRYPTION_KEY` makes every
stored credential undecryptable, and `storage.getApiCredential` returns
`undefined` on a decryption failure — **indistinguishable from "never
configured"** — so the first path was taken silently. That is also the real
explanation of the "vanishing Anthropic key": the key did not vanish, it became
undecryptable, and three layers rendered that as absent (the getter returns
undefined, `getAllApiCredentials` returns `apiKey: ''`, and the superadmin
listing turns an empty string into `apiKeyMasked: null`). Re-entering it
"fixed" it by re-encrypting under the new key.

Now a failure reports score **0** and `llmVerificationStatus: "unavailable"` —
a third state, because "failed" would tell a school its questions were reviewed
and rejected, and it would rewrite work nobody read. Score 0 does not clear the
threshold, so the submission keeps `pending` and a superadmin picks it up;
`pending` is already in that queue, so it stays visible rather than
disappearing. The threshold and the success path are untouched — the defect was
failures claiming success, not the passing mark. `llm-gate.mjs` asserts it,
including the rotated-key case with a credential genuinely encrypted under a
different key. **The happy path cannot be tested in the harness** (no network),
so that branch is reviewable by eye only.

**A superadmin can now RE-RUN the check** on a submission it never read
(`POST /api/contributions/admin/:id/recheck`, a "Re-run check" button in the
review queue). Before this nothing ever tried again: once the credential
worked, an `unavailable` submission still sat until someone reviewed every
question by hand, and it never reached peer review.
**Superadmin-triggered, not automatic** — nothing in this app runs on a
schedule, and the usual cause is a credential a person has to fix first.
Two states qualify, both with review status still `pending`: `unavailable`,
and a check stuck at `pending` with no result for ten minutes — the check is
a background promise and Render restarts the process on every deploy, so one
in flight at that moment is lost and the row says "in progress" for ever.
**A verdict is REFUSED**: re-rolling a check that ran until it passes is not
a retry. The claim is one UPDATE with the conditions in its WHERE clause
(`storage.claimContributionRecheck`), so a double click is one Anthropic call
and a submission decided in the meantime is not dragged into peer review by a
late result. Still-unavailable answers **503 `CHECK_UNAVAILABLE`**, never a
200 a client could read as a verdict.
`applyVerificationResult` is the ONE place a result is written and routed,
shared by the submit path and the re-check, so the two cannot disagree about
what "passed" means.
`llm-gate.mjs` L-06 to L-12 (13 cases in all). L-10 is the control for L-09:
the same row an hour older IS re-run, or L-09 would pass against a route that
refuses every `pending` for ever. Mutation-tested by dropping the guard and
the claim's conditions: L-06, L-08, L-09 and L-11 fail. The suite still makes
exactly TWO submissions — the new cases move submission 2 between states in
SQL, because a school's daily limit is three.
**The success branch IS covered now, outside the harness**:
`contribution.recheck.test.ts` (5 cases) mocks `fetch` and storage. C-01
asserts a passing re-check is routed to peer review; C-02 is its control (a
check that runs and scores 31 stays `pending`).
**THE SUPERADMIN REVIEW QUEUE COULD NOT REVIEW ANYTHING, and nobody knew,
because no submission had ever reached it.** Found 2026-11-12 by rendering
the screen with two submissions in it: both rows, no buttons. The Review
button was offered only for `llm_verified` and `in_review`, and **nothing in
the server writes either status** — the two a submission awaiting a decision
actually has are `pending` and `peer_review`. So "superadmins can override at
any point" was true of the route and false of the product. The same screen
read four more names the server never sent: `questionCount` (it is
`totalQuestions`) left the column blank, `submittedByName` (`submitterName`)
printed a dash, and the four tiles read `totalPending` and friends from a
stats route that returned none of them, so `?? 0` drew **four confident zeros
above a queue with submissions in it** — the invoice card's AED 0.00 again.
And an unchecked submission showed **"LLM Score: 0%"**, which is the claim
`unavailable` exists to avoid, resurfacing one layer up: the score badge now
appears only when the check ran. Verified by driving it: Review → Approve →
the row turns Approved and the tiles move. `llm-gate.mjs` L-13 pins the four
stats names as numbers.
**THE REWARD COULD BE PAID TWICE, and the button that paid it was labelled
"Claim for Review".** Two superadmin actions give the same credits: the
per-submission claim, and "Allocate reward" for the whole school, which marks
its submissions `reward_allocated` and leaves them `approved`. The claim never
read that flag, so allocate-then-claim added the credits again — reward
credits are spent before paid licences, so that is free assessments. The
claim was also four unjoined statements with the arithmetic done in
JavaScript. `storage.claimApprovedContribution` is now one transaction whose
first statement is the conditional claim; a submission already paid is closed
with nothing moved. `contribution-claim.mjs` (6 cases), judged by the
school's three figures: against the old code K-04 reports `reward=8` where 5
is right. The button now says "Give reward".
**The claim now stops at the yearly ceiling too** (owner's decision,
2026-11-12), by the same rule and reset as allocation. AT the ceiling it is
REFUSED and rolled back (`YEARLY_CAP_REACHED`), leaving the submission
approved and unpaid for next year, rather than closed with nothing paid;
part-way there, what fits is paid. K-06 to K-08, where K-08 is the control
that last year's count does not block this year. **Still flagged:**
allocation will add credits beyond what is pending.
**ON PRODUCTION THE AUTOMATIC CHECK IS NOT RUNNING (2026-11-12), cause
unknown.** Two submissions made as Test High School's admin both came back
`unavailable`, score 0, within seconds. The reason was only a server log line
(`[Contribution] LLM verification did NOT run (...)`), so the recheck's 503
now carries it (`reason`) and the review queue shows it — re-run the check as
superadmin to read it. Also hardened without knowing it is the cause: a reply
wrapped in a markdown fence used to throw in `JSON.parse` and count as "did
not run" (`contribution.recheck.test.ts` C-06). The school's own submissions
table had the review queue's faults too: it read `questionCount` (blank
column), said "Pending LLM Check" after the check had answered, and had no
case for `peer_review`.
**`llmVerificationStatus: "failed"` IS NEVER WRITTEN.** `verified` is true
whenever the check ran, so a submission scored 31 is stored as "verified"
with a score of 31. The routing gate reads the score, so behaviour is right
and only the label is odd. Flagged, not changed.

A submission passing the automatic LLM check goes to peer review, not to a
superadmin queue: three other schools vote and two agreeing decides. Six
rules, each of which fails silently if broken, so each has an assertion in
`peer-review.mjs`:

- a school never reviews its own work, in any country (the queue excludes it
  AND the write refuses it — the queue is a convenience, the write is the
  control)
- **a school reviews only its own country AND curriculum**, enforced in the
  queue and the write both. Country is matched deliberately: the same
  curriculum is not the same syllabus across borders — a British-curriculum
  school in Saudi Arabia teaches it inside Saudi requirements, with national
  content and local examination arrangements — so a reviewer from elsewhere
  would be marking against a syllabus it does not teach while believing it
  shares one. The accepted cost is that a country's first school has nobody to
  review it and its submissions sit at `peer_review` until a superadmin acts,
  which is a second reason superadmins must keep seeing them. The queue reads
  both values as subselects in the same statement, so no caller can pass the
  wrong ones; the write reads them on `tx`. Both fail closed when either is
  unset. `COUNTRY_MISMATCH` and `CURRICULUM_MISMATCH` are separate codes on
  purpose — with one shared code a test cannot tell which guard refused. The
  curriculum negative case needs TWO schools on the other curriculum: with
  one, its queue is empty either way and "not offered" passes on an empty list
- the reviewer is never told who wrote it, achieved by not selecting the
  author's columns rather than by not rendering them
- one vote per SCHOOL, not per administrator — a unique index, since a school
  with two admins could otherwise supply a majority alone
- an outcome settles as soon as it is mathematically decided, inside the same
  transaction as the vote
- **credit goes only to reviewers who voted WITH the outcome.** Crediting every
  review regardless would pay a school to approve everything unread as fast as
  it could click.

Superadmins still see `peer_review` submissions and can override at any point.
Removing that was worse than the bottleneck it replaced: a submission nobody
chose to review would sit for ever with no one able to see it.

## Who may read a student's report

The student, always. Since 2026-11-12 also a **superadmin** (any student) and
a **school admin** (a student OF THAT SCHOOL, never another's). Before that
every single-report route was owner-only, which was stricter than the product:
both roles could already download the same reports as a zip. The block
protected nothing and broke something — the superadmin's "view results" link
opened a page that could load none of its data, so it rendered what it shows
when it knows nothing about a report: **the FREE layout with an "unlock"
offer, over a school's paid report.** The owner found it by clicking.

`server/utils/staffReportAccess.ts` is the ONE rule, consulted by all seven
read routes (assessment, recommendations, quiz, values profile, the two
narrative routes, the PDF). One function because the cross-tenant line is the
whole risk and "a control on one verb and not its siblings" is a family here.
Roles are read from the database per call; a lookup that throws is a refusal.

- **READ ONLY.** The generate route does not consult it: generating spends a
  licence, and staff opening a report must not cause that.
- **Guest assessments are never staff-readable** — no account, no school,
  nothing to authorise on.
- A view is recorded ONCE per open (`SECURITY: Staff viewed a student
  report`), from the assessment read, not from each of the seven routes.
  **It is a log line, not a table.** If the record has to be queryable or
  shown to a school, that is a new table and a subject-access classification.
- `GET /api/staff/students/:userId/report` opens the latest finished report
  and answers **404 identically** for "no report" and "not yours".
- The results page shows an "Administrator view" label and drops the offers
  addressed to the student as a buyer.

`report.mjs` SV-01 to SV-06, run there because that suite already holds a
REAL finished school report — on a planted row "recommendations came back
empty" is also what a refusal looks like. **SV-03 is the case that matters**
(another school's admin reads none of it); SV-04 is the control that a
classmate is still refused. Mutation-tested by dropping the school
comparison: SV-03 and SV-06 fail with the other school reading everything.

The superadmin dashboard now offers the link only where a FINISHED
assessment exists (`completedAssessmentCount`). It used to key off the total,
so a student with one assessment in progress got a link to a raw 404.

## Known open items

- **A SCHOOL'S STUDENT COUNT DISAGREED ON THREE SCREENS.** Found on
  production 2026-11-12, signed in as a school admin: a school of six
  students, three finished. The roster said 6. The profile said "Total
  Students 7 / Pending 4" — `getOrganizationStats` counted every
  `organization_members` row, and the administrator is one. Analytics said
  "Total Students 3 / Completion Rate 100%" — `getAnalyticsOverview` counted
  finished assessments and then set `completedAssessments = totalStudents`,
  so the rate was 100% by construction and could never show anything else.
  Both now count STUDENT rows; for a school, analytics divides students who
  finished (people, not assessments — a repeated grade is two) by the
  roster. `org-admin.mjs` O-11/O-12, run with nobody finished so a rate
  that is 100% by construction fails. **Not changed:** the superadmin's
  nationwide analytics has no roster to divide by and still reports the old
  pair.
- **A SCHOOL ADMIN NO LONGER TAKES THE ASSESSMENT OR REACHES THE QUIZ BANK**
  (owner's decision, 2026-11-12: a school admin adds students and nothing
  else). Both were seen on the walk above.
  `POST /api/assessments` refuses a member row with role `admin` — **403
  `SCHOOL_ADMIN_NO_ASSESSMENT`** — read from the member row like the student
  test beside it. Creation only. The "Assessment" nav entry is gone for org
  admins on all four screens that drew it, and `/assessment` sends them to
  the roster. `org-admin.mjs` O-13 sends a VALID payload (validation runs
  before the role check, so a malformed one passes on a 400) and counts the
  admin's assessment rows; O-14 is the control that a student of the same
  school still can. Mutation-tested: without the guard O-13 reports
  `HTTP 200 ... 0->1`.
  `/admin` (the quiz bank) is wrapped in `Admin.tsx`: superadmin or
  redirected. **The API was always the control and still is** — the page
  used to render a 403 as "No questions found. Create your first question".
  The page gate has no harness suite; it was driven in a browser as five
  roles. A superadmin who is not a school admin can still start an
  assessment; nobody asked for that to change.
- **THE STUDENT WALK ON PRODUCTION, 2026-11-12** (a Test High School student,
  one full assessment, one licence, 47 → 46). What it found:
  - **A DEPLOY MID-SESSION CRASHED THE NEXT PAGE.** Every page is a lazy file
    with a hashed name; a deploy replaces them, so a browser loaded before it
    asks for a file that is gone. The student pressed "Get My Report" and got
    "Something went wrong" (`Failed to fetch dynamically imported module:
    /assets/Results-….js`). The report HAD been generated. Render deploys on
    every push, so this was every deploy, for whoever was mid-session.
    `client/src/lib/lazyPage.ts` (7 tests) reloads ONCE — a timestamp stops a
    genuinely missing file looping — and every route in `App.tsx` uses it.
    **VERIFIED AGAINST A REAL DEPLOY the same afternoon**: a page loaded on
    `df58e38`, a deploy to `786c4ae` landed, and the next in-app navigation
    reloaded once and arrived on Profile with no error screen.
  - **THE RESULTS PAGE SHOWED US DOLLAR SALARIES. The bullet below that says
    "US salaries do NOT reach students" WAS WRONG** — `Results.tsx` printed
    `rec.career.averageSalary` on every premium career card ("Typical
    $65,000 - $105,000"). The PDF never did. The tile is removed; the API
    still sends the field. The growth figure beside it is still a US Bureau
    of Labor Statistics projection, labelled as one.
  - **"REPEATING A GRADE WARNS FIRST" WAS TRUE ONLY OF A HOOK.**
    `useAssessmentAvailability` returned `sameGradeAlreadyCharged` "for the
    warning before a repeat" and no screen read it, so a student with a
    report who pressed Assessment was dropped into a new one that would
    spend a second licence unannounced — and since the pool replaced the
    one-per-student allocation, nothing stood between one student and the
    school's whole balance. `/assessment` now shows the warning first, with
    the existing report as the primary action. **A warning, not a limit:
    whether a school student may repeat at will is a product decision nobody
    has made.** Checked in a browser with `/api/licenses/me` intercepted both
    ways; no harness suite.
  - **Pages for staff rendered for anyone**: `/superadmin`, `/admin`,
    `/admin/organizations` and `/analytics` drew their shells (badge, tabs,
    Add School, a dashboard of zeros) for a school admin or a student. The
    API refused every request; the pages rendered the refusal as emptiness.
    `StaffOnly` and the two page wrappers redirect instead.
  - The Next Steps list printed `**This Month:**` with its asterisks; it goes
    through `ReportMarkdown` now, as the PDF did.
  - Held: another student's assessment, quiz, values, PDF and the school's
    roster are all refused to a student (403/404; recommendations answers
    `200 []` by design). PDF: 7 pages, 1.46 MB.
  - **Flagged, not changed:** quiz question "5 red and 3 blue balls" offers
    BOTH 5/14 and 10/28, the same number; four of five recommended careers
    have no Arabic description and the footer is English in Arabic; the
    personality step labels each question with its theme and its last button
    says "Complete Assessment" two steps before the end; the home page
    offers a signed-in student "Explore as Guest" and "For schools"; the
    student's profile shows the school's whole balance as "Available
    Assessments 46"; leaving `/assessment` raises a native confirm even with
    nothing entered.
- **THE ARABIC STUDENT WALK, 2026-11-12** (`salm.alktby`, Grade 11, one
  licence, 46 → 45). Every step, the quiz and the generated report are in
  Arabic and right-to-left, and the Likert labels sit under the right radios
  (checked by value, since the row is laid out left-to-right). Fixed from it:
  the vision sentence and the next-steps printed English subject and
  category names inside Arabic prose (`shared/careerCategories.ts`, 4
  tests), and "نمو 1–2%" / "2024–2034" rendered reversed (bidi isolates in
  `ar/results.json`). **Flagged, not changed:** "Build on your strength"
  names the FIRST favourite subject, not the highest-scoring one (it said
  Mathematics at 80% over Computer Science at 100%); some careers have no
  Arabic description; the locked country card says "United Arab Emirates"
  and "MOE National"; Next/Back arrows do not flip in Arabic; the Arabic
  PDF's content language was not inspected (7 pages, 1.46 MB).
- **THE PREMIUM (INDIVIDUAL BUYER) WALK, 2026-11-12** (`fix.onebuyer.4ecb`,
  Grade 12, MOE National). The unmetered pool above is what it found. Held:
  three-to-five subjects enforced, the quiz and each personality page refuse
  to advance unanswered, the report needs a strength chosen, 5 careers, PDF 7
  pages 1.2 MB, data export 200, the three-step account deletion stops at a
  password, staff routes 403, and the report re-renders in Arabic.
  **Flagged, not changed:** Step 1 accepts an age of 45; the quiz asks "What
  role does the UAE play in OPEC?" and marks "Major oil producer and
  influential member" correct — the UAE left OPEC on 1 May 2026, so the
  marked answer is now wrong and the question needs rewriting or removing; the
  next-steps templates read badly for some careers ("admission requirements
  for Entrepreneur programs", "documents for Varies (business education
  helpful but not required)", a step labelled "Next Steps" inside Next Steps,
  and "Keep your Mathematics ... grades high" for a Social Worker); the
  Arabic profile says "الرخص" where the rest of the product says "تراخيص";
  the deletion preview omits the password-reset requests the data summary
  counts.
- **THE SUPERADMIN USERS TAB FILTERS BY FINISHED ASSESSMENT**
  (`select-assessment-filter`: all / not finished yet / finished). FINISHED,
  not started — the question is who still has to do it. School admins are
  left out of "not finished yet": they never take one.
- Nothing about curricula: that gap is closed. Offering a curriculum now
  creates its six subjects, empty ones were removed, and `new-country.mjs`
  NC-09g enforces the invariant.
- **Closed, and the diagnosis recorded here was wrong.** This said the
  near-blank final page came from the last career page filling the sheet and the
  footer overflowing, and that Chromium's poor `break-before: avoid` support made
  it pagination work across nine pages. It was neither overflow nor a Chromium
  quirk, and it was a one-liner. `ResultsPrint.tsx` carried
  `.print-page-career:not(:last-of-type) { page-break-after: always }` alongside
  `page-break-before: always` on the same class. The before-rule already
  separates consecutive career pages, so the after-rule was redundant — and
  `:last-of-type` means "last sibling of this ELEMENT type", not "last element
  with this class", so the footer `div` was the last `div` and no career page ever
  matched. The final career kept a trailing break with only the footer after it.
  Deleting the rule fixed it: **English 9 → 8 pages, Arabic 8 → 7**, measured on
  real renders. `report.mjs` RP-20 and RP-21 now assert it in both languages,
  against the rendered PDF rather than the CSS, because the CSS reads as correct
  — the fault was in which sibling a selector matched. Both mutation-tested by
  restoring the rule: page 9 at 74 characters and Arabic page 8 at 90 come
  straight back. Do not re-fix a recurrence with `break-before: avoid` on the
  footer; the break should not be generated at all.
  PDFs DO render in the cloud container: set
  `PUPPETEER_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`
  before `up.ts`. FOLLOWUP's claim that renders need a staging deploy was about
  the Codespace, not here.
- **Run `report.mjs` on a FRESH `.pgdata`.** A second run against the same
  database silently degrades the report — the English PDF came back 3 pages and
  328 KB instead of 8 and 1.07 MB, with the career pages missing and the Arabic
  render 500ing. Nothing about that output says "stale state"; it reads as a
  layout regression, and it briefly looked like one.
- **Migrations are applied automatically at boot, so this list goes stale by
  itself.** server/index.ts runs every pending migration on startup and a
  failure is fatal, and Render auto-deploys on push to main — so a migration
  is live within one deploy of being committed, whether or not anyone ran it.
  029-033 reached production that way, and reading this section instead of
  checking `schema_migrations` wasted a session's worth of instructions.
  **Check the database, not this file:**
  `SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 12;`
  Staging gets nothing automatically, because nothing deploys to it; as of
  2026-11-08 it was behind by 024-033 and was caught up by hand with
  `scripts/run-migrations.ts`. The side effect is that **029 reached production
  with no before/after comparison**, which is the exact thing working rule 5
  exists to prevent. Anything later that must be checked before it goes live
  has to be held off main, not merely left unrun.
- **`/health` SAYS WHICH BUILD IS ANSWERING** (`build.commit`, seven
  characters from Render's `RENDER_GIT_COMMIT`, and `build.startedAt`). Render
  keeps serving the old build while a new one builds AND if the new one
  fails, so after a push the site looks the same in all three states. Compare
  `build.commit` with `git log --oneline -1` before believing a change is
  live. Null locally and in the harness.
- `scripts/verify-before.sql` and `scripts/verify-after.sql` are the read-only
  checks for the licence migrations. Two files, not one: before the migrations
  run, the new tables and the `countries.license_*` columns do not exist, and
  SQL resolves names at parse time, so a single script fails outright on the
  baseline run. Both follow `assessments.is_completed`, which is what 029's
  backfill joins on — counting `completed_at` instead reports assessments as
  uncovered that the migration skipped on purpose.
- **THE GUEST-DATA SWEEP ONLY RAN WHEN A STRANGER STARTED AN ASSESSMENT, and
  production went fourteen days without one.** Found on 2026-11-10 by reading
  `/health` on futurepath.ae: `lastRunAt` 2026-10-27, `lastAttemptFailed:
  false`. Not broken — never triggered. The only call site was
  `POST /api/assessments` (`assessment.routes.ts:665`), and its comment calls
  that a virtue: "cleanup frequency tracks actual guest traffic". The other
  half of that sentence is the defect — **no traffic means no cleanup**, so a
  deadline that the privacy policy states as 72 hours depended on unrelated
  people showing up. An unclaimed guest row holds an unaccompanied minor's
  name, age, grade, gender and career-personality profile, which is the exact
  thing `guestAssessmentExpiry.ts`'s own header says it exists to prevent.
  **The silence was already visible and nobody subtracted.** `/health` had
  always reported the raw timestamp, and the comment beside it called a long
  gap "fine — no guest traffic has hit the trigger route". Fine for the SWEEP;
  not fine for the DATA. So `isSweepStale` (pure, tested) now does the
  subtraction and `/health` reports `stale` as a BOOLEAN a monitor can alert
  on. It reads `lastSuccessAt`, never `lastRunAt`: a sweep failing every 30
  minutes keeps `lastRunAt` fresh while deleting nothing, and that state is
  the one shaped most like success.
  `/health` now ALSO TRIGGERS the sweep, fire-and-forget after the response.
  A health check is normally expected to be side-effect-free and this one
  deliberately is not: it is the one request that arrives on a schedule
  whether or not anyone is using the product (uptime monitoring, the load
  balancer, Render itself), which is the property a retention deadline needs
  and guest traffic does not have. The 30-minute throttle means a monitor
  pinging every 60 seconds sweeps at most once an hour. The assessment-route
  trigger is KEPT — two independent triggers, not a replacement.
  `guest-sweep.mjs` (8 cases). **GS-05 is the one that matters**: a moved
  timestamp proves the trigger ran, only a deleted row proves it did anything,
  so GS-05 plants a guest assessment 100 hours old and asserts the row is
  GONE after a single `/health` ping. GS-06 is its control — a 2-hour-old one
  must survive, or GS-05 would pass against a sweep that deletes everything.
  Mutation-tested by removing the `/health` call: GS-02, GS-03 and GS-05 fail.
  **The suite waits 2.5s before its first fixture, and that is not padding.**
  On a FRESH `.pgdata` there is no stored status, so GS-00's own `/health`
  ping starts a sweep that nothing throttles; it writes a fresh timestamp a
  moment later and lands on top of GS-01's stale fixture, failing GS-01, GS-02
  and GS-03 against a product that works. It passed on a dirty database
  because an existing status throttled that sweep away.
  **ANSWERED, AND THE ANSWER IS FOUR.** Within minutes of the fix deploying,
  production's `/health` reported `lastDeletedCount: 4` — so four expired
  guest assessments really had been sitting there, each holding an
  unaccompanied minor's name, age, grade, gender and career-personality
  profile, past a 72-hour deletion the privacy policy states as a promise.
  The count matches the four guest assessments the bullet below used to
  describe as permanent fixtures of the database; that identification is an
  inference from the number and the shape, not from reading the rows, which
  are now gone. **The bullet below is therefore stale and has been corrected.**
  This is also the answer to "was it only latent": no.
- **A GUEST IS NO LONGER ASKED FOR NAME, AGE OR GENDER — only grade.** Until
  2026-11-10 an anonymous visitor with no account had to enter all four before
  they could continue, so a thirteen-year-old could type their real name and
  age into a public form, with nobody's permission, and it was stored. The
  Terms said a parent, guardian or school consents before any assessment; on
  this path none of the three does. What exists is a tick saying the STUDENT
  agrees to the Terms — a terms acceptance, not a guardian's consent, and a
  minor cannot give the second by making the first. **An earlier note here
  claimed there was no consent control at all on the guest path. That was
  wrong** — the tick is real and gates Continue.
  **THE FIX WAS TO ASK FOR LESS, not to add a checkbox.** A tick saying "my
  parent agreed" is unverifiable: it stores evidence of a click and changes
  nothing about who decided. Removing the fields removes the thing consent
  would have been needed FOR, and costs nothing — nothing is addressed to a
  guest, the PDF is tier-gated away from them, and the row is deleted within
  72 hours anyway.
  **GRADE STAYS and is still required**: it selects the question pool
  (`quiz_questions.grade`), so without it the quiz cannot be built, and
  "someone in Grade 10" names nobody. **AGE WAS NEVER USED FOR ANYTHING** —
  grep `assessment.age` outside storage and the only reads are the gate and
  the card that displays it back. Gender the same.
  `shared/guestIdentity.ts` holds the rule, pure and tested, because FOUR
  places have to agree about it: the form, the resume step, the report gate
  and the two routes. `basicInfoComplete(a, isGuest)` takes `isGuest` as a
  REQUIRED argument and never derives it from a `userId` on the assessment —
  an absent-because-not-selected column read as "guest" would let an
  authenticated student skip the step that collects their own details, which
  is the dangerous direction. The compiler found both call sites when the
  argument was added, which is the point.
  **THE SERVER DOES THE WITHHOLDING, not the form.** Hiding three inputs is
  UX; `withholdGuestIdentity` on POST and PATCH is the control. It writes
  NULLs rather than dropping the keys — a dropped key on a PATCH means "leave
  the column alone", so a value written before this change would survive by
  being omitted. Guest-ness is read from the ROW (`!userId`), never from the
  request.
  `guest-identity.mjs` (7 cases) SENDS the fields anyway and judges the stored
  ROW, never the response. **GI-03 is the case that matters** (a crafted POST
  stores nothing); GI-01 passes under mutation too, because a plain payload
  sends nothing to discard. **GI-06 is the control**: an org student keeps the
  SCHOOL's details — asserted as "not the crafted name", which is stronger
  than non-null — or everything above would pass against code that wiped the
  columns for everybody. Mutation-tested by disabling both withholdings:
  GI-03, GI-04 and GI-05 fail with the crafted name and age stored.
  **The under-18 note was gated on `data.age < 18`** and would have silently
  stopped appearing to exactly the population it is written for. It now shows
  ALWAYS for a guest — the product is for 13-18s by its own Terms, and an
  age-gated note that can never fire is dead markup. Still unbacked, still in
  FOLLOWUP.
  `guest.mjs` G-05 used to type an age of 15; it now asserts the three fields
  are absent (G-05a), the note still reaches a guest (G-05), and grade is
  still collected (G-05b). **G-05b's first draft looked for `#grade` and
  failed** — that id is only on the plain `<select>` rendered for mobile;
  on desktop it is a Radix Select whose trigger is a button, so the locator
  must use `data-testid="select-grade"`.
  Terms §2 and Privacy §5 now describe what actually happens, which they could
  not before this change.
- **The four guest assessments that used to sit in production are GONE** —
  swept on 2026-11-10 the moment the `/health` trigger deployed
  (`lastDeletedCount: 4`). They were correct to have no ledger row while they
  existed: a GUEST assessment has a null `user_id`, so there is no pool to
  charge. A guest is not billed, is bounded by `recommendationsLimiter`
  rather than `FREE_ASSESSMENT_CAP` (which counts per authenticated account),
  and cannot download the PDF, which is tier-gated as a sold feature. What
  was NOT correct is that they outlived their 72-hour window by at least a
  fortnight. Reconciliation figures that assumed those four rows exist are
  now stale.
- Closed: a superadmin can now grant or comp licences, and both that route and
  school creation accept an optional amount so a sale made offline is recorded
  as revenue rather than as a giveaway. The Stripe webhook is still the only
  path that takes a payment; tests write to the database directly to stand in
  for one.
- The org-admin surface is partly covered now. `org-admin.mjs` takes the five
  endpoints that had NO references in any suite — bulk-reset-passwords,
  import-students, export-assessments, export/reports and the logo upload —
  and all five guards hold. **bulk-reset-passwords answers 200 with
  `success: true` even when every member in the batch was refused**, so a
  status-based test passes identically whether the guard works or is absent;
  proved by removing the per-member org check, which let school A reset school
  B's students' passwords while still returning 200. Judge that route by
  whether the victim's password still logs in, never by its response.
- **The question CRUD, bulk-upload and organization PATCH surfaces are covered
  now** (`admin-writes.mjs`, 11 cases). Every guard held when read AND when
  run, and each was confirmed load-bearing by removing it:
  - dropping `isSuperadminOnly` from `POST /api/admin/questions` and
    `/bulk-upload` let a school admin write to the national bank (201) and **a
    school STUDENT write a question into the bank their own quiz is drawn
    from** — bulk upload wrote two rows in one request
  - removing the org-id comparison in `PATCH /api/admin/organizations/:id` let
    school B rename school A
  - making the licence fields writable by a non-superadmin let an org admin set
    itself **99999 licences and unlimited**
  **`totalLicenses` from a non-superadmin is answered 200 and silently
  DROPPED**, so that case is 200 whether the drop happens or not — the same
  shape as bulk-reset-passwords. Judge it by reading `total_licenses` before
  and after, never by the status. W-08 is the control that keeps this honest: a
  school can still rename itself.
  **At least SEVEN chains carry only `isAuthenticated` with the real check
  inside the handler, not the two this said.** `PATCH /api/admin/organizations/:id`
  and, in `country.routes.ts`, all five write routes: `POST /api/admin/countries`
  (:333), `PATCH /api/admin/countries/:id/license-price` (:591),
  `PUT /api/admin/countries/:id` (:662),
  `POST /api/admin/countries/:id/generate-questions` (:754) and
  `POST /api/admin/countries/:id/repopulate` (:879). Every one was read on
  `main` 2026-11-09 and every one is genuinely guarded —
  `checkSuperadmin` → 403 as the first statement — but the shape means deleting
  four lines leaves a route that still reads as protected, which is why this
  shape gets tested rather than reviewed.
  **The five country routes are covered now** (`country-writes.mjs`, 12
  cases). `new-country.mjs` has zero 403 assertions — it builds a country and
  a school in it and never asks whether a non-superadmin is refused — and that
  mattered more than it looked: `PUT /api/admin/countries/:id` writes
  `curricula`, `subjects` and `gradeLevels`, which decide which quiz bank every
  student in that country draws from. All five guards hold, and the PUT was
  confirmed load-bearing by mutation: with its `if (!isSuperadmin)` disabled a
  SCHOOL STUDENT rewrote the curricula, subjects and grades of their own
  country, answered **200**. The guest case still passed under that mutation,
  because `isAuthenticated` is a different guard — which is the reason the
  student and org-admin rungs exist rather than a guest case alone.
  Three things that suite had to learn, all recorded in it: `code` is REQUIRED
  on create and must be 2–3 uppercase letters, and omitting it leaves the three
  denial cases passing against a create route that cannot create anything —
  green and worthless without the positive control. The two LLM routes are safe
  to test offline because `checkSuperadmin` is the first statement, long before
  any Anthropic call. And **eight tables reference `countries`**, not one:
  offering a curriculum SEEDS ITS SIX SUBJECTS, so a country cannot be deleted
  until its `subjects` rows are, and the suite's own leftover-country WARNING is
  what caught that.
  `PATCH /api/superadmin/quiz-questions/:id` and the superadmin promote route
  are covered now (`superadmin-writes.mjs`, 15 cases), and running them found
  a real bug that reading could not — see the next bullet.
- **`isPrimaryAdmin` was missing from `getOrganizationMembersByOrganizationId`'s
  select list, and four callers read it off those rows.** Each got `undefined`,
  so each guarded branch never ran. Nothing errored, nothing logged:
  - the promote route's demote never fired, so every promotion ADDED a primary
    admin instead of moving it. The route answered 200 and the promoted admin
    really was primary, so it looked like it had worked.
  - **the remove-admin guard could not fire**: `if (adminToRemove.isPrimaryAdmin)`
    was always false, so "Cannot remove primary admin. Transfer primary admin
    role first." was dead and a school's primary admin was deletable. Proved by
    mutation, and the suite's own output says it — `P-07 … HTTP 200 row=GONE`.
  - the admins listing returned `isPrimaryAdmin: undefined`, so the superadmin
    UI marked no admin as primary and offered Promote on all of them.
  - two `admins.find(a => a.isPrimaryAdmin) || admins[0]` fallbacks always took
    the fallback. That `|| admins[0]` is why this survived: it made the most
    visible symptom look plausible.
  One line fixes all four. The HANDLERS were correct — the query was wrong —
  which is why this is in the "executing something, not reading" column:
  reading `superadmin.routes.ts:692` shows a correct demote.
  Note for anyone writing a suite here: a never-used Session has no
  `csrf_token` cookie, so its first state-changing request is refused **403
  CSRF_MISSING** before authentication is consulted. A guest case must `GET`
  something first or it asserts against the wrong guard — the first draft of
  `superadmin-writes.mjs` had one case fail and another "pass" with a 401 it
  only got because the earlier 403's Set-Cookie had supplied a token.
- **Verified against the repo 2026-11-08, after five "open items" turned out to be
  stale.** Each line below was confirmed by reading the code on `main`, not by
  reading a document. Documents in this repo were wrong three times in one day.
  - **Translation editing is DISABLED and returns 501**, with
    `TRANSLATION_OVERRIDES_NOT_PERSISTED` (`superadmin.routes.ts:3084-3112`). It is
    NOT the old "writes to the wrong directory" bug. GET still works and is
    accurate. The real fix — DB persistence plus a `/locales` route that merges
    overrides over the built bundle — is unbuilt; a path change alone would be
    erased by the next redeploy, which is why it was refused rather than moved.
  - **The admin student-edit PATCH accepts `fullName, grade, studentGender,
    studentId, dateOfBirth`** (`admin.routes.ts:1105`). The recon's claim that it
    takes name and grade only is stale. Age is derived from `dateOfBirth`, so
    there is no `studentAge` to accept.
  - **Guest → account claim IS built AND NOW PROVEN** (`guest-claim.mjs`, 8
    cases). FOLLOWUP's "guestSessionId never stored" is stale; it is stored
    (`storage.ts:2578`) and `migrateGuestAssessments` (`storage.ts:1438`)
    requires all three of: the row exists, has no `userId`, and its
    `guestSessionId` equals the httpOnly `guest_token` cookie. **The ids in the
    request body are a filter, not the credential** — the cookie is.
    Mutation-tested by deleting that one comparison, and the result is the
    reason the suite exists: an unrelated account claimed the victim's
    assessment (`migrated=1`, victim row reassigned), and the rightful owner
    could then neither claim nor see their own — six of eight cases fail, so
    the mutation both steals a minor's data and breaks the feature.
    Two things the suite had to learn the hard way, both recorded in it:
    idempotency comes from the route CLEARING the guest cookie on success, so a
    retry is a 400 with no session and never reaches the `!userId` check — that
    check is the second line, not the first. And a validation case must run on
    an AUTHENTICATED session, or `isAuthenticated` answers 401 first and the
    case passes while proving nothing.
    Only two flows reach this in the product: `RegisterParent.tsx` and
    `AuthCallback.tsx`. `POST /api/register` is retired (410
    `FREE_TIER_RETIRED`), so there is no free self-registration to claim
    through, and **the OAuth path cannot be exercised offline** — it stays
    unproven.
  - **Dependency advisories: run the tool, the figures here go stale fast.**
    As of 2026-11-09, `npm audit --omit=dev` reports **10 high, 8 moderate, 1
    low**. The six that the previous version of this bullet called out as "in
    the live request path" — `body-parser`, `compression`, `multer`,
    `brace-expansion`, `source-map-js` — are **all clean now** (body-parser
    1.20.9, compression 1.8.2, multer 2.5.0), so its advice to do multer and
    body-parser first now points at nothing. That is the second time a
    written-down audit figure has misdirected work here; check the command.
    What remains needs a MAJOR bump either way, and the reachability is not
    equal:
    - **Nine are the puppeteer chain** (puppeteer, puppeteer-core,
      @puppeteer/browsers, chromium-bidi, extract-zip, basic-ftp, get-uri,
      pac-proxy-agent, proxy-agent) and the two that carry real weight —
      extract-zip symlink traversal, basic-ftp quadratic `Client.list()` — sit
      in the **browser download and extraction** path, not the PDF render path.
      Exploiting them means controlling the archive or FTP server puppeteer
      fetches from, i.e. Chrome's own download host at deploy time. Not
      reachable by a user of the app. Build-time supply chain, not request path.
    - **One is `zod`** (GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404), and it IS in the
      request path: `$ZodArray` accumulates an issue object per failing element
      with no cap, so a large array of elements that all fail validation grows
      memory until the process dies.
      **EVERYTHING THIS BULLET USED TO SAY ABOUT THE FIX WAS WRONG, and it
      was wrong because it was read rather than run.** It said bounding the
      arrays "works on v3" and that the upgrade would buy nothing. Measured on
      2026-11-12, the same parse on both versions,
      `z.array(z.string().max(3)).max(20)` given 200,000 failing elements:
      - **zod 3.25.76: 200,001 issues, 93 MB.** The `.max(20)` is checked
        AFTER every element is parsed, so a bound on v3 stops nothing.
      - **zod 4.6.7: 1 issue, 2 ms.** The bound short-circuits.
      So the bounds added on 2026-11-09 take effect only on v4, and the
      upgrade is what makes them real. An UNBOUNDED array accumulates on both.
      **"ZERO unbounded `z.array(`" was true of the text and false of the
      product.** `createInsertSchema` derives an unbounded array from every
      `text[]` column, and `insertAssessmentSchema` is parsed on
      `POST /api/assessments` — no account, no rate limit. Two of its array
      fields (`interests`, `strengths`) had no pre-check, and running it
      showed something worse than the advisory: **on `main` a stranger's
      200,000-element array was ACCEPTED AND STORED**, 391 KB a request,
      as often as they liked. On the zod 4 branch the same request was
      refused after 0.9 s, ~250 MB and a **25 MB reply**; three took the
      process from 550 MB to 1.1 GB.
      **Closed at the door, not field by field**: `shared/bodyShape.ts`
      (10 tests) checks the SHAPE of every parsed body once in
      `server/index.ts`, before any handler or schema — 5,000 elements an
      array, 1,000 keys an object, 32 deep, 50,000 values in all — and
      answers **413 `BODY_TOO_COMPLEX`**. Iterative, because a recursive walk
      of `[[[[…` is a stack overflow. The bulk question import is exempt by
      the same path test that exempts it from the byte cap.
      `body-shape.mjs` (7 cases) judges it by the DATABASE: B-02 asserts no
      row was written. Mutation-tested — without the guard B-02 reports
      `widest interests=200000`. B-06 is the control that the exemption is by
      path and not by role. **B-03's first draft passed on the wrong 413**:
      200,000 quoted strings exceed the BYTE cap, and express answers 413 for
      that too, with no `reason`.
      `interests` and `strengths` are also bounded where the other prompt
      fields are (`assessmentValidation.ts`: 30 entries, 64 characters,
      strings only — a number used to be stored as its string form).
      `body-shape.mjs` B-07/B-08.
      **Guest assessment creation is rate-limited per address: 60 an hour,
      GUESTS ONLY** (`guestAssessmentLimiter`). Signed-in takers are skipped
      entirely, because a school lab is thirty students behind one address
      and a per-address limit on everyone would lock a classroom out
      mid-lesson. `guest-rate.mjs` (5 cases): R-04 is the one that matters —
      a signed-in student at the exhausted address still starts an
      assessment — and R-03 is the control that the limit is per address.
      The byte cap in `server/index.ts` (512kb; 10mb for
      `/api/admin/questions/bulk`, superadmin-gated) is still there and is
      not a shape cap.
      **BOTH MAJORS ARE MERGED (2026-11-12).** puppeteer 25 first, with no
      source change; then zod 4 with drizzle-zod 0.8 and @hookform/resolvers
      5. On the merged tree: 53 harness suites, the unit tests, a production
      build, and all four zod-resolver forms driven in a browser — login,
      forgot-password, parent registration, and reset-password end to end
      (token planted in SQL, weak and mismatched passwords refused with the
      form's own wording, the new password then signs in).
      `ZodError.errors` is GONE in v4 — use `.issues`, which exists on both.
      One of the ten sites was `any`-typed and invisible to tsc; at runtime it
      would have been `undefined.map` inside a catch, a 500 where a 400
      belonged. `required_error` / `errorMap` are now `error`.
      **PUPPETEER 25 IS VERIFIED ON PRODUCTION** (2026-11-12, build
      `16629c6`): the superadmin bulk report export for a school with three
      completed assessments returned a 1.1 MB zip holding three PDFs, in 87
      seconds, and the process did not restart. That exercises Render's
      Chrome download, the launch, and the bulk path no harness suite
      renders. The PDFs were counted, not opened. The single-report route is
      owner-only and answers 403 to a superadmin, correctly, so it was not
      the route used.
      **An earlier note here said production had no completed assessment.
      That was a false negative of mine**: `/api/superadmin/students` nests
      the id at `user.id`, the probe read `id`, and every lookup answered 404
      — which was read as "none" instead of as a failed lookup.
  - **WRONG AGAIN — SEE THE STUDENT WALK ABOVE: the results page DID print
    the US figure until 2026-11-12.** What this said: US salaries do NOT reach students. An earlier version of this very bullet
    said they did, and it was wrong** — a good example of why a claim here needs
    a grep behind it. `seed.ts:965+` does seed US dollar strings into
    `careers.average_salary`, but **no client file reads either salary column**,
    and **no prompt template anywhere contains `{{salaryRange}}`**, so the value
    was built and interpolated into nothing. The results page omits the
    salary-and-growth block for free reports and renders no salary for premium
    either; growth is an enumerated, localised band via `shared/growthBands.ts`,
    not a verbatim O\*NET string. `careers.average_salary_local` is a dead column,
    which is true and harmless.
    What WAS real is a trapdoor, now closed: `userPromptTemplate` is editable from
    the superadmin UI (`superadmin.routes.ts:1609`), so adding `{{salaryRange}}`
    to a template was a no-code, no-review action that would have put US dollars
    in front of a UAE student. `shared/careerSalary.ts` now resolves that variable
    to the LOCAL figure or a neutral phrase and **never** to
    `average_salary`. Behaviour today is unchanged by design; what a template edit
    can cause is not. Converting the US figure at the dirham peg was considered and
    rejected: the peg makes the currency exact and leaves the number wrong, since
    American pay levels are not local ones.
  - **Webhook event-ID idempotency: CLOSED** (migration 034,
    `stripe_webhook_events`). The handler claims `event.id` with
    `ON CONFLICT DO NOTHING ... RETURNING` before doing any work, after
    signature verification so a forged request cannot pre-claim a real id. A
    duplicate answers **200** with `duplicate: true` — not 409, because Stripe
    retries anything non-2xx for ever. A claim that cannot be written fails
    CLOSED with a 500; a handler that throws has its claim DELETED so the retry
    can run, because an unexplained licence count is recoverable from Stripe and
    a lost sale is not. The old guard, `paymentIntent.metadata.processed`, is
    still in place but was never sufficient on its own: it is read off the EVENT
    PAYLOAD, which carries the creation-time snapshot, so on a real retry it is
    absent even after the first delivery stamped it. Proved by mutation —
    disabling the dedupe fails W-03 and W-07. **Not covered:** that the route
    calls the release on failure (no deterministic way to make a handler throw
    without a network call), and atomicity under real concurrency — see the
    harness note above. A claim stranded by a process that died shows up as a
    row with a null `processed_at`.
  - **The checkout create race: CLOSED, and it was found by making a real
    purchase on 2026-11-09, not by reading.** (An earlier version of this line
    said "by spending real money". That was wrong and the error was mine:
    production runs `pk_test_`, verified in the deployed Checkout chunk, so the
    charge was Stripe TEST mode and the buyer was the owner. The bug and the
    transaction were real; the money was not.) Both `/api/checkout/complete` and the
    Stripe webhook act on the same payment, and Stripe calls the webhook the
    instant the card clears while the browser still has to round-trip, so the
    webhook usually wins. Both read "no such user", both inserted, and the
    loser threw on `users_email_unique` — the buyer was charged AED 3,600 (test
    mode) and
    told "Checkout failed, please try again", which invites a second charge.
    No check before the insert can close it; every check-then-act leaves the
    same window. `grantIndividualPremium` now ACCEPTS the unique index's
    verdict: on 23505 (including wrapped as `.cause`, which is the shape
    Drizzle actually threw) it re-reads by email and returns
    `already_premium`, whose contract is already "grant nothing, change
    nothing" — the winner granted the full `studentCount`, so writing the
    figure again would double it. Narrowed by OUTCOME, not constraint name: a
    unique violation that finds no account by email is rethrown.
    `premiumGrant.race.test.ts` covers it with storage mocked, because the
    harness runs PGlite on ONE connection and cannot produce this race at all.
  - **THE WEBHOOK CREATING THE SCHOOL FIRST WAS ANSWERED 409: CLOSED
    2026-11-11, found on the FIRST REAL GROUP PURCHASE ever put through the
    site.** Two commits on 2026-11-09 each fixed one half of the same race and
    between them opened this. The race fix made `already_premium` fall through
    to the group block, with a comment saying that was safe "because the
    webhook's grantIndividualPremium is individual-only and makes no
    organization". The group backstop, committed hours later, made the webhook
    run that same group block — so the webhook creates the SCHOOL too, and that
    sentence became false with nobody editing it. The browser then arrived
    second, `createGroupPurchaseTransaction` threw "already has an
    organization", and the route turned it into **409 "This account already
    manages a school"** for a purchase where the card had cleared, the school
    existed, the licences were granted and the setup invite had been emailed.
    Only the ANSWER was wrong — and it is the answer that invites a second
    purchase, which is exactly what the 11-09 work existed to stop. The buyer
    did try again; `/api/checkout/preflight` caught the retry, which is the
    only reason this cost nothing.
    **The distinguisher is the PAYMENT, not the timing.**
    `organizations.stripe_payment_id` is written by
    `createGroupPurchaseTransaction`, so a school created BY THIS payment is
    adopted and anything else is still refused — narrowed by OUTCOME, exactly
    as `grantIndividualPremium`'s 23505 recovery is. Nothing is granted again
    (the winner wrote the full `studentCount`), and execution continues to
    `sendSchoolSetupInvite`, which is idempotent on the token and so mails
    nothing when the webhook already did.
    `payment.webhookWonRace.test.ts` (6 cases). Route tests with Stripe and
    storage mocked, because **the offline harness cannot run
    `/api/checkout/complete` at all** — its first act is a live
    `paymentIntents.retrieve` and there is no network. Mutation-tested by
    restoring the unconditional 409: the first case fails with `expected 409 to
    be 200`, the production symptom exactly. The three refusal cases are the
    controls (different payment, null payment id, no school at all), plus a
    positive control for the browser winning and an unrelated-failure case so
    the narrowing cannot swallow a real error.
    **The lesson is about the COMMENT, not the code.** A comment asserting what
    a *different* component does is a fact with no test behind it, and the
    second commit invalidated it silently. When one path's correctness depends
    on another path's behaviour, assert that behaviour in a test — a sentence
    cannot notice when it stops being true.
  - **A group purchase must produce a SCHOOL even if the browser never comes
    back: CLOSED** (`webhook-group-backstop.mjs`, 7 cases). The same live
    purchase exposed a second defect with the same cause: the webhook backstop
    called `grantIndividualPremium`, which is individual-only, so a
    100-student purchase whose `/api/checkout/complete` never landed produced
    an `individual` account holding 100 licences and **no organization** —
    nothing to enrol into, and invisible to licence reconciliation, which only
    looks at schools. The webhook now runs the same group block the
    interactive path does, gated on `studentCount > 1 && organizationName`.
    Mutation-tested both ways: disabling the block reproduces the production
    shape exactly (`orgs=0`, `account_type=individual`, 100 licences, no
    ledger row, B-01/02/03/04 fail), and widening it to every payment with a
    name fails B-05, the control that a one-seat purchase gets no school.
    Two things recorded in the suite rather than rediscovered:
    **the fixture must carry `userId: "guest"`** or `handlePaymentIntentSucceeded`
    returns at its first check and every case answers 200 having done nothing —
    the first draft did exactly that, and `expectedAmount` must equal `amount`
    for the same reason. And a completed group purchase leaves
    `users.purchased_licenses` at **2 × studentCount**:
    `grantIndividualPremium` SETS it and `createGroupPurchaseTransaction` then
    ADDS it (`storage.ts:2985`). The interactive path has always done the same
    two steps in the same order, so that is the product's existing shape, and
    the figure is provably unread for an org admin — `getLicensePoolForUser`
    reaches `purchasedLicenses` only for a PARENT pool, gated on a
    `child_profiles.guardian_user_id` row, while enrolment reads
    `organizations.total_licenses`. Left alone deliberately: cosmetically
    wrong, unread, and "fixing" it would touch the live interactive money path
    for no behavioural gain. B-04 therefore asserts the DELTA (nothing moved)
    rather than an absolute figure.
  - **A GROUP BUYER NOW GETS AN EMAIL, A PASSWORD AND AN ONBOARDING — built
    2026-11-09 across five commits.** Before it, NO code path sent any mail on
    purchase: the generated credentials were returned in the HTTP response and
    rendered once on the checkout success screen, so a closed tab, or the
    webhook completing the purchase while the browser never came back, left a
    paying customer with an account they could not enter. The only route back
    in was "Forgot password" — a recovery flow standing in for an onboarding
    one, and the wording telling them so was mine. UAE Skool reached exactly
    that state.
    - `school_setup_tokens` (migration 035), deliberately NOT
      `password_reset_tokens`: seven days rather than one hour, re-sendable by
      a superadmin, and `sent_at`/`sent_count` are the only evidence the system
      holds that the mail went out.
    - `sendSchoolSetupInvite` is ONE helper called from both
      `/api/checkout/complete` and the webhook, idempotent on the TOKEN rather
      than on a flag, so a raced purchase mails one link and not two. It never
      throws: the buyer is charged and the school exists, and an error escaping
      inside the webhook would release the event claim and have Stripe retry a
      grant that already succeeded.
    - `/school/setup/:token` sets the password, spends the link and signs them
      in. GET describes the link WITHOUT spending it, so opening the mail on a
      phone and finishing on a laptop works.
    - **THE ONBOARDING IS FOUR STEPS, NOT THREE.** Every enrolment route carries
      TWO gates: `schoolSetupGate` (country, curriculum) AND `consentGate` (the
      school's own guardian-consent attestation). A flow covering only the
      first still ends in a 409 the buyer cannot interpret. Consent cannot be
      moved or supplied for them — `POST /api/my-organization/consent` is
      org_admin-only with no superadmin path, deliberately. The existing
      `OrganizationConsentCard` is reused, because it posts the rendered
      wording back and the record stores its hash.
    - The superadmin directory shows a STAGE, not a tick
      (`shared/schoolSetupStage.ts`, pure and tested): a yes/no cannot tell
      "the mail never arrived" from "they got in and stopped", and those need
      opposite actions. Resend is offered — and the route only permits it — for
      `never_signed_in`.
    - **DELIVERED vs NOT-DELIVERED: CLOSED at the data layer** (migration 036,
      `POST /api/webhook/resend`), **still unsurfaced**. `used_at` proves a
      click; a null used to cover a bounce, a spam folder and an unopened inbox
      alike, and those need opposite actions — correct the address, or resend
      and telephone. Four columns on `school_setup_tokens` now record what
      Resend reports, joined on `provider_message_id`, which is captured from
      the send call and is UNIQUE (partial, since an unsent token has none).
      **Null still means UNKNOWN, not failed** — an unset secret, an
      unconfigured webhook and Resend being down all produce nulls, so no
      surface may render one as "did not arrive".
      `shared/emailDelivery.ts` holds the rule that matters: **Resend emits
      `email.sent` and `email.delivered` milliseconds apart and they travel
      separately, so `sent` arriving AFTER `delivered` is ordinary.** A handler
      writing the latest event would downgrade rows at random and the
      superadmin column would flicker with nothing in the product changing.
      Statuses are ranked and an event may only move a row FORWARD; the rule
      lives in the UPDATE's own WHERE clause (`blockingStatuses`), not in a
      read before the write, so two events racing are arbitrated by the
      database — the check-then-act family that produced the checkout create
      race. Mutation-tested: removing that clause fails R-05 (a late `sent`
      downgraded `delivered`) and R-07 (a redelivery overwrote a bounce).
      `email.opened`/`email.clicked` are deliberately IGNORED — open tracking
      is a pixel that Apple MPP and Gmail's proxy fire or suppress on the
      recipient's behalf, so a status built on it is wrong in both directions.
      **SURFACED, and it splits the old "never signed in" THREE ways**, because
      that one label covered three situations with three different next
      actions: `invite_undeliverable` (the address is wrong — correct it, then
      resend), delivered-but-unused (it arrived; telephone them), and unknown
      (resend is a reasonable first try). `invite_undeliverable` is a fifth
      stage ranked ABOVE `never_signed_in`, and it is deliberately NOT applied
      once the admin has a password — a bounce on an old invite is irrelevant
      to a school that got in another way, and reporting it would send someone
      chasing a problem that resolved itself. **`canResend` stays TRUE on a
      bounce**: correcting the address and resending is the remedy, so the
      stage carries the warning and the route keeps the action. A resend
      CLEARS the delivery columns, or the previous attempt's bounce would be
      reported against the new mail. `setup-stage.mjs` S-09 to S-12 assert all
      four states through the real listing route, not the pure function.
      **Also needs doing on the Resend side:** the endpoint must be registered
      in the Resend dashboard and `RESEND_WEBHOOK_SECRET` set on Render.
      Until both, every status stays null and that is indistinguishable from
      a working webhook with nothing to report.
      Password-reset delivery is a DELIBERATE non-goal: a reset is requested by
      someone already watching their inbox, who retries by themselves, so the
      information has no action attached to it. A general `email_deliveries`
      table was the first design and was dropped — it added a second
      person-referencing column (its own subject-access classification, its own
      erasure ordering) to serve one surface.
    Suites: `setup-invite` (5), `school-setup-link` (14, ending in a student
    actually enrolled), `setup-stage` (9), `migration-035-dryrun` (9),
    `resend-webhook` (11), `migration-036-dryrun` (8), plus
    `schoolSetupStage.test.ts` (11), `emailDelivery.test.ts` (17) and
    `email.schoolSetup.test.ts` (5).
  - **THE INVOICE IS NOW EMAILED, WITH THE PDF ATTACHED** (migration 038,
  `POST /api/superadmin/invoices/:id/send`). 037 gave the invoice a number,
  figures and a lifecycle but no way to record that it had been SENT to
  anyone, which leaves the chase conversation unanswerable: a school that has
  not paid and a school that never received the bill look identical from this
  end, and only one of them is ignoring you.
  `email_sent_at` is deliberately NOT `issued_at` — an invoice can be issued
  and handed over on paper, or issued now and emailed a week later, so one
  column cannot express "issued but never emailed", which is the state worth
  seeing. The four delivery columns are IDENTICAL to `school_setup_tokens`' in
  name and meaning, joined on the provider's message id and written by the
  SAME Resend webhook under the same forward-only rule
  (`shared/emailDelivery.ts`) — the route falls through to `invoices` when a
  message id matches no setup token. One handler, because the rule is the part
  that must not drift. **Null still means UNKNOWN, not failed.**
  The PDF is ATTACHED, never linked: a finance officer forwards the attachment
  to whoever releases the payment, and a link would send that person to a
  login they do not have. No pay button — settlement is a bank transfer and
  the details are on the document.
  **A DRAFT IS REFUSED**, because emailing one is what issuing means; so is a
  cancelled invoice. The recipient is the invoice's own `bill_to_email`, then
  the school's registered administrator, and an explicit `email` in the body
  overrides both — **and an override is NOT written back**, or the rendered PDF
  and the row would disagree about who was billed. A resend is allowed, unlike
  the setup link's, and `email_sent_count` is what tells a superadmin whether
  chasing has already happened.
  **THE SEND REFUSES OUTRIGHT WHEN THE SUPPLIER'S PAYMENT DETAILS ARE UNSET**
  (`SUPPLIER_DETAILS_MISSING`). The payment panel is the one part of this
  document a school acts on, and a bill carrying `[YOUR IBAN]` into a finance
  inbox is worse than no bill — it cannot be paid, and it gets a supplier
  queried rather than settled.
  **THE LEGAL NAME HAS NO DEFAULT ANY MORE.** `supplierFromEnv` used to fall
  back to a company name written into the source from a DRAFT trade licence —
  a name not yet issued. It is now `INVOICE_LEGAL_NAME` /
  `INVOICE_LEGAL_NAME_AR` or nothing: the document prints
  `[REGISTERED LEGAL NAME]`, and the send refuses with `legalName` in its
  missing list. The Arabic name does not borrow the English one.
  `invoicePdf.supplier.test.ts` (6).
  **Still needs setting on Render:**
  `INVOICE_LEGAL_NAME`, `INVOICE_LEGAL_NAME_AR`, `INVOICE_ADDRESS`, `INVOICE_ADDRESS_AR`, `INVOICE_BANK_NAME`, `INVOICE_BANK_ACCOUNT_NAME`,
  `INVOICE_IBAN`, `INVOICE_SWIFT` — and `INVOICE_TRN` ONLY once VAT
  registration is actually in effect, since that one variable is what turns a
  proforma into a tax invoice.
  **A REAL DEFECT CAUGHT BY MUTATION, and it was mine.** A log-only
  environment answers `{ success: true, messageId: "dev-mode-no-email" }`, and
  storing that sentinel in `provider_message_id` fills the one slot the unique
  index allows — so **exactly ONE invoice per database could ever be emailed**,
  and every send after the first answered 500 for a mail that had in fact gone
  out. `sendSchoolSetupInvite` had the same shape, where its own outer catch
  rendered it as "could not send". `providerMessageIdOrNull`
  (`shared/emailDelivery.ts`, 5 tests) is now called at every site that writes
  one; never `?? null`. Reverting it fails E-06 through E-09.
  Suites: `invoice-send` (13), `migration-038-dryrun` (9). **E-07 is the case
  that matters** (a resend does not collide); **E-12 is the control** — a
  bounce for an invoice must touch no setup token, or a fall-through that wrote
  both tables would pass everything above it. Removing the fall-through fails
  E-10, E-11 and E-12.
  **Not covered:** that a real provider message id is captured from the send
  (no provider offline, so E-10 onward plant the id in SQL), and the
  supplier-details refusal, which reads the environment the server booted with
  and so cannot be toggled from a suite — `supplierDetailsMissing` is
  unit-tested and the branch is two lines.
  **Also needs doing on the Resend side:** the same endpoint registration and
  `RESEND_WEBHOOK_SECRET` the setup-invite delivery tracking needs. Until
  both, every invoice delivery status stays null, which is indistinguishable
  from a working webhook with nothing to report.
- **THE INVOICE CARRIES THE SCHOOL'S OWN REFERENCE** (migration 039,
  `invoices.purchase_order_ref`). A school's finance department raises a
  purchase order before it settles anything, and its accounting system matches
  the invoice to that number. Without it the bill is matched by hand or queried
  back to us — the friction that turns a settled invoice into a chased one.
  **THE DOCUMENT ALREADY HAD A "Your reference" ROW, AND IT WAS RENDERING THE
  WRONG COLUMN.** It printed `payment_reference`, which is OUR record of THEIR
  bank transfer, written only when the invoice is marked PAID. So the one field
  a school needs in order to pay was absent from every unpaid invoice and
  appeared only after the money had arrived — labelled as theirs. Two facts,
  two owners, two labels now: `reference` / "مرجعكم" for the school's PO, and
  `paymentRef` / "مرجع السداد" for a transfer we received.
  Both are rendered `dir="ltr"`: a PO number is digits and hyphens, which bidi
  reorders inside Arabic text.
  **Nullable, free text, length-bounded, NOT unique.** A PO reference has no
  format anyone agrees on, so only length is validated (100, enforced at the
  database as well as in zod). Not unique because one school may put one PO
  against several invoices when it orders in instalments, and two schools may
  number the same way. An empty string is stored as NULL so the document's
  "render only when present" check has one value to test, not two.
  `migration-039-dryrun` (9 cases). **M-04 is the boundary from the permitted
  side** — exactly 100 accepted — without which M-03 would pass against a
  constraint accidentally set to any lower number. **M-05 asserts the absence
  of a unique index**, which is a deliberate property rather than an omission.
  `invoice-pdf` P-09 proves it reaches the RENDERED page and the document is
  still one page; **P-10 is its control** — an invoice with no PO prints no
  reference row, or P-09 would pass against a document that prints the row
  unconditionally with an empty value.
- **THE HOME PAGE HAD NO DOOR, AND THAT IS WHY NOBODY HAD EVER BOUGHT.**
  Until 2026-11-12 `Landing.tsx` had exactly two actions — sign in, and try it
  as a guest — plus three footer links, and **nothing anywhere in the product
  linked to `/group-pricing` or `/checkout`**. Both routes worked. Neither was
  reachable. A school that heard about Future Path could not find out what it
  cost, and the entire commercial pipeline (tiers, quotes, checkout, webhook
  backstop, school onboarding, invoicing) sat behind a door with no handle on
  the outside. The only public entry was the guest assessment, which is
  deliberately stripped of identity and deleted within 72 hours.
  **This is also the real answer to "nobody has walked a purchase end to end".**
  That had been read as nobody getting round to it. It was not reachable.
  A "For schools" action now sits in the hero and in the closing CTA, going
  straight to `/group-pricing` — the figures, not a plan chooser. Schools are
  the buyers; students arrive through their school, so it is the third action
  rather than the first.
  **THE PAGE OFFERS AN INVOICE, NOT A CARD FORM, AND THAT IS DERIVED.**
  `shared/paymentsLive.ts` (4 tests) reads `VITE_STRIPE_PUBLIC_KEY` and is true
  only for `pk_live_`. Production runs test keys, so today a real school's real
  card is DECLINED and a test card takes licences for nothing — neither is
  something to advertise to a head teacher. **Fails closed**: absent,
  malformed or unrecognised is not live, because the dangerous direction is
  offering a card form that cannot take money. **It changes the public OFFER,
  never the route** — `/checkout` still works when reached directly, which is
  how the purchase flow gets tested while the keys are test keys, and the day
  live keys are set on Render this flips back with no code change.
  Two faults the rendered page showed and the code did not:
  - **`-10%` rendered as `10%-` in Arabic** — a minus, digits and a percent are
    all neutral characters, so bidi reorders them. Same fault and same U+2066
    isolate as the invoice screens. It will keep recurring wherever a signed or
    punctuated number sits in translated text.
  - **"Back to Plan Selection" pointed at `/tier-selection` unconditionally**,
    a chooser written for individuals that a school arriving from the home page
    has never seen — so "back" sent them somewhere new. Now `history.back()`
    when there is history, with the old destination as the fallback for a tab
    opened straight onto the URL.
- **ENGLISH SPELLS IT "LICENCE" NOW — it used to spell it both ways, 42 and
  30.** Not split by screen either: `admin.json` alone carried 37 British and
  20 American, so the same word appeared two ways on one surface. 29 user-facing
  strings were converted (admin 20, profile 8, assessment 1). British is the UAE
  convention and was already the majority.
  **VALUES ONLY.** i18n KEYS keep `license` (`orgs.licenseStatus`,
  `premium.purchasedLicenses`) because a key is an identifier, not text, and
  renaming one breaks every component that reads it. Database columns, API
  fields and code identifiers keep `license_*` for the same reason — a rename
  there is a migration that changes nothing anyone sees. **The Arabic needed no
  spelling work**: ترخيص and تقييم were already used consistently throughout.
  **LICENCE AND ASSESSMENT ARE NOT SYNONYMS and were deliberately NOT merged.**
  A licence is entitlement a school holds and buys; an assessment is what a
  student sits; one licence is spent when one assessment produces a report.
  Collapsing them gives "250 assessments remaining, 88 assessments completed",
  which reads as one number contradicting another. What WAS wrong is welding
  them into one noun: `assessment.lock.orgStudentBody` said "your assessment
  licence" (and the Arabic "ترخيص التقييم" did the same), which tells a student
  they hold a licence for their own assessment. Both now name the two things
  separately.
- **SIGN-IN NAMES NO LONGER CARRY FOUR RANDOM HEX CHARACTERS, and removing
  them exposed what they were hiding.** `generateUsername` appended a 4-hex
  suffix UNCONDITIONALLY, not on collision — so every account ever created was
  `nasser.alali.36ad`, a string a school administrator has to read out to
  staff. The collision loops existed at all three call sites and never fired,
  because the base was always already unique.
  **The generator kept only `[a-z0-9]`**, so on a bilingual product sold to UAE
  schools: `ناصر العلي` produced `..36ad` — two dots — and `José Pérez` produced
  `jos.prez` with the accented vowels DELETED. Dropping the suffix alone would
  have made the Arabic case a username of `.`, so transliteration is the half
  that makes the change safe, not a nicety beside it.
  `shared/username.ts` (17 tests) holds it, pure: NFD first so a Latin diacritic
  separates and only the mark is dropped; an Arabic map with harakat stripped,
  so the same name typed with and without vowel marks gives the SAME username;
  `usernameBase` never returns a leading or trailing dot and falls back to
  `user`; `resolveUsername` takes the existence check as an argument and numbers
  readably — `nasser.alali`, `nasser.alali2`, `nasser.alali3`.
  **Transliteration is deliberately lossy and deterministic**: ناصر becomes
  `nasr`, not `nasser`. A username is a credential; stable beats pretty, and a
  scheme whose output changed between versions would be far worse.
  **THE THREE LOOPS HAD DRIFTED, which is the argument for one helper.** One
  retried with a fresh random suffix; one re-called the generator with the SAME
  arguments, so it depended entirely on the randomness being removed; and the
  third (`superadmin.routes.ts`, school creation) **had no give-up branch at
  all** — after ten collisions it fell through and created the account with a
  username it had just confirmed was taken.
  `username.mjs` (6 cases) asserts it through the REAL route, because the unit
  tests prove the rule and not that the product uses it. **U-00 exists because
  the first draft hit the SPA catch-all** (200 with HTML) and then a 400 — the
  create route is `/api/superadmin/organizations/create-with-admin` and its body
  field is `organizationName`, not `name`.
  Existing accounts keep their suffixed names: changing a live sign-in name is
  not a cleanup, it is locking someone out.
  **AND THE FOURTH GENERATOR WAS MISSED — the one every STUDENT goes
  through.** `storage.createUserWithCredentials` (manual add and CSV) kept its
  own: `[^a-z.]`, then the student id or six random characters. Found on
  production 2026-11-12 by adding students as a school admin: an Arabic name
  became `..ZZ-002`, the rest `ali.mohammed.n6hgky`. It now calls
  `resolveUsername`; the student id is no longer part of the name.
  `org-admin.mjs` O-15/O-16, through both real routes. **THAT FIX SHIPPED A WORSE
  BUG FOR TWO HOURS, and it was mine**: it read `userData.username ??
  generated`, the Add Student form posts a blank optional field as `""`, and
  `"" ?? x` is `""` — so a student added by hand got an EMPTY sign-in name
  and a credentials card with nothing beside "Username". One such student was
  created on production and removed. O-15 passed throughout because the
  fixture omitted the field; it now sends `username: ""` exactly as the form
  does, and fails with `username=""` against the old line. **A fixture has
  to send what the real form sends, including the blanks.** **Run `username.mjs`
  on a fresh database or before `org-admin`**: O-15 creates `nasr.alaly`, so
  U-02 then correctly gets `nasr.alaly2` and fails.
  The same walk found the bulk-upload dialog showing "Failed 2" and nothing
  else, while the server had always returned each failed row with its reason;
  the dialog lists them now. **Flagged, not changed:** the roster prints the
  stored grade value ("grade10") rather than a label, and its "N members"
  count includes the administrator.
- **THE TWO INVOICE SCREENS ARE BUILT** — a superadmin Invoices tab
  (`InvoiceManagement.tsx`, beside Licences, because an invoice marked paid IS
  a licence grant) and a school-side Billing card (`SchoolBilling.tsx`, under
  the licence figures on the roster page, org_admin ONLY).
  The school card is gated on `accountType === 'org_admin'` not for tidiness:
  `/api/my-organization/invoices` derives the school from the SESSION, so a
  superadmin viewing school A would be shown their OWN organization's
  invoices.
  **THE PRICE IS NOT AN INPUT.** The raise dialog QUOTES from
  `/api/pricing/quote` before anything is written, so the figure on screen and
  the figure a buyer would be charged come from one calculation. Its parameter
  is `students`, NOT `studentCount` — the route defaults to 1 on a wrong name,
  so a 500-licence order would silently quote one licence's price.
  **OVERDUE IS DERIVED, never stored.** Nothing has to be swept at midnight,
  and a stored column would be wrong between sweeps.
  **TWO FAULTS FOUND BY LOOKING AT THE RENDERED PAGE, neither visible in the
  code and neither caught by tsc or any test:**
  - The school card read `outstandingMinor`, the SUPERADMIN route's name for
    the figure; the school route answers `awaitingMinor`. The value came back
    undefined, `?? 0` turned it into zero, and the card announced **"Awaiting
    payment AED 0.00" directly above a table listing AED 17,000.00 awaiting
    payment.** Now read with a typeof check — absent means the tile is not
    drawn, because a missing number must not render as a confident zero on a
    screen about money — and `invoices.mjs` V-18 pins the field name and its
    arithmetic so a rename breaks a test rather than a screen.
  - **ISO DATES REVERSE UNDER ARABIC.** The bidi algorithm reorders runs of
    neutral characters, and a date is nothing but digits and hyphens, so
    `2026-11-10` rendered as `10-11-2026` — a DIFFERENT DATE to anyone reading
    day-month-year, on a screen about when money is due. `−10%` came out as
    `10%−` the same way. Fixed with U+2066/U+2069 isolates inside `dateOnly`
    rather than a wrapper element, because these go into translated sentences
    ("Issued {{date}}") where there is nothing to wrap and splitting the
    sentence would make it untranslatable.
  **Locale keys follow the repo's plural convention**: a BASE key beside the
  `_one`/`_other` (and Arabic `_two`/`_few`/`_many`) suffixes, as
  `assessment.json`'s `subjects.selected` does. Without the base,
  `i18nKeys.test.ts` fails — and that test is right to: it checks the literal
  a component passes.
  **The purchase-order field is now built** — migration 039, see below.
- **A SUPERADMIN CAN NOW DELETE AN ACCOUNT — there was no way to, before
    2026-11-10.** The only deletion path in the product was
    `DELETE /api/users/me`, self-service erasure needing that account's own
    password, so a test purchase or a checkout that stranded a premium account
    with no school left a row nobody could clear. Deleting that account's
    school does not help: `deleteOrganizationWithDependents` deliberately
    leaves admin users alone, so it creates another stranded account.
    `DELETE /api/superadmin/users/:id` REUSES `eraseUserData`, the same
    implementation the data subject's own erasure and a school's student
    removal both call — a second erasure written beside the route would drift,
    and accountErasure.ts lives in services/ precisely so "erasure" cannot mean
    different things depending on who asked.
    Four refusals, each for its own reason: a STUDENT is sent to the school's
    removal endpoints, because a minor's record carries an erase/detach choice
    this route cannot express; a SUPERADMIN is refused outright, since an
    endpoint that deletes the people holding the keys is a privilege surface;
    YOURSELF is refused and pointed at `/api/users/me`, which asks for the
    password again; and AUDIT RECORDS block exactly as they block self-erasure.
    **That last one forces the order**: `organizations.admin_user_id` is a
    blocking source, so a school's registered administrator cannot be erased
    while the school exists — cleaning up a stranded school is two acts, school
    first.
    Confirmed by EMAIL, not by id: the body must echo the account's own
    address, because a UUID in a URL is unreadable and one wrong character is a
    different person.
    `superadmin-delete-user.mjs` (11 cases) judges every denial by whether the
    ROW IS STILL THERE, never by status. Mutation-tested by disabling the
    superadmin guard and the email comparison together: D-03 deletes with NO
    confirmation, D-04 deletes on the WRONG email, and D-05b deletes another
    superadmin. D-05b exists because D-05 cannot reach that branch — when the
    target is the caller the self-check fires first, and the first draft's
    assertion accepted either code and so tested neither.
  - **"PURCHASE MORE LICENCES" TOOK THE MONEY AND GRANTED NOTHING. Removed
    2026-11-11.** `Profile.tsx:681` offered an already-premium account a link
    into tier selection → pricing → card form. Nothing stopped it: the
    preflight only refuses an SSO email and a buyer who owns a SCHOOL, and this
    buyer owns neither. The card cleared, `grantIndividualPremium` saw
    `isPremium` and returned `already_premium` — whose contract is "grant
    nothing, change nothing" — and the buyer was told it succeeded.
    **That contract is correct for the race it was written for** (the webhook
    granting this same payment first) **and cannot tell that case from a
    genuine second purchase**, because `users` carries NO `stripe_payment_id`
    to compare against — only `stripe_customer_id`. The school-side version of
    this same ambiguity was closed earlier the same day using
    `organizations.stripe_payment_id`; the individual side has no equivalent
    column, so there is nothing to narrow on.
    So the button is gone and the surface is a `mailto:` instead. **This was
    the ONLY surface inviting a repeat**: the other two links into that journey
    (`Profile.tsx:756`, `Assessment.tsx:1186`) are both gated on
    `!user.isPremium`, so they are free users upgrading, which grants
    correctly.
    **Do not re-add a purchase link here without somewhere to record which
    payment granted what.** A self-serve top-up needs that column first; until
    then any card path for an existing premium account charges for nothing.
    Note it was NEVER visible to a school admin — the block is gated
    `!isOrgAdmin && !isOrgStudent`, which is also why schools were unaffected:
    they pay by transfer against an invoice, which is what the invoicing exists
    for.
  - **There is NO in-account licence top-up, and the checkout refusals used to
    promise one.** `payment.routes.ts` has five POST routes and none of them
    sells licences to an existing school; `createGroupPurchaseTransaction`
    refuses a user a second organization, so a returning school cannot buy
    through the public checkout at all. `/api/checkout/preflight` now catches
    that before the charge (good) — but its copy said "sign in to add licences
    to it" and "purchase from your dashboard", neither of which exists. That
    was my wording and it sent a paying customer to a screen that is not
    there. Both strings in both locales now point at `support@futurepath.ae`,
    which is the real path: the superadmin licence add/remove route, with an
    optional amount so a bank-transfer sale records as revenue rather than a
    comp. Self-serve top-up is a genuine product gap, deliberately left open —
    it needs decisions nobody has made (where it lives, whether volume tiers
    apply to a second purchase, whether a cap applies), and the country must be
    taken from the ORGANIZATION rather than client-selected, since for an
    authenticated buyer it is finally server-derivable.
  - Email verification on registration is still genuinely ABSENT (no token
    column; `emailVerified` is only Google's OAuth boolean). **It does NOT gate
    live Stripe, and an earlier version of this line saying so was my own
    invention** — FOLLOWUP lists it as best practice 8.5 and a Phase 5 feature,
    never as a payment prerequisite. Stripe activation waits on the trade
    licence. Treat this as an ordinary product item, not a launch blocker.
    Scope when it is built: exactly ONE self-service path creates an account,
    `POST /api/register/parent`. `/api/register` is retired (410), group buyers
    are evidenced by a card payment — stronger than a click-link — and student
    accounts are admin-created. So verification guards the parent path alone,
    where the thing worth protecting is that a child profile (a minor's name,
    grade and school) gets stored against an address nobody proved they own.
    Reuse `password_reset_tokens`' shape and `sendPasswordResetEmail`'s send
    path rather than inventing a second token mechanism. What verification
    BLOCKS is a product decision and has not been made — do not pick one
    silently.
  - **`RESEND_API_KEY` IS set in production and WORKS — verified 2026-11-09** by
    requesting a password reset on futurepath.ae and receiving the mail from
    `noreply@futurepath.ae`. That single delivery proves the key is valid (not
    merely present), the domain is verified in Resend, `EMAIL_FROM` is right, and
    the templates render. `EMAIL_FROM` and `APP_URL` are set too.
    The older claim here — and the rationale comment in
    `email.logOnly.test.ts` — said the key was unset in production. Both were
    wrong. The TEST itself is sound: its assertions only exercise
    `isLogOnlyMailEnvironment()` against `NODE_ENV` and never read
    `RESEND_API_KEY`, so only the comment was stale.
- `docs/` holds two conflicting whitepapers —
  `future-path-white-paper-2026-v1.1.docx` and
  `future-pathways-white-paper-2026-v1.1.docx`, the second under the old
  "Future Pathways" name — plus an HTML copy. Figures in them still carry old
  branding and development data.

## Maintenance follow-ups, not audit findings

Deprecation warnings from `glob`, `recharts` and `jpeg-exif`. Note them; do
not chase them during other work.
