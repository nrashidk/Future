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
| 8 | Concurrency never tested (harness is single-connection): duplicate setup mail, simultaneous payments, a class of 30 signing in. Needs a real-Postgres load test on staging | Claude | ⏳ |

## Checks Claude runs (no input needed)

| # | Item | Status |
|---|---|---|
| 9 | Live site: HTTPS, security headers, cookie flags; email DNS (SPF / DKIM / DMARC) | 🔍 |
| 10 | Inventory every API route against its guard and whether any test covers it | 🔍 |
| 11 | Independent security review by a separate agent | 🔍 |
| 12 | Every harness suite on a fresh database, one at a time | 🔍 |
| 13 | Data-subject request (export / deletion) end to end on the live site | ⏳ |

## Switch that flips at launch

| # | Item | Owner | Status |
|---|---|---|---|
| 14 | From the first real school: staging first, reversible migration with before/after counts. Point Render at a `release` branch so a push to `main` no longer deploys | Claude prepares, Nasser switches in Render | ⏳ |

## Results log
