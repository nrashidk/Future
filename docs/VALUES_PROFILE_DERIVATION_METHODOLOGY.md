> **STATUS: DRAFT — pending empirical validation.** This document specifies the *intended* rules for deriving each career's `values_profile` from O*NET occupational data. The conceptual logic has been reviewed; the rules have **not** yet been validated against real O*NET data, and have **not** been reviewed by a credentialed psychometrician. Treat the derived values as research-informed estimates, not validated psychometric measurements, until both validations are complete (see §6).

# Values Profile Derivation Methodology (O*NET → Schwartz, 5-domain)

## 1. Purpose and scope

The premium tier matches a student's personal values (measured by the CVQ) against each career's `values_profile`. For that match to function, every career needs a values profile on the same domains the CVQ measures. This document defines how each of the **37 careers** gets a values profile derived from **O*NET Web Services** occupational data, on a **5-domain** subset of the Schwartz values model.

This methodology does **not** invent values data. It derives each domain from published O*NET occupational descriptors (Work Values, Work Activities, Interests) for the occupation mapped to each career via its `onet_code` (see the career→O*NET crosswalk, separately maintained and source-verified).

## 2. The 5-domain model and why it is 5, not 7 (or 10)

The Schwartz Theory of Basic Human Values defines **10** values (1992) / 19 (refined, 2012). The CVQ instrument adapted a **7-domain** subset for ages 13–18 (omitting Conformity, Tradition, Stimulation). This methodology scores **5** of those 7:

| Domain (CVQ key) | Scored? | Reason |
|---|---|---|
| `achievement` | **Yes** | Groundable in O*NET |
| `self_direction` | **Yes** | Groundable in O*NET |
| `benevolence` | **Yes** | Groundable in O*NET |
| `security` | **Yes** | Groundable in O*NET |
| `power` | **Yes** | Groundable in O*NET (weakest mapping — see §4) |
| `universalism` | **No — excluded** | No defensible O*NET career-side source |
| `hedonism` | **No — excluded** | No defensible O*NET career-side source |

**Rationale for excluding Universalism and Hedonism (the defensible argument):** O*NET's occupational value taxonomy (Achievement, Independence, Recognition, Relationships, Support, Working Conditions) has no descriptor that validly maps to Schwartz Universalism (concern for the welfare of *all* people and nature, beyond one's in-group) or Hedonism (pleasure, sensuous gratification). Rather than assign these domains values by unsupported inference — which would present fabricated precision as if it were sourced — they are excluded from the scored model.

**This is a coverage limitation, not a validity flaw.** The model scores only what it can ground in validated occupational data. Every scored domain corresponds to a defensible O*NET source; nothing measured is left inert, and nothing reported exceeds what was computed. The cost is that the instrument cannot detect Universalism (a meaningful career-relevant value, e.g. for environmental or humanitarian work). This is disclosed, not hidden.

**Consequence for the instrument:** the CVQ is reduced from 21 items (7 domains × 3) to **15 items (5 domains × 3)** — the Universalism (`CVQ-U*`) and Hedonism (`CVQ-H*`) items are removed. Student CVQ scoring aggregates over 5 domains. (Instrument change tracked separately; this doc covers the career-side derivation.)

## 3. O*NET data sources used

Per occupation (by `onet_code`), three O*NET Web Services endpoints supply the inputs:

- **Work Values** (`/details/work_values`) — 6 values, each on a 0–100 "Extent" scale: Achievement, Independence, Recognition, Relationships, Support, Working Conditions.
- **Work Activities** (`/details/work_activities`) — activities on a 0–100 "Importance" scale. Specific activities are used as secondary signals for Power and Benevolence (see §4).
- **Interests** (`/details/interests`) — RIASEC scores, used as a secondary signal for Self-Direction.

All O*NET scores are 0–100. Derived `values_profile` scores are also 0–100, matching the scale of `calculateCvqScore` in `server/services/matching.ts`.

## 4. Per-domain derivation rules

Each rule produces a 0–100 score. Where a rule blends a primary source with a secondary signal, the blend is **weighted, capped at 100**, and the weights are stated so the derivation is reproducible and auditable.

Notation: `WV[x]` = O*NET Work Value Extent score for value x; `WA[id]` = Work Activity Importance score; `INT[x]` = RIASEC interest score.

### 4.1 Achievement — CONFIDENCE: HIGH
**Source:** O*NET Work Value `Achievement` (direct).
**Rule:** `achievement = WV[Achievement]`
**Rationale:** Schwartz Achievement ("personal success through demonstrating competence per social standards") and O*NET Achievement ("using your best abilities, getting a feeling of accomplishment") are near-direct conceptual matches. No blending needed.

### 4.2 Self-Direction — CONFIDENCE: HIGH
**Primary:** O*NET Work Value `Independence`.
**Secondary:** RIASEC `Investigative` and `Artistic` interests (both correlate with autonomous, creative orientation).
**Rule:** `self_direction = min(100, 0.7 * WV[Independence] + 0.3 * (max(INT[Investigative], INT[Artistic])))`
**Rationale:** Schwartz Self-Direction ("independent thought and action — choosing, creating, exploring") maps strongly to O*NET Independence ("work on their own and make decisions"). The Investigative/Artistic boost reflects that self-directed values manifest in exploratory/creative work. *The secondary weighting (0.3) is an authored design choice, not an established psychometric constant — flagged for validation.*

### 4.3 Benevolence — CONFIDENCE: MEDIUM
**Primary:** O*NET Work Value `Relationships`.
**Secondary:** Work Activity `Assisting and Caring for Others` (id 4.A.4.a.5).
**Rule:** `benevolence = min(100, 0.6 * WV[Relationships] + 0.4 * WA[AssistingCaring])`
**Rationale:** Schwartz Benevolence ("preserving and enhancing the welfare of people with whom one is in frequent contact") maps to O*NET Relationships ("provide service to others; friendly, non-competitive environment") plus the explicit caring activity. **Caveat:** O*NET Relationships partly measures *workplace social climate* rather than caring per se, so this is an approximation; the caring-activity component is added to anchor it toward genuine other-welfare. Validate that caring professions (Social Worker, Nurse, Teacher) score high.

### 4.4 Security — CONFIDENCE: MEDIUM
**Sources:** O*NET Work Values `Working Conditions` and `Support`.
**Rule:** `security = min(100, 0.6 * WV[WorkingConditions] + 0.4 * WV[Support])`
**Rationale:** Schwartz Security ("safety, harmony, and stability of society, relationships, and self") maps to O*NET Working Conditions (which O*NET defines as including job security and stable conditions) and Support (supportive management/stable backing). **Caveat:** O*NET "Support" leans toward *good supervision* more than *safety*; weighted lower than Working Conditions for that reason.

### 4.5 Power — CONFIDENCE: MEDIUM-LOW (weakest mapping)
**Primary:** O*NET Work Value `Recognition`.
**Secondary:** Work Activities `Coordinating the Work and Activities of Others` (4.A.4.b.4) and `Guiding, Directing, and Motivating Subordinates` (4.A.4.b.5), averaged.
**Rule:** `power = min(100, 0.5 * WV[Recognition] + 0.5 * avg(WA[Coordinating], WA[Guiding]))`
**Rationale:** Schwartz Power ("social status and prestige, control or dominance over people and resources") only partially maps to O*NET Recognition ("advancement, potential for leadership, prestige"). Recognition captures the *prestige/status* facet but not the *dominance/control* facet, so leadership/directing activities are blended in to represent control over people. **This is the most constructed of the five mappings — explicitly flag in any external documentation, and validate that managerial roles (Sales Manager, Entrepreneur) score high while service/individual-contributor roles score low.**

## 5. Scaling, missing data, and edge cases

- **Missing O*NET descriptor:** if a required Work Value/Activity is absent for an occupation, the rule uses the available components re-weighted to sum to 1.0; if the *primary* source is missing, the domain is left **null** for that career (not zero — null so matching can renormalize, rather than asserting a false zero).
- **Rounding:** scores rounded to integers 0–100.
- **Approximation-flagged occupations:** careers whose `onet_code` is a documented approximation (Entrepreneur, Digital Marketing Specialist, Video Game Designer — see crosswalk) inherit that approximation; their values profiles carry the same caveat.
- **Output shape:** `values_profile` = `{ achievement, self_direction, benevolence, security, power }` (5 keys; no universalism/hedonism keys).

## 6. Validation status and requirements

This methodology is **NOT yet validated.** Two validations are required before the derived profiles should be treated as defensible:

1. **Empirical sanity-check (pending O*NET API access):** run the rules against ≥5 known-signature careers and confirm outputs match expectation:
   - Social Worker → high `benevolence`, low `power`
   - Sales Manager / Entrepreneur → high `power`, high `achievement`
   - Accountant → high `security`, moderate `achievement`
   - Software Engineer / Data Scientist → high `self_direction`, moderate `achievement`
   - Pharmacist / Nurse → high `benevolence`, high `security`
   If any career scores against intuition, the relevant rule is revised before applying to all 37.

2. **Expert review (recommended before launch):** the conceptual mappings and blend weights in §4 are authored (AI-assisted) constructions, not established psychometric constants. Review by someone with psychometric or careers-guidance credentials would materially strengthen the defensibility of values-based matching to schools. This is a gap, honestly noted, not a blocker for internal testing.

## 7. White-paper disclosure (required language)

The product white paper must disclose:
- The values model uses a **5-domain** subset of the Schwartz framework (Achievement, Self-Direction, Benevolence, Security, Power). Universalism and Hedonism are not measured — the CVQ instrument is reduced to 15 items (5 domains × 3) accordingly.
- Career-side values are **derived from O*NET occupational data** via the documented rules in §4, not from primary measurement of incumbents — i.e. "research-informed," not "empirically validated against job-holder value surveys."
- The 5-domain subset is justified by data-groundability: only domains with a defensible O*NET source are scored.
