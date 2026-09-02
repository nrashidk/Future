# CVQ career values profiles — PROPOSED (O*NET 30.0 Work Values, RESCALED)

> **STATUS: DATA PREP ONLY — NOT APPLIED.** Nothing here has been written to the
> database, `server/seed.ts`, or `server/services/matching.ts`.
>
> Regenerate with:
> `npx tsx scripts/generate-cvq-values-profiles.ts "<path>/Work Values.txt"`

Generated 2026-09-02. 68 careers. Normalization: **RESCALED** (confirmed decision).

## 1. Provenance

| | |
|---|---|
| Source | O*NET 30.0 database (text), file `Work Values.txt` |
| URL | `https://www.onetcenter.org/dl_files/database/db_30_0_text.zip` |
| sha256 (zip) | `b7388aadeb3edef2a59fd292ac4e9b72d3e9266c65a136b7b8cc42b23003ce5a` |
| Rows used | `Scale ID = EX` (extent rating). `VH` (high-point) rows ignored. |
| Occupations rated | **874** of the 1 016 in O*NET 30.0 |
| Careers in crosswalk | **68** — matches the 68 live rows in `careers` |
| Duplicate O*NET codes | **none** |

The Work Values descriptor is **frozen, not withdrawn** — analyst ratings from 2008,
still shipped in the bulk database. It is unavailable over Web Services v2.0
(`…/details/work_values` → HTTP 404), which is why this uses the flat file.

## 2. Normalization: RESCALED (confirmed)

```
raw      = (onet_value - 1) / (7 - 1) * 100          # O*NET EX floor is 1, not 0
applied  = (raw - domain_min) / (domain_max - domain_min) * 100   # over these 68 careers
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
| `achievement` | 50 | 89 |
| `benevolence` | 22 | 100 |
| `self_direction` | 45 | 95 |
| `security` | 35 | 85 |
| `power` | 39 | 89 |

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
| `achievement` | 50–89 | 39 | 7.4 | **0–100** | **100** | **19.1** | 9/68 |
| `benevolence` | 22–100 | 78 | 20.8 | **0–100** | **100** | **26.6** | 17/68 |
| `self_direction` | 45–95 | 50 | 9.6 | **0–100** | **100** | **19.2** | 11/68 |
| `security` | 35–85 | 50 | 9.4 | **0–100** | **100** | **18.7** | 27/68 |
| `power` | 39–89 | 50 | 11.1 | **0–100** | **100** | **22.2** | 11/68 |

Rescaling does not *invent* discrimination — the ordering is untouched, it is a
monotone per-domain transform. What it does is stop each domain from wasting most
of the 0–100 space: raw spans of 39/78/50/50/50 become the full 0–100,
so the Euclidean distance that `calculateCvqScore` computes actually uses its range.
The `distinct values` column is the direct discrimination check: a domain that
collapsed careers onto one another would show few distinct values.

**Honest caveat on that column.** Discrimination is not uniform across domains.
`achievement` is the weakest, with only
9 distinct levels across 68 careers, because its raw O*NET span is the
narrowest (50–89) — analysts simply did not spread occupations far apart on it.
Rescaling stretches that span but cannot create levels that were never rated, so
ties remain ties. `security` is the strongest at 27/68.
The five domains are still carrying five distinguishable signals — see the
correlation table below — but a report should not lean on `achievement` alone to
separate two careers.

### Inter-domain correlation (applied profiles)

Five domains must carry five signals. Highest \|r\| first:

| pair | r |
|---|---|
| `self_direction` ↔ `power` | 0.565 |
| `achievement` ↔ `self_direction` | 0.486 |
| `achievement` ↔ `power` | 0.478 |
| `security` ↔ `power` | 0.350 |
| `self_direction` ↔ `security` | 0.184 |
| `benevolence` ↔ `self_direction` | 0.173 |
| `achievement` ↔ `security` | 0.150 |
| `benevolence` ↔ `security` | 0.091 |
| `achievement` ↔ `benevolence` | -0.057 |
| `benevolence` ↔ `power` | -0.012 |

## 5. Validity — three benevolence-heavy "helper" students

Student CVQ scores are `((mean Likert - 1) / 4) * 100` over 3 items
(`cvq.routes.ts:96-104`), so only 0/25/50/75/100 are reachable. Every probe is a
real reachable response pattern. Ranks are over all 68 careers using a replica of
`calculateCvqScore` (Euclidean distance over the 5 shared domains).

Helpers = Nurse / Social Worker / Psychologist. Foils = Photographer / Accountant.
**PASS** = every helper ranks above every foil.

| Helper student | Helper ranks | Foil ranks | RESCALED (applied) | raw (rejected) |
|---|---|---|---|---|
| PRIMARY — benevolence 5/5/5, achievement 4, self-direction 4, security 4, power 2 | #4 / #1 / #5 | #62 / #22 | **PASS** | PASS |
| flat-neutral — benevolence 5, everything else 3 | #5 / #7 / #12 | #56 / #17 | **PASS** | FAIL |
| modest-achievement — benevolence 5, achievement 3, self-direction 4, security 4, power 2 | #2 / #1 / #11 | #57 / #18 | **PASS** | FAIL |

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
Accountant's benevolence drops to 50 against Psychologist's 96, the intended
signal dominates, and the helper ordering holds.

## 6. 🚩 KNOWN LIMITATION — Entrepreneur (mapping KEPT, flagged not fixed)

**Entrepreneur → `11-1021.00` General and Operations Managers** — an acknowledged proxy
(`scripts/onet-crosswalk-corrected.md`), and the profile it produces is wrong in a way
that matters for the students this product serves.

| | achievement | benevolence | self_direction | security | power |
|---|---|---|---|---|---|
| raw | 72 | **89** | 83 | 72 | 78 |
| applied (rescaled) | 56 | **86** | 76 | 74 | 78 |

General and Operations Managers carry an O*NET Relationships rating of **6.33**, because
operations managers really do supervise, coach and develop staff. Entrepreneurs, as
students understand the word, do not necessarily. The consequence is visible in §7:
**Entrepreneur ranks #11 of 68** for the PRIMARY helper student — a benevolence-heavy
15-year-old is told entrepreneurship fits their caring values.

**The arithmetic is right; the proxy is wrong.** Decision for now: **KEEP the mapping,
flag it here.** Deliberately *not* hand-authored — inventing a profile would put an
unsourced number in a dataset whose whole claim is that every number traces to O*NET.
Re-crosswalking Entrepreneur is a separate decision.

## 7. Full ranking under the PRIMARY helper student (applied profiles)

| # | Career | CVQ match | benevolence |
|---|---|---|---|
| 1 | Social Worker | 91.9 | 94 |
| 2 | Primary School Teacher | 87.0 | 86 |
| 3 | Teacher (Secondary Education) | 85.2 | 100 |
| 4 | Healthcare Professional (Nurse) | 83.5 | 86 |
| 5 | Psychologist | 77.4 | 96 |
| 6 | Marketing Manager | 76.8 | 72 |
| 7 | Hospitality Manager | 76.0 | 100 |
| 8 | Curriculum & Instructional Designer | 75.2 | 78 |
| 9 | Biomedical Engineer | 75.0 | 58 |
| 10 | Management Consultant | 74.7 | 78 |
| 11 | Entrepreneur 🚩 | 74.0 | 86 |
| 12 | Physical Therapist | 73.9 | 94 |
| 13 | Dietitian & Nutritionist | 73.3 | 78 |
| 14 | School Counsellor & Career Advisor | 72.9 | 100 |
| 15 | Tourism & Events Manager | 70.3 | 86 |
| 16 | Dentist | 69.5 | 78 |
| 17 | Human Resources Manager | 68.7 | 78 |
| 18 | Sales Manager | 68.7 | 36 |
| 19 | Investment & Financial Manager | 68.5 | 58 |
| 20 | Health Informatics Specialist | 67.9 | 50 |
| 21 | Airline Pilot | 67.2 | 58 |
| 22 | Accountant | 67.1 | 50 |
| 23 | Atmospheric & Space Scientist | 66.9 | 58 |
| 24 | Electrical Engineer | 66.9 | 44 |
| 25 | UX/UI Designer | 66.0 | 58 |
| 26 | Cybersecurity Analyst | 65.7 | 44 |
| 27 | Renewable Energy Engineer | 65.5 | 36 |
| 28 | Financial Analyst | 65.3 | 44 |
| 29 | Interior Designer | 64.9 | 58 |
| 30 | Civil Engineer | 64.7 | 36 |
| 31 | Aerospace Engineer | 64.7 | 44 |
| 32 | Graphic Designer | 64.6 | 36 |
| 33 | Journalist | 64.4 | 54 |
| 34 | Mechanical Engineer | 64.4 | 50 |
| 35 | Web Developer | 64.3 | 36 |
| 36 | Software Engineer | 64.2 | 44 |
| 37 | Doctor (General Practitioner) | 64.0 | 94 |
| 38 | Satellite & Remote Sensing Scientist | 63.2 | 36 |
| 39 | Chef | 62.6 | 50 |
| 40 | Environmental Engineer | 62.5 | 44 |
| 41 | AI Research Scientist | 62.1 | 29 |
| 42 | Agricultural Engineer | 61.5 | 22 |
| 43 | Agricultural Scientist (Agronomist) | 61.3 | 36 |
| 44 | Robotics Engineer | 61.3 | 22 |
| 45 | Food Technologist | 60.9 | 44 |
| 46 | Film & TV Producer | 60.5 | 62 |
| 47 | Architect | 59.8 | 29 |
| 48 | Fashion Designer | 59.6 | 36 |
| 49 | Chemical Engineer | 59.4 | 36 |
| 50 | Industrial Engineer | 59.2 | 29 |
| 51 | Environmental Scientist | 58.8 | 36 |
| 52 | Video Game Designer | 58.7 | 14 |
| 53 | Product Manager | 58.5 | 22 |
| 54 | Pharmacist | 58.2 | 58 |
| 55 | Cloud & Network Architect | 56.7 | 8 |
| 56 | Actuary | 55.9 | 29 |
| 57 | Lawyer | 55.6 | 36 |
| 58 | Data Engineer | 55.4 | 8 |
| 59 | Geneticist | 54.9 | 29 |
| 60 | Risk & Compliance Officer | 53.2 | 58 |
| 61 | Content Creator | 50.6 | 36 |
| 62 | Photographer | 49.3 | 50 |
| 63 | Digital Marketing Specialist | 47.5 | 22 |
| 64 | Nuclear Engineer | 47.5 | 0 |
| 65 | Data Scientist | 47.3 | 14 |
| 66 | Video Editor | 46.5 | 8 |
| 67 | Physicist | 46.3 | 8 |
| 68 | Space Scientist (Astrophysicist) | 44.9 | 0 |

## 8. Other flags (not fixed here)

- **Data Scientist → `15-2051.01`.** The crosswalk comment says "Data Scientists", but
  in O*NET 30.0 `15-2051.01` is **Business Intelligence Analysts**; Data Scientists is
  `15-2051.00`, which has *no* work-values data. So this is an undocumented
  substitution that happens to be defensible (BI Analysts is the nearest rated
  occupation to Data Scientists) — but it is not what the comment claims. Left as-is;
  worth folding into §3a explicitly on the next pass.
- All 68 careers currently have `onet_code` NULL and `values_profile` NULL in the
  database, so the premium CVQ component (25% of the premium score) returns `null`
  for every career today. This dataset is what fills that in — a separate, later step.
- `security` is the only non-1:1 mapping rule (mean of Support and Working
  Conditions). It is a judgement call and remains the one mapping decision that has
  never been independently reviewed.

## 9. All 68 profiles (applied = rescaled; raw shown for traceability)

⚠️sub = O*NET code substituted per §3a · 🔧fix = crosswalk corrected per §3b · 🚩 = known limitation §6

| Career | O*NET code | O*NET occupation | ach | ben | self-dir | sec | pow | raw a/b/s/se/p |
|---|---|---|---|---|---|---|---|---|
| Accountant | `13-2011.00` | Accountants and Auditors | 44 | 50 | 44 | 50 | 44 | 67/61/67/60/61 |
| Actuary | `15-2011.00` | Actuaries | 28 | 29 | 32 | 52 | 34 | 61/45/61/61/56 |
| Aerospace Engineer | `17-2011.00` | Aerospace Engineers | 44 | 44 | 54 | 72 | 66 | 67/56/72/71/72 |
| Agricultural Engineer | `17-2021.00` | Agricultural Engineers | 56 | 22 | 66 | 52 | 44 | 72/39/78/61/61 |
| Agricultural Scientist (Agronomist) | `19-1013.00` | Soil and Plant Scientists | 85 | 36 | 66 | 36 | 66 | 83/50/78/53/72 |
| AI Research Scientist | `15-1221.00` | Computer and Information Research Scientists | 72 | 29 | 54 | 70 | 66 | 78/45/72/70/72 |
| Airline Pilot | `53-2011.00` | Airline Pilots, Copilots, and Flight Engineers | 72 | 58 | 88 | 100 | 78 | 78/67/89/85/78 |
| Architect | `17-1011.00` | Architects, Except Landscape and Naval | 72 | 29 | 76 | 60 | 78 | 78/45/83/65/78 |
| Atmospheric & Space Scientist | `19-2021.00` | Atmospheric and Space Scientists | 56 | 58 | 44 | 30 | 44 | 72/67/67/50/61 |
| Biomedical Engineer | `17-2031.00` | Bioengineers and Biomedical Engineers | 56 | 58 | 76 | 68 | 56 | 72/67/83/69/67 |
| Chef | `35-1011.00` | Chefs and Head Cooks | 44 | 50 | 76 | 32 | 66 | 67/61/83/51/72 |
| Chemical Engineer | `17-2041.00` | Chemical Engineers | 56 | 36 | 54 | 52 | 78 | 72/50/72/61/78 |
| Civil Engineer | `17-2051.00` | Civil Engineers | 56 | 36 | 76 | 66 | 66 | 72/50/83/68/72 |
| Cloud & Network Architect | `15-1241.00` | Computer Network Architects | 85 | 8 | 54 | 58 | 34 | 83/28/72/64/56 |
| Content Creator | `27-3043.00` | Writers and Authors | 44 | 36 | 0 | 38 | 12 | 67/50/45/54/45 |
| Curriculum & Instructional Designer | `25-9031.00` | Instructional Coordinators | 72 | 78 | 76 | 28 | 44 | 78/83/83/49/61 |
| Cybersecurity Analyst | `15-1212.00` | Information Security Analysts | 28 | 44 | 54 | 80 | 34 | 61/56/72/75/56 |
| Data Engineer | `15-1243.00` | Database Architects | 85 | 8 | 54 | 46 | 34 | 83/28/72/58/56 |
| Data Scientist | `15-2051.01` | Business Intelligence Analysts | 72 | 14 | 0 | 46 | 22 | 78/33/45/58/50 |
| Dentist | `29-1021.00` | Dentists, General | 85 | 78 | 100 | 50 | 78 | 83/83/95/60/78 |
| Dietitian & Nutritionist | `29-1031.00` | Dietitians and Nutritionists | 44 | 78 | 66 | 42 | 56 | 67/83/78/56/67 |
| Digital Marketing Specialist | `13-1161.00` | Market Research Analysts and Marketing Specialists | 28 | 22 | 10 | 42 | 12 | 61/39/50/56/45 |
| Doctor (General Practitioner) | `29-1215.00` | Family Medicine Physicians | 100 | 94 | 88 | 80 | 100 | 89/95/89/75/89 |
| Electrical Engineer | `17-2071.00` | Electrical Engineers | 72 | 44 | 54 | 60 | 66 | 78/56/72/65/72 |
| Entrepreneur 🚩 | `11-1021.00` | General and Operations Managers | 56 | 86 | 76 | 74 | 78 | 72/89/83/72/78 |
| Environmental Engineer | `17-2081.00` | Environmental Engineers | 72 | 44 | 44 | 64 | 78 | 78/56/67/67/78 |
| Environmental Scientist | `19-2041.00` | Environmental Scientists and Specialists, Including Health | 44 | 36 | 44 | 36 | 56 | 67/50/67/53/67 |
| Fashion Designer | `27-1022.00` | Fashion Designers | 72 | 36 | 54 | 18 | 44 | 78/50/72/44/61 |
| Film & TV Producer | `27-2012.00` | Producers and Directors | 79 | 62 | 88 | 28 | 88 | 81/70/89/49/83 |
| Financial Analyst ⚠️sub | `13-2099.01` | Financial Quantitative Analysts | 44 | 44 | 54 | 52 | 56 | 67/56/72/61/67 |
| Food Technologist | `19-1012.00` | Food Scientists and Technologists | 44 | 44 | 22 | 56 | 44 | 67/56/56/63/61 |
| Geneticist | `19-1029.03` | Geneticists | 72 | 29 | 66 | 42 | 88 | 78/45/78/56/83 |
| Graphic Designer | `27-1024.00` | Graphic Designers | 72 | 36 | 54 | 38 | 44 | 78/50/72/54/61 |
| Health Informatics Specialist | `15-1211.01` | Health Informatics Specialists | 44 | 50 | 44 | 56 | 44 | 67/61/67/63/61 |
| Healthcare Professional (Nurse) | `29-1141.00` | Registered Nurses | 56 | 86 | 54 | 78 | 44 | 72/89/72/74/61 |
| Hospitality Manager | `11-9081.00` | Lodging Managers | 44 | 100 | 76 | 32 | 34 | 67/100/83/51/56 |
| Human Resources Manager | `11-3121.00` | Human Resources Managers | 56 | 78 | 44 | 58 | 78 | 72/83/67/64/78 |
| Industrial Engineer | `17-2112.00` | Industrial Engineers | 56 | 29 | 66 | 68 | 78 | 72/45/78/69/78 |
| Interior Designer | `27-1025.00` | Interior Designers | 72 | 58 | 66 | 10 | 34 | 78/67/78/40/56 |
| Investment & Financial Manager | `11-3031.00` | Financial Managers | 56 | 58 | 76 | 80 | 78 | 72/67/83/75/78 |
| Journalist | `27-3023.00` | News Analysts, Reporters, and Journalists | 72 | 54 | 50 | 38 | 72 | 78/64/70/54/75 |
| Lawyer | `23-1011.00` | Lawyers | 85 | 36 | 76 | 68 | 100 | 83/50/83/69/89 |
| Management Consultant | `13-1111.00` | Management Analysts | 56 | 78 | 54 | 44 | 56 | 72/83/72/57/67 |
| Marketing Manager | `11-2021.00` | Marketing Managers | 85 | 72 | 66 | 82 | 66 | 83/78/78/76/72 |
| Mechanical Engineer | `17-2141.00` | Mechanical Engineers | 56 | 50 | 54 | 60 | 78 | 72/61/72/65/78 |
| Nuclear Engineer | `17-2161.00` | Nuclear Engineers | 72 | 0 | 44 | 72 | 78 | 78/22/67/71/78 |
| Pharmacist | `29-1051.00` | Pharmacists | 28 | 58 | 32 | 64 | 78 | 61/67/61/67/78 |
| Photographer | `27-4021.00` | Photographers | 15 | 50 | 44 | 0 | 12 | 56/61/67/35/45 |
| Physical Therapist | `29-1123.00` | Physical Therapists | 72 | 94 | 54 | 64 | 78 | 78/95/72/67/78 |
| Physicist | `19-2012.00` | Physicists | 85 | 8 | 76 | 60 | 100 | 83/28/83/65/89 |
| Primary School Teacher | `25-2021.00` | Elementary School Teachers, Except Special Education | 72 | 86 | 54 | 64 | 34 | 78/89/72/67/56 |
| Product Manager ⚠️sub | `15-1299.09` | Information Technology Project Managers | 85 | 22 | 66 | 38 | 56 | 83/39/78/54/67 |
| Psychologist | `19-3033.00` | Clinical and Counseling Psychologists | 79 | 96 | 76 | 46 | 66 | 81/97/83/58/72 |
| Renewable Energy Engineer | `17-2199.03` | Energy Engineers, Except Wind and Solar | 56 | 36 | 54 | 66 | 56 | 72/50/72/68/67 |
| Risk & Compliance Officer | `13-1041.00` | Compliance Officers | 0 | 58 | 32 | 42 | 0 | 50/67/61/56/39 |
| Robotics Engineer | `17-2199.08` | Robotics Engineers | 56 | 22 | 66 | 74 | 56 | 72/39/78/72/67 |
| Sales Manager | `11-2022.00` | Sales Managers | 56 | 36 | 66 | 78 | 44 | 72/50/78/74/61 |
| Satellite & Remote Sensing Scientist | `19-2099.01` | Remote Sensing Scientists and Technologists | 72 | 36 | 54 | 52 | 66 | 78/50/72/61/72 |
| School Counsellor & Career Advisor | `21-1012.00` | Educational, Guidance, and Career Counselors and Advisors | 56 | 100 | 32 | 42 | 44 | 72/100/61/56/61 |
| Social Worker | `21-1022.00` | Healthcare Social Workers | 72 | 94 | 66 | 64 | 34 | 78/95/78/67/56 |
| Software Engineer ⚠️sub | `15-1299.08` | Computer Systems Engineers/Architects | 72 | 44 | 66 | 56 | 78 | 78/56/78/63/78 |
| Space Scientist (Astrophysicist) | `19-2011.00` | Astronomers | 85 | 0 | 66 | 28 | 78 | 83/22/78/49/78 |
| Teacher (Secondary Education) | `25-2031.00` | Secondary School Teachers, Except Special and Career/Technical Education | 72 | 100 | 44 | 64 | 22 | 78/100/67/67/50 |
| Tourism & Events Manager | `13-1121.00` | Meeting, Convention, and Event Planners | 44 | 86 | 54 | 32 | 56 | 67/89/72/51/67 |
| UX/UI Designer 🔧fix | `27-1021.00` | Commercial and Industrial Designers | 44 | 58 | 32 | 46 | 44 | 67/67/61/58/61 |
| Video Editor | `27-4032.00` | Film and Video Editors | 44 | 8 | 54 | 16 | 56 | 67/28/72/43/67 |
| Video Game Designer 🔧fix | `15-1255.01` | Video Game Designers | 85 | 14 | 76 | 44 | 34 | 83/33/83/57/56 |
| Web Developer | `15-1254.00` | Web Developers | 44 | 36 | 66 | 58 | 56 | 67/50/78/64/67 |
