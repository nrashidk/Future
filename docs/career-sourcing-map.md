# `docs/career-sourcing-map.md`

**Read-only research + recon: deriving the career catalog from UAE priority sectors, grounded in O\*NET, validated against UAE labour-market demand.**

No file outside this one was written. No DB connection was opened (SELECT or otherwise) — every "live catalog" fact below is read from `server/seed.ts`, `scripts/`, and the prior recon docs in `docs/`. No migration, no seed constant, no commit, no `cc-out.md`. Public read-only downloads from `onetcenter.org` and public web search for UAE demand signals.

Base commit `fe5645e`. Working tree carries the uncommitted Phase-3-step-1 space-careers diff (8 files), so the catalog referenced below is **39 careers**, not 37.

---

## 0. Headline — five things that decide this work

**1. The 874-occupation Work Values gate is real, and I verified it against the actual file rather than trusting the docs.** I downloaded `db_30_0_text.zip` (the last release that ships `Work Values.txt` — **31.0 does not contain it at all**, confirmed by listing the archive) and extracted the EX-scale occupation list: **exactly 874 codes**. All 39 existing careers pass. Every occupation recommended in this report passes. The gate is a static set-membership test, which matters enormously for §7.

**2. The gate systematically excludes the occupations a future-focused product most wants.** Work Values was analyst-rated in **2008** and frozen. Every occupation added in the 2018-SOC revision or as a "new & emerging" code fails it. Concretely, all of these are real, in current O\*NET, and **have no Work Values data**:

| occupation | code | why we wanted it |
|---|---|---|
| Software Developers | 15-1252.00 | already substituted (→ 15-1299.08) |
| Data Scientists | 15-2051.00 | already substituted (→ 15-2051.01) |
| Financial and Investment Analysts | 13-2051.00 | already substituted (→ 13-2099.01) |
| Project Management Specialists | 13-1082.00 | already substituted (→ 15-1299.09) |
| **Information Security Engineers** | 15-1299.05 | the #1 UAE tech demand gap |
| **Penetration Testers** | 15-1299.04 | ditto |
| **Blockchain Engineers** | 15-1299.07 | Digital Dirham / VARA |
| **Digital Forensics Analysts** | 15-1299.06 | UAE Cybersecurity Council |
| **Financial Risk Specialists** | 13-2054.00 | DIFC/ADGM risk roles |
| Public Relations Managers | 11-2032.00 | creative-economy comms |
| Web and Digital Interface Designers | 15-1255.00 | the "real" UX/UI code |
| Emergency Medicine Physicians · Paramedics · Orthopedic & Pediatric Surgeons | 29-1214.00 · 29-2043.00 · 29-1242.00 · 29-1243.00 | specialist clinical |

This is not a data-quality complaint, it is a design constraint: **the frozen descriptor pushes the catalog one abstraction level up**, toward the older, broader parent occupations. Cybersecurity has to enter as *Information Security Analysts* (15-1212.00, rated), not as *Penetration Testers*. That is fine, and it is the right call — but it must be a stated rule, not an accident discovered per career.

**3. A second, quieter gate disagrees with the first, and it bites exactly on sustainability.** The alternate pipeline (`scripts/compute_profiles.py`) gates on **Work Styles**, per `docs/new-careers-spec.md` §0. I checked both files. A cluster of occupations has **Work Values but no Work Styles** — O\*NET's Green / New & Emerging codes, which carry the 2008 ratings but were dropped from Work Styles updating:

`17-2199.11` Solar Energy Systems Engineers · `17-2199.10` Wind Energy Engineers · `11-1011.03` Chief Sustainability Officers · `13-1199.05` Sustainability Specialists · `17-2051.02` Water/Wastewater Engineers · `11-9121.02` Water Resource Specialists · `11-9199.02` Compliance Managers · `13-1041.01` Environmental Compliance Inspectors · `47-4011.01` Energy Auditors

**Every one of those is a Renewable Energy & Sustainability occupation.** Whichever pipeline the catalog ends up on determines whether the sustainability sector can name its own flagship roles. I have avoided all nine in the recommendations below and routed around them (Nuclear Engineer, Chemical Engineer, Environmental Engineer — all rated on *both*). That is a deliberate choice worth reviewing.

**4. One existing career is already an unlabelled substitute and the label has drifted.** `Data Scientist` is pinned to `15-2051.01`. In O\*NET **31.0 that code is titled "Business Intelligence Analysts"** — it was re-titled after the crosswalk was written, and the occupation the career means (*Data Scientists*, `15-2051.00`) has no Work Values data. So the substitution is correct in effect, but `scripts/parse-onet-values.ts:43` still comments it `// Data Scientists`, which is now wrong. See §6.

**5. The rescale makes this an all-or-nothing catalog change.** `scripts/generate-cvq-values-profiles.ts:152-166` is explicit: the stored `values_profile` is **min-max rescaled across the country's catalog**, so *"ADDING OR REMOVING A CAREER CHANGES EVERY OTHER CAREER'S STORED PROFILE. This dataset must be regenerated whole, never edited row-by-row."* Going 39 → ~68 careers is therefore **one regeneration of all 68 profiles**, not 29 inserts. Any plan that adds careers in tranches rewrites the whole table each tranche. This is the single biggest operational consequence of this document.

---

## 1. Method, and what each claim is worth

| step | what I did | confidence |
|---|---|---|
| O\*NET code exists, title | `db_31_0_text/Occupation Data.txt` (1,016 occupations), exact code lookup | **high** — authoritative file |
| Work Values present | `db_30_0_text/Work Values.txt`, EX scale, distinct codes → 874-code set | **high** — authoritative file |
| Work Styles present | `db_31_0_text/Work Styles.txt`, WI/DR scales, element count per code | **high** — authoritative file |
| Job Zone | `db_31_0_text/Job Zones.txt` | **high** |
| Existing catalog | `server/seed.ts:602-1176` (titles, categories, `onetCode`), `UAE_SECTOR_CATEGORY_RULES` / `UAE_SECTOR_CAREER_OVERRIDES` at `server/seed.ts:74-148` | **high** — source, not DB |
| **UAE demand** | official strategy documents (u.ae, uaecabinet.ae, dubaiculture.ae, moei.gov.ae, mediaoffice.abudhabi) + 2026 market reporting (Gulf News, Khaleej Times, Arabian Business, recruiter salary guides) | **medium** — see §8 |

**The UAE-demand column is the weakest part of this document and I want that on the record.** There is no public, machine-readable UAE occupational-demand dataset equivalent to BLS. MoHRE publishes skill-level classifications and Nafis publishes programme targets, but neither is an occupation-by-occupation demand series I could query. Every demand verdict below is one of three kinds of signal, and I have labelled which:

- **`STRATEGY`** — a UAE federal or emirate strategy document names the role, the function, or a headcount target for it. Strongest available signal.
- **`MARKET`** — 2026 recruitment/market reporting or job-board presence names the role as in-demand. Weaker; recruiter content is promotional.
- **`INFERRED`** — no direct naming; I am reasoning from a named programme to the occupation that must staff it. Weakest; flagged every time.

---

## 2. Baseline — what the 39 existing careers cover today

Derived from `UAE_SECTOR_CATEGORY_RULES` (headline = highest relevance × rankFactor) and the 7 override rows.

| sector (displayOrder) | careers it currently headlines | n |
|---|---|---|
| 1 Artificial Intelligence | Data Scientist *(override 90)* | **1** |
| 2 Space & Future Sciences | Aerospace Engineer *(override 100)*, Space Scientist *(override 95)* | **2** |
| 3 Healthcare & Life Sciences | Dentist, Doctor (GP), Nurse, Pharmacist, Physical Therapist, Psychologist *(Healthcare @85)*, Biomedical Engineer *(override 90)* | **7** |
| 4 Renewable Energy & Sustainability | Electrical Engineer, Mechanical Engineer *(Engineering @80)*, Renewable Energy Engineer *(override 100)*, Environmental Scientist *(override 85)* | **4** |
| 5 Financial Services & FinTech | Accountant, Financial Analyst *(Finance @95)* | **2** |
| 6 Education & Human Capital | Teacher (Secondary) *(Education @100)*, Social Worker *(Social Services @60)* | **2** |
| 7 Creative Industries & Media | Fashion/Graphic Designer, Photographer, Video Game Designer *(Creative Arts @90)*; Content Creator, Journalist *(Media & Comms @90)*; Architect, Interior Designer *(Design & Arch @70)* | **8** |
| 8 Technology | Product Manager, Software Engineer, UX/UI Designer, Web Developer *(Technology @95)*, Civil Engineer *(override 70)* | **5** |
| — Tourism & Hospitality | *sector does not exist* | **0** |
| — Food Security & Agriculture | *sector does not exist* | **0** |
| **catch-all / floor** | Entrepreneur, HR Manager, Management Consultant *(Technology @65)*; Digital Marketing Specialist, Marketing Manager, Sales Manager *(Technology @60)*; Lawyer *(Technology @45)*; **Chef (floor 40, no sector at all)** | **8** |

**The shape of the problem, in one line:** 8 of 39 careers (21%) are still attributed to Technology as a catch-all or floor at 40, and two of the ten intended sectors have zero careers.

---

## 3. Per-sector derivation

Legend for every table: **WV** = has O\*NET Work Values (the CVQ gate — Y/N) · **WS** = Work Styles element count (21 = complete; 0 = absent) · **JZ** = O\*NET Job Zone (1–5, education/preparation) · **status** = `EXISTING` / `NEW` / `WATCH` (real but not recommended now).

---

### 3.1 Artificial Intelligence — *displayOrder 1, currently 1 career*

The country's flagship sector has the thinnest catalog of any sector that exists. UAE grounding is the strongest available anywhere in this document: the **National Strategy for AI 2031** (Cabinet, 2019) names a "Next-Generation Talent" pillar and lists energy, logistics, tourism, healthcare and cybersecurity as AI deployment sectors; MBZUAI is a dedicated AI graduate university; DIFC reported **10,018 firms in H1 2026 with a 39% YoY rise driven by AI and FinTech**.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | Data Scientists → **Business Intelligence Analysts** | `15-2051.01` | Y | 21 | 4 | `STRATEGY` AI 2031 "Data & Infrastructure" pillar; `MARKET` top-3 in every 2026 UAE demand list | EXISTING *(label drift — §6)* |
| 2 | Computer Systems Engineers/Architects | `15-1299.08` | Y | 21 | 3 | `MARKET` software/full-stack consistently top-5 | EXISTING *(as Software Engineer)* |
| 3 | **Computer and Information Research Scientists** | `15-1221.00` | Y | 21 | 5 | `STRATEGY` MBZUAI, TII, G42 research; the only O\*NET code that *is* AI research | **NEW** |
| 4 | **Robotics Engineers** | `17-2199.08` | Y | 21 | 4 | `STRATEGY` Operation 300bn / Make it in the Emirates; `INFERRED` automation is named across AI 2031 | **NEW** *(re-homed — see §3.11)* |
| 5 | **Database Architects** | `15-1243.00` | Y | 21 | 4 | `STRATEGY` AI 2031 "Data & Infrastructure"; `MARKET` data engineering named in 2026 hiring reports | **NEW** |
| 6 | Operations Research Analysts | `15-2031.00` | Y | 21 | 5 | `INFERRED` DP World / Emirates network optimisation; no direct naming | WATCH |
| 7 | Statisticians | `15-2041.00` | Y | 21 | 5 | `INFERRED` FCSC; weak as a 13–18 aspiration | WATCH |

**Honest note.** O\*NET has **no "Machine Learning Engineer" and no "AI Engineer" occupation**. `15-1221.00` is the closest rated code and it is research-framed (Job Zone 5, doctoral). A 15-year-old who says "I want to build AI" maps to `15-1221.00` + `15-1299.08` + `15-2051.01` between them, not to one code. This is a taxonomy limit, not a sourcing failure, and it will recur in every country.

**Existing careers serving this sector: 2** (Data Scientist, Software Engineer). **Recommended new: 3.**

---

### 3.2 Space & Future Sciences — *displayOrder 2, currently 2 careers*

**National Space Strategy 2030** (Cabinet, 2019) explicitly targets "advanced local capacity in space science, research and developing and manufacturing space technology"; the **Space Mission and Satellite Engineering Programme** with EDGE trains *"satellite engineers, system architects, and mission leaders"* — role titles named in a national programme, which is as strong as `STRATEGY` grounding gets. MBRSC's actual output is Earth observation (KhalifaSat, MBZ-Sat), which the current two careers do not represent.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | Aerospace Engineers | `17-2011.00` | Y | 21 | 4 | `STRATEGY` SMSE names "satellite engineers" | EXISTING |
| 2 | Astronomers | `19-2011.00` | Y | 21 | 5 | `STRATEGY` Mars 2117; `INFERRED` small employment base | EXISTING |
| 3 | **Remote Sensing Scientists and Technologists** | `19-2099.01` | Y | 21 | 4 | `STRATEGY` MBRSC's core business *is* Earth observation; KhalifaSat/MBZ-Sat imagery | **NEW — strongest space add** |
| 4 | **Atmospheric and Space Scientists** | `19-2021.00` | Y | 21 | 4 | `STRATEGY` National Center of Meteorology; UAEREP rain-enhancement programme is a funded national research line | **NEW** |
| 5 | **Physicists** | `19-2012.00` | Y | 21 | 5 | `STRATEGY` TII Quantum Research Centre — the "Future Sciences" half of the sector name, currently unrepresented | **NEW** |
| 6 | Electronics Engineers, Except Computer | `17-2072.00` | Y | 21 | 4 | `INFERRED` satellite avionics/payload; also claimable by Technology | WATCH |
| 7 | Cartographers and Photogrammetrists | `17-1021.00` | Y | 21 | 4 | `INFERRED` overlaps `19-2099.01`; narrower | WATCH |

⚠️ **Collinearity warning, carried forward.** `docs/new-careers-spec.md` §0.3 measured that Aerospace Engineer and Space Scientist both saturate at alignment **1.000 against both Space & Future Sciences and Food Security & Agriculture**. Adding three more science/numeracy-led careers here will most likely **worsen** that, not fix it. Re-measure the sector-pair correlation after §3.10 lands, before committing this sector's vector.

**Existing: 2. Recommended new: 3.**

---

### 3.3 Healthcare & Life Sciences — *displayOrder 3, currently 7 careers*

**The best-covered sector in the catalog.** Six clinicians plus Biomedical Engineer. The gap is not clinical — it is the **"& Life Sciences"** half of the name, which no career currently serves. The **Emirati Genome Programme** (G42/M42) has processed **750,000+ samples and is the world's largest national genomic database**, larger than UK Biobank, and M42 is integrating genomic data into Malaffi as "genomic passports". A sector named for life sciences with no genomics career is a naming claim the catalog cannot back.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1–6 | Registered Nurses · Family Medicine Physicians · Dentists · Pharmacists · Physical Therapists · Clinical & Counseling Psychologists | `29-1141.00` `29-1215.00` `29-1021.00` `29-1051.00` `29-1123.00` `19-3033.00` | Y | 21 | 4–5 | `MARKET` healthcare named the most stable UAE hiring sector in 2026 and most open to expat professionals | EXISTING |
| 7 | Bioengineers and Biomedical Engineers | `17-2031.00` | Y | 21 | 4 | `MARKET` named in 2026 specialist-demand reporting | EXISTING |
| 8 | **Geneticists** | `19-1029.03` | Y | 21 | 5 | `STRATEGY` Emirati Genome Programme, 750k+ samples, G42/M42 Omics Centre of Excellence | **NEW — closes the "Life Sciences" gap** |
| 9 | **Health Informatics Specialists** | `15-1211.01` | Y | 21 | 5 | `STRATEGY` Malaffi + Riayati national EHR; M42 genomic-passport integration | **NEW** |
| 10 | Medical and Clinical Laboratory Technologists | `29-2011.00` | Y | 21 | 4 | `INFERRED` Biogenix Labs, diagnostics scale-up. **Job Zone 4 — the only realistic non-doctor clinical-science path in the catalog** | WATCH *(strong case)* |
| 11 | Medical and Health Services Managers | `11-9111.00` | Y | 21 | 4 | `MARKET` "healthcare administrators" named in 2026 demand reporting | WATCH |
| 12 | Occupational Therapists · Speech-Language Pathologists | `29-1122.00` `29-1127.00` | Y | 21 | 5 | `MARKET` UAE special-education and therapy-centre demand | WATCH |
| 13 | Medical Scientists, Except Epidemiologists | `19-1042.00` | Y | 21 | 5 | `INFERRED` overlaps `19-1029.03`; broader, less UAE-specific | WATCH |

**Existing: 7. Recommended new: 2.** This sector needs the least work.

---

### 3.4 Renewable Energy & Sustainability — *displayOrder 4, currently 4 careers*

Grounding is strong and quantified: **Energy Strategy 2050** commits AED 150–200bn by 2030 and *"50,000 new green jobs by 2030"*; **Net Zero 2050** projects *"200,000 job opportunities across the solar, battery and hydrogen sub-sectors"*; the **National Hydrogen Strategy** targets 1.4Mt/yr by 2031. But see Headline #3 — the Green/New-&-Emerging codes that name these jobs precisely all fail the Work Styles half of the gate.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | Energy Engineers, Except Wind and Solar | `17-2199.03` | Y | 21 | 4 | `STRATEGY` Energy Strategy 2050 | EXISTING |
| 2 | Environmental Scientists and Specialists | `19-2041.00` | Y | 21 | 4 | `STRATEGY` Net Zero 2050 | EXISTING |
| 3–4 | Electrical Engineers · Mechanical Engineers | `17-2071.00` `17-2141.00` | Y | 21 | 4 | `MARKET` engineering demand consistently high | EXISTING |
| 5 | **Nuclear Engineers** | `17-2161.00` | Y | 21 | 4 | `STRATEGY` **Barakah — 4 reactors, 5.6 GW, ~25% of UAE electricity; ENEC runs an explicit Emiratisation pipeline.** The single most UAE-specific occupation in this document, and it is absent | **NEW — top pick for this sector** |
| 6 | **Chemical Engineers** | `17-2041.00` | Y | 21 | 4 | `STRATEGY` National Hydrogen Strategy (electrolysis, storage); `MARKET` ADNOC/Borouge are among the largest technical employers in the country | **NEW** |
| 7 | **Environmental Engineers** | `17-2081.00` | Y | 21 | 4 | `STRATEGY` Net Zero 2050, water and waste; rated on **both** descriptors, unlike `17-2051.02` | **NEW** |
| 8 | Solar Energy Systems Engineers | `17-2199.11` | Y | **0** | 4 | `STRATEGY` Mohammed bin Rashid Al Maktoum Solar Park, Al Dhafra 2 GW — *strongest demand signal in the sector* | ⚠️ **BLOCKED — no Work Styles** |
| 9 | Sustainability Specialists | `13-1199.05` | Y | **0** | 4 | `MARKET` ESG/sustainability reporting is a fast-growing UAE role | ⚠️ **BLOCKED — no Work Styles** |
| 10 | Chief Sustainability Officers | `11-1011.03` | Y | **0** | 5 | `MARKET` real; C-suite, not a student aspiration anyway | ⚠️ BLOCKED |
| 11 | Hydrologists | `19-2043.00` | Y | 21 | 4 | `INFERRED` desalination and water security; UAE titles this "water resources engineer", which maps to the blocked `17-2051.02` | WATCH |
| 12 | Wind Energy Engineers | `17-2199.10` | Y | **0** | 4 | **weak UAE demand** — the UAE has negligible wind resource. Do not add | ✗ REJECT |

**The honest bind:** the two occupations with the *best* UAE demand signal in this sector (Solar Energy Systems Engineers, Sustainability Specialists) are the two that cannot carry a profile under the Work Styles pipeline. Routing around them via Nuclear/Chemical/Environmental Engineer is sound and gives strong UAE grounding, but it means **the sector's flagship solar role stays unnamed**. Worth a decision, not a silent workaround.

**Existing: 4. Recommended new: 3.**

---

### 3.5 Financial Services & FinTech — *displayOrder 5, currently 2 careers*

A first-order national pillar with **two** careers, both generic. DIFC: **10,018 firms, 50,200 employees, +39% YoY (H1 2026)**; ADGM: **44,000+ people, +50% in 2025**; DIFC passed 500 wealth/asset-management firms in 2025. 2026 recruiter reporting names **compliance** as the premium shortage role (*"DFSA or ADGM regulatory experience and AML/KYC specialism commanding premium"*), which is consistent with the UAE's post-FATF-grey-list regulatory build-out.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | Accountants and Auditors | `13-2011.00` | Y | 21 | 4 | `MARKET` steady | EXISTING |
| 2 | Financial Quantitative Analysts | `13-2099.01` | Y | 21 | 5 | `MARKET` DIFC/ADGM analyst roles | EXISTING *(substitute — §6)* |
| 3 | **Compliance Officers** | `13-1041.00` | Y | 21 | 4 | `MARKET` **named as the premium 2026 UAE finance shortage role**; `STRATEGY` DFSA/FSRA regulatory regimes | **NEW — top pick for this sector** |
| 4 | **Actuaries** | `15-2011.00` | Y | 21 | 4 | `INFERRED` UAE insurance + takaful; Central Bank prudential regime. Moderate demand, but a distinctive quantitative path with no catalog equivalent | **NEW** |
| 5 | **Financial Managers** | `11-3031.00` | Y | 21 | 4 | `MARKET` family offices, funds, treasury — named across 2026 hiring reports | **NEW** |
| 6 | Financial Risk Specialists | `13-2054.00` | **N** | 21 | 4 | `MARKET` strong — but **fails the Work Values gate** | ✗ blocked; nearest rated substitute is `13-2061.00` Financial Examiners |
| 7 | Blockchain Engineers | `15-1299.07` | **N** | 21 | 4 | `STRATEGY` Digital Dirham, VARA — genuinely UAE-distinctive | ✗ blocked; no clean substitute (`15-1299.08` is taken by Software Engineer) |
| 8 | Credit Analysts · Personal Financial Advisors · Insurance Underwriters | `13-2041.00` `13-2052.00` `13-2053.00` | Y | 21 | 4 | `MARKET` real but generic retail-banking roles | WATCH |
| 9 | Securities, Commodities, and Financial Services Sales Agents | `41-3031.00` | Y | 21 | 4 | `MARKET` DFM/ADX brokerage | WATCH |

**Recommended re-home:** move **Lawyer** (`23-1011.00`, currently Technology @45 "weak band") into this sector. DIFC Courts and ADGM operate English-common-law jurisdictions with their own judiciaries and a real regulatory/corporate legal market. That is a genuine sector claim, and it retires the catalog's weakest attribution without adding a career.

**Existing: 2 (+1 re-homed). Recommended new: 3.**

---

### 3.6 Education & Human Capital — *displayOrder 6, currently 2 careers*

2026 reporting is unusually direct: UAE schools are *"ramping up 2026-27 teacher hiring"* amid *"a shortage of international candidates"*, recruiting specifically in **STEM, AI, Computer Science and Early Years**, with *"competition… particularly in mathematics and science"*. The catalog has exactly one teacher.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | Secondary School Teachers | `25-2031.00` | Y | 21 | 4 | `MARKET` named shortage, STEM especially | EXISTING |
| 2 | Healthcare Social Workers | `21-1022.00` | Y | 21 | 5 | secondary claim only (Social Services @60) | EXISTING |
| 3 | **Elementary School Teachers** | `25-2021.00` | Y | 21 | 4 | `MARKET` primary + Early Years named as a shortage area; larger employment base than secondary | **NEW** |
| 4 | **Educational, Guidance, and Career Counselors and Advisors** | `21-1012.00` | Y | 21 | 5 | `STRATEGY` KHDA/ADEK school-counsellor requirements; **this is literally the occupation this product assists** | **NEW** |
| 5 | **Instructional Coordinators** | `25-9031.00` | Y | 21 | 5 | `STRATEGY` MoE curriculum reform + national EdTech push; `MARKET` curriculum/instructional-design roles | **NEW** |
| 6 | Training and Development Specialists | `13-1151.00` | Y | 21 | 4 | `STRATEGY` Nafis upskilling, corporate L&D under Emiratisation | WATCH *(strong case)* |
| 7 | Preschool Teachers, Except Special Education | `25-2011.00` | Y | 21 | 3 | `MARKET` Early Years named explicitly | WATCH |
| 8 | Education Administrators, Postsecondary · Engineering Teachers, Postsecondary | `11-9033.00` `25-1032.00` | Y | 21 | 5 | `INFERRED` university sector; Job Zone 5 | WATCH |

**Existing: 2. Recommended new: 3.**

---

### 3.7 Tourism & Hospitality — *SECTOR DOES NOT EXIST YET, 0 careers*

Grounding is quantified and unambiguous: **UAE Tourism Strategy 2031** targets a top-3 global position and 40M annual visitors; Dubai targets doubling GDP by 2033; **~11,300 new hotel rooms by 2027 creating 15,000+ hospitality jobs**, with sector-wide estimates of 11,500–34,500 new roles and *"250 to 500 direct jobs"* per luxury hotel opening. This is the best-quantified job-creation signal of any sector in this document.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | Chefs and Head Cooks | `35-1011.00` | Y | 21 | 3 | `STRATEGY` Dubai's gastronomy positioning; `MARKET` F&B hiring | **EXISTING — currently floors at 40 with no sector** |
| 2 | **Lodging Managers** | `11-9081.00` | Y | 21 | 4 | `STRATEGY` 15,000+ hotel jobs by 2027 | **NEW** *(already spec'd)* |
| 3 | **Meeting, Convention, and Event Planners** | `13-1121.00` | Y | 21 | 4 | `STRATEGY` Dubai World Trade Centre, ADNEC, business-tourism push | **NEW** *(already spec'd)* |
| 4 | **Airline Pilots, Copilots, and Flight Engineers** | `53-2011.00` | Y | 21 | 4 | `MARKET` Emirates + Etihad + flydubai are among the largest UAE employers with published cadet pipelines. **Arguably the single most aspirational UAE career absent from the catalog** | **NEW — strongest add by demand × student appeal** |
| 5 | Food Service Managers | `11-9051.00` | Y | 21 | **2** | `MARKET` F&B management is the gap `docs/new-careers-spec.md` §4 flagged. Job Zone 2 weakens it as an aspiration | WATCH |
| 6 | Tour Guides and Escorts | `39-7011.00` | Y | 21 | 3 | `MARKET` real (Louvre AD, Expo City, desert tourism) but low-wage; **weak as a 13–18 aspiration** | WATCH |
| 7 | Travel Agents | `41-3041.00` | Y | 21 | 3 | **globally declining**; do not add | ✗ REJECT |
| 8 | Flight Attendants | `53-2031.00` | Y | 21 | 2 | `MARKET` very high real UAE demand — but Job Zone 2 and the catalog has no Job-Zone-2 career; a deliberate positioning question, not a data one | WATCH ⚠️ |

**A note on Airline Pilot.** It does not fit "Tourism & Hospitality" cleanly — aviation is its own thing. The alternatives are worse: Technology is the catch-all we are dismantling, and there is no Transport & Logistics sector. Placing it here is the least-bad option and should be flagged as such, or it argues for an 11th sector (see §8).

**Existing: 1 (re-homed). Recommended new: 3.**

---

### 3.8 Technology — *displayOrder 8, currently 5 careers*

Post-Phase-1 this is a real sector rather than a catch-all, but it is missing the occupation that tops every UAE demand list. Cybersecurity is named as an **AI 2031 priority deployment sector**, has a dedicated **UAE Cybersecurity Council**, and appears in every 2026 market report (*"SOC analysts, penetration testers, GRC and cloud-security specialists"*).

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1–4 | Computer Systems Engineers/Architects · IT Project Managers · Commercial & Industrial Designers · Web Developers | `15-1299.08` `15-1299.09` `27-1021.00` `15-1254.00` | Y | 21 | 3–4 | `MARKET` steady | EXISTING |
| 5 | Civil Engineers | `17-2051.00` | Y | 21 | 4 | `MARKET` civil engineering named in 2026 construction demand | EXISTING *(override)* |
| 6 | **Information Security Analysts** | `15-1212.00` | Y | 21 | 4 | `STRATEGY` AI 2031 names cybersecurity; UAE Cybersecurity Council; `MARKET` top-3 in every 2026 list. **The largest single gap in the whole catalog** | **NEW — top pick overall** |
| 7 | **Computer Network Architects** | `15-1241.00` | Y | 21 | 4 | `MARKET` "cloud & DevOps engineers" named consistently. O\*NET has **no cloud-engineer code**; this is the nearest rated | **NEW** |
| 8 | **Industrial Engineers** | `17-2112.00` | Y | 21 | 4 | `STRATEGY` Operation 300bn / Make it in the Emirates | **NEW** *(re-homed — §3.11)* |
| 9 | Computer and Information Systems Managers | `11-3021.00` | Y | 21 | 4 | `MARKET` IT leadership | WATCH |
| 10 | Computer Hardware Engineers | `17-2061.00` | Y | 21 | 4 | **weak UAE demand** — no semiconductor industry | ✗ REJECT |
| 11 | Penetration Testers · Information Security Engineers · Digital Forensics Analysts | `15-1299.04` `15-1299.05` `15-1299.06` | **N** | 21 | 4 | `MARKET` strong | ✗ blocked — all substitute to `15-1212.00` |

**Existing: 5. Recommended new: 3.**

---

### 3.9 Creative Industries & Media — *displayOrder 7, currently 8 careers*

Second-best covered. **Dubai Creative Economy Strategy** targets **creative jobs 70,000 → 140,000 by 2026**, creative firms 8,300 → 15,000, and CCI GDP share 2.6% → 5%, backed by a 10-year Cultural Visa for artists, curators, musicians and performers. The gap is **screen production** — twofour54, Dubai Studio City and Image Nation Abu Dhabi are the sector's physical infrastructure, and the catalog has no production role at all.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1–4 | Graphic Designers · Fashion Designers · Photographers · Video Game Designers | `27-1024.00` `27-1022.00` `27-4021.00` `15-1255.01` | Y | 21 | 3–4 | `STRATEGY` named creative-economy pillars | EXISTING |
| 5–6 | Writers and Authors · News Analysts, Reporters, and Journalists | `27-3043.00` `27-3023.00` | Y | 21 | 4 | `STRATEGY` Dubai Media City, twofour54, creator economy | EXISTING |
| 7–8 | Architects · Interior Designers | `17-1011.00` `27-1025.00` | Y | 21 | 4–5 | `MARKET` construction/design pipeline | EXISTING |
| 9 | **Producers and Directors** | `27-2012.00` | Y | 21 | 4 | `STRATEGY` Dubai Studio City, twofour54, Image Nation; production is a named CCI pillar with **zero catalog representation** | **NEW** |
| 10 | **Film and Video Editors** | `27-4032.00` | Y | 21 | 4 | `STRATEGY` creator economy; `MARKET` post-production. **Unusually realistic for a 13–18 who already edits video** | **NEW** |
| 11 | Art Directors | `27-1011.00` | Y | 21 | 4 | `MARKET` strong agency demand; overlaps Graphic Designer | WATCH *(strong case)* |
| 12 | Public Relations Specialists | `27-3031.00` | Y | 21 | 4 | `MARKET` strong UAE agency demand; arguably Business & Marketing | WATCH |
| 13 | Curators · Museum Technicians | `25-4012.00` `25-4013.00` | Y | 21 | 5 | `STRATEGY` Louvre Abu Dhabi, Zayed National Museum, Guggenheim AD — real but a **very small employment base** | WATCH |
| 14 | Musicians and Singers · Actors | `27-2042.00` `27-2011.00` | Y | 21 | 2–4 | **weak formal UAE employment**; the Cultural Visa targets them but a visa is not a labour market | ✗ REJECT |

**Existing: 8. Recommended new: 2.**

---

### 3.10 Food Security & Agriculture — *SECTOR DOES NOT EXIST YET, 0 careers*

`docs/sector-list-recon.md` called this an "empty sector" that "would claim nothing" — correct against the 37-career catalog, and the reason to derive careers *from* the sector rather than the other way round. Grounding is strong: **National Food Security Strategy 2051** targets top of the Global Food Security Index and **50% local production by 2051**; agritech investment is projected to create **~16,000 jobs**, with facilities employing *"60+ highly skilled engineers, horticulturists and scientists"*.

| # | occupation | O\*NET-SOC | WV | WS | JZ | UAE demand | status |
|---|---|---|---|---|---|---|---|
| 1 | **Soil and Plant Scientists** | `19-1013.00` | Y | 21 | 5 | `STRATEGY` NFSS 2051 desert agronomy; ICBA (Dubai) is a dedicated saline-agriculture research institute | **NEW** *(already spec'd)* |
| 2 | **Food Scientists and Technologists** | `19-1012.00` | Y | 21 | 4 | `STRATEGY` NFSS 2051 food processing/safety; Silal, Agthia | **NEW** *(already spec'd)* |
| 3 | **Agricultural Engineers** | `17-2021.00` | Y | 21 | 4 | `STRATEGY` **vertical farming is the named technology** — Emirates Bustanica (world's largest vertical farm), Pure Harvest. Controlled-environment agriculture is engineering, and neither spec'd career covers it | **NEW — closes the agritech gap** |
| 4 | **Dietitians and Nutritionists** | `29-1031.00` | Y | 21 | 5 | `STRATEGY` National Nutrition Strategy 2030; `MARKET` diabetes/obesity programmes. Bridges Food Security ↔ Healthcare | **NEW** |
| 5 | Animal Scientists | `19-1011.00` | Y | 21 | 5 | `STRATEGY` aquaculture is an NFSS 2051 pillar (Fish Farm LLC, Aquabridge). **O\*NET has no aquaculture-scientist code** — this is the nearest, and it is a stretch | WATCH ⚠️ |
| 6 | Precision Agriculture Technicians | `19-4012.01` | Y | 21 | 3 | `INFERRED` concept fits smart farming exactly; the **job title barely exists in the UAE market** | WATCH ⚠️ |
| 7 | Farmers, Ranchers, and Other Agricultural Managers | `11-9013.00` | Y | 21 | 4 | `MARKET` ADAFSA-supported farms exist, but **weak as a 13–18 UAE aspiration** | ✗ REJECT |
| 8 | Microbiologists | `19-1022.00` | Y | 21 | 4 | `INFERRED` food-safety labs; also claimable by Healthcare | WATCH |

**Honest caveat.** This is the sector where the derivation is doing the most work and the demand evidence is thinnest per-occupation. 16,000 projected jobs is a strategy projection, not employment data, and most of those jobs are operational rather than the scientist/engineer roles above. Four careers is the right size — do not inflate it.

**Existing: 0. Recommended new: 4.**

---

### 3.11 Advanced Manufacturing — *DROPPED, and what to do with its careers*

The decision to drop it is **supported by measurement**, not just judgement: `docs/new-careers-spec.md` §0.2 measured the plan's proposed vector against a 45-career catalog and found the sector **could not claim its own flagship careers** — Robotics Engineer ranked 4th of 11, Industrial Engineer 2nd — because three of its five skills (Persistence and Grit sd 5.1, Collaboration 5.9, Adaptability 6.0) are the least-discriminating columns in the matrix. Four alternative vectors were tested; **none** won Robotics Engineer.

**But dropping the sector leaves a real national programme unrepresented.** Operation 300bn / Make it in the Emirates is a funded federal industrial strategy. My recommendation:

- **Keep both careers, re-home them.** Robotics Engineer (`17-2199.08`) → **Artificial Intelligence** (§3.1); Industrial Engineer (`17-2112.00`) → **Technology** (§3.8). Both are override-exclusive per plan §5 rule 2, so attribution is pinned regardless of vector alignment.
- Note `17-2199.05` **Mechatronics Engineers** (WV=Y, WS=21, JZ=4) as the better *single* manufacturing career if the sector is ever revived.
- Flag `17-2199.08` Robotics Engineer's known weakness, carried from the spec: it is a detailed occupation under *Engineers, All Other* with **no wage or employment data of its own**. Sound on values, weak on economics.

---

## 4. THE GAP TABLE

Sectors ordered by how well the existing 39 already serve them.

| # | sector | existing careers serving it | new careers needed | coverage verdict |
|---|---|---|---|---|
| 3 | **Healthcare & Life Sciences** | **7** — Nurse, Doctor, Dentist, Pharmacist, Physical Therapist, Psychologist, Biomedical Engineer | **2** — Geneticist, Health Informatics Specialist | ✅ **well covered.** Only the "& Life Sciences" half is missing |
| 7 | **Creative Industries & Media** | **8** — Graphic/Fashion Designer, Photographer, Video Game Designer, Content Creator, Journalist, Architect, Interior Designer | **2** — Producer/Director, Film & Video Editor | ✅ **well covered.** Gap is screen production only |
| 8 | **Technology** | **5** — Software Engineer, Web Developer, UX/UI Designer, Product Manager, Civil Engineer | **3** — Cybersecurity Analyst, Cloud/Network Architect, Industrial Engineer | 🟡 **adequate, one glaring hole** (cybersecurity) |
| 4 | **Renewable Energy & Sustainability** | **4** — Renewable Energy Engineer, Environmental Scientist, Electrical Engineer, Mechanical Engineer | **3** — Nuclear Engineer, Chemical Engineer, Environmental Engineer | 🟡 **adequate but generic.** Two of its best-evidenced roles are gate-blocked |
| 2 | **Space & Future Sciences** | **2** — Aerospace Engineer, Space Scientist | **3** — Remote Sensing Scientist, Atmospheric & Space Scientist, Physicist | 🟠 **thin.** MBRSC's actual business (Earth observation) is unrepresented |
| 6 | **Education & Human Capital** | **2** — Teacher (Secondary), Social Worker *(secondary)* | **3** — Primary Teacher, School Counsellor, Instructional Designer | 🟠 **thin.** One teacher for a sector named "Human Capital" |
| 5 | **Financial Services & FinTech** | **2** — Accountant, Financial Analyst *(+ Lawyer, re-homed)* | **3** — Compliance Officer, Actuary, Financial Manager | 🟠 **thin.** A national pillar with 2 generic careers; FinTech itself is unrepresented |
| 1 | **Artificial Intelligence** | **2** — Data Scientist, Software Engineer *(shared)* | **3** — AI/ML Research Scientist, Robotics Engineer, Database Architect | 🔴 **critically thin.** The flagship sector has the weakest catalog |
| — | **Tourism & Hospitality** | **1** — Chef *(currently floors at 40, sector doesn't exist)* | **3** — Hospitality Manager, Tourism & Events Manager, Airline Pilot | 🔴 **absent.** Best-quantified job-creation evidence of any sector |
| — | **Food Security & Agriculture** | **0** | **4** — Agricultural Scientist, Food Technologist, Agricultural Engineer, Dietitian | 🔴 **absent.** Nothing in the catalog is adjacent |
| — | ~~Advanced Manufacturing~~ | — | — | ⬛ **dropped.** Careers re-homed to AI + Technology |

### Careers serving no sector, or serving only the catch-all

| career | current attribution | recommendation |
|---|---|---|
| Lawyer | Technology @45 *(weak band)* | **re-home → Financial Services & FinTech.** DIFC Courts + ADGM are real common-law jurisdictions |
| Chef | **floor 40, no sector** | **re-home → Tourism & Hospitality** |
| Entrepreneur, HR Manager, Management Consultant | Technology @65 | keep, but see §8 — these argue for a Business & Enterprise sector, not a Technology claim |
| Digital Marketing Specialist, Marketing Manager, Sales Manager | Technology @60 | ditto |
| Social Worker | Education @60 | fine as a secondary claim |

**Nothing in the existing 39 should be dropped.** Every one is a real occupation with a rated O\*NET code and plausible UAE demand. The problem was never bad careers — it was 8 careers with no sector that genuinely wants them.

---

## 5. THE FULL DERIVED CATALOG

**39 existing (all kept) + 29 new = 68 careers across 10 sectors.**

Tiered, because 29 additions at once is a large change with a whole-catalog `values_profile` regeneration attached (Headline #5).

### Tier 1 — must add (16). Closes a sector at 0–2 careers, or a named national strategy role with no representation.

| # | career title (proposed) | O\*NET-SOC | occupation | sector | category |
|---|---|---|---|---|---|
| 1 | Cybersecurity Analyst | `15-1212.00` | Information Security Analysts | Technology | Technology |
| 2 | AI Research Scientist | `15-1221.00` | Computer and Information Research Scientists | Artificial Intelligence | Technology |
| 3 | Robotics Engineer | `17-2199.08` | Robotics Engineers | Artificial Intelligence | Engineering |
| 4 | Nuclear Engineer | `17-2161.00` | Nuclear Engineers | Renewable Energy & Sustainability | Engineering |
| 5 | Chemical Engineer | `17-2041.00` | Chemical Engineers | Renewable Energy & Sustainability | Engineering |
| 6 | Risk & Compliance Officer | `13-1041.00` | Compliance Officers | Financial Services & FinTech | Finance |
| 7 | Geneticist | `19-1029.03` | Geneticists | Healthcare & Life Sciences | Science |
| 8 | Health Informatics Specialist | `15-1211.01` | Health Informatics Specialists | Healthcare & Life Sciences | Healthcare |
| 9 | Hospitality Manager | `11-9081.00` | Lodging Managers | Tourism & Hospitality | Business & Management |
| 10 | Tourism & Events Manager | `13-1121.00` | Meeting, Convention, and Event Planners | Tourism & Hospitality | Business & Management |
| 11 | Airline Pilot | `53-2011.00` | Airline Pilots, Copilots, and Flight Engineers | Tourism & Hospitality | *needs a category — see note* |
| 12 | Agricultural Scientist (Agronomist) | `19-1013.00` | Soil and Plant Scientists | Food Security & Agriculture | Science |
| 13 | Food Technologist | `19-1012.00` | Food Scientists and Technologists | Food Security & Agriculture | Science |
| 14 | Agricultural Engineer | `17-2021.00` | Agricultural Engineers | Food Security & Agriculture | Engineering |
| 15 | Satellite & Remote Sensing Scientist | `19-2099.01` | Remote Sensing Scientists and Technologists | Space & Future Sciences | Science |
| 16 | Film & TV Producer | `27-2012.00` | Producers and Directors | Creative Industries & Media | Media & Communications |

### Tier 2 — should add (13). Deepens a thin sector; all clear both gates.

| # | career title (proposed) | O\*NET-SOC | occupation | sector | category |
|---|---|---|---|---|---|
| 17 | Data Engineer | `15-1243.00` | Database Architects | Artificial Intelligence | Technology |
| 18 | Atmospheric & Space Scientist | `19-2021.00` | Atmospheric and Space Scientists | Space & Future Sciences | Science |
| 19 | Physicist | `19-2012.00` | Physicists | Space & Future Sciences | Science |
| 20 | Environmental Engineer | `17-2081.00` | Environmental Engineers | Renewable Energy & Sustainability | Engineering |
| 21 | Actuary | `15-2011.00` | Actuaries | Financial Services & FinTech | Finance |
| 22 | Investment / Financial Manager | `11-3031.00` | Financial Managers | Financial Services & FinTech | Finance |
| 23 | Primary School Teacher | `25-2021.00` | Elementary School Teachers | Education & Human Capital | Education |
| 24 | School Counsellor & Career Advisor | `21-1012.00` | Educational, Guidance, and Career Counselors | Education & Human Capital | Education |
| 25 | Curriculum & Instructional Designer | `25-9031.00` | Instructional Coordinators | Education & Human Capital | Education |
| 26 | Cloud & Network Architect | `15-1241.00` | Computer Network Architects | Technology | Technology |
| 27 | Industrial Engineer | `17-2112.00` | Industrial Engineers | Technology | Engineering |
| 28 | Video Editor | `27-4032.00` | Film and Video Editors | Creative Industries & Media | Media & Communications |
| 29 | Dietitian & Nutritionist | `29-1031.00` | Dietitians and Nutritionists | Food Security & Agriculture | Healthcare |

### Tier 3 — watchlist, not recommended now (~20)

Medical Lab Scientist `29-2011.00` · Medical & Health Services Manager `11-9111.00` · Occupational Therapist `29-1122.00` · Speech-Language Pathologist `29-1127.00` · Training & Development Specialist `13-1151.00` · Preschool Teacher `25-2011.00` · Art Director `27-1011.00` · Public Relations Specialist `27-3031.00` · Curator `25-4012.00` · Food Service Manager `11-9051.00` · Tour Guide `39-7011.00` · Flight Attendant `53-2031.00` · Operations Research Analyst `15-2031.00` · Statistician `15-2041.00` · Hydrologist `19-2043.00` · Mechatronics Engineer `17-2199.05` · Electronics Engineer `17-2072.00` · Urban & Regional Planner `19-3051.00` · Supply Chain Manager `11-3071.04` · Logistician `13-1081.00` · Animal Scientist `19-1011.00` · Precision Agriculture Technician `19-4012.01` · Microbiologist `19-1022.00`

### Resulting catalog shape

| | now | Tier 1 | Tier 1+2 |
|---|---|---|---|
| careers | 39 | **55** | **68** |
| new | — | 16 | 29 |
| sectors with ≥4 careers | 4 of 8 | 8 of 10 | **10 of 10** |
| careers with no sector / floor | 8 | 6 | 6 |

### Category impact (Tier 1+2)

| category | now | after | note |
|---|---|---|---|
| Technology | 5 | **9** | +Cybersecurity, AI Research Scientist, Data Engineer, Cloud/Network Architect |
| Engineering | 6 | **12** | +Robotics, Nuclear, Chemical, Agricultural, Environmental, Industrial. **Contested by 5 sectors — resolve with overrides, never more category rules** |
| Science | 2 | **7** | +Geneticist, Agronomist, Food Technologist, Remote Sensing, Atmospheric, Physicist. Science still has **no category rule**; all six need overrides or they floor at 40 |
| Healthcare | 6 | **8** | +Health Informatics, Dietitian |
| Finance | 2 | **5** | +Compliance, Actuary, Financial Manager |
| Education | 1 | **4** | +Primary Teacher, Counsellor, Instructional Designer |
| Media & Communications | 2 | **4** | +Producer, Video Editor |
| Business & Management | 3 | **5** | +Hospitality Manager, Tourism & Events Manager |
| Creative Arts · Design & Architecture · Culinary Arts · Legal · Social Services · Business & Marketing | unchanged | | |
| **new category needed?** | | **1 — for Airline Pilot** | see below |

⚠️ **Airline Pilot is the only career in this document with no existing category home.** Options: (a) add an `Aviation & Transport` category — cleanest, but a new category means new rules everywhere; (b) place it in `Engineering` — dishonest; (c) drop it — loses the highest-appeal UAE career in the list. **Recommend (a), and note it argues for an 11th sector too (§8).**

---

## 6. Work Values flags — every occupation that needs, or already is, a substitute

### 6a. Recommended careers failing the gate: **zero.**

All 29 recommendations in §5 Tiers 1–2 are in the 874-code Work Values set **and** carry 21/21 Work Styles. No new substitute is required.

### 6b. Existing substitutes — one has drifted and should be corrected

| career | code in `seed.ts` | O\*NET **31.0** title | intended occupation | status |
|---|---|---|---|---|
| Software Engineer | `15-1299.08` | Computer Systems Engineers/Architects | Software Developers `15-1252.00` (WV=**N**) | ✅ documented substitution, `generate-cvq-values-profiles.ts:35-40` |
| Financial Analyst | `13-2099.01` | Financial Quantitative Analysts | Financial and Investment Analysts `13-2051.00` (WV=**N**) | ✅ documented |
| Product Manager | `15-1299.09` | Information Technology Project Managers | Project Management Specialists `13-1082.00` (WV=**N**) | ✅ documented |
| UX/UI Designer | `27-1021.00` | Commercial and Industrial Designers | Web and Digital Interface Designers `15-1255.00` (WV=**N**) | ✅ documented crosswalk correction |
| **Data Scientist** | `15-2051.01` | **Business Intelligence Analysts** | Data Scientists `15-2051.00` (WV=**N**) | ⚠️ **undocumented.** `scripts/parse-onet-values.ts:43` still comments it `// Data Scientists`. The code is correct *as a substitute*; the comment is now factually wrong and the substitution is not recorded in the `SUBSTITUTIONS` map like the other three |

**Recommended (not applied):** add Data Scientist to the `SUBSTITUTIONS` map in `scripts/generate-cvq-values-profiles.ts` with `from: '15-2051.00', to: '15-2051.01'` and fix the `parse-onet-values.ts:43` comment, so all five substitutions are recorded in one place. This is a documentation fix; **no stored value changes**.

### 6c. Occupations rejected *because of* the gate — record so they are not re-proposed

`15-1252.00` Software Developers · `15-2051.00` Data Scientists · `13-2051.00` Financial and Investment Analysts · `13-1082.00` Project Management Specialists · `15-1255.00` Web and Digital Interface Designers · `15-1299.04` Penetration Testers · `15-1299.05` Information Security Engineers · `15-1299.06` Digital Forensics Analysts · `15-1299.07` Blockchain Engineers · `13-2054.00` Financial Risk Specialists · `11-2032.00` Public Relations Managers · `11-9072.00` Entertainment and Recreation Managers · `29-1214.00` Emergency Medicine Physicians · `29-2043.00` Paramedics · `29-1242.00` / `29-1243.00` Orthopedic / Pediatric Surgeons · `29-9021.00` Health Information Technologists · `19-4044.00` Hydrologic Technicians

### 6d. Work Values present, Work Styles **absent** — pipeline-dependent, avoid until resolved

`17-2199.11` Solar Energy Systems Engineers · `17-2199.10` Wind Energy Engineers · `11-1011.03` Chief Sustainability Officers · `13-1199.05` Sustainability Specialists · `17-2051.02` Water/Wastewater Engineers · `11-9121.02` Water Resource Specialists · `11-9199.02` Compliance Managers · `13-1041.01` Environmental Compliance Inspectors · `47-4011.01` Energy Auditors

**These would carry a CVQ profile under the shipped Work Values pipeline and would fail under `compute_profiles.py`.** Because `docs/cvq-divergence-recon.md` established that the *shipped* data comes from Work Values, they are technically usable today — but adding them commits the catalog to that pipeline permanently, since a later migration to Work Styles would null them. **Recommend avoiding all nine**, as §5 does.

---

## 7. The scalability angle — this derivation *is* the per-country LLM task

Today, `server/services/llmCountryService.ts` generates **sectors against a fixed career catalog**: `buildSectorPrompt` hands the model the 14 existing categories and the careers in each (`:694-709`), and the gates check that every generated sector claims at least one live career (`:459`, `:848`). Career generation exists (`validateGeneratedCareer`, `:1020`) but the header says plainly it is *"not reachable from the country-creation route yet — careers are authored in `server/seed.ts` and their values profiles come from the O\*NET pipeline, both outside this module."*

**Per-country scaling inverts that.** For Saudi Arabia or Egypt the UAE's 39 careers are the wrong catalog, so the model must derive the catalog too. This document is one manual execution of that function. Decomposed, it has five steps with **very different trust properties**:

| step | what it is | who should do it | why |
|---|---|---|---|
| **1. Enumerate priority sectors** | read the country's official national strategies | **LLM, grounded** | needs web retrieval of primary sources; already implemented (`llmCountryService` §sources) |
| **2. Propose candidate occupations per sector** | sector → 8–15 plausible occupations | **LLM, ungrounded** | genuine judgement; this is where the model adds value |
| **3. Resolve to an O\*NET-SOC code and gate it** | title → code; code ∈ 874-code Work Values set; Work Styles count = 21 | **DETERMINISTIC CODE — never the LLM** | ⛔ **the load-bearing rule.** Models hallucinate SOC codes fluently: `15-1252.00` and `15-1251.00` are both real, differ by one digit, and only one passes. This step must be a lookup against a shipped asset |
| **4. Validate local demand** | is the occupation actually hired in *this* country? | **LLM, grounded + human review** | weakest link everywhere, not just here (§8) |
| **5. Emit catalog + sector attribution** | category placement, override vs category rule, relevance band | **LLM proposes, gates verify** | `careerScoringErrors` (`:1001`) and `validateGeneratedCareer` (`:1020`) already exist for this |

### What this implies concretely

1. **Ship the 874-code Work Values allowlist as a repo asset.** It is a static ~10KB list of codes, it never changes (the descriptor is frozen), and it turns step 3 from a hallucination risk into an `if (!WORK_VALUES_CODES.has(code)) reject`. Today the only way to know a code fails is to have downloaded a 13 MB zip — which is why `docs/phase3-space-careers.md` got blocked and why three substitutions had to be discovered one at a time. **Add the gate to `validateGeneratedCareer`.**
2. **Ship the O\*NET-SOC title index too** (1,016 rows from `Occupation Data.txt`), so step 3 can resolve *and verify the title matches what the model claimed* — that is what caught the `15-2051.01` label drift in §6b.
3. **Step 4 does not generalise from the UAE.** Every demand signal in §3 is a UAE-specific document or a Gulf recruiter report. For another country the model needs that country's equivalents, and there is no universal source. **Expect step 4 to require human review per country, indefinitely.** Encoding the `STRATEGY` / `MARKET` / `INFERRED` labels used here into the generated output would at least make the review cheap.
4. **The rescale forces whole-catalog generation per country.** Per Headline #5, `values_profile` bounds are catalog-scoped. A country's catalog must be generated and profiled **in one pass**; there is no incremental "add one career to Egypt" path. This is already true and already documented, but it becomes structural once catalogs are generated rather than authored.
5. **The taxonomy limits recur everywhere.** No AI-engineer code, no cloud-engineer code, no aquaculture-scientist code (§3.1, §3.8, §3.10). Every country will hit these same walls in the same places, because the wall is O\*NET's, not the UAE's. A shared "known taxonomy gaps + agreed substitute" table would stop each country re-deciding.

---

## 8. Where I am not confident — read before acting

1. **UAE demand evidence is uneven and mostly secondary.** There is no public occupation-level UAE demand series. `STRATEGY`-labelled claims rest on official documents and are solid about *national intent*; they are not employment data. `MARKET`-labelled claims rest on recruiter and press content, which is promotional by nature. **Nothing in §3 should be read as a headcount forecast.**
2. **Job-creation numbers are projections.** "50,000 green jobs by 2030", "200,000 net-zero jobs", "16,000 agritech jobs", "creative jobs 70,000 → 140,000", "15,000+ hospitality jobs" are all targets published by the bodies that set them. I have quoted them because they establish *priority*, which is what a priority-sector model needs — not because they are verified outcomes.
3. **Food Security & Agriculture is the weakest derivation.** Four careers derived largely from strategy intent, with `19-1011.00` Animal Scientists a genuine stretch for aquaculture and `19-4012.01` Precision Agriculture Technicians a job title that barely exists in the UAE market. I have kept both out of Tier 1.
4. **Space & Future Sciences may get worse before it gets better.** The collinearity finding in `docs/new-careers-spec.md` §0.3 predicts that adding more science/numeracy-led careers reinforces the Space ↔ Food Security overlap. Three of my recommendations are exactly that. **Measure before committing.**
5. **The Renewable Energy routing is a workaround.** The sector's best-evidenced occupations are gate-blocked (§3.4); Nuclear/Chemical/Environmental Engineer are strong and well-grounded, but they are not "the solar jobs".
6. **68 careers may be too many.** More careers means (a) a whole-catalog `values_profile` regeneration, (b) rescale bounds moving for all 39 existing careers, (c) 16 WEF affinities + 6 RIASEC rows + full Arabic content each (`docs/new-careers-spec.md` §1 notes the catalog is currently 39/39 complete on every field — 29 partial rows would be the first incomplete ones), and (d) `matching.vision.test.ts` / `career-related-subjects.test.ts` catalog-size guards to update. **Tier 1 alone (55 careers) is a defensible stopping point.**
7. **Two sectors that arguably should exist and do not.** The 8 catch-all careers (§4) cluster into two coherent groups the current 10 sectors cannot claim: **Business & Enterprise** (Entrepreneur, HR Manager, Management Consultant, Sales/Marketing Manager, Digital Marketing Specialist — and the UAE *does* have an Entrepreneurial Nation strategy and an SME agenda) and **Transport, Trade & Logistics** (Airline Pilot, plus watchlist Supply Chain Manager and Logistician — DP World, Jebel Ali, Emirates SkyCargo, and logistics is a **named AI 2031 priority sector**). I did not add either, because the brief fixed the sector list at 10. Both are stronger candidates than Advanced Manufacturing was. **Flagging, not proposing.**
8. **Adding two sectors tightens every calibration margin.** `server/seed.ts:28-45` records that at 8 sectors the per-rank step is 0.0214 and the smallest surviving margin is **3.1 points** (Business & Management: Technology 65 over AI 50). At **10 sectors the step narrows to 0.15/9 = 0.0167**, so every margin tightens again, and the Design & Architecture margin (Creative Industries 70 over Technology 60) is explicitly called out as the one that must not flip. **Re-verify career-by-career on staging before committing Tourism & Hospitality and Food Security & Agriculture.**

---

## 9. Sources

**O\*NET (downloaded, verified locally)**
- `https://www.onetcenter.org/dl_files/database/db_31_0_text.zip` — Occupation Data (1,016), Work Styles, Job Zones. **Contains no `Work Values.txt`.**
- `https://www.onetcenter.org/dl_files/database/db_30_0_text.zip` — `Work Values.txt`, EX scale, **874 distinct occupations**, dated 06/2008, Domain Source "Analyst".
- `https://www.onetonline.org/link/details/17-2011.00` — connectivity check.

**UAE strategy (primary)**
- [National Space Strategy 2030](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/industry-science-and-technology/national-space-strategy-2030) · [UAE Cabinet approval](https://uaecabinet.ae/en/details/news/uae-cabinet-approves-national-space-strategy-2030)
- [National Food Security Strategy 2051](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/environment-and-energy/national-food-security-strategy-2051)
- [UAE Energy Strategy 2050](https://u.ae/eu/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/environment-and-energy/uae-energy-strategy-2050) · [Net Zero 2050](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/environment-and-energy/the-uae-net-zero-2050-strategy) · [MoEI updated strategy + hydrogen](https://www.moei.gov.ae/en/media-center/news/4/7/2023/minister-of-energy-and-infrastructure-reveals-details-of-the-updated-uae-energy-strategy-2050-and)
- [Dubai Creative Economy Strategy](https://dubaiculture.ae/en/about-us/dubai-creative-economy-strategy) · [u.ae listing](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/finance-and-economy/dubai-creative-economy-strategy) · [National Strategy for the Cultural and Creative Industries](https://u.ae/en/about-the-uae/strategies-initiatives-and-awards/strategies-plans-and-visions/finance-and-economy/national-strategy-for-the-cultural-and-creative-industries)
- [UAE National Strategy for AI 2031 (OECD.AI)](https://oecd.ai/en/dashboards/policy-initiatives/uae-national-strategy-for-ai-8711) · [UNESCWA record](https://andp.unescwa.org/plans/1493)
- [The Emirati Genome Programme (u.ae)](https://u.ae/en/information-and-services/health-and-fitness/research-in-the-field-of-health/the-emirati-genome-programme) · [M42](https://m42.ae/what-we-do/integrated-health-solutions/emirati-genome-program/) · [Abu Dhabi Media Office](https://www.mediaoffice.abudhabi/en/health/emirati-genome-program-expands-nationwide-with-a-new-visual-identity/)
- [Dubai tourism record year (Dubai Media Office)](https://mediaoffice.ae/en/news/2026/february/09-02/dubais-tourism-industry-achieves-third-successive-record-breaking-year)

**UAE market signals (secondary)**
- [DIFC 10,018 firms H1 2026 (Gulf News)](https://gulfnews.com/business/markets/difc-reaches-10018-firms-in-h1-2026-ai-ecosystem-expands-39-1.500622475) · [UAE sectors hiring + AI/tech skills (Gulf News)](https://gulfnews.com/business/markets/jobs-in-the-uae-these-sectors-are-hiring-and-these-skills-could-get-you-noticed-1.500642793) · [FinTech talent DIFC/ADGM/CBUAE](https://rfsonshr.com/finance-banking-recruitment-uae/fintech-talent-acquisition-trends/) · [Barclay Simpson 2026 Middle East salary guide](https://www.barclaysimpson.com/salary-guides/2026-middle-east-salary-guide/)
- [Dubai hospitality boom — hotel openings and jobs (Arabian Business)](https://www.arabianbusiness.com/business/dubai-hospitality-boom-thousands-of-new-jobs-to-emerge-as-hotel-openings-surge) · [UAE hospitality expansion to 2030](https://www.travelandtourworld.com/news/article/uae-hospitality-sector-expands-with-more-than-twenty-thousand-new-hotel-rooms-boosting-its-luxury-tourism-and-creating-thousands-of-jobs-by-2030/)
- [UAE schools 2026-27 teacher hiring (Gulf News)](https://gulfnews.com/uae/education/uae-schools-2026-how-top-education-providers-are-hiring-teachers-for-the-new-academic-year-1.500577896) · [Schools ramp up teacher hiring (Khaleej Times)](https://www.khaleejtimes.com/jobs/uae-jobs-schools-teacher-roles-hiring-2026-27-academic-year) · [UAE teacher shortage red flags](https://schoolscompared.com/uae/news/uae-teacher-shortage-schools-urged-not-to-ignore-red-flags-in-rush-to-recruit)
- [Top in-demand jobs in the UAE](https://www.qureos.com/career-guide/top-in-demand-jobs-in-the-uae) · [Most in-demand occupations UAE 2026](https://www.upgrad.com/ae/blog/most-in-demand-jobs-uae/)
- [AgriFoodTech in the UAE (ORF Middle East)](https://orfme.org/expert-speak/bridging-farm-and-table-agrifoodtech-in-the-uae/) · [AgTech opportunities (S-GE)](https://www.s-ge.com/sites/default/files/publication/free/s-ge-20204-c7-uae-food-security-agtech.pdf) · [UAE's path to food self-sufficiency (AGSI)](https://agsi.org/analysis/the-uaes-path-to-food-self-sufficiency/)
- [Space Mission & Satellite Engineering programme (Dubai Eye)](https://www.dubaieye1038.com/news/local/uae-launches-space-mission-satellite-engineering-training-programme/) · [UAE space expertise programme (The National)](https://www.thenationalnews.com/news/uae/2026/07/17/uae-to-boldly-go-with-new-programme-to-boost-nations-expertise-in-space-sector/)
- [Emiratisation and the Nafis Programme (Salt)](https://welovesalt.com/wp-content/uploads/2025/10/Salt-Emiratisation-and-the-Nafis-Programme-1.pdf)

**Repo (read, not modified)**
`server/seed.ts:20-175` (sector rules, overrides, vectors), `server/seed.ts:602-1176` (39 careers) · `scripts/parse-onet-values.ts:41-79` · `scripts/generate-cvq-values-profiles.ts:1-70` (substitutions, rescale) · `scripts/onet_fetch_cache.py`, `scripts/compute_profiles.py` · `server/services/llmCountryService.ts:281-1030` · `docs/sector-list-recon.md`, `docs/phase1-sectors-done.md`, `docs/phase2-renames-done.md`, `docs/phase3-space-careers.md`, `docs/new-careers-spec.md`, `docs/cvq-divergence-recon.md`

---

## 10. What I did NOT do

- No database connection, staging or production. No `SELECT`, no write.
- No change to `server/seed.ts`, `scripts/`, any migration, or any test.
- No `values_profile` computed or authored for any proposed career. Per `docs/VALUES_PROFILE_DERIVATION_METHODOLOGY.md:34`, values are **computed, never authored** — and per Headline #5, they cannot be computed per career anyway, only per catalog.
- No commit, no branch, no `cc-out.md`.
- No WEF skill affinities, RIASEC vectors, Arabic content, descriptions, salaries or growth outlooks for the 29 proposed careers. Those are the build step, and they should not start until the catalog list itself is approved.
