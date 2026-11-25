# Launch readiness — pending items

Started 2026-11-24. "Launch" = the first real school with real students.
Status: ⏳ open · ✅ done · 🔍 in progress. Owner = who has to act.

## Blocking — owner, before any real student signs in

| # | Item | Owner | Status |
|---|---|---|---|
| 1 | UAE data-protection lawyer: (a) cross-border transfer — Neon, Render, Anthropic, Resend, Stripe all hold or process data outside the UAE; schools (esp. government) may require UAE residency; (b) controller/processor roles and a data-processing agreement per school; (c) review of Privacy Policy and Terms; (d) whether ADEK / KHDA / MoE vendor approval is needed; (e) Anthropic receives each student's personality/values results, subject scores and typed career aspirations (no name, checked 2026-11-24) — confirm Anthropic's retention terms | Nasser | ⏳ |
| 2 | Trade licence → bank account → Stripe live keys → real `INVOICE_*` values (replace "TEST ONLY" placeholders); `INVOICE_TRN` only once VAT-registered | Nasser | ⏳ |
| 3 | Render paid plan (Free sleeps: ~90 s first load, and the 72-hour deletions run late) | Nasser | ⏳ |
| 4 | Uptime monitor pinging `https://futurepath.ae/health` every few minutes (HetrixTools) | Nasser | ⏳ |
| 5 | Neon backups: confirm the restore window on the plan; do one restore drill to a branch | Nasser (Claude can guide) | ⏳ |
| 6 | Keep `DB_ENCRYPTION_KEY` in a safe place outside Render | Nasser | ⏳ |

## Should do before launch — security

| # | Item | Owner | Status |
|---|---|---|---|
| 7 | Two-factor sign-in for superadmin (and school admins); a second, break-glass superadmin account. Password-only today (HIGH for minors' data). Touches `server/auth.ts` — needs Nasser's go-ahead | Claude, after approval | ⏳ |
| 8 | Concurrency never tested (harness is single-connection) | Claude | ✅ 2026-11-25: real Postgres 16 in the harness (`testing/local/realpg.sh races`). Held: 6 simultaneous deliveries of one group purchase make 1 account, 1 school, 1 setup link; 8 simultaneous top-up deliveries add licences once; 30 sign-ins at once from one address all succeed (2.5 s). **Found and fixed:** two students finishing at once left the school's used-licence counter one short (drifts low, hands out licences). See 18 |

## Checks Claude runs (no input needed)

| # | Item | Status |
|---|---|---|
| 9 | Live site: HTTPS, security headers, cookie flags; email DNS (SPF / DKIM / DMARC) | ✅ 2026-11-24: headers and cookies sound. DMARC is `p=none` — see 15 |
| 10 | Inventory every API route against its guard and whether any test covers it | ✅ 2026-11-24: 212 routes; every staff route has a role check; ~30 superadmin routes are guarded but exercised by no test (guard verified by reading) |
| 11 | Independent security review by a separate agent | ✅ 2026-11-24: 4 real holes (1 CRITICAL, 3 HIGH), all fixed and tested — see results log |
| 12 | Every harness suite on a fresh database, one at a time | ✅ 2026-11-24: 72/72 suites pass |
| 13 | Data-subject request (export / deletion) end to end on the live site | ⏳ waiting on Nasser: needs a signed-in test account to export and then delete (e.g. a new free account) |

## Found by the checks

| # | Item | Owner | Status |
|---|---|---|---|
| 15 | DMARC for futurepath.ae is `p=none` (monitor only): anyone can send mail that claims to be from futurepath.ae and it is not rejected. Change the `_dmarc` record to `p=quarantine` once reports show only Resend sending | Nasser (DNS) | ⏳ |
| 16 | The public landing page lists every school's name with no opt-in. Customers' names need their consent | Nasser (decision) | ⏳ |
| 17 | `/health` showed `stale: true` on 2026-11-25: the free instance slept and the 72-hour deletions did not run. Fixed by items 3 and 4 | Nasser | ⏳ |

| 18 | **A school can finish more reports than it has licences.** The balance is checked when a student STARTS an assessment, never when the report is charged. One licence left, two students start: both finish, both get reports, the school goes to 2 of 1 (seen on real Postgres). Same with 30 students starting at once on 10 licences. Options: (a) leave it — the school gets the extra reports free; (b) refuse the report until the school tops up (the student finished but sees no report); (c) reserve a licence when the assessment starts and release it if abandoned | Nasser (decision) | ⏳ |
| 19 | Confirm all three schools still have their admin after migration 049 (open Manage Admins as superadmin, or sign in as each admin) | Nasser (click) | ⏳ |

## Switch that flips at launch

| # | Item | Owner | Status |
|---|---|---|---|
| 14 | From the first real school: staging first, reversible migration with before/after counts. Point Render at a `release` branch so a push to `main` no longer deploys | Claude prepares, Nasser switches in Render | 🔍 Claude's part done 2026-11-25: branch `release` exists on GitHub at the same commit as `main`. Nasser: Render → futurepath service → Settings → Build & Deploy → Branch → `release`, save. After that a release is `git push origin main:release` once checks pass |

## Results log
- 2026-11-24 — independent review found and Claude fixed: (1) CRITICAL checkout granted the licence count sent by the browser; (2) HIGH a typed email at checkout upgraded an existing account and made it a school admin; (3) HIGH a second school admin could reset the primary admin's password and see it; (4) HIGH a removed school admin kept the school. Each proved by running, fixed, tested against the old code; migration 049 protects existing admins on deploy.
- 2026-11-25 — real-Postgres race suite added; concurrent purchase, top-up and sign-in all held; a school's used-licence counter drifted low under simultaneous reports — fixed (school row locked when charging). Overdraw at the end of a school's balance raised as item 18. `release` branch created (item 14).
