# Future Pathways - Career Guidance System

## Overview
Future Pathways is a comprehensive career guidance system for school students aged 13-18. It aims to make career exploration engaging and fun using a sticky notes design aesthetic. The system intelligently aligns student interests, national development goals, future skills, and job market opportunities to help students discover suitable career paths and plan for their future. The project's ambition is to make career planning accessible and engaging, providing insights into future job market trends and skill requirements.

## User Preferences
- Design: Playful, student-friendly sticky notes aesthetic with vibrant colors
- Target audience: School students aged 13-18
- Key features: Guest access for exploration, easy registration to save progress

## System Architecture

### UI/UX Decisions
The application features a playful, student-friendly sticky notes aesthetic with vibrant colors. Key design elements include sticky notes with subtle rotations, drop shadows, and tape effects; hover and active state elevations with smooth transitions; and typography using Poppins for headings and Inter for body text.

### Technical Implementations
- **Frontend**: React with TypeScript, Tailwind CSS, TanStack Query, and Wouter.
- **Backend**: Express.js with TypeScript, PostgreSQL (Neon), and Drizzle ORM.
- **Authentication**: Dual system supporting Replit Auth (OpenID Connect) and username-based login for organization students, with PostgreSQL-backed sessions.
- **Payment System**: Stripe integration for secure, server-side pricing and payment processing for individual and group assessments. Includes a self-service checkout flow that handles user registration, upgrades existing accounts, and manages group purchases.
- **Assessment Components**: Multi-step career assessment featuring a dual-tier (Free/Premium) system with distinct assessment flows:
  - **Free Flow (7 steps)**: Demographics → Subjects → Interests → Personality → Country → Aspirations → Quiz
  - **Premium Flow (8 steps)**: Demographics → Subjects → Country → Quiz → Learning Style → Career Personality → Personal Values → Aspirations
  - Premium users complete all mandatory scientifically-validated assessments: 24-question Learning Style (Kolb), 30-question Career Personality (RIASEC), 21-item Personal Values (CVQ) questionnaire, and Subject Competency Quiz linked to the UAE curriculum
  - Step titles use student-friendly names (Learning Style, Career Personality, Personal Values) instead of technical terminology (Kolb, RIASEC, CVQ)
  - CVQ submission properly links results to assessment ID to enable recommendation generation
  - All assessment steps implement smooth scrolling to top when navigating between question pages
  - Integrates the WEF 16 Skills Framework, mapping assessments to WEF skills for personalized skill profiles
- **Career Catalog**: Expanded to 36 diverse careers with job market trends and Holland Code affinity scores for 15 countries.
- **Results & Reporting**: Horizontal cascading masonry grid for career recommendations, personalized insights for premium users, and PDF report generation with detailed assessment breakdowns.

### Feature Specifications
- **User Authentication**: Dual authentication (Replit Auth and local username/password) with a robust security model and guest access with session migration.
- **User Profile System**: Personalized profile pages displaying account details, premium status, and assessment history. Organization admins can view organization-wide statistics including license usage, total students, and completed assessments via dedicated API endpoints. Organization students see their school name, predefined grade, and assessment count on their profile.
- **Dynamic Career Matching Engine**: Modular architecture with pluggable scoring algorithms (subjects, interests, vision, market, Kolb, RIASEC) and configurable weights. Uses bulk data loading and provides smart filtering to return top 5 careers with detailed reasoning.
- **Country-Specific Data**: Incorporates comprehensive 2030/2050 vision data for 15 countries into the matching algorithm.
- **Grade Pre-filling & Locking**: Organization students have their grade pre-defined by school admins during account creation. During assessment, the grade field is automatically pre-filled and locked (disabled) to prevent students from selecting incorrect grades, ensuring they receive age-appropriate quiz questions aligned with their actual grade level.

### System Design Choices
- **Database Schema**: Comprehensive schema including tables for users, sessions, countries, skills, careers, job market trends, assessments, recommendations, organizations, organization members, and WEF skills data.
- **Group Assessment System**: Features an Admin Dashboard for managing organizations and students, with functionalities for quota tracking, account creation (manual/bulk), and credentials download. Organization admins have access to their organization data via dedicated endpoints (`/api/my-organization`, `/api/my-organization/stats`) showing license usage and member statistics. Implements secure password handling, unique username generation, and atomic SQL-based quota management.
- **Assessment Component System**: Database-backed tables for managing and mapping assessment types and career affinities.
- **Quiz Availability**: Subject competency quiz questions are currently available for the UAE curriculum only, with a "coming soon" message for other countries.
- **Session Storage**: Utilizes PostgreSQL for reliable session persistence.
- **Development Workflow**: Employs `npm run db:push` for database migrations and automatic seeding in development. Optimized WEF affinity seeding with intelligent count-based skipping to prevent data loss when new careers/skills are added.

## Recent Improvements (Nov 22, 2025)

### Phase 1: Critical Security Fixes ✅ COMPLETED
- **Environment-based Superadmin Emails**: Moved from hardcoded values to `SUPERADMIN_EMAILS` environment variable
- **Async Admin Middleware**: Fixed race condition in authorization checks with proper async/await
- **Cryptographic Guest Tokens**: Replaced predictable Math.random() with crypto.randomBytes()
- **Rate Limiting**: Added protection for login (5/15min), payment (10/hour), recommendations (20/hour)
- **Security Headers**: Integrated Helmet with CSP for XSS/clickjacking protection, conditional HSTS

### Phase 2A: Performance Optimization ✅ COMPLETED
- **N+1 Query Elimination**: Optimized analytics endpoints with SQL JOINs and aggregations
  - `getAnalyticsOverview()`: Single queries for countries breakdown and grade distribution
  - `getCountryAnalytics()`: JOIN query filtering by countryId instead of fetching all recommendations
  - `getCareerTrends()`: Single JOIN query with GROUP BY replacing in-memory filtering
- **Database Indexes**: Added indexes on `assessments.userId`, `assessments.countryId`, `recommendations.assessmentId`, `quiz_responses.assessmentQuizId`
- **Performance Targets**: Analytics endpoints now respond in ~200ms range (target: <500ms)

### Phase 2B: Input Validation ✅ COMPLETED
- **Quiz Submission Validation**: Comprehensive checks for question IDs, answer formats, duplicate detection
- **Bulk Member Upload Validation**: 500-member limit, required fields validation, duplicate username detection
- **Assessment Update Validation**: Allowed fields whitelist including all legitimate fields (kolbScores, riasecScores, cvqScores, currentStepMetadata, etc.)
- **Guest Authorization**: Token verification already implemented for quiz endpoints

### Phase 3: Code Quality Improvements ✅ COMPLETED
- **Route Modularization**: Split 2000+ line routes.ts into 11 focused modules (auth, countries, assessment, quiz, cvq, recommendations, careers, analytics, organization, admin, payment)
- **Middleware Extraction**: Centralized auth middleware and rate limiters in server/middleware/
- **Constants Extraction**: Created server/config/constants.ts with rate limits, assessment limits, organization limits, career matching, PDF generation, and env var definitions
- **Environment Variable Validation**: Added startup validation for required vars (DATABASE_URL, SESSION_SECRET, SUPERADMIN_EMAILS) with fail-fast behavior
- **Request Logging**: Integrated morgan middleware with environment-specific logging ('dev' in development, 'combined' in production)
- **Response Compression**: Added compression middleware to reduce bandwidth usage for large JSON responses

## Recent Improvements (Nov 23, 2025)

### Organization Student Grade Management ✅ COMPLETED
- **Auth Endpoint Enhancement**: Auth endpoint now fetches and includes `predefinedGrade` and `organizationName` for organization students, eliminating the need for redundant API calls
- **Profile Page Updates**: 
  - Organization students now see their school name and grade in the Account Information section
  - Premium Status section displays "Available Assessments" count instead of "Completed Assessments" to match individual user experience
  - Assessment History section shows completed assessment count in a prominent format matching the Available Assessments styling
  - "Continue Assessment" button appears when there's an in-progress assessment
- **Grade Field Locking**: Demographics step in the assessment flow automatically pre-fills and locks the grade field for organization students, preventing them from selecting incorrect grades and ensuring they receive curriculum-appropriate quiz questions
- **Bug Fixes**: 
  - Fixed quiz submission JavaScript error (response structure mismatch: `totalScore` vs `score.overall`)
  - Simplified quiz results display to show only overall score
  - Fixed Radix UI Select component to properly respect disabled state by applying `disabled` prop to `SelectTrigger`
  - Fixed useEffect infinite re-render issue by removing `onUpdate` from dependency array

## External Dependencies
- **Database**: PostgreSQL (Neon)
- **Authentication**: Replit Auth (OpenID Connect)
- **Payment Gateway**: Stripe
- **ORM**: Drizzle ORM
- **Frontend Libraries**: React, TypeScript, Tailwind CSS, TanStack Query, Wouter
- **Backend Libraries**: Express.js, TypeScript, Helmet (security), express-rate-limit