# Pre-deploy / Follow-up List

Non-blocking items surfaced during Phase 2 security work. **Not security findings.**
Do not block deploy on these, but address before/around release.

## PDF DOWNLOAD — FIXED 2026-09-03 (commit 8006a0e)
Root cause: PUPPETEER_EXECUTABLE_PATH pinned Chrome 150 (gone); three-way drift (env 150, build
chrome@stable 152, puppeteer wants 148); env pin suppressed puppeteer's managed download. Fix:
.puppeteerrc.cjs sets a project-relative cacheDirectory read by both the install CLI and runtime
launch, so they use puppeteer's pinned version in lockstep - survives Chrome stable rolls, no
manual re-pin ever again. Render changes: deleted PUPPETEER_EXECUTABLE_PATH + PUPPETEER_CACHE_DIR,
dropped @stable from build command. VERIFIED: real PDF downloaded + rendered fully on prod.
LOAD-BEARING: .cache/ is gitignored (also part of 8006a0e). Without it a `git add -A` would try to
commit ~377MB of managed Chrome - the build downloads it into the project-relative cache dir.

REMAINING PDF DEFECTS (separate, not blocking - found during the recon, still open):
1. Admin BULK EXPORT builds its print URL with NO printToken (admin.routes.ts:1242) - those PDFs
   may render blank even now that Chrome launches. Single-report path is fine (has the token).
2. RATE LIMITER throttles the headless browser: career-reasoning is recommendationsLimiter (20/hr),
   keyed by IP; the headless browser hits the API from Render's single egress IP, so after ~4 PDFs/hr
   the "Why This Career?" narratives get 429'd and SILENTLY dropped (retry:false). Real bug at scale.
3. Print-token TTL is 60s but the render budget is also 60s (goto 30s + waitForFunction 30s) - on a
   slow render the token can expire mid-render -> degraded/blank PDF.

NARRATIVE POLISH (minor, noticed in the first full prod PDF): LLM reasoning still says the student's
subjects are "Business"/"Art" (pre-umbrella-6 phrasing); "Next Steps" says "Take Business further"
even for non-business careers. Cosmetic, not broken.

## Session log

### Arabic PDF report — session 2026-06-30

DONE + VERIFIED:
- PDF download concurrency fix (d562a65 + i18n f74c530): fetch-and-blob download with in-flight guard; button disables + spinner during generation; accurate success/error toasts (replaced the old always-"started" toast that lied on failure). Fixes repeated-click → "site wasn't available" (each click had spawned a concurrent Puppeteer/Chrome → Render OOM). Verified: single click works, double-click blocked, valid PDF lands.
- Arabic PDF LABELS now render Arabic (real fix: 3b6720d). ROOT CAUSE: /print/results is wrapped in LanguageProvider, which in the headless context (no session → user=null, no localStorage) initialized to "en" and STOMPED the print page's changeLanguage("ar") back to en (React runs child effects before parent). Data was Arabic (driven by ?lang param directly) but t() labels followed i18n's active language = en. FIX: LanguageContext.getInitialLanguage() now honors ?lang from the URL as top priority, SCOPED to pathname.startsWith("/print") so it can't affect normal app routes. Verified in production via incognito (no localStorage/session = same blank context as Puppeteer): all labels render Arabic, country line clean.
- IMPORTANT history note: TWO earlier fixes (7cdf258 readiness-gate, d761b45 decouple-namespace-from-narratives) were aimed at a WRONG hypothesis (i18n bundle load-timing race). Both passed tsc, both FAILED in production, because the bundle was never the problem — the provider was resetting the active language. The misleading timing scaffolding was reverted in dd46af6 (kept only the 28s safety-net value as an independent good fix: client backstop now sits below server's 30s waitForFunction). Lesson logged: verify the ACTIVE state at capture (the PDF showed complete correct English, not key-fallbacks = en bundle ACTIVE, not missing) before assuming a timing/loading cause.

STILL OPEN (Arabic report quality):
- Bug B — RTL career-page layout (dense career pages, were PDF pages 4/6/8). TWO sub-problems:
  (1) OVERFLOW/bleed across page breaks — FIX COMMITTED (3a1d263) BUT NOT YET VERIFIED. min-height:100vh→auto, break-inside:avoid on .career-card-print, grid h-full→h-auto. FIRST ACTION NEXT SESSION: download a real Arabic PDF and check the dense career pages (were 4/6/8) render with clean breaks and no overlap. Print CSS looks-right-renders-wrong — do NOT mark this done until seen in an actual PDF. If still broken, iterate.
      ADDED HEIGHT 2026-09-08: the weights-as-sentences change (commit 2 of the methodology
      work) replaces "35% weight" with a full sentence in the 2-col breakdown grid inside
      each career card — the densest block on the page this item is about. Measured for
      English it is a wash: the card is 1-up full-width (A4 210mm, .print-page-career
      padding 2rem, card p-4), so a breakdown cell is ~334px inner and a ~49-char sentence
      at text-[10px] still occupies one line. ARABIC IS THE OPEN CASE — longer strings in
      Cairo may wrap to two lines, and six components in a 2-col grid is three rows, so the
      worst case adds ~3 lines to a card carrying break-inside:avoid. NOT held for
      verification (explicit decision), so the Arabic PDF check below now covers this block
      too: look at the per-component weight sentences, not only the page breaks.
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
- Prod DB password was rotated this session after being exposed. The prod endpoint is now its -pooler variant. Updated in: Neon, Render env, local .env. CONFIRM .env is gitignored and was never committed.

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

### PDF DOWNLOAD FAILING (2026-06-29) — SUPERSEDED, FIXED 2026-09-03
NOTE: the ranked causes below were the June diagnosis and are now HISTORY. The concurrency/OOM
cause (#1) was fixed 2026-06-30 (d562a65). The 2026-09 recurrence was a DIFFERENT root cause -
Chrome version drift - fixed 2026-09-03; see "PDF DOWNLOAD — FIXED" at the top of this file.
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

## PAYMENT GRANT RELIABILITY — rebuild status (2026-08-21)
Prior commits were lost (made in an ephemeral Codespace, never pushed to origin).
Rebuilt from verified specs and PUSHED. Root-cause fix: every commit now pushed immediately.

RECOVERED + PUSHED (code-reviewed; RUNTIME-TEST PENDING — batch 1/2/5 together):
- Fix 1 (5d073c0): POST /api/checkout/stamp-buyer — merge buyerEmail/Name/Phone into PI metadata
  pre-confirm (merge-not-clobber, 409 guard, guest-safe, sanitized). NOT under paymentLimiter;
  own light stampBuyerLimiter (60/15min/IP).
- Fix 2 (eb3117f): webhook self-service grant. New server/services/premiumGrant.ts
  grantIndividualPremium() -> granted | already_premium | skipped_oauth (OAuth checked BEFORE
  already_premium). Guest+buyerEmail -> grant + processed=true.
- Fix 5 (d32e959): converge new-buyer branch onto grantIndividualPremium(). existing-local +
  logged-in stay INLINE (already_premium divergence; session-userId vs email lookup).

RUNTIME TEST OWED (all three, one session): env recipe below, then test-mode checkout
(card 4242 4242 4242 4242) — confirm stamp merge + 409; webhook-alone grant from metadata (the B3
dropped-completion sim); new-buyer auto-login (Set-Cookie -> /api/auth/user 200) + credentials in
response; idempotency (re-fire = no double-grant).

## Fix 4 (b′) — DESIGNED + re-anchored to current code (2026-08-21). NOT built. Touches auth.ts.
Behavior: OAuth-existing buyer who pays is NOT rejected/double-charged. After charge they re-auth
(Google/MS) the email they paid with; premium grants to that VERIFIED account. NEVER on unverified
email match. ⚠️ HIGHEST BLAST RADIUS — new middleware runs on EVERY OAuth login; regression-test
NORMAL Google AND Microsoft login.

Current line-refs (re-anchored this session, post-rebuild these will shift again — re-verify):
- payment.routes.ts OAuth-existing reject: `if (!existingUser.passwordHash) return 400 login-first`
  (was ~:216-221). Replace with soft 200 {requiresOAuth, provider, paymentIntentId, email}; NO grant,
  do NOT set processed. Charge already succeeded before this point (PI-succeeded + amount guards above).
- payment.routes.ts /checkout/complete: set req.session.pendingPaymentIntentId before the soft return.
  Session middleware IS active here (setupAuth before route reg).
- auth.ts Google strategy done() (~:125) + Microsoft (~:148): thread email (normalized) +
  emailVerified (Google: profile._json?.email_verified === true; MICROSOFT HAS NO EQUIVALENT — decide:
  treat unverified or verify out-of-band). serialize/deserialize are pass-through, so payload reaches session.
- auth.ts Google callback (~:224-229) + Microsoft (~:237-242): insert ONE shared
  grantPendingPaymentOnReturn middleware BETWEEN passport.authenticate and res.redirect("/auth/callback").
  req.user populated there.

Security boundary — grant ONLY if ALL: paidEmail===whoReturned (PI.metadata.buyerEmail vs freshUser.email
from getUser NOT session; BOTH trim+lowercase) AND emailVerified===true AND pi.status==="succeeded"
(re-fetched live) AND metadata.processed!=="true". Attacker replaying victim PI into own session ->
their verified email != victim buyerEmail -> no grant. Idempotency: check processed BEFORE grant
(license increment); stamp after; already-premium -> stamp+skip; delete session key unconditionally.

⚠️ BLOCKER found this session (cc re-anchor): session cookie is sameSite:'strict' in production. The OAuth
callback is a cross-site top-level nav from the provider — under Strict the browser withholds the session
cookie, so req.session.pendingPaymentIntentId would be EMPTY in the callback. Carrying state via req.session
is BLOCKED. Options: signed OAuth state param (but start routes pass NO state today — adding it changes the
regression surface for ALL logins), or relax sameSite for the callback path. RESOLVE before building Fix 4.

RESIDUAL (not solved by Fix 4): pay-but-never-complete-OAuth -> charged, ungranted, session PI expires.
Fix 3 sweep CANNOT auto-grant OAuth (no verified-login proof) — can only email a "claim your purchase"
re-auth link. Also skipped_oauth from Fix 2 lands here.

## Fix 3 — reconciliation sweep (NOT started)
Admin-triggered + optional scheduled: list succeeded PIs with processed!=="true" & assessmentType premium,
grant idempotently (real userId -> grant; guest+buyerEmail -> grantIndividualPremium). OAuth-existing
CANNOT auto-grant -> surface + "claim your purchase" email. Backstops Fix 4's residual + Fix 2 skipped_oauth.

## Other known items surfaced (not started)
- Credential delivery on webhook/backstop-created accounts: createStandaloneUser returns a one-time
  password nobody displays (no browser). Buyer granted but locked out pending reset. Email creds via
  existing server/services/email.ts.
- Already-premium INDIVIDUAL repurchase: existing-local branch increments licenses; helper no-ops.
  Neither clearly right — likely block an already-premium individual from a 2nd checkout up front.
- 'group' tier gap: isPremiumAssessment accepts ['premium','school'] NOT 'group'. Inert (nothing writes
  'group'), but a group-tagged cohort would be silently locked + PDF-403'd. Add 'group' or assert at write.
- Group backstop: grantIndividualPremium is individual-only; a guest group purchase whose complete drops
  gets licenses but no org created. createGroupPurchaseTransaction only reachable interactively.
- HARD GATE: all payment fixes done + runtime-verified before enabling LIVE Stripe.

## Env recipe for THIS codespace (test-mode runtime verification)
App reads process.env directly (NO dotenv). .env is gitignored — fresh Codespace has none; create it with
the Neon dev DATABASE_URL (the pooled -pooler host for the endpoint that .env points at — see Neon).
In ONE terminal, same shell as `npm run dev`:
  export $(grep -v '^#' .env | xargs)          # DATABASE_URL (source .env alone may not load it)
  export STRIPE_SECRET_KEY='sk_test_...'        # NOT in .env
  export VITE_STRIPE_PUBLIC_KEY='pk_test_...'    # NOT in .env, build-time (Vite inlines)
  export SESSION_SECRET=$(openssl rand -hex 32)
  export DB_ENCRYPTION_KEY=$(openssl rand -hex 32)   # 64 hex
  export SUPERADMIN_EMAILS='dev@example.com'
Verify all six non-empty (STRIPE must be sk_test_, never live_) BEFORE npm run dev. Confirm boot log's
"optional not set" list does NOT contain STRIPE_SECRET_KEY/VITE_STRIPE_PUBLIC_KEY.
cc runs in a SEPARATE context from the terminal — cc's curl can't reach a server the terminal started
(got connection-refused). For runtime tests cc must start the server IN ITS OWN shell, or you drive the
browser checkout yourself. STRIPE_WEBHOOK_SECRET unset = webhook disabled locally (fine for /checkout
paths; NOT for testing Fix 2's webhook — that needs the secret or a manual event replay).

## Fixes 1/2/5 — RUNTIME-VERIFIED (2026-08-24, Stripe test mode)
- Fix 1 ✅ stamp merge-not-clobber (4 original PI keys survived + 3 buyer keys); 409 on succeeded/processed PI.
- Fix 5 ✅ new-buyer /checkout/complete: account+premium, auto-login (Set-Cookie -> /api/auth/user 200), credentials returned.
- Fix 2 ✅ webhook self-service via REAL signed event (dummy whsec_): granted from metadata ALONE, idempotent re-fire, tamper->400 (signature check load-bearing). Test accounts deleted, 0 remain.
=> Money hole (guest pays, completion drops) now runtime-verified, not just code-reviewed.

## FINDINGS from the 1/2/5 verification (2026-08-24)
1. 🔴 SECURITY: GET /api/auth/user returns passwordHash (bcrypt) in the response body. SPA calls it every
   page load -> credential-material disclosure to the client. Strip passwordHash (and any secret fields)
   from the user object on ALL auth/user responses. FIXING NEXT.
2. 🟠 OPS/ISOLATION: dev .env DATABASE_URL == the DB futurepath.ae writes to, AND prod's Stripe webhook
   (we_...@ https://futurepath.ae/api/webhook/stripe) is subscribed to the SAME Stripe TEST account.
   Confirming a test PI locally -> Stripe fires event -> PROD webhook grants an account into the shared DB.
   Any local test can mutate prod data. Need a SEPARATE dev database (+ ideally a separate Stripe test
   account or dev-only webhook). Root cause of the phantom account seen during Fix 1. INFERRED from strong
   evidence (cc can't read prod env); confirm by checking prod's DATABASE_URL.
3. 🟡 IDEMPOTENCY (fragile, not broken): the processed-flag guard (webhook.routes.ts:189) reads
   metadata.processed off the EVENT payload, which carries the creation-time snapshot — so on a real Stripe
   retry `processed` is absent even after we stamp it. Retries are currently saved only by
   grantIndividualPremium's already_premium no-op (relies on isPremium being flipped). Bypassed for
   skipped_oauth or any future grant that doesn't set isPremium first. Proper fix: a delivery-level
   idempotency record (processed-event-ID table), not account-state reliance. Harden before live.
   (Same shape as a live retry loop observed: prod granted but paymentIntents.update failed — likely a
   different Stripe key on prod, 404 -> processed never stamped -> Stripe retried indefinitely.)

## passwordHash leak — RESOLVED (2026-08-24)
- Commit 1 (98eaa6b): toPublicUser() allowlist applied at the 4 leaking sites. FIXED.
- Commit 3 (1c8347a): sanitizer unit test, 11 cases, self-defending (new column fails the test). CI-locked.
- Commit 2 (convert ~15/19 inline whitelists to the helper): CANCELLED — not deferred. Recon (2026-08-24)
  found 0 of 19 sites are identical-set drop-ins; ALL would WIDEN exposure, 14 cross-user, 6 expose minors.
  toPublicUser is a CEILING (nothing secret escapes), not a floor (must send everything public). The 19
  sites already apply per-endpoint data-minimisation ON TOP of that ceiling — a security property to keep,
  not duplication to collapse. #19 is a Drizzle column-level select() (hash never leaves Postgres);
  converting would pull the bcrypt hash into app memory — strictly worse. auth.ts login/register are on
  the DO-NOT-TOUCH list. GDPR export (#3) is a versioned artifact — field changes = format change + bump.
  9 of 19 aren't user-object projections at all (credential hand-offs / CSV column contracts).

Salvageable intent (OPTIONAL, separate scoping — NOT this thread): cc option (b) — named sub-allowlists
in shared/userPublic.ts (e.g. USER_IDENTITY_FIELDS) so narrow projections also derive from one file.
Consistency win without widening. Touches cross-user minor-facing endpoints -> deliberate scoping if pursued.

Still open (from the 1/2/5 verification findings): endpoint-level passwordHash test (needs supertest or
ephemeral-port listener); shared dev/prod DB (#2); event-ID idempotency table (#3).

## Finding #2 (shared dev/prod DB) — STRUCTURALLY CLOSED (2026-08-24)
Root cause fixed: dev and prod shared one Neon DB; a stale/ambient prod DATABASE_URL in the dev shell
silently won and let local work write to production (a real premium account was created in prod this session).

Done:
- Neon STAGING branch created (its own endpoint, schema-only, auto-delete Never). Dev .env points at it.
  Prod stays on the main branch, on the prod endpoint. The two are different databases — that is the
  whole point of this item.
- APP_ENV=production set in Render (explicit positive prod signal — NODE_ENV unreliable: Render starts via
  `node dist/index.js`; NODE_ENV=production IS set as a dashboard var, confirmed, so the 8 cookie/enum
  downgrades are NOT live).
- Boot guard in server/db.ts (f174c61): prod DSN + APP_ENV!=production + no ALLOW_PRODUCTION_DB -> REFUSE.
  Deployed; prod boot log confirmed "APP_ENV: production" (armed, no shell needed to verify).
- Parallel guard in drizzle.config.ts (6f087ac): same for db:push (can DROP columns).
- PROVEN: pointed dev shell at prod DSN with APP_ENV unset -> npm run dev REFUSED with the diagnostic.
  The incident condition is now blocked.

Escape hatch for sanctioned prod ops (the 3 scripts, intentional db:push): ALLOW_PRODUCTION_DB=true.
Override the endpoint id via PRODUCTION_DB_ENDPOINT_ID if the branch is ever recreated.

Remaining small follow-ups (not blocking):
- ROTATE Neon credentials: the full connection string (with password) surfaced in terminal output several
  times this session — it's in the transcript. Do when convenient.
- DONE 2026-09-07: Neon endpoint hostnames scrubbed from this file. They appeared across several
  sections, not the single line this item used to cite — the prod endpoint in the rotation note, the
  env recipe, the staging/prod branch note and the migration-014 correction, plus the staging endpoint
  in two places. Replaced with "the prod endpoint" / "the staging endpoint", preserving every passage's
  prod-vs-staging distinction. Not credentials, but the repo is public and they publish the instance.
- .env.example documents only 2 seed passwords — expand to name DATABASE_URL/STRIPE_*/SESSION_SECRET/
  DB_ENCRYPTION_KEY/APP_ENV so a dev has a guardrail (its absence contributed to #2).
- drizzle-kit swallows exit code: a guard trip PRINTS but exits 0 — if db:push is ever wired into CI, the
  step wouldn't fail. Fine for interactive use.
- No render.yaml: all deploy config (DATABASE_URL, STRIPE_*, APP_ENV, NODE_ENV) is manual in Render dashboard,
  no version-controlled record / drift check. Consider committing a render.yaml.
- Delete .env.prod-backup from the working tree when done (it holds the prod DSN locally; gitignored, but tidy up).
- STAGING is schema-only (empty). For runtime tests needing data, run seed / db:push-to-staging first.
- Stripe event path still shared: a CONFIRMED test PI fires to prod's webhook (same Stripe test account).
  DB guard doesn't cover this — never confirm PIs locally, or use a separate Stripe test account / dev webhook.

## Dependabot triage — 35 -> 4 (2026-08-24)
Headline "35 vulns / 19 high" was ~90% noise (Dependabot counts advisories-per-package;
undici alone = 5). Real tree was 16; only 2 genuinely reachable in prod. Now 4 remain.

DONE (committed + pushed):
- c2e0cfa: reconcile lockfile (stale dev:true on esbuild optional binaries, no version change).
- 1d3653d: npm audit fix — cleared 9 non-breaking incl. the 2 that mattered: multer (DoS on live
  upload endpoints) + dompurify (XSS sanitizer bypass). Plus ip-address, body-parser,
  brace-expansion, undici(5), nanoid, postcss.
- cfed11c: removed dead deps adm-zip + html-to-docx (9-check verified unused) — cleared 3 highs,
  dropped 58 packages, zero code change. tsc/tests/build all green.

REMAINING — 4 highs, puppeteer cluster (puppeteer, puppeteer-core, @puppeteer/browsers, extract-zip):
- LOW real risk: extract-zip symlink traversal fires at BROWSER INSTALL, not PDF render; js-yaml is
  puppeteer-internal. Not on any request path.
- Fix = puppeteer 24 -> 25 (major bump). HIGHEST regression risk of the batch: touches live PDF gen
  (admin.routes.ts:1122 bulk export + recommendations.routes.ts:546 reports), v25 changed
  browser-download/launch defaults, app pins Chromium via PUPPETEER_EXECUTABLE_PATH + Render build
  step `npx puppeteer browsers install chrome@stable`.
- PLAN: own focused session. Recon breaking surface, bump, then PDF-render smoke test on STAGING
  (both PDF paths) before deploy. Watch the Render build's puppeteer install step.

## Incidental bug found during dead-dep verify (separate one-line fix)
public.routes.ts:53 white-paper download looks for docs/future-pathways-white-paper-2026.docx but
tracked files are ...-v1.1.docx — so GET /api/public/whitepaper/download 404s every time.
Unauthenticated user-facing endpoint. One-line filename fix.

## puppeteer 24->25 — IN PROGRESS (2026-08-24). Commit A done, rest needs staging PDF render.
Last Dependabot vuln (4 highs, dedup'd to ~1: extract-zip/@puppeteer/browsers/puppeteer/-core).
LOW urgency — fires at browser INSTALL, not render. Do NOT rush; broken PDFs for schools > the vuln.

DONE + DEPLOYED:
- Commit A (f418d7e): dropped the `which chromium` fallback (tier 2) from both PDF launch sites
  (admin.routes.ts bulk export + recommendations.routes.ts single report). Removed execSync/child_process.
  Behavior-neutral on Render (PUPPETEER_EXECUTABLE_PATH still set = tier 1 wins). Live, site works.

BLOCKER for remaining steps: bundled Chrome can't exec in the Codespace (11 missing shared libs:
libatk, libgbm, libcups, libxkbcommon, libasound, ...). So render CANNOT be verified locally — every
remaining step needs a REAL PDF render on a STAGING DEPLOY (not just the staging DB). Likely means a
2nd Render service on the staging branch, or a careful prod test. Set that up first.

REMAINING (each changes render behavior — verify with an actual report PDF render, checking images +
Arabic/Cairo font via lang=ar, on BOTH paths, before prod):
1. Set PUPPETEER_CACHE_DIR explicitly in Render (e.g. project-relative) so build + runtime agree on the
   cache location regardless of $HOME — $HOME divergence between build/runtime phases would make the
   managed browser install land where launch can't find it ("Could not find Chrome").
2. Unset PUPPETEER_EXECUTABLE_PATH (currently VERSION-PINNED to a Chrome build linux-150... — fragile,
   breaks on every Chrome release independent of the bump). Still on v24. Smoke-test both PDF paths.
3. Commit B: bump puppeteer ^24 -> 25.8.0 (also @puppeteer/browsers 2->3, extract-zip removed). Re-run
   both smoke tests. Pin .nvmrc to 22.12+ (v25 needs node >=22.12.0; .nvmrc says just "22").
Config note: launch config now = executablePath if PUPPETEER_EXECUTABLE_PATH set, else managed browser.
tsc proves nothing here (both sites use `let browser: any`) — only a real render verifies.

## Session 2026-08-24 (cont.) — Fix 4 (partial, on branch), Fix 3 v1 (shipped), org-name stamp

### Fix 4 (OAuth-existing double-charge) — PARTIAL. Steps 1-2 on main, 3+3b on BRANCH, 4-5 NOT built.
Decisions locked: carrier = signed OAuth state param (survives sameSite:strict; option b was a mirage —
can't relax sameSite per-path). Scope = GOOGLE-ONLY v1 (Microsoft has no email_verified signal; MS buyers
-> requiresManualClaim -> Fix 3 residual). upsertOAuthUser unverified-linking (1a) deliberately NOT bundled.
- Step 1 (f78d17f, on main): server/utils/oauthState.ts — signPaymentState/verifyPaymentState, HMAC-SHA256
  over SESSION_SECRET (printToken.ts idiom), base64url, 15-min TTL, constant-time, never throws. 21 tests.
  SECURITY MODEL: valid token = "we issued this PI id recently", NOT authorization to grant.
- Step 2 (1c1cb5f, on main): auth.ts Google done() payload adds emailVerified ONLY (not email — email would
  persist minors' addresses in the sessions table; boundary re-fetches email from DB anyway). Google session
  now { userId, provider, emailVerified }. Behavior-neutral, nothing reads it yet.
- Steps 3+3b (e827b69, on BRANCH fix4-oauth-grant, NOT main): server replaces OAuth-existing 400 with soft
  200 {requiresOAuthGrant, state, email} (Google) / {requiresManualClaim} (MS/null). Client Checkout.tsx
  two branches: OAuth -> window.location.href /api/auth/google?state=... (redirectingToOAuth flag holds the
  spinner so Pay can't re-enable on a charged card); manualClaim -> info toast. i18n en+ar (AR NEEDS REVIEW).
  WHY BRANCH NOT MAIN: inert without Step 4 — deploying 3+3b would strand OAuth buyers (charged, logged in,
  no grant). DO NOT merge until Step 4 + staging OAuth test.
- Step 4 (NOT built): auth.ts start route (:233-235) must forward req.query.state into passport.authenticate
  (currently a static options literal — drops it). Plus grantPendingPaymentOnReturn callback middleware:
  verifyPaymentState(req.query.state) -> re-fetch PI live -> boundary check (PI.metadata.buyerEmail ===
  freshUser.email BOTH trim+lowercase, freshUser from getUser NOT session; emailVerified===true; live
  pi.status succeeded; processed!==true) -> grantIndividualPremium -> stamp processed. Runs on EVERY OAuth
  login: no-op when no state. HIGHEST BLAST RADIUS.
- Step 5 (NOT built): regression test — normal Google login AND normal Microsoft login with NO pending
  payment (the 99% path) must be proven unbroken, plus payment scenario + attacker cases (replayed PI,
  mismatched email). NEEDS a staging OAuth DEPLOY (real Google creds) — cannot be verified in the Codespace.

### Fix 3 v1 — SHIPPED (read-only reconciliation sweep)
- Endpoint (7123104): GET /api/superadmin/payments/unreconciled?days=90 (superadmin-gated, dataExportLimiter,
  STRICTLY READ-ONLY — audited: only getUser/getUserByEmail/paymentIntents.list, zero writes). Walks succeeded
  PIs, filters processed!==true, classifies against DB state (not the flag) into 7 classes: amount_mismatch,
  unidentifiable, group_incomplete, already_granted, oauth_blocked, grantable_user, grantable_guest. Returns
  per-class tally+money, per-PI rows, denominator. Answers "how much money is ungranted in prod right now."
- Classifier tests (566c379): 30 tests locking the 7-way first-match-wins precedence. Key guards:
  amount_mismatch beats everything + does no DB lookup; group_incomplete beats already_granted at
  studentCount>1 (do-not-flip). 77 tests total.
- NOT built (deferred, needs data first): the reconcile/GRANT endpoint (POST, explicit paymentIntentIds[]
  allowlist — never blind grant-all; auto-grant grantable_* + already_granted stamp-backfill only), and the
  "claim your purchase" email (depends on Fix 4 Step 4 for OAuth accounts; email infra exists in email.ts but
  needs a new sendClaimEmail + bilingual template).
- Audit gap for the future grant endpoint: no system-level audit table (createOrganizationEvent needs an
  organizationId; individual grants have none). Decide before automating grants.
- Bulk-grant-on-typo'd-email risk: buyerEmail is unauthenticated/client-supplied; a sweep that auto-grants
  in bulk amplifies the Fix 2 typo-upgrades-a-stranger risk. Explicit decision needed before auto-grant.

### org-name stamp (82a9ad7, main)
stamp-buyer now stamps organizationName into PI metadata (can't be done at PI creation — created on
page-mount before the buyer types it). Narrows the group-purchase reconciliation blind spot GOING FORWARD.
Best-effort + buyer-asserted (same trust tier as buyerEmail).

### Deferred residual-case notes for Fix 3 grant phase
- updateUserPremiumStatus (storage.ts) sets isPremium but NOT purchasedLicenses — the grant endpoint must use
  updateUserFields with studentCount, or buyers end up premium with 0 licenses.
- Case A (guest, stamp-buyer failed, complete dropped): NO email anywhere in metadata. Only possible identity
  is the charge object (latest_charge.billing_details.email / receipt_email) — nothing reads it today. Verify
  against a real PI before assuming it's recoverable.

## EPHEMERAL DISK DATA-LOSS — INVESTIGATED, NOT YET FIXED (2026-08-25)
Confirmed: app writes all uploads to LOCAL ephemeral disk (multer.diskStorage). No object storage
anywhere (verified: no S3/DigitalOcean/Spaces/MinIO/Cloudinary in deps, env, code, or git history —
the DigitalOcean belief traced to the user's OTHER projects (Kanz telegram bot, Masary media), which
have DO storage — FuturePath does not). On Render's filesystem, everything below is WIPED on every
deploy/restart unless a persistent disk is mounted.
NOTE: whether a Render persistent disk is mounted is UNCONFIRMED (no infra files in repo, no dashboard
visibility this session). This is the decisive fact for Option A vs B — CHECK THE RENDER DASHBOARD (Disks
section) before choosing. Free-tier plans may not support disks at all.

SEVERITY CONTEXT: prod showed 1 school / 2 students in the superadmin dashboard UI (user screenshot,
2026-08-25) — NOT verified by DB query this session (only the staging endpoint was queried, which
returned 0 files/0 orgs). Implication: little/no real data at risk YET, but confirm against prod before
relying on this. This is a MUST-FIX-BEFORE-REAL-SCHOOLS-ONBOARD item, not a live emergency. But it is the
single most important pre-launch data-integrity item found so far.

FOUR persistence bugs (MUST-PERSIST, currently lost on deploy):
1. Uploaded files (files table): file_path stores an ABSOLUTE disk path; read back by 4 later routes —
   GET /api/files/:id/download, GET /api/files/shared/:token (share link), DELETE /api/files/:id,
   DELETE /api/superadmin/files/:id. After deploy: DB row persists, file gone -> download 500s. Share-link
   is worse: incrementDownloadCount + invalidateShareToken fire BEFORE the read, so a post-deploy click
   burns the one-time token AND errors.
2. Bulk-import student CSVs (admin.routes.ts import-students): RETAINED not discarded (unlink only on
   error branches). Creates a files row (fileType import_data). Contains minors' PII — names, grades,
   student IDs, ages, genders. Also accepts a fileId from an earlier upload = explicit cross-request read
   that breaks across a deploy.
3. Org logos (organizations.logo_url): admin uploads -> /uploads/<file> stored in DB, served by
   express.static at index.ts:158, rendered via <img src> on the PUBLIC UNAUTHENTICATED landing page
   (Landing.tsx) + admin views. After deploy: broken images for every visitor. Admins can ALSO paste
   external https:// URLs (survive), so breakage looks arbitrary/flaky.
4. Translation Manager (superadmin translations): writes to client/public/locales/<lang>/<ns>.json —
   TWO bugs: (a) wrong directory — server serves dist/public/locales, so edits NEVER reach students even
   before a deploy (UI echoes the saved value back so it looks successful); (b) wiped on deploy anyway.

EPHEMERAL-OK (no bug, verified): all PDF generation (in-memory Buffers streamed same-response), bulk ZIP
export, inline credentials CSV (deliberately never persisted), directory mkdir calls.

FIX OPTIONS (decide next session, AFTER confirming the Render disk status — the real open question, see
NOTE above):
- Option A — mount a Render persistent disk at <cwd>/uploads. Smallest code change (paths already point
  there). BUT: pins service to 1 instance, disables zero-downtime deploys, free tier may not support disks,
  and does NOT fix bug #4 (wrong directory) or the fragility of storing absolute paths in the DB.
- Option B — object storage (S3 / Cloudflare R2 / DigitalOcean Spaces). Correct architecture: survives
  deploys, scales, no instance pin. DB stores a KEY not an absolute path. Bigger work: new dep, creds,
  rewrite upload/download/delete/share paths, migrate existing rows. The user's DO Spaces account already
  exists (used for other projects) — create a NEW FuturePath bucket there; no new vendor/billing, familiar
  tooling. This is the pre-favored fix.
- Bug #4 (translations) needs its own fix regardless: move translation overrides into the DATABASE rather
  than the filesystem (a disk mount would persist them but they STILL wouldn't be served from the wrong dir).

DIGITALOCEAN — RESOLVED: user has a DigitalOcean droplet + Spaces bucket, but for OTHER projects (Kanz
telegram bot, Masary media) — NOT wired to FuturePath. So no existing FuturePath uploads are on DO.
BUT: the DO Spaces account + tooling already exist, making Option B (object storage on DigitalOcean
Spaces) the pre-favored fix path — create a new FuturePath bucket in the existing account, no new
vendor/billing.

## Separate minor UI bug (unrelated, low priority)
Superadmin nav: the active-tab TITLE is wrong — clicking "Schools" shows the "Admin" title, and clicking
the tab you're already on is a dead click (correct path, wrong title). Cosmetic nav-state bug, not data.

## PARKED — Superadmin dashboard engine/functionality audit (raised 2026-08-25, screenshots provided)
A full audit of what each superadmin tab actually DOES — engines, functionality, bugs — NOT cosmetic-only.
To be done as its own focused session, per-tab recon. NOTHING BELOW HAS BEEN INVESTIGATED YET; every item
is a question to answer, not a finding.

UI/LAYOUT
- Tab row overflow: "Add School" (Schools tab) and "Add Student" (Students tab) buttons push Contributions
  + Translations onto a second wrapped row. Move the Add buttons down (e.g. next to Export CSV) so all tabs
  fit one row. Applies to both the Schools and Students views.
- Related, already logged directly above: the active-tab TITLE is wrong and re-clicking the current tab is
  a dead click. Same nav area — fold into this session rather than fixing separately.

ENGINE/FUNCTIONALITY — each needs recon (is the engine broken, or is it just empty?)
- Recent Activity tab — shows "No recent activity". WHAT should populate it (which events, from what table
  — createOrganizationEvent? a system audit log?), and WHY is nothing showing (engine not wired, no events
  generated, or query bug)? Earlier Fix 3 work found there is NO system-level audit table — this may be
  related: events may only exist for org-scoped actions.
- File Management tab ("Manage uploaded files") — what does it actually contain/do? Backed by the files
  table (the same one in the storage migration). Confirm what it lists, and whether download/delete work.
  They are broken pre-migration due to ephemeral disk (see bug #1 in the ephemeral-disk section above) —
  re-verify post-migration.
- Translation Manager -> Database Content — has 4 sub-tabs: Careers, CVQ Items, Countries, Quiz Questions.
  User: "the four should be same". Investigate consistency — do all four have the same edit capability, the
  same completeness display, the same behaviour? Are any broken or incomplete relative to the others?
- NOTE the pre-existing translation BUG already found (bug #4 in the ephemeral-disk section above):
  superadmin translation edits write to client/public/locales, but the server serves dist/public/locales —
  so UI-string edits never reach students even before a deploy, AND are wiped on deploy. The Database
  Content translations may use a different (DB-backed) path — investigate whether Database Content works
  while UI Strings is broken.

OTHER TABS TO AUDIT WHILE THERE (screenshots provided)
- Scoring — weights per tier (Free/Premium/School); Narrative Cache; LLM Configuration (showing the
  Anthropic key); Prompt Templates (using claude-sonnet-4-6); Change History audit log.
- Contributions — review queue + reward settings.
- Countries, Subjects, Careers, CVQ Items.
- CONTRAST TO RESOLVE: Change History (Scoring) DOES show an audit log (prompt/api-key updates), while
  Recent Activity is empty. Understand why one logs and the other doesn't — that likely explains both.

User will provide MORE screenshots/items later — THIS LIST WILL GROW. Do not treat it as complete.

## CONFIRMED SPEC — Assessment & lifecycle rebuild (locked 2026-08-26)
Owner confirmed all product decisions. This supersedes the earlier "TO CONFIRM" audit. Formatted copy exists
as FuturePath_Spec_v2.docx (owner's local reference). No deadline; prod-direct EXCEPT schema/data changes ->
staging DB first; PDF only testable on a deploy.

### MODEL: Model B (free = distinct shallow taster, protects IP) with a SHARED 4-STEP SPINE.
Steps 1-4 are IDENTICAL for free and premium: 1 Basic Info, 2 Subjects (+pick 3 priorities), 3 Country
(+curriculum), 4 Quiz (one shared question bank for ALL users; country+curriculum are the only differentiators).
Then they diverge:
- FREE:    5 Interests, 6 Aspirations, 7 Results (shallow)
- PREMIUM: 5 Career Personality (RIASEC), 6 Personal Values (CVQ), 7 Aspirations, 8 Results (full)
Premium has NO Interests step; free has NO RIASEC/CVQ. Premium instrument order stays RIASEC-then-CVQ (no change).
Quiz length: 9-12 Qs total, derived from the 3 priority subjects, SAME for every user (3 or 4 per subject - final TBD).
Quiz score is NOT shown to the student (weighted into the result).

### FREE (guest)
- Free report: max 2 career matches (N=2); premium detail blurred (default hidden: "why this career" reasoning,
  detailed skills, education path, next steps; show name+%match+teaser). Assistant to finalize exact blur set.
- Guest report is effectively single-session unless they create an account; DROP the non-working 7-day promise.
- On "Create Free Account": claim the just-completed free assessment into the account (fix guest->account migration).
  Free account KEEPS the free report in history.
- Logged-in FREE user CAN take/retake the free assessment and save reports (today they're blocked -> fix).
- Registration needs email verification (see best-practice 8.5). Fix confusing post-register destination.
- Free profile fields (name/age/grade/gender) should populate. Free users must appear in the users list.
- Rename Admin "Students" tab -> "Users" (already labeled "Users Directory"; schools managed separately).

### PREMIUM - self-paying
- Same assessment as school; differs only in provisioning. Self-payer enters own details, picks own
  grade+curriculum FRESH each run (not stored/locked).
- $10 = 1 license = 1 assessment. Licenses live in profile, consumed on use, gone when used. NOT unlimited.
- Retake / new grade / new school = another license. Already-premium repurchase SELLS more licenses (per-user,
  consumable) - never "charge for nothing".
- Payment history shown in self-payer profile.

### PREMIUM - school-paying
- LICENSE CONSUMED AT COMPLETION (assessment marked complete = data saved + recommendations generated), NOT at
  student creation. So a school can revoke an unused license (student never completed) and reassign it. LOCK this.
- School create/edit form: Basic Info + Country + Curriculum all MANDATORY -> pre-filled + LOCKED for the student
  (steps 1 & 3). Student can NEVER override school country/curriculum.
- School students get the FULL premium quiz distribution (fix the hidden free-tier bug).
- Re-do same grade: school admin re-grants an allocation WITHOUT destroying history; consumes another license;
  old report kept (admin may soft-delete to keep only the new). Only SCHOOL ADMIN triggers re-grant.
- New grade (next year): admin bulk/individual grade-change + license grant; student then assesses new grade.
  Each grade re-assessment = one NEW license. Model = one license = one assessment (any grade).

### FREE -> PREMIUM UPGRADE
- Carry the shared 4-step answers forward WITH a reuse-or-redo choice, ALL-OR-NOTHING (reuse includes quiz score).
- Reuse -> straight to RIASEC+CVQ then Aspirations+full report. Start fresh -> full premium from step 1.
- Land STRAIGHT into premium after paying. Pre-fill basic info (self-payer can still edit via profile; school
  students cannot). Free report stays as history. Fix dead redirect routes.

### CAREER JOURNEY
- Fills across grades for both types. Duplicate-grade confirmation prompt for self-payers
  ("you already have a report for this grade - confirm redo?"). Fix the broken per-grade results link.
- Retaken-same-grade: both reports kept; school admin may soft-delete the old.

### CONFIRMED BEST PRACTICES
8.1 Carry-over = all-or-nothing reuse/redo choice.
8.2 License consumed at completion, independent of PDF success (failed PDF does NOT affect consumption).
8.3 Self-payer grade unconstrained; the duplicate-grade warning is the guard; user's choice at the end.
8.4 Career-Journey report deletion = SOFT-DELETE (mark deleted + audit record), not hard erase (minors' data).
8.5 Build proper email verification on registration.
8.6 Version-stamp assessment content (quiz set, RIASEC/CVQ items, career data) on each assessment for
    apples-to-apples multi-year Journey comparisons.

### BUG & CLEANUP LIST (15)
HIGH: (1) priority subjects auto-selected by system not student - corrupts quiz weighting + recommendations,
both flows; (2) PDF report download fails (Puppeteer) - FIXED 2026-09-03, see top of file; (3) school student gets free
quiz tier server-side (stored isPremium false) though report still generates.
MED: (4) per-page Next not locked; (5) country/curriculum not locked for school students; (6) guest->account
migration broken (guestSessionId never stored); (7) free-account user blocked from all assessments; (8)
already-premium repurchase charges but grants nothing; (9) no registration email + bad post-register flow.
LOW: (10) free profile fields empty; (11) rename Students->Users tab; (12) dead routes /payment-success
/school-admin + per-grade results link ignores grade param; (13) 'school' assessmentType dead (read 3 places,
written nowhere) - decide use vs remove; (14) 'Self Assessment' button mislabeled; (15) guest-mode banner
never shows.

### DASHBOARD (build now, not deferred)
Nav/routing (superadmin): tab-row overflow (move Add buttons near Export CSV), wrong active-tab titles
(Schools->"Admin"), dead-click on active tab - likely one root cause. Recent Activity + Talent Pipeline:
investigate + BUILD to populate. Translations: UI-strings editor writes wrong location (DB-backed fix needed);
confirm Database-Content tab works. Analytics: fix "Grade 10 twice" bucketing; confirm all-careers-"Declining".
Payment/coverage views: self-payer sees own history, school admin sees student coverage.

### RECOMMENDED BUILD ORDER — SUPERSEDED, PHASE NUMBERS ARE STALE (marked 2026-09-08)
**Do not read a phase number below as current.** This is the build order as PLANNED, kept
because it records what was intended at the time. The live list is the one further down this
file ("Phase 6 (license rework, the big one) …"), and where the two disagree that one wins —
the shipped work follows it: Phase 4 delivered mandatory school country/curriculum, Phase 5
delivered the guest→account claim (04b01d0, c0c009d).

THE NUMBERS DID NOT SHIFT BY A CONSTANT, so no single offset translates them:

| Planned below | Actually shipped as |
|---|---|
| Phase 1 (prod-safe fixes) | Phase 1 |
| Phase 2 (flow restructure, Aspirations-last, shared spine) | **Phase 3** — shared/assessmentFlow.ts |
| Phase 3 (mandatory school Country+Curriculum, lock steps 1&3) | **Phase 4** |
| Phase 4 (**license rework**) | **Phase 6** — the live entry |
| Phase 5 (guest→account claim, free access) | Phase 5 — claim delivered; free→paid carry-over still open |
| Phase 6 (Career Journey, dashboard) | not scheduled in the live numbering |

IN PARTICULAR, quiz.routes.ts:100 IS CORRECT. It defers retiring users.isPremium to "Phase 6",
meaning the license rework — Phase 6 in the live numbering, Phase 4 in the stale one below.
Anyone who reads the line below and concludes that citation points at the Career Journey has
been misled by this section, not by the code. See the "Phase 6 is defined twice" entry.

Phase 1 (prod-safe, no schema, high value): priority-subjects fix; school-free-quiz-tier fix; per-page Next
  lock; PDF failure; small renames (Self Assessment button, Students->Users, guest banner).
Phase 2 (flow restructure): Aspirations-last reorder; make steps 1-4 a genuinely shared component path; quiz
  count normalization (9-12).
Phase 3 (SCHEMA -> staging DB): mandatory Country+Curriculum+BasicInfo on school form; lock steps 1&3 for
  school students.
Phase 4 (SCHEMA -> staging DB): license rework (consume-at-completion, revoke-unused, self-payer profile
  licenses, repurchase sells licenses, already-premium guard); school re-grant (same + new grade / bulk);
  content version-stamp (8.6).
Phase 5: free->paid carry-over (reuse/redo, land-in-premium, fix dead routes); guest->account claim;
  free-account access + profile population; email verification (8.5).
Phase 6: Career Journey (fill across grades, per-grade link fix, duplicate-grade prompt, soft-delete); dashboard
  (nav root-cause, Recent Activity + Talent Pipeline, translations DB-fix, analytics grade-bucket, payment views).

## CONTENT ENGINE (contribution & verification) — recon 2026-08-26, NOT started
The school "Contribute Questions" feature (submit -> LLM pre-check -> superadmin approve -> questions land in
quiz_questions -> credits -> free licenses) is BUILT and the credit->license loop genuinely works (race-safe,
storage.consumeLicenseWithRewardPriority spends reward credits before paid). But it has NEVER run (0 submissions,
0 rewards, 0 school_contribution questions). Cross-school VERIFICATION (the "more schools verify = more confidence"
model) is ENTIRELY ABSENT — no schema, no code. It's a content-engine build, deferred because it has a
cold-start problem (needs multiple active schools with the same curriculum; useless at launch). Files:
server/routes/contribution.routes.ts (784 lines), ContributeQuestions.tsx, ContributionReviewQueue.tsx. Tables:
contribution_submissions, contribution_rewards; org credit cols reward_credits/pending_reward_credits/etc.

CRITICAL bugs (will fire on first real use):
- user.id is always undefined (session has userId, not id). Crashes at contribution.routes.ts:558 (reviewedByUserId
  written null), :720 (awardedByUserId .notNull() -> 500, /allocate-reward cannot complete), :771 (settings audit
  loses actor). Two sibling lines already use user.userId || user.id correctly (:172, :291).
- Two divergent credit paths: /claim awards submission.creditsAwarded; /allocate-reward awards an arbitrary
  superadmin number 1-50 and drifts the pending vs rewardCredits ledgers -> OVER-ISSUES free licenses (financial bug).

Medium: yearly-cap not enforced at approval (counter only bumps at claim/allocate); LLM pre-check is FAIL-OPEN
(returns score 100 on no-key/error/JSON-truncation; max_tokens 1000 truncates 50-question batches -> auto-pass);
prompt-injection surface (school text interpolated into the Claude prompt); needs_changes is a dead-end (can't be
re-reviewed, no school edit/resubmit); in_review never written (dead state); "claimed" status undocumented, renders
raw; approval loop not transactional (partial-populate + re-insert on retry, dup-check only at submit); rate limit is
rolling-24h not calendar-day and counts rejected; yearly reset triggered by a page-read (3 different reset notions).
Dead fields: rewardAllocated (only /allocate sets it), llmVerificationFeedback (never surfaced), quizQuestions
.contributionSubmissionId (written never read), contribution_rewards table (getContributionRewardsByOrg has no caller).

VERIFICATION MODEL (to design + build): second school confirms another school's questions; confidence
grows with N verifications; needs schema (verifiedBy/confidence/reviewCount or a verification-events table), a
cross-school review queue, and a rule for when a question is "trusted enough" to serve. Entirely greenfield.

CONTRIBUTED-QUESTION CURRICULUM CASING: contributed questions inherit the batch curriculum verbatim ("MOE National")
while the seeded bank is "MoE National" — contributions land in a different curriculum bucket. Ties to the casing bug
already logged for the quiz filter. (FIXED 2026-08-27 — bank now MOE National, see QUIZ status below)

## QUIZ (Rule B) — status 2026-08-27
Assessment quiz-enablement progress:
- DONE: curriculum casing fix (MoE->MOE, source + prod DB migrated + verified); umbrella-6 subject
  list (client picker now = the 6 subjects that match the bank: Mathematics, Science, English, Arabic,
  Social Studies, Computer Science); min-3/max-5 selection (client + server 400 gate); subject-tile
  visual polish (uniform size). All committed + live.
- PAUSED: Rule B distribution (always 18 Qs: 6/6/6 at 3 subjects, 5/5/5 at 4, 4/4/4 at 5, +3 per
  non-priority). Code not written. Paused because the bank is thin at grades 10-12 (7/7/6 per subject
  = grade-12 3-subject case needs 6/6/6 = zero slack) and topping it up with AI-generated questions was
  rejected: neither owner nor assistant can verify answer-key correctness, and unverified content must
  not go into the scoring engine for a career assessment. DECISION: source VERIFIED questions first
  (UAE MOE past papers / sample questions / teachers / textbook banks / eventually the Phase 4
  contribution system), then build Rule B on a bank with real slack. Can be incremental — even one
  subject topped up with verified Qs proves the pipeline.
- Bank facts for when topping up: append to server/questionBanks/uae/<subject>.ts (grade "10" array
  ~line 290, "11" ~390, "12" ~490); ALSO add a matching Arabic entry to
  server/migrations/quiz-arabic-content-grades9-12.ts (matched by exact English question text) or Arabic
  students see English; English question text must be globally UNIQUE (seed dedups by exact text, and the
  snapshot isn't updated mid-run so same-run duplicates both insert); correctAnswer must be string-identical
  to one options element (boot hard-fails otherwise). Target ~10 per cell = +3 g10, +3 g11, +4 g12 per
  subject (~60 total for all six). Format/topic conventions captured in the 2026-08-27 recon.
- When Rule B IS built: drop the tier param (premium/school configs are identical; 18 flat for all),
  delete TIER_CONFIGS + dead tierMultiplier, replace MIN_QUESTIONS=6 with the target-aware total, add
  server-side min-3 + priorities-must-equal-3 guard right after normalization (quiz.routes.ts ~:196),
  shortfall handling = ship-what's-available + LOUD warning (never block the student).
- STILL OPEN (independent of the bank): Piece D — careers.relatedSubjects remap (37 careers, only 32%
  of tags match umbrella-6, 10 careers score a flat 20 for everyone). Already broken today. Can proceed
  without verified questions.

## SCORING MODEL — verified findings + direction (2026-09-01)

Provenance: "VERIFIED FACTS" + "WEF SECTOR MODEL" + fixes 1-3 verified this session against staging DB + code. "DONE + LIVE IN PROD" items were verified earlier via the Neon prod SQL editor (prod not re-checked this session). The llmCountryService dead-code / llm_populated=false claim is from the prior country-gen-recon (not re-verified this session).

### DONE + LIVE IN PROD (this session's model repair):
- Zero-score guard: warns when a weighted component contributes null/zero catalog-wide (matching.ts). Live.
- WEF unit bugs fixed (wefSkillsCalculator: CVQ 24x + RIASEC 100x + subjectScores NaN); WEF stays OUT of scoring as a student component. Live.
- Vision: replaced broken substring-match with country_sector_categories mapping (migration 009 + seed). Floor 84% -> 2.7%. Live in prod (verified 35 rows).
- CVQ: was silently dead (0/37 careers had values_profile). Backfilled from O*NET (rescaled per-domain). 37/37 live in prod. Meaningful values verified.
- Piece D: normalize career.relatedSubjects at match time (subjectMap.ts, DB-free) + 6 catalog-wide aliases + Teacher retag. Flat-20 careers 10 -> 1 (only Fashion Designer, accepted art-axis gap). Live.

### VERIFIED FACTS (corrected several wrong assumptions):
- CVQ 5 domains is CORRECT and documented (VALUES_PROFILE_DERIVATION_METHODOLOGY.md): two reductions - 10->7 was youth adaptation (dropped Conformity/Tradition/Stimulation), 7->5 dropped Universalism+Hedonism because O*NET has no defensible career-side source. NOT an error. White paper (7 domains) is one revision stale. Keep 5. Vestigial 7-domain remnants in CVQStep.tsx + locale keys are harmless.
- Interests component is FULLY WORKING (not vestigial): 8 interests, 3-channel lexicon scoring (interestLexicon.ts), 35% live free-tier weight, proven to discriminate. 13 of 21 lexicon keys are unreachable-from-UI (harmless spare capacity).
- Career count is 37 (correct, seed==DB, no dups). The "36" is the WEF-affinity table: only 36/37 careers have skill affinities - Web Developer has ZERO (uncommitted migration wef-skill-affinities.ts targets it).

### WEF SECTOR MODEL — corrected direction:
- The all-16-skills-per-sector idea is DISPROVEN by simulation on live data: because skillAlignment is an importance-weighted mean of mean-centered affinities, filling all 16 adds SHARED variance and pulls sectors together. Full-16 makes correlation WORSE (0.894 sparse -> 0.989 at fill-50 -> 1.000 at fill-70). Sparse is the best case. DO NOT densify to 16.
- Root cause of r=0.99 (Space Exploration vs Renewable Energy): they load on the SAME high-variance skills (Sci Literacy, Critical Thinking, Numeracy). Fix is CONTRAST not coverage - reweight sectors onto DIFFERENT high-variance skills (proven: drops 0.99 -> 0.234). De-emphasize Critical Thinking (in 5 of 6 sectors, low sd 7.0).
- The category-gate HYBRID stays (do NOT let skills stand alone): category map = sector MEMBERSHIP (a fact), skills = bounded fit modifier (+/-15). Skills-alone was simulated and collapses attribution ("Chef -> Education", "Doctor -> Space" in student-facing Arabic rationale). Documented in matching.ts:975-987.

### SMALL PROVEN FIXES (next, mostly already written in the working tree):
1. Apply the working-tree seed.ts sector vectors to the live DB (29 -> 37 rows): takes max correlation 0.989 -> 0.894. Already written, not run.
2. Land untracked server/migrations/wef-skill-affinities.ts (Web Developer's 16 affinities -> 37/37 coverage).
3. Reweight Space Exploration onto distinct high-variance skills to break the last collinear pair.
Note: the seed sector->skill upsert is ADDITIVE-ONLY (no delete) - shrinking a sector vector later needs a reconciling migration.

### UNCOMMITTED WORK IN TREE (as of 2026-09-01, at risk on Codespace restart):
- server/services/matching.ts (WEF hybrid vision scoring: category gate + skillAlignment modulator, VISION_SKILL_SWING +/-15)
- server/seed.ts (expanded sector->WEF-skill vectors, 5-7 skills/sector, all 16 touched)
- server/storage.ts (getSectorWefSkillMap reader)
- server/wefSkillsData.ts
- untracked: server/migrations/wef-skill-affinities.ts (Web Developer fix), server/services/matching.vision.test.ts
These implement the WEF hybrid Phase 1 - NOT yet committed, pending the vector-decorrelation fixes above so it commits on good data.

### OPEN PRODUCT QUESTION (separate, bigger):
Sector LIST reconciliation. DB has 6 seeded sectors (AI, Space, Biotechnology, Renewable Energy, Education, Technology); white paper names 10 (adds Healthcare & Life Sciences, Financial Services & FinTech, Tourism & Hospitality, Advanced Manufacturing, Creative Industries & Media, Food Security & Agriculture; and none of the 6 DB names matches its white-paper name verbatim). Sector names are written verbatim into Arabic reports (load-bearing, not cosmetic). Decide whether UAE should carry the full 10 real-strategy sectors. This is product scope, independent of the r=0.99 skill-vector math.

### SCALABILITY MODEL (for future LLM country generation):
- The LLM country-generation path (llmCountryService) is DEAD CODE - UAE was hand-seeded (llm_populated=false), the path never produced a country. Greenfield when built.
- Design requirement (owner): country generation must source ONLY official in-country government websites (live web-fetch, cited), not LLM training-data recall. Must generate vision -> sectors -> per-sector WEF-skill emphasis (distinctive subset, NOT all 16) -> vision-alignment category rules, with provenance. Constrained generation + a geometric gate (reject sector vectors correlating >0.8 with an accepted one) is what makes it safe.
- Parked: subjects DERIVED from country vision via WEF skills (a country not targeting art-fields doesn't offer Art); flow reorder Country-before-Subjects so the subject list filters to the country's needs. High-risk, touches assessment flow + quiz budget - stays parked until the above lands.

---

# PROJECT STATE — snapshot 2026-09-02

Whole-project state capture. Recording only — nothing here is a work instruction.

### THE SCORING ENGINE — DONE, live in prod (this was the deep work):
All 5 scoring components now working (were 3 broken/dead). Committed + verified on prod:
- Zero-score guard: warns when a weighted component contributes null/zero catalog-wide.
- WEF unit bugs fixed; WEF is NOT a student-scoring component - it's the VISION skill-spine.
- Vision: skill-based hybrid (category-membership gate + mean-centered WEF skill-alignment modulator).
  Sector vectors decorrelated (max r ~0.76). Was flat-40 for 84% of careers; now discriminates.
- CVQ: was silently dead (0/37 careers had valuesProfile). Now 68/68, O*NET Work Values, rescaled
  per-domain (catalog-relative). Live.
- Subjects (Piece D): career.relatedSubjects normalized at match time + 6 aliases + Teacher retag.
  Flat-20 careers went 10 -> 1 (only Fashion Designer, accepted art-axis gap).
- Future-readiness: honest O*NET growth bands (replaced fabricated %s on 67/68 careers; fixed the
  Arabic decline-tier censoring) + an exclusion GATE (WEF-fastest-declining AND O*NET-decline -> excluded).
  Gate empty for today's 68 (all professional occupations); real job is guarding LLM country-gen.

### THE CATALOG — DONE, live:
68 careers DERIVED from UAE priority sectors (was an unsystematic 39), every one a real O*NET occupation
grounded in a named UAE strategy. 10 sectors named to match OFFICIAL UAE government vocabulary
(Digital Economy, Cultural & Creative Industries, Healthcare, etc). Every career serves a real priority,
zero catch-all. RIASEC derived from O*NET interest codes; WEF affinities authored per sector.

### SCALABILITY SCAFFOLDING — built, never run for a real 2nd country:
LLM country-generation (llmCountryService): grounded generation, gates (geometric/coverage/completeness),
live official-source web-fetch, persists sectors+skills+category rules. The future-readiness gate + the
completeness gate guard generated careers. NEVER produced a real country - UAE was hand-seeded.
PARKED: fold official-sector-NAME-fidelity rules into the generation prompt (names must match the
country's own government vocabulary verbatim, like the UAE reconciliation did). Also parked: subjects
DERIVED from country vision via WEF skills; Country-before-Subjects flow reorder.

### DONE EARLIER (infra + assessment):
Storage migration (DigitalOcean Spaces - no more data loss on deploy). Subjects step (Bug #1 priority
subjects, umbrella-6 list, min-3/max-5, tile polish). Curriculum casing fix (MoE->MOE).

### STILL OPEN — the product-flow layer (mostly pre-rebuild state):
The v2 assessment/lifecycle rebuild (the CONFIRMED SPEC in FOLLOWUP) is largely NOT built. Open:
- License model rework (consume-at-completion, school re-grant, self-pay licenses in profile,
  already-premium repurchase sells licenses).
- Flow restructure (shared 4-step spine, Aspirations-last).
- Free->premium carry-over (reuse/redo), guest->account claim, email verification.
- School form mandatory country+curriculum + lock student steps 1&3.
- Career Journey multi-grade; the school re-grant path.
- Dashboard fixes (nav/routing, translations DB-fix, analytics grade-bucket, payment/coverage views).
- Bug #2 PDF download - FIXED 2026-09-03 (Chrome version drift; .puppeteerrc.cjs managed browser).
- Bug #3 school student gets free quiz tier server-side.

### QUIZ — paused:
Rule B (18 Qs, priority-weighted) NOT built - blocked on VERIFIED questions. Bank works but thin
(6 subjects x 5 grades, 10/10/7/7/6). Umbrella-6 subjects. AI-generated questions rejected (can't
verify answer keys). Needs real sourced questions (MOE past papers / teachers / contribution system).

### GO-LIVE ITEMS (not done):
Email verification. Live Stripe keys (prod is on TEST keys). No real users yet - owner is sole tester.

### TWO SMALL MAPPING TWEAKS (noticed, not fixed):
Civil Engineer -> Digital Economy (via category rule; arguably belongs elsewhere). Dietitian -> Food
Security (defensible, but could be Healthcare).

### HONEST HEADLINE:
Scoring engine ~90% (the hard differentiating core - excellent). Product-flow layer ~30% (still
largely pre-rebuild). Quiz content thin. Go-live items pending. A student CAN take an assessment and
get a genuinely good, defensible report today - but the license/lifecycle/dashboard work and PDF bug
remain. Next natural priorities: PDF bug (visible failure), the v2 flow/license rebuild (biggest
remaining product work), verified quiz questions (unblocks Rule B).


---

## MULTI-COUNTRY / LOCALIZATION — parked workstream (2026-09-02)

Principle: universal engine + per-country CONFIG pack. Everything country-specific must be DATA/config
per country, NOT hardcoded, so adding Jordan/KSA/etc is "add a country config," not "edit code." UAE is
the FIRST country, not the only one - naming, defaults, and framing must not assume UAE (global presence).

Universal (never changes per country): RIASEC instrument, CVQ instrument, WEF 16 skills, the scoring math,
O*NET occupation-intrinsic data (a career's skills/values/interest profile - properties of the WORK, not
the country; O*NET-SOC maps to international ISCO).

Per-country config pack (must be parameterized): priority sectors (+ official-name-fidelity to that
country's own government vocabulary), currency, salary bands, growth-band localization, curriculum(s),
subjects, language, sector->skill vectors, sector->career-category rules.

### PARKED ITEMS:

1. O*NET US-DATA EXPOSURE - make country-flexible:
   - GROWTH BANDS (Part A / careers.onetGrowthBand) are US BLS projections. Shown to students verbatim.
     A UAE student sees "Nuclear Engineer: declining" which is US-true but UAE-FALSE (Barakah = UAE
     priority). The future-readiness GATE already handles scoring correctly (never gates on O*NET alone,
     requires WEF-AND, US-decline = WATCH not DECLINING) - but the DISPLAYED band is still US. Per country,
     the displayed growth should be overridable / country-aware, or shown with a caveat. A sharp reviewer
     WILL raise this - it's visible and contradicts the country-alignment claim on that one screen.
   - SALARIES are US O*NET wage bands in USD. Shown to students. Need per-country localization (local
     currency + local ranges) or generalization to relative bands. Catalog-wide, all 68 careers.

2. CURRENCY / PAYMENT per country:
   - Payment, pricing, and any displayed monetary values (salaries) must render in the country's currency
     (AED UAE, JOD Jordan, SAR KSA). Currently UAE/USD-oriented. Adding a country = its currency flows
     through payment (Stripe), pricing display, and salary display.

3. DEFENSE (for when someone challenges "O*NET is US data, not UAE"):
   The honest position: O*NET is used as a UNIVERSAL OCCUPATIONAL REFERENCE (what a job IS - its skills,
   values, personality, definition - occupation-intrinsic, international via ISCO), NOT as a US labor-market
   PREDICTOR for the target country. Country-specific signals (which sectors matter, demand, decline HERE)
   come from that country's government strategy + WEF (global), layered on top. Where US and local signals
   conflict (growth), the model requires a second non-US source before acting. This holds in scoring; the
   two gaps above (displayed growth band, salaries) are where US data still leaks to the student's screen.

4. THE BUILD must be flexible: audit for UAE-specific hardcoding (currency, salary format, growth display,
   country name, "United Arab Emirates" literals in reports/prompts) and parameterize per country. Ties to
   the existing parked L1-L6 leaks and the LLM-country-gen prompt fidelity work.

---

## v2 REBUILD — progress (updated 2026-09-04)

NOTE ON NUMBERING: these phase numbers are the AS-EXECUTED sequence and do NOT line up with the
"RECOMMENDED BUILD ORDER" list in the CONFIRMED SPEC section above (there, school-locking is Phase 3 and
license rework is Phase 4). Use the numbering below from here on.

DONE + live in prod:
- Phase 1 (2dab644..3eeebc9): 5 bug fixes - school students get premium quiz tier (Bug #3, derived from
  membership not isPremium), guest banner shows (#15), CVQ per-page lock (#4), Students->Users tab (#11),
  Self Assessment->Get My Report (#14).
- Phase 2 (3ee8134): grade canonicalization - shared/grade.ts single source of truth, all writes route
  through toCanonicalGrade, migration 013 normalized the 7 non-canonical prod rows. Fixed analytics
  double-bucket, per-grade Journey link (#12), unblocked multi-grade (L12). Also fixed parseInt-writes-NaN
  + fullName->studentName bugs.
- Phase 3 (d630f82): free-flow restructure to shared 4-step spine (Basic/Subjects/Country/Quiz shared, then
  diverge). Personality step removed from free (fed no scoring). Generation consolidated to one handler.
  deriveFreeResumeStep derives step from data (handles cross-device resume without schema). Draft key v2.
- Flow+report addendum (46cc463 + 92ec012): swapped Country BEFORE Subjects (enabling precondition for
  country-derived subjects later). Fixed curriculum-never-persisted bug (client didn't send + PATCH allowlist
  dropped it -> quiz always used fallback; now the curriculum-scoped query fires). Honest free report: free
  reasoning was generated+stored but nulled in response - now served via freeNarrative.ts formatter
  (deterministic, no LLM, student prose, no raw %s). Free capped at 2 matches (premium 5). Removed the 3
  career-fact blocks (salary/growth, required skills, WEF skills) from free entirely - free vs premium differ
  by completeness not fog. Kept Validated Competencies (student's own evidence). Deleted dead
  factsLocked/LOCKED_FOG; kept pdfLocked (real 403 gate). Reframed upsell in plain language ("Add Two More
  Signals"; the stale "24-question learning style" phantom removed).

REMAINING v2 phases (reconned, ready):
- Phase 4 (school locking) - RECON DONE. Recon preserved at docs/v2-phase4-recon.md (tracked).
  Key finding: SECURITY GAP - a school student can override name/age/grade/gender/countryId via a direct
  PATCH /api/assessments/:id (zero org-awareness). Country/curriculum live on the ORG and are OPTIONAL
  everywhere; the student create form captures neither (nor studentName/studentAge). No edit-student form
  exists. Needs: mandatory org country+curriculum (schema, staging-first), server-side PATCH lock enforcement
  (prod-safe), build the missing edit form. Depends on the Country<->Subjects swap (now landed).
- Phase 5 (guest->account claim + free access): guest->account migration is BROKEN (guest assessment not
  claimed on registration). Free-account users blocked from assessments. Ties to the "does Create Free Account
  save the free report?" question below.
- Phase 6 (license rework, the big one): consume-at-completion, unified self/school licensing,
  repurchase-sells-licenses, needs a real license table.

## OPEN ITEMS from 2026-09-04 free-report review (small polish + product decisions)

1. DONE 3ba4941 — Subjects step layout: if 6 subjects stay, arrange as 2 rows of 3, alphabetically ordered (currently not).
   Small UI.
   Alphabetical sort deliberately NOT applied — decided against 2026-09-05. Array order is curricular grouping,
   not arbitrary. A sort would need Intl.Collator to be meaningful in Arabic, which puts tiles in different
   positions per language, and the tilt at SubjectsStep.tsx:148 is keyed to array index so re-sorting reshuffles
   which tiles lean which way. The original complaint was the orphan row at lg, which lg:grid-cols-4 removal
   fixed. Not an open item.
2. DONE 3ba4941 — Quiz score flash: after the quiz a score shows for ~2 seconds - REMOVE it (owner decided quiz score is not
   shown; this is a leftover). Small.
3. CLOSED 2026-09-05 — not found. Curriculum display on Country step: owner saw "3 more with MOE National" - needs clarification/check
   whether extra curricula show incorrectly. TBD - owner to clarify what's shown.
   The string exists nowhere in source, either locale (en/ar), the built bundle, or the repo at large — the only
   occurrence is this note. Only candidate found was the admin Subject Management page (SubjectManagement.tsx:367-395),
   where a count line sits above rows each badged with a curriculum name; unverified. Needs a screenshot if seen again.
4. Free PDF: currently free users CANNOT download a PDF (403, upsells to premium). DECISION PENDING - keep PDF
   premium-only (recommended - tangible premium perk) or give free users a PDF.
5. Free account save: does "Create Free Account" actually save the free report? Unknown/untested. Ties to
   Phase 5 guest->account claim (which the audit found BROKEN). A PDF copy is NOT saved (PDFs are generated
   on-demand, not stored). Resolve in Phase 5.
6. Upsell copy still says "Holland Code (RIASEC)" and "values questionnaire" - it DEFINES them in plain
   language rather than assuming knowledge, reads OK, but owner may want "RIASEC" acronym removed entirely
   leaving just "career personality". Minor copy call.

## CORRECTION to 3f04c8b — migration 014 DID apply to prod (2026-09-05)

3f04c8b's commit message states that migration 014 was not applied to prod. That is wrong.
014_require_student_demographics.sql applied successfully via scripts/run-migrations.ts at
2026-09-05T07:19:02Z against the PROD endpoint; constraint
organization_members_student_demographics_check verified convalidated=true. The earlier
failed attempts were a malformed DATABASE_URL missing its postgresql scheme, not the
unclosed Neon pool. Both staging and prod are now on 014 (staging was additionally behind
on 013 and picked it up in the same run).

The KNOWN caveat in 3f04c8b therefore applies to BOTH environments: student creation is
broken on staging and prod until the create path sends studentName
(createUserWithCredentials, server/storage.ts:2671, never writes it — the add-student form
splits fullName into users.firstName/lastName and leaves the member row's student_name
NULL, which now violates the constraint). No real schools exist, so nothing is affected in
practice. Fixed in the follow-up.

## Deferred / triage

### PDF omits grade-branch action steps  (severity: medium — product decision)
The grade-branched "Next Steps" (explore/narrow/apply bands from generateEnhancedActionSteps) render ONLY on the on-screen report (Results.tsx). ResultsPrint.tsx (the Puppeteer PDF) fetches premiumActionSteps in its payload but never renders them — grep-confirmed no action-step reference in the file. Since the PDF is the parent-shareable artifact and grade-tailored steps are the feature's payoff, this may be an unintended gap. DECISION NEEDED: is the PDF meant to include action steps? If yes, adding the block is a scoped change requiring its own Chrome 150 PDF verification. Verified on-screen for grades 12 (Band 3) and 10 (Band 2) on 2026-07-06.

### getRecommendationsByAssessment has no ORDER BY  (severity: low — latent)
storage.ts (~965–969): bare select().from().where(eq(assessmentId)) with no ORDER BY. Insertion is best-match-first, but Postgres doesn't guarantee row order without ORDER BY, and the PATCH re-run does delete→re-insert (recommendations.routes.ts:147), so heap reuse can reorder. Harmless TODAY because the only consumers relying on order (the hoisted Work Style / Strengths panels via .find()) read career-NEUTRAL fields, so which row wins doesn't matter. Becomes a real bug the moment anything relies on recommendations[0] being the top match, or .find() on a career-SPECIFIC field. Fix: add explicit ORDER BY (e.g. overallScore desc) to the query. Would need verification against a PATCH re-run.

### Local dev blocked — missing env secrets  (severity: low — dev ergonomics)
npm run dev fails: .env in Codespaces has only DATABASE_URL. Server validation also requires SESSION_SECRET, SUPERADMIN_EMAILS, DB_ENCRYPTION_KEY. SESSION_SECRET and SUPERADMIN_EMAILS can be dev-appropriate values; DB_ENCRYPTION_KEY MUST match the Render literal exactly or the app cannot decrypt api_credentials (do NOT generate a fresh one). Until populated, local render testing isn't possible — verification has to go through deploy-to-Render. Non-blocking but costs a deploy cycle per UI check.

### CSP blocks an inline event handler on report page — RESOLVED (fixed 2026-07-07 in b729bb7, closed 2026-09-05)
Not a user action, which is why the console message was misleading. The blocked handler was `onload="this.media='all'"` on the Google Fonts `<link>` in client/index.html — the `media="print"` non-blocking font trick. CSP's `script-src-attr 'none'` blocked the flip, so the stylesheet stayed `media="print"` and the fonts never applied, on **every** page (not just the report — index.html is the shared shell). Nothing the user clicks was broken; the symptom was app-wide fallback to system fonts. Fixed 2026-07-07 in b729bb7: the flip moved into bundled JS at client/src/main.tsx:10-18, keyed off a `.async-font` class on the link, with an `l.sheet` check for the already-loaded case. CSP unchanged — violation removed, not permitted; `<noscript>` fallback retained. This entry was logged 2026-07-06, one day before the fix, and never closed. VERIFIED 2026-09-05: live prod console on results?assessmentId=23f6008e shows no script-src-attr violation.

### favoriteSubjects & dreamGuidance free-text reaches LLM prompt unsanitized  (severity: low — pre-existing injection vector)
{{favoriteSubjects}} is student-controlled free-text interpolated verbatim into the career_reasoning (and education_pathways) prompts via replaceTemplateVariables. A crafted value could inject instructions into the student's OWN narrative. Blast radius is limited: confirmed the API key is NOT in the model's context and each call carries only that one student's data, so no key exfiltration and no cross-student access — worst case is a student manipulating their own report text. {{dreamGuidance}} is the same class of vector: it renders the student's free-text careerAspirations into the career_reasoning prompt (guardrailed into an instruction block, but still student-controlled free-text), with the same blast radius (student's own report, API key not in model context). Pre-existing, independent of the Step 5 template change. Fix: constrain both fields at the WRITE boundary (validate/whitelist favoriteSubjects against the known subject catalog on save; sanitize/bound careerAspirations), and audit existing stored values. First flagged 2026-07-06.

### Dependency vulnerabilities flagged by Dependabot  (severity: TBD — needs review)
Investigation only, no fix applied. **The counts reconcile exactly** — Dependabot and npm audit see the SAME 3 packages, just counted differently.

**Counts.** Dependabot (default branch): 10 alerts — 4 high, 4 moderate, 2 low. Render build-time `npm audit`: 3 vulnerabilities — 1 moderate, 2 high. Local `npm audit` (2026-07-07): identical to Render — 3 (1 moderate, 2 high). The gap is NOT devDependencies or extra GitHub advisories: it's **per-advisory vs per-package counting**. npm audit rolls each package up to its single highest severity (3 packages → 2 high + 1 moderate); Dependabot lists every advisory separately. The 3 packages carry 10 advisories between them: undici 7 (3 high, 2 moderate, 2 low), multer 2 (1 high, 1 moderate), dompurify 1 (1 moderate) = **4 high / 4 moderate / 2 low — an exact match to Dependabot's 10.** Mystery resolved; nothing hidden in the dev graph.

**The 3 packages** (all in `dependencies`, none in devDependencies):
| package | severity (max) | direct/transitive | path | runtime? | current→fix |
|---|---|---|---|---|---|
| multer | high | **direct** (`multer@^2.1.1`) | 2 DoS CVEs (deep nested field names; incomplete cleanup of aborted uploads) | **YES — request path.** File-upload middleware in files.routes.ts + admin.routes.ts (CSV/JSON bulk student import, image/logo uploads) | 2.1.1 → 2.2.0 |
| dompurify | moderate | transitive (via `isomorphic-dompurify` → dompurify) | ALLOWED_ATTR pollution via setConfig() | **YES — request path.** Used by server/utils/sanitize.ts + contribution.routes.ts to sanitize user input at runtime | 3.4.9 → 3.4.11 |
| undici | high | transitive (via `isomorphic-dompurify` → jsdom → undici) | 7 CVEs (SOCKS5 TLS-bypass, Set-Cookie header injection, WebSocket DoS, proxy pool reuse, keep-alive queue poisoning, SameSite downgrade, cache disclosure) | **Effectively NO.** jsdom bundles undici as its HTTP client, but isomorphic-dompurify uses jsdom only to build a DOM for sanitization — it makes no outbound HTTP with undici, and every undici CVE requires actually issuing requests through it. Present in the graph, not exercised on any request path. (Node 22 also ships its own separate built-in undici; this is jsdom's copy.) Lower real urgency despite the "high" label | 7.27.2 → 7.28.0 |

**Fixability — all three resolve with plain `npm audit fix`; NONE need `--force`.** Confirmed via `npm audit fix --dry-run` (non-mutating): multer 2.1.1→2.2.0 (minor, same major), undici 7.27.2→7.28.0 (minor, same major), dompurify 3.4.9→3.4.11 (patch). No major-version bump, no SEMVER-breaking warning, no `--force` prompt. The dry-run also lists ~68 "added" packages — those are just platform-specific optional binaries (lightningcss / rollup / tailwind oxide) enumerated on this Linux box, unrelated to the security changes; the only real diff is the 3 `change` lines above.

**Priority read:** multer is the one that matters — direct dep, high severity, squarely in the request path (student file uploads). dompurify moderate but also on the request path. undici is high-labeled but not reachable through our usage. Even so, all three go away with a single non-breaking `npm audit fix`.

**Caveat before applying (per instructions — not done here):** verify the bumps don't disturb the build, especially anything touching vite/esbuild/puppeteer/drizzle. These three don't obviously touch that chain (multer is Express upload; dompurify/undici come in via isomorphic-dompurify/jsdom), but run a build + the upload paths after fixing. First flagged 2026-07-07.

### Career-reasoning prompt contradicts quiz results  (severity: medium-high — credibility)
Confirmed in a live prod PDF (assessment 23f6008e, 2026-09-05). The subject-strengths block shows Mathematics 0% (0 of 4 correct), while the LLM "Why This Career?" narratives praise Mathematics as a strength on three of five careers: Product Manager ("your love of Mathematics supports the analytical side"), Journalist ("Mathematics sharpens the analytical thinking needed to fact-check data"), Marketing Manager ("Mathematics connects to analytics and budgeting"). Cause: the career_reasoning prompt is fed favoriteSubjects (student-declared) with no quiz competency scores, so a failed subject is treated as an asset. Reader can falsify the claim from the same page. Fix: pass per-subject quiz scores into the prompt and instruct the model to frame low-scoring subjects as growth areas, not strengths. Needs a real PDF to verify. First flagged 2026-09-05.

### PDF footer shows wrong date  (severity: low — visible on artifact)
PDFs rendered 2026-09-05 print "Generated on 9/4/2026". The footer date is not the render date — likely the assessment completion/created date, or a timezone/derivation bug. Find the source of that value in ResultsPrint.tsx and confirm what it is meant to show. First flagged 2026-09-05.

### O*NET US growth band surfaced in a top-3 match  (severity: medium — already parked, now confirmed live)
Same PDF: Journalist ranked #3 with "Growth Outlook: Declining — projected decline". That is a US BLS-derived band shown to a UAE grade-12 student. Concrete instance of the parked O*NET-US-data-exposure item (see "MULTI-COUNTRY / LOCALIZATION — parked workstream", PARKED ITEMS #1, ~line 1375); growth bands need localization or suppression before go-live. First flagged 2026-09-05.

### Logged-out visitor gets a rendered report shell with a Download button  (severity: medium)
Observed live 2026-09-05 on results?assessmentId=23f6008e in a logged-out session. Server-side gating is CORRECT — /api/assessments/:id returns 403 and /api/assessments/:id/quiz returns 404, no data leaks. But the client renders the full report shell anyway: hero, "Download PDF Report" button, and the upsell block, wrapped around data it never received. Should redirect to login. Clicking Download in that state 403s. Also note the inconsistent authz shape: 403 on one endpoint, 404 on the other for the same unauthorized request. Belongs with Phase 5 (guest->account claim, free-account access). First flagged 2026-09-05.

### Arabic report renders canonical English values and English action steps  (severity: medium-high)
Observed live 2026-09-05 on the Arabic report (screenshots taken from prod). Four gaps, two causes:

STORED-VALUE DISPLAY (canonical English shown raw instead of translated):
- Subject names in the Subject Strengths block: "Social Studies", "Arabic", "Mathematics", "Science", "Computer Science" render in English while the surrounding labels and "٤ من ٤ صحيح" are correctly Arabic. The subject id is canonical English by design (SubjectsStep.tsx:36-47, persisted at :73/:78 so it matches subjects.name and quiz_questions.subject). SubjectsStep itself translates for display via t(subject.labelKey) at :157 — the report does not. Fix: route stored subject ids through the same locale keys at render on both Results.tsx and ResultsPrint.tsx. Scope trap: the id->labelKey map lives only as a private array literal in SubjectsStep.tsx:40-47. Neither Results.tsx nor ResultsPrint.tsx imports it, and the print page can't reach component-local state. The real fix is extract the six-entry map to shared/ first, then consume it in three places — which also removes the hand-duplication drift the comment at SubjectsStep.tsx:36-39 warns about.
- Country renders in English. Data already exists — countries carry nameAr/missionAr/visionAr/prioritySectorsAr and CountryStep.tsx:233/251/260 already reads them. The report simply isn't using them. Cheap render fix.
- Curriculum renders in English, and this one is NOT the same fix. There is no Arabic anywhere: shared/schema.ts:235 stores curriculum as a bare text column, CountryStep.tsx:215-217 renders the raw string. Translating it needs new data — a locale map keyed on the four values ("MOE National", "British", "American", "IB"), or an Ar column. Data work, not a render change.

GENERATED CONTENT NOT LANGUAGE-AWARE:
- "Next Steps" / الخطوات التالية items render as English sentences inside the Arabic report ("Complete Bachelor's degree in Computer Science or related field", "Build skills in: Programming, Problem Solving, Data Structures"). Education Path is affected too. These are composed server-side, not locale keys, so the generator needs the assessment language. Worst of the four: this is the report's payoff section and is unreadable to an Arabic-first parent.
  - NEXT STEPS: RESOLVED 2026-09-08. Two independent causes, neither of them a missing translation. The generator was already fully bilingual but was being fed the English career, because localizeCareer ran after it (6fc35a4); and narrativeLanguage was resolved from the stored preferredLanguage while isArabic beside it read Accept-Language, so the two disagreed for any signed-in reader with no stored preference (24ba9b4). The quoted strings specifically came from a third path: they are the basic action steps frozen in English in recommendations.action_steps at generate time, now composed at serve time instead (c341bde).
  - EDUCATION PATH: NOT A CODE BUG, closed 2026-09-08. Both report pages already read `rec.career.educationLevelAr` with an English fallback, the localizeCareer spread preserves that field, and the language variable at the render site is the same one every correct string on the page uses — all three verified rather than assumed. It rendered English because careers.education_level_ar was NULL: career-arabic-content.ts's payload had not reached prod. Confirmed by the same 2026-09-04 PDF, where the career TITLES and DESCRIPTIONS were English too — Lawyer, Product Manager, Journalist, Psychologist, Marketing Manager. IMPLICATION, and it is larger than this bullet: every Arabic report generated in that window showed English career content THROUGHOUT, not merely in Education Path. Prod now reads 68/68 on education_level_ar. CORRECTED 2026-09-08: the reason was NOT that the script was manual or unwired — it runs at boot from seed.ts:3129 and has since 2026-05-06. seedDatabase() was aborting before it. See the corrected entry below for the mechanism.

Also flagged: the Arabic report offers "get your full PDF report" wording that leads to the purchase page rather than a download. Check whether the English copy is equally misleading or whether the Arabic translation overpromises. Not a translation bug — a copy/gating question.

None of this is a regression from 3ba4941; all pre-existing. Belongs with the parked multi-country/localization workstream. First flagged 2026-09-05.

Also unreviewed: admin.json Arabic keys added 2026-09-05 for student-create validation (genderRequired, selectGenderReq, fieldRequired) were derived by mirroring the shape of existing entries rather than translated. Needs a native-Arabic reviewer pass. Admin-facing, not student-facing.

Extended 2026-09-05: three further admin.json keys added the same day for the school create/edit forms (countryRequired, selectCountryReq, countryNoCurricula) — same reviewer pass. Two are shape-mirrors like the batch above (countryRequired follows gradeRequired; selectCountryReq is selectCountryOptional minus its parenthetical). countryNoCurricula is different and carries more risk: it is a full sentence translated rather than derived from an existing string, so nothing constrains it to house wording. All six are admin-facing, not student-facing.

Extended 2026-09-07: one more, curriculumLockedNote, added with the country/curriculum lock on the school edit form. Same reviewer pass, and the riskiest of the batch so far — two full sentences with an {{n}} interpolation, translated rather than derived from any existing string, explaining WHY a control is disabled. If the Arabic is unclear the admin sees a dead select and no working explanation, which is worse than the untranslated case. Also unresolved for Arabic: the sentence reads "{{n}} مسجلين" for every count including 1, since the key interpolates n rather than i18next's count and so gets no plural forms; Arabic needs more forms than English, not fewer. A sibling key, curriculumLockedChecking, was added the same day for the still-loading state and carries the same caveat. Admin-facing, not student-facing.

Extended again 2026-09-07 (df937e3): seven more admin.json keys for the edit-student form — editStudentTitle, editStudentDesc, editStudentUsernameHint, updateStudentBtn, updatingStudent, studentUpdateSuccess, studentUpdateError. Same reviewer pass. Four are shape-mirrors of the create-form equivalents directly above them in the file (updateStudentBtn / updatingStudent follow createStudentAccountBtn / creatingStudentBtn; studentUpdateSuccess / studentUpdateError follow studentCreateSuccess / studentCreateError) and carry little risk. Three are new translated sentences and are the ones to check: editStudentDesc and editStudentUsernameHint both promise that the student's username and password will NOT change, which is the reassurance that stops an admin avoiding the form for fear of breaking a credential they have already handed out — if that promise does not read clearly in Arabic the key has failed at its only job. editStudentDesc also interpolates {{username}}, so the Arabic must place a Latin-script credential inside an RTL sentence without the surrounding text reordering around it; check it rendered, not just read. All seven are admin-facing, not student-facing.

Extended again 2026-09-07 (e9f8d81) — AND THIS BATCH IS DIFFERENT: four assessment.json keys for the school-owned fields on the Basic Info and Country steps — demographics.schoolOwnedNote, country.setBySchoolTitle, country.schoolOwnedNote, country.notSetBySchool. Every earlier batch in this note ended "admin-facing, not student-facing" and could wait for a reviewer. These are read by 13-18 year old students, in the assessment itself, and they are the ONLY explanation a student gets for why three fields on one screen and two on another will not accept input. A student who cannot read the reason sees a form that appears broken and has no way to learn that their school set those values or that their school administrator is who fixes a wrong one. Treat as the first student-facing entry in this note and review before the Arabic assessment flow is shown to a real school. demographics.schoolOwnedNote carries the extra load of saying that age, alone among the four fields on that screen, is still theirs to set — if that clause is lost in translation the student is left assuming the whole screen is locked.

Extended again 2026-09-07 (M1 date of birth): two more admin.json keys for the date-of-birth field on the student-create form — dateOfBirthRequired and dateOfBirthHint. Same reviewer pass, and back to admin-facing rather than student-facing. dateOfBirthRequired is a shape-mirror of gradeRequired / genderRequired directly above it in the file and carries little risk. dateOfBirthHint is the one to check: it is a new translated sentence, and its whole job is to tell the admin WHY a school is being asked for a minor's birth date — that it is there to derive the student's age at assessment time, and not as one more identifier collected for its own sake. An admin who cannot read that reason is being asked for a child's DOB with no stated purpose, which is a consent problem and not merely a translation one. Also worth a native eye: the field renders a NATIVE date input, so the picker's own month names, first day of week and value ordering come from the browser locale rather than from i18next — check in an Arabic browser that what the picker shows agrees with the label beside it, since nothing in this codebase controls it.

Extended again 2026-09-08 (c341bde) — AND THIS BATCH IS NOT IN A LOCALE FILE: two Arabic
strings for the basic action steps a report shows under "الخطوات التالية", added in
server/services/freeNarrative.ts (buildFreeActionSteps). STUDENT-FACING, and the second
student-facing batch in this note after e9f8d81.

Different from every batch above in a way that matters for how it gets reviewed: these are
HARDCODED IN TYPESCRIPT, not keys in client/public/locales/ar/*.json. A reviewer working
through the ar/ locale files — which is how every earlier batch here would be checked — will
never see them. They have to be reviewed in the source, and any future translation pass over
the locale files will silently miss them. The same is true of premiumNarratives.ts, which has
carried a much larger body of unreviewed Arabic action-step templates since before this note
began; this batch is the prompt to look at that file too, not just these two lines.

The strings are `أكمل {educationLevel}` and `طوّر مهاراتك في: {skills}`, both interpolating an
already-localized value. Two things for a native eye. First, أكمل is imperative "complete",
which reads correctly before a degree name but may not before every value educationLevelAr
holds — that column is free text and its contents were authored separately. Second, the skills
list joins on the Arabic comma (، U+060C) rather than a Latin one, which is right, but the
list items themselves come from requiredSkillsAr and their own register was never checked
against this sentence frame. First flagged 2026-09-08.

Extended again 2026-09-08: one assessment.json key, quiz.discardedNotice — the line shown when
a student returns to the quiz and finds their earlier answers gone because they changed their
subjects. STUDENT-FACING, and the third student-facing batch in this note after e9f8d81 and
c341bde. Back in a locale file, unlike the batch above.

Two specific things to check, rather than a general "please review":

  1. THE EM DASH. The Arabic reads «تغيّرت موادك، لذا إليك اختبارًا جديدًا يناسبها — كانت
     إجاباتك السابقة عن مواد لم تعد مختارة.» The dash mid-sentence is carried over from the
     English construction; Arabic more usually takes a comma or a new clause there, and a
     dash between two RTL clauses can also render ambiguously depending on the font. If it
     reads as a seam rather than a pause, split it into two sentences.
  2. «موادك» MUST MATCH THE SUBJECTS STEP. The student meets that word first on the Subjects
     screen, whose Arabic title is «ما المواد التي تحبها؟» and whose stepper label is
     «المواد». If this notice calls them something else, the sentence stops being about the
     screen the student just came back from. Confirm المواد is the right register here and
     not, say, «المقررات».

The line's whole job is to say that nothing went wrong — a rebuilt quiz is the correct
outcome of changing subjects, not an error. If the Arabic reads as an apology or a warning it
has failed even if every word is accurate. First flagged 2026-09-08.

Extended again 2026-09-08: four profile.json keys for the Plan & Access row — premium.title,
premium.access, premium.accessSchoolStudent, premium.accessSchoolAdmin. STUDENT-FACING for two
of them (a school student sees accessSchoolStudent on their own profile); the other two are
also seen by school admins.

Three checkable points:

  1. «الخطة والوصول» for "Plan & Access" is a literal pairing of two nouns. Confirm it reads as
     a section heading rather than a sentence fragment, and that الوصول ("access") is the right
     noun for what a student HAS rather than an action they perform.
  2. «وصول عبر المدرسة» ("access via the school") is the load-bearing one. It replaces a badge
     that said «مميز» (Premium) with a crown, which told a 13-year-old they had bought
     something their school bought for them. The Arabic must convey "your school provides this"
     without implying the student is a lesser tier than a paying one — the English "School
     access" is deliberately neutral, not a downgrade, and the register should match.
  3. «حساب مدرسة» ("school account") is shown to school ADMINS. Confirm it reads as a
     description of the account type and not as an instruction or a label for the school
     itself; «حساب مدرسي» is the likely alternative and a native eye should pick between them.

Also removed as orphans in the same change: premium.loading and premium.unavailable, which
only the old orgStats-dependent badge used. Nothing else referenced them. First flagged
2026-09-08.

Extended again 2026-09-07 (DOB age echo): one more admin.json key, dateOfBirthAgeToday — "Age today: {{age}}", rendered under the date-of-birth field as the admin types. Same reviewer pass. The word carrying the whole key is TODAY, and it is load-bearing rather than decorative: the age that ends up in the student's record is the age at ASSESSMENT time, which can be months later and a year higher, so an Arabic rendering that drops the temporal qualifier and reads as a bare "العمر" turns a confirmation into a promise the system does not keep. Check that the Arabic still says today, not just age. Two further things a reviewer should look at rather than read: the key interpolates a Latin-numeral {{age}} into an RTL sentence, so confirm the digits land after the colon and do not reorder against the label; and the number is interpolated as {{age}} rather than i18next's count, so it gets no plural forms — harmless in English, and worth a second look in Arabic where more forms exist and "العمر اليوم: 2" would not be how the number is spoken. Admin-facing, not student-facing.

Extended again 2026-09-07 (bulk CSV columns): three more admin.json keys for the bulk-upload format panel — csvDateFormatNote, csvColumnOrderNote and csvMissingColumns — and one REMOVED, csvPreFillNote, which named "name, age, gender" as the fields worth pre-filling and is wrong on two counts now that age is superseded by date of birth and gender is required rather than optional; it was deleted from both files rather than left unrendered, since a stale string is the one thing a reviewer cannot tell apart from a live one. All three new keys are full translated sentences rather than shape-mirrors, and they are the instructions an admin follows before uploading a file containing several hundred minors' records, so a vague Arabic rendering costs a re-export at best. csvDateFormatNote is the one to get exactly right: it contains the literal pattern YYYY-MM-DD and a Latin-numeral example, both of which must stay in Latin script and in that order inside an RTL sentence — if the Arabic renders the example as 14-03-2010, or reorders the pattern, it is instructing schools to produce files the server will reject row by row. Check it rendered, not just read. csvMissingColumns interpolates {{columns}}, a comma-separated list of Latin-script field names, into an RTL sentence and has the same embedding concern. Admin-facing, not student-facing.

Extended again 2026-09-07 (derived age) — STUDENT-FACING, mark this batch the way ec2a54f's was: two new assessment.json keys, schoolDataIncomplete.title and schoolDataIncomplete.body, plus a REWRITE of demographics.schoolOwnedNote. These are read by 13-18 year olds, and the two new ones are read by a student who cannot start their assessment at all — it is the entire screen they get, and the only thing telling them what is missing and who fixes it. A student who cannot read it sees a dead end and has no way to learn that their school administrator is the person to ask. Review before the Arabic assessment flow is shown to a real school. Deliberate constraint on the wording, which the Arabic must preserve: NOTHING in either key may read as an error or as the student's fault — nothing they did is wrong, their school simply has not entered a date of birth yet. If the Arabic renders this as a failure or a rejection it has inverted the one thing the copy is for. demographics.schoolOwnedNote is a rewrite rather than a new key and carries the opposite risk to the one flagged for it above: it used to end "You can still set your own age", which is now FALSE — age is derived from the school's date of birth and the field is locked like the other three. The new sentence says the age is worked out from the date of birth the school holds. An Arabic rendering that keeps the old promise, or drops the explanation of where the age comes from, leaves the student staring at a locked number with no account of where it came from.

Extended again 2026-09-08 (schoolOwnedNote shortened) — STUDENT-FACING, and it SUPERSEDES the demographics.schoolOwnedNote half of the derived-age batch above. That rewrite was too long for the screen it sits on. The new text is one sentence plus the ask: "Your school filled in your details. Please check they're correct — if anything's wrong, ask your school administrator." Two deliberate changes for a reviewer to preserve. FIRST, the age-derivation clause is GONE — the note no longer explains that the age is worked out from the date of birth the school holds, because the "set by school" marker on the age field carries that. The paragraph above asks a reviewer to check the Arabic keeps that explanation; it no longer applies, and an Arabic rendering that restores it re-lengthens the very string this change shortened. SECOND, the "check they're correct" ask is LOAD-BEARING and must survive translation intact. This is the only screen on which a student ever sees what their school recorded about them, and a wrong date of birth is silent: it produces a wrong derived age on every assessment they ever take, with nothing anywhere else in the product to catch it. An Arabic rendering that softens this into a statement — "your school entered your details" with no request to check — removes the single opportunity to catch that error. The unchanged constraints from the batch above still hold: nothing may read as an error or as the student's fault, and the school administrator must remain named as the person who fixes it. The Arabic now reads "أدخلت مدرستك بياناتك. تأكّد من صحتها — وإن كان أي منها خطأ، اطلب من مدير مدرستك تصحيحه." — shortened in step with the English and still carrying both the ask and the administrator.

Extended again 2026-09-07 (roster Age column): one new admin.json key, orgs.age ("Age" / "العمر"), a single-word column heading and about as low-risk as this note gets. Recorded for completeness and because of what it sits next to: orgs.gender was changed in the same commit from "Gender (optional)" to "Gender", so the Arabic lost its "(اختياري)" too. That was not a wording preference — gender has been REQUIRED at the student-create sink since 40cba56, and the header had been telling admins the opposite ever since. Worth a reviewer knowing the parenthetical was removed deliberately and must not be restored. A third key, orgs.selectGenderOpt ("Select gender (optional)"), was DELETED from both files in the same commit for the same reason: GenderSelect switched to selectGenderReq when the gate landed, so it had no code reference left and was a live-looking string asserting the opposite of the rule — invisible in the UI but not to anyone reviewing admin.json. Admin-facing, not student-facing.

### SuperadminDashboard renders raw error blobs — RESOLVED (fixed 2026-09-08 in 2d4fbfa and 9395256, closed 2026-09-08)
serverErrorMessage (client/src/lib/queryClient.ts) was added 2026-09-05 to parse the
"STATUS: {json}" shape that throwIfResNotOk produces.

CORRECTION to this entry's original claim that the helper was "applied across
AdminOrganizations.tsx": it was applied to most of that file, and three sites were missed
until 2026-09-08 — the downloadFile catch, the logo-upload catch, and the logo-upload throw
(2d4fbfa). Those three are worth distinguishing from the headline symptom: all three use raw
fetch rather than apiRequest, so they never produced the "STATUS: {json}" shape at all. What
they shared was the dead `||` fallback — error.message is always a non-empty string, so the
localized t() could never render, and an untranslated browser string ("Failed to fetch", or a
SyntaxError from a non-JSON error body) reached the admin in its place. The throw site is
deliberately left as-is: it re-throws the PARSED body's own message field, which
serverErrorMessage would return unchanged.

Also closed 2026-09-08 (9395256): SuperadminDashboard.tsx's own 19 sites, plus 16 more in the
admin components it renders as its tabs — CountryManagement (5), ScoringConfigEditor (5),
SubjectManagement (5), ContributeQuestions (1). Those were never named in this entry, and are
why it could not have been closed by fixing SuperadminDashboard.tsx alone: they are one screen
from the superadmin's point of view.

Two `error.message ||` sites remain in client/, both correct as they stand: StudentLogin.tsx
reads the parsed body's own message rather than a throwIfResNotOk string, and
AdminOrganizations' logo-upload throw is the one described above. First flagged 2026-09-05.

### The org-student journey has no language control at any point  (severity: medium)
There is no app-wide layout — App.tsx:130-151 routes straight to page components, and
components/layout/Header (which owns the toggle at :114-120, rendered :144-153 desktop and
:159-168 mobile) is imported only by Landing.tsx. Three pages hand-roll their own copy:
Login.tsx:62, Register.tsx:91, Profile.tsx:192.

StudentLogin.tsx — a school student's actual entry point — has no useLanguage at all.
Assessment.tsx:826-940 builds its own inline header and never got a language control.
Results.tsx reads language but cannot set it. So login -> assessment -> results has no
language control anywhere, for the cohort most likely to want Arabic. Their only route today
is the Profile button mid-assessment, i.e. leaving through the leave-confirm guard.

Fix is extracting a shared LanguageToggle and using it in all five places — not adding a
fifth hand-rolled copy. Three things to settle first:
- setLanguage PATCHes /api/users/me/language (LanguageContext.tsx:73), so a mid-assessment
  switch persists to users.preferredLanguage and changes the language of server-generated
  narrative and the report. Probably wanted, but it should be a decision, not a side effect.
- RTL through the assessment steps is untested; "Bug B — RTL career-page layout", under
  STILL OPEN in the "Arabic PDF report — session 2026-06-30" session-log entry, already
  carries open BIDI and overflow items against the Arabic report.
- BLOCKED ON: the four student-facing Arabic strings from ec2a54f are unreviewed. A switcher
  makes them reachable. Review before adding the toggle, not after.
First flagged 2026-09-07.

### DB endpoint guard is a blacklist and fails open on an unknown endpoint  (severity: medium)
server/db.ts:20 and drizzle.config.ts:18 refuse ONE hardcoded production endpoint id,
defaulted in source. Anything unrecognised is permitted, so a recreated Neon branch with a
new id, or a typo'd PRODUCTION_DB_ENDPOINT_ID, silently disarms the guard. The id is also
published in a public repo, and the same id is hardcoded as an ABORT check in five
scripts/oneoff/*.cjs files (those fail closed, so they are safe, just disclosing).

A whitelist inversion was written and verified on 2026-09-07 (shared/dbEndpoint.ts, both call
sites sharing one module, 14 tests, drizzle-kit resolution confirmed end to end) but parked
before commit: it is a boot-path change requiring ALLOWED_DB_ENDPOINT_ID on Render before
deploy, and the service refuses to start without it.

Note the tradeoff if resumed: a whitelist alone moves prod access from a typed override
(ALLOW_PRODUCTION_DB=true, required each time) into a config file that can go stale. Consider
keeping the override on top of the whitelist. First flagged 2026-09-07.

### Curriculum rename: two cascade gaps, one of them empties the quiz pool  (severity: HIGH)
MERGED 2026-09-09 from two adjacent entries that read as a duplicate in the heading list — the
assessments gap (first flagged 2026-09-07) and the organizations gap (severity raised
2026-09-08). They are different defects with different fixes and different phases, so both are
kept in full below; they are filed together because anyone reading one needs the other.

POST /api/superadmin/countries/:id/curricula/rename (superadmin.routes.ts:2385-2432) rewrites
countries.curricula, subjects and quiz_questions. It stops short of two tables that hold the
same string: assessments and organizations.

#### GAP 1 — organizations.curriculum  (HIGH, fix belongs at the rename)
A renamed curriculum leaves every school on it holding a string that no longer appears in
countries.curricula.

SEVERITY RAISED 2026-09-08 (admin-surface recon). The original entry called this an orphaned
column and reasoned about stale labels and a dropdown that cannot offer the value back. That
undersold it. organizations.curriculum is not a label — it is load-bearing input to the
assessment:

    server/routes/assessment.routes.ts:136
      curriculum: organization?.curriculum,

That value scopes which quiz bank a student's assessment draws from. After a rename the school
row holds the old string while subjects and quiz_questions hold the new one, so the lookup
matches nothing and THE QUESTION POOL IS EMPTY FOR EVERY SCHOOL ON THAT CURRICULUM. This is not
a cosmetic mismatch on existing records; it breaks the next assessment taken at those schools.
The rename returns { success: true, updated: { subjects, questions } } and reports no schools,
because it never counted any.

Consequences, worst first:
- Every subsequent assessment at an affected school draws from an empty pool
  (assessment.routes.ts:136). Nothing warns, and the rename reports success.
- If the school has students, the immutability lock (01e20cf) prevents correcting it at all —
  old-name to new-name is a change, refused unconditionally, superadmins included by design
  (admin.routes.ts:433-445). The supported answer the lock offers is "create a separate
  school", which is not a recovery from a rename.
- The school's stored curriculum no longer matches the edit form's availableCurricula lookup,
  so the dropdown cannot offer the value back.
- Enrolment (549cd43) and org creation (81ea920) both gate on the school's curriculum.

THE LOCK ALREADY REASONED ABOUT THIS CASCADE AND LOOKED AT THE WRONG TABLE. Its comment at
admin.routes.ts:416-420 cites the rename by name:

    // The nearest thing that exists is the curriculum RENAME cascade
    // (storage.renameCurriculumInSubjects / renameCurriculumInQuizQuestions), and it is
    // telling that it rewrites subjects and quiz_questions and stops short of assessments —
    // even relabelling a curriculum leaves those rows alone.

It notices the assessments gap — which mislabels historical rows — and does not notice the
organizations gap, which breaks the next assessment. Then it refuses the only in-product repair
for the damage it did not see. Worth recording as a reasoning failure and not just a missing
UPDATE: the comment is careful, correct about what it inspected, and inspected one table short.
Whoever fixes the cascade should also revisit that comment, because it currently reads as
having surveyed the cascade completely.

Net: a superadmin rename can put a school into a state only a direct DB write can fix. The
rename is the only path that produces it, so the fix belongs there, not as a carve-out
in the lock. Note the scope is larger than one UPDATE: the route runs four sequential
writes with no transaction at all (superadmin.routes.ts:2380-2432 — updateCountry,
renameCurriculumInSubjects, renameCurriculumInQuizQuestions, clearSubjectCache), so a
partial failure today already leaves a rename half-applied with no rollback and a 500 that
says nothing about how far it got. Fixing this means wrapping all four writes plus the new
organizations.curriculum update in a transaction that does not currently exist. Same defect
class as the orphan-user bug fixed in 8c07e25.

#### GAP 2 — assessments.curriculum  (medium, Phase 6)
renameCurriculumInSubjects and renameCurriculumInQuizQuestions (storage.ts:854-881) cascade a
curriculum rename through subjects and quiz_questions, but stop short of assessments.
assessments.curriculum keeps the old string, so a renamed curriculum leaves existing
assessment rows pointing at a value no longer in countries.curricula. This is the same
reconciliation gap that blocks a superadmin override on the org curriculum lock (01e20cf) —
neither can be closed until something can re-scope existing assessment rows. Phase 6.

WHY THE TWO GAPS DO NOT SHARE A FIX. Gap 1 is a missing UPDATE on a path that has no
transaction, fixable now at the rename route (47c5067 tracks the same distinction). Gap 2 needs
Phase 6 reconciliation, because re-scoping a historical assessment row is a decision about what
a completed assessment means, not a string rewrite. Do not close them in one commit.
First flagged 2026-09-07.

### studentGender accepts any non-empty string  (severity: low)
shared/schema.ts:157 documents 'male' | 'female' as the allowed values, but nothing enforces
it — not the create path (studentDemographicsSchema, schema.ts:1084-1088), not the PATCH
path, and no DB constraint. Any non-empty string is stored. Adding an enum must cover both
paths in one change; doing it on edit only would make create and edit diverge, which is the
drift the shared-split extraction was written to prevent. Existing prod rows are all 'male'
or 'female', so a CHECK is currently addable without a backfill. First flagged 2026-09-07.

### Subject-access export omits everything the school recorded  (severity: medium-high)
GET /api/users/me/export (user.routes.ts:39) returns users columns (:81-91) and all
assessments with recommendations, quiz and CVQ data (:93-98), but does not read
organization_members at all. A school student's own data export therefore omits
student_name, student_gender, grade and student_id — everything their school recorded about
them. Users are minors, so this is a live GDPR/PDPL subject-access gap, not a nicety. Adding
date_of_birth to that table (Phase 4 step 4) makes it worse. First flagged 2026-09-07.

### Brand name is authored independently in five layers  (severity: low, but blocks a rename)
"Future Pathways" appears 58 times across 21 files with no canonical definition: i18n locales
(31, of which 11 are in legal.json), hardcoded JSX bypassing i18n (Footer.tsx x2,
Landing.tsx:393, Profile.tsx:164, StudentProgress.tsx:102), server-side email.ts (8) and
research/sources.ts, static client/index.html (7 — title, meta, og:, twitter:, JSON-LD), and
docs. Arabic carries 30 occurrences of مسارات المستقبل, a literal translation.

Three things must be decided before any rename: the Arabic form (a coined compound has no
automatic Arabic equivalent — transliterate or keep a descriptive name); whether legal.json's
11 strings should track the product name at all, since they name the entity in the privacy
policy, terms, and PDPL/COPPA consent clauses and the registered entity may differ; and
whether to land a single BRAND_NAME in shared/ first.

Separately and more urgently: the sending domain does not match the site — see the FROM_EMAIL
item. First flagged 2026-09-08.

Extended again 2026-09-08: four more profile.json keys for the two profile block headings and
their captions — account.title, details.title, details.subtitleAssessment,
details.subtitleSchool. STUDENT-FACING: a school student reads all four on their own profile.

SUPERSEDED the same day by the block merge (029e678). Three of those four keys no longer
exist: the two blocks are one, so there is no heading pair and no per-block caption. Checkpoint
1 below is retired with them — it asked whether an Arabic PAIR read as a contrast, and there
is no pair. Do not review it; it will not match the page.

The keys actually needing Arabic review are now FOUR AGAIN, and different:
account.title («معلوماتي»), details.studentName («الطالب»), details.sourceAssessment and
details.sourceSchool (the two provenance sentences), plus assessment.completedOf
(«{{completed}} من {{cap}}»). ALL STUDENT-FACING — a school student reads every one on their
own profile.

Three checkable points:

  1. «الطالب» IS THE LOAD-BEARING ONE, and it renders in exactly one situation: the account
     name and the assessment subject's name differ, i.e. a guardian registered the account for
     a child. The word must read as "the person this assessment is about" and NOT as a form of
     address to the reader — the reader in that case is the parent, not the student. If a
     gendered or vocative reading creeps in, it names the wrong person on a page about a minor.
  2. «من سجلات مدرستك» ("from your school's records") is shown to a student whose school
     supplied their name, grade, age and gender. Confirm سجلات is the right word for an
     administrative record rather than an academic transcript, and that the sentence does not
     read as though the school is grading them. It is a provenance note, not a judgement. It
     is now a full sentence under the assessment fields rather than a block caption, so confirm
     it still reads as a note about those fields and not about the whole card.
  3. «{{completed}} من {{cap}}» — من is doing "of" in a ratio, not "from". Confirm that reads
     as a count against a ceiling to an Arabic-reading 13-year-old, and that the digits sit the
     right way round in RTL. This is the string that tells a school student they have one
     allocation and a free account that it has three.

First flagged 2026-09-08.

### Password reset is dead in production — RESEND_API_KEY unset, then FROM_EMAIL points off-domain  (severity: HIGH → MEDIUM, key set 2026-09-08, flow still unverified)
Render boot log, 2026-09-08:

    ⚠️  Optional environment variables not set:
      - RESEND_API_KEY

`resend` is constructed only when that key is present (email.ts:3), so in production it is
null and no mail is sent at all. Password reset is the entire outbound mail surface — one
`resend.emails.send` call in the codebase (email.ts:186), one sender
(`sendPasswordResetEmail`), one caller (password-reset.routes.ts:104). No other mail library
exists in server/. So password reset has been wholly non-functional for as long as the key
has been unset, and nothing else is affected because nothing else sends mail.

Who this locks out: anyone whose account has an email — individual users, org_admins and
superadmins. Org students without email are already routed to admin-managed credential reset
(password-reset.routes.ts:112-114) and are unaffected, but the admins who manage their
rosters are not: an org_admin who forgets their password has no self-service recovery, and
their whole school's roster management goes with them.

RESEND_API_KEY is classified OPTIONAL (constants.ts:89, "Required for email delivery" — the
comment already contradicts the classification) so boot prints a warning and continues. That
is the right call for Stripe, whose absence disables a feature; it is the wrong call here,
where the absent feature is account recovery. Worth deciding whether it moves to REQUIRED
alongside the SPACES_* keys, which were promoted on exactly this reasoning: "an unset value
is an outage, not a degradation" (constants.ts:76-77).

SECOND PROBLEM, downstream of the first and only reachable once mail works at all. EMAIL_FROM
defaults to "Future Pathways <noreply@futurepathways.com>" (email.ts:5, and .env.example:90
documents the default) while the product is futurepath.ae — index.html:7 canonical, and
APP_URL's own default at email.ts:176. Resend refuses to send from an unverified domain, so
either futurepathways.com is verified in the Resend account (deliverability fine; the name is
merely off-brand) or every send 403s. Verification requires DNS control, so there is no third
case. Even in the good case the From: domain would not match the domain in the reset link the
mail carries, which is a phishing heuristic that costs reputation with Gmail and Outlook.
Neither EMAIL_FROM nor its agreement with APP_URL is asserted at startup, unlike
SESSION_SECRET's length and DB_ENCRYPTION_KEY's format (env-validation.ts:44-53).

Fix order is: set RESEND_API_KEY, decide the sending domain and verify it in Resend, set
EMAIL_FROM to match, then consider promoting the key to REQUIRED. Do not reorder — the domain
question is unanswerable while no mail is sent. First flagged 2026-09-08.

UPDATED 2026-09-08: step one is done. The 06:52 deploy log validates cleanly with no
"optional environment variables not set" block, so RESEND_API_KEY is set and the Resend client
is constructed. Password reset is no longer dead at the first hurdle.

STILL OPEN, and the severity now rests on these rather than on the key: the sending domain is
not verified in Resend, and Resend refuses to send from an unverified domain — so a reset may
still fail, now at the API rather than at construction. Nothing has exercised the flow
end-to-end since the key was set, so "it sends" is untested rather than known. Two things to
do, in order: verify the domain EMAIL_FROM names (or point EMAIL_FROM at one already verified,
which also settles the futurepathways.com / futurepath.ae mismatch above), then send one real
reset and confirm it arrives rather than inferring it from the absence of an error.

SETTING THE KEY TRADED AN HONEST FAILURE FOR A SILENT ONE, and this is the part to carry
forward, because it is not obvious and it is live right now rather than hypothetical.

  Before: no key -> isEmailConfigured() is false -> the gate at password-reset.routes.ts:47
  returns 503 "Email service is not available. Please contact your administrator." The user
  is not told a reset is coming. Bad, but honest.

  Now: key set, domain unverified -> isEmailConfigured() is TRUE, because it is `!!resend` and
  a client was constructed. The gate passes. The send then 403s inside
  sendPasswordResetEmail, Resend refusing an unverified sending domain. The route logs that
  failure and deliberately does NOT change its response, so account enumeration stays closed —
  which means the caller receives the generic 200 and the green "Check Your Email" card for
  mail that was never accepted.

THE GATE ASKS WHETHER A CLIENT EXISTS, NOT WHETHER A SEND SUCCEEDED. That was a latent
distinction while the key was missing, since both questions had the same answer. Setting the
key separated them, and nothing else in the flow closes the gap: bf5e2f5 removed the NODE_ENV
escape hatch so the gate now fails closed in every environment, but a gate that cannot see a
rejected send has nothing to fail closed ON.

So a locked-out org_admin today gets the worst of both: no email, and a screen telling them one
is on the way. This lasts until the sending domain is verified in Resend — it is not a risk to
watch for, it is the current behaviour if the domain is unverified. Verify the domain first,
then send one real reset and confirm arrival; do not infer success from the absence of an
error, because the absence of a visible error is exactly the symptom.

### Nine .ts content migrations run at boot behind an unguarded prefix that can skip all of them  (severity: high)
server/migrations/career-arabic-content.ts supplies Arabic titles, descriptions, required
skills and education levels for careers. It is invisible to the migration runner —
runner.ts:51 filters allFiles.filter(f => f.endsWith(".sql")) and tracks applied names in
schema_migrations, so a .ts file is never seen and never recorded, and there is no npm script
for it.

CORRECTED 2026-09-08. The original of this entry — dictated, and wrong — said the script was
manual, unwired, and had never been run against prod at all. The correction matters because it
moves the defect somewhere else entirely. career-arabic-content.ts is invoked from
seed.ts:3129 and has been since aa08aff (2026-05-06), alongside eight other .ts content
migrations at seed.ts:3115-3188 — Grade 8 and Grades 9-12 quiz Arabic, values profiles, WEF
affinities, growth bands, future readiness, relatedSubjects — plus sector renames earlier at
seed.ts:2982. seed.ts runs on every boot (index.ts:216-217) and is idempotent by design, and
the "Career Arabic content: 68 updated" line in the deploy log is career-arabic-content.ts:581
printing its own result: the same file, not a separate duplicate implementation. Nothing here
needed wiring up. It already was wired.

THE REAL DEFECT is that the boot invocation can be skipped without leaving a trace. Each of
the nine apply calls has its own try/catch, but they sit ~2350 lines into seedDatabase(), and
five awaits ahead of them are outside any try block:

    seed.ts:2031   await storage.getAllCareers()
    seed.ts:2711   await storage.getAllQuizQuestions?.()
    seed.ts:2898   await storage.getAllCareers()
    seed.ts:2906   await storage.getCareerWefSkillAffinityCount()
    seed.ts:2969   await storage.getAllCountries()

One throw at any of them aborts seedDatabase() entirely. index.ts:217 is
seedDatabase().catch(console.error), which swallows it. The server then boots and serves
traffic normally with all nine content migrations silently skipped. storage.ts:913 is
db.select().from(careers) — every column in the Drizzle schema — so any drift between
shared/schema.ts and the prod careers table throws at seed.ts:2031, before the content block.
That is a sufficient and likely mechanism for prod serving English career content for months
while the code was correct the whole time. It also explains why nothing recorded when the
backfill finally landed: nothing recorded when it stopped failing, either. The absence of a
visible error was, again, exactly the symptom.

Fix direction, and it is NOT "make it a tracked migration or a boot step" — it is already a
boot step. Make the boot step's failure observable: guard the unguarded prefix so an early
throw cannot skip the content block, log an aborted seed at error level and surface it rather
than console.error, and assert coverage after the block on the career-growth-bands.ts:546 gate
pattern. Note that seed.ts:3196-3209 already does a version of that assertion for Arabic only
and wraps it in a bare `catch {}` that swallows its own failure.

STILL TRUE, and unchanged by the correction: it matches rows on eq(careers.title, item.title)
and logs a warning on a miss, so a catalog expansion leaves new careers with NULL Arabic until
someone adds their entries, and editing a career's English title orphans its Arabic content.
The stable key is careers.onetCode (shared/schema.ts:617, indexed at :621); all 68 seed
careers carry one, and career-growth-bands.ts already carries onetCode on all 68 of its own
entries while still matching on title. Switching to it needs NOT NULL + unique on the column
first, with an explicit Entrepreneur exception (schema.ts:577) — deliberately deferred
2026-09-08 as its own piece of work, not folded into the observability fixes above.

First flagged 2026-09-08, corrected 2026-09-08.

### Two adjacent defects in the same nine modules  (severity: medium)
Both found while correcting the entry above. Same shape of code, neither about Arabic.

WEF AFFINITY BACKFILL IS INSERT-ONCE, NOT IDEMPOTENT. wef-skill-affinities.ts:47 skips any
career that already has affinities (`if (existing.length > 0) continue; // Already seeded -
never overwrite.`). The other eight modules overwrite unconditionally, so re-running them
repairs drift; this one cannot. A wrong or stale affinity score can never be corrected by
re-running the backfill — it needs a manual DB edit, or a deliberate delete-then-reseed. The
comment states the intent, so this is a design choice to revisit rather than an oversight, but
it means "re-run the seed" is not a repair path for affinities the way it is for every other
piece of content data here.

A DUPLICATE CAREER TITLE CORRUPTS SILENTLY, WITH NO WARNING AT ALL. careers.title has no
unique constraint (shared/schema.ts:548; the table's only indexes are :621-623, on onetCode,
countryId and futureReadiness). Every title-matched module then takes .limit(1) —
career-arabic-content.ts:565-569, and the same shape at career-values-profiles.ts:439,
career-growth-bands.ts:508 and career-related-subjects.ts:64 — so two rows sharing a title
means an arbitrary one is updated and the other silently keeps stale content. This is WORSE
than the miss case documented above: a miss at least logs `⚠ Career not found` and increments
notFound, whereas the duplicate path emits no signal whatsoever and the run reports full
coverage. Any coverage assertion built on the notFound counters will not catch it. First
flagged 2026-09-08.

### A large body of Arabic lives outside i18n and outside the review path  (severity: medium)
premiumNarratives.ts and freeNarrative.ts carry hand-written Arabic — the seven-step,
three-grade-band action-step templates and their interpolations — as string literals in
server code, not as keys in client/public/locales/ar/*.json. The unreviewed-Arabic note in
this file assumes a reviewer working through the locale files; that reviewer would never see
any of this, and a future translation pass over ar/ would silently skip it.

This is student-facing content that reaches the report and the PDF. It has never been in the
review path.

SCOPED 2026-09-08. 2358 string literals containing Arabic across 11 files in server/. The
count splits into two populations that need different answers, so the single number overstates
the problem and the small number understates it:

  PROSE IN APPLICATION CODE — 130 literals, and the actual subject of this entry:
    106  server/services/premiumNarratives.ts   action-step and narrative templates
     14  server/services/freeNarrative.ts       free-tier reasoning + basic action steps
      7  server/services/email.ts               the password-reset email, subject and body
      3  server/routes/recommendations.routes.ts
  These are sentences a developer wrote inside logic. They belong in the locale files, or in
  a review track that someone actually owns. Note email.ts is on this list and is NOT report
  content — a whole bilingual transactional email is hardcoded there, which no earlier note in
  this file has mentioned.

  CONTENT DATA — 2228 literals:
    931  server/migrations/quiz-arabic-content-grades9-12.ts
    443  server/migrations/career-arabic-content.ts
    318  server/migrations/quiz-arabic-content.ts
    287  server/seed.ts
    202  server/questionBanks/uae/arabic.ts
     32  server/wefSkillsData.ts
     15  server/cvq-seed.ts
  Translated CONTENT rather than UI strings, so moving it into locale files would be wrong —
  it belongs in the database, and most of it is a backfill script's payload. But it is equally
  outside the ar/*.json review path, and career-arabic-content.ts has already demonstrated what
  that costs (see the entry above: its payload silently failed to reach prod for months, and
  every Arabic report in that window showed English career content throughout).

So the decision is not one decision. The 130 need a home in i18n or a named reviewer; the 2228
need a way to be reviewed as content and a way to be reliably applied, which is the tracked-
migration problem in the entry above rather than a translation problem. First flagged
2026-09-08.

### returnTo is produced twice and consumed nowhere  (severity: low, but blocks a real flow)
Two call sites append returnTo — Results.tsx handleSignUp (now /register, so it no longer
needs it) and Assessment.tsx:824 handleSaveAndLogin (returnTo=/assessment). Nothing reads it:
auth.ts:270 redirects to /login and discards the parameter, and grep finds only the two
producers.

The live consequence is on the second one: a guest who signs up mid-assessment lands on
/results or /, not back on the form they were filling. That is the case a working returnTo
would serve.

Implementing it is not a one-line fix. It has to thread through /login, the OAuth state
parameter, /register and /auth/callback, and it needs a same-origin allowlist — an
open-redirect surface on a platform for minors. server/auth.ts is also marked do-not-touch in
CLAUDE.md. Scope deliberately rather than as a side effect. First flagged 2026-09-08.

### A guest's earlier assessments are unclaimable by design  (severity: low)
assessment.routes.ts:186 mints a fresh guest token on every POST and overwrites the cookie, so
one token maps to exactly one row. A guest who completes two assessments has both ids in
localStorage but only the later token in the cookie — the earlier row's token exists nowhere
and it can never be claimed. Reusing the existing cookie at create time would fix it, but that
widens what a single token authorizes and is a separate decision. First flagged 2026-09-08.

### CONSTRAINT — student date of birth never leaves the school boundary  (standing rule, not a finding)
NOT SOMETHING TO CLOSE. This is a rule to check new work against, recorded here because the
analysis behind it (docs/v2-phase4-step4-recon.md §6, tracked as of 2026-09-08) is a set of
decisions NOT to add something, and a decision not to add something leaves no code to comment.

THE RULE: date of birth is stored, is visible to the school that entered it, and never crosses
that boundary. Everything downstream carries DERIVED AGE only.

Why DOB and not age: DOB is a standing identifier, is a common knowledge-based-authentication
factor, and combined with a name and a school substantially narrows a real child. An age is a
bounded integer that ages out. The whole reason student_age was replaced by date_of_birth
(migrations 015-017) was accuracy at assessment time, not a decision to circulate birth dates.

The surfaces this governs, and what each may carry:

- GET /api/admin/organizations/:id/members — MAY carry DOB. The one place it legitimately
  belongs: the school typed the value and the edit form prefills from this response. The
  explicit column allowlist there is what makes including it a decision rather than an
  accident; keep the allowlist.
- The members table UI — derived age, or nothing. A DOB column puts every student's birth date
  on one screen, which is the shape that leaks by screenshot and screen-share.
- GET /api/auth/user — THE CHOKE POINT. It sends predefined* fields to the STUDENT'S OWN
  BROWSER, and orgMember there is the full row, so DOB arrives automatically and must be
  dropped deliberately. Send predefinedAge, derived. There must never be a predefinedDob. A
  one-line slip here puts a minor's birth date in a JSON response any XSS or shared screen can
  read. auth.routes.ts carries this rule as a comment; that comment is load-bearing.
- JSON export POST .../export-students — derived age, not DOB. This file leaves the system: it
  is downloaded, emailed and dropped in shared drives. If DOB in an export is ever genuinely
  needed, that is a separate decision with its own approval, not a side effect of a schema
  change.
- Credential CSVs — no DOB. These carry plaintext passwords and have the shortest path to being
  forwarded.
- Report and PDF — derived age only. The PDF is the parent-shareable artifact; a birth date
  must never appear on it.
- Analytics — no age dimension exists today. A DOB-derived age dimension would be a new
  personal-data flow needing its own decision, not an extension of an existing one.

Related and separately tracked: the subject-access export gap above, which does not read
organization_members at all — the same table this constraint governs. Recorded 2026-09-08.

### careers.growthOutlook is scheduled for deletion, with no tracker  (severity: low)
The column is notNull, deprecated as an authored field, and derived from onetGrowthBand. Its
removal was scheduled by "A7" of docs/future-readiness-plan.md, which has never existed in any
commit. Nothing in FOLLOWUP mentioned it until now. Condition for removal: once no reader is
left that needs the prose string, drop the column. Recorded 2026-09-08 during a citation audit
(28fafee) that found 16 cited docs/ paths with zero commits behind them.

### Two seeded careers carry a knowingly-wrong growth value  (severity: low)
server/seed.ts records two careers whose honest growth cannot be expressed in the current five
tiers, each stored at "the lowest expressible tier" and flagged against a note that never
existed. A sixth tier is needed, or the two rows need a different representation. Recorded
2026-09-08.

### A growth-band exception cites a document that never existed, in the DATA  (severity: low)
server/migrations/career-growth-bands.ts:527 wrote { note: 'reviewed exception — see
docs/future-readiness-plan.md A3' } into the careers table. Not a comment — a value in the
database, presenting a nonexistent file as its provenance to anyone auditing growth bands. The
note text is fixed, but the per-row rationale for each exception now lives only in that file's
structure. Recorded 2026-09-08.

### "Phase 6" is defined twice in this file, incompatibly  (severity: medium — it misdirects a live deferral)
quiz.routes.ts:100 defers retiring users.isPremium as an entitlement flag to "the v2 license
rework (FOLLOWUP.md, Phase 6)". That deferral is load-bearing: it is the stated reason the
org_student conflation was NOT fixed by flipping the column, across ~15 server and ~10 client
read sites.

The pointer resolves to two different phases:

- :1148, in the older plan summary — "Phase 6: Career Journey (fill across grades, per-grade
  link fix, duplicate-grade prompt, soft-delete); dashboard (…)". Nothing about licensing. In
  that numbering the license rework is PHASE 4 (:1143).
- :1411, in the later list — "Phase 6 (license rework, the big one): consume-at-completion,
  unified self/school licensing, repurchase-sells-licenses, needs a real license table."

The later numbering is the one the shipped work follows: Phase 4 delivered mandatory school
country/curriculum, Phase 5 delivered the guest→account claim (04b01d0, c0c009d). So :1148 is
stale and its phase numbers are off by two from reality. A reader who lands on it first
concludes the licence deferral points at the Career Journey and that quiz.routes.ts cites the
wrong phase.

CORRECTION to how this was first written up: Phase 6 is NOT unscoped. :1411 gives it four
items. What it lacks is a scope — four bullets naming outcomes, with no statement of what
"consume-at-completion" changes, which tables a "real license table" replaces
(users.purchasedLicenses, organizations.totalLicenses/usedLicenses/isUnlimitedLicenses today),
or what happens to rows written under the current model.

Known to belong to Phase 6, gathered from this file and from the 2026-09-08 session:
- consume-at-completion (:1411)
- unified self/school licensing (:1411)
- repurchase-sells-licenses (:1411)
- a real license table (:1411) — replacing the counters on users and organizations
- retiring users.isPremium as an entitlement flag (quiz.routes.ts:86-105), which is what the
  response-only isPremium decoration in auth.routes.ts exists to work around
- the curriculum-rename reconciliation, which cannot close until something can re-scope
  existing assessment rows (47c5067, and the entry above)
- the free-retake cap of 3 (decision made, not implemented) — it changes what a licence is
  consumed BY, and the org-student allocation is currently the literal 1 in Profile.tsx and in
  useAssessmentAvailability.ts

Two fixes, and the first is cheap: reconcile or delete the :1148 numbering so one Phase 6
exists. Then scope the licence rework from the current schema rather than from a plan, since
the plan it would have been scoped from (docs/v2-rebuild-plan.md Phase 6) never existed.
Recorded 2026-09-08.


### A safeguard that contains the failure mode it guards against  (severity: process, not code)
Three instances in one session, which is why this is recorded as a pattern rather than filed
against any one of them.

- .gitignore:26-48 justified its allowlist on the grounds that git status would make an
  untracked doc obvious. It does not — git status never shows an ignored file, which is the
  entire point of ignoring one, and sixteen cited documents went missing without anyone
  noticing. That comment now carries its own correction.
- seed.ts's Arabic-coverage check, whose whole job was to report missing content, was wrapped
  in a bare `catch {}` that swallowed its own failure. Replaced in 9a93193.
- The coverage gate that replaced it (9a93193) contained an unguarded `await import()` inside
  its OWN catch — the exact bug class that same commit was written to report. Closed in
  ebd7939 by removing the await rather than wrapping it, since wrapping would have left a
  safeguard whose failure path was another safeguard.

Each was written by someone who had just understood the failure mode and did not apply that
understanding to their own code. The understanding was real in every case; it just stopped at
the boundary of the thing being fixed.

Worth a standing check: when adding a safeguard, ask what happens when the safeguard itself
fails. Concretely — does it report its own failure, or swallow it? Does the evidence it relies
on actually exist (git status showing an ignored file did not)? And does it contain an instance
of the very thing it detects? The third question is the one all three of these failed.

First flagged 2026-09-08.


### The old picker offered a subject no career has ever been tagged with  (severity: low, closed by data)
The pre-2026-08-27 subject picker had twelve tiles: Mathematics, Physics, Chemistry, Biology,
Computer Science, English, History, Geography, Economics, Business, Art, Music. Nine of those
resolve to something the matching engine can use — six are umbrella-6 members or fold into one
(Physics/Chemistry/Biology → Science, History/Geography/Economics → Social Studies).

Three do not fold: Business, Art and Music self-map in DEFAULT_SUBJECT_MAP
(server/utils/subjectMap.ts:69-79), so they normalise to themselves rather than to an
umbrella-6 subject. Business and Art were still MEANINGFUL picks at the time — 17 careers carry
the raw tag "Business" and 13 carry "Art", and before Piece D (221d496, 2026-08-31) the match
compared against raw career tags, so those students matched.

MUSIC NEVER MATCHED ANYTHING. Zero careers have ever been tagged with it: `git log -S "'Music'"`
over server/seed.ts returns no commit, so it is not a regression or a tag that was later
removed — the tile shipped against a catalogue that never referenced it. A student who picked
Music got a subject that was inert on the day they picked it, contributed nothing to
calculateSubjectsScore, and — because the denominator is the CAREER's tag count, not the
student's — did not even cost them anything. It simply did nothing, silently, and the report
gave no sign that one of their three choices had been discarded.

The cost was bounded by the flat-20 floor: a student whose picks were Music plus two other
non-folding tiles would have scored 20 on every career in the catalogue.

CLOSED ON THE DATA, 2026-09-08: prod holds 6 completed assessments carrying Art/Business/Music
and all 6 are test fixtures. No real student was affected. Recorded because the failure MODE is
the point — a picker tile and a career tag vocabulary that nothing checks against each other.
The umbrella-6 picker removed this particular gap by shrinking the picker to values the
catalogue uses, but nothing prevents the next tile, or the next career tag, from reintroducing
it. A test asserting that every picker tile projects onto at least one career would.

First flagged 2026-09-08.

### Legal documents describe a system that no longer exists  (severity: HIGH)
legal.json was last edited 2026-05-08 (57a6178) and its own lastUpdated string reads 6 April
2026. Migrations 014-017 landed since. The three pages are pure t() shells — the documents ARE
those 72 lines.

1. DATE OF BIRTH IS UNDISCLOSED. Both languages say data collected is "name, age, school, and
   country" (en:11/ar:11). student_age was dropped (017) and date_of_birth was made mandatory
   for every student row (016, schema.ts:179), school-supplied via four admin write paths. A
   birth date is a stable direct identifier for a minor; an age is not.

2. THE SCHOOL/STUDENT SPLIT IS DESCRIBED NOWHERE. The policy offers one sentence — "limited
   data ... with authorized educational institutions" (en:26) — and claims "anonymized
   insights for institutional reporting" (en:18). The code serves schools named per-student
   DOB, gender, email and RIASEC/CVQ extracts (storage.ts:2609, admin.routes.ts:1854, :1959),
   and lets a superadmin read any named student's results (superadmin.routes.ts:1639, :1693) —
   a recipient category the documents never admit exists.

3. CONSENT IS ASSERTED AND NEVER RECORDED. consentGiven appears nowhere in server/ or shared/
   — no column, no timestamp, no policy version. DemographicsStep.tsx:75-77 auto-ticks the box
   for org students, so the population where consent matters most never gives it. The
   COPPA/PDPL claim at en:22 rests on an artifact that does not exist. "Parental or
   institutional" consent names a branch with no implementation — there is no parent or
   guardian concept anywhere in the codebase. Separately: COPPA is US law for under-13s, cited
   for a UAE 13-18 cohort under UAE governing law. Needs a lawyer, not a developer.
   EXPANDED 2026-09-09 in "Consent is asserted to the child, obtained from nobody, recorded
   nowhere" below, which supersedes this paragraph's account of the mechanism: the auto-tick is
   the partial-enrolment fallback, a fully-enrolled student is skipped past the consent screen
   entirely (Assessment.tsx:526-548), and no terms acceptance exists for the school either — so
   the claim made to the child refers to no act at all. This paragraph's conclusion stands; its
   description of how consent is lost was one layer short.

4. RETENTION PROMISES NOTHING THAT SHIPS. No cron, TTL or purge for student data. Institutional
   deletion removes only the membership row (storage.ts:2752-2757), orphaning the child's
   psychometric record; a student who has completed an assessment cannot be removed at all
   (admin.routes.ts:1111). The self-service export and erasure endpoints work but no client
   code calls them, and the export omits the organization_members row, so it excludes the DOB.

5. THE ARABIC PREVAILS AND NAMES AN UNREGISTERED ENTITY. en and ar are structurally identical
   — same keys, same date, same gaps — so the Arabic is a faithful translation of an
   out-of-date document. Its one substantive divergence: the 11 entity strings translate the
   name and never carry the Latin form. Under UAE governing law (s7) the Arabic ordinarily
   prevails, so the prevailing text names an entity in no registry. Neither language gives a
   legal entity form, licence number, address, or named data controller.

NEEDS HUMAN REVIEW, not code: organizationEvents.affectedUserId (schema.ts:1378) has no
onDelete, so DELETE /api/users/me may FK-violate and 500. Data-dependent, unverified.

Do not rewrite the legal documents from this. They need a registered entity name, a named
controller, and a lawyer. A rewrite from the code would accurately describe the system and
still not be a compliant policy. First flagged 2026-09-08.

VERIFIED ON RECORD 2026-09-08, at the point of transcribing this out of the gitignored recon
doc and into this file. Every citation above was re-checked against the working tree and every
one holds: the 2026-05-08 edit date and the April lastUpdated string, the four en: line
references, the 72-line files, dateOfBirth at schema.ts:179, the DOB column in the members
query, deleteOrganizationMember touching only that one table, the isLocked block on deleting a
student who has completed an assessment, both superadmin routes, affectedUserId's missing
onDelete, and the count of Arabic entity strings — 11, with the Latin form appearing zero
times. consentGiven is confirmed CLIENT-ONLY: five occurrences, all in DemographicsStep.tsx and
Assessment.tsx, none in server/ or shared/, and Assessment.tsx:541 sets it true with the
comment "Institutional consent". The export and erasure endpoints exist at user.routes.ts:39
and :117; the only /api/users/me call anywhere in client/src is the language PATCH.

ONE ADDITION not in the original review, found while checking en:22. The same sentence says
Future Pathways "is designed for students aged 10+". The product's cohort is 13-18 and the
assessment's own grade vocabulary starts at grade 8. So the policy states an age floor three
years below the youngest user the system is built for — which, on a document already citing
COPPA, is the floor that would decide whether US under-13 rules were being invoked
deliberately. That is a question for the lawyer along with the rest of point 3, not a string to
quietly correct.

RELATED ENTRIES, so this does not fragment. Point 4's export gap is the same finding as
"Subject-access export omits everything the school recorded" (:1737), reached from the legal
side rather than the code side. Point 1 is governed by the standing DOB constraint (:2019),
which is the rule the documents fail to disclose rather than a rule the code breaks. Point 5 is
the legal half of "Brand name is authored independently in five layers" (:1745), whose own
unresolved question — whether legal.json's entity strings should track the product name at all
— is answered here: they must not, until there is a registered entity to name.

### Consent is asserted to the child, obtained from nobody, recorded nowhere  (severity: HIGH)
Full expansion of point 3 of "Legal documents describe a system that no longer exists" above.
That entry established that consentGiven is CLIENT-ONLY — five occurrences, all in
DemographicsStep.tsx and Assessment.tsx, none in server/ or shared/ — and that the COPPA/PDPL
claim at legal.json en:22 rests on it. This entry establishes what those five occurrences
actually do. It is worse than "the box is auto-ticked for org students", and the auto-tick is
the third-most-serious thing on the list.

Recon 2026-09-09, read-only. Every citation below was checked against the working tree.

#### 1. THE CONSENT SCREEN IS NEVER RENDERED FOR A FULLY-ENROLLED STUDENT
Assessment.tsx:526-548. When the school has supplied all four demographics fields — the normal
result of enrolment — the page fills them in, asserts consent, and steps over the screen:

    const allFieldsPreFilled =
      predefinedGrade && predefinedName &&
      predefinedAge !== null && predefinedAge !== undefined &&
      predefinedGender;

    if (allFieldsPreFilled && !assessmentData.name) {
      setAssessmentData((prev) => ({ ...prev,
        name: predefinedName, age: predefinedAge,
        grade: predefinedGrade, gender: predefinedGender,
        consentGiven: true, // Institutional consent
      }));
      setTimeout(() => setCurrentStep(2), 0);      // :548 — skips DemographicsStep

So for a normally-enrolled org student the consent section does not render at all. Not the
checkbox, not the "your school has provided institutional consent" sentence, not the link to
the Terms of Use, not the link to the Privacy Policy. Step 0 is stepped over and the only
screen in the student's journey that carries a legal disclosure goes with it.

THIS REORDERS THE WHOLE FINDING. DemographicsStep.tsx:75-77 — the auto-tick, and the thing this
recon was opened to examine — is the PARTIAL-ENROLMENT FALLBACK, not the main path. It runs
only when the school filled some but not all of name / date of birth / gender / grade. The
disabled checkbox is what a student sees when their enrolment record is INCOMPLETE. A complete
record shows them nothing at all.

Consequence for any fix: making the checkbox honest does not help the majority path, because
the majority path does not render it. A fix that only edits DemographicsStep would leave the
common case exactly as it is and would look, from the diff, like the problem had been solved.

BE PRECISE ABOUT WHAT IS AND IS NOT REACHABLE. The documents themselves are not hidden:
Assessment.tsx renders inside PageLayout (:947, :968, :995), PageLayout mounts Footer
unconditionally (PageLayout.tsx:29), and Footer links /privacy and /terms (Footer.tsx:17, :21).
So a student CAN reach the policies from the page footer. What never happens is anyone telling
them those documents govern what they are about to do, or that the psychometric profile they
are about to produce will be readable by their school. Reachability is not disclosure. Outside
DemographicsStep and the two policy pages themselves, /terms and /privacy are linked from
exactly two places in the whole client — Footer.tsx and the Landing page footer
(Landing.tsx:406, :410).

#### 2. NO TERMS ACCEPTANCE EXISTS FOR THE SCHOOL EITHER — SO THE CLAIM REFERS TO NO ACT
consentOrg (en/assessment.json:94, ar:94) tells the child, in their own language:

    "Your school has provided institutional consent. You agree to the Terms of Use and
     Privacy Policy."

There is no act anywhere in the product that this claim could refer to. Not an act that went
unrecorded — no act. Searched for any acceptance, checkbox, link or attestation on every
surface where an adult transacts with the product:

| Surface | Result |
|---|---|
| Register.tsx | No terms, privacy, consent, agree or legal string of any kind |
| GroupPricing.tsx (the school's purchase path) | Same — nothing |
| Checkout.tsx | Nothing. One unrelated comment at :111 matches on the word "value" |
| StudentLogin.tsx | Nothing |
| Login.tsx, TierSelection.tsx | Nothing |

A school admin creates an account, buys licences, and creates dozens of minors' accounts
without being shown the Terms of Use or the Privacy Policy once, let alone being asked to
accept them or to attest that the school holds guardian consent for the children it is
enrolling.

THIS IS THE FINDING THAT OUTRANKS THE AUTO-TICK, and the reason the auto-tick is third on this
list rather than first. An auto-ticked box misattributes a real consent to the wrong party —
bad, but there is something real underneath it to re-attribute. This box attributes a consent
that was never given by anybody. The sentence shown to the child is not a mis-statement of the
record; there is no record, and no procedure that would ever produce one.

#### 3. THE FREE FLOW'S ONE GENUINE TICK IS VOIDED BY CLOSING A TAB
Assessment.tsx:449, in the resume-a-draft path:

    const hydratedData: AssessmentData = {
      name: inProgress.name ?? "",
      ...
      consentGiven: true,          // :449 — unconditional, not gated on account type

Every other field in that object is hydrated from the saved row with a `??` fallback. Consent
is the one field that is invented. It is not gated on org membership, so it applies to the free
flow too — the only population in the product that ticks the box itself. A self-registered
student who declined the box, abandoned the assessment and came back has consent asserted for
them on resume. The single place in the entire system where consent is genuinely obtained is
defeated by closing a tab.

Also note what this means for the DB: assessments has no consent column and
insertAssessmentSchema omits nothing consent-shaped, because there is nothing to omit. The
value is form state that dies with the tab. Nothing is being lost on resume, because nothing
was ever stored — the hydration is inventing a value to satisfy `canProceed`
(DemographicsStep.tsx:94), which is the same reason the auto-tick exists.

#### 4. WHERE INSTITUTIONAL CONSENT WOULD HAVE BEEN RECORDED — nowhere, and no column exists
| Checked | Result |
|---|---|
| `grep -rn consent server/ shared/` | Zero matches. The one hit, seed.ts:494, is a quiz question about medical history-taking |
| organizations (schema.ts, 31 columns) | Licences, reward credits, payment, curriculum, password complexity. No terms-accepted flag, no acceptance date, no signatory, no policy version |
| organization_members | studentId, name, DOB, gender, grade, role, quota, password-reset audit. Nothing consent-shaped |
| organization_events | Seven recorded event types (licence, admin add/remove/promote, org create, bulk licences, bulk delete). None is consent-related |
| assessments / insertAssessmentSchema | No consent column; the value is never transmitted |

So this is genuinely new storage, not a migration of something that exists in the wrong place.
That is the one piece of good news in the entry: nothing has to be reconciled, because nothing
was ever written.

#### 5. WHAT A CONSENT RECORD NEEDS, AND WHY THE POLICY VERSION CANNOT CURRENTLY BE NAMED
Minimum fields: the data subject; WHO gave it and in what capacity; timestamp; WHICH POLICY
VERSION they were shown; evidence of channel (actor user id, IP/UA, or a reference to a
countersigned document); the scope consented to; and withdrawal state. PDPL Art. 6 and GDPR
Art. 7(1) both put the burden of DEMONSTRATING consent on the controller. A stored boolean is
not a demonstration — and here there is not even a boolean.

The storage shape for all of that is easy. The policy-version field is the one that cannot
currently be filled, and it fails in four independent ways.

legal.json carries exactly one version marker, `lastUpdated: "Last updated: 6 April 2026"`
(en/legal.json:4):

1. IT COVERS FOUR DOCUMENTS AT ONCE. Privacy, terms, disclaimer and the fourth section share
   the single string. You cannot say which document changed, therefore you cannot say what a
   given consent was a consent to.
2. IT IS A DISPLAY STRING IN A TRANSLATION BUNDLE, NOT DATA. `"Last updated: "` is inside the
   value; it must be parsed to be a date. Versions belong in a source of truth that is not
   itself translated.
3. IT IS PER-LOCALE AND CAN DISAGREE. ar/legal.json carries its own copy. Two renderings of one
   document must be able to prove they are the SAME VERSION; here they are two independent
   strings that nothing reconciles.
4. NOTHING ENFORCES IT. Editing s5Body does not touch line 4. The git history of the file is
   the only real version record, and a stored consent row cannot reach it.

And the marker currently reads 6 APRIL 2026 — five months in the future as of this recon
(2026-09-09). The single version identifier in the system is a date that has not happened. A
consent row stamped with it today would cite a document dated after the consent it records.

WHAT WOULD ACTUALLY IDENTIFY A VERSION: a content hash of each served document, per document
and per locale, written into the consent row, plus a monotonic version string held outside the
locale bundles. The bundles then carry the rendering; the version is data. That also turns
re-consent into a comparison rather than a judgment call about whether an edit was material.

#### 6. SEQUENCING — documents, then version, then consent. In that order.
The policies as written describe a system that no longer exists (the entry above, severity
HIGH, five separate divergences). Version-stamping consent against them stamps a document
already known to be wrong, and THE FIRST STAMPED VERSION BECOMES THE ONE THAT WOULD HAVE TO BE
PRODUCED in a PDPL or subject-access response — the earliest, most-cited, least-defensible
text in the system's history, permanently referenced by every consent row written before the
rewrite. Fix the documents, then version them, then record consent against the version. Doing
it in any other order manufactures the evidence against itself.

This is also why nothing here should be built yet. The storage shape is the easy part and the
temptation is to build it first because it is buildable; it is the part that must come last.

#### 7. WHOSE CONSENT IT IS — PROPOSED, NOT SETTLED
Recorded as a proposal so it is not re-derived, and marked so nobody implements it as decided.
NONE OF THE FOUR BELOW IS APPROVED.

The position: it is the school's consent to give and the student's to be told. Two different
acts. The product performs neither, and the auto-tick collapses them into one that gets both
wrong — it does not obtain the school's, and it puts the student's name on it.

Why the child's consent is the wrong instrument on the merits and not merely procedurally: for
a 13-18 cohort doing a school-directed activity, consent from the child cannot be FREELY GIVEN
in the sense either law means. They are in a classroom, a teacher told them to do it, and
refusal carries a social cost. GDPR Art. 8 puts the digital-services threshold at 16 (13 with
member-state derogation) and PDPL requires guardian consent for minors; but the freely-given
problem would remain even above those thresholds. Asking the student harder does not fix it, it
launders it.

PROPOSED (1) — THE SCHOOL CONSENTS ONCE, AT ENROLMENT, AS A RECORDED ACT BY A NAMED ADMIN.
Who, when, policy version, plus an explicit attestation that the school holds guardian consent
for the students it enrols. Attached to the organization. The natural home is org creation or
licence purchase, where the school is already agreeing to a commercial arrangement, so the
legal one costs no extra step and lands on an adult with the authority to give it.

PROPOSED (2) — THE STUDENT IS NOTIFIED EVERY TIME, NOT ASKED. Keep the screen, delete the
checkbox. A plain age-appropriate statement in their language naming their school, what is
collected, that their school can read their results, and how to object — with the links. AND
IT MUST RENDER ON THE PREFILLED PATH (finding 1), which today skips it; that is the half of
this proposal that actually changes what most students see. Removing the control also removes
the false artifact: with nothing to click, nobody can later point at a tick and say the child
agreed.

PROPOSED (3) — NO PARENT-FACING FLOW. The school attests it holds guardian consent; that
attestation is the record. Building a parental channel means storing contact data for the
parents of minors — a new data class, to solve a problem the school is already positioned to
own. There is currently no parent or guardian concept anywhere in the codebase and this
proposes not to introduce one.

PROPOSED (4) — WITHDRAWAL MUST NOT ROUTE THROUGH THE SCHOOL, since the school is the party
whose consent is being relied upon. At minimum the privacy contact in the policy
(privacy@futurepath.ae) has to reach someone who can act without the school's involvement.
That is a policy and staffing commitment, not code.

RULED OUT, and recorded so it is not proposed again: making the checkbox INTERACTIVE for org
students. That hands a child a veto they cannot meaningfully exercise, and it makes the record
worse rather than better — a tick from a 13-year-old under classroom conditions is a weaker
artifact than a school attestation, while looking to an auditor like consent was obtained.

SEPARATE AND HARDER, flagged not solved: the FREE FLOW has a real self-tick (consentAgree) plus
under18Note telling the user that under-18s need parental or institutional consent, with no
mechanism to obtain either and no school to move the obligation to. Finding 3 already voids
that tick on resume. None of the four proposals above addresses it, and it does not follow from
this decision.

NEEDS A LAWYER, NOT A DEVELOPER, carried forward from point 3 of the legal entry: COPPA is US
law for under-13s, cited for a UAE 13-18 cohort under UAE governing law, in a document that
also states an age floor of 10+. Whichever way that resolves changes who must consent, so it
constrains proposal (1) rather than following from it.

First flagged 2026-09-09. Nothing to be built until the documents are settled.

### Impersonation is a no-op that reports success  (severity: HIGH — it misleads the operator)
POST /api/superadmin/impersonate/:userId (superadmin.routes.ts:1806-1837) writes one thing:

    (req.session as any).impersonating = { originalUserId, targetUserId, startedAt };

Nothing reads it. `grep -rn "impersonat" server/` returns that route, its stop-impersonation
partner (:1839), and one unrelated string in a quiz question. Not deserializeUser, not
isAuthenticated, not any middleware or handler. The session key is written and never consulted.

The UI believes otherwise. SuperadminDashboard.tsx:357-368 toasts "Now impersonating user" and
hard-navigates to / (:364), where the superadmin is still themselves. There is no impersonation
banner anywhere in client/, and nothing calls /api/superadmin/stop-impersonation — the exit is a
route no UI invokes.

WHY THIS IS WORSE THAN A DEAD BUTTON. The failure mode is not "nothing happens", it is "the
operator is told something happened". A superadmin investigating a student's report of a broken
assessment clicks impersonate, is told they are now that student, lands on the app, and sees
their own account. Whatever they conclude from that screen — it works, it does not, the data
looks right — is a conclusion about the wrong account, drawn with confidence. The button
manufactures false evidence about a minor's account, which is a worse state than not having the
feature.

BEFORE ANYONE BUILDS THIS, not after:
- Impersonating a minor's account needs an audit trail: who impersonated whom, when, for how
  long, and ideally why. That is a decision to take first, because it is the part that makes
  the feature defensible under PDPL rather than a silent read of a child's psychometric record
  by an unnamed operator. Retrofitting audit onto a shipped impersonation feature means a
  window with no record of who looked at what.
- A working implementation is not just the middleware read. It needs the persistent banner (the
  operator must never be able to forget they are someone else) and a reachable exit path. Today
  neither exists, so "make the middleware honour the flag" would produce a superadmin stuck
  inside a student's session with no visible way out — a worse bug than the current one.
- Removing the button is a legitimate outcome and is cheaper than all of the above. That is a
  product call, not a code call.

Do not fix by making the flag work. Decide first whether the feature is wanted; if it is, audit
trail and banner and exit are part of the minimum, not follow-ups. If it is not, delete the
route, the mutation and the button together. First flagged 2026-09-08.

### Destructive admin actions have inverted friction  (severity: HIGH — minors' data, no undo)
Confirmation, audit and undo are distributed across the admin surface in almost exactly the
wrong order. The actions with the widest blast radius have the least friction.

The clearest statement of the inversion: deleting ONE school requires typing its name
(SuperadminDashboard.tsx:2341, typed-name modal). Deleting FIFTY takes a browser confirm()
(:1081). Resetting ONE HUNDRED students' passwords takes nothing at all (:1333, bare onClick).

WHAT IS AUDITED. organization_events rows are written for exactly seven actions — admin add
(superadmin.routes.ts:461), admin remove (:523), admin promote (:567), licence change (:663),
org create (:863), bulk licences (:1028), bulk org delete (:1594, but see the needs-human-review
item below). scoring_config_change_log covers the four scoring writes. Everything in both
tables below is unrecorded.

#### Touching a student's data

| Action | Confirm | Audit | Undo |
|---|---|---|---|
| **Bulk password reset**, up to 100 students (SuperadminDashboard.tsx:1333 → superadmin.routes.ts:1517) | **None** — bare onClick, no dialog | **None** | None. Old hashes gone |
| Single password reset (:2397 → :1475) | Modal | **None** | None |
| **Delete a file** (:1603 → :1770) | **None** — bare onClick | **None** | None. Object then row, both permanent |
| **Impersonate** (:1470 → :1806) | **None** | **None** | n/a — no-op, see entry above |
| Delete a school, incl. members + files (:2341 → :1431) | Typed-name modal | console.log only (:1462) | None |
| Bulk delete schools (:1081 → :1572) | Native confirm() | Attempted, likely lost | None |
| View any student's results (:1639, :1655) | n/a | **None** | n/a |
| Export all students nationwide (:1693) | n/a | **None** — rate limiter only | n/a |

The two with no dialog at all are the ones to look at first. **Bulk password reset** rotates up
to 100 minors' credentials on a single click of a button sitting next to a column of checkboxes;
the plaintext passwords come back in the response, every affected student is locked out, and
there is no record that it happened or who did it. **File delete** permanently destroys a
student PDF from object storage and then the database row from one unguarded icon button — the
route is careful about ordering (:1770-1799, object first so a failure is visible) and has no
confirmation in front of it.

#### Touching a school's or the system's configuration

| Action | Confirm | Audit | Undo |
|---|---|---|---|
| **Country repopulate** — overwrites 13 columns incl. curricula from LLM output (CountryManagement.tsx:164 → country.routes.ts:550) | **None** | **None** | None |
| **Curriculum rename** across 3 tables, non-transactional (superadmin.routes.ts:2380) | Modal only | **None** | None — see the rename entry |
| **Delete a subject** referenced by live questions (superadmin.routes.ts:2288) | Dialog | console.log (:2297) | None |
| Clone subjects across curricula (:2315) | Dialog | **None** | None |
| Career create/update/**delete** (:1973/:2013/:2058) | **None** on delete (:1750) | **None** | None |
| **Bulk apply Arabic to all careers** (:2071) | **None** (:1687) | **None** | None |
| Announcement create/update/**delete** (:1867/:1897/:1927) | **None** on delete (:1666) | **None** | None |
| Remove / promote an org admin (:1914/:1905) | **None** | Yes (:523/:567) | None |
| **Delete LLM API credential** (ScoringConfigEditor.tsx:495) | **None** | Yes | None |
| Edit i18n bundles, career/CVQ/question Arabic (TranslationManager) | **None** | **None** | None |
| **Delete a quiz question** (Admin.tsx:411 → admin.routes.ts:189) | **None** — bare onClick | **None** | None |

Country repopulate is the sharpest of these. One unconfirmed click hands an LLM write access to
the curricula list that every school row, subject row and quiz question is keyed on
(country.routes.ts:571-585 overwrites curricula and subjects among thirteen columns), with no
preview of what it is about to change and no diff against what is there. It is the same damage
class as the curriculum rename entry above, reached without even naming the curriculum.

ONE THING THAT IS RIGHT, so it is not re-litigated: ScoringConfigEditor is the best-audited
surface in the codebase. scoring_config_change_log records changedBy, previousValue and
newValue, and the tab renders it (ScoringConfigEditor.tsx:113). Its one gap is small and worth
noting separately: the server reads req.body.changeReason into changeDescription
(superadmin.routes.ts:1134) and the client sends only { weights } (ScoringConfigEditor.tsx:119),
so every weights row has changeDescription: null. The audit trail records what changed and never
why.

DO NOT FIX BY ADDING CONFIRM DIALOGS EVERYWHERE. The useful shape is a rule about which class of
action needs which control — typed-name for irreversible multi-record deletes, an audit row for
anything touching a student's credentials or files, a preview-diff for LLM overwrites of shared
configuration — applied once, rather than 20 individual dialogs added in 20 commits. Deciding
that rule is the work; the dialogs are the easy part. First flagged 2026-09-08.

### NEEDS HUMAN REVIEW — two admin-delete claims read from schema, not executed  (severity: unverified)
Both surfaced during the 2026-09-08 admin recon. Both are read from the schema and the SQL, and
NEITHER WAS RUN AGAINST A DATABASE. They are recorded so they are not re-derived, and flagged so
nobody acts on them as established fact.

1. BULK ORG DELETE MAY NOT WORK AT ALL, AND MAY MISREPORT WHEN IT DOES.
   POST /api/superadmin/organizations/bulk/delete (superadmin.routes.ts:1572-1620) calls
   storage.deleteOrganization(orgId) directly (:1590) — a bare DELETE FROM organizations
   (storage.ts:3556-3561). The single-org delete (:1431-1467) does not, and its own comments say
   why: members, events and files are FK'd with no cascade. The schema agrees —

       shared/schema.ts:152   organization_members.organization_id  notNull, no cascade
       shared/schema.ts:1316  files.organization_id                 nullable, no cascade
       shared/schema.ts:1365  organization_events.organization_id   notNull, no cascade
       shared/schema.ts:813   quiz_questions.contributed_by_org_id  nullable, no cascade

   If that reading is right, bulk delete raises 23503 for any school with members, events, files
   or contributed questions — that is, every real school. The error is caught per-org
   (:1605-1607) and folded into { success: false, error: <pg message> }, so the UI shows a
   partial-failure count rather than "this operation does not work".
   And for a school empty enough to delete, the NEXT statement inserts an organization_events
   row pointing at the org just deleted (:1594-1602) — a notNull FK to a row that no longer
   exists. That insert would throw, be caught by the same handler, and the org reported FAILED
   although it is gone. The audit row is lost either way.
   TO VERIFY: attempt a bulk delete of one populated and one empty test school against a real
   database and read the per-org results. Do not do this against production.

2. DELETING A SCHOOL MAY LEAVE ITS STUDENTS' ACCOUNTS AND ASSESSMENTS BEHIND.
   Single-org delete (superadmin.routes.ts:1431-1467) removes organization_members, events and
   files, then the org. It does not touch the users rows those member rows pointed at, or their
   assessments and recommendations. Org students would keep working credentials
   (accountType: 'org_student') and a login belonging to no school.
   Flagging as PDPL-adjacent rather than asserting a violation: "delete the school" may
   legitimately not mean "delete the children's accounts" — a student may be re-enrolled
   elsewhere, and cascading a delete into minors' assessment records is not obviously the safer
   default. But whichever it means is currently undocumented and unenforced, and the code does
   not record which was intended. That is the finding: not that the behaviour is wrong, but that
   nobody chose it.
   RELATED: this is the same shape as point 4 of the legal-documents entry — institutional
   deletion removing only the membership row (storage.ts:2752-2757) and orphaning the child's
   psychometric record. That entry reached it from the retention-policy side; this one from the
   delete-a-school side. One decision closes both.

First flagged 2026-09-08.


### Arabic unreviewed — instrument names removed from the student's report  (severity: low)
Commit 1 of the methodology-exposure change edited three Arabic strings and none has been
reviewed by an Arabic speaker:

- `ar/results.json:64` `featureLearningDesc` — `استبيان هولاند (RIASEC) المكوّن من 30 سؤالاً`
  became `استبيان الشخصية المهنية المكوّن من 30 سؤالاً`. This also removes an RTL/Latin script
  break: the old string embedded the bare Latin acronym mid-sentence in Arabic text, so the
  Arabic reader got jargon and a direction switch in the same phrase.
- `ar/pricing.json:12` `feature2` — `مخزون شخصية RIASEC المهنية` became `مخزون الشخصية المهنية`.
- `ar/pricing.json:14` `feature4` — `ملف القيم الشخصية (CVQ)` became `ملف القيم الشخصية`.

SEPARATE TERM QUESTION, deliberately NOT fixed here. `feature2` renders "inventory" as
`مخزون`, which is inventory in the stock-of-goods sense, not the psychometric sense. The
sibling string in results.json uses `استبيان` (questionnaire), which is the right register.
So the two surfaces now describe the same instrument with two different nouns, one of them
probably wrong. It was left alone because this commit's scope was removing the acronym, and
changing the noun is an Arabic wording decision that wants a speaker rather than a
find-and-replace. Worth folding into the standing Arabic/RTL audit below.

Recorded 2026-09-08.


### Arabic unreviewed — weights as sentences  (severity: low)
Commit 2 of the methodology-exposure change added eight Arabic strings and edited one; none
has been reviewed by an Arabic speaker:

- `ar/results.json` — seven new weight sentences (`weightSubjects`, `weightInterests`,
  `weightVision`, `weightRiasec`, `weightCvq`, `weightWefSkills`, `weightGeneric`), all of
  the shape `تحتسب ... بنسبة {{pct}}% من هذا التطابق.` These replace `weightLabel`
  (`وزن {{pct}}%`), which was noun-first and worked as a label but not as a clause — so
  these are new sentence constructions, not translations of an existing one, and are the
  least reviewed strings in the change.
- `ar/results.json` `careerConnectionWeight` — new: `في جميع مطابقاتك، يحتسب ما تُقدّره بنسبة
  {{pct}}% من كل درجة.`
- `ar/results.json` `careerConnectionTitle` — `(وزن 20%)` removed from the heading.

`weightGeneric` interpolates `{{component}}` from the stored breakdown's English
`displayName`, so an unmapped component renders an English noun inside an Arabic sentence.
That is the same mixed-run bidi hazard as leak (b) above, reached by a different route. It
only fires for components absent from COMPONENT_BREAKDOWN_META (today: marketDemand), so it
is rare rather than absent — worth folding into the bidi pass rather than fixing alone.

Recorded 2026-09-08.


### Arabic unreviewed — landing-page instrument citations  (severity: low)
Commit 3 of the methodology-exposure change added two Arabic strings, unreviewed:

- `ar/landing.json` `research.personalitySource` — `المصدر: نموذج هولاند (RIASEC) لأنماط
  الشخصية المهنية، Making Vocational Choices (1997)`
- `ar/landing.json` `research.valuesSource` — `المصدر: نظرية شوارتز للقيم الإنسانية الأساسية
  (1992)`

DELIBERATE MIXED SCRIPT, unlike the strings commit 1 removed. `(RIASEC)` and the English
work title are kept in the Arabic because a citation's job is to be looked up, and a
transliterated title cannot be. That is the opposite call from `ar/results.json:64`, where
the same acronym was removed — the difference is audience, not consistency: the student's
report explains, this line is evidence for an evaluator. It does mean this string carries
the mixed LTR/Arabic run described in bidi leak (2) above and should be eyeballed in the
rendered Arabic landing page, not just read in the JSON.

Recorded 2026-09-08.


### Job-market data feeding every match score is Math.random()  (severity: HIGH)
Surfaced during the 2026-09-09 landing recon, but it is not a landing-page problem. The copy
claim is downstream of it.

`job_market_trends` is populated once, in the seed, from a random number generator:

    server/seed.ts:2058   demandScore: 50 + Math.random() * 50,          // 50-100
    server/seed.ts:2059   growthRate: Math.random() * 30,                // 0-30%
    server/seed.ts:2065   openings: Math.floor(Math.random() * 1000) + 100,

`nationalPriorityAlignment` (:2060-2064) is the one field with any signal in it — it checks
`career.relatedSubjects` against `country.prioritySectors` — and then picks a random number
inside whichever of two bands that check selects. There is no fourth field. Every number in the
table is generated, and the row is written per career × per country, so the volume of it
disguises how little is there.

THE TABLE HAS EXACTLY ONE WRITER AND NO INGESTION PATH. `storage.createJobMarketTrend`
(storage.ts:924) is the only insert, and the seed is its only caller — `grep` over `server/` for
`jobMarketTrend` outside `seed.ts` returns the three storage readers (:931, :938, :951-958), the
matching service, and three test fixtures that stub it as an empty Map. Nothing fetches, imports
or refreshes this data. There is no admin surface for it, unlike careers, questions and
curricula.

IT REACHES THE STUDENT. `matching.ts:315` groups the trends by career and hands them to the
scorer, so a component of every career match score every student has ever received is a random
number. It is not a random number held constant, either: it is regenerated on any seed run that
finds the table empty, so the same student re-scored after a reset gets a different answer for
reasons that have nothing to do with the student. That also means no historical report can be
reproduced.

WHAT NEEDS DECIDING — the actual work, and it is a product decision, not a code fix:

  (a) REMOVE the component from scoring until there is a real source. Honest immediately, and
      it changes every match score in the product, so it needs the weights redistributed
      deliberately rather than the component silently zeroed. `tierComponentWeights` already
      models an `isEnabled: false` component with a weight (seed.ts:3480 does exactly this for
      cvq on the free tier), so the mechanism exists — but seed.ts:3185 warns that a disabled
      component still HOLDING its weight contributes nothing while occupying it, which is the
      trap to avoid here.

  (b) FIND a source. Real labour-market data per country is a procurement and licensing
      question (UAE MOHRE, national statistics offices, or a commercial feed), not something to
      be scraped into the seed, and it needs a refresh cadence, provenance and a per-country
      coverage story — the catalog spans 15 countries (seed.ts:2081-2095), not just the UAE.

Whichever is chosen, the scoring change and the copy change are the same decision and should
land in that order.

DO NOT FIX THE LANDING COPY IN A WAY THAT IMPLIES THIS IS HANDLED. `landing.json:31` currently
claims "Get real data on career growth and opportunities in your country" (`ar:31` likewise,
"بيانات حقيقية"). Softening the wording to something defensible is a legitimate separate
commit and is NOT a fix for this entry — it removes the false claim from the page and leaves
the random numbers in the score. This entry stays open until (a) or (b) happens. Anyone editing
that string should link back here in the commit message so the two are not confused later.

First flagged 2026-09-09.


### NEEDS HUMAN REVIEW — the landing page carries a fabricated named-minor testimonial  (severity: HIGH — legal)
`landing.json:44-45` renders an attributed quotation, styled as a testimonial with a graduation
icon and an author line (Landing.tsx:271-283, the quote at :277-279 and the attribution at
:280):

    en/landing.json:44  "\"Future Pathways helped me discover careers I never knew existed.
                          Now I'm excited about my future!\""
    en/landing.json:45  "- Sarah, Grade 11"

NO SOURCE, CONSENT RECORD OR PROVENANCE EXISTS ANYWHERE IN THE REPO for it. There is no
testimonials table, no consent artefact, no attached asset, and no commit message that
introduces it as a real quotation — it has been carried forward as a string since the page was
built. The absence is the finding; it is not evidence the person is invented, and this entry
does not assert that.

THE ARABIC HAS MADE IT WORSE, and this is why it is being raised now rather than left in the
recon. `ar/landing.json:44` translates the quotation with feminine agreement — "أصبحت الآن
متحمسة لمستقبلي" — so the persona now carries a grammatical gender in one language that the
English only implies through the name. A translation decision has added an attribute to a
person whose existence is unverified. `ar:45` also drops the leading dash the English
attribution carries, so the two languages already present it slightly differently.

WHY THIS IS NOT AN ORDINARY COPY DEFECT. Every other inaccuracy found on that page overstates a
feature. This one puts words in the mouth of a named child. The audience is 13-18 and the
product is sold to schools and evaluated by a ministry; an endorsement attributed to a
Grade-11 student is exactly the sort of claim a regulator reads as a representation about a
real data subject, and PDPL treats minors' data as a protected category regardless of whether
the record sits in a database or in a marketing string. If Sarah is real, a quotation plus a
grade level plus an implied gender is identifying information about a minor published without
a recorded basis. If she is not, it is a fabricated endorsement on a page selling to schools.
Both are worse than a wrong feature bullet, and they need opposite remedies.

DO NOT REWRITE IT, DO NOT SOFTEN IT, AND DO NOT REMOVE IT AS A COPY CLEANUP. The two outcomes
need a human to choose between them:

  - IF GENUINE: it needs a provenance record — who she is, when it was given, and by whom
    consent was given, since a 15-to-17-year-old cannot consent to commercial use of her own
    words. That record needs to exist somewhere durable, not in a commit message. Only then
    does the string stay.
  - IF NOT GENUINE: it comes off the page, in both languages, in a commit that says why.

Related, and left alone for the same reason: `landing.json:41` / `ar:41` claims "Join thousands
of students who have discovered their perfect career match", roughly 200px from a live counter
that reads the database. That one is unbacked marketing rather than a claim about a named
person, so it is a lower-severity product decision rather than this. It is recorded in
docs/landing-recon.md §1 claim 10 and is not part of this entry.

First flagged 2026-09-09.


### Arabic unreviewed — the five CVQ value domains  (severity: low)
The landing fix for the false "10 basic human values" claim rewrote one Arabic string, which no
Arabic speaker has reviewed:

- `ar/landing.json:54` `research.valuesDesc` — `مُقتبَس من استبيان شوارتز للقيم الشخصية
  ومُكيَّف للأعمار 13–18، ويقيس خمسة مجالات قيمية — الإنجاز، والإحسان، والتوجّه الذاتي،
  والأمن، والسلطة — للتوافق المهني القائم على القيم`

This is a new sentence construction, not a translation of the old one — the old string was a
single clause ("تقييم مُثبَت عبر الثقافات يقيس 10 قيم...") and the replacement is a
provenance clause plus an enumerated list, so none of it carries over.

FIVE DOMAIN TERMS ARE THE PART TO CHECK, since they are psychometric vocabulary rather than
ordinary prose and each is a translation decision: `الإنجاز` (achievement), `الإحسان`
(benevolence), `التوجّه الذاتي` (self-direction), `الأمن` (security), `السلطة` (power). The last
two are the least certain. `الأمن` and `الأمان` both render "security" and Schwartz's sense is
closer to safety-and-stability than to national security. `السلطة` was chosen over `القوة`
because Schwartz's power is social status and control over people rather than strength, but
`القوة` is the more common rendering in casual Arabic and a reader may expect it. These five
should agree with whatever the assessment UI itself calls them if it names them in Arabic —
that was not checked and is worth checking in the same pass.

NO NEW BIDI RUN, deliberately, unlike the citation line directly below it. `ar:55` keeps the
Latin work title on purpose (see the landing-page instrument citations entry above); this string
is a description rather than a citation, so it names Schwartz in Arabic only and introduces no
mixed LTR/Arabic run. The `13–18` digits follow the file's existing convention (`ar:59` "16
مهارة", `ar:65` "240 سؤالاً").

Recorded 2026-09-09.
