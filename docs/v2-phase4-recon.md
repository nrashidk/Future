# docs/v2-phase4-recon.md

**Phase 4 recon — school country/curriculum locking (L10). Current vs. target.**

Recon date: 2026-09-04. Method: **read-only** — no code changes, no commits. The only database access
was `SELECT`s against the **staging** Neon branch (`ep-soft-recipe-as…`; the prod endpoint guard in
`drizzle.config.ts:17-18` names `ep-floral-rice-astfwiew`, which this is not). Every claim below is
cited to `file:line` as read at commit `d630f82`.

Scope: **L10 only** — "School create/edit form: Basic Info + Country + Curriculum all MANDATORY →
pre-filled + LOCKED for the student (steps 1 & 3). Student can NEVER override school
country/curriculum." (`FOLLOWUP.md:1119-1121`, plan `docs/v2-rebuild-plan.md:22`).
**L11 (school students get the full premium quiz distribution) is already delivered** by commit
`2dab644` (Phase 1) — `server/routes/quiz.routes.ts` now derives tier from school membership, not
from `user.isPremium`. Phase 4 therefore delivers L10 alone.

**Out of scope, owned by another agent — not touched here:** the flow step-order / Country↔Subjects
swap, and the report/blur addendum. §6 flags the coupling between that swap and this work.

---

## 0. One-paragraph answer

Country and curriculum live on the **organization**, not the student, and are **optional everywhere**.
The school's *student* create form captures neither of them, and captures neither `studentName` nor
`studentAge` either — so most of "Basic Info" is not actually captured today. Client-side, four
Basic-Info fields are locked with a `disabled` attribute; Country and curriculum are not locked at
all. Server-side there is exactly **one** override — `curriculum` on `POST /api/assessments` — and
`PATCH /api/assessments/:id` has no org-awareness whatsoever, so a school student can set
`name`, `age`, `grade`, `gender` and `countryId` to anything with a single `curl`. Those five fields
select the quiz question pool, the subject-alias resolution and the career catalog, so overriding
them is not cosmetic: it changes the assessment the school paid for and the report a minor receives.

---

## 1. THE SCHOOL FORM — where a school admin creates/edits a student

### 1a. The three student-provisioning paths

| Path | Client | Server | Fields it can set |
|---|---|---|---|
| Single "Add Student" | `client/src/pages/AdminOrganizations.tsx:1484-1679` (`CreateMemberForm`) | `POST /api/admin/organizations/:id/members` — `server/routes/admin.routes.ts:487-566` | `username, fullName, grade, studentId, studentName, studentAge, studentGender, passwordComplexity` |
| Bulk CSV (the UI one) | `AdminOrganizations.tsx:1682-1728` (`BulkUploadForm`) — parses the CSV **in the browser** | `POST …/members/bulk` — `admin.routes.ts:570-714` | same set, per row, max 500 |
| CSV import (server-parsed) | **no client caller** (`grep import-students client/src` → nothing) | `POST …/import-students` — `admin.routes.ts:1780-2090` | same set, header-driven |

There is **no edit-student form in the UI at all.** `PATCH …/members/:memberId`
(`admin.routes.ts:720-778`) exists and works, but the only client callers under
`client/src` are `DELETE …/members/:id` (`AdminOrganizations.tsx:1872`),
`…/reset-password` (`:1892`), `…/bulk-delete` (`:198`) and `…/bulk-reset-passwords` (`:218`).
Nothing in the app issues that PATCH. **"the school edit form" does not exist yet — it has to be
built, not just extended.**

### 1b. What the single-create form actually captures

`AdminOrganizations.tsx:1487-1494`:

```ts
const [formData, setFormData] = useState({
  fullName: "", grade: "", studentId: "", studentGender: "",
  username: "", passwordComplexity: "medium",
});
```

Rendered fields: full name (`:1594`), grade (`:1602`), student ID (`:1623`), gender (`:1631`),
username (`:1648`), password complexity (`:1661`).

**Not captured: `studentName`, `studentAge`, `countryId`, `curriculum`.** Two consequences, both load-bearing:

1. **`studentName` is never set.** The form sends `fullName`; `storage.createUserWithCredentials`
   (`server/storage.ts:2622-2694`) splits `fullName` into `users.firstName`/`lastName` (`:2640-2642`,
   `:2661-2662`) and writes `organizationMembers.studentName` from the **separate** `studentName`
   field (`:2676`) — which the form never sends. So `student_name` is NULL for every student created
   this way.
2. **`studentAge` is never set** by this form either, so `student_age` is NULL too.

Both feed the pre-fill (§2) and the client lock (§3), which is why the "lock" is partly inert in
practice — see §3a.

Only `fullName` and `grade` are server-required (`admin.routes.ts:518-520`, and `:653-658` in bulk).
Neither the client form nor the server marks gender, age or student ID required.

### 1c. Where country + curriculum ARE captured — on the SCHOOL, and optionally

- **Create school** (superadmin only — gated at `AdminOrganizations.tsx:387`):
  `CreateOrganizationForm` `AdminOrganizations.tsx:922-1225`. Country select `:1111-1131`, with an
  explicit `"none"` option (`:1120`); curriculum select renders **only if** a country is chosen and
  that country has curricula (`:1133`). Submits to
  `POST /api/superadmin/organizations/create-with-admin` (`:961`) →
  `server/routes/superadmin.routes.ts:755-833`, which validates `organizationName`, licenses and
  admin name (`:770-780`) and writes `countryId: countryId || null, curriculum: curriculum || null`
  (`:831-832`). **No validation that either is present.**
- **Edit school** (visible to org_admin **and** superadmin — the dialog at `:548` is not gated):
  `EditOrganizationForm` `AdminOrganizations.tsx:1228-1481`, country `:1430-1449`, curriculum
  `:1450-1472`, submits `PATCH /api/admin/organizations/:id` (`:1256`) →
  `admin.routes.ts:294-338`, which accepts `countryId`/`curriculum` from the body with no
  validation (`:320-333`) and lets an org_admin change them for their own org (`:307-314`).
- `POST /api/admin/organizations` (`admin.routes.ts:258-279`) — the other org-create route — does
  **not** accept `countryId`/`curriculum` at all (`:260`). No client caller; it is a second,
  divergent create path.

**Net:** a school can exist with `country_id = NULL` and `curriculum = NULL`, and an org_admin can
change both at any time, including after students have completed assessments.

---

## 2. THE PRE-FILL — how a school student's data reaches their assessment

Two hops, and they are asymmetric.

### 2a. The server decoration (`GET /api/auth/user`)

`server/routes/auth.routes.ts:28-48`. For `accountType === 'org_student'` it fetches the member row
and the organization and decorates the user response:

| Decoration | Source column | Line |
|---|---|---|
| `predefinedGrade` | `organization_members.grade` | `auth.routes.ts:34` |
| `predefinedName` | `organization_members.student_name` | `:35` |
| `predefinedAge` | `organization_members.student_age` | `:36` |
| `predefinedGender` | `organization_members.student_gender` | `:37` |
| `organizationName` / `organizationLogoUrl` | `organizations.name` / `.logo_url` | `:43-44` |
| `organizationCountryId` | `organizations.country_id` | `:45` |
| — | `organizations.curriculum` | **not exposed — no decoration exists** |

So Basic Info comes from **`organizationMembers`** (per-student), country comes from
**`organizations`** (per-school), and **curriculum is never sent to the client at all**
(`grep -rn organizationCurriculum client/src server shared` → 0 hits).

### 2b. The client pre-fill

- **Basic Info, "smart skip":** `client/src/pages/Assessment.tsx:384-413`. If *all four*
  (`predefinedGrade`, `predefinedName`, `predefinedAge`, `predefinedGender`) are present
  (`:394-398`), it copies them into `assessmentData`, sets `consentGiven: true` ("institutional
  consent", `:408`) and **skips to step 2** (`:412`). Because `student_name`/`student_age` are NULL
  for form-created students (§1b), `allFieldsPreFilled` is false and **this skip does not fire for
  them** — only for CSV/bulk-created students whose file carried those columns.
- **Per-field pre-fill:** `DemographicsStep.tsx:43-63` fills each field independently when its
  predefined value exists and the field is empty. This is the path that actually runs today.
- **Country:** `Assessment.tsx:416-431`. `organizationCountryId` → `assessmentData.countryId`,
  **only when `!assessmentData.countryId`** (`:425`) — the comment at `:423-424` says it explicitly:
  *"Only populate if not already set (respects user overrides…)"*. It is a default, not a lock.
- **Curriculum: not pre-filled client-side at all.** `CountryStep` receives no predefined value, and
  `grep -n curriculum client/src/pages/Assessment.tsx` returns **nothing** — `curriculum` is not even
  a member of the `AssessmentData` interface (`Assessment.tsx:39-53`). `CountryStep` calls
  `onUpdate("curriculum", …)` (`CountryStep.tsx:55`, `:61`), which lands as an untyped extra key on
  the state object and is then **never read into the request body** (`Assessment.tsx:444-455` and
  `:551-562` both omit it). The student's curriculum choice is discarded on every save.

### 2c. Where curriculum actually gets set

Server-side only, on create: `POST /api/assessments` (`server/routes/assessment.routes.ts:102`,
`:133-138`) — for an `org_student`, if `organization.curriculum` is truthy it overwrites
`validatedData.curriculum`. If the school has no curriculum, `assessments.curriculum` stays NULL
(the client never sends one), and quiz generation falls through to its country+grade pool
(`quiz.routes.ts:176-198`).

---

## 3. THE LOCK — current state

### 3a. Client side: `disabled` attributes on four fields, nothing on Country

`client/src/components/assessment/DemographicsStep.tsx`, where `isOrgStudent = !!predefinedGrade` (`:41`):

| Field | Lock | Line | Effective today? |
|---|---|---|---|
| Name | `disabled={!!predefinedName}` | `:105` | **No** — `student_name` is NULL for form-created students (§1b) |
| Age | `disabled={!!predefinedAge}` | `:130` | **No** — `student_age` is NULL for form-created students |
| Grade | `disabled={!!predefinedGrade}` | `:152`, `:165-166` | Yes (grade is required on the form) |
| Gender | `disabled={!!predefinedGender}` | `:197`, `:206-207` | Only if the admin picked one — the field is optional |
| Consent | `disabled={isOrgStudent}` | `:230` | Yes |

`client/src/components/assessment/CountryStep.tsx` — **no lock of any kind.** Its props are
`{ data, onUpdate, onNext, onBack }` (`:11-18`); there is no `predefined*` prop, and
`Assessment.tsx:975-982` passes none. The country control (`CountryStep.tsx:126`, `:186`) and the
curriculum control (`:172`, `:186`) are always interactive, and `handleCountryChange` (`:51-56`)
freely overwrites the org-supplied default.

A `disabled` attribute is a rendering hint. It is removable from devtools and irrelevant to a
non-browser client.

### 3b. Server side: one override, on one verb, for one field

**`POST /api/assessments`** — `server/routes/assessment.routes.ts:100-141`:

```ts
let assessmentCurriculum = validatedData.curriculum;          // :102
…
if (user?.accountType === "org_student") {                     // :106
  … license guard …                                            // :112-128
  if (organization?.curriculum) assessmentCurriculum = organization.curriculum;  // :135-138
}
```

`countryId`, `name`, `age`, `grade` and `gender` are taken from `validatedData` verbatim
(`:141-149`). Curriculum is overridden **only when the org has one**.

**`PATCH /api/assessments/:id`** — `assessment.routes.ts:243-334`. It verifies **ownership**
(`:250-266`: the caller must be the assessment's `userId`, or hold the matching guest cookie) and
applies a mass-assignment allowlist (`:278-296`):

```ts
const allowedFields = [
  'name', 'age', 'grade', 'gender', 'countryId', 'favoriteSubjects',   // :279
  'prioritySubjects', 'interests', 'personalityTraits', 'careerAspirations',
  'strengths', 'workPreferences', 'riasecResponses', 'cvqResponses',
  'subjectCompetencies', 'currentStep', 'currentStepMetadata', 'completedAt',
  'educationLevel'
];
```

**There is no `accountType`/`org_student` check anywhere in this handler, and no organization
lookup.** The allowlist exists to stop *privilege* escalation (`assessmentType`, `quizScore`,
`isCompleted` — the M1 note at `:271-277`); it says nothing about school-owned fields.

**Result — the exploit, precisely.** A logged-in school student, with their own session and their
own assessment id:

```
PATCH /api/assessments/<their own id>
{"name":"…","age":19,"grade":"grade12","gender":"…","countryId":"<any other country>"}
```

…succeeds. Ownership passes (it *is* their assessment); every field is on the allowlist; nothing
re-reads `organization_members` or `organizations`. `curriculum` is the sole exception, and only
because it was **left off the allowlist** — an accident of the M1 mass-assignment fix, not a lock.
There is no test pinning it there; adding `'curriculum'` to that array would silently re-open it.

**Why it matters beyond "the student cheated a form":**
- `assessment.countryId` + `curriculum` + parsed `grade` select the quiz question pool
  (`quiz.routes.ts:176-198`) and drive subject-alias normalization (`:218-229`).
- `assessment.countryId` selects job-market trends, the country record, the sector→category map and
  the WEF skill map used for matching (`server/services/matching.ts:269`, `:276-277`, `:295-306`).
- `careers.countryId` (`shared/schema.ts:539`) scopes the career catalog itself.

So the override changes which questions the student is asked and which careers they are matched
against — i.e. it corrupts the report the school paid for, and it lets a student pull another
country's configured content. The plan's escalation rule (`CLAUDE.md`, minors' data) applies.

### 3c. Related residue found while tracing (not L10, recorded so it is not lost)

- **`assessments.grade` is never canonicalized server-side.** `normalizeAssessmentPayload`
  (`assessment.routes.ts:19-52`) handles `educationLevel → grade` and subject normalization but
  never calls `toCanonicalGrade`; `insertAssessmentSchema` (`shared/schema.ts:921-931`) does not
  constrain it, and the column is nullable `text` (`shared/schema.ts:596`). The four
  `organizationMembers` write sites *do* canonicalize (§6a). Locking grade server-side (§7) closes
  this for school students; self-payers stay unguarded.
- **`POST …/import-students` (`admin.routes.ts:1780`) has no client caller.** The UI's bulk upload
  parses CSV in the browser and posts to `…/members/bulk` instead.
- **The browser CSV parser is positional and mislabelled** (`AdminOrganizations.tsx:1696-1698`):
  it destructures `[username, grade, studentId, studentName, studentAge, studentGender]` and then
  sends `fullName: username`. The downloadable template's first column is literally named
  `username` (`:1731`). Column 1 is the student's full name.

---

## 4. SCHEMA — what exists, what L10 needs

### 4a. What exists today

| Table | Column | Type / null | Line |
|---|---|---|---|
| `organizations` | `country_id` | `varchar`, **nullable**, no FK constraint declared on the column (relation only, `:139-142`) | `shared/schema.ts:122` |
| `organizations` | `curriculum` | `text`, **nullable** | `shared/schema.ts:123` |
| `organization_members` | `student_name` | `text`, nullable | `shared/schema.ts:157` |
| `organization_members` | `student_age` | `integer`, nullable | `:158` |
| `organization_members` | `student_gender` | `text`, nullable | `:159` |
| `organization_members` | `grade` | `text`, nullable (canonical since `013_canonicalize_student_grade.sql`) | `:160` |
| `organization_members` | country / curriculum | **do not exist** | — |
| `assessments` | `country_id`, `curriculum`, `name`, `age`, `grade`, `gender` | all nullable | `shared/schema.ts:593-599` |

**Country/curriculum are per-SCHOOL, not per-student.** Basic Info is per-student. Confirming the
plan's S8 (`docs/v2-rebuild-plan.md:216`): the Basic-Info pre-fill needs **no** new columns.

### 4b. Staging DB is empty — backfill must be sized against prod

```
organizations:        total 0, with_country 0, with_curriculum 0
organization_members: total 0 (students)
assessments:          0 rows
```
(`SELECT`s run 2026-09-04 against the staging branch.) The staging branch cannot tell us how many
live schools hold NULL country/curriculum, so **the S6 backfill has to be sized with a read-only
query against production before any NOT NULL is planned.** Staging is fine for verifying the
migration mechanically, not for sizing it.

### 4c. Schema changes L10 needs

| # | Change | Necessity | Where |
|---|---|---|---|
| **S6** (already in the plan, `docs/v2-rebuild-plan.md:214`) | `organizations.country_id` / `curriculum` → **NOT NULL** | **Defer.** Enforce in the app first (§7). It is a constraint tightening on live rows and the plan already ranks it 4th-riskiest (`:317`). | `shared/schema.ts:122-123` + numbered SQL |
| **S14** (new, this recon) | `organization_members.country_id` (varchar, nullable, FK `countries.id`) and `organization_members.curriculum` (text, nullable) — **per-student override of the school default** | **Conditional — product decision.** Needed only if one school runs more than one curriculum (an IB stream and an MOE stream in the same building) or more than one country. Additive + nullable ⇒ safe, but staging-first per L18. | `shared/schema.ts:146-172` + numbered SQL `014_…` |
| **S15** (new, this recon) | Nothing. | The Basic-Info half of L10 is **pure app logic** — the columns exist and are already decorated onto the user. What is missing is the *form* capturing them (§1b) and the *server* enforcing them (§3b). | — |

**Recommendation on S14:** resolve the locked value as `member.countryId ?? organization.countryId`
(same for curriculum), so the org row stays the default and the member row is an admin-only
override. That shape satisfies multi-curriculum schools without a second source of truth, and it
degrades to today's behaviour when both member columns are NULL. If the product confirms one
country+curriculum per school, skip S14 entirely and Phase 4 becomes **zero-schema** apart from the
deferred S6.

`server/migrations/` is the mechanism (numbered SQL, applied at boot by `runner.ts`, ledger in
`schema_migrations`); latest applied file is `013_canonicalize_student_grade.sql`. Do **not** use
`npm run db:push` — `013`'s header records that push plans to drop `schema_migrations` itself.

---

## 5. THE GAP — exists vs. missing, per piece

| # | L10 requirement | Exists | Missing |
|---|---|---|---|
| G1 | Country **mandatory** on the school form | Optional selects, both forms (`AdminOrganizations.tsx:1111-1131`, `:1430-1449`), with an explicit `"none"` option (`:1120`, `:1440`) | Client `required` + server 400 in `superadmin.routes.ts:770-780` and `admin.routes.ts:320-333` |
| G2 | Curriculum **mandatory** on the school form | Optional, and only rendered when a country is chosen (`:1133`, `:1450`) | Same as G1 + a decision for countries whose `curricula` list is empty |
| G3 | Basic Info **mandatory** on the school student form | `fullName` + `grade` required (`admin.routes.ts:518-520`); columns for name/age/gender exist | **`studentName` and `studentAge` are not fields on the form at all** (`AdminOrganizations.tsx:1487-1494`); gender is optional; `studentName` is not derived from `fullName` in `storage.ts:2676` |
| G4 | An **edit** form for a school student | `PATCH …/members/:memberId` handler exists (`admin.routes.ts:720-778`), accepts `fullName` + `grade` only (`:753`) | The entire UI; and the handler must widen to age/gender (+ country/curriculum if S14) |
| G5 | Country pre-filled for the student | `organizationCountryId` decorated (`auth.routes.ts:45`) and consumed (`Assessment.tsx:416-431`) | Nothing — this one works, as a *default* |
| G6 | Curriculum pre-filled for the student | Server-side on `POST` only (`assessment.routes.ts:135-138`) | Not exposed to the client (`auth.routes.ts` has no `organizationCurriculum`); not in `AssessmentData`; never sent by the client |
| G7 | Basic Info pre-filled | Decorations `auth.routes.ts:34-37`; smart-skip `Assessment.tsx:384-413`; per-field `DemographicsStep.tsx:43-63` | Inert for name/age because G3 leaves those columns NULL |
| G8 | **Client** lock on Country/curriculum | — | `CountryStep` takes no predefined props (`CountryStep.tsx:11-18`) and disables nothing |
| G9 | **SERVER-SIDE lock — the actual requirement** | `curriculum` on `POST` only (`assessment.routes.ts:135-138`), and `curriculum` accidentally absent from the PATCH allowlist (`:278-284`) | **Everything.** No org check on `PATCH` at all; `countryId`, `name`, `age`, `grade`, `gender` client-writable on both verbs by an `org_student` |
| G10 | Lock survives a direct API call | — | Follows from G9. This is the finding the plan recorded at `docs/v2-rebuild-plan.md:107` and it is confirmed unchanged at `d630f82` |

---

## 6. INTERACTION with recent and in-flight changes

### 6a. Phase 2 (grade canonicalization) — done on the school form, with one residue

`3ee8134` landed canonical grade on **every** school write path:

- The admin grade select emits canonical values — `SCHOOL_GRADES` from `@shared/grade`
  (`AdminOrganizations.tsx:17`, select at `:1602-1611`, values `grade8`…`grade12`).
- Single create: `toCanonicalGrade` + 400 on failure (`admin.routes.ts:526-531`).
- Bulk create: same, failing the row (`admin.routes.ts:670-676`).
- Member PATCH: same, replacing the old `parseInt` (`admin.routes.ts:764-771`).
- Server CSV import: same, failing the row (`admin.routes.ts:1963-1971`).

**So yes — the school form already emits canonical grade.** The residue is on the *assessment* side:
`POST`/`PATCH /api/assessments` accept `grade` as free text (§3c). Server-locking grade from the
member row (§7, step 4a) makes school students canonical by construction; self-payers remain
unguarded, which is a separate, non-Phase-4 item.

### 6b. The Country↔Subjects swap (other agent) — coupling to flag

**The server-side lock must be, and can be, entirely step-agnostic.** It hangs off
`user.accountType === 'org_student'` and the org/member rows, never off `currentStep`. Design it
that way and the swap is a non-event for it. Three concrete couplings to be aware of:

1. **`Assessment.tsx:412` — `setTimeout(() => setCurrentStep(2), 0)`.** The smart-skip hard-codes
   the destination step number. After the swap, step 2 is Country — which for a school student will
   be fully locked, so the skip should land on Subjects, not on a read-only Country page. This
   should become `stepNumberOf(isPremiumUser, 'subjects')` (`shared/assessmentFlow.ts:62-65`), or
   better, "advance past every consecutive fully-locked step". **This line sits inside the swap
   agent's file.** It is the one place the client lock is step-number-coupled.
2. **`Assessment.tsx:537` — `needsSaveBeforeQuiz = currentStep === 3`.** This is the save that fires
   the `POST` carrying today's only server override (`assessment.routes.ts:135-138`). The override
   itself is on the verb, not the step, so it survives a renumber; but if the swap changes which
   step first persists, re-verify that an `org_student` still reaches `POST` before `QuizStep`
   requests questions.
3. **`shared/assessmentFlow.ts:113-140` (`deriveFreeResumeStep`) is already ID-based**, so resume is
   swap-safe and lock-safe. Follow that pattern rather than adding new numeric literals.

**File-collision warning:** Phase 4's client work touches `Assessment.tsx` (the smart-skip effect
`:384-413`, the country effect `:416-431`, and the `CountryStep` props at `:975-982`) — the same
file the swap agent owns. Sequence them, or keep Phase 4 to the server + `CountryStep.tsx` +
`AdminOrganizations.tsx` and land the `Assessment.tsx` edits after the swap.

### 6c. Phase 1 / Phase 3

- L11 is already delivered (`2dab644`) — see the header. Phase 4 ≠ L10 + L11 any more; it is L10.
- Phase 3 moved Country to step 3 for both tiers (`Assessment.tsx:975-982`), so "steps 1 & 3" in the
  spec text currently matches the code — and will stop matching after the swap. Write the lock
  against step **ids**, not the numbers in the spec sentence.

### 6d. A live-data hazard, needs a decision before 4a ships

An org_admin can change their school's country/curriculum at any time (`admin.routes.ts:320-333`,
dialog ungated at `AdminOrganizations.tsx:548`). Once the server re-asserts those values on every
write, an in-flight assessment whose quiz was generated under the old country/grade would be
re-pointed mid-flow. Two mitigations, pick one before building:
(a) apply the re-assertion only while `isCompleted = false` **and** before the quiz is generated, or
(b) apply it always but treat a changed `countryId` as invalidating the generated quiz.
This also argues for making school country/curriculum edits an audited action
(`organizationEvents` already exists — `shared/schema.ts:1128`, plan S13).

---

## 7. RISK, SCHEMA SPLIT, AND RECOMMENDED BUILD ORDER

### 7a. What is app-logic (prod-safe) vs. schema (staging-first)

| Work | Class | L18 treatment |
|---|---|---|
| Server-side lock on `POST` + `PATCH /api/assessments` | **App logic** | prod-direct |
| Expose `organizationCurriculum` in `GET /api/auth/user` | App logic | prod-direct |
| `CountryStep` predefined props + `disabled` | App logic | prod-direct |
| Capture `studentName` / `studentAge` on the school form; derive `studentName` from `fullName` | App logic | prod-direct (new rows only; existing NULLs need a separate backfill decision) |
| Country + curriculum required on school create/edit | App logic (validation) | prod-direct, **but** it will reject edits to existing NULL-country schools until they are backfilled — ship the backfill first or allow-through on unchanged values |
| Build the edit-student UI + widen the member PATCH | App logic | prod-direct |
| **S14** per-member `country_id` / `curriculum` | **Schema** (additive, nullable) | **staging first** |
| **S6** `organizations.country_id/curriculum` NOT NULL | **Schema** (constraint tightening + backfill) | **staging first, last of all** |

### 7b. Recommended order within Phase 4

**4a — the server-side lock. Do this first; it is the whole point of the phase.**
A single resolver, e.g. `server/services/schoolLock.ts`:

```
resolveSchoolLockedFields(userId) ->
  null                                  // not an org_student
| { name?, age?, grade?, gender?, countryId?, curriculum? }   // only keys the school actually has
```

reading `organization_members` + `organizations` (and, if S14 lands, `member.x ?? org.x`).
Call it from **both** `POST /api/assessments` (replacing the curriculum-only branch at
`assessment.routes.ts:133-138`) and `PATCH /api/assessments/:id` (after the allowlist filter at
`:288-296`).

Two design notes that matter:
- **Override silently; do not 403.** The legit client resends `name`/`age`/`grade`/`gender`/
  `countryId` on *every* PATCH (`Assessment.tsx:444-455`, `:551-562`), so rejecting on presence
  would break the app. Overwriting is also the shape the existing curriculum override already uses.
- **Override only fields the school actually has a value for.** With `student_name`/`student_age`
  NULL today (§1b), a blanket override would wipe the values the student legitimately entered.
  Coverage widens automatically as 4c backfills those columns.

Prod-safe, no schema, and it closes G9/G10 — the only part of L10 that is a real security gap.
Verification: a route test in the style of `server/routes/country.persistence.test.ts` /
`server/routes/quiz.tier.test.ts` asserting that a PATCH from an `org_student` carrying a foreign
`countryId` + a different `grade` persists the **school's** values; and a second asserting that
adding `'curriculum'` to the allowlist still cannot change it.

**4b — close the pre-fill gaps so the lock has data to assert.**
Add `organizationCurriculum` to `auth.routes.ts:43-46` (one line); capture `studentName` (or derive
it from `fullName` in `storage.ts:2661-2677`) and `studentAge` on the create form
(`AdminOrganizations.tsx:1487-1494` + fields) and in the member PATCH (`admin.routes.ts:753`).
Decide separately whether to backfill `student_name` from `users.firstName || ' ' || lastName` for
existing rows — that is a data change ⇒ staging first.

**4c — the client lock catches up.** Pass predefined country/curriculum into `CountryStep`
(`Assessment.tsx:975-982`), add the props and `disabled`, mirroring
`DemographicsStep.tsx:105/130/152/197` and the existing "set by school" label
(`DemographicsStep.tsx:95`). Fix the `setCurrentStep(2)` literal at `Assessment.tsx:412` to derive
from `assessmentFlow`. **Land after the Country↔Subjects swap** (§6b).

**4d — mandatory on the school forms.** Client `required` + drop the `"none"` option; server 400 in
`superadmin.routes.ts:770-780` and `admin.routes.ts:320-333`. Needs the existing-NULL-schools
backfill decision first, or edits to those schools start failing.

**4e — the edit-student form** (G4), plus the widened member PATCH.

**4f — schema, last.** S14 if the product confirms multi-curriculum schools; then, only after a
production read-only count of NULL `country_id`/`curriculum` and a backfill pass, S6's NOT NULL.

### 7c. Risk summary

| Item | Risk | Note |
|---|---|---|
| 4a server lock | **Medium** | Changes behaviour for in-flight school assessments — see §6d. Guard on `isCompleted = false` and log every override for the first release. |
| 4a "override only non-null" rule | Medium | Get it wrong and you null out a student's own Basic Info. Pin with a test. |
| 4b `studentName` backfill | Low-medium | Data change ⇒ staging first; it is a minor's name, so prefer deriving at read time over rewriting rows if there is any ambiguity. |
| 4d mandatory fields | Medium | Will block org_admin edits to existing NULL-country schools until backfilled. |
| S6 NOT NULL | **High** (plan ranks it #4 overall, `docs/v2-rebuild-plan.md:317`) | Constraint tightening on live rows, sizing not possible on staging (§4b). Defer; app-level enforcement gets 100% of the product value. |
| Collision with the swap agent | Medium | Both touch `Assessment.tsx`. Order 4c after the swap. |

---

## Appendix — files read

`docs/v2-rebuild-plan.md` (§2.3, §4.2, Phase 4, risk ranking) · `FOLLOWUP.md:1082-1146` ·
`shared/schema.ts` · `shared/grade.ts` · `shared/assessmentFlow.ts` ·
`server/routes/auth.routes.ts` · `server/routes/assessment.routes.ts` ·
`server/routes/admin.routes.ts` · `server/routes/superadmin.routes.ts` ·
`server/routes/quiz.routes.ts` · `server/storage.ts` (`createUserWithCredentials`) ·
`server/services/matching.ts` · `server/migrations/013_canonicalize_student_grade.sql` ·
`drizzle.config.ts` · `client/src/pages/AdminOrganizations.tsx` · `client/src/pages/Assessment.tsx` ·
`client/src/components/assessment/DemographicsStep.tsx` ·
`client/src/components/assessment/CountryStep.tsx` · `client/src/hooks/useAssessmentAvailability.ts`.

No file was modified. No commit was made.
