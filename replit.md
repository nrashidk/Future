# Future Pathways - Career Guidance System

## Overview
Future Pathways is a comprehensive career guidance system for school students aged 13-18. It aims to make career exploration engaging and fun using a sticky notes design aesthetic. The system intelligently aligns student interests, national development goals, future skills, and job market opportunities to help students discover suitable career paths and plan for their future. The project's ambition is to make career planning accessible and engaging, providing insights into future job market trends and skill requirements.

## User Preferences
- Design: Playful, student-friendly sticky notes aesthetic with vibrant colors
- Target audience: School students aged 13-18
- Key features: Guest access for exploration, easy registration to save progress

## System Architecture

### UI/UX Decisions
The application features a playful, student-friendly sticky notes aesthetic with vibrant colors. Key design elements include:
- Sticky notes with subtle rotations (-2° to 2°), drop shadows, and tape effects.
- Hover and active state elevations with smooth transitions and animations.
- Typography uses Poppins for headings and Inter for body text.

### Technical Implementations
- **Frontend**: React with TypeScript, Tailwind CSS for styling, TanStack Query for server state management, and Wouter for routing.
- **Backend**: Express.js with TypeScript, PostgreSQL (Neon) for the database, and Drizzle ORM.
- **Authentication**: Dual authentication system supporting both Replit Auth (OpenID Connect) and username-based login for organization students.
    - **Replit Auth**: Standard OAuth flow for regular users and superadmins via GET `/api/login` → `/api/callback`
    - **Local Auth**: Username/password authentication via passport-local for organization students (POST `/api/login/username`)
    - **Session Management**: PostgreSQL-backed sessions (1 week TTL) shared across both auth types
    - **Middleware**: `isAuthenticated` supports both auth flows; `isAdmin` restricts admin routes to Replit Auth superadmins only
    - **Student Login Page**: `/login/student` provides simple username/password form with error handling and auth cache invalidation
- **Payment System**: Stripe integration for secure, server-side pricing and payment processing, supporting individual and group assessments.
- **Self-Service Checkout** (November 2025):
    - **Unified Checkout Flow**: Single checkout page (`/checkout`) for both individual ($10) and group purchases (bulk discounts)
    - **Registration Form**: Collects firstName, lastName, email, phone, and organizationName (for groups)
    - **Backend API** (`POST /api/checkout/complete`):
        - **Payment Verification**: Validates Stripe payment success + amount against metadata
        - **Idempotency Protection**: Tracks processed payments via Stripe metadata to prevent double-counting on retries
        - **User Handling**: 
            - New users: Auto-create with generated username/password (bcrypt hashed), auto-login with local strategy
            - Existing OAuth users: Reject with helpful error (must login first to upgrade)
            - Existing local users: Increment licenses, redirect to login (no auto-login for security)
        - **Group Purchases**: Promote user to org_admin role, create organization with payment tracking
        - **Response**: Different messages/routing for new vs existing users, includes credentials for new accounts
    - **Storage Layer Enhancements**:
        - `getUserByEmail`: Find users by email for duplicate detection
        - `createStandaloneUser`: Create users with auto-generated credentials (username collision handling, max 10 retries)
        - `updateUserFields`: Selective field updates with incremental license allocation
    - **Frontend Flow**:
        - TierSelection → GroupPricing (for groups) → Checkout
        - Smart routing after payment: New users auto-logged in → /assessment or /admin/organizations
        - Existing users → /login/student with message
        - Credentials display: 15s toast + console log (TODO: upgrade to modal)
    - **Security**: Bcrypt password hashing, server-side payment verification, incremental license allocation, OAuth user protection, atomic transactions
    - **Improvements (November 14, 2025 - **COMPLETED**)**:
        - ✅ **Atomic Transactions**: `createGroupPurchaseTransaction` wraps all group purchase operations (user promotion, license allocation, org creation, admin membership) in a single Drizzle transaction with row-level locking
        - ✅ **Credentials Modal**: Professional modal component with copy-to-clipboard functionality replaces toast notifications for better UX
        - ✅ **Complete Testing Guide**: Comprehensive guide covering individual purchases, group purchases, edge cases, and error scenarios (`CHECKOUT_TESTING_GUIDE.md`)
- **Assessment Components**:
    - Multi-step career assessment questionnaire including demographics, subjects, interests, personality (RIASEC), country vision, and aspirations.
    - Dual-tier assessment system: Basic (free) and Individual/Group (premium, paid).
    - Scientifically-validated 24-question learning style assessment for premium users, determining four learning styles: Diverging, Assimilating, Converging, Accommodating.
    - RIASEC (Holland Code) personality assessment with 30 Likert-scale questions, calculating normalized scores across six themes.
    - Subject Competency Quiz with grade-differentiated questions covering Math, Science, English, Arabic, Social Studies, and Computer Science, linked to the UAE curriculum.
    - **WEF 16 Skills Framework Integration** (November 2025 - **COMPLETED**):
        - **Database**: 5 normalized tables (`wef_skills`, `career_wef_skill_affinities`, `wef_competency_results`, `country_priority_sectors`, `country_sector_wef_skills`) with JSONB storage for student WEF competency scores
        - **Reference Data**: 16 skills seeded + 576 career-skill affinity mappings + 6 UAE priority sectors + 30 sector-skill mappings
        - **Assessment Mapping** (`server/services/wefAssessmentMapping.ts`): Research-validated correlations mapping existing assessments to WEF skills:
            - CVQ domains (achievement, benevolence, universalism, etc.) → WEF skills with weighted correlations
            - RIASEC themes → WEF skills (e.g., Investigative → Scientific Literacy 0.9, Critical Thinking 0.9)
            - Kolb learning styles → WEF skills (e.g., Diverging → Creativity 0.9, Curiosity 0.8)
            - Subject competencies → WEF skills (e.g., Mathematics → Numeracy 1.0, Critical Thinking 0.8)
        - **WEF Calculator** (`server/services/wefSkillsCalculator.ts`): Aggregates assessment data using weighted mappings to produce 16 skill scores (0-100), overall readiness, top skills, and growth areas
        - **Data Extractor** (`server/services/wefDataExtractor.ts`): Orchestrates extraction from DB models (CVQ normalizedScores, RIASEC/Kolb JSONB, quiz subjectScores)
        - **Storage**: `upsertWefCompetencyResult()` provides idempotent persistence using PostgreSQL ON CONFLICT on assessmentId with proper rawResponses metadata preservation
        - **Orchestration** (`server/services/wefOrchestrator.ts`): `syncWEFSkillsProfile()` coordinates extract → calculate → persist flow (non-blocking)
        - **Integration**: Fully integrated into `/api/recommendations/generate` route for premium users; WEF skills calculator active in matching algorithm
        - **UAE Priority Sectors**: 6 sectors (AI, Space, Biotech, Renewable Energy, Education, Technology) mapped to WEF skills with importance scores for enhanced vision alignment matching
        - **Research Attribution** (`server/research/sources.ts`): Centralized registry of 8 research sources (WEF, Holland, Kolb, CVQ, UAE/Saudi visions, OECD, UAE curriculum) with utility functions for programmatic citation access. Attribution visible on landing page "Research-Backed Methodology" section and PDF report "Research Methodology & Sources" section
- **Career Catalog**: Expanded to 36 diverse careers with comprehensive job market trends and Holland Code affinity scores for 15 countries.
- **Results & Reporting**:
    - Horizontal cascading masonry grid layout for career recommendations.
    - Personalized insights for premium users (e.g., learning style analysis, study tips).
    - PDF report generation with detailed assessment breakdowns, subject competency scores, vision linkages, and career connection explanations.

### Feature Specifications
- **User Authentication**: 
    - **Dual Authentication System**: Replit Auth (OIDC) for regular users and superadmins + passport-local for organization students
    - **Security Model**: Local users cannot be superadmins; admin routes protected by `isAdmin` middleware
    - **Session Serialization**: Replit users store OIDC tokens; local users store `{ userId, username, isLocal: true }`
    - **User Fetching**: `/api/auth/user` handles both `req.user.userId` (local) and `req.user.claims.sub` (OIDC)
    - **Guest Access**: Available for exploration with session migration upon registration
- **Dynamic Career Matching Engine** (server/services/matching.ts):
    - **Modular Architecture**: Component-based calculator registry with pluggable scoring algorithms (subjects, interests, vision, market, Kolb, RIASEC).
    - **Bulk Data Loading**: Eliminates N+1 query patterns with three deterministic queries (assessment data, job trends, career affinities).
    - **Configurable Weights**: Subject Match (20%), Interest Match (20%), Vision Alignment (20%), Market Demand (20%), Kolb (10%), RIASEC (10%).
    - **Component Calculators**:
        - Subjects: Blends preference (40%) with demonstrated competency (60%) from quiz scores, applying penalties for low performance.
        - Interests: Keyword thesaurus matching against career descriptions with flexible scoring.
        - Vision: Tiered scoring (100/90/80) based on country priority sector rankings.
        - Market: Job trend demand scores sorted by most recent year data.
        - Kolb: Learning style affinity scores (placeholder for future database-backed implementation).
        - RIASEC: Holland Code personality alignment using database-stored career affinities.
    - **Smart Filtering**: Returns top 5 careers with >40% overall match, includes component-level reasoning for transparency.
- **Country-Specific Data**: Comprehensive 2030/2050 vision data for 15 countries, integrated into the matching algorithm.

### System Design Choices
- **Database Schema**: Includes `users`, `sessions`, `countries` (with mission/vision, visionPlan, targets), `skills`, `careers`, `job_market_trends`, `assessments` (with `assessmentType`, `kolbScores`, `riasecResponses`, `riaseacScores`), `recommendations`, `organizations`, `organizationMembers`, `wef_skills`, `career_wef_skill_affinities`, `wef_competency_results`, `country_priority_sectors`, and `country_sector_wef_skills` tables.
- **Group Assessment System** (November 2025):
    - **Admin Dashboard**: `/admin/organizations` provides organization selector, student roster table with quota tracking, manual/bulk account creation, and credentials download
    - **Database Tables**: `organizations` (name, adminUserId, totalLicenses, usedLicenses, Stripe metadata) and `organizationMembers` (userId, organizationId, grade, studentId, role, hasCompletedAssessment, isLocked, password reset audit trail)
    - **Password System**: Three complexity levels (easy, medium, strong) using secure bcrypt hashing via `server/utils/passwordHash.ts`. Plaintext passwords provided only during creation/download for admin distribution
    - **Username Generation**: `server/utils/usernameGenerator.ts` creates unique usernames from fullName with collision handling (up to 10 attempts)
    - **Quota Management**: Atomic SQL-based quota tracking with bounds enforcement (0 ≤ usedLicenses ≤ totalLicenses) to prevent race conditions and quota drift
    - **Student Account Creation**: `createUserWithCredentials` method parses fullName into firstName/lastName, generates unique usernames, creates both User and OrganizationMember records transactionally
    - **API Routes** (Super Admin only): Organization CRUD, member management (create, bulk upload, update, delete, password reset), quota tracking, and credentials download endpoints at `/api/admin/organizations/*`
    - **Authentication**: Organization students use username-based login via `/login/student` page; passwords verified with bcrypt
    - **Authorization**: `isAdmin` middleware blocks local users from admin routes; only Replit Auth superadmins can manage organizations
    - **Security**: Unique constraint on `organizationMembers.userId` prevents duplicate memberships. Locked accounts (post-assessment) cannot be deleted
- **Assessment Component System**: Database-backed `assessment_components` and `career_component_affinities` tables for managing and mapping assessment types and career affinities (e.g., RIASEC, Learning Styles).
- **Quiz Availability**: Subject competency quiz questions available for UAE curriculum only (240 questions covering 6 subjects × 2 grade bands × 20 questions). Other countries show friendly "coming soon" message with skip option.
- **Session Storage**: PostgreSQL-backed for reliability.
- **Development Workflow**: Uses `npm run db:push` for database migrations and automatic seeding in development.

## External Dependencies
- **Database**: PostgreSQL (specifically Neon for managed PostgreSQL).
- **Authentication**: Replit Auth (OpenID Connect).
- **Payment Gateway**: Stripe for processing payments.
- **ORM**: Drizzle ORM for database interactions.
- **Frontend Libraries**: React, TypeScript, Tailwind CSS, TanStack Query, Wouter.
- **Backend Libraries**: Express.js, TypeScript.