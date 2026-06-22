> **STATUS: DRAFT — partially validated.** This document specifies the rules for deriving each career's `values_profile` from O*NET v2.0 occupational data, and it is written to match the implementation in `scripts/onet_fetch_cache.py` and `scripts/compute_profiles.py` exactly. Discriminant validity has been confirmed on 5 known-signature careers (see §6); the rules have **not** been validated against ground-truth Schwartz scores and have **not** been reviewed by a credentialed psychometrician. Treat the derived values as research-informed estimates, not validated psychometric measurements, until the §6 gaps are closed.

# Values Profile Derivation Methodology v2 (O*NET v2.0 → Schwartz, clean-5)

## 0. What changed in v2, and why (the Work Values removal)

v1 of this methodology derived 4 of 5 domains from the O*NET **Work Values** descriptor (`WV[Achievement]`, `WV[Independence]`, `WV[Relationships]`, `WV[WorkingConditions]`+`WV[Support]`, `WV[Recognition]`). That approach is **dead on O*NET API v2.0**:

- **The Work Values endpoint no longer exists in API v2.0.** Both `…/details/work_values` and `…/summary/work_values` return **HTTP 404** against `api-v2.onetcenter.org` (O*NET 30.x). This is consistent with O*NET's own note that Work Values is no longer updated or displayed.
- **Work Styles, Work Activities, and Interests endpoints all return HTTP 200** with full 0–100 data.

So v2 is **rebuilt on Work Styles** as the primary signal, with Work Activities and Interests as secondary signals. This was not a stylistic rewrite — the v1 rules were literally not executable against the live API. The finding was caught by an empirical probe **before** any `values_profile` was written to production, so no bad data was persisted.

## 1. Purpose and scope

The premium tier matches a student's personal values (measured by the CVQ) against each career's `values_profile`. For that match to work, every career needs a values profile on the same domains the CVQ measures. This document defines how each of the **37 careers** gets a values profile derived from **O*NET Web Services v2.0** data, on a **5-domain** ("clean-5") subset of the Schwartz values model.

This methodology does **not** invent values data. Every domain is computed from published O*NET occupational descriptors for the occupation mapped to each career via its `onet_code` (see the career→O*NET crosswalk, separately maintained and source-verified). The computation is fully reproducible by running the two scripts (§5).

## 2. The clean-5 domain model (no Universalism, no Hedonism)

The Schwartz Theory of Basic Human Values defines 10 values (1992) / 19 (refined, 2012). The CVQ instrument adapted a 7-domain subset for ages 13–18 (omitting Conformity, Tradition, Stimulation). This methodology scores **5** of those 7:

| Domain (CVQ key) | Scored? | Reason |
|---|---|---|
| `achievement` | **Yes** | Groundable in O*NET Work Styles |
| `self_direction` | **Yes** | Groundable in O*NET Work Styles + Interests |
| `benevolence` | **Yes** | Groundable in O*NET Work Styles + Activities + Interests |
| `security` | **Yes** | Groundable in O*NET Work Styles |
| `power` | **Yes** | Groundable in O*NET Work Styles + Activities |
| `universalism` | **No — excluded** | No defensible O*NET career-side source |
| `hedonism` | **No — excluded** | No defensible O*NET career-side source |

**Why Universalism and Hedonism are excluded:** O*NET's occupational descriptors have no element that validly maps to Schwartz Universalism (concern for the welfare of *all* people and nature, beyond one's in-group) or Hedonism (pleasure, sensuous gratification). Rather than assign these domains values by unsupported inference — fabricated precision presented as if sourced — they are excluded from the scored model. This is a **coverage limitation, not a validity flaw**: the model scores only what it can ground, and discloses what it cannot detect (e.g. Universalism, relevant to environmental/humanitarian work).

**Consequence for the instrument:** the CVQ is reduced from 21 items (7 domains × 3) to **15 items (5 domains × 3)** — the Universalism and Hedonism items are removed. Student CVQ scoring aggregates over the same 5 domains. (Instrument change tracked separately; this doc covers the career-side derivation.)

## 3. O*NET v2.0 data sources used

- **Base URL:** `https://api-v2.onetcenter.org/online/occupations`
- **Auth:** `X-API-Key: <key>` request header (plus `Accept: application/json`).
- **Endpoints** (per `onet_code`, queried `?start=1&end=50`):
  - `…/details/work_styles` — **primary** source for all five domains.
  - `…/details/work_activities` — secondary signal for benevolence and power.
  - `…/details/interests` — RIASEC, secondary signal for self-direction and benevolence.
- Each element's numeric score is read from the response's `importance` field (0–100) for **work_styles** and **work_activities**. The **interests** endpoint instead carries its score in the `occupational_interest` field (also 0–100) — `compute_profiles.py`'s `by_name()` reads `importance` first and falls back to `occupational_interest`, so interest signals are captured regardless of endpoint. Derived `values_profile` scores are also 0–100, matching the scale of `calculateCvqScore` in `server/services/matching.ts`.

> The Work Values endpoint (`…/details/work_values`) is intentionally **not** used — it returns 404 on v2.0 (see §0).

## 4. Per-domain derivation rules (exact, as implemented)

Each rule produces an integer 0–100 (final `round()`). Notation: `WS[x]` = Work Styles importance for element x; `WA[x]` = Work Activities importance for activity x; `INT[x]` = RIASEC interest score. `mean(...)` is the arithmetic mean. A descriptor that is *absent* from the API response is **dropped, not read as 0**: means are taken over present values only, weighted blends renormalize their surviving weights to sum to 1.0, a present score of `0` is kept as a real signal, and a domain is emitted as **null** when its primary signal is absent (see §5 for the full missing-data semantics).

### 4.1 Achievement — CONFIDENCE: HIGH
**Rule:**
```
achievement = round(0.65 * WS[Achievement Orientation] + 0.35 * INT[Enterprising])
```
**Source:** the Work Style "Achievement Orientation" (`1.D.1.b`) as primary, blended with the Enterprising RIASEC interest as a secondary signal.
**Rationale:** Schwartz Achievement ("personal success through demonstrating competence per social standards") maps near-directly to the Achievement Orientation work style ("establishing and maintaining personally challenging goals and exerting effort toward mastery"). On its own, however, Achievement Orientation sits in a narrow ~40–82 band across the 37 careers and discriminates poorly. The Enterprising interest (RIASEC "E" — ambition, persuasion, goal-driven enterprise) is added as a second signal to widen discrimination; the blend renormalizes its surviving weight if Enterprising is absent. **Null only if Achievement Orientation (the primary) is absent** — a missing Enterprising interest does not null the domain.

### 4.2 Self-Direction — CONFIDENCE: HIGH
**Rule:**
```
sd_style    = mean(WS[Initiative], WS[Intellectual Curiosity],
                   WS[Innovation], WS[Tolerance for Ambiguity])
sd_interest = max(INT[Investigative], INT[Artistic])
self_direction = round(0.55 * sd_style + 0.45 * sd_interest)
```
**Rationale:** Schwartz Self-Direction ("independent thought and action — choosing, creating, exploring") maps to the autonomy/curiosity/innovation cluster of work styles, reinforced by the Investigative/Artistic RIASEC interests that characterise exploratory and creative work.

### 4.3 Benevolence — CONFIDENCE: MEDIUM
**Rule:**
```
ben_style   = mean(WS[Empathy], WS[Cooperation], WS[Social Orientation])
benevolence = round(0.7 * ben_style
                  + 0.2 * WA[Assisting and Caring for Others]
                  + 0.1 * INT[Social])
```
**Rationale:** Schwartz Benevolence ("preserving and enhancing the welfare of people with whom one is in frequent contact") is carried primarily by the empathy/cooperation/social work styles, anchored toward genuine other-welfare by the explicit "Assisting and Caring for Others" activity, with a small Social-interest contribution. Validate that caring professions (Social Worker, Pharmacist, Teacher) score high.

### 4.4 Security — CONFIDENCE: MEDIUM
**Rule:** `security = round(mean(WS[Dependability], WS[Self-Control], WS[Cautiousness]))`
**Rationale:** With the old `WV[WorkingConditions]`+`WV[Support]` source gone (§0), Security is reconstructed from the stability/control cluster of work styles — dependability, self-control, and cautiousness as the dispositional proxies for valuing safety, harmony, and stability. **Caveat:** this is a disposition-side proxy rather than a direct measure of job-security/stability, so it is the most reconstructed of the five and the weakest-grounded domain.

### 4.5 Power — CONFIDENCE: MEDIUM-LOW (weakest mapping)
**Rule:**
```
pow_act = mean( present of [ WA[Coordinating the Work and Activities of Others],
                             WA[Guiding, Directing, and Motivating Subordinates],
                             WA[Developing and Building Teams] ] )   # null if all absent
power   = round( blend( (WS[Leadership Orientation], 0.6), (pow_act, 0.4) ) )
```
**Rationale:** Schwartz Power ("social status and prestige, control or dominance over people and resources") maps to the Leadership Orientation work style (the disposition to lead/take charge) blended with the directing/coordinating activities (the control-over-people facet). The activity list drops absent items before averaging so occupations missing one activity aren't penalised. **Fallback to activities:** when Leadership Orientation is absent but any of the three directing activities is present, power is computed from the activities alone — the blend renormalizes the surviving weight (0.4 → 1.0). This recovers a power signal for occupations whose O*NET profile omits the Leadership Orientation work style but still reports directing activities (e.g. Web Developer `15-1254.00`: Leadership absent, activities 45/42/56 present → power ≈ 48 instead of null). **Power is emitted as null only when BOTH Leadership Orientation AND all three directing activities are absent.** **This is the most constructed mapping** — validate that managerial roles (Sales Manager, Entrepreneur) score high while individual-contributor/service roles score low.

## 5. Scaling, missing data, and edge cases (as implemented)

- **Pipeline:** `onet_fetch_cache.py` caches raw JSON to `./onet_cache/<soc>_<report>.json` (one API request at a time, 2s delay, exponential backoff on 403/429, resumable — cached files are never re-fetched). `compute_profiles.py` then computes profiles **offline** from the cache (zero API calls), so blend weights can be tuned and re-run with no rate-limit risk.
- **Missing descriptor → dropped, never 0.** An O*NET element that is *absent* from the response is **not** the same as an element scored low. Absence is treated as "no signal" and dropped, so a domain is never deflated just because O*NET omitted an element:
  - **Mean over several signals** (e.g. the self-direction work-style cluster, the benevolence cluster, the security cluster, the power activities) is taken over the **present** elements only — absent elements are dropped from *both* numerator and denominator. A present score of `0` is a real signal and is kept; only true absence is dropped.
  - **Weighted blends** (self_direction, benevolence, power) drop any absent component and **renormalize the surviving weights to sum to 1.0**. E.g. if `Assisting and Caring for Others` is absent, benevolence is computed from the work-style cluster (0.7) and Social interest (0.1) renormalized to 0.875/0.125.
  - **Primary signal absent → domain is `null`.** Each domain has a primary source (achievement: Achievement Orientation; self_direction & benevolence: their work-style cluster; security: the dependability/self-control/cautiousness cluster). If the primary is entirely absent, the domain is emitted as **`null`** (JSON `null` / jsonb `null`), so DB matching renormalizes over the present domains rather than reading a misleadingly low number. **Power is the exception** (see §4.5): it falls back to the directing activities when Leadership Orientation is absent, and is null only when Leadership Orientation **and** all three directing activities are absent. (Achievement's secondary Enterprising signal never affects nulling — only the absence of Achievement Orientation nulls it.)
- **Occupation with no Work Styles cache → skipped:** if the `work_styles` cache file is missing for a SOC, that career produces **no profile** at all (it is omitted from output, not written as zeros or nulls).
- **Rounding:** every domain is rounded to an integer 0–100.
- **Output shape:** `values_profile = { achievement, self_direction, benevolence, security, power }` — 5 keys, no `universalism`/`hedonism`.
- **Emit modes:** `compute_profiles.py` prints a review table with sanity flags by default; `--json` emits `{soc: profile}`; `--sql` emits `UPDATE careers SET values_profile = '…'::jsonb WHERE onet_code = '…';` statements.
- **Approximation-flagged occupations:** careers whose `onet_code` is a documented approximation (Entrepreneur, Digital Marketing Specialist, Video Game Designer — see crosswalk) inherit that approximation; their profiles carry the same caveat.

## 6. Validation status and requirements

**What IS validated — discriminant validity (5 known-signature careers).** The rules were run against five careers with well-understood value signatures and the outputs discriminate in the expected directions:

- **Social Worker** → high benevolence, low power
- **Sales Manager** → high power, high achievement
- **Accountant** → high security, moderate achievement
- **Software Engineer** → high self-direction, moderate achievement
- **Pharmacist** → high benevolence, high security

This establishes that the model **discriminates** between careers in line with intuition — a necessary check, and the reason these five were chosen as spread-out signatures.

**What is NOT validated (open gaps — do not overstate the model):**

1. **No ground-truth comparison.** Discriminant validity ≠ criterion validity. The derived scores have **not** been validated against actual Schwartz value measurements of job incumbents. "Software Engineer scores higher on self-direction than Accountant" is confirmed; "Software Engineer's self-direction is *73*" is not anchored to any external truth.
2. **Authored weights, not psychometric constants.** Every blend weight in §4 (0.55/0.45, 0.7/0.2/0.1, 0.6/0.4) and every element-to-domain assignment is an **authored (AI-assisted) design choice**, not an established psychometric constant. They are reproducible and auditable, not empirically derived.
3. **Expert review recommended before launch.** Review by someone with psychometric or careers-guidance credentials would materially strengthen the defensibility of values-based matching to schools. This is an honestly-noted gap, not a blocker for internal testing.

## 7. White-paper disclosure (required language)

The product white paper must disclose:
- The values model uses a **5-domain (clean-5)** subset of the Schwartz framework (Achievement, Self-Direction, Benevolence, Security, Power). Universalism and Hedonism are not measured; the CVQ is reduced to 15 items (5 domains × 3) accordingly.
- Career-side values are **derived from O*NET v2.0 occupational data** (Work Styles, Work Activities, Interests) via the documented rules in §4 — not from primary measurement of incumbents. They are "research-informed," not "empirically validated against job-holder value surveys."
- The model has **confirmed discriminant validity** across known-signature careers but has **not** been validated against ground-truth Schwartz scores; blend weights are authored, and expert psychometric review is recommended before launch.
