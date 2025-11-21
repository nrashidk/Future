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
- **Dynamic Career Matching Engine**: Modular architecture with pluggable scoring algorithms (subjects, interests, vision, market, Kolb, RIASEC) and configurable weights. Uses bulk data loading and provides smart filtering to return top 5 careers with detailed reasoning.
- **Country-Specific Data**: Incorporates comprehensive 2030/2050 vision data for 15 countries into the matching algorithm.

### System Design Choices
- **Database Schema**: Comprehensive schema including tables for users, sessions, countries, skills, careers, job market trends, assessments, recommendations, organizations, organization members, and WEF skills data.
- **Group Assessment System**: Features an Admin Dashboard for managing organizations and students, with functionalities for quota tracking, account creation (manual/bulk), and credentials download. Implements secure password handling, unique username generation, and atomic SQL-based quota management.
- **Assessment Component System**: Database-backed tables for managing and mapping assessment types and career affinities.
- **Quiz Availability**: Subject competency quiz questions are currently available for the UAE curriculum only, with a "coming soon" message for other countries.
- **Session Storage**: Utilizes PostgreSQL for reliable session persistence.
- **Development Workflow**: Employs `npm run db:push` for database migrations and automatic seeding in development.

## External Dependencies
- **Database**: PostgreSQL (Neon)
- **Authentication**: Replit Auth (OpenID Connect)
- **Payment Gateway**: Stripe
- **ORM**: Drizzle ORM
- **Frontend Libraries**: React, TypeScript, Tailwind CSS, TanStack Query, Wouter
- **Backend Libraries**: Express.js, TypeScript