# Recon — `job_market_trends` and the `Math.random()` seed

Read-only. No file outside `docs/` was modified.

Scope: the FOLLOWUP entry *"Job-market data feeding every match score is `Math.random()`"*
(FOLLOWUP.md:2950, severity HIGH, first flagged 2026-09-09), plus a sweep of `Math.random`
across `server/` for anything else that reaches a scored path.

---

## Headline: the entry's central claim is no longer true

> "IT REACHES THE STUDENT. `matching.ts:315` groups the trends by career and hands them to
> the scorer, so a component of every career match score every student has ever received is
> a random number."

**It does not reach the scorer, and has not since 2025-11-11.** The `market` component
calculator was deleted from the calculator registry in `fc54470` ("Add career assessment
scoring for CVQ values and remove market trends calculation"). That commit removed
`market: calculateMarketScore` from `componentCalculators` and the whole
`calculateMarketScore` body — the function that read `context.jobMarketTrends`, sorted by
year, and returned `latestTrend.demandScore` as a 0-100 component score.

What survived that commit is the *plumbing*, not the consumer:

| what | where | status |
|---|---|---|
| `MatchingContext.jobMarketTrends` field | `server/services/matching.ts:93` | declared, never read |
| the fetch | `server/services/matching.ts:402` | live DB query on every generate |
| the grouping | `server/services/matching.ts:405` | executed, result assigned at `:455` |
| any reader of the grouped map | — | **none** |

`matching.ts:315` — the line the FOLLOWUP cites — is inside `resolveActiveComponents`, in
the tier-weight lookup (`effectiveWeight = (dbWeight?.isEnabled && dbWeight.weight > 0) ? …`).
It has nothing to do with trends. The line reference has drifted; the underlying read is gone.

A second commit finished the job on the config side: `c735f7a` (2025-12-03) removed the
`Market Demand` component from `componentsToSeed`, from the per-tier
`tierComponentWeights` seed rows, and from `TIER_WEIGHT_OVERRIDES`. Before that it was
seeded as `{ key: "market", weight: 0, isActive: false, description: "[DEPRECATED] Job
market trends - replaced by CVQ in Nov 2025" }`.

The persisted output column agrees: `recommendations.futureMarketDemand` is written as a
literal `0` with the comment `// Deprecated, always 0`
(`server/routes/recommendations.routes.ts:186`). It is the only writer, and nothing reads it.

**So the correct framing is not "random numbers are scoring students". It is "a table of
fabricated numbers, a live query for it, and a context field carrying it are still in the
hot path of every recommendation generate, feeding nothing."** That is a much smaller
problem — but the landing-page copy problem the entry also raises is untouched by this, and
is now the *only* live consequence. See §6.

---

## 1. Exactly how it reaches a student's score

**It does not. Zero points of the 100-point match score are traceable to these values, in
every tier.**

The registry is exhaustive — `server/services/matching.ts:177-183`:

```ts
const componentCalculators: Record<string, ComponentCalculator> = {
  subjects: calculateSubjectsScore,
  interests: calculateInterestsScore,
  vision:   calculateVisionScore,
  riasec:   calculateRiasecScore,
  cvq:      calculateCvqScore,
};
```

Five calculators. `grep` for `demandScore|growthRate|openings|nationalPriorityAlignment`
across `server/`, `client/` and `shared/`, excluding `seed.ts` and the schema definition,
returns only the three `storage.ts` query builders and four test fixtures that stub
`jobMarketTrends: new Map()`. None of the five calculators touches the context field.

Weights, for completeness (`server/services/tierWeights.ts:13-38`) — no market row exists
in any of them:

| tier | subjects | interests | vision | riasec | cvq | market |
|---|---|---|---|---|---|---|
| basic (free) | 35 | 35 | 30 | — | — | **absent** |
| premium | 20 | 0 | 20 | 35 | 25 | **absent** |
| group | 20 | 0 | 20 | 35 | 25 | **absent** |

**Measured contribution: 0.0 points, spread 0.0.** A re-seed cannot move a match score by
any amount, because no code path reads the values a re-seed would write. There is nothing
to measure across re-seeds — the quantity is structurally zero, not empirically small.

### The one residual risk, and why it is not live

`resolveActiveComponents` starts from `storage.getAllAssessmentComponents()` — the **database**,
not the seed array. A database seeded before `c735f7a` can still hold a `market` row. If such a
row were `isActive` with a non-zero effective weight, it would enter `context.activeComponents`
and reach `calculateCareerMatch`.

It degrades safely (`matching.ts:791-815`): a component with no calculator hits
`if (!calculator) { console.warn(…); continue; }` **before** `totalAppliedWeight += component.weight`,
so it is excluded from the denominator and the remaining components renormalise. It cannot
dilute a score. And it cannot be weighted anyway on any realistic DB — the row was seeded
`weight: 0, isActive: false`, `TIER_WEIGHT_OVERRIDES` has no `market` key so `getEffectiveWeight`
falls through to the DB weight of 0, and `.filter(c => c.weight > 0)` drops it.

The one thing such a row *would* change is `generateConfigVersion(activeComponents)` — the
`configHash` written to `recommendations.scoring_provenance`. Worth a one-line DB check
(`select key, is_active, weight from assessment_components where key = 'market'`) before
closing this out, but it is a provenance-noise question, not a scoring question.

---

## 2. Stability in prod: are the values reproducible?

**Yes, on any database that has already been seeded once — and more stable than the FOLLOWUP
assumes. The entry's stated failure mode is wrong.**

> "it is regenerated on any seed run that finds the table empty"

It is not. The trend insert is not gated on the trend table at all. It is nested **inside the
new-career branch** (`server/seed.ts:2046-2071`):

```ts
for (const career of careers) {
  if (!existingCareerTitles.has(career.title)) {      // <-- the only gate
    const created = await storage.createCareer(career);
    for (const country of countries) {
      await storage.createJobMarketTrend({ … Math.random() … });
    }
  }
}
```

Consequences, precisely:

- **Existing rows are never touched.** There is no upsert, no `onConflict`, no update path.
  `storage.createJobMarketTrend` (`server/storage.ts:1042-1045`) is a bare
  `db.insert(jobMarketTrends).values(…).returning()`.
- **The gate is career-newness, not trend-emptiness.** Truncate `job_market_trends` on a
  seeded database and re-run the seed: **zero rows are written back**, because every career
  title already exists. The table stays empty forever.
- A career title is only ever inserted once, so its trend rows are written exactly once, at
  the moment that career first appears. Values are frozen from then on.
- The `catch { /* Trend might exist */ }` at `:2067-2069` is dead reasoning — there is no
  unique constraint on `job_market_trends` to violate. The table has only a `id` primary key
  (`shared/schema.ts:636-648`); no unique index on `(career_id, country_id, year)`. If a
  career title were ever deleted and re-seeded, duplicate trend rows would silently
  accumulate and `getJobTrendsByCareerIds` would return both.

**Volume is also smaller than the entry states.** The FOLLOWUP says "the catalog spans 15
countries (seed.ts:2081-2095)". That citation is the `countryData` lookup used by the *quiz
template generator* — 15 entries, none of which are seeded as countries. The actual
`countries` array (`server/seed.ts:782-833`) contains **one** entry: `uae`. So a from-scratch
seed writes **68 careers × 1 country = 68 rows**, not ~1000.

Countries created at runtime by the LLM country generator get **zero** trend rows — nothing
outside the seed calls `createJobMarketTrend`. So even if a reader were reinstated, the table
would cover exactly one country.

### The one field claimed to carry signal does not

`nationalPriorityAlignment` (`seed.ts:2060-2062`) picks its band by testing whether any of a
career's `relatedSubjects` is a **substring** of any of the country's `prioritySectors`:

```ts
career.relatedSubjects.some(s =>
  country.prioritySectors.some(sector => sector.toLowerCase().includes(s.toLowerCase()))
) ? 70 + Math.random() * 30 : 40 + Math.random() * 40
```

`relatedSubjects` are school subjects ("Mathematics", "Physics", "Biology"). `prioritySectors`
are UAE economic sectors ("Artificial Intelligence", "Renewable Energy", "Food Security").
Evaluating the predicate over all 24 distinct `relatedSubjects` values against the 10 UAE
sectors yields exactly **two** matches, both accidental substring collisions:

- `"Art"` ⊂ `"**Art**ificial Intelligence"`
- `"Science"` ⊂ `"Space & Advanced **Science**s"`

16 of 68 careers land in the high band, 52 in the low band — and the split is driven entirely
by whether a career lists Art or Science, via a string accident. There is no domain signal in
this field. All four numeric columns are noise.

---

## 3. Is removal straightforward?

**Yes, and unusually so: the scoring change has already happened.** There is no weight to
redistribute, no tier config to rebalance, no `SCORING_ALGORITHM_VERSION` bump, and no score
movement. The FOLLOWUP's option (a) — "it changes every match score in the product, so it
needs the weights redistributed deliberately" — describes work that `fc54470` and `c735f7a`
already did, correctly, fourteen months ago. What is left is dead-code removal.

What removal touches:

| item | file:line | note |
|---|---|---|
| the seed writer + its country loop | `server/seed.ts:2046-2071` | delete the inner `for (const country …)` block |
| the live query on every generate | `server/services/matching.ts:402` | one DB round-trip per generate, result unused |
| `groupTrendsByCareer` + call | `server/services/matching.ts:405, 485-497` | helper becomes unreferenced |
| `MatchingContext.jobMarketTrends` | `server/services/matching.ts:93` | field + `:455` assignment |
| `JobMarketTrend` import | `server/services/matching.ts:17` | |
| three storage readers | `server/storage.ts:213-216, 1042-1079` | `getTrendsByCountry` and `getTrendByCareerAndCountry` already have **zero** callers |
| `recommendations.futureMarketDemand` | `recommendations.routes.ts:186`, schema `:732` | `NOT NULL`, always written `0`; a column drop is a separate migration |

**Weights: nothing to do.** `TIER_WEIGHT_OVERRIDES` has no `market` key. The FOLLOWUP's
warning about `seed.ts:3185` — a disabled component still *holding* weight contributes
nothing while occupying it — does not apply, because no tier allocates weight to `market` in
either the hardcoded table or the seeded `tierComponentWeights` rows (both were cleaned in
`c735f7a`).

**Fixtures: four files, mechanical.** `MatchingContext` is a required-field interface, so
dropping the field means deleting one line from each of
`server/services/scoringProvenance.test.ts:62` and `:202`,
`server/services/subjectsScore.test.ts:37`, `server/services/visionScore.test.ts:46`,
plus the `getJobTrendsByCareerIds: async () => []` storage stub at
`server/services/matching.gate.test.ts:106`. No test asserts on trend values — they all stub
an empty Map, which is itself evidence the data was already understood to be inert.

Baseline before touching anything: `npx vitest run server/services/ shared/growthBands.test.ts`
→ **13 files, 312 tests, all passing** (run 2026-09-10). Removal must leave that at 312.

Dropping the `job_market_trends` table itself is a further step and can wait; it is 68 rows
on one country and harms nothing sitting there, as long as the read path is gone. Keeping the
table while deleting the reader is the wrong end to stop at — that is what produced this
entry in the first place.

---

## 4. Could O*NET fill it? No — they are different things

O*NET is already in the codebase for growth: `careers.onetGrowthBand`
(`shared/schema.ts:581`), the enum and display logic in `shared/growthBands.ts`, and the
backfill in `server/migrations/career-growth-bands.ts` (68 careers, bands read per `onetCode`
on 2026-09-02, BLS projection vintage 2024-2034, with `bandVerbatim` retained for provenance).
It feeds display and the future-readiness gate (`server/services/futureReadiness.ts`).

Field-by-field, against what `job_market_trends` claims to hold:

| `job_market_trends` column | what it claims | can O*NET supply it? |
|---|---|---|
| `growthRate` (real, %) | a numeric growth rate | **No.** O*NET publishes a *band* ("Faster than average (5% to 6%)"), not a per-occupation rate. `growthBands.ts` exists precisely because the previous hand-authored percentages were "unsourced, and wrong on 22 of 68 rows". Re-deriving a number from a band would recreate that. |
| `demandScore` (real, 0-100) | current demand level | **No.** No such O*NET measure. Would have to be invented from the band — the same fabrication in a new costume. |
| `openings` (int) | job openings | **No.** O*NET's summary band carries no openings count. BLS publishes annual openings, but US-national. |
| `averageSalaryLocal` (text) | local salary | **No.** O*NET wage data is US. This column is currently copied from the hand-authored `career.averageSalary`, not from any source. |
| `nationalPriorityAlignment` (real) | alignment with country vision | **No, and out of scope.** This is a UAE-vision question, not a labour-market one — and the product already answers it properly through the `vision` component, which is worth 30% of a free score and 20% of premium. |
| `countryId` | per-country dimension | **No — this is the fatal one.** |

That last row is the whole answer. The two are different *kinds* of claim, and
`futureReadiness.ts:22-26` already says so in the code, unprompted:

> "COUNTRY-INDEPENDENT BY CONSTRUCTION: nothing in this module reads a countryId or a
> country-scoped table. Readiness is a property of the occupation, in the same class as
> `careers.valuesProfile` and the WEF skill affinities — **not the class of
> `job_market_trends`**."

`onetGrowthBand` answers *"is this kind of work growing, globally, as measured by US
headcount?"* — one value per occupation, no country dimension. `job_market_trends` claims to
answer *"how much demand is there for this occupation in **this country** this year?"* —
which is `(career × country × year)`. O*NET has no country axis, so it cannot populate a
country-scoped table without either replicating one US number across every country (which is
a lie with a source attached, arguably worse than an obvious random number) or pinning the
table to a single country and dropping the `countryId` column — at which point it is
`careers.onetGrowthBand`, which already exists and is already populated.

`growthBands.ts:12-17` states the constraint directly: the band "counts U.S. headcount. It is
NOT a verdict on whether an occupation has a future… **Nothing may gate a career on this
signal alone.**" Feeding it into a score as a per-country demand number would be exactly the
single-source gating the codebase has twice refused to do.

Real per-country labour-market data remains what the FOLLOWUP said it was: procurement
(MOHRE, national statistics offices, a commercial feed), with a refresh cadence, provenance
columns, and a coverage story. O*NET is not a shortcut to it.

---

## 5. Sweep: `Math.random` in `server/`

Every hit, and whether it reaches a scored path.

| file:line | what | reaches scoring? |
|---|---|---|
| `server/seed.ts:2058` | `demandScore: 50 + Math.random() * 50` | **No** — no reader (§1) |
| `server/seed.ts:2059` | `growthRate: Math.random() * 30` | **No** |
| `server/seed.ts:2062` | `nationalPriorityAlignment` random band | **No** |
| `server/seed.ts:2065` | `openings: Math.floor(Math.random() * 1000) + 100` | **No** |
| `server/storage.ts:636` | username disambiguation suffix | No — identity, not scoring |
| `server/storage.ts:3140` | bulk-import username suffix fallback | No |
| `server/storage.ts:3205` | username collision suffix | No |
| `server/utils/quiz.ts:10` | `shuffleArray` (Fisher-Yates, unseeded) | **Yes — see below** |

Those are all eight hits. Nothing else in `server/` generates a value that is stored and
later read as if it were data.

### The one live finding: quiz question *selection* is unseeded random

`shuffleArray` (`server/utils/quiz.ts:5-13`) is used by `shuffleQuestions`, called three
times in `server/routes/quiz.routes.ts`:

```
:375   const shuffled = shuffleQuestions(questionsForSubject);
       selectedQuestions.push(...shuffled.slice(0, available));   // <-- selection
:388   const shuffled = shuffleQuestions(remaining);
       selectedQuestions.push(...shuffled.slice(0, needed));      // <-- selection
:409   const finalShuffledQuestions = shuffleQuestions(selectedQuestions);  // order only
```

The third call is presentation order and is harmless — the file documents why option order,
by contrast, must be deterministic (`transformQuizQuestionForFrontend` derives it from the
quiz id via `seededPermutation`, `quiz.ts:44-61`).

The first two are **not order — they are sampling**. `shuffle(...).slice(0, n)` picks *which*
questions a student answers from the pool for each subject. Question difficulty varies
(`difficulty`, `cognitiveLevel` are seeded per question), so two students with identical
subject preferences and identical ability get different question sets, different quiz scores,
different subject-competency inputs, and therefore different `subjects` component scores —
worth **35% of a free match score and 20% of premium**.

**This is a genuinely different class of problem from the trends table**, and it should not be
conflated with it. Random *sampling* from a question bank is a normal and defensible test
design; random *values* presented as market data are not. The concerns here are narrower:

1. **Not reproducible.** Nothing persists the seed. A student's quiz cannot be reconstructed
   from the assessment id alone — though the generated quiz rows themselves are persisted
   (assessment_id is unique, migration 019), so the *administered* quiz is recoverable even
   if the draw is not repeatable.
2. **Uncontrolled difficulty.** Nothing balances the draw across `difficulty` /
   `cognitiveLevel`. An unlucky draw is a lower score for the same student. There is no
   evidence anyone intended the draw to be difficulty-stratified — this is an observation,
   not a claim that it is broken.
3. `Math.random()` is not a security primitive here, and does not need to be — nothing in the
   selection is secret. No finding on that axis.

Suggested severity **MEDIUM**, and flagged **needs human review** rather than fixed: whether
question selection *should* be reproducible per student is a psychometric product decision,
not a code defect. The mechanism to make it so already exists in the same file
(`seededPermutation`, seeded on the quiz id) if the answer is yes.

---

## 6. What is actually still broken

Stripping the false premise leaves three real items, none of them "random numbers are scoring
students":

1. **Dead code carrying a live cost.** Every recommendation generate issues
   `getJobTrendsByCareerIds` (`matching.ts:402`) and groups the result into a map nothing
   reads. Low severity, trivially removable (§3).
2. **A table of fabricated numbers sitting in the database looking like data.** 68 rows, one
   country, four generated columns, one writer, no ingestion path, no admin surface. The
   danger is not what it does — it does nothing — but that the next person to find it will
   reasonably assume it is populated and wire it back up. That is precisely how this entry
   was written.
3. **The landing copy claim, which is now the only user-visible consequence.**
   `client/public/locales/en/landing.json:31` — `"marketDesc": "Get real data on career
   growth and opportunities in your country"`; `ar/landing.json:31` — `"احصل على بيانات حقيقية
   حول نمو المهن والفرص المتاحة في بلدك"` ("real data"), under the heading `"marketTitle":
   "Job Market Insights"`. The product ships no per-country job-market insights at all. It
   ships O*NET growth bands (US headcount, correctly caveated everywhere in code) and the
   vision-alignment component. The copy overclaims both the *source* ("real data") and the
   *scope* ("in your country").

   The FOLLOWUP's instruction here was right and stands: softening this string is a legitimate
   separate commit, and it is not a fix for the underlying entry. The difference now is that
   there *is* no scoring fix to sequence it behind — the copy is the whole remaining
   user-facing problem, so it can be fixed on its own merits.

---

## Recommendation

**Remove the component — but record why the phrasing is wrong, because "remove the component"
implies work that no longer exists.**

There is no component. It was removed in `fc54470` (2025-11-11) and de-configured in
`c735f7a` (2025-12-03). No tier weights it, no calculator reads it, no score moves if the
table is emptied. The remaining action is **delete the orphaned read path and the seed
writer** (§3): a mechanical dead-code removal with a 312-test baseline, no
`SCORING_ALGORITHM_VERSION` bump, no fixture rewrites beyond deleting five stub lines.

Why not the other two options:

- **Fill it from O*NET — cannot be done.** O*NET has no country axis, no demand score, no
  openings, and publishes a band rather than a rate (§4). Populating a country-scoped table
  from a US-national occupation band would replicate one number across every country and
  attach a real source to it. That is worse than an obvious random number: it makes the
  fabrication harder to spot. The codebase already refuses this exact move twice, in
  `growthBands.ts:12-17` and `futureReadiness.ts:22-26`, in its own words.
- **Keep it and stop calling it data — the weakest option.** It preserves a per-generate DB
  query for an unread result and leaves a fabricated table in place for the next person to
  rediscover and re-wire. A comment is not a control. If a real feed is ever procured, the
  schema is four columns and can be recreated then, with provenance columns
  (`source`, `fetchedAt`, `vintage`) that the current table conspicuously lacks and that
  every other sourced dataset in this repo has.

Sequencing:

1. Delete the read path and the seed writer (one commit, tests must stay at 312).
2. Fix `landing.json:31` / `ar/landing.json:31` on its own merits (separate commit) — it is no
   longer blocked on a scoring decision.
3. Leave `job_market_trends` and `recommendations.future_market_demand` as schema-level
   cleanup for a later migration; both are inert once (1) lands.
4. File the quiz-selection randomness (§5) as its own MEDIUM / needs-human-review entry. Do
   not fold it into this one — it is a legitimate design question, not fabricated data.

**FOLLOWUP.md:2950 should be downgraded HIGH → LOW and rewritten**, since its stated
mechanism ("a component of every career match score … is a random number"), its impact
("no historical report can be reproduced"), its re-generation trigger ("any seed run that
finds the table empty"), its line citation (`matching.ts:315`), and its volume claim
("15 countries") are each incorrect against the current code. The *conclusion* — that this
data is fabricated and the landing copy lies about it — was and remains right.

---

*Recon by Claude Opus 5, 2026-09-10. Read-only; nothing outside `docs/` was modified.
Verified against `main` @ `f04b2db`.*
