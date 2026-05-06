# Future Pathways - Career Guidance System

## Overview
Future Pathways is a comprehensive career guidance system for school students aged 13-18. It aims to make career exploration engaging and fun using a sticky notes design aesthetic. The system intelligently aligns student interests, national development goals, future skills, and job market opportunities to help students discover suitable career paths and plan for their future, specifically focusing on the UAE's 2030/2071 vision. The project's ambition is to make career planning accessible and engaging, providing insights into future job market trends and skill requirements.

## User Preferences
- Design: Playful, student-friendly sticky notes aesthetic with vibrant colors
- Target audience: School students aged 13-18
- Key features: Guest access for exploration, easy registration to save progress

## System Architecture

### UI/UX Decisions
The application features a playful, student-friendly sticky notes aesthetic with vibrant colors. Key design elements include sticky notes with subtle rotations, drop shadows, and tape effects, hover and active state elevations with smooth transitions, and typography using Poppins and Inter. Premium insights are visually differentiated with distinct styling.

### Technical Implementations
- **Frontend**: React with TypeScript, Tailwind CSS, TanStack Query, and Wouter.
- **Backend**: Express.js with TypeScript, PostgreSQL (Neon), and Drizzle ORM.
- **Authentication**: Multi-provider OAuth system (Google, Microsoft, email/password) with Passport.js, PostgreSQL-backed sessions, and guest access with session migration.
- **Payment System**: Stripe integration for individual and group assessments with self-service checkout.
- **Assessment Components**: Multi-step career assessment (Free and Premium flows), mandatory scientifically-validated assessments for Premium users (Learning Style, Career Personality, Personal Values), Subject Competency Quiz linked to UAE curriculum, and integration of the WEF 16 Skills Framework. All quiz questions are based on the UAE curriculum.
- **Career Catalog**: Expanded with 36 diverse careers, job market trends, and Holland Code affinity scores for UAE.
- **Results & Reporting**: Horizontal cascading masonry grid for career recommendations, personalized insights for premium users, and PDF report generation. Includes multi-grade progress tracking showing career evolution and consistency across assessments.
- **User Profile System**: Displays account details, premium status, assessment history, and organization admin functionalities for managing students and viewing statistics.
- **Dynamic Career Matching Engine**: Modular architecture with pluggable, configurable scoring algorithms (subjects, interests, vision, market, Kolb, RIASEC) and smart filtering, incorporating UAE 2030/2071 vision data. Superadmins can configure scoring methodology and LLM prompt templates via a dedicated UI.
- **Grade Management**: Pre-filled and locked grades for organization students based on school admin configuration. System migrated to individual grade levels (8-12) for quiz generation and progress tracking.
- **Group Assessment System**: Admin Dashboard for managing organizations and students, including quota tracking, account creation (manual/bulk), credentials download, and unlimited license support for superadmins. Organization admins can export student reports (PDF) and data (CSV).
- **Analytics System**: Secure, role-based analytics endpoints providing nationwide data for superadmins and organization-scoped data for org_admins. Includes overview, country breakdowns, career trends, and grade distributions.
- **File Management System**: Comprehensive file upload, storage, and tracking with secure sharing via time-limited tokens. Supports CSV, JSON, PDF, Excel files.
- **Data Import/Export**: Bulk student import via CSV with validation. Organization data export (students, assessments, analytics) in CSV or JSON.
- **Security & Performance**: Critical security fixes (environment-based superadmin emails, async admin middleware, cryptographic guest tokens, rate limiting, Helmet security headers, role-based access control, CSRF protection, input sanitization via DOMPurify, assessment ownership verification for PATCH endpoint, path-traversal protection on file downloads, CSP `unsafe-inline` restricted to dev-only, Stripe webhook secret required in production, JSON body parser limited to 512kb globally / 10mb for bulk import only), performance optimizations (N+1 query elimination, database indexes), robust input validation, GDPR compliance (data export/deletion), 24-hour session timeout, and secure email-based password reset flow.
- **Accessibility & SEO**: Skip-navigation link, `<main id="main-content">` landmark on all primary pages, keyboard-accessible StickyNote components (role, tabIndex, onKeyDown, aria-pressed), decorative emoji/separators marked `aria-hidden`, per-route `document.title` updates on all 15+ pages, JSON-LD structured data, canonical URL, Open Graph enhancements (og:locale, og:image:alt, twitter:site), non-render-blocking Google Fonts, lazy-decoded school logos, sitemap namespace fix with /login /register removed, useAuth staleTime set to 30 seconds.
- **Arabic / i18n Infrastructure (Task #11)**: i18next + react-i18next + i18next-http-backend installed; `client/src/i18n/config.ts` sets up lazy-loading locale JSON from `/locales/{lng}/common.json`; `LanguageContext` manages language state (localStorage for guests, DB `preferred_language` column for logged-in users), sets `html[lang]` and `html[dir]` for RTL; EN/AR toggle button in Header (desktop + mobile); Cairo font added to Google Fonts load; `[lang="ar"]` CSS rule switches `--font-sans/serif/body` to Cairo; `users.preferred_language` varchar column + `system_announcements.title_ar/content_ar` columns added to DB; `PATCH /api/users/me/language` backend endpoint; AnnouncementBanner serves AR text when language=ar; LLM service supports `{{language}}` template variable.
- **School Rewards System**: A manual allocation workflow for contributions, featuring LLM pre-verification, superadmin review, configurable yearly credit limits, and tracking of pending rewards.
- **Admin/Student Roster Enhancements**: Includes `lastLoginAt` tracking, activity-aware status badges, roster filtering by role and status, and enhanced CSV export with comprehensive fields.
- **Education Pathways Feature**: LLM-generated personalized university and program recommendations for premium users, with links to CAA-verified UAE institutions.

### System Design Choices
- **Database Schema**: Comprehensive schema covering users, sessions, countries, skills, careers, job market trends, assessments, recommendations, organizations, WEF skills data, file management, and configurable scoring/LLM settings.
- **Session Storage**: PostgreSQL for reliable session persistence.
- **Development Workflow**: `npm run db:push` for migrations and seeding.
- **Premium Narrative Service**: Dynamic generation of premium narratives at fetch time for flexibility.
- **File Storage Architecture**: Server-side file storage with database metadata tracking and secure access control.

## External Dependencies
- **Database**: PostgreSQL (Neon)
- **Authentication**: Passport.js (Google OAuth 2.0, Microsoft OAuth, Local)
- **Payment Gateway**: Stripe
- **LLM Provider**: OpenAI (customer-provided API key)
- **ORM**: Drizzle ORM
- **Frontend Libraries**: React, TypeScript, Tailwind CSS, TanStack Query, Wouter
- **Backend Libraries**: Express.js, TypeScript, Helmet, express-rate-limit
- **PDF Generation**: Puppeteer
- **Archiving**: Archiver library
- **File Upload**: Multer