# CLAUDE.md — Security & Quality Audit Instructions

This file governs how you (Claude Code) work in this repository. Read it fully before doing anything. Follow the phases in order. Do not skip ahead.

## Project context
- Stack: React + Vite (client), Node/Express + TypeScript (server), PostgreSQL via Drizzle ORM (Neon serverless), Passport (local + Google + Microsoft OAuth), express-session with connect-pg-simple, Stripe, Resend, OpenAI (customer-provided API key, stored encrypted), Puppeteer (PDF), Multer (uploads).
- Product: a career-guidance platform.

## ⚠️ CRITICAL — who the users are
**The end users are school students aged 13–18 (minors).** The system stores their names, schools, grade levels, assessment results, and psychological/career-personality/values profiles. School admins create and manage student accounts in bulk on the students' behalf.

Consequences for this audit, treat as binding:
- This is minors' personal data under UAE PDPL (Federal Decree-Law 45/2021) and general child-data-protection norms. A data-exposure bug here is high severity by default.
- **Escalate any authorization/access-control finding by one severity level** above what you'd normally assign. An IDOR that would be "HIGH" on an adult SaaS is **CRITICAL** here.

## replit.md — use as context, do NOT trust as truth
replit.md at the repo root describes the intended architecture and contains a list (in its Security & Performance section) of security controls the previous builder *claims* were implemented: assessment ownership verification, path-traversal protection, role-based access control, CSP restrictions, cryptographic guest tokens, Stripe webhook secret enforcement, input sanitization, etc.

**Read it to understand what each part is supposed to do. Then verify every security claim against the actual code.** A claim in replit.md is an allegation to confirm, never evidence that the control exists or works. Note any claim you cannot confirm in code as a finding.

## Operating rules (apply to every phase)
1. **Phase 1 is READ-ONLY.** Do not modify, create, or delete any file during the audit phase. Produce a findings report only.
2. **No fixes until I approve the findings.** After Phase 1, stop and wait for my review.
3. **One issue per commit** when fixing. Small, reviewable diffs. Never bundle unrelated changes. Never do a sweeping "refactor for security."
4. **Run real tools, don't just read code.**
5. **Cite file and line** for every finding.
6. **If you are uncertain whether something is a bug, list it as "needs human review" — do not "fix" it.**

## DO NOT TOUCH — this code is already correct
The authentication core has been reviewed and is sound. Do not "harden," refactor, or rewrite these unless I explicitly ask:
- server/auth.ts — bcrypt hashing, rate limiting, account lockout, password complexity, session regeneration on login, cookie flags (httpOnly/secure/sameSite). All intentional and correct.
- Stripe webhook signature verification.
- CSRF middleware wiring order in server/routes.ts (auth → CSRF → routes is deliberate).
- DOMPurify usage, helmet, Drizzle parameterized queries.
Flag a genuine bug in these if you find one, but do not stylistically rework them.

## Already verified clean (do not re-litigate)
- Secret scanning: gitleaks run on full history — only 3 placeholder strings, allowlisted in .gitleaks.toml. No real secrets in history. .env is gitignored and was never committed.
- Dependency vulnerabilities: npm install reports 0 vulnerabilities. A confirming `npm audit --omit=dev` is fine, but do not chase deprecation warnings (glob/recharts/jpeg-exif) during this audit — note them as maintenance follow-ups only.
- Node runtime: now pinned to Node 22 LTS via .nvmrc.

## Phase 1 — Audit (read-only, produce a report)

### 1a. Verified config issues to confirm and document
- **Startup env guards:** server/db.ts correctly throws if DATABASE_URL is unset. Confirm there is NO equivalent guard for SESSION_SECRET or DB_ENCRYPTION_KEY. A missing SESSION_SECRET (used with `!` non-null assertion in auth.ts) is a silent security failure. Document as a finding.
- **OAuth email linking:** in auth.ts upsertOAuthUser, accounts are auto-linked by matching email without checking the provider marked the email verified. Document.
- **BASE_URL fallback** points to a repl.co URL; the app no longer runs on Replit. Document the need to set BASE_URL in the deployment environment.

### 1b. TOP PRIORITY — broken object-level authorization (IDOR)
The most important task in this audit. Route modules live in server/routes/*.routes.ts. isAuthenticated only checks that a user is logged in — it does NOT check resource ownership.

For **every** endpoint that reads, updates, or deletes a record identified by an ID (path param, query param, or body field):
- Trace whether the handler verifies the record belongs to the authenticated user (req.user.userId) before acting.
- **Produce a table: endpoint | method | checks ownership? (yes/no/unclear) | file:line.** Put this table at the top of the report.
- Every endpoint that does NOT verify ownership is a CRITICAL finding (minors' data — see escalation rule).

replit.md specifically claims "assessment ownership verification for PATCH endpoint." Verify that claim against the code, and check whether the SAME ownership pattern is applied to GET/DELETE on assessments and to every other user-owned resource (recommendations, quiz results, progress, files, reports). A control applied to one verb/endpoint and not the others is a common real gap.

### 1c. CROSS-TENANT authorization (org-admin / superadmin) — second priority
School admins manage students on their behalf; there are org_admin (scoped to one organization) and superadmin (nationwide) roles. Audit specifically:
- Can an org_admin access, export, or modify students/data belonging to a **different** organization? Check every endpoint in organization.routes.ts, admin.routes.ts, analytics.routes.ts, and bulk import/export and credential-download paths. Confirm each one filters by the admin's own organizationId, not merely "is this user an admin."
- The analytics endpoints claim to be "org-scoped for org_admins, nationwide for superadmins." Verify the scoping is enforced server-side on the query, not assumed from the role.
- Note that the session stores only { userId, ... } and deserializeUser does not re-fetch from the DB. Confirm role and organizationId are read fresh from the database on each privileged request, never trusted from the session object or a client-supplied field.

### 1d. Guest access & session migration
Guests can use the app anonymously and later register, migrating their guest session/data to a real account. Audit auth.routes.ts / wherever migration lives:
- Can a guest migrate their data into an **existing other user's** account (account-takeover / data-injection)?
- Are the "cryptographic guest tokens" (claimed in replit.md) actually generated with a CSPRNG and unguessable? Confirm in code.
- Is there any endpoint that trusts a client-supplied guest/user ID to attribute data?

### 1e. Other classes to audit
- **File uploads & downloads** (multer, files.routes.ts): file-type allowlist, size limits, the claimed path-traversal protection (verify it), and the "time-limited token" sharing — confirm tokens expire, are single-scope, and can't be enumerated. Files may contain student PDFs/CSVs.
- **OpenAI key handling** (apiCredentials, server/utils/encryption.ts, the superadmin LLM-prompt-template UI): confirm the customer key is decrypted only server-side at call time and never sent to the client; confirm the configurable prompt templates can't be abused for injection that exfiltrates the key or other users' data.
- **Encryption util**: algorithm (expect AES-256-GCM), unique IV per encryption, auth tag handling.
- **Password reset** (password-reset.routes.ts): token entropy, expiry, single-use, no user-enumeration in responses.
- **CSRF** (middleware/csrf.middleware.ts): confirm it validates state-changing requests and isn't trivially bypassable.
- **Input validation:** confirm zod (or equivalent) validates request bodies on write endpoints generally, not only on register.
- **PDPL/GDPR:** verify the claimed data export/deletion actually removes/returns all of a student's personal data, including assessments, files, and analytics rows.

### 1f. Run these and include output
- `npm audit --omit=dev` (confirming; expected clean)
- `npx semgrep --config auto server/` (SAST)

### Deliverable for Phase 1
A single markdown report grouped by severity: **CRITICAL / HIGH / MEDIUM / LOW**, with the IDOR ownership table (1b) and the cross-tenant findings (1c) at the top. Each finding: title, file:line, why it matters, suggested fix (described, not applied). Remember the minors-data severity escalation. Then STOP and wait for my review.

## Phase 2 — Fixes (only after I approve)
Highest-severity first. One issue per commit. After each fix, run the relevant test (or write a smoke test if none exists for that path). Do not proceed to the next fix until the current one is verified.

## Phase 3 — Tests
If there is no test runner configured, propose one (Vitest fits this stack) before writing tests. Priority order: authorization checks fixed in Phase 2 (cross-tenant + IDOR), auth flows, payment/webhook handling, guest migration. Smoke tests first, not exhaustive coverage.