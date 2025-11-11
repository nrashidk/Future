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
- **Authentication**: Replit Auth (OpenID Connect) with PostgreSQL-backed sessions.
- **Payment System**: Stripe integration for secure, server-side pricing and payment processing, supporting individual and group assessments.
- **Assessment Components**:
    - Multi-step career assessment questionnaire including demographics, subjects, interests, personality (RIASEC), country vision, and aspirations.
    - Dual-tier assessment system: Basic (free) and Individual/Group (premium, paid).
    - Scientifically-validated 24-question learning style assessment for premium users, determining four learning styles: Diverging, Assimilating, Converging, Accommodating.
    - RIASEC (Holland Code) personality assessment with 30 Likert-scale questions, calculating normalized scores across six themes.
    - Subject Competency Quiz with grade-differentiated questions covering Math, Science, English, Arabic, Social Studies, and Computer Science, linked to the UAE curriculum.
- **Career Catalog**: Expanded to 36 diverse careers with comprehensive job market trends and Holland Code affinity scores for 15 countries.
- **Results & Reporting**:
    - Horizontal cascading masonry grid layout for career recommendations.
    - Personalized insights for premium users (e.g., learning style analysis, study tips).
    - PDF report generation with detailed assessment breakdowns, subject competency scores, vision linkages, and career connection explanations.

### Feature Specifications
- **User Authentication**: Replit Auth with guest access and session migration.
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
- **Database Schema**: Includes `users`, `sessions`, `countries` (with mission/vision, visionPlan, targets), `skills`, `careers`, `job_market_trends`, `assessments` (with `assessmentType`, `kolbScores`, `riasecResponses`, `riaseacScores`), `recommendations`, `organizations`, and `organizationMembers` tables.
- **Group Assessment System** (November 2025):
    - **Database Tables**: `organizations` (name, adminUserId, totalLicenses, usedLicenses, Stripe metadata) and `organizationMembers` (userId, organizationId, grade, studentId, role, hasCompletedAssessment, isLocked, password reset audit trail).
    - **Password System**: Three complexity levels (easy, medium, strong) using secure bcrypt hashing. Plaintext passwords provided only during creation/download for admin distribution.
    - **Quota Management**: Atomic SQL-based quota tracking with bounds enforcement (0 ≤ usedLicenses ≤ totalLicenses) to prevent race conditions and quota drift.
    - **Student Account Creation**: `createUserWithCredentials` method parses fullName into firstName/lastName, generates unique usernames with collision handling (up to 10 attempts), creates both User and OrganizationMember records transactionally.
    - **API Routes** (Super Admin only): Organization CRUD, member management (create, bulk upload, update, delete, password reset), quota tracking, and credentials download endpoints at `/api/admin/organizations/*`.
    - **Security**: Unique constraint on `organizationMembers.userId` prevents duplicate memberships. Locked accounts (post-assessment) cannot be deleted.
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