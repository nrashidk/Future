# Future Pathways - Career Guidance System

## Overview
Future Pathways is a comprehensive career guidance system for school students aged 13-18. It aims to make career exploration engaging and fun using a sticky notes design aesthetic. The system intelligently aligns student interests, national development goals, future skills, and job market opportunities to help students discover suitable career paths and plan for their future. The project's ambition is to make career planning accessible and engaging, providing insights into future job market trends and skill requirements, particularly focusing on the UAE's 2030/2071 vision.

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
- **Authentication**: Dual system supporting Replit Auth (OpenID Connect) and username-based login, with PostgreSQL-backed sessions. Guest access with session migration is supported.
- **Payment System**: Stripe integration for secure, server-side pricing and payment processing for individual and group assessments, including a self-service checkout flow.
- **Assessment Components**: A multi-step career assessment with Free (7 steps) and Premium (8 steps) flows. Premium users complete mandatory, scientifically-validated assessments (Learning Style, Career Personality, Personal Values) and a Subject Competency Quiz linked to the UAE curriculum. Assessment step titles use student-friendly language. Integrates the WEF 16 Skills Framework for personalized skill profiles.
- **Career Catalog**: Expanded to 36 diverse careers with job market trends and Holland Code affinity scores for UAE.
- **Results & Reporting**: Horizontal cascading masonry grid for career recommendations, personalized insights for premium users (including detailed narratives on "Why This Career?", "Your Work Style Fit," "Personal Strengths & Growth Areas," and "Next Steps"), and PDF report generation.
- **User Profile System**: Displays account details, premium status, and assessment history. Organization admins can view organization-wide statistics and manage students.
- **Dynamic Career Matching Engine**: Modular architecture with pluggable, configurable scoring algorithms (subjects, interests, vision, market, Kolb, RIASEC) and smart filtering. Incorporates comprehensive UAE 2030/2071 vision data.
- **Grade Management**: For organization students, grade is pre-filled and locked during assessments based on school admin configuration.
- **Group Assessment System**: Features an Admin Dashboard for managing organizations and students, with functionalities for quota tracking, account creation (manual/bulk), credentials download, and unlimited license support for superadmins. Includes secure password handling and atomic SQL-based quota management. Organization admins can export student reports (PDF) and data (CSV).
- **Unlimited Licenses**: Superadmins can create organizations with unlimited assessment licenses, bypassing quota restrictions while still tracking usage metrics.
- **Analytics System**: Secure, role-based analytics endpoints providing nationwide data for superadmins and organization-scoped data for org_admins. Includes overview, country breakdowns, career trends, and grade distributions.
- **File Management System**: Comprehensive file upload, storage, and tracking system with support for CSV, JSON, PDF, Excel files. Features secure file sharing via time-limited tokens, download tracking, and processing status monitoring.
- **Data Import/Export**: Bulk student import via CSV with validation and error reporting. Organization data export (students, assessments, analytics) in CSV or JSON format. All imports/exports are tracked in the files table with processing status.
- **Country Availability**: Currently configured for UAE only, with all quiz questions based on the UAE curriculum.
- **Security & Performance**: Includes critical security fixes (environment-based superadmin emails, async admin middleware, cryptographic guest tokens, rate limiting, Helmet security headers, role-based access control), performance optimizations (N+1 query elimination, database indexes), and robust input validation.
- **CSRF Protection**: Double-submit cookie pattern for all state-changing endpoints, with correct middleware ordering and appropriate exemptions.
- **Guest Token Security**: Guest tokens stored in httpOnly cookies instead of localStorage for XSS protection.
- **Input Sanitization**: DOMPurify-based sanitization for all user-submitted assessment data.
- **GDPR Compliance**: User data export (JSON) and account deletion endpoints with proper authentication.
- **Session Security**: Session timeout reduced to 24 hours for enhanced security.
- **Password Reset System**: Complete email-based password reset flow with Resend integration, cryptographic tokens (32-byte), 1-hour expiry, one-time use, rate limiting (3 requests/15min for requests, 5 attempts/hour for resets), and CSRF protection.
- **Code Quality**: Modularized routes, extracted middleware and constants, environment variable validation, request logging, and response compression.

### System Design Choices
- **Database Schema**: Comprehensive schema covering users, sessions, countries, skills, careers, job market trends, assessments, recommendations, organizations, organization members, WEF skills data, and file management.
- **Session Storage**: Utilizes PostgreSQL for reliable session persistence.
- **Development Workflow**: Employs `npm run db:push` for migrations and automatic seeding, with optimized WEF affinity seeding.
- **Premium Narrative Service**: Dynamic generation of premium narratives at fetch time to keep the database lean and allow flexible updates.
- **File Storage Architecture**: Server-side file storage in `uploads/` directory with database metadata tracking. Supports multiple file types (CSV, JSON, PDF, Excel, ZIP) with secure access control and share token system.

## External Dependencies
- **Database**: PostgreSQL (Neon)
- **Authentication**: Replit Auth (OpenID Connect)
- **Payment Gateway**: Stripe
- **ORM**: Drizzle ORM
- **Frontend Libraries**: React, TypeScript, Tailwind CSS, TanStack Query, Wouter
- **Backend Libraries**: Express.js, TypeScript, Helmet, express-rate-limit
- **PDF Generation**: Puppeteer (for report generation)
- **Archiving**: Archiver library (for bulk report export)
- **File Upload**: Multer (for handling multipart/form-data file uploads)

## Recent Changes (November 2025)
### Unlimited Licenses & Advanced Data Management
- Added unlimited licenses feature for organizations (superadmin-only)
- Implemented secure role-based analytics with organization-scoped access
- Created comprehensive file management system with upload, download, and sharing
- Built bulk student import from CSV with validation and error reporting
- Added organization data export (students, assessments) in CSV/JSON formats
- Enhanced security with proper access control on all new endpoints
```