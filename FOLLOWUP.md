# Pre-deploy / Follow-up List

Non-blocking items surfaced during Phase 2 security work. **Not security findings.**
Do not block deploy on these, but address before/around release.

## Pre-deploy (operational)
1. **PDF generation needs ~12 system libraries at runtime.** Puppeteer/Chrome
   requires a set of shared libs (libnss3, libatk, libgbm, etc.) on the host.
   The two PDF 500s seen in the C1–H1 integration test were environmental
   (missing Chrome libs in the dev container), downstream of a correctly-passed
   auth gate — not regressions. Confirm the production host installs these or
   the PDF report feature breaks at runtime.

## Required production env vars
2. **`SEED_SCHOOLADMIN_PASSWORD` and `SEED_SUPERADMIN_PASSWORD`** must be set in
   the production environment. The seed (server/seed.ts) no longer hardcodes
   these passwords: if a var is unset, the corresponding account is **skipped**
   (with a warning), not created with a default. Passwords are applied only when
   the account is first created — existing accounts are never reset on deploy, so
   live credential changes are preserved. Set these before the first deploy if
   the schooladmin / superadmin accounts need to be provisioned.

## Functional QA (not security)
3. **Matching service produced 0 recommendations for synthetic profiles.** The
   end-to-end matching output is untested — the gate passes correctly, but
   whether the matcher emits sensible recs for real profiles has not been
   verified. Functional QA, not an access-control issue.

## Product / Scoring-Model Divergences (from white-paper review, 2026-06-14)

These are **not security issues** — they are product-correctness gaps where the
deployed system contradicts the documented design (product white paper). Recorded
for later action; **nothing fixed here.** Each item carries file:line evidence.

1. **[HIGH — premium feature non-functional] Premium CVQ dimension (25% of the
   premium score) silently contributes nothing.** `careers.values_profile` is
   populated for 0 of 37 careers. The engine reads it correctly
   (`server/services/matching.ts:719-723`) but returns `null` when the profile is
   absent; a `null` component is skipped and its weight removed from the
   denominator, so the score is renormalized over the remaining 75% with **no
   error** (`server/services/matching.ts:719-721`, `341-360`). Students complete
   the full CVQ but their values never influence recommendations.
   **Fix is DATA, not code:** populate `values_profile` (Schwartz 7-domain mapping:
   `achievement, benevolence, universalism, self_direction, security, power,
   hedonism`) for all 37 careers. **Mapping quality = feature quality** — this
   needs a deliberate, validated mapping approach, not an unreviewed
   auto-generation. There is no seed writer for `values_profile`; the only writer
   is the manual superadmin career editor
   (`server/routes/superadmin.routes.ts:1814,1849`).

2. **[HIGH — report misrepresents methodology] Per-career scoring breakdown is
   hardcoded, tier-agnostic, and wrong.** The report and Results breakdown render
   a fixed 4 rows "Subject / Interest / Vision / Market Demand @ 30/30/20/20"
   regardless of tier (`client/src/pages/ResultsPrint.tsx:935-939`,
   `client/src/pages/Results.tsx:840-881`). Wrong three ways:
   (a) wrong weights even for free (actual is 35/35/30);
   (b) "Market Demand" is not a real dimension — backed by a deprecated column
       hardcoded to 0 (`server/routes/recommendations.routes.ts:172`);
   (c) for premium it hides RIASEC (35%) and CVQ (25%) — the dimensions that
       drove 60% of the score.
   **Fix:** make the breakdown data-driven from the engine's actual
   `componentScores` per tier. This requires persisting RIASEC/CVQ per-career
   match scores, which are currently not stored as DB columns — see #3.

3. **[MEDIUM-HIGH — schema gap behind #2] RIASEC/CVQ per-career scores are never
   persisted.** The `recommendations` table stores only `subjectMatchScore`,
   `interestMatchScore`, `countryVisionAlignment`, and `futureMarketDemand`
   (`shared/schema.ts:541-545`). RIASEC and CVQ per-career match scores survive
   only inside the free-text `reasoning` string
   (`server/routes/recommendations.routes.ts:154-156`). Fixing the premium report
   (#2) requires adding columns for these.

4. **[LOW — note only] Dormant `wef_skills` calculator.** A full WEF-skills
   calculator exists (`server/services/matching.ts:776-859`) but is never seeded
   as a component or given a tier weight — inactive in all tiers, and not part of
   the white paper. Decide whether to wire it up or remove it.

5. **[LOW — cleanup] Deprecated `recommendations.future_market_demand` column**
   (always 0) should be removed once the report template (#2) no longer references
   it.

### Confirmed CORRECT (do not re-investigate)
- **Scoring-engine weights match the white paper exactly.** Free 35/35/30;
  premium RIASEC 35 / Subject 20 / Vision 20 / CVQ 25
  (`server/seed.ts:1883-1905`, `server/services/tierWeights.ts:13-40`).
- **Free → premium upgrade preserves and re-scores assessment data in place** —
  the assessment row is upgraded, not replaced; no orphaning.
- The scoring **math is faithful to spec.** Only the values-data (#1) and the
  report templates (#2) diverge.
