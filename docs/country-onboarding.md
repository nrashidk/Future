# Adding a country: the sequence, and when it is actually finished

Traced from the code, not from intent. Every claim here names the file that
enforces it.

The short answer to "when is the link complete": **a student can finish an
assessment long before the country is ready to give them a report equivalent to
another country's.** Three of the five scoring components are global and work
immediately; the one that carries the country's identity does not, and the
screen gives no sign of it.

---

## Do this

**Create the country with `autoPopulate: true`.** That single call does the
whole chain — mission, vision, priority sectors, curricula, subjects, *and* the
sector→category→skill maps that the scoring depends on. Creating it manually and
filling in the rest afterwards does not work, for the reason in §4.

```
POST /api/admin/countries
{ "id": "oman", "name": "Oman", "code": "OM", "autoPopulate": true }
```

Then, in order: **questions → school → students**.

---

## 1. The order, and what forces it

| # | Step | Depends on | Enforced by |
|---|---|---|---|
| 1 | Country row (`id`, `name`, `code`) | — | `createCountrySchema`, `country.routes.ts:21` |
| 2 | `curricula[]`, `gradeLevels[]` | 1 | `updateCountrySchema` |
| 3 | Subjects, per curriculum | 2 | **Hard 400**: *"Curriculum 'MOE' is not available for this country"* |
| 4 | Questions, per country + grade + curriculum + subject | 3 | Soft — see §3 |
| 5 | Priority sectors + category map + skill vectors | 1 | **Not enforced at all** — see §4 |
| 6 | School in the country | 1 | `countryId` on the organization |
| 7 | School records consent | 6 | **Hard 409** before any enrolment |
| 8 | Students | 7 | — |

Only steps 3 and 7 fail loudly. Everything else will let you carry on with the
country in a state that looks finished and is not.

**Curricula before subjects is the one ordering the API will refuse to let you
get wrong.** I hit that 400 while testing: subjects created before the curricula
array existed were rejected three times in a row.

---

## 2. Where the LLM fits

`autoPopulate: true` on creation runs `researchCountryData`
(`llmCountryService.ts:264`) and writes, in one pass:

- mission, vision, national goals
- `prioritySectors` (5–8 names)
- `curricula`
- `subjects`

and then, in the same request (`country.routes.ts:338`), calls
`persistGeneratedSectors`, which writes the three tables that matter for
scoring: `country_priority_sectors`, `country_sector_wef_skills` (5–7 skills per
sector with per-skill importance) and `country_sector_categories`.

**Questions are a separate step.** `POST /api/admin/countries/:id/generate-questions`
is its own route and its own LLM call. So: priorities and curricula together,
questions after.

Your instinct that questions differ by curriculum is right and the schema agrees
— `quiz_questions.curriculum` exists and the quiz query filters on it first.

---

## 3. Questions: how many, and what happens below that

Selection (`quiz.routes.ts`) tries, in order:

1. country + grade + **curriculum**
2. country + grade (curriculum dropped)
3. any country at that grade — **borrowing**
4. neighbouring grades

A quiz needs **15** questions and refuses below **6**. Until recently a country
with 1–5 questions was *worse* than one with none: the fallbacks only fired on
an empty pool, so adding your first question broke every student in that country
until the sixth. Fixed in `e50a54b` — the pool is now topped up rather than
replaced.

**But topping up means borrowing from another country.** The server logs it:

> `[quiz] BORROWING QUESTIONS: country oman has only 2 question(s) at grade 10 … Adding 13 from other countries so the quiz can be built. Populate this country's bank.`

So a half-populated country produces a quiz, and a student sitting it is being
assessed partly on another country's curriculum. **Nothing on screen says so.**

**Target: 15+ per subject per grade per curriculum** before students use it in
anger. Below that it works and quietly misleads.

---

## 4. The part that does not fail loudly — and the trap

This is the real answer to "when is the link complete".

`calculateVisionScore` (`matching.ts`) reads `country_sector_categories`. Without
those rows **every career scores `VISION_FLOOR` (40)** and the component cannot
tell one career from another. It is not an error — the report still renders, with
matches and narratives, and looks fine.

What it costs, from `tierWeights.ts`:

| Tier | Vision weight | Effect when the map is missing |
|---|---|---|
| Basic | **30%** | Nearly a third of the score is a constant |
| Premium | **20%** | A fifth is a constant |

The matcher does warn, in the server log only:

> `SCORING WARNING: component 'vision' has weight 0.3 … every career is scoring the floor (40) … Seed the sector-category map for this country.`

**The trap:** that map is written in exactly one place —
`persistGeneratedSectors`, inside the `autoPopulate` branch of country creation.

- A country created with `autoPopulate: false` never gets it.
- **`repopulate` does not fix it.** `POST /api/admin/countries/:id/repopulate`
  re-runs the research and updates mission, vision, priority sectors, curricula
  and subjects — and never calls `persistGeneratedSectors`
  (`country.routes.ts:572`).
- No superadmin screen writes it.

So a country created manually, **or one where sector generation failed during
creation**, is stranded: its reports will render for every student, for ever,
with a third of the basic score inert, and the only trace is a log line.

**Recommended fixes, in order:**

1. Make `repopulate` call `persistGeneratedSectors`, so there is a recovery path.
2. Surface a readiness indicator in the superadmin country list — sector-map
   present, question count per grade/curriculum — so "not finished" is visible
   without reading logs.
3. Refuse to attach a school to a country whose sector map is empty, or warn
   hard at that moment.

---

## 5. What is global and needs nothing per country

These work from the first minute and are identical across countries: the 68
careers, RIASEC (30 items), CVQ (5 domains / 15 items), the 8 interest domains,
the WEF 16-skill vocabulary, growth bands and scoring tiers.

That is why a half-built country still produces a plausible report. **Four of
the five inputs are global.** The one that is not is the one that makes the
report *about that country*.

---

## 6. The readiness checklist

A country is finished when all of these are true:

- [ ] `curricula[]` and `gradeLevels[]` set
- [ ] Subjects exist for **every** curriculum offered
- [ ] 15+ questions per subject, per grade, per curriculum
- [ ] `country_priority_sectors` populated
- [ ] `country_sector_categories` populated ← **the one that silently matters**
- [ ] `country_sector_wef_skills`: 5–7 skills per sector, per-skill importance
- [ ] Every sector claims at least one career in the live catalogue
- [ ] Server log shows no `SCORING WARNING` for the country
- [ ] Server log shows no `BORROWING QUESTIONS` for the country

The last two are the honest test. **Run one assessment in the new country and
read the log** — if either line appears, the country is not ready, whatever the
screen shows.
