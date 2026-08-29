# CVQ career values profiles — PROPOSED (O*NET 30.0 Work Values, RESCALED)

> **STATUS: DATA PREP ONLY — NOT APPLIED.** Nothing here has been written to the
> database, `server/seed.ts`, or `server/services/matching.ts`.
>
> Regenerate with:
> `npx tsx scripts/generate-cvq-values-profiles.ts "<path>/Work Values.txt"`

Generated 2026-08-29. 37 careers. Normalization: **RESCALED** (confirmed decision).

## 1. Provenance

| | |
|---|---|
| Source | O*NET 30.0 database (text), file `Work Values.txt` |
| URL | `https://www.onetcenter.org/dl_files/database/db_30_0_text.zip` |
| sha256 (zip) | `b7388aadeb3edef2a59fd292ac4e9b72d3e9266c65a136b7b8cc42b23003ce5a` |
| Rows used | `Scale ID = EX` (extent rating). `VH` (high-point) rows ignored. |
| Occupations rated | **874** of the 1 016 in O*NET 30.0 |
| Careers in crosswalk | **37** — matches the 37 live rows in `careers` |
| Duplicate O*NET codes | **none** |

The Work Values descriptor is **frozen, not withdrawn** — analyst ratings from 2008,
still shipped in the bulk database. It is unavailable over Web Services v2.0
(`…/details/work_values` → HTTP 404), which is why this uses the flat file.

## 2. Normalization: RESCALED (confirmed)

```
raw      = (onet_value - 1) / (7 - 1) * 100          # O*NET EX floor is 1, not 0
applied  = (raw - domain_min) / (domain_max - domain_min) * 100   # over these 37 careers
```

**Why rescaled.** Reports need *within-country* consistency, not cross-country
comparability; a student is only ever matched against their own country's catalog.
CVQ profiles are curriculum-independent, so the catalog is the only population the
scale must be stable over. Raw O*NET ratings sit in a narrow band (analysts rarely
use the ends of the 1–7 scale), which compresses Euclidean distance and blunts
matching — see §4. Rescaled passes **all three** helper-pattern probes; raw passes
1.

**Accepted costs — read before using a domain number in a report:**

1. A rescaled value is a **catalog rank position, not an occupational fact**.
   `security = 0` means *lowest security emphasis in this catalog*, **not** "this
   job offers no security". Do not surface raw domain numbers to students as
   absolute statements about the occupation.
2. Bounds are catalog-scoped: **adding or removing one career rewrites every other
   career's profile.** Regenerate the whole dataset; never edit a row by hand.
3. Cross-country divergence is accepted by design — the same occupation may hold
   different profiles in different countries.

Rescale bounds actually used (raw scale):

| domain | min | max |
|---|---|---|
| `achievement` | 56 | 89 |
| `benevolence` | 33 | 100 |
| `self_direction` | 45 | 95 |
| `security` | 35 | 76 |
| `power` | 45 | 89 |

## 3. Crosswalk changes

### 3a. Substitutions — crosswalk code has NO work-values data (ACCEPTED)

Three crosswalk codes are 2018-SOC occupations created after the Work Values
descriptor was frozen, so they are absent from the 874 rated occupations. Each is
redirected to the nearest rated occupation, chosen to collide with no other
career's code. **Status: accepted.**

| Career | Crosswalk code (no data) | Substitute (has data) | Rationale |
|---|---|---|---|
| Software Engineer | `15-1252.00` — Software Developers *(no data)* | **`15-1299.08` — Computer Systems Engineers/Architects** | Design-and-build software/systems work, the closest rated match to Software Developers; Computer Programmers (15-1251.00) is the narrower code-to-spec role. |
| Financial Analyst | `13-2051.00` — Financial and Investment Analysts *(no data)* | **`13-2099.01` — Financial Quantitative Analysts** | Same financial-analysis work under the residual 13-2099 code; the rated occupation nearest to Financial and Investment Analysts. |
| Product Manager | `13-1082.00` — Project Management Specialists *(no data)* | **`15-1299.09` — Information Technology Project Managers** | Project-management content on a technology product; 13-1111.00 (Management Analysts) would duplicate Management Consultant. |

### 3b. Corrections — code HAS data but denotes the wrong occupation

These failed silently: the code was rated, so nothing errored; it simply was not
the job the crosswalk comment named.

| Career | Was | Now | Rationale |
|---|---|---|---|
| UX/UI Designer | `15-1255.01` — Video Game Designers | **`27-1021.00` — Commercial and Industrial Designers** | The crosswalk comment said "Web and Digital Interface Designers", but that is 15-1255.00 — and 15-1255.00 has NO work-values data. 15-1255.01 is Video Game Designers, a different occupation that the Video Game Designer career should hold (see below). Of the rated occupations, 27-1021.00 is the only one whose content is user-centred design: "combine artistic talent with research on product use, marketing, and materials to create the most functional and appealing product design" — the same design-research-then-design process as UX/UI, differing only in medium. Rejected alternatives: 15-1254.00 Web Developers (the SOC-lineage ancestor of 15-1255.00, but it is the code-writing half of the split AND duplicates the Web Developer career); 27-1024.00 Graphic Designers (the aesthetic half, duplicates the Graphic Designer career); 17-2112.01 Human Factors Engineers and Ergonomists (closest on usability research, but engineering-framed and its achievement rating of 89 would make UX/UI Designer one of the most achievement-driven careers in the catalog). |
| Video Game Designer | `27-1014.00` — Special Effects Artists and Animators | **`15-1255.01` — Video Game Designers** | O*NET 30.0 has an exact-title rated occupation for this career, 15-1255.01 Video Game Designers. The previous code, 27-1014.00, is Special Effects Artists and Animators — a neighbouring but different craft (VFX/animation production, not game design). 15-1255.01 is freed by the UX/UI Designer correction above, so no duplicate is created. |

Applied in this generator, not in `scripts/parse-onet-values.ts`, so the original
crosswalk stays the untouched record of what the database currently believes.

## 4. Per-domain spread — discrimination under RESCALED

| domain | raw range | raw Δ | raw sd | **applied range** | **applied Δ** | **applied sd** | distinct values |
|---|---|---|---|---|---|---|---|
| `achievement` | 56–89 | 33 | 7.2 | **0–100** | **100** | **21.9** | 8/37 |
| `benevolence` | 33–100 | 67 | 19.0 | **0–100** | **100** | **28.6** | 14/37 |
| `self_direction` | 45–95 | 50 | 10.8 | **0–100** | **100** | **21.6** | 10/37 |
| `security` | 35–76 | 41 | 9.3 | **0–100** | **100** | **22.6** | 21/37 |
| `power` | 45–89 | 44 | 11.3 | **0–100** | **100** | **25.7** | 9/37 |

Rescaling does not *invent* discrimination — the ordering is untouched, it is a
monotone per-domain transform. What it does is stop each domain from wasting most
of the 0–100 space: raw spans of 33/67/50/41/44 become the full 0–100,
so the Euclidean distance that `calculateCvqScore` computes actually uses its range.
The `distinct values` column is the direct discrimination check: a domain that
collapsed careers onto one another would show few distinct values.

**Honest caveat on that column.** Discrimination is not uniform across domains.
`achievement` is the weakest, with only
8 distinct levels across 37 careers, because its raw O*NET span is the
narrowest (56–89) — analysts simply did not spread occupations far apart on it.
Rescaling stretches that span but cannot create levels that were never rated, so
ties remain ties. `security` is the strongest at 21/37.
The five domains are still carrying five distinguishable signals — see the
correlation table below — but a report should not lean on `achievement` alone to
separate two careers.

### Inter-domain correlation (applied profiles)

Five domains must carry five signals. Highest \|r\| first:

| pair | r |
|---|---|
| `self_direction` ↔ `power` | 0.604 |
| `achievement` ↔ `self_direction` | 0.520 |
| `security` ↔ `power` | 0.487 |
| `achievement` ↔ `power` | 0.399 |
| `benevolence` ↔ `security` | 0.334 |
| `benevolence` ↔ `self_direction` | 0.289 |
| `achievement` ↔ `security` | 0.277 |
| `self_direction` ↔ `security` | 0.272 |
| `benevolence` ↔ `power` | 0.267 |
| `achievement` ↔ `benevolence` | 0.198 |

## 5. Validity — three benevolence-heavy "helper" students

Student CVQ scores are `((mean Likert - 1) / 4) * 100` over 3 items
(`cvq.routes.ts:96-104`), so only 0/25/50/75/100 are reachable. Every probe is a
real reachable response pattern. Ranks are over all 37 careers using a replica of
`calculateCvqScore` (Euclidean distance over the 5 shared domains).

Helpers = Nurse / Social Worker / Psychologist. Foils = Photographer / Accountant.
**PASS** = every helper ranks above every foil.

| Helper student | Helper ranks | Foil ranks | RESCALED (applied) | raw (rejected) |
|---|---|---|---|---|
| PRIMARY — benevolence 5/5/5, achievement 4, self-direction 4, security 4, power 2 | #4 / #1 / #3 | #35 / #14 | **PASS** | PASS |
| flat-neutral — benevolence 5, everything else 3 | #6 / #5 / #2 | #32 / #11 | **PASS** | FAIL |
| modest-achievement — benevolence 5, achievement 3, self-direction 4, security 4, power 2 | #2 / #1 / #5 | #35 / #11 | **PASS** | FAIL |

**Result: 3/3 PASS under rescaled — all three helper patterns pass.**

Raw passes only 1/3, and the failure mechanism is precisely the one rescaling fixes.
Under both secondary patterns Psychologist falls behind Accountant. Compare the two
occupations on the raw scale: Accountant is `67/61/67/60/61` — every domain
bunched in the 60s, including a benevolence of 61 for one of the least
relationship-oriented occupations in the catalog. Against a mid-scale student that
near-central profile is close on *every* axis, while Psychologist
(`81/97/83/58/72`) is penalised for its genuinely high achievement and
self-direction. The benevolence gap that the probe is actually testing — 3 points for
Psychologist vs 39 for Accountant — is too compressed to outweigh it. Rescaled,
Accountant's benevolence drops to 42 against Psychologist's 96, the intended
signal dominates, and the helper ordering holds.

## 6. 🚩 KNOWN LIMITATION — Entrepreneur (mapping KEPT, flagged not fixed)

**Entrepreneur → `11-1021.00` General and Operations Managers** — an acknowledged proxy
(`scripts/onet-crosswalk-corrected.md`), and the profile it produces is wrong in a way
that matters for the students this product serves.

| | achievement | benevolence | self_direction | security | power |
|---|---|---|---|---|---|
| raw | 72 | **89** | 83 | 72 | 78 |
| applied (rescaled) | 48 | **84** | 76 | 90 | 75 |

General and Operations Managers carry an O*NET Relationships rating of **6.33**, because
operations managers really do supervise, coach and develop staff. Entrepreneurs, as
students understand the word, do not necessarily. The consequence is visible in §7:
**Entrepreneur ranks #8 of 37** for the PRIMARY helper student — a benevolence-heavy
15-year-old is told entrepreneurship fits their caring values.

**The arithmetic is right; the proxy is wrong.** Decision for now: **KEEP the mapping,
flag it here.** Deliberately *not* hand-authored — inventing a profile would put an
unsourced number in a dataset whose whole claim is that every number traces to O*NET.
Re-crosswalking Entrepreneur is a separate decision.

## 7. Full ranking under the PRIMARY helper student (applied profiles)

| # | Career | CVQ match | benevolence |
|---|---|---|---|
| 1 | Social Worker | 93.6 | 93 |
| 2 | Teacher (Secondary Education) | 84.3 | 100 |
| 3 | Psychologist | 81.7 | 96 |
| 4 | Healthcare Professional (Nurse) | 80.3 | 84 |
| 5 | Management Consultant | 76.1 | 75 |
| 6 | Physical Therapist | 75.2 | 93 |
| 7 | Marketing Manager | 74.9 | 67 |
| 8 | Entrepreneur 🚩 | 72.8 | 84 |
| 9 | Biomedical Engineer | 72.4 | 51 |
| 10 | Dentist | 71.7 | 75 |
| 11 | Human Resources Manager | 68.9 | 75 |
| 12 | Electrical Engineer | 64.9 | 34 |
| 13 | Journalist | 64.5 | 46 |
| 14 | Accountant | 64.2 | 42 |
| 15 | UX/UI Designer | 64.0 | 51 |
| 16 | Interior Designer | 63.9 | 51 |
| 17 | Sales Manager | 62.7 | 25 |
| 18 | Doctor (General Practitioner) | 62.6 | 93 |
| 19 | Mechanical Engineer | 62.5 | 42 |
| 20 | Software Engineer | 62.5 | 34 |
| 21 | Graphic Designer | 62.3 | 25 |
| 22 | Financial Analyst | 61.7 | 34 |
| 23 | Renewable Energy Engineer | 61.4 | 25 |
| 24 | Civil Engineer | 60.8 | 25 |
| 25 | Chef | 60.7 | 42 |
| 26 | Web Developer | 59.7 | 25 |
| 27 | Fashion Designer | 57.4 | 25 |
| 28 | Architect | 56.9 | 18 |
| 29 | Product Manager | 55.6 | 9 |
| 30 | Environmental Scientist | 55.4 | 25 |
| 31 | Pharmacist | 54.5 | 51 |
| 32 | Video Game Designer | 54.2 | 0 |
| 33 | Lawyer | 52.3 | 25 |
| 34 | Content Creator | 46.2 | 25 |
| 35 | Photographer | 43.1 | 42 |
| 36 | Data Scientist | 43.0 | 0 |
| 37 | Digital Marketing Specialist | 41.2 | 9 |

## 8. Other flags (not fixed here)

- **Data Scientist → `15-2051.01`.** The crosswalk comment says "Data Scientists", but
  in O*NET 30.0 `15-2051.01` is **Business Intelligence Analysts**; Data Scientists is
  `15-2051.00`, which has *no* work-values data. So this is an undocumented
  substitution that happens to be defensible (BI Analysts is the nearest rated
  occupation to Data Scientists) — but it is not what the comment claims. Left as-is;
  worth folding into §3a explicitly on the next pass.
- All 37 careers currently have `onet_code` NULL and `values_profile` NULL in the
  database, so the premium CVQ component (25% of the premium score) returns `null`
  for every career today. This dataset is what fills that in — a separate, later step.
- `security` is the only non-1:1 mapping rule (mean of Support and Working
  Conditions). It is a judgement call and remains the one mapping decision that has
  never been independently reviewed.

## 9. All 37 profiles (applied = rescaled; raw shown for traceability)

⚠️sub = O*NET code substituted per §3a · 🔧fix = crosswalk corrected per §3b · 🚩 = known limitation §6

| Career | O*NET code | O*NET occupation | ach | ben | self-dir | sec | pow | raw a/b/s/se/p |
|---|---|---|---|---|---|---|---|---|
| Accountant | `13-2011.00` | Accountants and Auditors | 33 | 42 | 44 | 61 | 36 | 67/61/67/60/61 |
| Architect | `17-1011.00` | Architects, Except Landscape and Naval | 67 | 18 | 76 | 73 | 75 | 78/45/83/65/78 |
| Biomedical Engineer | `17-2031.00` | Bioengineers and Biomedical Engineers | 48 | 51 | 76 | 83 | 50 | 72/67/83/69/67 |
| Chef | `35-1011.00` | Chefs and Head Cooks | 33 | 42 | 76 | 39 | 61 | 67/61/83/51/72 |
| Civil Engineer | `17-2051.00` | Civil Engineers | 48 | 25 | 76 | 80 | 61 | 72/50/83/68/72 |
| Content Creator | `27-3043.00` | Writers and Authors | 33 | 25 | 0 | 46 | 0 | 67/50/45/54/45 |
| Data Scientist | `15-2051.01` | Business Intelligence Analysts | 67 | 0 | 0 | 56 | 11 | 78/33/45/58/50 |
| Dentist | `29-1021.00` | Dentists, General | 82 | 75 | 100 | 61 | 75 | 83/83/95/60/78 |
| Digital Marketing Specialist | `13-1161.00` | Market Research Analysts and Marketing Specialists | 15 | 9 | 10 | 51 | 0 | 61/39/50/56/45 |
| Doctor (General Practitioner) | `29-1215.00` | Family Medicine Physicians | 100 | 93 | 88 | 98 | 100 | 89/95/89/75/89 |
| Electrical Engineer | `17-2071.00` | Electrical Engineers | 67 | 34 | 54 | 73 | 61 | 78/56/72/65/72 |
| Entrepreneur 🚩 | `11-1021.00` | General and Operations Managers | 48 | 84 | 76 | 90 | 75 | 72/89/83/72/78 |
| Environmental Scientist | `19-2041.00` | Environmental Scientists and Specialists, Including Health | 33 | 25 | 44 | 44 | 50 | 67/50/67/53/67 |
| Fashion Designer | `27-1022.00` | Fashion Designers | 67 | 25 | 54 | 22 | 36 | 78/50/72/44/61 |
| Financial Analyst ⚠️sub | `13-2099.01` | Financial Quantitative Analysts | 33 | 34 | 54 | 63 | 50 | 67/56/72/61/67 |
| Graphic Designer | `27-1024.00` | Graphic Designers | 67 | 25 | 54 | 46 | 36 | 78/50/72/54/61 |
| Healthcare Professional (Nurse) | `29-1141.00` | Registered Nurses | 48 | 84 | 54 | 95 | 36 | 72/89/72/74/61 |
| Human Resources Manager | `11-3121.00` | Human Resources Managers | 48 | 75 | 44 | 71 | 75 | 72/83/67/64/78 |
| Interior Designer | `27-1025.00` | Interior Designers | 67 | 51 | 66 | 12 | 25 | 78/67/78/40/56 |
| Journalist | `27-3023.00` | News Analysts, Reporters, and Journalists | 67 | 46 | 50 | 46 | 68 | 78/64/70/54/75 |
| Lawyer | `23-1011.00` | Lawyers | 82 | 25 | 76 | 83 | 100 | 83/50/83/69/89 |
| Management Consultant | `13-1111.00` | Management Analysts | 48 | 75 | 54 | 54 | 50 | 72/83/72/57/67 |
| Marketing Manager | `11-2021.00` | Marketing Managers | 82 | 67 | 66 | 100 | 61 | 83/78/78/76/72 |
| Mechanical Engineer | `17-2141.00` | Mechanical Engineers | 48 | 42 | 54 | 73 | 75 | 72/61/72/65/78 |
| Pharmacist | `29-1051.00` | Pharmacists | 15 | 51 | 32 | 78 | 75 | 61/67/61/67/78 |
| Photographer | `27-4021.00` | Photographers | 0 | 42 | 44 | 0 | 0 | 56/61/67/35/45 |
| Physical Therapist | `29-1123.00` | Physical Therapists | 67 | 93 | 54 | 78 | 75 | 78/95/72/67/78 |
| Product Manager ⚠️sub | `15-1299.09` | Information Technology Project Managers | 82 | 9 | 66 | 46 | 50 | 83/39/78/54/67 |
| Psychologist | `19-3033.00` | Clinical and Counseling Psychologists | 76 | 96 | 76 | 56 | 61 | 81/97/83/58/72 |
| Renewable Energy Engineer | `17-2199.03` | Energy Engineers, Except Wind and Solar | 48 | 25 | 54 | 80 | 50 | 72/50/72/68/67 |
| Sales Manager | `11-2022.00` | Sales Managers | 48 | 25 | 66 | 95 | 36 | 72/50/78/74/61 |
| Social Worker | `21-1022.00` | Healthcare Social Workers | 67 | 93 | 66 | 78 | 25 | 78/95/78/67/56 |
| Software Engineer ⚠️sub | `15-1299.08` | Computer Systems Engineers/Architects | 67 | 34 | 66 | 68 | 75 | 78/56/78/63/78 |
| Teacher (Secondary Education) | `25-2031.00` | Secondary School Teachers, Except Special and Career/Technical Education | 67 | 100 | 44 | 78 | 11 | 78/100/67/67/50 |
| UX/UI Designer 🔧fix | `27-1021.00` | Commercial and Industrial Designers | 33 | 51 | 32 | 56 | 36 | 67/67/61/58/61 |
| Video Game Designer 🔧fix | `15-1255.01` | Video Game Designers | 82 | 0 | 76 | 54 | 25 | 83/33/83/57/56 |
| Web Developer | `15-1254.00` | Web Developers | 33 | 25 | 66 | 71 | 50 | 67/50/78/64/67 |
