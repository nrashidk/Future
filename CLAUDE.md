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
`progression`, `licences`, `new-country`, `contribution`, `crosscutting`,
`school-setup`, `question-gaps`, `peer-review`, `grants`, `pricing`,
`org-admin`, `checkout-preflight`, `school-lock`, `webhook-idempotency`,
`llm-gate`, `guest-claim`, `admin-writes`, `webhook-group-backstop`,
`superadmin-writes`, `country-writes`, `setup-invite`, `school-setup-link`,
`setup-stage`, plus
`migration-029-dryrun`, `migration-030-dryrun`, `migration-032-dryrun`,
`migration-033-dryrun`, `migration-034-dryrun` and `migration-035-dryrun`.

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

`migration-034-dryrun` and `migration-035-dryrun` EXECUTE the .sql file,
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

Repeating a grade is allowed, costs a licence, and warns first. Reward credits
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

Still open there, and a product decision rather than a bug: nothing retries an
`unavailable` submission once a credential works again.

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

## Known open items

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
- `scripts/verify-before.sql` and `scripts/verify-after.sql` are the read-only
  checks for the licence migrations. Two files, not one: before the migrations
  run, the new tables and the `countries.license_*` columns do not exist, and
  SQL resolves names at parse time, so a single script fails outright on the
  baseline run. Both follow `assessments.is_completed`, which is what 029's
  backfill joins on — counting `completed_at` instead reports assessments as
  uncovered that the migration skipped on purpose.
- Four completed assessments in production have no ledger row and that is
  correct: they are GUEST assessments with a null `user_id`, so there is no
  pool to charge. A guest is not billed, is bounded by
  `recommendationsLimiter` rather than `FREE_ASSESSMENT_CAP` (which counts per
  authenticated account), and cannot download the PDF, which is tier-gated as
  a sold feature.
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
      **The audit's own advice is wrong for this repo.** Per the advisory
      write-up, 4.6.6 only moved the size check ahead of element parsing for
      schemas that declare an explicit upper bound, and **no released version
      remediates the unbounded default case** — so migrating zod v3→v4 across
      every schema in the repo, which is a breaking major, would fix this only
      where `.max()` is already present. (Single-sourced: the GitHub advisory
      itself is not fetchable from the cloud container, so this came from a
      secondary summary. Verify before acting on it.)
      The mitigation that actually works needs no upgrade: **put explicit
      upper bounds on array/record/set schemas**, which works on v3. **Done
      2026-11-09 — there are now ZERO unbounded `z.array(` in server/ or
      shared/.** The eight that were unbounded were the seven arrays on
      `updateCountrySchema` and `contribution.routes.ts`'s
      `approvedQuestionIds`; every scalar on that country schema was already
      bounded, so the arrays were the only way in, and `curricula` was
      `.max(20)` with `.max(100)` elements on CREATE while unbounded on
      UPDATE — the same field, bounded on one verb and not its sibling.
      `country-writes.mjs` C-12 asserts the bound FIRES (21 curricula → 400,
      a 300-character name → 400, row untouched) and sends it as a
      superadmin, because an unprivileged caller would be stopped by
      `checkSuperadmin` first and the case would pass without testing the
      bound at all. `approvedQuestionIds` was capped at
      `MAX_QUESTIONS_PER_SUBMISSION` and deliberately NOT tightened to
      `.int().nonnegative()` — correct for an index, but that rejects input
      the route accepts today, so it is flagged rather than changed inside a
      bounding commit.
      The real limiter remains the body cap in `server/index.ts:132`: 512kb
      everywhere except `/api/admin/questions/bulk` at 10mb, and that route is
      superadmin-gated (proved in `admin-writes.mjs`).
      Neither major belongs on `main` unattended: Render auto-deploys every
      push, puppeteer drives a sold feature (PDF download), and zod v4 touches
      every validation schema. Branch them.
  - **US salaries do NOT reach students. An earlier version of this very bullet
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
    - **Nothing here can tell DELIVERED from NOT-DELIVERED.** `used_at` proves
      a click; a null covers a bounce, a spam folder and an unopened inbox
      alike. Every label says "not used". Real delivery data needs Resend's
      webhooks, which are not wired — that is the open follow-up.
    Suites: `setup-invite` (5), `school-setup-link` (14, ending in a student
    actually enrolled), `setup-stage` (9), `migration-035-dryrun` (9), plus
    `schoolSetupStage.test.ts` (11) and `email.schoolSetup.test.ts` (5).
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
