# Pre-deploy / Follow-up List

Non-blocking items surfaced during Phase 2 security work. **Not security findings.**
Do not block deploy on these, but address before/around release.

## ⚠️ STARTING THE APP IS A WRITE. Read this before `npm run dev`

`index.ts:210-225` runs `runMigrations()` and then `seedDatabase()` on every boot, against
whatever `DATABASE_URL` resolves to — `.env`'s string by default. So "start the dev server to
look at a page" is not a read-only act: it applies migrations and re-runs every content seeder.
A run on 2026-09-10 (to render the Arabic landing page) wrote to staging: 68 careers, 180 quiz
questions, 34 sector rules. Harmless there. The same command with a prod string in scope would
have done it to production.

The `db.ts` endpoint guard stops a prod DSN **only while `ALLOW_PRODUCTION_DB` is unset** — and
that is exactly the variable someone exports for one legitimate query and leaves set for the
rest of the shell. Before starting the app: `printenv DATABASE_URL ALLOW_PRODUCTION_DB`. If you
only need to SEE a page, that is still the dev server, so check first — there is no read-only
way to boot this app today.

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

**RTL HAS TO BE SEEN, NOT DERIVED — added 2026-09-10.** Five separate things this
session were correct by reasoning and wrong on screen in Arabic, and the ones that
looked safest were the ones that failed: a bare digit, a single punctuation mark,
an interpolated Latin value dropped into an Arabic sentence. Two from the landing
step cards alone: `<bdi>1.</bdi>` put the period on the far side of the numeral,
so an RTL reader met the dot before the number (fixed b08ea4d — the period is a
Latin list convention and Arabic uses a dash or nothing, so it is now English-only);
and `me-2` on that same `<bdi>` computed to margin-RIGHT on an RTL page, leaving no
gap at all, because `margin-inline-end` resolves against the ELEMENT's direction and
a bdi holding only a digit resolves to LTR (fixed 54cdc2a). Note the shape: the
isolate that fixes the ORDER breaks the SPACING, and neither shows up in the source.
Rules of thumb worth carrying into the audit proper:
- A digit is not a strong character. `<bdi>`/`dir="auto"` around digits-only content
  resolves LTR no matter what page it is on, which flips both the neutrals inside it
  and every logical property (`me-*`, `ps-*`, `text-align: start`) set on it.
- Punctuation adjacent to a number is bidi-neutral and lands wherever the surrounding
  direction pushes it. A dash misplaces exactly like a period; there is no separator
  that is safe by construction. Prefer no separator.
- Do not accept "logical properties handle RTL" without a measurement. They handle
  it relative to the element you put them on.
- **Same hazard, still unfixed:** `client/public/locales/ar/legal.json` bakes
  `1. `…`8. ` into the Arabic privacy/terms/disclaimer section titles (s1Title–s8Title
  in all three documents). Unisolated, so those periods take the RTL paragraph
  direction and render on the other side of the numeral from the English. Never
  rendered/checked. Fold into this audit.

**How to actually see it** (no Replit, no prod deploy needed) — first check what the dev server
will write to, see the boot-writes warning at the top of this file. Then: puppeteer is already a
dependency, and headless Chrome runs here once its system libs are installed
(`libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 libxkbcommon0
libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2t64 libpango-1.0-0
libcairo2 libnss3 fonts-noto-core`, plus an Arabic font). Seed `localStorage
fp_language=ar` before navigating, then screenshot AND measure: per-character
`Range.getBoundingClientRect()` x-positions are what settled both bugs above — a
screenshot alone is easy to misread, since the same defect can be described as the
dot being on either side depending on whether you scan the line or read it.

### Tie-break policy is bytewise by title, and that has a direction — product decision

**STATUS: FILED 2026-09-10, not started. Product decision, not a bug.** Surfaced
while closing the Accountant/Actuary tie as accepted (above).

`compareMatches` (`server/services/matching.ts`) resolves an exact overall tie on
`career.title`, bytewise, and its own comment states the reasoning: deterministic-
but-arbitrary beats arbitrary, it does not make the tie meaningful, and which
careers to show when scores are close is a product decision that was closed
separately with no change. All of that still holds. What was not measured then is
that the arbitrary key has a systematic direction.

Measured on this pair: in a FREE report (subjects + interests + vision), **15 of
63** subject selections give Accountant and Actuary an identical subjects score
(the 8 containing {Mathematics, Social Studies, Computer Science} at 100, plus 7
flat-20 sets), and **10 of 21** interests score them identically. When both land
in those sets all three free components tie, the overall ties exactly, and the
title comparator resolves it — roughly 2% of free students, for a 3-interest
pick. "Accountant" precedes "Actuary" on the third letter, so those students
always see Accountant (4% growth, $55–95k) and never Actuary (7% growth,
$75–130k, O*NET Bright Outlook: YES), at `MAX_MATCHES_FREE = 2`.

**Reopening this means arguing for a DOMAIN-AWARE tie-break, not for a different
letter.** The current key is deliberately domain-free, and that is a real
property: it is stable across databases and environments, which `career.id`
(a per-database UUID) is not. A growth-outlook or salary key would be neither
free nor obviously right — it would state a preference the scorer did not have,
and `growthOutlook` is prose ("Good (4% growth)"), not a sortable field. Options
if taken up: leave it (the evidence genuinely is tied — that is why the scores
tie); add a documented domain key with its own justification; or surface tied
matches as tied rather than ranked. NOT fixable by changing the vision score:
splitting the pair there would move 8 careers and cost a version bump to reach
~2% of free reports, which is the wrong lever.

### Critical Thinking in the sector vectors — a three-sector descriptive question

**STATUS: FILED 2026-09-10, not started. Descriptive question about the seed, not
a defect.** The other half of the Accountant/Actuary closure.

Critical Thinking and Problem Solving is dropped from Space & Advanced Sciences,
Healthcare and Financial Services under one written reason, given three times in
`server/seed.ts`: sd 6.7–6.9, present in most sectors, "weight without
information" per the geometry note. The competing reading is that every one of
those three sectors genuinely requires it, and a vector that says nothing about
it is making a claim of its own.

That question is open, and it is NOT the Accountant/Actuary tie-break. Adding CT
@65 to Financial Services alone splits that pair by 0.776 and — measured — leaves
`catalog max |r|` unchanged at 0.763 (the seed's own metric; the worst pair stays
Renewable ↔ Food Security), moves only the 8 FS-attributed careers, flips no
attribution and changes no reasoning sentence. It is the best-behaved candidate
of the four tried. It was still refused, because a weight tuned to what it does
to one pair is selecting a fact for its effect rather than describing the sector.

**If taken up, it has to be argued as description across all three sectors at
once**, with each weight justified by what the sector requires, and measured the
way every other vector change in that file is: catalog max |r| before and after,
careers moved, attribution flips, and the FS alignment spread it costs (CT @65
narrows it 29.13 → 26.19 — the dilution the geometry note warns about, since the
score is an importance-weighted mean). It moves scores, so it carries a
`SCORING_ALGORITHM_VERSION` bump. Measurements for the other candidates, kept so
nobody re-runs them: Curiosity @65 splits by 0.776, max |r| 0.763, spread 25.57;
Scientific Literacy @50 splits by only 0.309 and raises max |r| to 0.765, making
Renewable ↔ Financial Services the catalogue's worst pair — ruled out on the
seed's own test.

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
- **The Accountant/Actuary vision tie is CORRECT — closed as accepted 2026-09-10
  (ea11fe5).** They score an identical 92.255 inside Financial Services and are
  the only tied pair in the catalogue. `docs/vision-saturation-fix-plan.md` §3
  filed this as a DATA GAP with a seed change pending ("give Financial Services a
  discriminating skill", its commit 3); that commit is WITHDRAWN, not deferred.
  WEF-16 records the IMPORTANCE of a competency, not its kind or level. What
  separates an actuary from an accountant is the kind of mathematics — pricing
  uncertain future events with stochastic models vs recording realized
  transactions under a rule set — which is domain knowledge the framework
  deliberately does not model. Numeracy is 100 for both because numeracy is
  maximally important to both. Equal importance on the five competencies the
  sector demands is a true statement, so one number for both is the model
  working. `matching.vision.test.ts` now ASSERTS the tie (exactly one tied block,
  exactly those two, in that sector) instead of skipping it, so a seed change that
  splits them fails loudly. Do not re-open as a scoring defect; the open question
  that remains is descriptive and is filed under Critical Thinking below.

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
(counts superseded 2026-09-09 — see the update under "Dependency vulnerabilities flagged by Dependabot" below.
The puppeteer cluster itself is unchanged and still the plan of record; js-yaml has since been
patched in place at 4.3.2 without the bump.)
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
**Before starting it at all, see the boot-writes warning at the top of this file — boot applies
migrations and re-runs the seeders against whatever DATABASE_URL is in scope.**
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

**UPDATE 2026-09-09 — the reconciled set was NOT permanently resolved; multer is vulnerable again.**
The "all three go away with a single non-breaking `npm audit fix`" reading above was accurate when
written and was applied in 1d3653d (2026-08-24), which recorded multer resolved at **2.2.0**. As of
2026-09-09 the multer advisory range is **`<=2.2.0`** — the exact version that closed the finding is
the vulnerable one now, across **4 new high advisories**: DoS via crafted multipart field names; fd
leak on aborted uploads; file-size-limit bypass via async `fileFilter` race; DoS via oversized array
index in field names. Still the direct dep on the live upload path (files.routes.ts, admin.routes.ts
bulk student import) — minors' file uploads. Nothing regressed in this repo; the advisory moved under
a static version. **So: no audit result is settled. Re-run on a schedule, not once per triage.**

**Count went 8 -> 14 overnight** — four newly-advisory packages, all fixed by the safe path. Cleared
in ae317d8 (plain `npm audit fix`, no `--force`; lockfile only, package.json unchanged, 0 moves
outside a declared semver range):

| package | was -> now | severity | note |
|---|---|---|---|
| multer | 2.2.0 -> 2.3.0 | high (4 advisories) | direct dep, live upload path |
| js-yaml | 4.3.1 -> 4.3.2 | high | puppeteer -> cosmiconfig -> js-yaml; patched in place, no puppeteer bump needed |
| @vitest/mocker | 4.1.10 -> 4.1.11 | moderate | dev-only; moved with vitest + the @vitest/* set |
| morgan | 1.11.0 -> 1.12.0 | moderate | direct dep; log forging via unescaped Unicode line separators |

Incidental in-range moves: body-parser 1.20.6 -> 1.20.8, qs 6.15.2 -> 6.15.3, tinyrainbow, and the
browserslist/caniuse-lite/electron-to-chromium chain. One new nested copy —
`body-parser/node_modules/qs@6.16.0` — because body-parser 1.20.8 tightened its requirement to
`~6.16.0`, which no longer overlaps express's `~6.15.1`. That nested copy sits outside the qs
advisory range, so body-parser's qs edge is now clean and only express's own edge remains. Verified:
tsc --noEmit clean, 735 tests across 46 files pass, build green.

**REMAINING after ae317d8 — 6 (4 high, 2 moderate); Dependabot dedups the same tree to 5.** Both
clusters are breaking, both are their own scheduled work, neither is on a student request path:
- **puppeteer cluster** (puppeteer, puppeteer-core, @puppeteer/browsers, extract-zip) — 4 high. Fires
  at browser INSTALL, not at PDF render. Fix = puppeteer 24 -> 25 (major). Plan of record is the
  "puppeteer 24->25 — IN PROGRESS" section above; still blocked on a staging deploy that can actually
  render a PDF (bundled Chrome won't exec in the Codespace).
- **qs <- express** — 2 moderate (array-limit bypass via bracket-key comma parsing; DoS via
  attacker-controlled isBuffer). Fix = express 4 -> 5 (major). Not yet scheduled; needs its own recon
  session before anyone touches it.

### Career-reasoning prompt contradicts quiz results  (severity: medium-high — credibility)
Confirmed in a live prod PDF (assessment 23f6008e, 2026-09-05). The subject-strengths block shows Mathematics 0% (0 of 4 correct), while the LLM "Why This Career?" narratives praise Mathematics as a strength on three of five careers: Product Manager ("your love of Mathematics supports the analytical side"), Journalist ("Mathematics sharpens the analytical thinking needed to fact-check data"), Marketing Manager ("Mathematics connects to analytics and budgeting"). Cause: the career_reasoning prompt is fed favoriteSubjects (student-declared) with no quiz competency scores, so a failed subject is treated as an asset. Reader can falsify the claim from the same page. Fix: pass per-subject quiz scores into the prompt and instruct the model to frame low-scoring subjects as growth areas, not strengths. Needs a real PDF to verify. First flagged 2026-09-05.

### Three idioms guard one hazard in Assessment.tsx  (severity: medium)
A component that writes state and advances in the same handler loses the write, because
handleNext reads the assessmentData closure from the render before the update commits. That cost
a half-length quiz on the exactly-3 subjects path (28fcf36), silently, on 9 stored assessments.

The file now guards it three different ways: handleRiasecComplete passes the value as an
argument (:923, with a comment naming the hazard), the org-student prefill uses
setTimeout(..., 0) (:578-593), and handleNext takes an explicit override (28fcf36). Each is
correct; together they mean the next person reading one has no reason to look for the others,
and a fourth site gets missed.

It is only dangerous where handleNext actually saves — steps 3 and the final Aspirations step —
which is why CVQStep.tsx:150-151 is latent rather than live. That containment is a property of
current step numbering, not a rule.

The whole class is invisible to the test suite: every unit involved was correct, and the defect
lived in the seam between a component's handler and its parent's. vitest.config.ts is node-only,
so no test could have caught it. First flagged 2026-09-09.

UPDATE, same day: CVQStep was hardened in 467f8bb — it now passes the override rather than
relying on step 6 not saving, so the one latent site named above is closed and that file uses the
same idiom as SubjectsStep. The three idioms in Assessment.tsx itself are untouched and remain the
open part of this entry: the RIASEC and prefill sites are correct and were deliberately not
reworked. Blast radius of the original defect measured on prod the same day: 9 completed
assessments on the exactly-3 path, averaging 9.78 questions against an expected 12 free / 15
premium. Between 6 and 12 rather than a flat 6, which matches the Back-navigation variant (a
stale PARTIAL priority list) rather than a uniform empty array. All 9 are test fixtures; no real
student affected.

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

### Curriculum rename: two cascade gaps — GAP 1 FIXED, GAP 2 open  (severity: was HIGH)
MERGED 2026-09-09 from two adjacent entries that read as a duplicate in the heading list — the
assessments gap (first flagged 2026-09-07) and the organizations gap (severity raised
2026-09-08). They are different defects with different fixes and different phases, so both are
kept in full below; they are filed together because anyone reading one needs the other.

POST /api/superadmin/countries/:id/curricula/rename rewrote countries.curricula, subjects and
quiz_questions, and stopped short of two tables holding the same string: assessments and
organizations. organizations is now covered (GAP 1, below). assessments is not (GAP 2).

A THIRD table was found later and is NOT covered by either gap:
contribution_submissions.curriculum — filed as its own entry, "Curriculum rename and pending
contribution submissions", because unlike these two it needs a policy decision before it can be
written.

#### GAP 1 — organizations.curriculum  (was HIGH — FIXED at the rename; see the Net paragraph below)
A renamed curriculum leaves every school on it holding a string that no longer appears in
countries.curricula.

SEVERITY RAISED 2026-09-08 (admin-surface recon). The original entry called this an orphaned
column and reasoned about stale labels and a dropdown that cannot offer the value back. That
undersold it. organizations.curriculum is not a label — it is load-bearing input to the
assessment:

    server/routes/assessment.routes.ts:136
      curriculum: organization?.curriculum,

That value scopes which quiz bank a student's assessment draws from. After a rename the school
row held the old string while subjects and quiz_questions held the new one, so the scoped lookup
matched nothing.

THE POOL WAS NOT EMPTY, AND THIS ENTRY SAID IT WAS — corrected 2026-09-09, because the wrong
wording here was worse than the finding. The curriculum-scoped query at quiz.routes.ts:292-299
is the FIRST of four steps, and the three below it are fallbacks that each widen the pool rather
than fail. So the student did not hit an error. They sat a quiz drawn from the wrong bank — a
British-curriculum school's students quizzed on MOE National content — which was then scored,
stored, and fed into their career recommendation as if it were right.

IT IS A CASCADE, NOT ONE FALLBACK, and the correction is only half made if that is missed. Each
step drops another scope, and any of them can be the one that answers:

  1. :292-299  countryId + grade + curriculum — the intended query. Returns nothing after a
     rename, because organizations.curriculum held a name quiz_questions no longer used.
  2. :301-307  DROPS THE CURRICULUM FILTER. Same country, same grade, every curriculum. This is
     the step that produced the wrong-bank quiz described above.
  3. :309-315  DROPS THE COUNTRY TOO (`countryId: null`) — global questions, no country scope.
  4. :317-328  DROPS BOTH AND MOVES THE GRADE, trying studentGrade ±1 with no country and no
     curriculum filter at all.

Only after all four return nothing does :330-331 return a 400. So the reachable worst case is
not merely "another curriculum in the same country" but a quiz assembled from a different
grade's questions with no country scoping — and steps 3 and 4 are equally silent. The only trace
of any of it is a console.log per step (:306, :314, :324), which on Render means a line nobody
reads in a log nobody retains.

The original wording predicted a symptom — an empty pool, a 400, a complaint — that an operator
would go looking for and never find, while the real damage produced complete, plausible,
wrong results and no signal at all. Anyone triaging from the old text would have concluded the
bug was not reproducing.

(Two sub-cases, for whoever verifies: getQuizQuestionsByFilters matches
`curriculum = $1 OR curriculum IS NULL` (and the same OR-NULL shape for countryId), so if the
country has any curriculum-agnostic questions step 1 returns THOSE and the cascade never fires —
the pool is silently narrowed instead of silently widened. A hard 400 arrives only if the
favourite-subject filter at quiz.routes.ts:346-352 then empties, which blames the student's
subject choice for a superadmin's rename.)

The rename returned { success: true, updated: { subjects, questions } } and reported no schools,
because it never counted any.

Consequences, worst first:
- Every subsequent assessment at an affected school was drawn from the wrong curriculum's
  questions (assessment.routes.ts:136). Nothing warned, and the rename reported success.
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

REWRITTEN (admin.routes.ts, same commit as the GAP 1 fix). The replacement says what it did not
inspect, so the survey has a visible edge; separates "this guard is correct" from "the cascade is
complete", which the old version had fused; and states the distinction the whole paragraph turns
on — a rename preserves the curriculum's identity so rewriting every stored copy is a complete
repair, while a switch changes it so the assessments already taken mean something else. The
guard's conclusion was right the whole time, for a reason it was not giving.

Net: a superadmin rename could put a school into a state only a direct DB write could fix. The
rename was the only path that produced it, so the fix went there rather than as a carve-out in
the lock.

FIXED. storage.renameCurriculum now performs all four writes — countries.curricula, subjects,
quiz_questions and organizations — inside one db.transaction, replacing
renameCurriculumInSubjects and renameCurriculumInQuizQuestions, which are gone rather than kept
alongside it (a non-transactional single-table rename left in the API is the trap the fix
closes). Every WHERE is scoped by countryId: the same label legitimately exists under more than
one country, so an unscoped rewrite would have relabelled schools nobody touched. The route
reports the schools it moved, and both locales print the number. Three details worth knowing:

  - THE PRECONDITIONS MOVED INSIDE THE TRANSACTION and the countries row is taken FOR UPDATE.
    This is a behaviour change beyond atomicity, not a refactor. They previously ran in the
    handler against a row nothing held, so two concurrent renames could both pass "newName does
    not exist" and both proceed, losing one of the two names. Same check-then-act shape, and the
    same fix, as createGroupPurchaseTransaction.
  - clearSubjectCache() STAYS OUTSIDE the transaction, after it. It is not a database write —
    it resets two module-level variables in utils/subjects.ts — and it is the one step that
    must not be enrolled: clearing mid-transaction lets a concurrent request refill the cache
    from uncommitted rows, and clearing on rollback discards a cache that was still correct. The
    earlier count of "four writes" in this entry included it; three of those four were SQL.
  - THE CACHE CLEAR IS STILL PER-PROCESS. On a multi-instance deploy the other instances serve a
    stale alias map until CACHE_TTL. Pre-existing, unchanged, and not something the transaction
    addresses — noted so "cache cleared" is not read as cluster-wide.

Same defect class as the orphan-user bug fixed in 8c07e25.

NO PRODUCTION REPAIR WAS NEEDED. The detection query (docs/curriculum-rename-cascade-recon.md,
§4 Q1 — schools whose curriculum is absent from their country's curricula array) returned zero
rows against prod before the fix landed. The fix is preventive; there was no data migration.

#### GAP 2 — assessments.curriculum  (medium, Phase 6 — STILL OPEN)
storage.renameCurriculum cascades a rename through countries.curricula, subjects,
quiz_questions and organizations, but stops short of assessments. assessments.curriculum keeps
the old string, so a renamed curriculum leaves existing assessment rows pointing at a value no
longer in countries.curricula. This is the same reconciliation gap that blocks a superadmin
override on the org curriculum lock (01e20cf) — neither can be closed until something can
re-scope existing assessment rows. Phase 6.

(Rewritten 2026-09-09 after the GAP 1 fix. This paragraph used to name
renameCurriculumInSubjects and renameCurriculumInQuizQuestions at storage.ts:854-881; both
functions were DELETED by that fix and folded into storage.renameCurriculum, so the old text
sent the reader to code that no longer exists. The gap itself is unchanged.)

WHY THE TWO GAPS DID NOT SHARE A FIX. Gap 1 was a missing UPDATE on a path that had no
transaction, and was fixed at the rename route (47c5067 tracks the same distinction). Gap 2
needs Phase 6 reconciliation, because re-scoping a historical assessment row is a decision about
what a completed assessment means, not a string rewrite. That is why the GAP 1 commit
deliberately left it alone rather than adding a fifth UPDATE that would have looked like
completing the cascade.

NOTE THE ASYMMETRY THE FIX CREATED, because it is the reason this is now easy to misread. Before
the fix, subjects/quiz_questions were renamed and organizations/assessments were not, so a
half-cascaded rename was visible as a live breakage. Now everything the QUIZ path reads is
consistent and only assessments — which nothing reads for scoping — is stale. The defect is
therefore quieter than it was, not smaller: a historical row still claims a curriculum name that
no longer exists, and the only surface that surfaces it is a report or export read after a
rename. Do not close this by copying the GAP 1 UPDATE.
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

EXTENDED 2026-09-11 — a SECOND omission, found while fixing the erasure endpoint beside it.
The export also never reads **wef_competency_results**. That table holds the student's
normalized WEF competency scores and their top five competencies (schema.ts:399-420) — a
derived psychological profile of a minor, and exactly the kind of inference a subject-access
request is for. It is written for every premium assessment
(recommendations.routes.ts:137 -> wefOrchestrator.ts:57) and org students are forced premium
(auth.routes.ts:53), so it exists for essentially every school student and is returned to none
of them.

WHY THE TWO BELONG TOGETHER, and why this is worth reading as one finding rather than two
bullets. Both halves are the SAME BUG CLASS as the erasure 500 fixed on 2026-09-11
(docs/erasure-dependent-list.md): a hand-maintained list of tables that fell behind the schema.
Erasure's short list threw 23503 and was loud. Export's short list returns 200 and is silent —
it hands the student a JSON file that looks complete. The erasure gap was found because
Postgres refused; nothing will ever refuse this one. That asymmetry is the reason to fix export
by deriving the list the same way, rather than by appending the two tables now known to be
missing and leaving the next addition to drift again.

It also sits on the same surface as the erasure route: the same student, on the same
Profile.tsx screen that position 4 (docs/consent-implementation-recon.md, suggested order step
6) would add, chooses between a download that under-returns and a delete that now works. Fixing
export is not required for step 6 to be safe, but shipping step 6 without it means the first
thing a student exercising their rights receives is incomplete.

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

### Password reset — VERIFIED WORKING IN PRODUCTION 2026-09-08; the code DEFAULT still points at a domain nobody owns  (severity: was HIGH, now MEDIUM — and the MEDIUM is about unconfigured environments, not production)
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

CORRECTED 2026-09-10 — PRODUCTION IS NOT BROKEN. Everything from "STILL OPEN" onwards describes
an environment, and it is not the deployed one.

The flow was exercised end to end on 2026-09-08: a real reset arrived from
`noreply@futurepath.ae`, was not spam-foldered, and its link completed the reset. So EMAIL_FROM
IS set on Render, the sending domain IS verified in Resend, and password reset works. DNS
confirms the sending setup independently (checked 2026-09-10): `resend._domainkey.futurepath.ae`
carries a DKIM key, `_dmarc.futurepath.ae` is `v=DMARC1; p=none;`, and `send.futurepath.ae`
holds Resend's SPF and its own bounce MX (`feedback.forge.rmta.net`).

THREE CLAIMS ABOVE ARE SUPERSEDED. Named rather than deleted, because the reasoning is sound and
only its target moved:

  - "the sending domain is not verified in Resend" — false. It is verified.
  - "a reset may still fail, now at the API rather than at construction" — false in production.
  - "a locked-out org_admin today gets the worst of both: no email, and a screen telling them
    one is on the way" — not the production behaviour. They get the email.

WHAT REMAINS TRUE, AND IS A REAL DEFECT: the DEFAULT at email.ts:5 is still `Future Pathways
<noreply@futurepathways.com>` — a domain nobody owns — and .env.example:90 documents it as the
default. Production overrides it with an env var. Nothing else does. So any environment that
does not set EMAIL_FROM sends from an unverified domain and Resend refuses it: a fresh deploy, a
staging service, a new developer's local run.

AND THE SILENT-FAILURE ANALYSIS ABOVE IS NOT WRONG, IT IS RE-AIMED. `isEmailConfigured()` is
`!!resend`, so in exactly those unconfigured environments the gate passes, the send 403s, the
route holds its response to keep enumeration closed, and the user is shown the green "Check Your
Email" card for mail that was never accepted. That is what every environment inheriting the
default does, and it is precisely why the default is worth fixing rather than tolerating — the
failure it produces is invisible by construction.

FIX AT THE DEFAULT: either require EMAIL_FROM with no fallback (env-validation.ts:44-53 already
asserts SESSION_SECRET's length and DB_ENCRYPTION_KEY's format, so the pattern exists), or
default it to the domain that is actually verified. A default nobody owns cannot be correct in
any environment. The separate question of promoting RESEND_API_KEY to REQUIRED is unchanged.

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


### A technical justification can outlive its technical constraint  (pattern, not a defect)
Same shape as the safeguard entry below: a comment that reads as a complete account and is one
layer out of date. Recorded for the pattern; the instance is only the example.

The PDF 403 (`recommendations.routes.ts`) explained itself as "free-tier narrative is withheld, so
a rendered PDF would carry blank sections". That was true when written. It stopped being true when
the free narrative became formatted rather than withheld — a change made elsewhere, for its own
reasons, that had no visible relationship to this gate. The gate remained correct throughout,
because the PDF is a SOLD feature (`pricing.json` individual.feature8), but nothing in the code
said so.

**The failure mode is that the comment reads as complete.** It gives a reason, the reason is
checkable, and checking it returns false — so a careful reader concludes the gate is unmotivated
and should be removed. Being careful makes it worse, not better: the more seriously the stated
reason is taken, the more confidently a paid feature gets deleted. This nearly happened
2026-09-10; the correction was caught only because the claim was traced to `pricing.json` rather
than stopping at "the stated reason is dead, so the gate is dead".

WHAT TO DO WITH IT, generally: when a control has a commercial, legal or product reason, say THAT
reason, not the technical symptom that made it convenient at the time. A technical rationale is
falsifiable by unrelated work; a commercial one is falsified only by a pricing decision, which is
the thing that should actually move the gate. Where both apply, the durable reason goes first.

Recorded 2026-09-10.


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

A SECOND PROCESS PATTERN, recorded here because this is where process-severity findings live,
though it is a different failure from the three above. Those were code written by someone who
understood a failure mode and did not apply it to their own work. This one is in the WRITE-UPS,
and it is mine: **an entry dictated from a symptom, with a mechanism inferred rather than
traced.** Two instances, both corrected only when someone went and read the consumer:

- The curriculum rename (GAP 1, :1790). The entry said the quiz pool was EMPTY and predicted a
  400 and a complaint. The pool was not empty — quiz.routes.ts:292-328 is a four-step cascade
  whose fallbacks each widen the scope rather than fail, so students silently sat a quiz drawn
  from the wrong bank and it was scored and stored as if correct. Worse than the entry said,
  and invisible in exactly the way the entry said would be noticed.
- The job-market table (:3003). The entry said random numbers were a component of every match
  score. They were a component of nothing — the consumer had been deleted ten months earlier
  in fc54470. Less bad than the entry said, and it named a line (matching.ts:315) that had
  never touched the data.

The two errors point in opposite directions, which is the tell: neither was a considered
estimate that came out wrong. Both were a plausible mechanism written down in the voice of a
traced one. A reader cannot distinguish those two things after the fact, so the entry's
confidence became evidence it did not earn — and in the job-market case the false mechanism
sat in the file for a day being cited as a reason.

The safeguard is cheap and specific, and it is not "be more careful": **before writing a
mechanism into an entry, grep for the consumer and cite it by file:line, or write that you did
not check.** Both instances would have been caught by one grep — `componentCalculators` in the
first case, the four fallback branches in the second. An entry may absolutely record a symptom
without a mechanism; what it may not do is supply a mechanism it did not look up. Where a claim
is inferred, mark it inferred.

First flagged 2026-09-08. Second pattern added 2026-09-10.


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

BUILT 2026-09-10, and the line above is now wrong on its face. The work shipped BEFORE the
documents were settled, deliberately: identifying the documents by content hash does not require
them to be correct, only to be identified, so the legal rewrite stopped being a blocker. Five
commits, in dependency order:

  c767e2e  a content hash over the `terms` and `privacy` subtrees of legal.json, so a consent
           record can name the documents it was given against. Fails closed — null rather than
           a placeholder — and NOTHING GATES ON DRIFT.
  3a7e48a  `organization_consents` (append-only, one row per act) plus GET/POST
           /api/my-organization/consent. org_admin only, with no superadmin path: a superadmin
           asserting that a school holds guardian consent is the fiction the record exists to
           remove. Both claims or nothing. Ships inert.
  aec29f7  the attestation card, mounted above the roster for an org_admin. Two checkboxes,
           and they must stay two. Posts the exact rendered wording back so the hash pins what
           this admin saw. Drift is a notice, never a block.
  bbb1869  the enrolment gate: 409 CONSENT_REQUIRED on the three paths that enrol a school
           student, all of which sink into `storage.createUserWithCredentials`. Fails closed.
           Placed after the authorization checks so an unauthorized caller still gets 403 and
           does not learn the school's consent state.
  c647443  PROPOSAL (2), as ruled: the checkbox is deleted and the student is TOLD. The notice
           names the school and links both documents, and IT REACHES THE FULLY-PREFILLED PATH —
           finding 1 above, where the old screen rendered nothing at all.

PROPOSALS (1) and (3) are satisfied by the above: the school attests, and no parent-facing flow
was introduced. PROPOSAL (4) — withdrawal must not route through the school — is untouched and
still open, and now has its own entry: it is BLOCKED on a mailbox that can receive, not merely
unbuilt, because the address the policy gives minors has no MX records. See "STEP 6 BLOCKED"
below for what exists, what is missing, and the order the three steps have to happen in. The NEEDS-A-LAWYER paragraph stands unchanged
and still constrains all of it. The FREE FLOW is unchanged and now has its own entry (:3158).
The admin-facing half of the gate was not built (see the enrolment-gate UI entry).

CORRECTION to the SEPARATE AND HARDER paragraph above, recorded rather than edited in place so
the two readings can be compared: "Finding 3 already voids that tick on resume" is wrong.
Assessment.tsx:505 sets `consentGiven: true` unconditionally when hydrating a cross-device
resume, because there is nothing on the server to restore it from — it does not void a tick that
was given, it FABRICATES one that was not. Read as "voids", it is a UX annoyance. Read
correctly, it is a data-integrity defect about a minor's consent, and nothing in the system can
distinguish a student who agreed from one who was resumed into agreement. The corrected
mechanism is at :3158.

### Impersonation is a no-op that reports success — DELETED 2026-09-09  (was: HIGH)
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

RESOLVED 2026-09-09 by deleting it. Both routes (superadmin.routes.ts:1806-1852), the section
comment, impersonateMutation, the button, the orphaned UserCog import and all four locale keys
in both languages went in one commit. Nothing else referenced session.impersonating — it was
the only bespoke session key in the codebase, and no type declaration, test or other caller
existed. Live session rows may still carry the key; it is inert and expires with the session.

WHY DELETE RATHER THAN BUILD (recon: docs/impersonation-build-or-delete-recon.md, untracked —
docs/*.md is gitignored). The need behind the button is real, but it is a READ need, and
impersonation answered it by granting write authority over a minor's account. Its own
advertised use case — walk the flow to reproduce a reported bug — would have PATCHed the
child's assessment record via the autosave at Assessment.tsx:686 and attributed it to them,
with DELETE /api/users/me and the GDPR export equally live. A correct build would also have
needed a banner, an exit path, a new audit table (organization_events cannot hold it:
organization_id is NOT NULL with an FK) and a change to how req.user is resolved, to arrive at
a capability narrower than the read access described in the entry below.

Corrected while closing, for anyone who reads the original entry above: "a superadmin stuck
inside a student's session with no visible way out" was the right conclusion for the wrong
reason. req.logout() in passport 0.7.0 regenerates the session
(node_modules/passport/lib/sessionmanager.js:80-91) and GET /api/logout (auth.ts:302) is behind
no guard, so logout would have cleared the flag. The operator was never trapped — they were
unlabelled, and every write they made was the student's.

### A superadmin cannot see a student's report  (severity: medium)
GET /api/superadmin/students/:userId/results (superadmin.routes.ts:1639-1653) does not return
results — it redirects to /results?assessmentId=<id>, handing the superadmin's browser to the
student-facing page. That page then fetches GET /api/assessments/:id, which requires
req.user.userId === assessment.userId (assessment.routes.ts:415-418) and 403s, and
GET /api/recommendations, which returns [] for a non-owner by design as an anti-enumeration
measure (recommendations.routes.ts:265-283). Neither has a superadmin bypass.

So the "View results" control sends an operator to a page with no assessment and no
recommendations. The quiz, the CVQ result and the report PDF are equally unreachable
(quiz.routes.ts:400, cvq.routes.ts:14/:184, recommendations.routes.ts:621-646 — owner or token
only).

The need behind the deleted impersonation button was this one, and it is a read need: three
route-level reads with an audit row each, not session identity substitution. Establishing the
rendered outcome needs the app run, not just the routes read. First flagged 2026-09-09.

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
| ~~**Impersonate**~~ | — | — | DELETED 2026-09-09, see the entry above |
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


### Arabic unreviewed — the rewritten job-market feature card  (severity: low)
The landing copy fix that closed the "real data" overclaim rewrote two Arabic strings,
unreviewed:

- `ar/landing.json` `features.marketTitle` — `نظرة النمو المهني`
- `ar/landing.json` `features.marketDesc` — `مدى النمو المتوقع لكل مهنة، وفق توقعات مكتب
  إحصاءات العمل الأمريكي (عبر O*NET)`

The title deliberately reuses `ar/results.json` `growthOutlook` (`نظرة النمو`) so the landing
card and the report name the same thing, and the description is built from that file's
`growthSource` (`توقعات مكتب إحصاءات العمل الأمريكي 2024–2034 (عبر O*NET)`) with the vintage
dropped, since a feature card is not the place to date a projection. So the vocabulary is
borrowed from strings already in the product rather than invented — but the composition is new
and nobody has read it.

MIXED SCRIPT, same class as the instrument citations above: `O*NET` is kept in Latin because it
is a source name to be looked up, and it carries the mixed LTR/Arabic run described in bidi
leak (2). The asterisk inside `O*NET` sits adjacent to an RTL run, which the citation strings do
not test — worth eyeballing in the rendered Arabic landing page specifically, not just read in
the JSON.

Recorded 2026-09-10.


### Job-market data feeding every match score is Math.random()  (severity: was HIGH, now LOW — the mechanism was wrong)
**THIS ENTRY WAS WRONG, NOT MERELY STALE. Corrected 2026-09-10.** It was dictated from the
2026-09-09 landing recon without tracing whether a consumer existed. One did not, and had not
for ten months. The heading is kept verbatim — including the claim in it — so the entry is
findable by what it used to assert; everything under it is the correction. Full trace:
docs/job-market-random-recon.md.

WHAT SURVIVES, AND IT IS THE WHOLE CONCLUSION: `job_market_trends` is fabricated data. Every
numeric column is `Math.random()`, the table has exactly one writer and no ingestion path, and
`landing.json:31` sells it to students and schools as "real data". That was right when it was
written and is right now. Only the mechanism connecting the two was invented.

#### What this entry got wrong

1. **"IT REACHES THE STUDENT … a component of every career match score every student has ever
   received is a random number."** FALSE. It reaches nothing. `fc54470` (2025-11-11, "Add career
   assessment scoring for CVQ values and remove market trends calculation") deleted
   `calculateMarketScore` — the function that read the trends — and removed `market:
   calculateMarketScore` from `componentCalculators`. `c735f7a` (2025-12-03) then removed the
   component from `componentsToSeed`, from the seeded `tierComponentWeights` rows, and from
   `TIER_WEIGHT_OVERRIDES`. The registry (matching.ts:177-183) holds five calculators —
   subjects, interests, vision, riasec, cvq — and none reads `context.jobMarketTrends`.
   Measured contribution to a 100-point match score: **0.0 points, in every tier**. Not "small":
   structurally zero, because no code path reads the values.

   The corollary this entry drew — "no historical report can be reproduced" — is FALSE for the
   same reason, and it is the more damaging of the two, because report reproducibility is
   exactly what the provenance work at :3366 and :3420 is about. Nothing in this table has ever
   contributed to a `configHash`, a stored score, or a drift bucket. `recommendations.
   futureMarketDemand` is written as a literal `0` with the comment `// Deprecated, always 0`
   (recommendations.routes.ts:186), which is the same fact recorded in the schema and missed
   here.

2. **"`matching.ts:315` groups the trends by career and hands them to the scorer."** FALSE, and
   not a drifted line number. matching.ts:315 is inside `resolveActiveComponents`, in the
   tier-weight lookup (`effectiveWeight = (dbWeight?.isEnabled && dbWeight.weight > 0) ? …`). It
   has never had anything to do with trends. The grouping is real but orphaned: the fetch at
   :402, the grouping at :405, the assignment at :455, the context field at :93 — hydrated on
   every generate, read by nothing.

3. **"it is regenerated on any seed run that finds the table empty."** FALSE. The insert is not
   gated on the trend table at all. It sits inside the new-career branch (seed.ts:2046-2071),
   so the gate is `!existingCareerTitles.has(career.title)`. Truncate `job_market_trends` on a
   seeded database and re-run the seed and **zero rows are written back**, because every career
   title already exists. Existing rows are never touched — there is no upsert and no
   `onConflict`. The values are frozen at the moment a career title first appears, which makes
   them *more* stable than this entry claimed, not less. (There is also no unique constraint on
   `(career_id, country_id, year)` — the `catch { /* Trend might exist */ }` at :2067 guards
   against a violation that cannot occur — so a career deleted and re-seeded would silently
   duplicate its trend rows.)

4. **"the catalog spans 15 countries (seed.ts:2081-2095)."** FALSE. That citation is the
   `countryData` lookup used by the quiz *template generator*; it seeds no countries. The
   `countries` array actually seeded (seed.ts:782-833) has **one** entry, `uae`. A from-scratch
   seed writes 68 careers × 1 country = **68 rows**, not the ~1000 implied. Countries created at
   runtime by the LLM generator get zero trend rows, since nothing outside the seed calls
   `createJobMarketTrend` — which is itself further evidence the table was orphaned.

5. **"`nationalPriorityAlignment` is the one field with any signal in it."** FALSE, and this one
   flattered the data. The check tests whether a career's `relatedSubjects` is a **substring** of
   a country's `prioritySectors` (seed.ts:2060-2062). `relatedSubjects` are school subjects;
   `prioritySectors` are economic sectors. Evaluated over all 24 distinct subject values against
   the 10 UAE sectors it yields exactly two matches, both accidents:
   `"Art"` ⊂ `"**Art**ificial Intelligence"` and `"Science"` ⊂ `"Space & Advanced **Science**s"`.
   16 of 68 careers land in the high band, 52 in the low, decided by whether a career happens to
   list Art or Science. There is no domain signal in the field. All four numeric columns are
   noise, not three.

#### What is actually still broken

- **Dead code with a live cost.** Every recommendation generate issues
  `getJobTrendsByCareerIds` (matching.ts:402) and builds a map nothing reads.
  `getTrendsByCountry` and `getTrendByCareerAndCountry` (storage.ts:1047, :1054) have zero
  callers at all.
- **A fabricated table that looks like data.** 68 rows, one country, four generated columns, no
  provenance columns (`source`/`fetchedAt`/`vintage`) of the kind every other sourced dataset
  in this repo carries. The danger is not what it does — it does nothing — but that the next
  reader will reasonably assume it is populated and wire it back up. That is precisely how this
  entry came to be written.
- **The landing copy, now the only user-visible consequence.** Unchanged from the original
  entry and still correct: `landing.json:31` — "Get real data on career growth and
  opportunities in your country"; `ar:31` — "بيانات حقيقية". The product ships US-national O*NET
  growth bands (correctly caveated everywhere in code) and the vision component. It ships no
  country-scoped market data. The copy overclaims both the source and the scope.

#### What was decided, and why not the alternatives

**REMOVE.** But note that the original entry's option (a) — "it changes every match score in
the product, so it needs the weights redistributed deliberately rather than the component
silently zeroed" — describes work that `fc54470` and `c735f7a` already did, correctly, ten
months earlier. There is no weight to redistribute (`TIER_WEIGHT_OVERRIDES` has no `market`
key), no `SCORING_ALGORITHM_VERSION` bump, and no score movement. The seed.ts:3185 warning that
entry invoked — a disabled component still *holding* weight contributes nothing while occupying
it — does not apply here for the same reason. What remained was dead-code removal.

O*NET could NOT have filled it, and this was worth settling rather than leaving as an open
option. `careers.onetGrowthBand` has no country axis, no demand score, no openings, and
publishes a *band* ("Faster than average (5% to 6%)") rather than a rate — `growthBands.ts`
exists precisely because the previous hand-authored percentages were unsourced and wrong on 22
of 68 rows. Populating a country-scoped table from a US-national occupation band means
replicating one number across every country and attaching a real source to it, which is worse
than an obvious random number because it is harder to spot. The codebase already refuses this
move twice in its own words: `growthBands.ts:12-17` ("Nothing may gate a career on this signal
alone") and `futureReadiness.ts:22-26`, which names `job_market_trends` explicitly as the
country-scoped class that readiness is NOT in. Real per-country data remains what the original
entry said: procurement, with a refresh cadence, provenance and a coverage story.

Sequencing, as executed:
  1. Delete the orphaned read path and the seed writer. Tests stay at 312.
  2. Fix landing.json:31 / ar:31 on its own merits — no longer blocked behind a scoring
     decision, because there is no scoring decision.
  3. `job_market_trends` and `recommendations.future_market_demand` left for a later schema
     migration; both are inert once (1) lands.

ONE CHECK BEFORE THIS CLOSES — not about scores, about provenance. `resolveActiveComponents`
reads `assessment_components` from the DATABASE, not from the seed array, and `c735f7a` removed
the `market` row from the seed without deleting it from any database that already had it. Such
a row cannot move a score: `calculateCareerMatch` hits `if (!calculator) { continue; }`
(matching.ts:791-796) BEFORE `totalAppliedWeight += component.weight`, so it is excluded from
the denominator and the surviving components renormalise. But `generateConfigVersion` hashes
`activeComponents`, so an active market row WOULD change the `configHash` stamped into
`recommendations.scoring_provenance` — and therefore the drift buckets on the estate card
(:3366). Run against prod:

    -- Q1. Does a market component row still exist, and is it live?
    SELECT id, key, name, is_active, weight, requires_premium, display_order
    FROM assessment_components
    WHERE key = 'market';

    -- Q2. Does any tier still allocate weight to it? (join, so a row with no
    -- weights at all is visibly distinct from one weighted zero everywhere)
    SELECT t.key AS tier, w.weight, w.is_enabled
    FROM assessment_components c
    LEFT JOIN tier_component_weights w ON w.component_id = c.id
    LEFT JOIN scoring_tiers t ON t.id = w.tier_id
    WHERE c.key = 'market';

    -- Q3. Would it actually enter activeComponents? This reproduces the filter in
    -- resolveActiveComponents: is_active, then effective weight > 0. Any row
    -- returned here is stamping configHash today.
    SELECT c.key, c.is_active, c.weight AS db_weight
    FROM assessment_components c
    WHERE c.key = 'market' AND c.is_active = true AND c.weight > 0;

Expected: Q1 returns one row with `is_active = false, weight = 0` (how c735f7a's predecessor
seeded it) or no row at all; Q2 returns zero-weight/disabled rows or none; **Q3 returns nothing**.
If Q3 returns a row, delete the component row (not just deactivate it — an inactive row is
already excluded, so deactivating is enough for scoring but leaves the row to be re-enabled by
someone reading the admin UI) and expect stored `configHash` values written since to differ from
current for reasons that have nothing to do with weights. This is a data check, not a code
change; nothing in the repo can answer it.

First flagged 2026-09-09. Mechanism corrected and severity downgraded HIGH → LOW 2026-09-10.


### NEEDS HUMAN REVIEW — the free flow's consent is a checkbox that records nothing  (severity: MEDIUM)
Surfaced while building the school-consent work (docs/consent-implementation-recon.md §e) and
deliberately kept out of it. The school side is now decided and built: the school consents once
at enrolment as a recorded act, and the student is told rather than asked. **None of that
touches the free self-paid flow, which is where the remaining questions are — and they are
product decisions, not defects to be patched.**

DO NOT FIX THESE AS A GROUP, and in particular do not fix (2) by persisting `consentGiven`.
That would create a free-flow consent record as a side effect of a school-consent design, and
what a 13-year-old self-consenting should actually require is the undecided question underneath
all four.

**1. `consentGiven` is never persisted. Anywhere. For anyone.**
It exists only as React state on `AssessmentData` (Assessment.tsx:65). There is no column on
`assessments` (shared/schema.ts), and BOTH save payloads omit it — the debounced auto-save
(Assessment.tsx:662) and the step-advance save that carries a step's own write (:851). The one
occurrence of the identifier under `server/` is prose, not a reader: migration 022's header
comment recording that it was never persisted (022_organization_consents.sql:5). Now that school
students are shown a
statement rather than a control (c647443), **this tick is the only consent UI left in the
product — and it records nothing.** A free student's consent survives exactly as long as the tab
is open.

**2. On cross-device resume the tick is FABRICATED, not lost — and that distinction is the
finding.**
`Assessment.tsx:505` sets `consentGiven: true` in `hydratedData` unconditionally, because there
is nothing on the server to restore it from. So a free student who never ticked the box can be
resumed into a state that says they did.

This was first written up as the resume "voiding" the tick. It is the opposite, and the two are
materially different claims about the same line:

  - "loses consent that was given" is a UX defect — the student is asked again, is mildly
    annoyed, and the record (such as it is) stays truthful.
  - "asserts consent that was never given" is a data-integrity defect about a minor's consent.
    Nothing in the system can now distinguish a student who agreed from one who was resumed
    into agreement.

Only the second is worth escalating, and only the second describes the code. The sessionStorage
path (Assessment.tsx ~:373) round-trips the real value and is not affected; this is the
authenticated cross-device path only.

**3. `under18Note` promises a mechanism that does not exist.**
`assessment.json demographics.under18Note` — "Note: Users under 18 require parental or
institutional consent" — is rendered to any self-paid student under 18, with no parental flow
behind it and no institution. The school attestation now covers the institutional half, but
school students never see this branch. The free age range is 13-25 (the age input's min/max), so
under-18 self-consent is the common case here, not an edge.

**4. A superadmin can mint an account with no consent record of any kind.**
`POST /api/superadmin/students` (superadmin.routes.ts:2435) calls
`storage.createStandaloneUser`, which writes a `users` row with `accountType: 'individual'` and
no organization membership. It is deliberately NOT covered by the enrolment gate (bbb1869) and
the exclusion is commented in consentGate.ts: it enrols nobody into a school, so there is no
organization whose consent could gate it. That is correct as far as the school design goes, and
it leaves a real hole on this side — an account created by an administrator, for a person who
may be a minor, with no consent artifact anywhere.

  CORRECTION, recorded because it was acted on: the pre-build report named this as the FOURTH
  org enrolment path and it is not one. There are three, all sinking into
  `storage.createUserWithCredentials`. The ruling taken from that report — "block superadmin
  student-create under the same gate, no exception" — could not be implemented as stated,
  because the premise was wrong rather than the intent. The part of that ruling that WAS
  implementable is enforced: the attestation endpoint is org_admin-only, so a superadmin cannot
  attest for a school (3a7e48a).

WHAT NEEDS DECIDING, in the order that makes the others answerable:

  (a) Is a 13-year-old ticking a box on their own behalf an acceptable basis at all? Everything
      else is downstream. If the answer is no, the free flow needs a guardian mechanism or an
      age floor, and (1)-(3) resolve themselves.
  (b) If it is acceptable, the tick has to be recorded — the same fields the school act records
      (timestamp, policy version, channel evidence), on the assessment or the user. At that
      point (2) becomes a straightforward bug rather than a design question, because there is
      something real to restore on resume.
  (c) `under18Note` should either name a mechanism that exists or stop promising one. It is
      the cheapest of the four and can be done independently of (a) — but softening the wording
      is NOT a fix for (a), the same way softening the landing copy was not a fix for the
      job-market entry (:3003).
  (d) Whether superadmin-created individual accounts belong in the free flow's answer or need
      their own, given the creator is not the subject.

First flagged 2026-09-10.


### The enrolment gate has no UI — the admin meets it as an untranslated toast — RESOLVED 2026-09-10 (e267331, 3bab6c5, 148b027)  (was: MEDIUM)
bbb1869 gates the three enrolment paths with `409` and a machine-readable `code:
CONSENT_REQUIRED`, added so the client could tell a consent block apart from an authorization
failure. Nothing reads it: `grep -rn "CONSENT_REQUIRED" client/src` returns nothing.

What an org_admin actually sees when they add a student before attesting is the page's generic
failure toast — title `t('superadmin.error')`, body `serverErrorMessage(error)`
(AdminOrganizations.tsx:1860-1864) — carrying the server's hardcoded English sentence from
consentGate.ts:35. Bulk upload has the same handler shape (:2088-2092).

Three gaps, in the order they bite:

1. **Not localized.** `CONSENT_REQUIRED_MESSAGE` is an English string literal in server code. An
   Arabic-locale admin gets an English sentence in a red toast. Every other admin-facing failure
   on this page renders a translated key with `serverErrorMessage` only as an override; this one
   has no key to fall back to, so the override IS the message.

2. **The string for it already exists, in both locales, and renders nowhere.** `consentBlocked` —
   "Add students after recording consent above." / "أضِف الطلبة بعد تسجيل الموافقة أعلاه." —
   shipped in aec29f7 (en/admin.json:383, ar/admin.json:383) and is referenced nowhere in
   client/src. It was written for a pre-emptive state on the roster that was not built.

3. **The hook for it is exported and unused.** `useOrganizationConsent`
   (OrganizationConsentCard.tsx:56) carries the comment "Shared with the roster so 'has this
   school consented' has one answer". The roster does not import it — AdminOrganizations.tsx
   mounts the card and nothing else. The comment describes an intent, not the code.

So the gate is discovered by failing. The admin opens the add-student form, types a minor's
name, grade, gender and date of birth, submits, and is told in English that the school has not
consented — with no pointer to the card that would unblock them, which is on the same page,
above the roster, unread.

NOT A SECURITY DEFECT. The gate holds, it holds server-side, and it fails closed; that is the
half that matters and it is done. This is the half that decides whether a school meets the gate
once and understands it, or meets it repeatedly and opens a support ticket.

FIX SHAPE (described, not applied): have the roster read the hook that was exported for it; when
consent is absent, render `consentBlocked` beside a disabled Add Student rather than letting the
submit fail; and give `CONSENT_REQUIRED` a translated client key, keyed off the code the server
already sends — the code exists for exactly this and nothing consumes it. Note the ordering
constraint: the pre-emptive state must not become the enforcement. The server gate stays.

ALSO: the CSV path (`POST /api/admin/organizations/:id/import-students`) is gated but has no
client caller at all — `grep -rn "import-students" client/src` returns nothing. It is API-only
today, so nobody meets its 409 through the UI, and its share of this entry is theoretical until
someone builds the screen.

First flagged 2026-09-10.

CLOSED 2026-09-10, all three gaps, in the order they were filed:

  e267331  `serverErrorCode` beside `serverErrorMessage`, and the two enrolment handlers render
           `consentBlocked` when the code is CONSENT_REQUIRED. The code itself moved to
           shared/consentRequired.ts and the gate re-exports it: a client-side literal that
           drifted would not throw and would not fail a test, it would silently restore the
           English fallback, which is the least reviewable way for this to come back.
  3bab6c5  the roster reads `useOrganizationConsent` — the hook whose comment already claimed
           it did — and disables Add Student and Bulk upload with the reason beside them and a
           link that scrolls to the attestation card.
  148b027  six cases on the parser, one of which builds the gate's own 409 body from the
           server's exported constants, so a drift between the two ends fails a test instead of
           failing an admin.

No new strings and no new unreviewed Arabic: `consentBlocked` and `consentTitle` are used as
they shipped in aec29f7, which is what the Arabic-unreviewed entry already covers.

WHAT REMAINS OPEN, and neither is a defect in the above:

  1. THE SUPERADMIN HAS NO PRE-EMPTIVE STATE, structurally. GET /api/my-organization/consent is
     org_admin-only (organization.routes.ts:87), by the same design that stops a superadmin
     attesting for a school. So a superadmin viewing a school cannot read its consent state and
     the disable never fires for them — they still meet the gate as a toast, now a translated
     one. Treating unknown as blocked would permanently disable a control over a fact they
     cannot query, so the code fails open on the affordance and closed on the gate, and says so.
     Closing this properly means a superadmin-readable consent state, which is a new endpoint
     and a decision about whether a superadmin should see which schools have attested.
  2. THE CSV PATH STILL HAS NO CLIENT CALLER, so its share of this entry is still theoretical.
     Whoever builds that screen inherits both halves: the code branch and the disable.


### STEP 6 BLOCKED — withdrawal has no channel, and the address the policy gives minors cannot receive mail  (severity: HIGH)
Position (4) of the consent design — WITHDRAWAL MUST NOT ROUTE THROUGH THE SCHOOL, since the
school is the party whose consent is being relied upon — is the one proposal from the ruling at
:2499 that did not ship. It is BLOCKED rather than deferred, and the block is not in the
codebase: the contact address the Privacy Policy gives cannot receive mail. Building the product
surface first would hand a student a button that files a request nobody receives, which is worse
than no button — it converts a missing channel into a channel that appears to work.

WHAT EXISTS, AND IT IS MORE THAN EXPECTED. `DELETE /api/users/me` (user.routes.ts:123) is real,
it works, and it is `isAuthenticated` only — no role check, no organization check, no admin
approval. It reads `req.user.userId` and erases that user's own assessments, quiz responses, CVQ
results, recommendations, organization membership and user row in one transaction, then destroys
the session. So an org student CAN erase themselves without their school's involvement, which is
exactly the property position (4) requires. The mechanism is not the gap.

  BUT ERASURE IS NOT WITHDRAWAL, and the entry should not claim it is. This route is the maximal
  form — everything goes. A student who wants to withdraw consent to processing while keeping
  the report their school already acted on has no path at all, and neither does one who wants
  their data out of analytics but their account intact. Position (4) needs a channel to a person
  who can act, and that person needs options between "nothing happens" and "delete everything".

WHAT IS MISSING. Nothing in the product reaches any of it. `grep -rn "users/me" client/src`
returns exactly one hit — the language PATCH in LanguageContext.tsx:73. Three data-rights
endpoints exist and are invisible:

  GET    /api/users/me/export         (user.routes.ts:40)   — the PDPL/GDPR data export
  GET    /api/users/me/data-summary   (user.routes.ts:196)  — what is held, for transparency
  DELETE /api/users/me                (user.routes.ts:123)  — erasure

They are reachable only by someone who reads the source or crafts the request. For the actual
users — 13-18 year olds — they do not exist.

THE ADDRESS IS DEAD, and this is the blocker. `privacy@futurepath.ae` appears twice per locale
in the Privacy Policy (en/legal.json:20 and :32, ar/legal.json:20 and :32) — once as the way to
request deletion and once as the general contact. VERIFIED 2026-09-10: `futurepath.ae` has NO MX
records (`resolveMx` → ENODATA) against nameservers ns1-4.etisalatdomains.ae. It does have an A
record (216.24.57.1, the Render edge).

  THAT COMBINATION IS WORSE THAN NO DNS AT ALL. With no MX and an A record present, a sending
  mail server falls back to the address record (RFC 5321 implicit MX) and tries to deliver to
  the WEB SERVER on port 25, which does not answer SMTP. The sender then queues and retries for
  days before giving up. So a student who writes to the address in the policy gets no
  acknowledgement, no immediate rejection, and eventually a delayed bounce written in mail-server
  language — days later, if their provider surfaces it at all. The failure looks, to a 13-year-
  old, like being ignored.

  IT IS NOT A CONFIG CHANGE. The registrar panel offers DNS records but no built-in forwarding,
  so this needs an actual mail provider on the domain (Zoho's free tier or equivalent), MX
  records pointed at it, and someone who reads the mailbox. The last of those is the real cost
  and it is a staffing commitment, exactly as the ruling at :2499 said.

  OUTBOUND IS FINE, AND THIS ENTRY FIRST CLAIMED OTHERWISE. As filed it said "outbound mail does
  not use this domain either", and that was wrong in a way worth naming rather than quietly
  editing: it read the code default at email.ts:5 and asserted a deployed behaviour from it,
  without checking what Render sets. EMAIL_FROM is set in production and password reset works
  end to end — verified 2026-09-08 by a real reset that arrived from `noreply@futurepath.ae`,
  was not spam-foldered, and whose link completed. Corrected status at :2004.

  WHAT IS TRUE IS THE ASYMMETRY, and it is the useful part for step (1) below. The domain is
  configured for SENDING and not for RECEIVING, which is an ordinary state rather than a broken
  one: `resend._domainkey.futurepath.ae` carries a DKIM key, `_dmarc.futurepath.ae` is
  `v=DMARC1; p=none;`, and `send.futurepath.ae` holds Resend's SPF plus its own MX for bounce
  feedback (`feedback.forge.rmta.net`). The APEX has no MX and no TXT at all. Verified
  2026-09-10.

  SO THE INBOUND WORK IS ADDITIVE, WITH TWO THINGS NOT TO DISTURB. The mailbox provider's MX
  records go on the APEX, where there are none today. Do not touch `send.futurepath.ae` — that
  MX is Resend's bounce path, not a mailbox — and do not disturb `resend._domainkey`. If the new
  provider asks for an apex SPF record, note that the apex has none now and that Resend does not
  depend on one (its Return-Path sits on `send.`), so an apex SPF would be added for the new
  provider alone and should list only what that provider needs.

  Pairing the two directions is still right — one person, one DNS panel, one afternoon — just
  not because both are failing. Only inbound is.

THE SEQUENCE, and the order is the point:

  1. THE MAILBOX. A mail provider on futurepath.ae, MX records, and a named person who reads
     privacy@. Until this exists nothing downstream is worth building.
  2. THE POLICY ADDRESS. Only once (1) is live: confirm the address in legal.json en/ar:20 and
     :32 is the one that now receives, or change it to the one that does. Both locales, since
     they drift independently.
  3. THE PROFILE SURFACE. Then, and only then, expose the three endpoints — export, data
     summary, delete — with the withdrawal contact beside them, in language a 13-18 year old
     reads. This is the step that makes the rights real, and it is the step that must come last.

  Doing (3) first is the specific failure to avoid. A student who clicks a delete button and a
  student who writes to a dead address are in different positions only if someone is on the
  other end; a request form with no recipient is a worse artifact than the current silence,
  because it evidences a channel that was never there.

CARRY THIS WITH IT: the licence-seat leak sits on this exact route. `DELETE /api/users/me`
deletes the `organization_members` row and never decrements the school's `usedLicenses`, while
the admin path does — see the entry above. Today that costs a seat per self-erasure and nobody
notices because nothing in the product invites a student to self-erase. Step (3) is what turns
it on at scale: the moment a Profile screen offers erasure to every student in a school, the
school starts silently losing paid seats, and the entry above explains why the obvious `-1` is
not the fix. FIX THE ACCOUNTING BEFORE SHIPPING THE SURFACE, not after.

First flagged 2026-09-10. Blocked on the mailbox, which is not a code change.


### DECISION — the consent record outlives the school, and keeps an ex-admin's contact details  (recorded decision, not a finding)
Recorded here because until now it existed only as a comment in a migration header
(server/migrations/022_organization_consents.sql:23-31, echoed in `COMMENT ON TABLE`). The next
person to read that comment is whoever is asking why a deleted school's data still exists, and
that reader is entitled to find a decision rather than a rationale — a rationale in a code
comment is something a later contributor "fixes".

THE DECISION. `organization_consents` rows survive the deletion of both the organization and the
admin who made them. Both foreign keys are `ON DELETE SET NULL` (022:35, :43) and
`organization_name`, `performed_by_name` and `performed_by_email` are denormalised (022:36,
:46-47) precisely so the row still says who attested for which school once the FKs have nulled.

WHY. What the row evidences is that processing had a lawful basis, and that question is asked
most sharply after the data it justified is gone. A consent record deleted along with the
organization proves nothing at the only moment anyone needs it to.

THE COST, STATED PLAINLY. A row for a school that no longer exists still carries a named
individual's name and email address — an ex-admin of a defunct customer — retained with no
expiry, after every other trace of that organization has been erased. This is the ONLY place in
the schema that deliberately keeps personal data past an erasure. Two things make it defensible
and neither makes it free: it is an adult's business contact data rather than a student's, and
naming the attester IS the accountability the record exists to provide. It is still personal
data under PDPL, and it is still kept without limit.

WHAT WOULD CHANGE THE ANSWER: a written retention schedule — the migration comment already says
"revisit it if a retention schedule is ever written", and this entry is that hook. The shape to
reach for is a period after which the row keeps the attestation and drops or hashes the
attester's contact details. Note that this is not a free trade: the name is the accountability,
so a schedule has to say what stands in its place, not merely remove it. Related: the retention
gap at :2451 — no cron, TTL or purge exists for student data either, so there is no schedule
anywhere to attach this to yet.

NOT A LICENCE TO "FIX" THIS. Reading `ON DELETE SET NULL` as an oversight and changing it to
`CASCADE`, or dropping the denormalised name/email columns as redundant against the FKs,
destroys the record at exactly the point it becomes load-bearing. Either change reopens this
decision; neither is a migration someone writes on their own judgement.

Recorded 2026-09-10.


### A student who erases their own account leaves the school's seat consumed  (severity: MEDIUM)
`DELETE /api/users/me` (user.routes.ts:123) is the GDPR erasure path. Inside its transaction it
deletes the `organization_members` row under the comment "GDPR: frees license slot and removes
PII" (user.routes.ts:161-163). It frees the row. It does not free the slot: nothing in that
handler calls `updateOrganizationQuota`, so `organizations.usedLicenses` still counts a student
who no longer exists.

The admin path does both halves — `deleteOrganizationMember` then
`updateOrganizationQuota(req.params.id, -1)` (admin.routes.ts:1157-1158) — and bulk delete does
the same with `-deletedCount` (:1233). So the SAME ACT performed by the school and by the
student leaves the school with different licence counts, and it is only the student's own
erasure that leaks. The comment is the tell: someone knew the slot had to be freed and wrote
that it was.

WHAT IT COSTS. Each self-erasure permanently burns a paid seat. `usedLicenses` is a maintained
counter with no reconciliation anywhere — nothing recomputes it from `organization_members` —
so the drift is one-way and cumulative. And it eventually bites: `updateOrganizationQuota`
refuses to exceed `totalLicenses` (storage.ts:2631, throwing "Quota exceeded"), so a school that
has had N students erase themselves loses N seats and can be blocked from enrolling while its
roster plainly shows capacity. The admin reading that error has no way to see why.

THE SECOND HALF, AND DO NOT FIX THE FIRST WITHOUT IT. A seat is not always taken from the same
pool. `consumeLicenseWithRewardPriority` (storage.ts:2703) spends a reward credit first
(`rewardCreditsUsed` +1) and only falls back to a paid licence (`usedLicenses` +1) — it is what
all three enrolment paths call (admin.routes.ts:761, :921, :2365). `organization_members`
records nothing about which pool was spent (shared/schema.ts:150-195: no licence-type column).
So the admin path's flat `-1` ALREADY refunds a paid licence for a member whose seat came from
reward credits, understating `usedLicenses` and overstating capacity in the other direction.
Copying that `-1` into the self-delete path would replicate the error rather than fix it. The
shape that works is either recording the pool on the member row at enrolment, or deriving
`usedLicenses` from the roster instead of maintaining a counter — and the second makes both
defects impossible rather than corrected.

SEVERITY IS NOT ESCALATED, deliberately. This is an accounting defect in the school's counter;
no student data is exposed or retained by it. The minors'-data escalation rule does not reach
it, and calling it CRITICAL would spend the word.

ADJACENT, ON THE SAME HANDLER, NOT THE SAME DEFECT: the admin path refuses to delete a member
with `isLocked` — a student who has completed an assessment (admin.routes.ts:1155). The
self-erasure path has no such check, so a student can erase a locked row their own school admin
cannot. That is probably correct — erasure is the student's right and not the school's — but the
asymmetry is undocumented, and anyone reconciling these two paths will meet it before they meet
the reason.

First flagged 2026-09-10.


### NEEDS HUMAN REVIEW — quiz question SELECTION is an unseeded random draw  (severity: MEDIUM)
Surfaced by the `Math.random` sweep over `server/` that closed the job-market entry above
(docs/job-market-random-recon.md §5). Filed separately and deliberately: **random sampling from
a question bank is defensible test design; random values presented as market data are not.**
The two look alike under grep and are not the same finding. Do not fold them together, and do
not "fix" this one by analogy with that one.

The sweep found eight `Math.random` call sites in `server/`. Four were the job-market seed
writer (now deleted, 07383d5). Three are username-collision suffixes in storage.ts — identity,
not scoring, no finding. The eighth is this.

WHAT IT IS. `shuffleArray` (utils/quiz.ts:7-15) is an unseeded Fisher-Yates, used by
`shuffleQuestions`, called three times in quiz.routes.ts:

    :375   const shuffled = shuffleQuestions(questionsForSubject);
           selectedQuestions.push(...shuffled.slice(0, available));   <- SELECTION
    :388   const shuffled = shuffleQuestions(remaining);
           selectedQuestions.push(...shuffled.slice(0, needed));      <- SELECTION
    :409   const finalShuffledQuestions = shuffleQuestions(selectedQuestions);   <- order only

The third call is presentation order and is fine. The file already documents why OPTION order,
by contrast, must be deterministic — `transformQuizQuestionForFrontend` derives it from the
quiz id via `seededPermutation` (quiz.ts:56-64) so that generate and the two re-read paths
agree. That machinery exists, in this file, and is not used by the first two calls.

The first two are not order. `shuffle(...).slice(0, n)` decides WHICH questions a student
answers.

WHY IT IS NOT NEGLIGIBLE — the numbers, because "it's just a shuffle" is the intuition to check:

  - The draw is real, not a formality. The UAE bank holds 6-10 questions per (subject, grade)
    — Mathematics, Science, English, Arabic, Social Studies, Computer Science, at 10/10/7/7/6
    for grades 8/9/10/11/12. The target is 2-4 questions per subject on free
    (`TIER_CONFIGS`, quiz.routes.ts:51-67) and 3-5 on premium/school. Choosing 2 of 10 is 45
    distinct draws.
  - Nothing balances the draw. `calculateQuizDistribution` (:69-90) allocates by SUBJECT only.
    `difficulty` (easy/medium/hard) and `cognitiveLevel` are stored per question
    (schema.ts:848) and consulted by NOTHING in the selection path.
  - The sample is tiny, so the score is coarsely quantized. Competency per subject is
    `round(correct / total * 100)` with total = 2-5 (:748-750). At n=2 the only attainable
    values are 0, 50 and 100. One question different is a 50-point swing on that subject.
  - And it is weighted. `calculateSubjectsScore` blends 40% preference + **60% quiz
    competency** when quiz data exists (matching.ts:971-973), and `subjects` is worth 35% of a
    free match score and 20% of premium. So quiz competency carries **21 of 100 points on
    free**, 12 on premium. For a career matching on a single subject, the 50-point competency
    swing above moves the overall match score by **10.5 points — decided by which two
    questions were drawn.**

WHAT IS *NOT* WRONG WITH IT, stated so the entry is not read as more alarming than it is:

  - It is not fabricated data. Every question in the draw is real, authored, curriculum-scoped
    content. This is sampling from a valid instrument, which is ordinary practice.
  - The administered quiz IS persisted and recoverable. Migration 019 made `assessment_id`
    unique and the race at :410+ converges rather than failing, so one quiz exists per
    assessment and a student's actual questions and answers can always be read back. What is
    not reproducible is the DRAW — you cannot re-derive which questions would have been picked
    — which is a weaker property than it first sounds.
  - `Math.random()` is not a security primitive here and does not need to be. Nothing in the
    selection is secret; a student gaining foreknowledge of their own question set is not a
    threat this product has. No CSPRNG finding.

WHAT NEEDS DECIDING — psychometric, not technical, which is why this is NEEDS HUMAN REVIEW and
not a fix:

  (a) Should two students with the same ability get the same score? Today they do not, and the
      variance comes from the instrument rather than from them. The counter-argument is real:
      a fixed question set per (subject, grade) is memorisable and shareable between students
      in the same class, which is a worse failure for a school product. Randomised draws exist
      precisely to prevent that.
  (b) If the draw stays random, should it at least be STRATIFIED — hold the easy/medium/hard
      mix constant across draws, so what varies is which questions rather than how hard the
      quiz was? This is the change that addresses the measurement problem without giving up
      the anti-memorisation property, and it is the one worth costing first.
  (c) Should the draw be REPRODUCIBLE per student — seeded on the assessment id via the
      `seededPermutation` already in utils/quiz.ts? This is nearly free technically. Note it is
      orthogonal to (b): a seeded draw is repeatable but still unstratified, so it fixes
      auditability and fixes nothing about fairness between students.
  (d) Is n=2 (free tier, non-priority subject) enough to call anything a "competency" at all,
      given it can only ever return 0, 50 or 100 and then carries 21 points of the match score?
      This is the question the other three are downstream of, and it may be that the honest
      answer changes the WEIGHT rather than the draw.

DO NOT change the draw before (a)-(d) are answered. Making it deterministic is a two-line
change and would be the wrong two lines if the answer to (a) is that randomisation is load
bearing. Any change here also moves stored scores and is a `SCORING_ALGORITHM_VERSION` bump
(matching.ts:857, currently 4), not a tidy-up.

First flagged 2026-09-10.


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

### Assessment History renders every row now — three gaps it deliberately leaves  (severity: low)
b7ea0e5 replaced the single-card Assessment History with a mapped list, and a9b33cc collapsed the
Career Journey to one row per grade. Three things they knowingly do not do, in the order they will
be felt:

1. **NO "TAKE IT AGAIN" ENTRY POINT.** The counter says "2 of 3"; nothing in the block starts
   number 3. The only CTA is the empty-state "Start Your First Assessment", which renders only when
   the list is empty. This was item 5 of the earlier Profile recon and is the reason free retakes
   are, from the profile, invisible as an offer — a student learns the cap exists only by reading a
   count. A new affordance, not part of rendering the rows, which is why it was left.

2. **A STEP-1 DRAFT RENDERS AS A CARD WITH NO ACTION.** Continue is now gated on the same predicate
   the assessment page resumes on (`isResumableDraft`: `!isCompleted && currentStep > 1`), because
   the old list-wide `some(a => !a.isCompleted)` offered Continue on rows that started a BLANK
   assessment. Such rows exist because POST /api/assessments does not send currentStep, so a student
   who leaves between the create and the first auto-save PATCH leaves the schema default of 1 behind.
   The row is honest but a dead end — and it is a dead end only because of (1): before the fix, its
   Continue button worked by accident, doing what a "take it again" button would do deliberately.
   Fixing (1) closes this one too.

3. **ONE sessionStorage DRAFT SLOT, STILL.** `DRAFT_KEY` is a single slot, so resuming row B
   overwrites the local draft for row A. Row A's server-side state is intact and it still resumes
   from the profile; only the richer local RIASEC/CVQ raw responses are lost. Pre-existing and
   unchanged, but newly REACHABLE: two simultaneous drafts were not something a student could hold
   before 261b85f, and the per-row Continue buttons are what make choosing between them possible.

Also unchanged, and noted so it is not mistaken for an oversight: `/api/students/me/progression`
still returns the UNCOLLAPSED history, one entry per assessment. That is deliberate — it is the raw
history, nothing in the client reads it today, and it is where a within-grade view would belong if
the "how did I move within Grade 12" question is ever asked as a feature. The collapse belongs to
the Career Journey, which asks a per-grade question.

Recorded 2026-09-09.

### Arabic unreviewed — four Assessment History row strings  (severity: low)
b7ea0e5 added four Arabic strings to `ar/profile.json` under `assessment`, none reviewed by an
Arabic speaker:

- `latest` — `الأحدث` (badge on the most recent completed assessment)
- `inProgress` — `قيد التنفيذ` (badge on an unfinished one)
- `gradeUnknown` — `الصف غير مسجل` (row heading when the assessment carries no grade)
- `continueThis` — `متابعة` (per-row Continue button)

`continueThis` IS THE ONE TO CHECK, and it is a shortening rather than a translation: it replaces
`continueAssessment` (`مواصلة التقييم`, "Continue Your Assessment"), which was list-wide phrasing and
wrong on a row. `متابعة` is the bare verbal noun — right for a button whose object is the card it
sits on, but it is a different register from the sentence it replaced, and `مواصلة` may read better
on a button in this file's voice. The other three are short labels with no strong alternatives;
`الصف غير مسجل` ("the grade is not recorded") is the only one that asserts anything, and it should
agree with however the demographics block above phrases a missing value.

Recorded 2026-09-09.

### Arabic unreviewed — the landing hero counter and the progress feature card  (severity: low)
`1988e76` and `add699e` rewrote three Arabic strings in `ar/landing.json`, none reviewed by an
Arabic speaker. One of the three is a deliberate structural choice, not a translation, and it is
the one to check:

- `hero.assessmentsCompleted` / `hero.assessmentsCompletedPlural` — both `عدد التقييمات المكتملة:
  {{count}}` (was `يثق به {{count}} طالب` on both keys)
- `features.progressDesc` — `راقب رحلتك بمؤشرات تقدم بصرية` (dropped `وشارات إنجاز`)

**THE TWO COUNTER KEYS ARE DELIBERATELY IDENTICAL, and that needs confirming rather than
correcting.** Arabic inflects a counted noun differently at 1, 2, 3-10 and 11+; `Landing.tsx:101`
chooses between exactly two keys, so no inflected phrasing can be right across the plural branch.
`عدد التقييمات المكتملة: {{count}}` ("number of completed assessments: N") states the count as a
labelled quantity and is well-formed for every value, including 0 and the literal `"..."` the
component passes while the query is loading. That is why the singular and plural strings match —
the distinction is genuinely absent in this construction, not missing. **If a reviewer prefers a
counted-noun phrasing, the component needs restructuring too, not just the strings**; a two-key
selector cannot express Arabic plurals, and `displayCount` arrives as a *string*
(`toLocaleString()`), so i18next's own plural resolution can never fire on it either. The English
keeps a real singular/plural pair because English has one.

Secondary: `عدد ... :` is a stat-label register, flatter than the promotional `يثق به` it
replaced. That was unavoidable given the above, but if the hero wants promotional voice in Arabic
the sentence has to be rebuilt around an uncounted noun rather than re-inflected.

`features.progressDesc` is a deletion, so the risk is only that the remaining clause reads as
truncated; `راقب رحلتك بمؤشرات تقدم بصرية` should stand alone. Worth noting the Arabic was the
stronger of the two claims removed — `شارات إنجاز` is specifically *achievement* badges, where the
English `badges` was vaguer.

Recorded 2026-09-09.

### Two quizzes can exist for one assessment, and readers pick arbitrarily — FIXED (migration 019), entry closed 2026-09-10  (was: HIGH)
`getAssessmentQuizByAssessmentId` (`storage.ts:1264-1270`) has no `ORDER BY`, no `LIMIT`, and
`assessment_quizzes.assessment_id` carries no unique constraint. `POST /quiz/generate` guards
against a second quiz by reading through that same unordered query (`quiz.routes.ts:197`), so two
concurrent generates — a double-clicked button — can both find nothing and both insert.

From then on every reader picks an arbitrary row. Submit completes whichever it picks (`:576`);
matching may read the other and report 0% subject competency for a student who genuinely completed
the quiz. This is the path by which the fabricated-zero defect reaches a normally completed
assessment through the ordinary UI.

THE FIX IS A UNIQUE INDEX ON `assessment_id`, NOT AN `ORDER BY` — ordering makes the read
deterministic while leaving the duplicate row in the table, and a duplicate quiz is itself wrong:
its responses are a second set of questions the student never answered. Needs a check for existing
duplicates before the constraint can land:

    SELECT assessment_id, COUNT(*) FROM assessment_quizzes
    GROUP BY assessment_id HAVING COUNT(*) > 1;

Note the fabricated-zero fix (`b578ab0`) does not close this and was not meant to: it filters on
`completedAt`, and the failure here is reading the WRONG quiz row — an unsubmitted duplicate of a
quiz that was in fact submitted. After that fix such a student gets `{}` and scores on preference
alone rather than on a fabricated 0%, which is a smaller error but still not their result.

First flagged 2026-09-09.

FIXED by `server/migrations/019_assessment_quizzes_unique.sql`, and this entry simply was never
closed — it has been reading as open at HIGH since the fix landed. Closed 2026-09-10 on review.

The migration took the unique index this entry asked for, and took it WITHOUT a de-duplication
step, deliberately: collapsing duplicates would mean deleting `quiz_responses` rows, which are a
student's real answers, and no automatic rule can choose which of two quizzes a student keeps. It
fails loudly instead and a human decides. Production was verified at zero duplicates first, with
the query above.

Note what the constraint bought beyond the duplicate: `getAssessmentQuizByAssessmentId` still has
no ORDER BY and still takes the first row, and `POST /quiz/generate`'s duplicate guard is still a
check-then-act. Both are now correct BECAUSE at most one row can exist. The schema comment at
`shared/schema.ts` says so, because dropping the index would leave both quietly wrong again
without either failing.

### assessments.subject_competencies is written, client-PATCHable, and read by nothing  (severity: MEDIUM)
Three copies of one number exist. Submit writes two of them — `assessment_quizzes.subject_scores`
(`quiz.routes.ts:646`) and `assessments.subject_competencies` (`:652`) — and matching recomputes a
third from the response rows (`storage.ts:2226`).

`subjectCompetencies` sits in the PATCH allowlist at `assessment.routes.ts:510`, so any owner can
write arbitrary values into it. **That is harmless today only because nothing reads it**: a grep
finds the writer, the allowlist entry and the column definition, and no reader at all.

The trap is that it looks like the obvious thing to read. Anyone who later proposes reading it as
a scoring input — a reasonable-sounding simplification, since it is written at submit and so
cannot carry an unsubmitted quiz's zeros — **must remove it from that allowlist in the same
change**, or they hand a student direct control of 60% of their own subject score. Two further
reasons it was not adopted as the fix for the fabricated zeros: `subjectScores` is
`{subject: {correct, total, percentage}}`, not the `{subject: number}` the matching context
expects, and neither column can be assumed present on rows written before it existed, so switching
readers would silently lose competency for older assessments rather than failing loudly.

The cleanup is to decide which copy is authoritative and delete the others, not to add a reader.

Recorded 2026-09-09.

### Submit-time and recompute-time subject denominators are two implementations  (severity: LOW)
The same number is computed twice by different code. Submit accumulates `subjectScores` in its
scoring loop (`quiz.routes.ts:625-632`), incrementing `total` only for rows it actually marked;
`getAssessmentWithCompetencies` recomputes it from the stored rows. The loop `continue`s twice
without marking — when a question is not in the fetched set (`:608`) and when a multiple-choice
question has a falsy `correctAnswer` (`:610-612`) — so those rows left the two totals disagreeing.

`b578ab0` closed the divergence by filtering on `isCorrect IS NOT NULL`, which makes the recompute
reproduce submit's denominator exactly. **The underlying cause is unfixed**: two independent
implementations of one calculation, kept in agreement by a filter that a future edit to either
side can break silently, since nothing compares them. `quiz_questions.correct_answer` is `notNull`
so the second `continue` can only fire on an empty string — defensive rather than routine, which
is precisely why a regression here would not be noticed.

Recorded 2026-09-09.

### Curriculum rename and pending contribution submissions  (severity: medium — needs a decision)
The third table holding a curriculum string, found during the 2026-09-09 rename recon and
deliberately LEFT OUT of the GAP 1 fix. That fix was mechanical; this one is not, because the
right answer differs per submission status and picking one is a product decision.

`contribution_submissions.curriculum` (shared/schema.ts, NOT NULL) is not a label. It is copied
forward into the quiz bank at approval time:

    server/routes/contribution.routes.ts:518
      curriculum: submission.curriculum,

So a submission that was pending when a rename ran will, whenever a superadmin approves it,
INSERT NEW quiz_questions ROWS CARRYING THE OLD NAME — re-contaminating the table the rename just
cleaned, at an arbitrary later date, through a path nobody is watching. That is a different shape
from the other two gaps: they leave stale rows behind, this one manufactures fresh ones after the
fact. A second rename cannot catch them either — by then the old name is gone from
countries.curricula and the rename route's own precondition refuses the call.

FIVE STATUS BUCKETS, FIVE DIFFERENT ANSWERS. This is why it is not one UPDATE:

1. **pending / llm_verified / in_review — ARMED.** These can still be approved
   (contribution.routes.ts:486 gates review on exactly this set), so each one is a delayed
   re-contamination. The case for renaming them is strongest here and close to unarguable.

2. **approved — the genuinely hard one.** The questions this submission produced were already
   inserted, and the rename cascade DID update them, so the quiz bank is correct. The submission
   row is now a historical record whose curriculum disagrees with the questions it created.
   Renaming it keeps the two consistent and loses the record of what the school actually
   submitted under; leaving it preserves the submission as filed and makes the provenance trail
   (quiz_questions.contributionSubmissionId) inconsistent. This is a question about whether a
   submission is a live record or an archived one, and the same question decides GAP 2.

3. **rejected — inert.** Never becomes a question. Renaming buys nothing but tidiness; the
   argument for leaving it is that it records what was actually rejected.

4. **needs_changes — stale, and a dead end in the current code.** Worth recording on its own:
   there is NO route that returns a needs_changes submission to a reviewable state. Review is
   gated on pending/in_review/llm_verified (:486), the only other write is POST /submit which
   creates a NEW row, and nothing resets the status. So a school asked for changes cannot revise
   in place — it must resubmit, producing a fresh row with the then-current curriculum. That
   makes the rename question moot for this bucket and raises a separate one about whether
   needs_changes should exist at all in its current form.

5. **claimed — AND IT IS NOT IN THE SCHEMA'S OWN LIST.** Added 2026-09-09; the entry said four
   buckets and there are five. `claimed` is written at contribution.routes.ts:611-613 once the
   school's reward has been allocated, so it is post-approval and inherits bucket 2's reasoning
   exactly — the questions are already in the bank and already renamed. What makes it worth its
   own number is that shared/schema.ts:1655 documents the column as
   `pending, llm_verified, in_review, approved, rejected, needs_changes` and DOES NOT MENTION
   `claimed`. Anyone who writes the eventual UPDATE from that comment — the obvious place to
   look for the allowed values — will produce a status list that silently misses every
   rewarded submission. The schema comment should be corrected whenever this is actioned.
   Filed here rather than as its own entry because it is only reachable through this decision.

A SECOND CONSEQUENCE CLOSED ITSELF with the GAP 1 fix, and is recorded so nobody re-opens it:
contribution.routes.ts:340-344 rejects a submission whose curriculum does not match the school's
own. While organizations.curriculum held a stale name and the UI offered the new one from
countries.curricula, the two could never agree and AFFECTED SCHOOLS COULD NOT SUBMIT AT ALL —
with an error naming two strings a school admin had no way to reconcile. Renaming
organizations.curriculum fixes the write path. Only the stored rows above are still open.

Detection SQL is in docs/curriculum-rename-cascade-recon.md §4 Q4, ordered so armed rows surface
first. It returned nothing against prod, consistent with the GAP 1 query — no rename has yet
been performed on a country with schools or submissions, which is why all of this is preventive.

First flagged 2026-09-09.

## SCORING PROVENANCE IN THE GDPR EXPORT — DECISION REVERSED 2026-09-09

**The export no longer includes `recommendations.scoring_provenance`** (server/routes/user.routes.ts,
`GET /api/users/me/export`). This REVERSES an approved decision from the day before. Both positions
are recorded because the first one is reasonable and will otherwise be re-derived by the next person
who reads the export code and notices the gap.

**Position 1 — 2026-09-08, approved: include it.** Provenance is the record of how a score about a
MINOR was computed. A student's file should say which algorithm and which weighting produced the
career recommendations they were given, because that is part of how a decision about them was
reached, and a subject-access right that returns the conclusion but not the basis is a thin one.

**Position 2 — 2026-09-09, adopted: strip it.** Two things decided it:

1. **It is not personal data.** `{algorithm, configHash, tier, scoredAt}` describes the ALGORITHM
   that ran, not the person it ran on. It is identical for every student scored in the same tier in
   the same window — it carries no information about the individual. Everything the row holds ABOUT
   the student (every component score, the reasoning, the action steps, the tier, the date) is still
   exported in full, so nothing the right actually covers was withheld.
2. **`configHash` is a reversible encoding of the tier weight table**, not a digest — see
   generateConfigVersion in server/services/matching.ts. Exporting it hands out internal scoring
   configuration to anyone who base64-decodes it, which is a cost with no corresponding benefit to
   the student.

**What Position 1 was right about, and where it now lives.** The underlying need is real: an operator
must be able to say which regime produced a given report when a school asks. That belongs on the
OPERATOR surface, which keeps provenance deliberately —
`GET /api/superadmin/students/:userId/assessments` returns rows verbatim. See
docs/scoring-provenance-recon.md for the rest of that surface.

**If this is ever reversed again**, reverse it by adding a RESOLVED view to the export ("scored on
2026-09-08 under algorithm 3") rather than the raw column — that serves Position 1's actual purpose
without shipping the weight table.

**AMENDMENT 2026-09-09 — half of reason 2 has an expiry date, and the decision still holds.**
Recorded here rather than left to be rediscovered, because the obvious reading of the widening plan
below is that it reopens this, and it does not.

Reason 2 above is really two claims, and only one of them is durable:

- *"configHash is a reversible encoding"* — TRUE TODAY, AND DELIBERATELY TEMPORARY. It is base64,
  so anyone who decodes it reads the weight table back out. The fix planned in "configHash
  WIDENING" replaces it with a sha256 digest, which is one-way. **When that lands, this half of the
  argument is gone** — a digest leaks nothing, so "it hands out internal scoring configuration"
  stops being true and can no longer be cited here.
- *Reason 1, that it is not personal data* — UNAFFECTED, AND LOAD-BEARING ON ITS OWN.
  `{algorithm, configHash, tier, scoredAt}` describes the ALGORITHM that ran, not the person it ran
  on; it is identical for every student scored in the same tier in the same window. Everything the
  row holds ABOUT the student is still exported in full. That reasoning does not depend on the
  encoding at all.

So: **do not reopen this when the hash is fixed.** Reason 1 decides it by itself, and reason 2 was
always the lesser of the two — it explains why exporting the field would additionally COST
something, not why the field falls outside the right. The practical effect of the fix is only that
a future argument for inclusion can no longer be met with "and it leaks the weight table"; it still
has to get past "it is not the student's personal data", which it does not.

The reversal instruction above is likewise unchanged: if it is ever reversed, reverse it with a
RESOLVED view, not the raw column — that stays right whether the hash is reversible or not.

First flagged 2026-09-09.

## configHash IS NEARLY BLIND — the automatic half of provenance does not work

**Discovered 2026-09-09 while building the provenance comparison. Not fixed; fixing it needs a
decision about stored rows.**

`shared/schema.ts` documents `configHash` as the half of provenance that "can never be forgotten"
because it is computed automatically from component keys and weights, in contrast to
`SCORING_ALGORITHM_VERSION`, which is hand-bumped. On the real tier configurations it detects almost
nothing.

`generateConfigVersion` (server/services/matching.ts) base64-encodes the sorted `key:weight` join and
slices to 16 characters. Base64 is 4 characters per 3 bytes, so 16 characters is exactly the **first
12 bytes** of the string — about one component:

| tier | what the hash actually encodes |
|---|---|
| basic | `interests:35` — subjects and vision are past the cut |
| premium | `cvq:25\|riase` — it does not even reach riasec's weight |

Measured consequences, each pinned in server/services/scoringRegime.test.ts:

- basic `subjects` 35→99 **and** `vision` 30→1 — two weight edits — leave the hash byte-identical.
- Dropping `vision` from basic entirely leaves the hash byte-identical.
- premium `subjects` 20→5 and `vision` 20→70 leave the hash byte-identical.

So an admin weight edit — the exact event this half of provenance exists to catch without anyone
remembering to do anything — mostly does not move it. The situation is the one migration 018 was
written about (a scoring change that nothing recorded), reproduced inside the mechanism meant to
prevent it.

**WHY IT IS NOT ALREADY FIXED.** Widening the slice or using a real digest changes what every STORED
provenance row means. Those hashes were written under the truncating scheme, so after a fix they
would all differ from the current hash and every stored report would read as "config drifted" when
nothing about it changed — the precise false positive that makes an operator stop trusting the
signal. A fix must therefore also decide what happens to existing rows. Two candidates:

1. **Version the scheme** — record `{hashVersion, configHash}` and compare only within a version;
   rows written under v1 compare on v1 rules, or are reported as "config vintage unknown" rather
   than as drifted.
2. **Treat pre-fix hashes as an unknown config** — honest, and consistent with how migration 018
   already treats NULL provenance, but it discards the (weak) signal the existing hashes carry.

Either way it is its own commit, with the schema comment's "can never be forgotten" claim corrected
in the same change. Until then, `algorithm` is the only half of provenance that reliably moves, and
any UI built on the comparison should say so rather than implying the config half is authoritative.

**RESOLVED INTO A PLAN — see "configHash WIDENING" at the end of this file.** Candidate 1 is the
answer; the deciding fact, missing from the list above, is that the v1 scheme remains COMPUTABLE,
so old rows are compared under v1 and new rows under v2 and nothing is ever compared across
schemes. The UI caveat this paragraph asks for now exists: the estate card labels the matching
bucket "no drift detected" rather than "reproducible" and states the under-count in a line.

First flagged 2026-09-09.

## configHash WIDENING — the plan, and why it is not blocked on difficulty

**Written 2026-09-09, after the estate card shipped (commit 1285997). Not implemented. This is the
decision record for the commit that fixes it, so that commit does not have to re-derive any of it.**

Supersedes the "two candidates" list at the end of the previous entry: candidate 1 is the answer,
and the reason is a fact that list did not state.

### What the change actually is

`generateConfigVersion` (server/services/matching.ts) ends:

    return Buffer.from(configString).toString('base64').slice(0, 16);

Replace with a real digest:

    createHash('sha256').update(configString).digest('hex').slice(0, 16)

Node crypto, no dependency, two lines. **Truncating a digest is safe; truncating an encoding is
not** — that distinction is the whole defect. A digest diffuses, so every input byte affects every
output byte and a 16-char prefix still moves when any component's weight changes. Base64 does not
diffuse, so 16 chars is literally the first 12 bytes of the input and everything after it is
invisible. 16 hex chars (64 bits) is far more than drift detection needs; this is not an
adversarial setting, only a handful of configs ever exist.

THE INPUT STRING DOES NOT NEED WIDENING. `key:weight` over resolveActiveComponents' output already
captures every config-level input: `isActive` and premium gating show up as ABSENT components, and
the `>= 95` fallback shows up as DIFFERENT weights. Only the hashing is broken. One nit worth
folding in while there: `weight` is `real` (float4, shared/schema.ts:1019 and :1486), so a
fractional weight can stringify as `33.29999923706055`. It is deterministic, so not a correctness
bug today, but rounding to fixed precision in the digest input costs nothing and removes the trap.

### Existing values CAN coexist, and the reason is specific

The blocker was always "what happens to stored rows", and it dissolves on one observation: **v1 is
still computable.** It is a pure function of the same component set, and that function is already
exported. So there is never any need to compare a row across schemes.

Record `{hashVersion, configHash}` in scoring_provenance going forward, and compare each row under
its OWN scheme:

- row with `hashVersion: 2` → compare against the v2 current hash. Trustworthy.
- row with no `hashVersion` (every row stored today, implicitly v1) → compare against the v1
  current hash, recomputed with the retained v1 function. Keeps exactly the weak, one-directional
  signal it always had — no better, but no false positives either.

That is real coexistence rather than nominal, which is why it beats candidate 2 ("treat pre-fix
hashes as unknown"). Candidate 2 is honest but throws away signal that is still computable and
moves a large block of rows into a bucket reading "we don't know" when we partly do. Its only
argument is wanting to delete the v1 function, which is not worth the fidelity.

A third option — RECOMPUTING STORED HASHES — must be rejected on migration 018's own argument. You
cannot recompute what a row WAS scored under, only what it WOULD BE scored under now. That is a
guessed value wearing the costume of provenance, and it is the exact thing 018 refuses for NULL.

### The SQL change is small

storage.getScoringEstateCounts already takes the current regime as an injected VALUES list. Add
`hash_version` to the CTE and to the join condition, `COALESCE`-ing the row's missing key to 1, and
the three-row list becomes six (three tiers × two schemes). Nothing else about the query moves —
the LEFT JOIN, the count(DISTINCT), the jsonb algorithm comparison and the branch order all stand.

### NO ALGORITHM BUMP — and bumping would be actively wrong

SCORING_ALGORITHM_VERSION's rule is mechanical: bump when the golden fixtures move.
`generateConfigVersion`'s output is produced, stored and stripped — `appliedConfigVersion` is never
read back into any calculation (verified: matching.ts:823/829/832 write it,
utils/recommendationView.ts strips it, nothing consumes it). Changing the hash function moves no
score and no fixture, so scoringProvenance.test.ts will not fail and the rule does not fire.

Worse, a bump would put EVERY stored row into `algorithmDrifted` — the more serious bucket, the one
that means the calculator itself changed and that needs the version history at matching.ts:855-865
to explain. That is a bigger and more alarming false positive than the under-count being fixed.
`hashVersion` is the correct versioning axis, and the fact that it is a DIFFERENT axis from the
algorithm integer is exactly why it belongs in its own field rather than reusing that one.

### Correct in the same commit

`shared/schema.ts` documents `configHash` as the half of provenance that **"can never be
forgotten"** because it is computed automatically. That claim is false today and only becomes true
with this fix, so it must be corrected in the same change rather than left to read as though the
mechanism works. Same for the note in generateConfigVersion's own docblock describing the
truncation as current behaviour, and the fourth describe block in
server/services/scoringRegime.test.ts, which PINS the truncation deliberately — those assertions
state today's behaviour, not desired behaviour, and the fix is expected to rewrite them rather than
work around them.

### Why this will stop being tolerable

The estate card (superadmin scoring tab) currently labels the matching bucket **"no drift
detected"** rather than "reproducible", and prints a line saying the config comparison can only
under-count. That is a stopgap that makes the card honest, not a fix: it stops the card CLAIMING
reproducibility, but it cannot confirm it either.

The concrete failure is an operator answering a school. A school asks whether a student's report
was computed the same way as another, the operator reads "no drift detected" and says yes, and a
weight edit the truncation cannot see makes that wrong — a falsely reassuring answer about a
minor's record. Today the honest answer is "I cannot fully tell", which survives being said once.

Related: see the note appended to the GDPR-export entry above — fixing the encoding also removes
the reversibility half of that decision's reasoning, without reopening it.

First flagged 2026-09-09.

### A match key loose enough to hit more than one row writes to whichever it hits last  (severity: HIGH — defect class, fixed twice in d279c3c)

`quiz_questions` has no stable external ID, so both Arabic-content migrations matched on question
text alone: `.where(eq(quizQuestions.question, item.question))`. Question text is not unique. When
one key selects N rows, the loop writes to all N, and the last entry processed wins — silently, with
no error, no mismatch, and no count that looks wrong. `alignArabicOptions` had the same defect one
layer down: `new Map(bank.map(q => [q.question, q.options]))` let the later subject overwrite the
earlier, so the source map answered lookups for a question it did not describe.

**It produced two different failures in the same file, from the same cause.**

**1. One corrupted row (found first, and the loud half).** "Which sentence is grammatically correct?"
is two Grade 8 questions: English (subject-pronoun agreement, English options) and Arabic (word
order, Arabic options). Both content entries updated both rows. The Arabic row survived by ordering
luck — its own entry ran last. The English row ended up carrying the Arabic question's `options_ar`,
`question_ar` and `explanation_ar` above its own English options, still scored against
`correct_answer = "She and I went to the market."` An Arabic-reading student was shown a question
about Arabic word order, four Arabic sentences, and an explanation for a different question: there
was no path from what they could read to a correct answer. Unanswerable, not merely mislabelled.
Repaired by `021_repair_shared_stem_arabic_desync.sql`.

**2. One silently lost translation (found second, and the more instructive half).** The Grade 9–12
content file carried TWO entries for "Which sentence correctly uses a compound sentence structure?"
— one under Grade 9, one under Grade 10 — though the bank only has that question at English/Grade 9.
Both were valid, competently written translations. Text-only matching pointed both at the same row,
so the Grade 10 entry overwrote the Grade 9 one on every seed. Nothing was corrupted; a human's work
was simply discarded, forever, with no trace.

**Why the second one matters more.** The corrupted row was eventually visible — a reader could open
it and see Arabic sentences under English options. The lost translation was invisible by
construction: the surviving row looked entirely correct, because it WAS entirely correct, just not
the version that was supposed to be there. Nothing in the DB, the logs, or the counts could
distinguish "60 rows updated" from "60 rows updated, one of them twice." It surfaced only as a
side effect of making the key precise — the new `(question, subject, grade)` key resolved the Grade
10 entry to zero rows, which finally made the duplicate say something out loud. **A loose key does
not just corrupt; it deletes, and the deletion is the quieter and less recoverable of the two.**

Both had been live for months before anyone looked.

**The general shape, for anything matching content to rows by a natural key:**
- A match key that can select more than one row is a write-ordering bug waiting for a collision, not
  merely an imprecise query. `.limit(1)` is worse than no limit, not better: it converts an
  ambiguity into a silent arbitrary choice (this is what the Grade 9–12 apply function did).
- The failure is invisible on the winning row. Only the losing row shows damage, and if both writes
  are individually valid there is no damaged row at all.
- Precision in the WHERE clause is the control. A downstream guard is not: gating the writes on
  `aligned !== null` would have masked case 1 by coincidence — the wrong row also happened to fail
  alignment — while still writing wrong content to any wrong row whose options DID align, and would
  not have touched case 2 at all.
- Ambiguity must be an outcome the code can report. Both apply functions now write NOTHING when a key
  matches more than one row, and `alignArabicOptions` marks an ambiguous key `AMBIGUOUS` so it always
  fails to align rather than resolving to whichever entry was flattened last.
- Assert uniqueness in a test, not in review. `quizStoredOptions.test.ts` now checks that every one
  of the 240 content entries resolves to exactly one bank question. That test is what would have
  caught both of these on the day they were written, and it is the part worth copying to any other
  content-to-row migration.

Verified on prod 2026-09-10: the `(question, subject, grade)` sweep returns 0 collisions, so nothing
reaches the new fail-closed branch and no row loses its Arabic content to it.

**Still unaudited:** the other content migrations listed in `contentCoverage.ts` (careers, WEF
skills, country sector categories, LLM narrative cache) match rows by their own natural keys. None
has been checked for this. `source_type` on prod is currently 100% `system`, but LLM-generated and
school-contributed questions bypass the bank entirely, so a future collision there would not be
caught by the bank-uniqueness test above.

First flagged 2026-09-10.

### LIMIT and OFFSET with no ORDER BY — paging that can repeat and skip rows — FIXED 2026-09-10 (fbc1475)  (was: LOW)
Found by the sweep that closed the tie-break entry below, and filed rather than fixed because
nothing first-party exercises it yet.

`getQuizQuestionsByFilters` (storage.ts:1352) and `getQuizQuestions` (storage.ts:1398) both apply
`.limit()` and `.offset()` to a `SELECT` with **no `ORDER BY`**. That is a strictly worse shape
than the tie-break defect below. A tie-break decides the order of rows you were going to get
either way; `LIMIT` without `ORDER BY` decides WHICH ROWS YOU GET AT ALL, and `OFFSET` paging over
an undefined order can return the same row on two pages and never return another — silently, with
no error and no way to notice from the response.

`GET /api/admin/questions` (admin.routes.ts:118-131) reads `limit` and `offset` straight from the
query string and passes them through. So the endpoint advertises paging it cannot perform
correctly.

NOT LIVE, and that is the only reason this is LOW. No first-party caller pages: the admin UI
(Admin.tsx:70-82) sets `countryId`, `curriculum`, `subject` and `grade` and never `limit` or
`offset`, so it fetches the whole filtered set in one request. The defect is waiting for the first
person who adds pagination to a growing question bank — which is exactly when it stops being
noticeable, because a reviewer paging through a few hundred questions has no way to tell a
repeated row from one they saw a page ago.

THE REVIEW HAZARD IS LIVE, THOUGH, AND IS THE HALF WORTH ACTING ON SOONER. With no `ORDER BY` at
all, the admin question list renders in whatever order Postgres returns — which moves when a
question is edited, since an UPDATE appends a new tuple version to the end of the heap. So the
list reshuffles as it is worked on: an admin reviewing a subject's questions cannot rely on
position, cannot tell whether they have seen a row, and the question they just edited jumps
somewhere else. For a question bank that is reviewed by hand, an arbitrary order is not a
cosmetic complaint.

FIX SHAPE (described, not applied): give both queries a deterministic `ORDER BY` before anyone
pages them — subject, then grade, then id is the ordering a reviewer would want, and id alone is
enough to make paging correct. `careers_onet_code_idx` is the precedent for adding an index if
the ordering needs one. Doing this also fixes the review hazard, which is why it is one change
rather than two.

First flagged 2026-09-10.

FIXED 2026-09-10 in fbc1475: `ORDER BY subject, grade, topic, id` on both queries. `topic` was
added to the shape proposed above because it puts near-duplicate questions adjacent, which is
what a hand reviewer needs to see; `id` last is what makes the order total.

`id` IS THE RIGHT FINAL KEY HERE AND WAS THE WRONG ONE FOR careers, and the two entries should
not be read as inconsistent. The career sort had to reproduce ACROSS databases — the same
catalogue is seeded into staging and prod — so a per-database `gen_random_uuid()` was
disqualifying and it fell back to `title`. These rows live in exactly one database and nobody
compares this list between environments; the requirement is that the order hold still WITHIN one,
under edit. A uuid primary key is unique by CONSTRUCTION rather than by data, which is precisely
the guarantee `careers.title` cannot give (see the entry below), and it is immutable under UPDATE
so an edited question does not move. The uniqueness caveat therefore does NOT carry over.

NO INDEX ADDED, and the number that decides it: 240 rows. A sort node over 240 rows is free, and
`quiz_questions_country_grade_idx` already serves the filter. What would change the answer is a
bank in the tens of thousands, at which point the index to add is `(subject, grade, topic, id)`
matching the sort, not one per filter column.

VERIFIED against the live table rather than reasoned about: zero duplicate sort keys across all
240 rows, so the order is total; three `(subject, grade, topic)` groups actually needed `id` to
break; and concatenating LIMIT/OFFSET pages reproduced the full ordered list exactly — 240 unique
ids, no repeats and no skips.

THE STUDENT PATH IS UNAFFECTED, checked rather than assumed, because this query also feeds the
quiz pool. quiz.routes.ts draws through `shuffleQuestions`, a proper Fisher-Yates over
`Math.random` (server/utils/quiz.ts:7). A uniform shuffle makes every permutation equally likely
regardless of input order, so ordering the pool changes nothing about which questions a student
receives. The unseeded draw itself is a separate entry and is untouched.


### Natural keys that are unique in practice and not by constraint — the sweep, and what is left  (severity: LOW — two open instances)
Written up after the third instance turned up, because the shape keeps recurring and each time it
has been found by accident rather than looked for. A column that everything treats as an identity,
that no constraint enforces, and whose failure mode is a silent wrong-row write rather than an
error.

All 38 tables in shared/schema.ts were checked: every column whose name suggests a natural key,
against the table's actual constraints, against whether code looks rows up by it.

ALREADY ENFORCED, and listed so the sweep does not get re-run: `users.email` and `.username`,
`countries.code`, `subjects (country_id, curriculum, code)`, `wef_skills.name` (inline `.unique()`
— which is what makes the two by-name lookups at storage.ts:2046 and :2080 sound),
`assessment_components.key`, `scoring_tiers.key`, `llm_prompt_templates.key`,
`api_credentials.provider`, `files.share_token`, `career_wef_skill_affinities (career_id,
wef_skill_id)`, `career_component_affinities (career_id, component_id)` (migration 010),
`assessment_quizzes.assessment_id` (migration 019), and now `careers.title` (migration 023).

LEGITIMATELY NON-UNIQUE, so not candidates: `assessments.name`, `organization_members
.student_name`, `organizations.name`, `organization_consents.organization_name` /
`performed_by_name` / `performed_by_email` (denormalised BY DESIGN so the row outlives the org —
see the retention decision), `system_announcements.title`, `wef_skills.name_ar`,
`careers.title_ar`.

TWO OPEN:

**1. `careers.title` near-duplicates — the half migration 023 does not close.** A `UNIQUE`
constraint is EXACT-match. `"Data Scientist"`, `"Data scientist"` and `"Data Scientist "` are three
distinct values; Postgres accepts all three side by side. The four migrations that match on title
(`career-arabic-content:559`, `career-related-subjects:61`, `career-values-profiles:436`,
`career-growth-bands:505`) use exact `=`, so they would match ONE of the three and silently skip
the others — the same failure the constraint was added to prevent, reached by a different route.
Say it plainly: **023 closes the exact hole and leaves this one open.**

Verified zero near-duplicates in production before 023 landed, so this is latent rather than
live. Closing it means a unique index on `lower(btrim(title))`, and that is a real decision rather
than a bigger version of the same one: it would REJECT two careers whose titles differ only in
case or spacing, and nobody has established that the catalogue never legitimately wants that. It
also would not help the migrations, which would still need their own `=` normalized to match. The
honest fix is probably normalizing titles at the write boundary rather than a second index.

**2. `quiz_questions (question, subject, grade)` — narrowed, never constrained.** The Arabic
content migrations match on this triple, and it is unique in practice and enforced by nothing.

The history matters, because this one has already caused a live student-facing failure. The
migration originally matched on question text ALONE, and question text genuinely collides:
`"Which sentence is grammatically correct?"` exists twice in the bank — once under English
(subject-pronoun agreement) and once under Arabic (word order). Both content entries updated both
rows, and the English row ended up carrying the Arabic question's stem, its four Arabic options
and its explanation, above its own English options and scored against the English correct answer.
An Arabic-reading student got an unanswerable question. Repaired by
`021_repair_shared_stem_arabic_desync.sql`; the match key was narrowed to the triple in the same
commit.

**So the fix was match-key precision, not a constraint, and the correctness still rests on data.**
Nothing stops a second row with the same `(question, subject, grade)` from being created today,
and if one appeared the migrations would resume writing to whichever row the planner returned
first — `LIMIT 1` with no `ORDER BY`.

THE SAME PREREQUISITE APPLIES BEFORE ANY CONSTRAINT IS PROPOSED HERE, and it is the lesson from
the careers work: **what does the import path do on a 23505?** The question bank is written by
`POST /api/admin/questions`, the CSV/bulk import, and the school-contribution approval flow — three
writers, versus careers' two. Each needs to answer a duplicate with something an admin can act on
before a constraint starts raising them; a bulk import that dies on row 400 of 500 with an opaque
500 is worse than the duplicate it prevents. That work is larger than the careers equivalent and
has not been scoped.

Also unresolved and smaller: `careers.onet_code` is unique across all 68 and non-null on every
row, is documented as the identity for growth bands, and has no constraint. Nothing does
`eq(careers.onetCode, …)` today so it is latent, and a partial unique index is not even needed
since Postgres treats NULLs as distinct. It is blocked on one product question rather than any
engineering: may two careers legitimately share an O*NET occupation?

First flagged 2026-09-10.


### careers.title is unique in practice and not by constraint — FIXED 2026-09-10 (4ceafcd, 08e9a30)  (was: LOW)
The tie-break fixed below orders tied careers by `careers.title`, and that key is only a TOTAL
order because the catalogue happens to contain no duplicate titles. Verified against the seed:
all 68 careers have distinct titles, and distinct non-blank `onetCode`s. Neither is enforced.

`title` is `text().notNull()` with no unique constraint (shared/schema.ts:548), and
`POST /api/superadmin/careers` (superadmin.routes.ts:1977) requires it to be non-empty and checks
nothing else. So a superadmin can create a second "Data Scientist" today, and the moment they do,
the tie-break has no second key and those two careers fall back to input order — which is
`getAllCareers()`, which is heap order. The defect the tie-break closed would be reopened for
exactly that pair, silently.

WHY IT IS LOW AND NOT MEDIUM: the residual non-determinism is invisible. Two careers with the same
title are indistinguishable in a report that shows the title, so a student could not perceive the
swap even though it happened. And a duplicate title is a catalogue defect in its own right that
someone would notice for other reasons.

WHY IT IS WORTH CLOSING ANYWAY: a correctness property resting on "the data currently happens to
be like this" is one insert away from being false, and nothing would announce it. A UNIQUE
constraint turns the tie-break's total order into a guarantee of the schema rather than an
accident of the seed.

ITS OWN SMALL PIECE OF WORK, and not a one-line migration:
  - Check production for existing duplicates first. The seed is clean; the live catalogue may have
    acquired a duplicate through the superadmin create path, and `ADD CONSTRAINT` fails loudly on
    an existing violation. That failure is the good outcome — but it should be discovered
    deliberately rather than during a deploy.
  - Decide the scope. `UNIQUE (title)` is the simple form. If careers are ever to be per-country —
    `countryId` already exists on the table — the right constraint is `UNIQUE (country_id, title)`,
    and getting that wrong means dropping and re-adding it later.
  - The create endpoint should return a 409 naming the collision rather than surfacing a Postgres
    constraint error, or a superadmin gets a raw driver message.
  - `onetCode` deserves the same treatment where non-null (`UNIQUE` allows multiple NULLs in
    Postgres, so a partial unique index is not even required), but that is a separate decision
    about whether two careers may legitimately share an O*NET occupation.

First flagged 2026-09-10.

FIXED 2026-09-10, in the order the second required:

  4ceafcd  the 409 FIRST, before the constraint could raise anything. Both endpoints — a rename
           onto an existing title violates the constraint exactly as a create does, and it is the
           easier one to miss because the collision is with a career the admin is not looking at.
           Without it a duplicate title reached the superadmin as `500 Failed to create career`:
           no title named, no career named, and no way to converge. The decision is pure and
           tested; no client change was needed, since SuperadminDashboard already renders
           serverErrorMessage on both mutations.
  08e9a30  `careers_title_unique_idx`, migration 023. Production verified at 0 duplicates on
           both the exact and the near-duplicate query before it landed. No de-duplication step,
           following 019 rather than 010: collapsing duplicate careers means deleting a row that
           `recommendations.career_id` references, so a student's stored report would lose the
           career it named.

The scope question above resolved to `UNIQUE (title)` rather than `(country_id, title)`. Careers
are not per-country today — `countryId` exists on the table and is null for all 68 — and a
constraint scoped to a column nothing populates would be a unique index on `(NULL, title)`, which
Postgres treats as always-distinct and which therefore enforces nothing at all. If careers ever
become per-country the index has to be rebuilt then, with real data to reason about.

`onetCode` is NOT done and stays open — see the sweep entry below.


### An exact score tie is resolved by Postgres heap order, so the same student can get different reports  (severity: MEDIUM — non-determinism in a graded output)

`generateRecommendations` picks the report's careers with `sort` then `slice`
(`server/services/matching.ts:241-245`):

```js
return gated
  .filter(match => match.overallScore >= 40)
  .sort((a, b) => b.overallScore - a.overallScore)
  .slice(0, limit); // 2 free / 5 premium
```

The comparator returns `0` for equal scores. `Array.prototype.sort` is stable (ES2019), so tied
careers keep their **input** order — and the input is `storage.getAllCareers()`
(`server/storage.ts:1032-1034`):

```js
async getAllCareers(): Promise<Career[]> {
  return await db.select().from(careers);
}
```

**No `ORDER BY`.** A SQL result set without one has no defined order. In practice it is heap order,
which changes when a row is UPDATEd (the new tuple version is appended to the end of the heap),
after `VACUUM FULL` or `CLUSTER`, after a dump/restore, and whenever the planner switches between a
sequential, index-only or parallel scan. None of those events has anything to do with careers
matching.

**So the tie-break is real and it is arbitrary.** On a free report — two matches — a three-way tie
at the top means one of three careers is silently dropped, chosen by storage layout. Two students
who answered identically can receive different reports. The same student regenerating after an
unrelated edit to a career row can receive a different report. Neither is detectable afterwards:
`recommendations` stores the two careers that won and nothing about the ordering that produced
them, and `scoring_provenance` records the algorithm, config hash, tier and date — none of which
distinguishes the two outcomes. Both runs are "correct" by every check the system has.

**Exact ties are not rare.** Two mechanisms manufacture them:

1. **Vision saturation** (tracked separately, being fixed): 27 of 68 careers land on relevance 100,
   collapsing into blocks of 5, 5, 4, 3, 3, 2, 2 that share a byte-identical vision score.
2. **Rounding before the sort.** `matching.ts:827` stores `Math.round(overallScore * 10) / 10`, so
   two careers 0.04 apart become exactly equal *and then* fall through to heap order. Measured over
   4,000 simulated free reports, about 30% of the exact ties came from this alone — and after the
   vision fix it is the source of **all** of them (residual exact-tie rate 1.6%, essentially all
   rounding).

So the vision fix reduces the frequency; it does not remove the mechanism. This is independent of
that work and outlives it.

**The read-back path is already deterministic and is not the problem.**
`getRecommendationsByAssessment` orders by `desc(overallMatchScore), careerId`
(`server/storage.ts:1180`). That orders the two rows that were already chosen and persisted; it has
no say in which two survived the slice.

**The fix is small and is not the diversity question.** Any total order will do, as long as it is
derived from the data rather than from storage layout — a secondary comparator on `careerId` or
`title` in the sort, or an `orderBy` on `getAllCareers()`. Deterministic-but-arbitrary is strictly
better than arbitrary: it makes the output reproducible, testable, and honest about the fact that
the scorer had no preference. It does NOT make the tie meaningful, and it must not be mistaken for
a diversity rule — a diversity rule is a product decision about which careers to show; this is a
correctness property about giving the same answer twice.

**Worth deciding alongside it:** whether the report should say anything when the careers it shows
were separated by less than the scorer can meaningfully resolve. A 71 and a 71 presented as a
ranked list asserts an ordering the model does not have.

First flagged 2026-09-10.

FIXED 2026-09-10 in two commits, deliberately separable.

  adb1c9c  the tie-break. `compareMatches` — score descending, then TITLE ascending, compared
           BYTEWISE (`localeCompare` uses the runtime's default locale and ICU collation, which
           would reintroduce the cross-environment instability the key exists to remove). In the
           comparator rather than an ORDER BY on getAllCareers(), because matching.gate.test.ts
           drives this through a fake storage returning a plain array — a query-level ordering
           would be untested forever while five other callers paid for a guarantee only this one
           needs. Title and not `career.id`, which is a per-database uuid that would tie
           differently on staging and prod; not `onetCode`, which is stable and unique across all
           68 careers but nullable at the column. The two SQL orderings with the same defect were
           fixed alongside: storage.ts:3984 and :4195 both ordered by score alone and then
           LIMITed, so heap order decided a student's Career Journey trajectory and the "top
           career" a school sees.

  194a22f  the cause of most of the ties. The sort read the 1-dp-rounded score, so two careers
           0.04 apart arrived at the tie-break as equals and were resolved alphabetically —
           discarding a real preference and substituting one the scorer never expressed. It now
           orders on `overallScoreRaw`, carried for ordering only and neither displayed nor
           persisted.

MEASURED before committing the second, 4000 simulated assessments against the real catalogue and
the real pipeline, the same seeded trials run through both comparators and diffed:

| tier | report changed | different career | reordered only | top match moved |
|---|---|---|---|---|
| free (2000) | 2.40% | 1.00% | 1.40% | 1.40% |
| premium (2000) | 13.40% | 2.00% | 11.40% | 1.00% |

Free lands near the 1.6% prior from the vision work, which was measured on free reports. Premium
does not, for a structural reason rather than an alarming one: five slots means four adjacent
pairs instead of one, and premium scores over five components rather than three, so near-ties are
much more common. Nearly all of it is resequencing within the same five careers. The simulation
samples subjects and interests uniformly and real students do not, so the rates describe the
mechanism rather than forecasting production.

NO VERSION BUMP for either, per the rule at matching.ts:822 — ordering is on its DO NOT list, no
score moved, and no golden fixture moved. Bumping would assert that scores changed and make every
existing row read as stale against a new algorithm number, which is the false-staleness failure
the provenance comment warns about.

DECIDED 2026-09-10, NO DISPLAY CHANGE — the "worth deciding alongside it" question above is
closed, not deferred. Recorded with the reason so it is not reopened later as a display defect by
someone who notices two 72.1s in a ranked list.

**Two careers printing the same score in an order the printed numbers do not explain is
acceptable.** The list is ranked, the ranking is now correct on the raw score, and the printed
value answers the student's question — "how good a match is this" — rather than documenting how
the sort resolved. A report is not an audit trail of its own ordering.

ADDING A DECIMAL IS THE FIX TO REFUSE, and it is the one that will be proposed. Printing 72.14
and 72.06 would make the two lines explain themselves, and it would do so by asserting a
precision the instrument does not have: the components feeding that number are seeded affinities,
a normalized subject overlap and a keyword-match count, none of which supports a second decimal
place. The report would look more exact and be no more true. The same argument rules out
exposing the raw score anywhere else in the UI.

WHAT WOULD REOPEN THIS: a change that makes the score meaningful at two decimal places, or a
decision to show students the component breakdown as the primary ranking explanation rather than
the overall number. Neither is on the table. "A user asked why two careers with the same score
are in that order" is not sufficient — the answer to that is the ordering is correct and the
score is rounded, which is a support answer, not a code change.

## DIVERSITY CONSTRAINT ON CAREER MATCHES — DECIDED 2026-09-10, NO CHANGE

**Decision: the matcher gets no diversity rule. `generateRecommendations` stays
`filter >= 40 -> sort -> slice(0, N)` (`server/services/matching.ts:241-245`).**
Closed, not deferred. Reopen only against the numbers below.

Raised by a free report that returned Physicist and Space Scientist
(Astrophysicist) at 71% each — identical Subject 64 / Interest 53 / Vision 99,
byte-identical reasoning, next steps differing only in the degree name. A free
report shows exactly two matches, so the student effectively got one
recommendation printed twice. Diagnosis in `docs/duplicate-career-matches-recon.md`.

### The decision, and the reason

Two matches from the same sector is a CORRECT answer when the student's subjects,
interests and country priorities all point at that sector. Forcing the second
match to differ would manufacture variety at the cost of accuracy: it would push
a genuinely better-fitting career out in favour of a worse one, on a report that
only shows two. There is no version of that trade that is good for the student.

The tie half of the complaint was a real defect and WAS fixed, separately and on
its own terms — see 85da778, vision saturation. The clustering half is not a
defect.

### The measured position, so anyone reopening starts from numbers

Simulated free reports, 20,000 trials, scoring the real 68-career catalogue
against the real seed data:

|                                          | before 85da778 | after 85da778 |
|------------------------------------------|----------------|---------------|
| both matches from the same **sector**    | 41.2%          | 40.9%         |
| both matches from the same **category**  | 47.8%          | 46.6%         |
| exact score tie between the two          | 5.6%           | **1.6%**      |

**85da778 did not move the clustering.** The before/after differences above are
inside sampling noise (+/-0.7pp at 20,000 trials; an independent 4,000-trial run
gave 41.8% / 41.8% and 47.0% / 48.6%). What it did move is the tie rate, and the
1.6% that remains is almost entirely the one-decimal rounding at
`matching.ts:827` rather than anything in the vision component — filed above as
its own entry.

Premium is the same shape, measured at 4,000 trials: >= 2 of 5 matches from one
sector in ~90% of reports, >= 3 of 5 in ~41%. Five matches from one cluster is
less obviously wrong to a reader than two, which makes it the less-reported form
of the same arithmetic, not a milder one.

**Method caveat, stated because it bounds what these numbers prove:** student
profiles are drawn uniformly at random, which is not how real students
distribute. They establish that the mechanism fires routinely. They are not a
forecast of the production rate, and nobody should quote them as one.

### Where the clustering actually comes from

Not from the ranking. From two scorers that cannot distinguish the careers:

1. **Subject scores are identical BY CONSTRUCTION** for careers whose tags
   normalize to the same umbrella subjects. Physicist's
   `[Physics, Mathematics, Computer Science]` and Space Scientist's
   `[Physics, Mathematics, Astronomy, Computer Science]` both project to
   `{Science, Mathematics, Computer Science}` — `Physics -> Science`
   (`server/utils/subjectMap.ts:30`) and `Astronomy` has no umbrella-6 home so it
   is dropped by design. Match set, denominator and reasoning string are then all
   the same. No change to `calculateSubjectsScore` can separate these two: the
   information is gone before the calculator runs.

2. **Interest scores are identical on 14 of the 21 lexicon interests** for the
   same pair.

### What WOULD change the answer

Two real defects, both in scorers, both separate from this decision. Neither is a
diversity question:

- **The interest lexicon's category channel is 60% of interest weight and is
  keyed on `career.category`** (`INTEREST_MATCHING_WEIGHTS.categoryMatch = 0.6`,
  `server/services/interestLexicon.ts:305-312`; applied at
  `matching.ts:1030-1041`). It is binary: any keyword hit awards the full 0.6.
  So two careers sharing a category are two-thirds identical on this component
  before any other signal is read, and only the 0.3 description and 0.1 skill
  channels can tell them apart. That is coarseness in a scorer, not a preference
  about report composition.

- **`findMatchingKeywords` uses `String.includes`** (`interestLexicon.ts:333`),
  the loose-match class already recorded in 786b556. Two kinds of false positive,
  both live on this pair:
  - *substring inside a word* — the "Creative" keyword `art` matches inside
    "beyond **Eart**h" in Space Scientist's description;
  - *right word, wrong sense* — the "Helping" keyword `help` matches "**help**
    plan the missions", which is not what the Helping interest means; `design`
    matches "**design** the experiment" for both "Creative" and "Fashion &
    Style".

  These do not only create spurious agreement, they also create spurious
  DIFFERENCE — several of the seven interests where this pair currently diverges
  diverge only because of a match like these.

**If either is fixed, the clustering numbers move on their own.** Re-measure the
table above and re-take this decision from the new numbers. Do not re-argue it
from the old ones, and do not treat a diversity rule as a substitute for fixing
either.

### What was explicitly NOT decided here

Whether the report should say anything when the two careers it shows are
genuinely near-identical — a 71 and a 71 presented as a ranked list asserts an
ordering the model does not have. That is a presentation question and is open;
it is noted against the tie-break entry above.

Decided 2026-09-10.

## CAREER JOURNEY PREMIUM GATING — DECIDED 2026-09-10, NO GATE

**Decision: the Career Journey (`/progress`) is not put behind premium. It stays free for any
authenticated student.** Closed, not deferred. The gate to reopen is stated below.

Raised as item 3 of `docs/profile-recon.md` ("not a gating question"), and confirmed on
production 2026-09-10 against a real account holding two completed assessments at ONE grade.
After a9b33cc that account renders exactly what the recon predicted: one Grade 11 milestone,
four Pending, and a Career Consistency panel listing two careers at 100% persistence computed
against a denominator of one.

### The decision, and the reason

**Gating a mostly-blank timeline charges for an empty page.** The page has two panels and both
are comparisons ACROSS grades — a persistence score and a grade-by-grade trend. A student with
one grade has nothing to compare, so what a paywall would sell them is four Pending milestones
and an arithmetic artefact. That is worse than not selling it: it takes money for the absence
of data, and the buyer cannot tell the difference until after they have paid.

The order is therefore: make the page worth having, then decide whether it is worth charging
for. Free retakes (261b85f, capped at `FREE_ASSESSMENT_CAP`) are what will eventually put
something behind the gate — but only retakes AT A LATER GRADE. a9b33cc collapses same-grade
retakes to one row per grade, deliberately, so three Grade 11 attempts remain one milestone.
The population that would get value from this page is students who take the assessment in more
than one school year, and today that population is close to empty: org students get one lifetime
allocation, and the free cap is a count, not a per-grade allowance.

### What was done instead, in the same session

Not a gate but an ENTRY CONDITION, which is a different thing — it withholds an empty page
rather than charging for it:

- the profile's "View Career Journey" button now requires more than one DISTINCT canonical
  grade, not more than one completed assessment (the recon proposed `length > 1`, which the
  collapse makes insufficient: three same-grade retakes are one milestone);
- `/progress` reached directly, below that threshold, renders a stated one-grade state instead
  of a trend built from one point.

### What WOULD change the answer

Reopen when, and only when, a material number of students hold assessments at TWO OR MORE
distinct grades — which requires a retake policy that permits (and ideally prompts) a
next-grade re-assessment, not merely a count of allowed attempts. At that point the page is
showing a real trajectory and the question becomes a normal pricing one. Re-take it from the
distribution of distinct grades per student, not from the number of assessments per student:
the two numbers diverge by exactly the thing this page collapses.

### What was explicitly NOT decided here

- Whether a persistence percentage computed from a small denominator should be printed as a
  percentage at all. That is a presentation defect independent of pricing, and it is open —
  100% off one grade is arithmetically true and tells the student nothing, while a career that
  genuinely appeared in every grade a student has taken IS 100% and must survive whatever is
  done.
- `/progress` is still unauthenticated in the router (`client/src/App.tsx`) and the endpoint
  checks only `req.isAuthenticated()`. Unchanged, and noted in the earlier recon.

Decided 2026-09-10.

### Arabic unreviewed — the Career Journey's one-grade state  (severity: low)
8b7fdf6 added two Arabic strings to `ar/profile.json` under `progress`, neither reviewed by an
Arabic speaker. They are what a student sees when they reach `/progress` with one grade
recorded — reachable by bookmark or by typing the URL, since the profile's button no longer
offers it:

- `oneGradeTitle` — `صف واحد مسجّل حتى الآن` ("one grade recorded so far")
- `oneGradeDesc` — `تقارن رحلتك المهنية نتائجك من صف إلى الصف الذي يليه. لديك صف واحد مسجّل، لذا لا يوجد ما يُقارن بعد. أعد إجراء التقييم في صف لاحق وستُظهر هذه الصفحة كيف يتغيّر مسارك.`

`oneGradeDesc` IS THE ONE TO CHECK. It is three sentences of explanation rather than a label,
and two things in it are worth an Arabic speaker's eye: `من صف إلى الصف الذي يليه` ("from one
grade to the grade that follows it") is a literal rendering of an English idiom and may be
wordier than needed; and the closing clause promises a future behaviour
(`وستُظهر هذه الصفحة كيف يتغيّر مسارك`) whose tense should match how the rest of this file
addresses the student. `صف` is the word the file already uses for a school grade
(`progress.grade`, `details.grade8`…), so that term at least is consistent.

Both should also be read against `noProgressDesc` directly above them, which is the
no-assessments state — the two sit next to each other in the file and a student sees one or the
other, never both, so they should not read as if written by different hands.

Recorded 2026-09-10.


### Arabic unreviewed — the school consent notice and the attestation card  (severity: low, with one caveat that is not)
Filed as promised by two commits that shipped without it: c647443 ("Arabic to be filed as
unreviewed") and aec29f7 ("18 strings per locale. Arabic to be filed as unreviewed with the
free-flow entry"). The free-flow entry (:3158) went in without them; this is that entry.

TWO STUDENT-FACING STRINGS — ar/assessment.json:102-103. `consentOrgNotice` /
`consentOrgNoticeGeneric`: "أعدّت {{school}} هذا التقييم لك ووافقت على الشروط نيابةً عنك.
يمكنك الاطّلاع عليها هنا:". The reader is 13-18, which is the bar the English was written to
and the bar this has to clear. `نيابةً عنك` ("on your behalf") is the load-bearing phrase — it
is the part that tells the student they were not asked — so whether it reads as plain or as
legalese to a school-age reader is the thing to check, not the accuracy of the rendering. The
interpolated `{{school}}` is a school name that may itself be in English inside an Arabic
sentence; the standing bidi-scrambling item for mixed LTR/Arabic runs applies to it. Note that
the same commit REMOVED `consentOrg` from this file rather than rewording it, deliberately: it
asserted the student agreed.

EIGHTEEN ADMIN STRINGS — ar/admin.json:369-386. Composed from existing product vocabulary, but
the composition is new and nobody has read it rendered.

  THE CAVEAT, and it is what separates this from every other Arabic-unreviewed entry in this
  file: `consentProcessing` and `consentGuardian` are the two attestation texts, and the card
  posts the EXACT RENDERED WORDING back so `attestationTextHash` pins what the admin actually
  saw (aec29f7). If the Arabic is wrong, the hash faithfully pins wrong Arabic — the record then
  evidences that a named admin agreed to a sentence that does not say what the English says, and
  it evidences it precisely. These are the two strings in the product whose translation carries
  legal weight rather than polish.

  `أُقرّ بأن {{school}} تملك موافقة وليّ الأمر لكل طالب تسجّله` has to read as an ATTESTATION
  the admin is making, not as a statement of fact about the world; the English ("I attest
  that…") is unambiguous and the Arabic must be too. `consentProcessing` names the processing
  party as `مسارات المستقبل` where the English says "Future Pathways" — consistent with the
  rest of ar/, but this is the one sentence where the name identifies a legal party, so it
  should be confirmed against the Arabic legal documents rather than against the UI.

  `consentGuardianHelp` carries the fact that makes the attestation matter — the students are
  13-18 and Future Pathways never contacts parents — and is the sentence an admin is most
  likely to skim. `consentBlocked` is in this set and renders nowhere; see the enrolment-gate
  UI entry above.

Recorded 2026-09-10.


### Arabic unreviewed — three landing feature and step strings  (severity: low)
Filed with the three landing-claim fixes of 2026-09-10 (734c094, 85ef8cd, and the ordinal
commit). Five Arabic strings changed across two blocks; none has been read rendered.

`features.reportsDesc` — `حمّل تقريراً شاملاً بصيغة PDF يتضمن خارطة طريقك المهنية — متاح ضمن
التقييم المدفوع`. The load-bearing clause is the last one: it is what stops the page promising a
free download of a $10 feature, so a translation that softens `المدفوع` ("paid") reopens the
claim this commit closed. Check also that the em-dash construction reads naturally in Arabic
rather than as an English punctuation pattern carried over — a comma or `و` may be the native
form.

`features.matchDesc` — `مطابقات مهنية مرتّبة خصيصاً لك، بناءً على ما تخبرنا به عن نفسك`. Must name
NO input. The whole point of the English rewrite is that no input is true for both tiers, so an
Arabic version that helpfully restores "اهتماماتك" (your interests) — the word the previous
string used and the obvious thing for a translator to reach for — puts back the false claim.
`مطابقات` for "matches" is the term to check: it is used here in a product sense, not the
statistical one.

`howItWorks.subtitle` — `رحلتك نحو المهنة المثالية، على ثلاث مراحل`. `مراحل` (stages) rather than
`خطوات` (steps) is deliberate and mirrors the English: `خطوات` is the word `pricing.json:11` uses
for a literal 7-step count, and reusing it here would recreate the collision the change removes.

`howItWorks.step1Title` / `step2Title` / `step3Title` — unchanged in Arabic, and that is the
point: they never carried the ordinals. They are now NUMBERED for the first time, by the
component, so they should be read with a leading "1." / "2." / "3." in front of them for the
first time. Confirm the numeral does not fight the RTL layout in practice — `<bdi>` plus
`margin-inline-end` is the correct construction, but it has been reasoned about, not seen.

Recorded 2026-09-10.

### Position 4's erasure route was broken for every school student — FIXED 2026-09-11
Correcting a claim this file's companion recon made rather than leaving it standing.
`docs/consent-implementation-recon.md` §(c) listed `DELETE /api/users/me` under "What exists
today" and said it **"Works for an org student."** It did not, and that was wrong when written
rather than made wrong since.

The route's delete sequence omitted `wef_competency_results`, which is `NOT NULL` ->
`assessments` with `NO ACTION` (shared/schema.ts:401). Nothing deleted it, so
`delete(assessments)` raised 23503, the transaction rolled back whole, and the endpoint returned
**500**. The row is written for every premium assessment (recommendations.routes.ts:137 ->
wefOrchestrator.ts:57) and org students are forced premium (auth.routes.ts:53) — so the failure
covered every school student who had completed an assessment. A second, narrower case: the old
loop deleted `cvq_results` by `assessment_id`, but that column is nullable while its `user_id`
is `NOT NULL` (:994-995), so a row written without an assessment survived and blocked the
`users` delete instead.

WHAT THIS CHANGES ABOUT STEP 6. The suggested order's step 6 is "Position 4: expose
export/delete in `Profile.tsx`". The recon framed position 4 as "the route exists; the door does
not" — a UI gap in front of working machinery. That framing was too kind. **The door was missing
AND the route behind it was broken for the students it exists for**, so step 6 as written would
have routed a 13-year-old exercising their erasure right to a 500. The step is now genuinely a
UI step; it was not before. Its export half still under-returns — see "Subject-access export
omits everything the school recorded" above, extended the same day.

The fix enumerates the dependent list mechanically from the FK graph rather than by hand
(docs/erasure-dependent-list.md) and deletes by owner rather than by parent id, so the list is
complete by construction. Org admins and superadmins now get an explicit 409 naming the audit
records that block them — rows where they are the ACTOR in someone else's record, not the
subject — instead of the same 23503-shaped 500 from a different table. Making admin erasure
actually work needs a schema change (`organizations.admin_user_id` and
`organization_events.performed_by` are both NOT NULL with NO ACTION) and is a separate decision.

STILL TRUE AFTER THE FIX, and the response string now says so rather than overclaiming:
erasure does NOT remove `organization_consents.performed_by_name` / `performed_by_email`, which
are NOT NULL and retained deliberately (schema.ts:1553-1558) so an attestation does not dissolve
when its author leaves the school. Empty for students, who never attest; real for an org admin.
The old message — "Account and all associated data have been permanently deleted" — was untrue
for anyone who had attested, and has been replaced by an enumeration of what was actually
deleted.

NOT FIXED HERE, carried to the student-removal work: the licence-seat leak recorded in
docs/consent-implementation-recon.md §(c) point 3. `DELETE /api/users/me` deletes the
`organization_members` row without decrementing the school's quota, which the admin paths do
(admin.routes.ts:1158 `-1`, :1233 `-deletedCount`). Re-verified 2026-09-11 — that recon's
`:1136` has drifted to `:1158`, the claim holds. A student who erases their account still burns
one of the school's seats.

Recorded 2026-09-11.

### `isLocked` was never wired: two dead guards, one unreachable button, one false recon claim  (severity: MEDIUM, one user-facing outage)
`organization_members.is_locked` (shared/schema.ts:188) defaults to false and **nothing in the
repository ever sets it to true**. The only writer is `storage.lockOrganizationMember`
(storage.ts:3030-3036), which has exactly two occurrences in the whole codebase — its interface
declaration at :396 and its own implementation. **Zero callers.** The flag that actually tracks
completion is `hasCompletedAssessment`, written at recommendations.routes.ts:218 and read
correctly by the licence guard at assessment.routes.ts:252. Four things were built on the other
one, and all four are inert:

1. **`DELETE /api/admin/organizations/:id/members/:memberId` guard (admin.routes.ts:1153)** —
   *"Cannot delete member who has completed an assessment."* Never fires.
2. **Bulk-delete guard (admin.routes.ts:1218)** — same sentence, plural. Never fires.
3. **The "Locked" badge (AdminOrganizations.tsx:1019)** — never renders. Delete controls gated on
   `member.isLocked` (:997, :2647) are never disabled, and `selectableMembers` (:366) always
   includes every non-admin member.
4. **USER-FACING OUTAGE: the "Export Reports" button is permanently disabled.**
   AdminOrganizations.tsx:761 sets `disabled={members.filter(m => m.isLocked).length === 0}`.
   That count is always 0, so the button is always disabled. **A school admin cannot export their
   students' reports from this screen — ever, for any school.** Worth checking against a
   complaint log before assuming nobody has noticed; it is the kind of thing an admin reports as
   "the button doesn't work" and nobody reproduces because it looks conditional.

So the net effect is the inverse of what the code appears to say. The server reads as though
completed students are protected from deletion — they are not, every student is removable and
removing one orphans their account and assessments — while the client silently withholds a
feature that has nothing to do with protection.

**NAME THE PATTERN, because this is the second time this session.** Both times a recon document
asserted behaviour by reading the code that expresses a rule, without tracing whether the rule's
input is ever produced:

- `DELETE /api/users/me` was recorded as *"Works for an org student"* by reading the list of
  tables it deletes, without asking whether that list was complete. It omitted
  wef_competency_results and returned 500 for every school student. Fixed ef6d85f.
- The same document recorded *"The admin path refuses to delete a member who has completed an
  assessment"* by reading the guard, without asking whether `isLocked` is ever written. It is
  not. And an argument was then built ON that premise — that self-delete bypassing the check is
  correct for position 4, but that combined with the seat leak "the school silently loses both a
  completed assessment and a seat". The premise is false, so the conclusion needs re-deriving.

**The rule this generalises to.** CLAUDE.md already says it about `replit.md`: *"A claim is an
allegation to confirm, never evidence that the control exists or works."* That discipline was
being applied to the previous builder's document and not to our own. A guard, a branch or a
delete list is a claim about behaviour in exactly the same way — and the confirming step is
cheap and specific: **for every flag a guard tests, grep its write sites before believing the
guard runs.** Zero write sites means the guard is decoration. For a delete list, the equivalent
is deriving the dependent set from the FK graph rather than reading the list
(docs/erasure-dependent-list.md shows the method).

**Do not "fix" this by calling `lockOrganizationMember`.** Locking a student on assessment
completion would make guards 1 and 2 start firing, which would block removing a graduating
cohort — the ordinary case, and the one the student-removal disposition work exists to handle.
The removal disposition replaces these guards rather than repairing them: once removal states
whether it erases or detaches, a blanket refusal is both inert and wrong. Guards 1 and 2 and
`lockOrganizationMember` are removed in that change. **Item 4 is independent and is the only
part that is a plain bug** — the export button should be gated on something real
(`hasCompletedAssessment`, which is what "there are reports to export" actually means) or on
nothing at all. It can be fixed on its own, ahead of the disposition work.

Found 2026-09-11 while verifying the licence-seat leak for the student-removal path.

## A LAYOUT CLASS REVERSED THE DISPOSITION BUTTONS ON MOBILE (found 2026-09-11)

Fixed in 7d5c948. Recorded because the *class* of defect is the interesting part, not the fix.

**What it was.** Both student-removal disposition dialogs put their destructive control
("delete the record permanently") at the TOP of the button stack on any viewport below 640px —
the first control the admin meets, sitting above "keep the account and report".
`AlertDialogFooter`'s base class string is `flex flex-col-reverse sm:flex-row ...`
(`client/src/components/ui/alert-dialog.tsx:66`), and `flex-col-reverse` stacks children against
DOM order. The markup has always read cancel → detach → erase, in that order, deliberately.
The rendered stack read erase → detach → cancel.

**Why it hid.** Three things at once, and each one defeats a different way of looking:

- **Invisible in the DOM.** Reading the JSX shows the correct order. Nothing in
  `AdminOrganizations.tsx` is wrong; the inversion is contributed entirely by a shared
  component's class string, one file away.
- **Invisible at desktop width.** `sm:flex-row` takes over at ≥640px and the row is correct
  there. Anyone checking the dialog on a laptop — which is everyone, most of the time — sees
  the intended order.
- **Invisible to a screenshot read at a single width.** It only exists below the breakpoint.

It was found by rendering the dialog in Arabic and measuring per-element geometry, at two
viewport widths, as a check on something else entirely.

**It is NOT an RTL bug.** This matters for where the lesson gets filed. `flex-col-reverse`
inverts along the block axis, which is independent of writing direction, so it reproduces
identically in English. The RTL check found it; RTL is not the cause. Filing it as
"an Arabic layout issue" would put it in the wrong drawer and leave the English case
unexamined. The genuinely RTL-specific defect found in the same pass was separate and much
smaller — a physical `margin-left` from `space-x-2` landing on the outer edge of the wrong
button, fixed in 86e20fb.

**It answers the friction question from the other end.** `docs/org-delete-recon.md` §6 asked
which destructive admin actions deserve confirmation friction, and concluded the friction was
misallocated — heavy on the bulk path, which is a no-op, and thin on the single path, which
actually destroys. This is a third answer neither the question nor that analysis anticipated:
**the friction was not missing here, and it was not thin. It was reversed.** The affordance that
makes a destructive action harder to reach by accident — being last, being the one you must pass
the safe option to get to — had been turned around by a layout class, so the control that
destroys was the easiest one to hit. A confirmation step counted as present would have counted
this dialog as protected.

**The generalisation, and it rhymes with the one already recorded above about `isLocked`.**
That entry's rule was: for every flag a guard tests, grep its write sites before believing the
guard runs — a guard is a claim, not evidence. The same applies one layer out, to layout:
**source order is a claim about presentation, not evidence of it.** A deliberate ordering of
controls — which is a safety property when one of them is destructive — is only real if it
survives the CSS, at every width the UI actually renders at. The confirming step is as cheap as
the grep was: render it and measure positions, at more than one viewport, rather than reading
the JSX and believing the order.

**Where else to look.** `DialogFooter` (`client/src/components/ui/dialog.tsx:76`) carries the
identical class string and is used across seven files. Any of those dialogs with a destructive
action has the same inversion below 640px. Not audited here — flagged, not fixed, because
reordering a destructive control is a design call and should be made per dialog rather than
swept.
