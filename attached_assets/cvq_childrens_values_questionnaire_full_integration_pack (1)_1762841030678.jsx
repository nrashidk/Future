# Unified Scoring and Integration Specification

This document defines the **final, fixed-weight scoring model**, assessment logic, and authoritative data mappings for both **Paid** and **Free** versions of the career guidance system.

All users must complete every component before a final report is generated. **Weights are fixed**, and incomplete data blocks the generation of composite results. This ensures consistency, validity, and comparability across students.

---

## 1. Scoring Components

Each component produces a 0–100 score. These are derived from validated assessments and structured data inputs.

| Component | Description | Data Source |
|------------|--------------|--------------|
| **Holland (RIASEC)** | Career interest typology identifying 6 themes: Realistic, Investigative, Artistic, Social, Enterprising, Conventional. | Holland Career Quiz |
| **Kolb Experiential Learning Style (ELT)** | Preferred learning process across four stages (Concrete Experience, Reflective Observation, Abstract Conceptualization, Active Experimentation). | Kolb Questionnaire |
| **Children’s Values Questionnaire (CVQ)** | Measures seven personal value domains in youth: Achievement, Honesty, Kindness, Respect, Responsibility, Peacefulness, Environment. | CVQ 21-item short form |
| **Academic Readiness (Subject Fit)** | Student’s strength and engagement across chosen subjects. | Embedded subject-fit quiz |
| **Country Alignment (National Priorities Fit)** | Degree to which student’s path aligns with the nation’s strategic vision, missions, and sectoral priorities. | Program metadata × country priorities dataset |
| **Dream Big (General Interests)** | Free-text aspirations and tagged interests used for narrative personalization only (no numeric weight). | User input |

---

## 2. Fixed Weight Distribution

Weights are **fixed** and do not renormalize. All assessments must be completed for a report to be generated.

### Paid Version (Full)
| Component | Weight |
|------------|--------|
| Holland (RIASEC) | 0.30 |
| CVQ (Personal Values) | 0.20 |
| Academic Readiness | 0.20 |
| Country Alignment | 0.20 |
| Kolb (Learning Style) | 0.10 |
| **Total** | **1.00** |

### Free Version (Simplified)
| Component | Weight |
|------------|--------|
| Holland (RIASEC) | 0.55 |
| Country Alignment | 0.25 |
| Kolb (Learning Style) | 0.20 |
| **Total** | **1.00** |

> ⚠️ Reports cannot be generated until all required assessments are completed.

---

## 3. Component Scoring Formulas

### (a) Holland (RIASEC) Fit
```
if Σ program.riasec_profile == 0 → 50
else RIASEC_SCORE = Σ_k [min(user.riasec[k], program.riasec_profile[k]) × (program.riasec_profile[k] / Σ_j program.riasec_profile[j])]
```

### (b) CVQ (Values Fit)
```
if Σ program.values_profile == 0 → 50
else CVQ_SCORE = Σ_d [min(user.cvq[d], program.values_profile[d]) × (program.values_profile[d] / Σ_j program.values_profile[j])]
```

### (c) Academic Readiness (Subject Fit)
```
if Σ program.subject_needs == 0 → 60
else READINESS_SCORE = (Σ_s user.readiness[s] × program.subject_needs[s]) / Σ_s program.subject_needs[s]
```

### (d) Country Alignment (National Priorities Fit)
```
cw[p] = country.priority_weights[p]/100
uw[p] = user.priority_weights ? user.priority_weights[p]/100 : cw[p]
md[p] = market.demand_index ? market.demand_index[p]/100 : 1
α=0.7, β=0.3, γ=(market provided ? 0.5 : 0)

align_p[p] = program.priorities[p] × (α*cw[p] + β*uw[p]) × ((1-γ) + γ*md[p])

if Σ program.priorities == 0 → COUNTRY_SCORE = 50
else COUNTRY_SCORE = 100 × (Σ align_p[p] / Σ program.priorities[p])
```

### (e) Kolb (Learning Style Fit)
Convert user axes (AC–CE, AE–RO) to 4-stage preferences (0–100):
```
raw = {
  CE: max(0, 100 - scale(AC)),
  AC: max(0, 100 + scale(AC)),
  RO: max(0, 100 - scale(AE)),
  AE: max(0, 100 + scale(AE))
}
normalize(raw)
```
Program defines `kolb_fit` (CE/RO/AC/AE weights). Then:
```
if Σ kolb_fit == 0 → 65
else KOLB_SCORE = Σ_k [min(user.kolb[k], kolb_fit[k]) × (kolb_fit[k] / Σ_j kolb_fit[j])]
```

---

## 4. Composite Calculation

### Paid Version
```
FINAL_PAID = clamp(
  0.30*RIASEC_SCORE +
  0.20*CVQ_SCORE +
  0.20*READINESS_SCORE +
  0.20*COUNTRY_SCORE +
  0.10*KOLB_SCORE,
0,100)
```

### Free Version
```
FINAL_FREE = clamp(
  0.55*RIASEC_SCORE +
  0.25*COUNTRY_SCORE +
  0.20*KOLB_SCORE,
0,100)
```

Dream Big adds qualitative insights only (no numeric influence).

---

## 5. Output Fields per Program

| Field | Description |
|--------|--------------|
| `final_score` | Composite score (0–100) |
| `riasec_score` | Interest fit |
| `cvq_score` | Values fit |
| `readiness_score` | Academic strength alignment |
| `country_score` | National priorities alignment |
| `kolb_score` | Learning style fit |
| `values_highlights` | Top 3 user values (CVQ) |
| `priorities_matched` | List of matched national priorities |
| `subjects_matched` | Top contributing subjects |

---

## 6. Career Value Mappings — Definitive Source

The authoritative mapping of career value emphasis derives from the **U.S. Department of Labor’s O*NET Work Values** dataset, which is **empirically validated** through large-scale surveys. This ensures that each career’s emphasized values are **research-based**, not arbitrary.

- **O*NET Work Values Families:** Achievement, Independence, Recognition, Relationships, Support, Working Conditions.
- Each occupation includes a numeric rating (0–100) for all six families.

### Mapping to CVQ Domains
The O*NET Work Values are crosswalked to the seven CVQ domains as follows:

| O*NET Work Value | CVQ Mapped Domains | Mapping Weight |
|------------------|--------------------|----------------|
| Achievement | Achievement, Responsibility | 0.5 / 0.5 |
| Independence | Achievement, Respect | 0.6 / 0.4 |
| Recognition | Achievement, Respect | 0.6 / 0.4 |
| Relationships | Kindness, Respect | 0.5 / 0.5 |
| Support | Kindness, Responsibility | 0.5 / 0.5 |
| Working Conditions | Peacefulness, Environment | 0.5 / 0.5 |

This mapping is **fixed and version-controlled**. Updates from O*NET refresh the value vectors.

Example — *Renewable Energy Engineer (17-2199.11)*:
- O*NET Work Values: Achievement 84, Independence 80, Working Conditions 77.
- Mapped CVQ profile → Environment (100), Achievement (80), Responsibility (70), Peacefulness (65).
- Stored in `program.values_profile` and used directly in CVQ_SCORE calculation.

> Therefore, career value definitions come from **O*NET empirical data**, not subjective input.

---

## 7. Reporting Rules
- Reports are **only generated when all required components are complete**.
- Missing components = “Incomplete Profile” status.
- Both Paid and Free versions produce numeric and narrative reports using the formulas above.
- Dream Big and open-text reflections enrich the qualitative narrative only.

---

## 8. Implementation Notes for AI Agent
1. Load all user assessment data and program metadata.
2. Calculate per-component scores using exact formulas above.
3. Do **not renormalize weights** — fixed model only.
4. Clamp all component scores and final scores to `[0,100]`.
5. Output all score breakdowns and qualitative enrichments.
6. Use O*NET Work Values → CVQ mapping as the **exclusive source** for `program.values_profile`.
7. Validate all inputs before processing; block report generation until all assessments are complete.

---

**End of Specification — CareerGuideAI Final Scoring Model (Paid & Free Versions)**
