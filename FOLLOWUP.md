# Pre-deploy / Follow-up List

Non-blocking items surfaced during Phase 2 security work. **Not security findings.**
Do not block deploy on these, but address before/around release.

## Deferred / triage

### PDF omits grade-branch action steps  (severity: medium — product decision)
The grade-branched "Next Steps" (explore/narrow/apply bands from generateEnhancedActionSteps) render ONLY on the on-screen report (Results.tsx). ResultsPrint.tsx (the Puppeteer PDF) fetches premiumActionSteps in its payload but never renders them — grep-confirmed no action-step reference in the file. Since the PDF is the parent-shareable artifact and grade-tailored steps are the feature's payoff, this may be an unintended gap. DECISION NEEDED: is the PDF meant to include action steps? If yes, adding the block is a scoped change requiring its own Chrome 150 PDF verification. Verified on-screen for grades 12 (Band 3) and 10 (Band 2) on 2026-07-06.

### getRecommendationsByAssessment has no ORDER BY  (severity: low — latent)
storage.ts (~965–969): bare select().from().where(eq(assessmentId)) with no ORDER BY. Insertion is best-match-first, but Postgres doesn't guarantee row order without ORDER BY, and the PATCH re-run does delete→re-insert (recommendations.routes.ts:147), so heap reuse can reorder. Harmless TODAY because the only consumers relying on order (the hoisted Work Style / Strengths panels via .find()) read career-NEUTRAL fields, so which row wins doesn't matter. Becomes a real bug the moment anything relies on recommendations[0] being the top match, or .find() on a career-SPECIFIC field. Fix: add explicit ORDER BY (e.g. overallScore desc) to the query. Would need verification against a PATCH re-run.

### Local dev blocked — missing env secrets  (severity: low — dev ergonomics)
npm run dev fails: .env in Codespaces has only DATABASE_URL. Server validation also requires SESSION_SECRET, SUPERADMIN_EMAILS, DB_ENCRYPTION_KEY. SESSION_SECRET and SUPERADMIN_EMAILS can be dev-appropriate values; DB_ENCRYPTION_KEY MUST match the Render literal exactly or the app cannot decrypt api_credentials (do NOT generate a fresh one). Until populated, local render testing isn't possible — verification has to go through deploy-to-Render. Non-blocking but costs a deploy cycle per UI check.

### CSP blocks an inline event handler on report page  (severity: medium — needs investigation)
On the results page (results?assessmentId=…), console shows: inline event handler violates CSP directive script-src-attr 'none' — "The action has been blocked." Something on the report is using an inline handler (onclick=… in markup, or an inline javascript: nav) that the policy blocks, so that action silently does nothing. Pre-existing, unrelated to the masonry fix. Find the inline handler on Results.tsx (or a child) and convert it to a proper React handler / addEventListener, OR adjust CSP if the handler is legitimate and safe. Identify what interaction is broken before deciding. First observed 2026-07-06.

## Session log

### Arabic PDF report — session 2026-06-30

DONE + VERIFIED:
- PDF download concurrency fix (d562a65 + i18n f74c530): fetch-and-blob download with in-flight guard; button disables + spinner during generation; accurate success/error toasts (replaced the old always-"started" toast that lied on failure). Fixes repeated-click → "site wasn't available" (each click had spawned a concurrent Puppeteer/Chrome → Render OOM). Verified: single click works, double-click blocked, valid PDF lands.
- Arabic PDF LABELS now render Arabic (real fix: 3b6720d). ROOT CAUSE: /print/results is wrapped in LanguageProvider, which in the headless context (no session → user=null, no localStorage) initialized to "en" and STOMPED the print page's changeLanguage("ar") back to en (React runs child effects before parent). Data was Arabic (driven by ?lang param directly) but t() labels followed i18n's active language = en. FIX: LanguageContext.getInitialLanguage() now honors ?lang from the URL as top priority, SCOPED to pathname.startsWith("/print") so it can't affect normal app routes. Verified in production via incognito (no localStorage/session = same blank context as Puppeteer): all labels render Arabic, country line clean.
- IMPORTANT history note: TWO earlier fixes (7cdf258 readiness-gate, d761b45 decouple-namespace-from-narratives) were aimed at a WRONG hypothesis (i18n bundle load-timing race). Both passed tsc, both FAILED in production, because the bundle was never the problem — the provider was resetting the active language. The misleading timing scaffolding was reverted in dd46af6 (kept only the 28s safety-net value as an independent good fix: client backstop now sits below server's 30s waitForFunction). Lesson logged: verify the ACTIVE state at capture (the PDF showed complete correct English, not key-fallbacks = en bundle ACTIVE, not missing) before assuming a timing/loading cause.

STILL OPEN (Arabic report quality):
- Bug B — RTL career-page layout (dense career pages, were PDF pages 4/6/8). TWO sub-problems:
  (1) OVERFLOW/bleed across page breaks — FIX COMMITTED (3a1d263) BUT NOT YET VERIFIED. min-height:100vh→auto, break-inside:avoid on .career-card-print, grid h-full→h-auto. FIRST ACTION NEXT SESSION: download a real Arabic PDF and check the dense career pages (were 4/6/8) render with clean breaks and no overlap. Print CSS looks-right-renders-wrong — do NOT mark this done until seen in an actual PDF. If still broken, iterate.
  (2) BIDI scrambling of mixed LTR/Arabic runs — STILL OPEN, untouched (lines ~436-448: [dir=rtl] .flex{direction:rtl} + blanket text-align:start reorder inline runs; English tokens scramble against Arabic; entangled with leak b). Needs its own focused pass with unicode-bidi:isolate/dir=auto/bdi protection.
- Literal ** markdown still renders on labels ("**أسلوب التعاون الجماعي:**" etc.) — parked, decided approach is <strong> restructure not a parser.
- Leak (b): subject names + skill terms render English in Arabic reports (English/Social Studies/Project Management/Research) — no AR localizer exists for these. Content/data task, parked.

NEW (report content quality — raised by product owner 2026-06-30, NOT yet scoped):
- Action steps are NOT age/grade-aware: same plan ("this month watch day-in-the-life videos, in 3 months do an informational interview, in 6 months excel in [subject]") regardless of whether student is Grade 8 or Grade 12. Inappropriate for younger students (audience is 13-18). Same root cause class as the narrative duplication: static templates ignoring student data (here, grade). Tracked as a real content bug, not polish.
- Narrative duplication (Work Style Fit / Personal Strengths identical across all 5 careers) — still open, the big Phase 2 design call (career-aware templates vs LLM-generate).
- Report length: 9 pages, too long/dense for a teenager — report-redesign workstream, parked.
- Open design question: should the 6 Holland personality types show percentages? (vs keeping description-only to avoid adding density to an already-long report) — product decision, undecided.

### Report redesign — started 2026-06-30 (workstream, multi-part)

Content audit done (premium + free). Key findings:
- PREMIUM problem = REDUNDANCY: Work Style Fit + Strengths/Growth are student-level content (generateWorkStyleFit/generateStrengthsGrowth in premiumNarratives.ts) printed identically ×5 careers — the main length driver. Only "Why This Career" is genuinely career-specific.
- FREE problem = THIN/RAW (opposite of premium): no duplication; instead "Why This Career" was a raw debug blob ("Subject Match (35%): 72.3% - ...") + 2 boilerplate action steps. No values/personality narrative.
- Per-tier WEIGHTS (authoritative, tierWeights.ts:13-40, validated sum=100): free/basic = subjects 35 / interests 35 / vision 30 (no riasec/cvq). premium = subjects 20 / vision 20 / riasec 35 / cvq 25 (interests 0). "Meaningful per weights" = free should foreground subjects+interests+vision; premium should foreground riasec(35)+cvq(25).
- Neither tier explains weights in prose; neither branches content on grade (LLM has {{gradeLevel}} var, DB-prompt usage unconfirmed).

REDESIGN PLAN (do as separate verified commits):
1. [DONE-CODE, UNVERIFIED] Free "Why This Career": replace debug blob with real heuristic prose — commit 772ebaa. Reuses generateEnhancedReasoning at GET time (self-trims to 3 paragraphs without riasec/cvq), zero LLM cost, language-aware (Arabic on ?lang=ar), populates premiumReasoning field (both renderers read it, no render changes), stored reasoning blob untouched (audit trail). Also covers premium-missing-RIASEC fall-through. NOT covered: the premium catch path (:408-412) still returns raw blob — deliberate (adding generation to a just-failed error path is riskier; rare case). MUST VERIFY: needs a FREE assessment (Khalid is premium) — check prose renders in EN and AR. Not yet seen.
2. [PENDING — approved] Premium: relocate Work Style Fit + Strengths/Growth OUT of per-career cards INTO the student profile section, shown ONCE. Kills duplication, cuts length, likely resolves Bug B overflow. The big structural win.
3. [PENDING] Premium: trim "Why This Career" from 5 paragraphs to ~2.
4. [PENDING] Both: grade-branch the action steps (Grade 8 ≠ Grade 12 guidance). Free's 2 boilerplate steps also need rebuilding.
5. [PENDING] Both: tie narrative to weights in prose.

### CVQ 5-domain reset — DONE (this session)
Shipped and verified-in-code; ONE manual verification step remains (see below).
- Seed cut 21→15: dropped universalism + hedonism. Commit 94cef84.
- Report display refactor: shared CVQ_DOMAINS constant in shared/schema.ts, imported into Results.tsx + ResultsPrint.tsx; all 6 value-display call-sites now filter to the 5 valid domains; Top-3 slice-before-filter bug now structurally impossible. Commit 58c988a.
- Prod data reset (transactional, committed): deleted 1 cvq_results row, nulled 1 assessments.cvq_scores, removed 6 retired cvq_items (21→15). Confirmed all test data only — no real users (4 users all test, 7 guest assessments, only 1 had CVQ data).

#### PENDING — resume here next session
1. END-TO-END VERIFICATION — DONE: log in as org_student test account, take CVQ fresh. MUST present 15 questions / 5 domains (no U/H). Check on-screen report (Top-3 = 3 real cards, All-Values = 5 sorted desc, no U/H) AND downloaded PDF (ResultsPrint has independent copies). Confirm Render deployed 58c988a before testing or you'll see stale 7-domain output.
   - VERIFIED via PDF (career-report 23f6008e, student Khalid): page 2 shows exactly 5 domains (Security 92, Achievement 83, Benevolence 83, Power 75, Self-Direction 75), Top-3 = 3 real cards no blanks, no universalism/hedonism. CVQ 5-domain work COMPLETE. Throwaway .cjs scripts still pending deletion.
2. Throwaway .cjs scripts in working tree need deleting (check_*.cjs, cvq_reset_*.cjs, del_joud*.cjs). Untracked — safe to rm.

#### SECURITY — done, but verify
- Prod DB password (neondb_owner) was rotated this session after being exposed. Endpoint is now the -pooler variant: ep-floral-rice-astfwiew-pooler. Updated in: Neon, Render env, local .env. CONFIRM .env is gitignored and was never committed.

#### Still parked (unchanged from before)
- Individual-tier lock; PDF length/narrative redesign (decide-first session); nav bugs (Quiz Back, Career Personality Back); admin-flow QA; dependency vulns (10: 4 high/4 mod/2 low — npm reports 0, Dependabot tracking); RESEND_API_KEY not set in prod; Arabic RTL audit; branch protection unfinished.

## CRITICAL — found during CVQ verification (2026-06-29)

### Career-card component breakdown is stale + not tier-aware (ROOT-CAUSED 2026-06-29)
Root cause confirmed via full read-only trace. NOT a scorer/lexicon/data bug.
- The card (Results.tsx:931-970) and PDF (ResultsPrint.tsx:932-952) each render a hardcoded 4-component list — Subject/Interest/Vision/Market at 30/30/20/20 — that predates the RIASEC/CVQ premium model. Not tier-aware.
- recommendations table stores only 4 legacy score columns (subjectMatchScore, interestMatchScore, countryVisionAlignment, futureMarketDemand=hardcoded 0). No columns for per-career riasec/cvq/wef.
- Per-career RIASEC + CVQ scores ARE computed and vary per career (matching.ts:610-739, pushed to componentScores[] at 345-351) but are persisted only baked into the free-text `reasoning` blob — no structured field.
- Result for premium (e.g. Khalid 23f6008e): card shows Interest 0% (never collected — free-tier component) and Market 0% (deprecated), and OMITS RIASEC (35%) + CVQ (25%) = 60% of the actual score. Displayed bars cannot reconstruct overallMatchScore. Confirmed arithmetically impossible: Lawyer overall 62.2 with subject 71.7/interest 0/vision 40/market 0.
- overallMatchScore math itself is CORRECT (matching.ts:353-360, tier weights, null components excluded from denominator). Market Demand does NOT deflate scores. The bug is display + persistence, not scoring.

### Phase 1 — DONE + VERIFIED (2026-06-29)
Career-card breakdown bug closed end-to-end: storage → write path → backfill → render.
- Schema: component_breakdown jsonb column added to recommendations + applied to prod (fe8b327).
- Write path: persists componentScores[] {key,displayName,score,weight} on insert (bc910e3).
- Backfill: all 40 existing rows backfilled from parsed reasoning blob, dual-verified (derived-overall vs stored overall within 0.5; parsed legacy components vs legacy columns within 0.15), single transaction. 30 basic = 3 components, 10 premium = 4.
- Render: both Results.tsx + ResultsPrint.tsx read component_breakdown via shared client/src/lib/componentBreakdown.ts (key->{labelKey,Icon} map); tier-aware, stored order, no hardcoded weights (d80b177). New i18n keys: riasecMatch, valuesMatch, futureSkillsShort (en+ar).
- VERIFIED via fresh PDF (Khalid 23f6008e, post-deploy): premium card shows Subject 20% / Vision 20% / Personality 35% / Values 25%, summing to 100% and reconstructing the 62% overall. No dead Interest/Market rows. Per-career RIASEC/CVQ values vary correctly across careers. Basic tier shows its 3-component set.

### PDF DOWNLOAD FAILING (NEW 2026-06-29, root-caused, NOT fixed) — HIGH PRIORITY
Symptom: clicking "Download PDF Report" (server Puppeteer route, NOT browser print) repeatedly yields multiple downloads all reading "site wasn't available". Server route: GET /api/recommendations/pdf/:assessmentId (recommendations.routes.ts:456-662).
FIRST STEP NEXT SESSION (no code): open a failed career-report-*.pdf in a TEXT editor, read first bytes — HTML "site wasn't available" = platform OOM/crash (cause #1); JSON {"message":"Failed to generate PDF report"} = route 500 (Chrome missing / waitForFunction timeout / SESSION_SECRET unset).
Ranked causes (cc diagnosis): (1) Unbounded concurrent Puppeteer — no rate-limit on route :456, no client debounce (Results.tsx:408), each click = a full Chrome process; rapid clicks OOM the Render instance → platform error page saved as .pdf. STRONGEST FIT for "repeated clicks + site unavailable." (2) Public-host self-loopback https://${req.get('host')} :516 fragile vs admin's localhost path; goto lands on error page → 30s waitForFunction timeout. (3) Chrome absent at runtime — no PUPPETEER_CACHE_DIR/install-relocate, Render cache may not persist build→runtime → launch throws. (4) Empty LLM cache makes headless render do live per-career LLM calls → exceeds 30s waitForFunction. (5) SESSION_SECRET possibly unset post-rotation → mintPrintToken throws.
IMMEDIATE MITIGATION TO TEST FIRST: click download ONCE and wait (don't spam). If single click works, confirms cause #1 → fix = client in-flight guard + server concurrency lock/rate-limit.

### PLANNED — Phase 2 (parked, two scoped investigations, each starts read-only)
A. Claude API narrative prompt rewrite: diagnose why "Why This Career?" strengths/work-style are word-for-word identical across careers (likely insufficient per-career context or generic prompt). Find prompt, audit per-career context passed, fix duplication. Also fix markdown rendering literally in PDF (**bold** showing asterisks).
B. Country-vision data model for expansion beyond UAE: determine whether countries table holds structured, prompt-ready per-country vision/mission usable by BOTH the Vision Alignment scorer AND the narrative prompt, or whether UAE is hardcoded/thin. If thin, expansion = content-modeling project, not a prompt tweak. Size unknown — scope before committing.
NOTE (confirmed in same PDF): the two Phase-2 report-quality issues are visible and unfixed by Phase 1, as expected — (1) "**Team Collaboration:**" / "**Your Core Strengths:**" markdown renders literally (asterisks shown), (2) "Why This Career?" Work Style Fit + Personal Strengths blocks are word-for-word identical across all 5 careers. Both are Phase 2 (narrative prompt + markdown rendering).

### Phase 2 progress (2026-06-29)
- DONE: Bilingual leak (a) — ?lang now honored across all 3 narrative resolution sites (enrich, career-reasoning, education_pathways) so authenticated users get fully-language-consistent reports (b046d91). VERIFIED via Arabic PDF (Khalid 23f6008e): Work Style Fit / Strengths / Action Steps / Education Path all render in Arabic.
- DONE: buildStudentContext field bugs fixed — LLM "Why This Career?" now receives real favoriteSubjects + cvqTop3 instead of empty (c49d25b). VERIFIED: Arabic narrative correctly names English/Social Studies + security/achievement/benevolence.
- NOTE: Accept-Language fallback for header-only-no-?lang guests now resolves to "en" (intentional — consistency across 3 sites; client always sends ?lang so unreachable in-app). Recorded so it's not rediscovered as a bug.

Still-open Phase 2 items:
- Markdown ** strip/restructure on template labels (premiumNarratives.ts, both en+ar branches) — NOT done. Decided approach: keep bold via <strong> restructure (label as separate field), not a parser, not a plain strip.
- Narrative DUPLICATION (the big one): Work Style Fit / Personal Strengths / Action Steps are student-level templates, word-for-word identical across all careers — CONFIRMED still duplicated in latest PDF (the buildStudentContext fix only improved the LLM "Why This Career?" section, NOT these static templates). Design decision pending: make templates career-aware vs LLM-generate (cost/latency tradeoff — LLM adds 1-2 calls/career/language).
- Leak (b): subject names render raw English in Arabic reports (Results.tsx:515) — needs AR subject labels. Confirmed in PDF (English/Social Studies/Legal Research show in English within Arabic text).
- Phase 2 item B: country-vision data model for expansion.

### Demographics save bug — UNCONFIRMED, reconcile first
User reported name/grade/gender not saving from basic-info form. But PDF 23f6008e shows all populated (Khalid / Grade 12 / Male / Age 15). Possible the bug was on a different student, already fixed, or form-vs-PDF read from different sources. Confirm whether reproducible before fixing.

### Add-student form missing age field
User reports the org add-student form doesn't capture age. assessments.age column exists. Decide whether age belongs at student registration or assessment time before adding.

## BUG — PDF report is empty for authenticated users (org_students); needs auth-aware print rendering

**Status:** investigated 2026-06-23, not yet fixed. Do this as one coupled piece of work (PDF auth fix + student basic-info block). Distinct from the "PDF needs ~12 system libs" pre-deploy item below — that is environmental; this is an auth/data bug.

### Bug
The PDF download produces an **empty report** — only the i18n title ("Your Career Pathways!") and subtitle render; all dynamic content (subject strengths, values, career matches) is missing. Affects **authenticated users — including org_students, the primary user base**. **Guest PDFs work** (their token is passed in the print URL). On-screen `/results` renders fine for everyone.

### Root cause
Server-side Puppeteer generates the PDF:

1. `GET /api/recommendations/pdf/:assessmentId` — `server/routes/recommendations.routes.ts:440` — launches headless Chromium and loads `/print/results?assessmentId=…[&guestToken=…]&lang=…` (line 521) in a **fresh browser with no session cookie**.
2. For an **authenticated** assessment, `assessment.guestSessionId` is `null`, so **no token is appended** to the print URL:
   `recommendations.routes.ts:505` → `const guestTokenParam = assessment.guestSessionId ? \`&guestToken=…\` : '';`
3. `ResultsPrint.tsx` then calls the data APIs (`/api/recommendations`, `/quiz`, `/cvq/result`, the assessment fetch) with **neither a session cookie nor a guest token**.
4. The ownership check returns an **empty array, not an error** — `recommendations.routes.ts:246-255`:
   ```ts
   if (assessment.userId) {
     owns = req.isAuthenticated() && req.user?.userId === assessment.userId; // false in headless browser
   } ...
   if (!assessment || !owns) return res.json([]);   // empty array
   ```
5. In `ResultsPrint`, the title/subtitle come purely from i18n so they render; **every data-gated section renders empty**. The "normal" ready signal requires `recommendations.length > 0` so it never fires — the **20-second safety-net timer** (`ResultsPrint.tsx:291-308`) flips `window.__REPORT_READY__ = true` and Puppeteer **captures the blank page** (also explains the ~20s generation time).

### Fix (recommended)
Mint a **short-lived, single-assessment signed token** server-side in the PDF route, append it to the print URL, and verify it on the data routes the print page calls. **Scope the token to ONE `assessmentId`** so it cannot read any other assessment. Works for both authenticated and guest assessments and does **not** widen the existing guest-token surface.

### Also do together (coupled): student basic info on report page 1
Add the student's basic info — **name, age, grade, gender** — to the first page of the report. It must render in **BOTH** the on-screen `/results` page **and** the PDF. Depends on the PDF auth fix landing first; otherwise the basic info also comes out empty in the PDF (same unauthenticated-fetch root cause).

### Test plan (when built)
- Authenticated org_student PDF contains full content (subject strengths, values, career matches, and the new basic-info block).
- Guest PDF still works.
- A token scoped to assessment A **cannot** fetch assessment B's data.
- PDF generation **no longer takes ~20s** — i.e. the real ready signal fires, not the safety-net timer.

## Pre-deploy (operational)
1. **PDF generation needs ~12 system libraries at runtime.** Puppeteer/Chrome
   requires a set of shared libs (libnss3, libatk, libgbm, etc.) on the host.
   The two PDF 500s seen in the C1–H1 integration test were environmental
   (missing Chrome libs in the dev container), downstream of a correctly-passed
   auth gate — not regressions. Confirm the production host installs these or
   the PDF report feature breaks at runtime.

4. **Dependency vulnerabilities (npm audit / Dependabot) need a pre-launch
   review.** The production build reports "3 vulnerabilities (1 moderate, 2 high)"
   (`npm audit`, seen in the Render deploy log 2026-06-22), and GitHub Dependabot
   flags 5 (2 high, 3 moderate) on `main` — Dependabot also scans transitive/dev
   paths that `npm audit` may not surface. **Pre-launch:** run `npm audit`,
   identify the 2 highs, determine whether they sit in reachable/exploitable
   runtime paths (vs dev-only/transitive), then patch (`npm audit fix` or a
   targeted bump) or dismiss-with-documented-reason. **Separate from the earlier
   "npm-audit-clean" note — that note has drifted.** Pre-launch, not blocking dev.

## Required production env vars
2. **`SEED_SCHOOLADMIN_PASSWORD` and `SEED_SUPERADMIN_PASSWORD`** must be set in
   the production environment. The seed (server/seed.ts) no longer hardcodes
   these passwords: if a var is unset, the corresponding account is **skipped**
   (with a warning), not created with a default. Passwords are applied only when
   the account is first created — existing accounts are never reset on deploy, so
   live credential changes are preserved. Set these before the first deploy if
   the schooladmin / superadmin accounts need to be provisioned.

5. **`RESEND_API_KEY` not set in production.** The Render deploy log shows
   "Optional environment variables not set: RESEND_API_KEY — Some features may be
   unavailable." Resend powers email (password resets, notifications).
   **Pre-launch:** confirm whether email is needed at launch; if yes, set
   `RESEND_API_KEY` in the Render env (and verify password-reset and any
   notification flows actually send). If email is intentionally deferred, document
   that and confirm no launch-critical flow silently depends on it — **especially
   password reset.**

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
   **Fix is DATA, not code:** populate `values_profile` for all 37 careers on the
   **clean-5** Schwartz subset — `achievement, self_direction, benevolence,
   security, power`. (Universalism and Hedonism were dropped — no defensible O*NET
   grounding; see methodology §2.)

   **Methodology is now BUILT and committed** (this item previously read "needs a
   deliberate, validated mapping approach, not an unreviewed auto-generation" — it
   now exists):
   - `docs/VALUES_PROFILE_DERIVATION_METHODOLOGY.md` (v2) — O*NET v2.0 **Work
     Styles**-based derivation, rebuilt because the O*NET **Work Values endpoint
     was removed** (`…/details/work_values` → HTTP 404 on `api-v2.onetcenter.org`).
   - **Validated** for discriminant validity across 5 known-signature careers
     (Social Worker, Sales Manager, Accountant, Software Engineer, Pharmacist).
   - Tooling committed: `scripts/onet_fetch_cache.py` (rate-limit-safe cache fetch)
     + `scripts/compute_profiles.py` (offline compute; emits SQL `UPDATE`s).

   **Remaining work is now just EXECUTION:** when the O*NET API rate-limit cooldown
   clears, run fetch-cache → compute → review the table → run the emitted `UPDATE`s
   to populate `values_profile` for all 37 careers. Identity-check the DB first
   (`git remote -v`) per established practice.

   **Honest caveats remain:** not validated against ground-truth Schwartz scores
   (none exist per-occupation); blend weights are authored, not psychometric
   constants; expert psychometric review recommended pre-launch.

   There is no seed writer for `values_profile`; the only pre-existing writer is the
   manual superadmin career editor (`server/routes/superadmin.routes.ts:1814,1849`)
   — the compute script's SQL `UPDATE`s populate it directly instead.

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

## PARKED / FUTURE WORK

### Admin/superadmin panel has no language switcher — product decision needed
- The admin/superadmin panel header has NO EN/AR language switcher (student-facing pages do). The panel renders in Arabic but offers no toggle. UNDECIDED whether this is intentional (admin tool = single-language by design) or an oversight (should be bilingual). Needs a product decision before any action. Low priority — internal tool, not student-facing. If bilingual is wanted, check whether LanguageProvider/the switcher component is simply absent from the admin layout vs. deliberately excluded.

### Free→Premium additive upgrade flow — scoped, not started

PROBLEM (conversion gap, confirmed by audit 2026-06-30): Account tier (users.isPremium) and assessment tier (assessments.assessmentType) are DECOUPLED and never auto-sync. After a free user PAYS: account flips premium, but their assessment stays 'basic', so they STILL see their free report. Post-payment they're dropped on home (Checkout.tsx:134-143) with NO prompt/CTA/route to complete premium. The current premium assessment flow is a fixed 7-step from-scratch ladder (Assessment.tsx:963-1112) that re-collects demographics/subjects/country/quiz and POSTs a NEW record — ignoring their existing free assessment (resume logic skips completed assessments). Data isn't lost (free assessment survives as orphaned history) but nothing carries forward.

WHY a free assessment can't just "become" premium: premium scoring is 60% RIASEC+CVQ (tierWeights: subjects20/vision20/riasec35/cvq25), data a free assessment never collected. So upgrade NECESSARILY requires collecting RIASEC+CVQ — it's missing data, not a flag flip.

CHOSEN APPROACH: additive "complete your premium profile" flow — after payment, guide user to complete ONLY RIASEC+CVQ, PATCHed onto their EXISTING free assessment (preserving subjects/interests/vision), then re-score to premium. Framed as "finish your profile," not "retake."

SCOPE (audit verdict):
- SERVER ~80% ready, NO new scoring logic: storage.updateAssessment is partial-merge (preserves free fields, storage.ts:931-938); PATCH with riasecResponses recomputes riasecScores + sets type premium (assessment.routes.ts:299-303); cvqResponses flips type (309-310); re-score endpoint exists (POST /api/recommendations/generate/:id reads riasecScores + cvq_results).
- CLIENT = the build. Three pieces: (1) post-payment CTA/route "Complete your premium profile" (none exists); (2) a SECTION-SCOPED flow running ONLY RIASEC+CVQ (today's flow is all-or-nothing from step 1; requires a seeded assessmentId before Quiz/CVQ steps); (3) adopt the existing free assessmentId so PATCH + CVQ-submit + generate all target it (resume logic currently ignores completed assessments so the id is never seeded).
- CRITICAL NUANCE: CVQ is a DUAL-WRITE — it persists via POST /api/cvq/submit keyed to assessmentId (CVQStep.tsx:137-155, cvq.routes.ts:48,120), NOT through the assessment PATCH (PATCH's cvqResponses only flips type). The additive flow must point /api/cvq/submit AND /api/recommendations/generate at the existing assessment id, not just the PATCH. Missing the CVQ-submit → premium assessment with no values data → lands in the premium-missing-data fall-through branch.
- RELATED latent bug (flag): a CVQ-only submission can set type 'premium' WITHOUT riasecScores (assessment.routes.ts:309-310), reaching the premium-missing-RIASEC fall-through (the branch we gave heuristic prose to in 772ebaa). Real path, low frequency.

PAYMENT-ADJACENT: half-built states (paid account, no completion path) are worse than current. Build as its own focused session with verification, NOT tacked onto other work.

### Persist componentScores array on recommendations (data-driven persistence) — READY TO BUILD

**STATUS: PARKED / READY TO EXECUTE — documentation only, do not implement now.**
Foundational plumbing that unblocks the data-driven report breakdown (the #2 /
"Per-career scoring breakdown is hardcoded" item above). Additive, low-risk.

**WHY:** The scoring engine (`server/services/matching.ts`) is fully data-driven —
`calculateCareerMatch` builds a `componentScores` array
`[{key, displayName, score, weight, reasoning}]` for whatever components are active,
plus an `appliedConfigVersion` hash. But persistence collapses this to flat columns:
`server/routes/recommendations.routes.ts:167-172` pulls only subjects/interests/vision
into flat fields and hardcodes `futureMarketDemand: 0 // Deprecated, always 0`. RIASEC,
CVQ, and `wef_skills` scores are **COMPUTED but DROPPED at insert.** This blocks the
data-driven report breakdown (#2 above), which needs the per-career component scores.

**THE CHANGE (additive only — do NOT remove existing flat columns; the live report
still reads them):**
1. **Schema** (`shared/schema.ts`, `recommendations` table ~line 540): add two
   **NULLABLE** columns:
   - `componentScores: jsonb("component_scores")` — the full
     `[{key,displayName,score,weight,reasoning}]` array.
   - `appliedConfigVersion: text("applied_config_version")` — config hash for
     auditability.
2. **Migration** (`server/migrations/`): new numbered file, `ADD COLUMN` both nullable.
   Additive, no backfill, no downtime. **REVIEW the SQL before running against prod.**
3. **Insert** (`server/routes/recommendations.routes.ts` ~line 167, the
   `createRecommendation` mapping): add `componentScores: match.componentScores` and
   `appliedConfigVersion: match.appliedConfigVersion` to the insert object. **KEEP all
   existing flat fields** (`subjectMatchScore` etc.) unchanged.
4. **Verify:** run a fresh assessment, confirm a new recommendation row has
   `component_scores` populated with the full array (including the `riasec` entry), and
   that flat fields still populate as before.

**DISCIPLINE:** additive only; review migration before prod; verify in DB not just
script output; identity-check the Codespace/DB first (`git remote -v`) per established
practice.

**NOTE:** Foundational plumbing — **no user-visible change** until the data-driven
report rebuild (#2 above) consumes `componentScores`. It unblocks the **RIASEC row
immediately** (RIASEC score is computed today); the **CVQ row additionally needs
`careers.values_profile` populated** (O*NET-gated — see #1 and the CVQ items above).

**ALSO captured:** `futureMarketDemand` is confirmed deprecated (hardcoded 0 at
`recommendations.routes.ts:172`). In the eventual report rebuild / cleanup (tracked as
#5 above), that column should be made nullable or removed, and the "Market Demand" row
dropped from templates.

### Scoring-framework representation for the white paper (documentation artifact)

**TASK:** Create a scoring-framework representation for the white paper, in TWO forms:
- **(a)** a **pie chart per tier** showing each scoring dimension and its weight %.
- **(b)** a **complete table**: each dimension | its weight per tier | what it
  captures (the construct) | how it's measured (student side) | source/grounding
  (e.g. Holland/RIASEC, Schwartz PVQ-40, O*NET, UAE priority sectors, WEF 16).

**DIMENSIONS to represent** (per the verified model):
- **Subject Competency** (UAE curriculum quiz) — free **35%** / premium **20%**
- **Interest Match** (8 domains) — free **35%** / premium **0** (replaced by RIASEC)
- **Country Vision Alignment** (UAE priority sectors) — free **30%** / premium **20%**
- **RIASEC / Holland Code** — premium **35%** — Holland model, optionally O*NET-grounded
- **Personal Values (CVQ)** — premium **25%** — Schwartz PVQ-40, **ADAPTED 7-DOMAIN
  SUBSET (not full 10)**
- **WEF 16 Skills** — **STATUS PENDING DECISION** (see dependency below)

**DEPENDENCY — do not finalize until resolved:** whether WEF 16 becomes a *scored*
dimension (and at what weight, in which tiers) is an **OPEN product decision**. The
framework table/chart content depends on that decision. If WEF stays informational,
it appears as a tracked-but-unweighted layer; if scored, weights for all dimensions
must be re-balanced to sum to 100% per tier and the chart updated accordingly.

**Bundle with documentation pass:** this framework artifact and the white-paper
rewrite (7-of-10 Schwartz disclosure, RIASEC sourcing language, repositioning around
longitudinal skills development) should be done together as one documentation pass.

### CVQ instrument reduction to 5 domains (15 items) — GATED on empirical validation

**STATUS: PARKED / GATED — do not execute now.** This documents a future,
coordinated change that is **BLOCKED** on a prerequisite. Documentation only.

**GATE (do not execute until this is met):** the values_profile derivation
methodology (`docs/VALUES_PROFILE_DERIVATION_METHODOLOGY.md`) must first pass
empirical validation per its **§6.1** — i.e. the 5-domain O*NET derivation must be
run against **≥5 known-signature careers** and confirmed to produce sensible
profiles. Only after the 5-domain model is empirically confirmed should the
student-side CVQ instrument be reduced. **Reason:** changing the student
questionnaire before validating that 5 domains work risks editing the instrument
around a number that may still move.

**SCOPE (when unblocked, the coordinated change is):**
1. **Seed (`cvq-seed.ts`):** remove the 6 items CVQ-U1/U2/U3 (universalism) and
   CVQ-H1/H2/H3 (hedonism). 21 items → 15 (5 domains × 3).
2. **Scoring (`server/services/matching.ts` and CVQ aggregation):** ensure
   `cvqScores` aggregates over 5 domains, not 7. Check nothing hardcodes 7 domains
   or expects universalism/hedonism keys.
3. **Results display (`ResultsPrint.tsx` / `Results.tsx` CVQ section):** drop
   universalism/hedonism from any student-facing values profile view.
4. **Existing student data:** students who already completed the 7-domain CVQ have
   stored universalism/hedonism scores — confirm the reduced scoring path does not
   break on their presence (those scores simply stop being read).

**DEPENDENCY NOTE:** this is part of the same "clean-5" decision as the
values_profile derivation. The career-side (values_profile population) and
student-side (this CVQ reduction) must end up on the same 5 domains.

### Report shows OLD 7-domain values model — scoped 2026-06-26 (data/persist fix, NOT display-only)

**STATUS: PARKED / READY TO SCOPE — documentation only, do not implement now.**
The PDF "Your Complete Values Profile" still shows the OLD 7-domain Schwartz model
(Achievement, Benevolence, Universalism, Self-Direction, Security, Power, Hedonism),
and "Top 3 Core Values" surfaced Power 75% / Hedonism 75% / Security 75% — including
Hedonism, which should not exist in clean-5. This is the **report-side manifestation**
of the same clean-5 work tracked in the **"CVQ instrument reduction to 5 domains
(15 items)"** section directly above; that section is the upstream instrument change,
this entry adds the precise root cause + a report-display bug found while investigating.

**ROOT CAUSE.** The CVQ seed (`server/cvq-seed.ts`) still has **21 items across 7
domains, all `version: '1.0.0'`** (3× each: achievement, benevolence, hedonism, power,
security, self_direction, universalism). `getCvqItems()` (`server/storage.ts:1566`)
returns **all active items with no version pin**, and `POST /api/cvq/submit`
(`server/routes/cvq.routes.ts:76-104`) scores against whatever domains those items
carry. So **every scored assessment stores 7-domain `normalizedScores` incl.
Universalism + Hedonism**. The report faithfully displays that old 7-domain data:
- Reads `cvqResult.normalizedScores` from `GET /api/cvq/result/:assessmentId` →
  `storage.getCvqResultByAssessmentId` → `cvq_results.normalized_scores`.
- Top-3 / What-this-means SORT the live scores object (data-driven) — so Hedonism
  surfaces from the data.
- "All Values" list iterates a **hardcoded 7-row `domainNames` scaffold**
  (`Results.tsx:627-635`, `ResultsPrint.tsx:684-692`) rendering `scores[domain] || 0`,
  so it always draws 7 rows regardless of data.

Assessment **0aba7a3b holds genuine 7-domain data (not a default)** — "tied at 75%"
= raw 12/15 = avg 4/item, normal real scores. (Confirm with the script below.)

**FIX — must be done in this ORDER (NOT a display-only swap):**
1. **Reduce the CVQ seed 21→15** (drop the 6 Universalism + Hedonism items) so NEW
   assessments store clean-5. *(Same change as the "CVQ instrument reduction"
   section above — keep them in sync.)*
2. **Migrate / re-score EXISTING completed assessments**, or they retain 7-domain
   data (this is why 0aba7a3b still shows the old model).
3. **Trim the hardcoded `domainNames` / `explanations` maps to 5 domains in BOTH**
   `client/src/pages/Results.tsx` and `client/src/pages/ResultsPrint.tsx`.
4. **FIX the Top-3 blank-card bug:** Top-3 does `.slice(0,3)` over the FULL scores
   object **before** the `if (!info) return null` guard
   (`Results.tsx:588-590`, `ResultsPrint.tsx:653-655`). A dropped domain landing in
   the top 3 then renders a **blank card → fewer than 3 values shown**. Filter the
   scores to known domains **before** slicing.

**WARNING:** a **display-only trim (step 3 alone) makes it WORSE** — Top-3 reads live
data, so it would render blank cards for the dropped (still-stored) Universalism/
Hedonism domains. Steps 1+2 (data) and step 4 (slice-before-filter) are required.

**BEFORE building, run the check script** (with `DATABASE_URL` set, from repo root)
to confirm the data state — is 7-domain data present for 0aba7a3b? Are the 6
Universalism/Hedonism `cvq_items` still `is_active = true`?
```
node <scratchpad>/check_values_0aba7a3b.cjs
```
(Script body recorded in this session's cc-out.md; it prints active `cvq_items` per
domain/version, the assessment's `cvq_scores`, and `cvq_results.normalized_scores`
+ `top_values` for 0aba7a3b. Re-create it if the scratchpad is gone.)

### Pre-launch test-data cleanup — GATED until just before real students onboard

**STATUS: PARKED / GATED — do not execute now.** Documentation only. Execute ONLY
just before launch, when it is certain no real student data is mixed in.

**CONTEXT / DATA MODEL (mapped this session):** "Students" are **not** a separate
table. Each row in the `assessments` table **IS** a student record — it holds
`name`, `age`, `grade`, `gender`, `is_guest`, `guest_session_id` directly, plus
their answers/scores. The `/api/public/student-count` endpoint counts these rows.
As of this session, prod holds **~6 test assessments, 28 recommendations, 66
quiz_responses** — all test data generated during development.

**TASK (when unblocked):** Delete all test assessments and their FK-linked children,
in foreign-key order (children first):
1. `quiz_responses` (FK → assessment)
2. `recommendations` (FK → assessment)
3. `cvq_results` / `wef_competency_results` (if any reference the assessment)
4. then the `assessments` rows themselves

**Before deleting:** verify the exact FK relationships and `ON DELETE` behavior
(cascade vs restrict) and construct the delete sequence accordingly — a cascade may
make some explicit child deletes redundant; a restrict makes child-first ordering
mandatory. Also check `organization_members` (1 test row) and whether any test users
exist (currently: **1 superadmin, 1 org_admin**).

**CRITICAL — never delete the superadmin or org_admin user rows.** They are the real
admin accounts. Scope every delete to assessment/test data only.

**WHY GATED, not done now:** cleanup is cosmetic (clean analytics/count), zero
urgency pre-launch, and strictly better done at launch. Doing it during ongoing
development just means re-cleaning, since more test data is generated with each test.
Doing it right before launch guarantees nothing real is caught in the delete.

### Arabic / RTL audit — PRE-LAUNCH, not yet done

**STATUS: PARKED / PRE-LAUNCH — documentation only, do not implement now.** Gated
to pre-launch, but should be done before any Arabic-speaking users see the product.
**Not started.**

The product supports Arabic (`titleAr`/`descriptionAr`/`nameAr` fields,
`langParam==='ar'` paths in `ResultsPrint.tsx` / `Results.tsx`) but RTL rendering has
**never been audited**. For a UAE-market product this is a real pre-launch risk.

**Audit must cover:**
- **UI layout mirroring** (nav, progress bars, score breakdowns, forms) flips
  correctly in RTL.
- **PDF reports specifically** (Puppeteer + Arabic + RTL is a known pain point) —
  verify Arabic PDFs render correctly, including text direction and glyph shaping.
- **Mixed LTR/RTL content:** numbers, English career titles, and codes embedded in
  Arabic text render in correct order.
- **Arabic font/glyph rendering** (correct font loaded, no tofu/boxes).
- **Form inputs and text alignment** in RTL.

### Individual-tier assessment lock — PARKED, needs product decisions before build

**STATUS: PARKED / PRE-LAUNCH — documentation only, do not implement now.**
Pre-launch IF individual self-pay is a launch channel. The org_student lock
shipped; this is the individual-tier counterpart and is intentionally NOT built.

**Goal:** lock an individual from starting a new assessment once they've used all
the assessments they purchased (one purchase = one assessment; someone who bought
3 can take 3, then is locked).

**Why the naive rule is unsafe.** `completed >= purchasedLicenses` looks right but
has three concrete problems found during the org_student-lock work:
1. **Free-tier individuals would be locked before their first assessment.** A
   free / never-paid individual has `users.purchasedLicenses = 0`, so
   `completed(0) >= purchased(0)` ⇒ locked immediately. Breaks the free tier.
2. **Mismatched currencies.** `purchasedLicenses` counts only PAID seats, but a
   completed-assessment count includes FREE completions too. `assessmentType`
   ('free'/'premium') lives on the assessment row and is derived from content
   (e.g. `server/routes/assessment.routes.ts:82,89`), not from a purchase link.
3. **No server-side guard for individuals.** The POST `/api/assessments` license
   guard (`server/routes/assessment.routes.ts:97-122`) gates org_students only
   (via `orgMember.hasCompletedAssessment`). An individual client-only lock is
   cosmetic / trivially bypassable.

**Correct (narrower) rule:**
`accountType === 'individual' && purchasedLicenses > 0 && completedPremiumCount >= purchasedLicenses`
where `completedPremiumCount` = completed assessments with `assessmentType === 'premium'`.

**OPEN DECISIONS before building:**
- (i) Should free-tier individuals be capped at all, or stay unlimited? The rule
  above leaves them unlimited (matches current behavior).
- (ii) Add a server-side POST guard for individuals (RECOMMENDED — parallels the
  org_student guard; without it the lock is cosmetic).

**Data that exists:** `users.purchasedLicenses` (`shared/schema.ts:51`),
incremented per payment (`server/storage.ts:589-597`,
`server/routes/payment.routes.ts:189/206/227`), exposed to the client via
`/api/auth/user`. The `useAssessmentAvailability` hook currently returns
`Infinity` for non-org_students by design — DO NOT wire individuals into it until
(i)/(ii) are decided.

### Confirmed CORRECT (do not re-investigate)
- **Scoring-engine weights match the white paper exactly.** Free 35/35/30;
  premium RIASEC 35 / Subject 20 / Vision 20 / CVQ 25
  (`server/seed.ts:1883-1905`, `server/services/tierWeights.ts:13-40`).
- **Free → premium upgrade preserves and re-scores assessment data in place** —
  the assessment row is upgraded, not replaced; no orphaning.
- The scoring **math is faithful to spec.** Only the values-data (#1) and the
  report templates (#2) diverge.

## REDESIGN — Career report redesign for teen audience (13–15)

**Status:** parked 2026-06-26. Documentation only — do NOT build yet. **Decide scope first (see "Decide first" below) before any code.**

### Problem
The current report is a 9-page PDF aimed at a Grade 8–10 student. Two separable problems:

1. **Too long.** 9 pages for a 13–15-year-old. Five careers each get a near-full-page treatment. Far too much to hold attention.

2. **Repetitive narratives (an LLM-generation problem, not just layout).** The generated prose is copy-paste across careers — a teen will notice immediately and lose trust:
   - Every career's **"Why This Career?"** opens with the IDENTICAL sentence ("You have an Investigative personality—you enjoy analyzing data and solving complex problems").
   - Every **"Personal Strengths & Growth Areas"** lists the SAME two items ("1. Analytical thinking… 2. Interpersonal skills…").
   - The generation (prompt templates "Why This Career?" / "Education Pathways") isn't producing career-specific or differentiated content.

3. **Pagination.** Career blocks break mid-section across pages (e.g. "Why This Career?" and "Your Work Style Fit" spill from one page to the next), making the report hard to follow.

### Two distinct workstreams
- **(a) LAYOUT** — shorten and control page breaks so sections don't split mid-content; tighten toward ~3–4 pages.
- **(b) CONTENT / LLM** — fix narrative generation so each career reads distinctly (per-career personality/strengths, not a shared template), and shorten the per-career prose for the age group.

### Decide first (next session, before writing code)
- Target length (pages).
- What each career block must minimally contain.
- Whether to reduce the number of careers shown, or the depth per career (or both).

### Confirmed-by-PDF sub-findings (23f6008e, 2026-06-29)
- Narrative duplication CONFIRMED: "Why This Career?" Personal Strengths + Work Style Fit blocks are word-for-word identical across all 6 careers.
- Markdown rendering literally in PDF: "**Your Core Strengths:**" shows asterisks instead of bold.
- Career blocks break mid-section across pages (Work Style Fit orphaned onto following page) — confirmed pages 4/6/8.
- Career Personality (RIASEC) Next button: new page opens scrolled to bottom instead of top (scroll-reset missing on transition).

## Session — Dream Personalization (C) + Premium LLM Outage — 2026-07-01

### DONE — C: optional dream personalization in premium narrative
- Commit ad76508. Optional careerAspirations → premium "Why This Career" LLM narrative via {{dreamGuidance}}. Bridge+redirect guardrail (name dream, connect via shared value, never invalidate/overclaim). Empty dream → no trace.
- Code: llmNarrativeService.ts (buildStudentContext computes dreamGuidance; replaceTemplateVariables registers {{dreamGuidance}}). Template: seed.ts:1952.
- VERIFIED: EN + AR, native-premium, conflict case (surgeon dream vs unrelated matches). Names dream, bridges via Benevolence value, holds distinction ("digital rather than surgical"). Full pass both languages.
- Cache key excludes careerAspirations — editing a dream does NOT invalidate cache. To re-test: POST /api/recommendations/generate/:assessmentId (or delete llm_narrative_cache rows), then read.

### OPEN — C converted-user path (free→premium upgrade)
- Works for native premium; upgrade flow unbuilt.
- CONTRACT when built: upgrade PATCH must OMIT carried fields (careerAspirations, strengths, interests, workPreferences, personalityTraits). Merge preserves on OMISSION only; explicit []/null OVERWRITES (assessment.routes.ts:286, !== undefined filter). interests is .array().notNull() — [] blanks it (35% free-tier score input).

### P1 — Anthropic key had vanished from api_credentials
- Premium narratives silently fell back to heuristic (generateEnhancedReasoning); no LLM ran, undetected. Sold as "personalized narrative insights."
- Re-added via superadmin panel 2026-07-01 10:34 (audit logged: api_credential).
- UNRESOLVED: WHY it disappeared. Confirm re-added key survives next deploy. Silent recurrence drops premium to heuristic with no alert. See Task 2 findings below.

#### Task 2 findings (read-only investigation, 2026-07-01) — root cause: DB_ENCRYPTION_KEY mismatch, NOT deletion
**Q1 — Does seed/migrations DELETE/TRUNCATE/overwrite api_credentials? NO.**
- api_credentials is NOT referenced in server/seed.ts and NOT in any server/migrations/*.sql (grep clean; migrations only touch assessments, career_component_affinities, assessment_components, WEF/careers/countries).
- Only write sites for the table (storage.ts):
  - upsertApiCredential — storage.ts:2773 (insert…onConflictDoUpdate on provider; UI add path).
  - updateApiCredentialTestResult — storage.ts:2790 (test button only).
  - deleteApiCredential — storage.ts:2799 → `db.delete(...)`, sole caller superadmin.routes.ts:1204 (explicit superadmin DELETE route, isSuperadminMiddleware-gated).
- The delete route WRITES AN AUDIT ROW: changeType "api_key_deleted" (superadmin.routes.ts:1210-1218). So a deliberate UI/API delete would leave a scoring_config_change_log row. ACTION: query scoring_config_change_log for changeType='api_key_deleted' entityType='api_credential' before 10:34 today — if none, it was NEVER explicitly deleted → points to Q2/Q3 (decrypt failure), not a delete.

**Q2 — Silent "absent" on decrypt failure: CONFIRMED — this is the vanish mechanism.**
- getApiCredential — storage.ts:2736. Row IS still in the DB. But at 2741-2748: if apiKey isEncryptedFormat, it tries deserializeAndDecrypt in a try/catch; on ANY throw it logs `console.error` and `return undefined` (2746-2748). Caller cannot distinguish "row missing" from "row present but undecryptable" → the credential appears GONE.
- getAllApiCredentials (2755, the superadmin LIST view) does the same but returns `apiKey:''` on failure (2766) — so in the UI the anthropic row may still LIST but with a blank key, reinforcing "it vanished."
- Consumer: llmNarrativeService.generateNarrative — llmNarrativeService.ts:124-132: `if (!credential || !credential.apiKey || !credential.isActive)` → returns success:false. isAnthropicConfigured (334-336) same.
- Silent fallback (no alert, no user-visible error): recommendations.routes.ts:384-386 `premiumReasoning = llmResult.success && llmResult.narrative ? llmResult.narrative : generateEnhancedReasoning(...)`. Premium silently degrades to heuristic. EXACTLY the observed symptom.

**Q3 — DB_ENCRYPTION_KEY read from env at DECRYPT time: CONFIRMED — most likely root cause.**
- encryption.ts:7-16 getEncryptionKey() reads `process.env.DB_ENCRYPTION_KEY` fresh on every encrypt AND decrypt call (no caching, no boot-time capture). decryptApiKey (40-53) uses AES-256-GCM with setAuthTag; a wrong key fails auth-tag verification at `decipher.final()` (51) → throws → caught in getApiCredential → undefined.
- Therefore: if DB_ENCRYPTION_KEY at runtime differs from the value that encrypted the stored row (env reset on redeploy, rotated secret, new deploy target, Neon branch swap carrying old ciphertext, .env not restored), the ROW IS INTACT but undecryptable and reads as "gone." No error surfaces beyond a console.error.
- Corroborating: re-adding via UI (upsertApiCredential re-encrypts with the CURRENT env key, 2775) makes it work again — consistent with the key having been re-encrypted under a now-different DB_ENCRYPTION_KEY. Does NOT prove the old key was wrong, but it's the exact behavior a key mismatch produces.

**Q4 — Neon restore/branch reset?** No code-level evidence either way (infra not in repo). BUT: `npm run db:push` = `drizzle-kit push` (package.json:11) can drop/recreate columns/tables on schema drift — plausible data-loss vector if run against prod. A Neon branch swap/restore to a point where the row didn't exist, or was encrypted under a different key, reproduces the symptom. Flag for infra review — check Neon branch history + deploy logs around the outage window.

**CONCLUSION / most likely:** Not a delete (no seed/migration touches the table; explicit deletes are audit-logged). Most probable = DB_ENCRYPTION_KEY drift between the encrypting environment and the runtime environment (Q3), surfaced silently via getApiCredential's catch→undefined (Q2) and the no-alert heuristic fallback.
**Recommendations (do NOT implement without approval):**
1. Startup env guard for DB_ENCRYPTION_KEY (like DATABASE_URL in db.ts) AND log a key fingerprint (SHA-256, first 8 hex) at boot so a key change is visible in logs.
2. getApiCredential must distinguish "row absent" from "decrypt failed" — surface decrypt failure as ERROR/alert, not undefined, so premium doesn't silently degrade.
3. Operational alert when premium narrative falls back to heuristic (recommendations.routes.ts:386) — currently invisible.
4. Verify DB_ENCRYPTION_KEY is a persistent deploy secret (not regenerated per deploy); confirm the re-added key survives the next redeploy before trusting premium.
5. Query scoring_config_change_log for a prior 'api_key_deleted' row to definitively rule the delete path in/out.

ROOT CAUSE CONFIRMED (2026-07-01, code + audit trail): DB_ENCRYPTION_KEY drift, NOT deletion. scoring_config_change_log shows only api_key_updated (10:34), zero api_key_deleted — delete path ruled out. Key became undecryptable when DB_ENCRYPTION_KEY changed; getApiCredential returns undefined on decrypt-failure (storage.ts:2741-2748), indistinguishable from absent; premium silently fell to heuristic (recommendations.routes.ts:384-386). encryption.ts reads DB_ENCRYPTION_KEY fresh per decrypt — any env reset/rotation/branch-swap reproduces it. FIX PRIORITY: (1) pin DB_ENCRYPTION_KEY as stable persistent Render secret — the ACTUAL fix, config not code; (2) alert on premium→heuristic fallback; (3) getApiCredential distinguish absent vs decrypt-failed; (4) boot-time key fingerprint log. Re-adding the key WITHOUT (1) re-arms the trap.

### P1 — seed.ts reverts config on every boot
- Runs every startup (index.ts:219), no env guard. UPSERTS (revert to file values): tier component weights (storage.ts:2659), assessment component weights (seed.ts:1400), LLM model+userPromptTemplate (seed.ts:2011), WEF skills, UAE sectors.
- Consequence: superadmin-UI edits to weights/templates revert on next restart/deploy. "Configurable without code changes" is false across reboots.
- Decide file-vs-DB source of truth; add prod guard or make these insert-only.
- NOTE: api_credentials is NOT in the seed list — key add via UI survives boot.

### P2 — Markdown leak, now universal
- LLM narratives emit # headings, **bold**, emojis; renderer prints them literally (all premium cards in report.pdf). Was occasional (heuristic), now every premium card since LLM is live. Renderer must parse markdown.
- Related: dreamGuidance --- fences echo into output — drop literal --- from the template string.

### Report quality (Khalid premium PDF, 2026-07-01)
- TOO LONG: LLM writes 5-6 dense paragraphs/career × 5. Template says "4-5 paragraphs." Tighten to "2-3 short paragraphs, ~150 words" — must be in the FILE (seed reverts UI edits). Fix ORDER: renderer(P2) → dedup(#2) → length. Length last.
- DUPLICATION: identical "Core Strengths" + "Work Style Fit" blocks on every card (RIASEC-derived, student-level). Redesign #2 relocates to profile, shown once.

### Parked (pre-existing)
- Arabic bidi scramble + English-term leak in reports.
- Free-tier report bars hardcoded 30/30/20/20 (premium correctly 20/20/35/25).
- PDF filename shorten/fix (career-report-<uuid>.pdf).

### Test-data note
- Khalid (23f6008e…) restored to empty dream + cache cleared. No test data left.
