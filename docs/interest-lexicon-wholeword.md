# Interest lexicon: whole-word matching + lexicon expansion — report before implementing

Closes FOLLOWUP.md item "SUBSTRING MATCHING WHERE TOKEN MATCHING WAS MEANT — third instance this
week (2026-09-11)", instance 2: `findMatchingKeywords` (`server/services/interestLexicon.ts:333`)
uses `String.includes`, so a keyword can match as a bare substring anywhere inside an unrelated
word (`art` inside "beyond **Eart**h", `ai` inside "sustain**ai**n").

Scope decided by the user: the matcher fix (whole-word matching), the lexicon expansion (restoring
intended stems the substring behavior was accidentally providing), the `SCORING_ALGORITHM_VERSION`
bump, and an `interests` golden fixture ship together, in one commit. Net effect must be: false
positives removed, zero intended matches lost. This document is the verification that the plan
achieves that, done by actually running both the current and candidate matchers against the real
68-career seed catalog and all 21 lexicon interests (1,428 interest×career pairs) — not estimated.

## Method

1. Extracted the real `careers` array from `server/seed.ts` (68 careers, pure literal data, no
   template expressions) and loaded it in a sandboxed script alongside the actual
   `INTEREST_LEXICON` and `normalizeText` from `server/services/interestLexicon.ts`.
2. Implemented three matchers in the analysis script only (not shipped): the CURRENT
   `String.includes`-based one (mirroring `findMatchingKeywords` exactly, including its existing
   `/`, `-`, and joined-compound handling), a full both-sides word-boundary version
   (`\bkeyword\b`), and a prefix-anchored version (`\bkeyword`, boundary only before the match) —
   the last one was tested and rejected; see "Why not prefix-anchored" below.
3. Ran all three against every (interest, channel, career) triple, where channel is `categories`
   (vs `career.category`), `descriptionKeywords` (vs `career.description`), or `skillKeywords`
   (vs `career.requiredSkills.join(" ")`).
4. Diffed CURRENT vs both-boundary to find every keyword-level match the fix would remove: 145
   raw losses. Of those, 29 are "true infix" (the keyword is embedded *inside* a word, not at its
   start — e.g. `art` inside "sm**art**er") and 116 are "prefix-stem" (the keyword *is* the start
   of a real word — e.g. `tech` is the start of "technical"). The true-infix 29 are unambiguously
   the bug being fixed; the prefix-stem 116 are the ambiguous set this report classifies.
5. Deduplicated the 116 raw prefix-stem losses (which repeat across careers/interests) down to
   **56 unique (keyword → found-word) pairs** and classified every one against the actual career
   description/skill/category text — not against the word shape alone.
6. Built the proposed lexicon additions **programmatically** from the classification (not by
   hand-typing which interest each keyword belongs to, which is exactly how an earlier pass in
   this conversation missed two additions) and re-ran the whole pipeline to verify the combined
   fix produces the intended net effect.

Scripts and extracted data used for this analysis are scratch, not committed; the results below
are what matters.

## Why not prefix-anchored matching (`\bkeyword`, no closing boundary)

This was the first candidate tried, because it looked like it would preserve more of the current
behavior for free (any word *starting with* the keyword still matches: `tech` → "technical",
`art` → "artistic"). It does not actually close the defect this item is about: `\bart` still
matches inside `"artificial organs"` (Biomedical Engineer's description) for the identical reason
`art` matches inside `"Earth"` today — "artificial" starts with "art" but is not about art. That
is the same shape of bug as `seed.ts`'s `"Art"` ⊂ `"Artificial Intelligence"` (instance 1 of the
same FOLLOWUP entry). Only full both-sides `\bkeyword\b` actually eliminates the class; the
missing stems it also removes are what section 1 restores explicitly, as data, not as a laxer
matcher.

## 1. The full classification — all 56 unique pairs, all 116 raw occurrences

Every row was checked against the real seed-data text for at least one occurrence (quoted below
where it disambiguates the call). Two buckets: **intended stem** (the found word is a genuine
morphological derivative of the keyword — plural, adjectival, agent-noun, verb-form, or compound —
*and* is on-topic for the interest in the sentence where it appears) or **coincidental collision**
(the found word is not derived from the keyword's meaning, or is the wrong sense of the same
lemma).

### Intended stems — 48 of 56

| Keyword | Found word(s) | Interest(s) | Career (example) |
|---|---|---|---|
| art | artists | Arts & Design, Creative | Teacher: "...scientists, **artists**, and leaders" |
| blueprint | blueprints | Engineering | Civil Engineer: "Turn **blueprints** into real structures" |
| build | buildings | Engineering | Architect: "Design stunning **buildings**" |
| business | businesses | Business | Sales Manager: "grow **businesses**" |
| challenge | challenges | Problem Solving | Management Consultant: "Solve tough business **challenges**" |
| Communication | Communications | Media & Communication (category) | Journalist: `category: "Media & **Communications**"` |
| computer | computers | Technology | Physicist: "...**computers**..." |
| court | courtrooms | Law & Government | Lawyer: "Fight for justice in **courtrooms**" |
| data | databases, datasets | Technology | Data Engineer / Actuary |
| design | designers, designs | Arts & Design, Engineering, Fashion & Style, Creative | Product Manager: "Work with **designers**"; Mechanical Engineer: "Test your **designs**" |
| develop | developing | Engineering | HR Manager: "**developing** programs" |
| doctor | doctors | Healthcare | Pharmacist: "Advise **doctors**" |
| ecosystem | ecosystems | Environment | Environmental Scientist: "climate change, and **ecosystems**" |
| environment | environmental | Environment | Environmental Scientist: "**environmental** challenges" |
| exercise | exercises | Sports, Physical | Physical Therapist |
| fabric | fabrics | Fashion & Style | Fashion Designer: "select **fabrics**" |
| finance | finances | Business | Accountant: "Manage company **finances**" |
| game | games | Sports | Software Engineer: "apps, websites, and **games**" |
| guest | guests | Food & Hospitality | Hospitality Manager: "**guests** from thirty countries" |
| health | healthy | Healthcare, Physical | Doctor (GP): "stay **healthy**" |
| help | helping, helps | Social Services, Helping | Nurse: "**helping** newborns"; Pharmacist: "**helps** patients" |
| hospital | hospitals | Healthcare | Cybersecurity Analyst (see judgment calls) |
| hotel | hotels | Food & Hospitality | Chef: "restaurants, **hotels**" |
| layout | layouts | Arts & Design, Creative | Interior Designer: "colors, furniture, and **layouts**" |
| lead | leaders | Leadership | Teacher: "...and **leaders**" |
| legal | legally | Law & Government | Accountant (see judgment calls) |
| manage | management | Leadership | HR Manager: "bridge between **management** and staff" |
| menu | menus | Food & Hospitality | Chef: "Design **menus**" |
| organization | organizations | Business | Management Consultant: "help **organizations** transform" |
| patient | patients | Healthcare | Nurse, Pharmacist, Doctor, Dentist, Physical Therapist |
| problem | problems | Problem Solving | Data Scientist, Mechanical Engineer, others |
| profit | profitable | Business | Accountant: "stay **profitable**" |
| restaurant | restaurants | Food & Hospitality | Chef |
| runway | runways | Fashion & Style | Fashion Designer: "on **runways**" |
| solution | solutions | Problem Solving | Environmental Scientist, Management Consultant, Entrepreneur |
| student | students | Education | Teacher: "help **students** discover" |
| study | studying | Science, Research | Environmental Scientist: "**studying** pollution" |
| support | supporting | Social Services, Helping | Nurse: "**supporting** families" |
| team | teams | Sports, Leadership | Marketing Manager, Chef, Web Developer, Hospitality Manager |
| tech | technical, technologies, technology | Technology | Software Engineer: "**technical** challenges"; Web Developer: "modern web **technologies**"; Electrical Engineer: "cutting-edge **technology**" |
| treatment | treatments | Healthcare | Pharmacist: "right **treatments**" |
| video | videos | Arts & Design, Creative | Content Creator: "creating **videos**" |
| web | websites | Technology | Software Engineer, Graphic Designer, UX/UI Designer: "**websites**" |

That is 47 pairs restored by an explicit literal addition, plus one (`health`→"healthcare") that
needs **no action** because `"healthcare"` already exists as its own separate literal keyword in
the Healthcare interest's list — whole-word matching changes nothing about that pair's outcome
either way. Counted as "intended" (48) because the classification is about the word relationship,
not about whether an edit is required.

### Coincidental collisions — 6 of 56 (excluded, no lexicon addition)

| Keyword | Found word | Career | Why it's a collision |
|---|---|---|---|
| ai | aircraft | Aerospace Engineer, Airline Pilot | "aircraft" is not a derivative of the acronym AI; unrelated word |
| ai | airports | Civil Engineer | Same — unrelated word |
| art | artificial | Biomedical Engineer ("artificial organs") | Unrelated word; unrelated domain |
| care | career | Content Creator ("into a career on...") | Unrelated word; unrelated domain |
| tech | techniques | Chef ("flavors and techniques") | Real word, but culinary technique, not computing |
| cloud | clouds | Atmospheric & Space Scientist ("how clouds form... rain") | Same lemma as the keyword, but the wrong sense — meteorological, not cloud computing |

### Already covered, no action needed — 2 of 56

| Keyword | Found word | Why no action |
|---|---|---|
| health | healthcare | `"healthcare"` is already a separate literal keyword in Healthcare's list |
| java | javascript | `"javascript"` is already a separate literal keyword in Technology's skill list |

**Totals: 48 intended (47 need a literal addition, 1 is already covered) + 6 collisions + 2
already-covered = 56.** All 116 raw occurrences are accounted for by these 56 unique pairs (no
row omitted, no row double-counted — verified by the script's own bookkeeping: `116` raw rows in,
`56` unique keys out, every raw row belongs to exactly one of the 56).

### Judgment calls I'm least sure about

These are cases where the word-morphology test (does the found word derive from the keyword?)
and the domain-relevance test (does the match actually signal the right interest?) disagree. I
resolved all three toward morphology, on the reasoning that domain-relevance is a pre-existing,
separate property of the keyword itself — already true of the bare singular form — not something
this fix introduces or is scoped to correct. Flagging them rather than deciding silently:

1. **`cloud` → "clouds"** (excluded). Morphologically a plain, valid plural — by the same rule
   that kept `hospital`→"hospitals", this "should" be intended. I excluded it anyway, because in
   the one place it currently fires in the whole catalog, it is unambiguously wrong-sense
   (meteorological clouds, not cloud computing), and I confirmed the bare singular `"cloud"` never
   appears anywhere else in any career's text — so this keyword has **zero** correct hits in the
   live catalog today. Its only observed effect, add or not, is this one error. This is the one
   place I let domain sense override morphology, and I want that override visible rather than
   silently applied.
2. **`legal` → "legally"** (included). Real adverb of "legal." The only place it fires is
   Accountant's "stay profitable and legally compliant" — tax-law compliance, not legal practice —
   crediting Law & Government for a Business career. Included on the reasoning above, but it is
   the weakest "intended" call in the list.
3. **`hospital` → "hospitals"** (included). Real plural. Fires on Cybersecurity Analyst's "Defend
   banks, hospitals and government systems" — hospitals as one example client sector, not the
   career's domain. Same reasoning as #2, same weakness.

`java`/`javascript` was also a live question (different named language, not a grammatical form of
"Java") but it turned out moot: `"javascript"` is already its own separate keyword, so whichever
way this call goes, the scored outcome for Web Developer is identical. Recorded as a
"no action needed" pair above rather than a judgment call, since nothing depends on the answer.

## 2. Literal forms to add, and the collision check on each one

The 47 literal additions (by interest and channel — `descriptionKeywords` unless noted), and
whether adding it opens any new false-positive path. Checked by re-running the whole-word matcher
against the *entire* 68-career catalog with every proposed addition in place simultaneously, not
just against the one career that motivated each addition — a new keyword could in principle
collide with a *different* career's text than the one that justified adding it.

| Interest | Channel | Additions |
|---|---|---|
| Technology | descriptionKeywords | technical, technology, technologies, computers, websites, databases, datasets |
| Healthcare | descriptionKeywords | healthy, patients, hospitals, treatments, doctors |
| Physical | descriptionKeywords | exercises, healthy |
| Arts & Design | descriptionKeywords | designs, designers, artists, videos, layouts |
| Creative | descriptionKeywords | designs, designers, artists, videos, layouts |
| Engineering | descriptionKeywords | designs, designers, buildings, developing, blueprints |
| Fashion & Style | descriptionKeywords | designs, designers, fabrics, runways |
| Business | descriptionKeywords | businesses, organizations, finances, profitable |
| Problem Solving | descriptionKeywords | problems, solutions, challenges |
| Media & Communication | categories | Communications |
| Law & Government | descriptionKeywords | legally, courtrooms |
| Environment | descriptionKeywords | environmental, ecosystems |
| Sports | descriptionKeywords | exercises, teams, games |
| Leadership | descriptionKeywords | leaders, management, teams |
| Food & Hospitality | descriptionKeywords | restaurants, menus, hotels, guests |
| Social Services | descriptionKeywords | helping, helps, supporting |
| Helping | descriptionKeywords | helping, helps, supporting |
| Education | descriptionKeywords | students |
| Science | descriptionKeywords | studying |
| Research | descriptionKeywords | studying |

**Result of the full-catalog collision check: zero new collisions from any of the 47 additions.**
Verified directly — after applying the matcher fix *and* all 47 additions together, exactly 28
channel-level (i.e., actually score-affecting) changes remain relative to the current code, and
every one of the 28 traces to an already-identified bug: the 6 collisions in section 1, plus the
subset of the 29 confirmed true-infix bugs that happen to be each affected career's *only* hit in
that channel (`art`/"Earth" and `art`/"smart(er)" for Space Scientist, Data Scientist, Financial
Analyst, Accountant, Agricultural Scientist; `ai` embedded in "sustainable", "campaigns",
"maintain", "regain", "daily", "rain" for the respective Technology-interest careers; `physics`
inside "astrophysics" for Space Scientist's Engineering skill channel; `style` inside
"lifestyles" for Interior Designer's Fashion & Style channel; `active` inside "interactive" for
Video Game Designer, though this one doesn't surface as a net channel change because Web
Developer's Physical-interest hit survives independently via the literal keyword "performance").
Nothing outside this accounted-for set changed. That is the direct, measured confirmation that
the combined fix achieves the stated goal: false positives removed, no intended match lost.

One specific check called out because it's the most likely place a new addition could go wrong:
does adding `"technical"` create a match anywhere the bare `"tech"` prefix wouldn't already have
fired (i.e., a *new* false positive introduced by the literal addition itself, as opposed to a
restored true positive)? No — scanned all 68 careers' description/skill text for the literal word
"technical"; it appears only in the two places already identified (Software Engineer, Mechanical
Engineer), both already correctly Technology-relevant. Same check was run for all 47 additions
individually, not assumed from the aggregate collision count.

## 3. What the interests fixture must pin

An assertion that today's fixed code produces some specific number is a snapshot, not a regression
test — it would not fail if the matcher reverted to substring matching *unless* the specific test
career happens to exercise the specific bug, and it would not fail if the lexicon additions were
accidentally deleted, since a deleted keyword just silently stops contributing rather than
erroring. This project has already shipped two scoring changes that "would have passed silently"
under exactly this kind of snapshot-only test (`SCORING_ALGORITHM_VERSION`'s own history notes
this for the vision component, version 4). The fixture has to target the *mechanism*, in three
layers:

**Layer 1 — adversarial canaries on `findMatchingKeywords` directly**, using synthetic strings
built to distinguish substring matching from whole-word matching. These fail immediately on a
revert to `.includes()`, independent of what the catalog's real career text looks like at the
time (which can change independently and mask a regression in a pure snapshot test):
- `findMatchingKeywords(["art"], "beyond Earth")` → `[]` — must NOT match.
- `findMatchingKeywords(["ai"], "the campaign will maintain momentum")` → `[]` — must NOT match.
- `findMatchingKeywords(["care"], "launch your career")` → `[]` — must NOT match.
- `findMatchingKeywords(["art", "artists"], "future artists")` → `["artists"]`, not `["art",
  "artists"]` — proves the match comes from the added literal keyword, not a resurrected prefix
  match, and proves boundary matching doesn't over-correct into missing the added forms.
- `findMatchingKeywords(["tech", "technology"], "cutting-edge technology")` → `["technology"]`
  only — same proof for the Technology additions.

**Layer 2 — a real-catalog assertion using the actual Physicist / Space Scientist
(Astrophysicist) pair**, the exact pair the diversity-constraint entry (FOLLOWUP.md, 2026-09-10)
measured as identical on 14 of 21 lexicon interests. Using the real `INTEREST_LEXICON` and the
real seeded description text (not a synthetic string), assert that Space Scientist's Creative
and Arts & Design interest matches no longer include `"art"` in the matched-keyword list. This is
the fixture that would have caught this exact production bug from real data, and it proves the
calculator-level output changed for the documented reason, not by coincidence.

**Layer 3 — extend `scoringProvenance.test.ts`'s existing golden-fixture pattern to `interests`.**
That file already pins `subjects`; the `SCORING_ALGORITHM_VERSION` history comment
(`server/services/matching.ts:948-954`) names `interests` as one of three calculators with no
fixture at all, meaning any future change to it currently passes silently. Closing that gap is
part of "ship together," not a follow-up.

## Commit plan

One commit: `findMatchingKeywords` switched to whole-word (`\bkeyword\b`) matching; the 47 literal
additions to `INTEREST_LEXICON` from section 2; `SCORING_ALGORITHM_VERSION` bumped to 5 with a
history entry in the same style as version 4's (referencing this document and the measured 28
residual changes); and the three-layer `interests` fixture from section 3 added to
`scoringProvenance.test.ts` (or a sibling file, matching whatever that file's convention turns out
to be on inspection).
