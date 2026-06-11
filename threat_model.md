# Threat Model

## Project Overview

Future Pathways is a public career-guidance web application for students, school administrators, and superadmins. The production stack is a React/TypeScript frontend backed by an Express/TypeScript API with PostgreSQL persistence, Passport-managed sessions, Stripe payments, OpenAI-backed content generation, server-side PDF generation, and server-side file storage.

The production deployment is internet-reachable. The client is untrusted. Server-side authorization must distinguish among public visitors, guest assessment sessions, authenticated end users, organization administrators, and superadmins.

## Assets

- **User accounts and sessions** — local credentials, OAuth-linked accounts, session cookies, impersonation state, and guest assessment session tokens. Compromise enables account takeover or lateral access to student/admin data.
- **Student assessment data** — names, age/grade, interests, personality signals, RIASEC responses, CVQ work-values responses, quiz answers, career recommendations, progress history, and generated reports. This is sensitive educational and psychometric data.
- **Organization data** — school rosters, student credentials, quotas, exports, analytics, and contribution/reward records. Compromise affects multiple users at once.
- **Administrative configuration** — scoring weights, LLM prompt templates, country/curriculum metadata, quiz question banks, translations, announcements, and API credentials. Unauthorized changes can corrupt recommendations platform-wide.
- **Uploaded and generated files** — CSV imports, exported student/report data, PDFs, and shared file tokens. Exposure can leak bulk student or organization data.
- **Secrets and payment integrations** — database credentials, session secrets, Stripe secrets/webhook secrets, email credentials, and LLM/API provider keys.

## Trust Boundaries

- **Browser to API** — all request bodies, cookies, headers, query parameters, and route parameters are attacker-controlled until validated and authorized server-side.
- **Public to guest-session boundary** — some assessment flows are intentionally usable without login, but guest access must still be bound to the correct `guest_token` and not to raw assessment IDs alone.
- **Guest/authenticated to data-owner boundary** — authenticated users may only access their own assessments, results, files, and reports unless explicitly granted broader scope.
- **User to org_admin boundary** — school administrators can manage only their own organization’s students, exports, and analytics.
- **Org_admin to superadmin boundary** — only superadmins may modify global configuration, credentials, countries, careers, prompts, and cross-organization data.
- **API to database** — application code has broad database access; injection or broken authorization at the API layer directly risks stored student and administrative data.
- **API to external services** — Stripe, email, LLM providers, and Puppeteer-driven internal page rendering all sit beyond the main app boundary and must receive only validated, least-privilege inputs.
- **Production to dev-only boundary** — mockup sandbox and other development-only tooling are out of scope unless production reachability is demonstrated.

## Scan Anchors

- **Production entry points:** `server/index.ts`, `server/routes.ts`, `server/routes/*.ts`.
- **Highest-risk code areas:** auth/session handling, assessment/recommendation/CVQ/quiz flows, admin/org/superadmin route modules, file sharing/downloads, payment/webhook handlers, export/import paths.
- **Surface split:** public content and guest assessment helpers; authenticated user APIs; org-admin management and analytics; superadmin configuration and impersonation.
- **Usually ignore unless proven reachable:** mockup sandbox, local-only tooling, migrations, and development-only CSP/workflow conveniences.

## Threat Categories

### Spoofing

The application supports multiple identities: guests, end users, organization admins, and superadmins. The system must bind every protected action to a validated session or guest token and must not treat knowledge of an assessment ID as proof of ownership. OAuth callbacks, local login, password reset, and Stripe webhooks must all verify the caller’s identity before changing state.

### Tampering

Students and guests can submit assessment answers, quiz responses, CVQ responses, and payment-related requests. Organization admins and superadmins can mutate school rosters and platform configuration. The backend must enforce that callers can modify only data within their own scope and must derive sensitive state transitions server-side rather than trusting client-selected identifiers.

### Information Disclosure

The application stores sensitive student profile, psychometric, recommendation, analytics, export, and file data. API responses, report generation routes, and file-sharing endpoints must scope data to the current owner or admin boundary. Error handling and logs must avoid exposing secrets, tokens, or unnecessary internal state.

### Denial of Service

Several routes perform expensive work: recommendation generation, LLM-backed content generation, PDF rendering with Puppeteer, bulk imports/exports, and file handling. Production endpoints that trigger expensive computation must be rate-limited and authorization-gated so attackers cannot amplify cost or exhaust worker resources through unauthenticated or cross-tenant requests.

### Elevation of Privilege

This codebase has multiple privilege tiers and many ID-based routes. The main security guarantee is consistent server-side authorization at every route, especially where one endpoint correctly checks ownership and an adjacent endpoint in the same workflow does not. Admin and superadmin capabilities must never be reachable through frontend-only checks, missing role validation, or guest-token bypasses.
