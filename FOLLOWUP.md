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
