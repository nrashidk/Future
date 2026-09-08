# Phase 4 step 4 recon — DOB on the school side

Read-only. **Nothing was changed.** Line numbers are `main` @ `f6f7564`.

The working tree is clean: the parked DB-endpoint guard work is in `stash@{0}`
and touches none of the files below.

**The decision this recon is scoped to (given, not re-litigated):** schools record
student **date of birth** as a mandatory field at student create. The assessment
derives age from it and locks it, the same way `name` / `grade` / `gender` /
`countryId` / `curriculum` are locked now (`14459a4`, extended to create in
`4bf2d02`). Self-paid students keep entering age directly — there is no school to
supply a DOB.

Everything below is what that lands on.

---

## 0. What exists today, in one paragraph

`organization_members.student_age` (`shared/schema.ts:156`) is an `integer`,
nullable, **NULL on every row**, and deliberately excluded from the demographics
CHECK. Migration `014_require_student_demographics.sql:29-38` records why: no form
has ever collected it, and — the operative clause — *"there is no date-of-birth
column anywhere in the schema to derive it from … Revisit only if a DOB column is
ever added."* That is this step. Three write paths accept a `studentAge` they are
never given (`admin.routes.ts:691`, `:834`, `:2212`), one export emits it
(`:1829`), and `auth.routes.ts:66` forwards it to the client as `predefinedAge`.
The assessment's own `assessments.age` (`shared/schema.ts:614`) is separate,
student-supplied, and is the value the report actually prints.

There is **no** `date_of_birth` / `dateOfBirth` / `dob` anywhere in
`server/`, `client/src/` or `shared/` today — confirmed by grep. This is a
greenfield column, not a rename.

---

## 1. Adding `organization_members.date_of_birth`

### 1a. Column type

**Recommend `date`, not `timestamp`.** A birth date has no time component and no
timezone; storing it as a `timestamp` invites the classic off-by-one where
`2010-03-14T00:00:00Z` renders as 13 March in a UTC-negative locale and moves a
student's birthday — and therefore their derived age — by a day.

Drizzle wiring, two concrete points:

- **`date` is not currently imported.** `shared/schema.ts:2-14` imports
  `check, index, uniqueIndex, integer, jsonb, pgTable, text, timestamp, varchar,
  boolean, real` from `drizzle-orm/pg-core`. `date` has to be added.
- **Use `date("date_of_birth", { mode: "string" })`.** Drizzle's default `date`
  mode returns a JS `Date`, which reintroduces exactly the timezone shift the
  column type was chosen to avoid. `mode: "string"` yields `"YYYY-MM-DD"` — the
  form value, the CSV cell and the stored value all become the same string, and
  the age helper (§4) can compare parts without constructing a `Date` at all.

### 1b. Nullability

**Do not use `.notNull()`.** Same reason 014 gives at its header lines 15-24:
this table holds school admins as well as students, and the four admin-creating
write sites have no DOB to supply —

- `server/routes/superadmin.routes.ts:453` (add admin to org)
- `server/routes/superadmin.routes.ts:835` (create-with-admin primary admin)
- `server/storage.ts:2283` (Stripe group purchase, enrols buyer)
- `server/seed.ts:3258` (seeded schooladmin)

A blanket NOT NULL breaks all four. The requirement is student-only, so it
belongs in a **role-scoped CHECK**, exactly like `student_name` / `student_gender`
/ `grade` (`shared/schema.ts:188-192`, migration `014` §(b)).

### 1c. Should it join the existing CHECK, or get its own?

**Recommend a second, separate constraint** —
`organization_members_student_dob_check` — rather than widening
`organization_members_student_demographics_check`.

Widening means `DROP CONSTRAINT` + `ADD CONSTRAINT` on a constraint that is
already applied and `convalidated=true` in production (per the
`## CORRECTION to 3f04c8b` entry in FOLLOWUP.md). The drop is the risky half: for
the duration of the migration transaction the *existing* name/gender/grade
guarantee is off, and if the re-add fails the transaction rolls back to a state
where 014's constraint is present but the DOB one is not — recoverable, but the
failure mode is "which constraints does prod actually have?", which is the
question 014 went out of its way to make answerable. A second constraint is
purely additive, and `shared/schema.ts:186-192` already returns an array of
`check()` entries, so adding one is a two-line schema change with no drift risk
against 014's name.

### 1d. Should the CHECK also constrain the *range*?

This is the part that does not work the way it looks like it should.

A range check on a birth date wants to be relative to today — "not in the future",
"not more than ~30 years ago". **Postgres will reject that.** `CURRENT_DATE` and
`now()` are `STABLE`, not `IMMUTABLE`, and a CHECK constraint may only contain
immutable expressions; `ALTER TABLE … ADD CONSTRAINT … CHECK (date_of_birth <
CURRENT_DATE)` fails with *"cannot use column references / non-immutable
functions in check constraint"*. A static literal bound
(`date_of_birth >= DATE '1990-01-01'`) is legal but ages badly and encodes a
policy in DDL that has to be migrated to change.

**Recommendation:** the CHECK asserts **presence only** (`IS NOT NULL`,
role-scoped), and *plausibility* is enforced at the write boundary in zod,
alongside the other three. That is already the established split in this
codebase: `grade` has no DB constraint either — migration `013` says so
explicitly at its header ("NO DDL ON PURPOSE … Enforcement lives in
`shared/grade.ts` at the write sites, where it can return a 400 with a useful
message"). DOB has the same shape: a bad value should become a 400 the admin can
read, not a raw 23514 wearing a 500.

The range itself has a precedent to match: the only age bounds anywhere today are
the client-side `min="13" max="25"` on the assessment's age input
(`client/src/components/assessment/DemographicsStep.tsx:166-168`).

### 1e. `student_age` — drop, keep, or backfill?

**Recommend: stop writing it now, DROP it in a follow-up migration after the DOB
write paths have landed and been verified.** Not in the same commit.

- **Backfill from DOB — reject.** A stored integer age is wrong within twelve
  months of being written, and would be a *second* source of truth for the same
  fact, differing from the derived one by up to a year. That is precisely the
  divergence 013 was written to clean up for `grade` (three formats, one field)
  and 014 refused to create for age. Do not.
- **Keep as-is — reject.** It stays NULL forever while the column, the three
  route params and the export field all keep implying a school can supply an age.
  Every future reader has to re-derive that it is dead.
- **Drop — recommend.** Nothing reads it for any purpose today.

Full removal surface, so the follow-up is scoped rather than discovered:

| Site | What it does |
|---|---|
| `shared/schema.ts:156` | the column |
| `shared/schema.ts:182-186`, `:1050` | comments explaining its absence from the CHECK — rewrite, not delete: the reasoning changes, it does not disappear |
| `server/storage.ts:400`, `:2716` | `studentAge?: number` in the IStorage signature and the sink signature |
| `server/storage.ts:2832` | the insert value |
| `server/routes/admin.routes.ts:659`, `:691` | M1 destructure + `parseInt` |
| `server/routes/admin.routes.ts:813`, `:834` | M2 destructure + `parseInt` |
| `server/routes/admin.routes.ts:2130`, `:2212` | M3 header comment + `parseInt` |
| `server/routes/admin.routes.ts:912-916` | the PATCH allowlist comment that exists solely to explain why `studentAge` is excluded |
| `server/routes/admin.routes.ts:1829` | the JSON export field |
| `server/routes/auth.routes.ts:66` | `predefinedAge` (becomes derived — see §4/§6) |
| `client/src/pages/AdminOrganizations.tsx:1873`, `:1879` | M2 positional parse |
| `client/src/pages/AdminOrganizations.tsx:1908`, `:1983` | CSV template string + the help text listing optional columns |
| `server/routes/assessment.routes.ts:58-62`, `:491` | the two comments stating there is no DOB to derive from |
| `client/src/components/assessment/DemographicsStep.tsx:152-164` | same, on the client |

Note the last two rows: a good half of this change is **rewriting comments that
are about to become false**. They are load-bearing — they are why the next reader
does not re-add an age field — so they need updating in the same commits, not a
sweep afterwards.

---

## 2. Backfill — the 7 existing student rows

**Not verified in this session.** The 7-row figure is as given; this shell has no
`DATABASE_URL` and the endpoint guard (`server/db.ts:20`) would refuse a
production connection anyway. Confirm with
`SELECT count(*) FROM organization_members WHERE role = 'student';` before acting.

**Nothing in the row derives a DOB.** 014's `student_name` backfill worked because
the name existed in `users.first_name`/`last_name` and was merely *not written
back* — recovery, not invention. There is no such source here. `grade` implies an
age *band*, not a birth date, and 013 already refused to coerce a `NaN` grade to
a neighbour on exactly this principle: *"inventing one would put a wrong grade in
a minor's record."* A fabricated DOB is strictly worse — it is more identifying,
and it silently produces a wrong derived age on every future assessment.

### The options

**A. Nullable column, requirement at create only (zod at the sink).**
The 7 rows stay NULL; every new student is required to have a DOB.
- *For:* ships in one commit, blocks nothing, invents nothing.
- *Against:* the database permits a NULL student DOB forever. Enforcement lives
  entirely in `createUserWithCredentials` (`server/storage.ts:2731-2735`), so a
  future write path that bypasses the sink is unconstrained — and there are already
  four admin-creating sites that write this table directly (§1b). This is the same
  fails-open shape as the endpoint-guard blacklist parked in `stash@{0}`.

**B. Role-scoped CHECK from the start, with a manual fill of the 7 rows.**
- *For:* the invariant is real, enforced where it cannot be forgotten, and matches
  the three fields beside it.
- *Against:* the 7 DOBs have to come **from the schools, out of band**, before the
  migration can be applied. That is a human dependency with no in-repo answer, and
  the migration is blocked until it resolves. 014 could self-heal; this cannot.

**C. (Recommended) A, then B — two commits, in that order.**
1. Add the column nullable, add DOB to `studentDemographicsSchema`
   (`shared/schema.ts:1084-1089`) so all three create paths require it, wire the
   four write paths and the derivation. No DDL constraint yet.
2. Once the 7 rows are filled by their schools, a second migration adds
   `organization_members_student_dob_check` with the same pre-flight
   `RAISE EXCEPTION` block 014 uses (`014:…` DO block) so a failure *names the
   offending rows* instead of just the constraint.

C is what 014's own ordering rule prescribes — *"this migration MUST land after
the write-site fixes that make the three fields mandatory at student-create.
Constraining the table while a writer can still omit `student_name` just moves the
failure from the form to a 500 at the DB."* Here the dependency is data rather
than code, but the sequencing argument is identical, and step 2 is a self-contained
follow-up that cannot silently not-happen: until it lands, the constraint is
visibly absent.

**One consequence to decide on now, not later:** if age becomes a school-owned
assessment field that fails closed (§4), the 7 DOB-less students are **blocked from
starting an assessment** the moment the lock ships — `resolveSchoolOwnedFields`
reports the field as `missing` and both POST (`assessment.routes.ts:236-249`) and
PATCH (`:540-…`) return a 400 telling them to ask their school administrator.
That is arguably the correct behaviour and it is certainly the safe one, but it is
a live-user-facing block on a known, countable set. If the 7 are real students,
fill their DOBs *before* shipping the lock, not after.

---

## 3. Write paths

All three create paths funnel through **one sink** —
`storage.createUserWithCredentials` (`server/storage.ts:2708`) — whose input guard
at `:2731-2735` parses `studentDemographicsSchema`. That is where the requirement
belongs: adding `dateOfBirth` to `shared/schema.ts:1084-1089` covers M1, M2 and M3
in one place, with the 400-mapping (`admin.routes.ts:608-627`,
`studentValidationMessage`) already built. This is the pattern step 2 established;
do not re-implement the check per route.

| Path | Route / entry | What it needs |
|---|---|---|
| **M1** single create | route `admin.routes.ts:631`; destructure `:659`; sink call `:686-694` | add `dateOfBirth` to the destructure and pass it through. Client form `AdminOrganizations.tsx:1660` — state `:1663-1670`, fields `:1772-1846` — has **no** date input; add one, plus the explicit `fieldErrors` gate at `:1677`/`:1701-1703` (grade and gender need it because Radix Selects ignore `required`; a native `<input type="date">` does honour `required`, but the gate should match its siblings for one error style) |
| **M2** bulk file | route `admin.routes.ts:721`; per-row destructure `:813`; sink call `:828-837` | server side is a pass-through and needs one field. The client parser is the problem — see below |
| **M3** CSV import | route `admin.routes.ts:2003`; header parse `:2131`; `requiredHeaders` `:2132`; rowData → sink `:2205-2215` | header-named already. Add the column name to the parse, and decide whether it joins `requiredHeaders` (currently `['fullName']` only) |
| **edit** PATCH | route `admin.routes.ts:871`; destructure `:904`; allowlist typed at `:905-910` | add `dateOfBirth`, with the same `rejectsAsCleared` treatment as name/gender (`:942-963`) and the message derived from the shared schema via `requiredFieldMessage` (`:936-939`). Also `storage.updateStudentMemberProfile` — signature `storage.ts:376-380`. The comment at `:912-916` explaining why `studentAge` is excluded becomes wrong and must be rewritten |

### 3a. The columnar question — M2 and M3 do not agree

This is the part worth deciding before writing any code.

**M3 (server, `admin.routes.ts:2131`) parses by header name:**
```
const headers = lines[0].split(',').map(h => sanitizeCSVField(h.replace(/"/g, '')));
```
then `rowData[header] = values[index]` (`:2168-2171`). Column order is irrelevant;
an unknown column is ignored; a missing optional column yields `''`. Adding a
field here is safe and backward-compatible.

**M2 (client, `AdminOrganizations.tsx:1873`) parses by POSITION and throws the
header away:**
```
const students = lines.slice(1).map(line => {
  const [username, grade, studentId, studentName, studentAge, studentGender] = line.split(',')…
```
`slice(1)` discards the header row without reading it. Insert `dateOfBirth`
anywhere but the end and every previously-downloaded template silently shifts —
a file whose 6th column is `male` starts arriving as a *gender in the DOB slot*
and a *DOB in nothing*. There is no header check to catch it, and the per-row
error would be about the wrong field.

Two pre-existing defects in the same six lines, worth recording while the file is
open (neither is this step's to fix):
1. **Column 0 is named `username` in the template (`:1908`) but is sent as
   `fullName` (`:1874`).** So the bulk template's first column is actually the
   student's full name; an admin who fills in usernames gets those stored as names.
2. **The header row is not validated at all** — a file with the wrong columns in
   the wrong order imports silently, subject to the per-row grade/demographics
   validation catching some of it downstream.

**Recommendation:** move M2 to header-named parsing, matching M3, as part of this
step. It is ~10 lines, it removes the positional trap permanently rather than
working around it once, and it makes one template correct for both paths. If that
is judged out of scope, the fallback is to **append `dateOfBirth` as the last
column** and accept that M2 and M3 now disagree about what "the student CSV" is.

**The column name itself:** recommend **`dateOfBirth`**, one canonical spelling, no
aliases. It matches the existing header vocabulary — `fullName`, `studentId`,
`studentName`, `studentGender` are all camelCase and all map 1:1 to the sink's
parameter names. Accepting `dob`/`DOB`/`birthdate` as synonyms would be a second
format for one field, which is the exact drift 013 spent a migration undoing.

**The value format:** require ISO `YYYY-MM-DD` and reject anything else with a
per-row error, the way `toCanonicalGrade` does (`admin.routes.ts:2185-2194` for
M3, `:819-825` for M2). `03/04/2010` is ambiguous between two real dates and no
amount of tolerance resolves it. This wants a shared pure parser —
`shared/dateOfBirth.ts`, mirroring `shared/grade.ts` — used by all four write
paths *and* the age derivation (§4), so there is one definition of a valid DOB in
the system. `shared/grade.ts` is the working precedent for that shape, and it has
tests (`shared/grade.test.ts`).

Both CSV touchpoints on the client also need the new column:
`AdminOrganizations.tsx:1908` (the downloadable template) and `:1983` (the help
text listing optional columns — DOB is *not* optional, so it moves to the required
sentence).

---

## 4. Age derivation

### 4a. Where `assessments.age` is written

`shared/schema.ts:614` — `age: integer("age")`, nullable, no zod constraint
(`insertAssessmentSchema`, `shared/schema.ts:940-949`, only extends the RIASEC/CVQ
response records). **There is no server-side range validation on age anywhere.**

- **POST `/api/assessments`** — `assessment.routes.ts:116`; parsed at `:129`;
  inserted at `:257-268`. Age arrives from the client body and is written as-is.
  The five school-owned fields are resolved and overridden immediately above at
  `:210-253`; `age` is deliberately not among them (`:58-62`, `:64`).
- **PATCH `/api/assessments/:id`** — allowlist `assessment.routes.ts:417`
  includes `'age'`; the school-owned override block is `:506-…` and again excludes
  it.
- **Client senders** — `client/src/pages/Assessment.tsx:490` (debounced autosave)
  and `:608` (step-transition save); rehydrated from the server at `:346`.

### 4b. Where `assessments.age` is read

- **`server/utils/assessmentCompleteness.ts:42`** — `if (!assessment.age)
  missing.push("Age")`. This is the **only server-side consumer**, and it is a
  gate: a missing age blocks report generation for both tiers.
- **`client/src/pages/Results.tsx:519-522`** — `displayAge = assessment?.age ||
  (user as any)?.predefinedAge`, rendered in the Student Profile block.
- **`client/src/pages/ResultsPrint.tsx:519-524`** — the same expression in the
  Puppeteer PDF.
- **`client/src/pages/Profile.tsx:384`** — same fallback chain.
- **`client/src/components/assessment/DemographicsStep.tsx:308`** — the under-18
  note, gated on `!isOrgStudent`, so self-paid only.

**Nothing else reads it.** Confirmed absent from scoring and matching
(`server/services/matching.ts`, `tierWeights.ts`, `scoringConfig.ts`), from the
LLM prompts (`replaceTemplateVariables`, `server/services/llmNarrativeService.ts:61-82`
— there is no `{{age}}` template variable anywhere in the repo), and from
`server/routes/analytics.routes.ts`. 014's claim that age "is NOT load-bearing"
and that `grade` is what age-appropriate content keys on still holds exactly.

### 4c. Computed once and stored, or computed on read?

**Recommend: computed once at assessment start and stored in `assessments.age`,
resolved the same way the other five school-owned fields are.**

Three reasons, in order of weight:

1. **An assessment is a point-in-time record.** A report generated in March saying
   "16" must still say "16" when the student re-opens it in December. Compute-on-read
   makes the on-screen report silently disagree with a PDF the parent already
   downloaded — and the PDF is the artifact that leaves the system. Storing the
   value at the moment of the assessment is the honest representation of what was
   true when the assessment was taken.
2. **`assessments.age` already exists and already has consumers**, including a
   server-side gate (`assessmentCompleteness.ts:42`) and two client pages that
   render from client-held state. Deriving on read means every one of those call
   sites needs the DOB — which means shipping DOB to the client, which §6 argues
   against on privacy grounds. Storing it keeps DOB server-side entirely.
3. **It reuses the lock that already works.** `SCHOOL_OWNED_ASSESSMENT_FIELDS`
   (`assessment.routes.ts:64`) plus `resolveSchoolOwnedFields` (`:96-136`) is a
   tested, fail-closed mechanism (`server/routes/assessment.school-owned-fields.test.ts`)
   applied identically on create (`:210-253`) and update (`:506-…`). Age becomes the
   sixth entry rather than a new special case.

**The one structural wrinkle.** `resolveSchoolOwnedFields` is pure and maps each
field to a *member column* directly (`:139-145`):
```
const schoolValues: Record<SchoolOwnedField, unknown> = {
  name: member.studentName, grade: member.grade, gender: member.studentGender,
  countryId: organization?.countryId, curriculum: organization?.curriculum,
};
```
Age has no column — it is a function of `date_of_birth` and *when you ask*. Keep
the resolver pure: derive the age in the caller and hand the resolver a member
whose `age` is already computed, rather than teaching the resolver about clocks.
Its `missing` semantics then work unchanged — a member with a NULL DOB yields a
`null` age, lands in `missing`, and fails closed with the same 400 as the other
five. That is the behaviour §2 flags for the 7 legacy rows.

**The helper.** `shared/age.ts` (or an export from the `shared/dateOfBirth.ts`
proposed in §3a): completed years as of a given date, by comparing year/month/day
parts of two `YYYY-MM-DD` strings — no `new Date()` arithmetic, for the same
timezone reason `mode: "string"` was chosen in §1a. Take "now" as an explicit
parameter rather than reading the clock inside, so it is testable without freezing
time. Unit-testable with no DB, like `shared/grade.ts`.

**Also worth doing in the same change:** add a range check to the age the *self-paid*
path supplies. It is currently validated only by `min="13" max="25"` on an HTML
input (`DemographicsStep.tsx:166-168`) — trivially bypassed, and `insertAssessmentSchema`
constrains nothing. Once org students get a server-derived age, the self-paid path
is the only one where a client-supplied age reaches the column at all, which makes
the gap both smaller and more conspicuous.

---

## 5. The Basic Info (Demographics) step

`client/src/components/assessment/DemographicsStep.tsx`. The lock mechanism is
already there and already correct for four fields — this is a matter of extending
it to the fifth and, importantly, **rewriting the comments that say why it does not
apply**.

- **The age input, `:145-176`.** Locking it is one line — `disabled={false}` at
  `:172` becomes `disabled={schoolOwnsDemographics}` — but the two comment blocks
  around it exist specifically to justify the current behaviour and both become
  false:
  - `:151-154` — *"No 'set by school' marker: age is the one demographic the
    student still owns, so labelling it as the school's would be a lie the field
    itself contradicts."* The marker (`t('demographics.setBySchool')`, as used at
    `:127` for name) now applies, and this comment inverts.
  - `:157-164` — *"Age is NOT locked, unlike the three fields around it. The server
    does not own it: `organization_members.student_age` is nullable, excluded from
    the demographics CHECK and NULL on every row … (migration 014:29-38)."* Every
    clause of this is about to stop being true. Note its closing sentence, which is
    a warning aimed squarely at this change: the field *"was disabled on
    `!!predefinedAge` — never true today, but that would have silently locked a
    field the server still lets the student edit."* The new gate must be
    `schoolOwnsDemographics`, i.e. keyed on **who the student is**, not on whether
    a value happens to have arrived.
- **Prefill already works.** `:62-81` copies `predefinedAge` into `data.age` at
  `:69-71`, and `:81` lists it in the effect's dependency array. Nothing changes
  here provided the server keeps sending a derived age under the same key (§6).
- **`schoolOwnsDemographics` and `isOrgStudent`** derive from the explicit
  `isOrgStudent` prop (`:59`), not from `!!predefinedGrade` — that was fixed
  deliberately (`auth.routes.ts:57-61` documents the reasoning). Age inherits a
  correct signal for free.
- **`canProceed` at `:94`** requires `data.age`. With prefill + a server that fails
  closed on a missing DOB, an org student can never reach this step with a blank
  age — they are blocked earlier, at assessment create. Worth confirming that
  ordering holds in the flow rather than assuming it: a locked, empty, required
  field is an unrecoverable dead end for a 13-year-old with no way to ask for help.
- **The under-18 note at `:308`** is gated `!isOrgStudent` and is unaffected.
- **Self-paid path: unchanged.** Input stays editable, `min="13" max="25"`
  (`:166-168`), no "set by school" marker, consent not auto-checked (`:75-77`).
- **The explanatory line at `:105-116`** (`demographics.schoolOwnedNote`, rendered
  when `schoolOwnsDemographics`) tells the student these fields are their school's
  and who to ask. It is generic, so it covers age without a copy change — but
  worth re-reading against the i18n string, since it is *"the only place a student
  ever sees what their school recorded about them."* Both `en` and `ar` exist for
  it; the Arabic strings in this area are already flagged as unreviewed in
  FOLLOWUP.md.

---

## 6. Privacy — where DOB would surface

DOB is materially more identifying than age: it is a standing identifier, it is a
common knowledge-based-authentication factor, and combined with a name and a
school it substantially narrows a real child. Age is a bounded integer that ages
out. **The recommendation throughout is: DOB is stored, is visible to the school
that entered it, and never crosses that boundary. Everything downstream carries
derived age only.**

| Surface | Today | Recommendation |
|---|---|---|
| `GET /api/admin/organizations/:id/members` — `admin.routes.ts:573`, query `storage.ts:2525-2553` | **explicit column allowlist**; `studentAge` is *not* in it | The one place DOB legitimately belongs — the edit form prefills from this response (`AdminOrganizations.tsx:2064-2069`) and the school typed the value. Add it *deliberately*, and note the allowlist is what makes that a decision rather than an accident |
| The members table UI — columns `AdminOrganizations.tsx:880-887`, cells `:900-906` | shows gender, grade, studentId | **Show derived age, or nothing.** A DOB column puts every student's birth date on one screen, which is the shape that leaks via screenshot and screen-share |
| `storage.getOrganizationMemberByUserId` — `storage.ts:2497-2502` | bare `select()` — **whole row** | Unchanged; it is server-side. But this is why the next row matters |
| `GET /api/user` — `auth.routes.ts:64-67` | sends `predefinedName/Age/Gender/Grade` to the **student's own browser** | **The choke point.** `orgMember` here is the full row, so DOB arrives automatically. Send `predefinedAge` **derived**; never add a `predefinedDob`. A one-line slip here puts a minor's DOB in a JSON response that any XSS or shared screen can read |
| JSON export `POST …/export-students` — `admin.routes.ts:1786`, fields `:1823-1836`, `studentAge` `:1829` | the only export carrying age | Emit **derived age**, not DOB. This file leaves the system — it is downloaded, emailed, and dropped in shared drives. If DOB in an export is ever genuinely needed, that is a separate decision with its own approval, not a side effect of this step |
| CSV export, same route — `:1852-1873`, header `:1853` | `Username, Full Name, Grade, Gender, Status, Created Date` — no age | Leave alone |
| `GET …/export/csv` — `admin.routes.ts:1619`, header `:1661-1685` | 17 columns, no age | Leave alone |
| Report + PDF — `Results.tsx:519-522`, `ResultsPrint.tsx:519-524` | `assessment?.age \|\| predefinedAge` | Unchanged, and safe **provided** the two rows above hold. The PDF is the parent-shareable artifact; DOB must never appear on it |
| Credential CSVs — client `AdminOrganizations.tsx:1919-1930`, server `admin.routes.ts:850-856`, `:2222-2228` | username, password, grade, studentId | Do not add DOB. These files carry plaintext passwords and have the shortest path to being forwarded |
| Analytics — `server/routes/analytics.routes.ts` | no age dimension at all | Out of scope, but note that a DOB-derived age *dimension* would be a new personal-data flow needing its own decision |

### One pre-existing gap this step should not paper over

`GET /api/users/me/export` (`server/routes/user.routes.ts:39`), the GDPR/PDPL
subject-access export, returns `users` columns (`:81-91`) and all assessments with
recommendations, quiz and CVQ data (`:93-98`) — **but not the
`organization_members` row at all**. A school student's own data export therefore
omits everything their school recorded about them: `student_name`,
`student_gender`, `grade`, `student_id` today, and `date_of_birth` tomorrow.

Pre-existing and out of scope for step 4, but adding a *more* identifying field to
a table the subject-access export does not read makes it worse. Worth logging in
FOLLOWUP.md as its own item.

---

## 7. Sequencing and open questions

**A workable commit order**, each independently reviewable and consistent with the
"one issue per commit" rule:

1. `shared/dateOfBirth.ts` + `shared/age.ts` (or one module) with tests — pure, no
   callers yet. Precedent: `shared/grade.ts` / `shared/grade.test.ts`.
2. The column, nullable, no constraint. Schema + `date` import.
3. M1 (route + form) — the smallest end-to-end path, and the one to verify against
   a real create before touching the bulk paths.
4. The sink guard: DOB into `studentDemographicsSchema`. This is what makes it
   mandatory for M2/M3 too, so it lands before them, not after.
5. M2 (including the positional→header-named parse, per §3a) and M3.
6. The edit PATCH.
7. The derivation: age into the school-owned resolution on POST and PATCH,
   `DemographicsStep` lock, comment rewrites.
8. *(after the 7 rows are filled)* the role-scoped CHECK migration, `015_…`.
9. *(separately)* drop `student_age`.

**Open questions that need a human answer, not a code reading:**

- **Do the 7 existing students have retrievable DOBs?** §2 turns on this. If they
  do not, step 7 above blocks them from assessing and the sequencing has to change.
- **Is `dateOfBirth` required in the M3 CSV** (`requiredHeaders`,
  `admin.routes.ts:2132`, currently `['fullName']`)? Consistency with the sink guard
  says yes; it will reject every existing customer CSV template.
- **Does M2's parser get fixed in this step or noted for later?** §3a recommends
  fixing; it is a genuine scope call.
- **Does the members table show derived age, or nothing?** §6 recommends age or
  nothing, but showing *something* is a product decision.

**Testing.** Vitest is configured (`vitest.config.ts`, node environment,
`server/**`, `shared/**`, `client/src/**` `*.test.ts`). The pure modules from step
1 and the extended `resolveSchoolOwnedFields` behaviour are directly testable with
no DB, alongside the existing
`server/routes/assessment.school-owned-fields.test.ts` — whose `:31` comment about
`student_age` will itself need updating.
