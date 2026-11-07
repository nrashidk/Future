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
5. **Schema changes go to staging first.** Production is `ep-floral-rice-...`,
   staging is `ep-soft-recipe-...`. Write a reversible migration, dry-run it
   against data shaped like production, and show the before/after counts before
   anything touches production.
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
`school-setup`, `question-gaps`, `peer-review`, plus `migration-029-dryrun` and
`migration-030-dryrun`.
`testing/local/README.md` has the details.

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
- **Do not "correct" a fixture to make a new test pass.** Deliberately invalid
  fixture data was once tidied up, and the test then passed while asserting
  nothing.
- **A pass on HTTP 404 is a pass on nothing.** A test that a removal changed no
  balances passed because the route path was wrong and nobody was removed.
- **One branch is not the behaviour.** A licence guard scoped to school
  students was tested with a school student, returned 403, and was written up
  as "the feature does not work for anyone". It worked for everyone else.

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

`license_consumptions` is the ledger and the only accounting record.
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

A submission passing the automatic LLM check goes to peer review, not to a
superadmin queue: three other schools vote and two agreeing decides. Six
rules, each of which fails silently if broken, so each has an assertion in
`peer-review.mjs`:

- a school never reviews its own work, in any country (the queue excludes it
  AND the write refuses it — the queue is a convenience, the write is the
  control)
- **a school reviews only its own curriculum**, enforced in the queue and the
  write both. Curriculum, NOT country: a British-curriculum school in the UAE
  is the right judge of a British-curriculum question from Saudi Arabia, and
  matching on country would starve the queue in every country with few
  schools — which is every new country. The queue reads the reviewer's
  curriculum as a subselect in the same statement, so no caller can pass the
  wrong one; the write reads it on `tx`. Both fail closed on a school with no
  curriculum. The negative case needs TWO schools on the other curriculum —
  with one, its queue is empty either way and "not offered" passes on an
  empty list
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
- Every report PDF ends with a near-blank page carrying only the footer, in
  both languages. The last career page fills the sheet and the footer
  overflows. Chromium honours `break-before: avoid` poorly, so this is
  pagination work across nine pages rather than a one-liner.
- Migration 029 (the licence ledger) is written and dry-run but **has not been
  applied to staging or production**.
- No superadmin route grants or comps a licence; the Stripe webhook is the only
  path. Tests write to the database directly to stand in for a purchase.
- Roughly a third of the org-admin surface has no automated coverage.
- `docs/` holds two conflicting whitepapers —
  `future-path-white-paper-2026-v1.1.docx` and
  `future-pathways-white-paper-2026-v1.1.docx`, the second under the old
  "Future Pathways" name — plus an HTML copy. Figures in them still carry old
  branding and development data.

## Maintenance follow-ups, not audit findings

Deprecation warnings from `glob`, `recharts` and `jpeg-exif`. Note them; do
not chase them during other work.
