# Future Pathways - Career Guidance System

## Overview
Future Pathways is a comprehensive career guidance system designed specifically for school students aged 13-18. The application uses a beautiful sticky notes design aesthetic to make career exploration engaging and fun while providing intelligent alignment between student interests, country vision/mission, future skills needs, and job market opportunities.

## Purpose
- Help students discover career paths that match their interests and strengths
- Align student career choices with their country's national development goals
- Provide insights into future job market trends and skill requirements
- Make career planning accessible and engaging for young students

## Current State
The application is fully functional with:
- Complete user authentication system (Replit Auth + Guest access)
- Multi-step career assessment questionnaire
- Intelligent career matching algorithm
- Country-specific career recommendations
- Database integration with PostgreSQL
- Beautiful sticky notes UI optimized for students

## Recent Changes
**November 9, 2025 - Latest Updates**
- **Security Enhancements**:
  - Implemented PDF report authorization (validates ownership before download)
  - Secured guest-to-registered migration with session validation
  - Added stop words filtering and phrase-level matching to mission/vision algorithm
- **PDF Generation**: Complete PDF report generation with student profile, recommendations, match breakdowns, and next steps
- **Guest Migration**: Secure flow to migrate guest assessments to registered accounts upon sign-up
- **Improved Matching Algorithm**:
  - Enhanced country vision alignment to use both priority sectors AND national goals
  - Filters stop words and generic terms
  - Supports phrase-level and partial matching
  - Balanced adjustment scoring (-1 to +2 points impact)
  - Prevents false positives from substring matches

**Initial Implementation**
- Created complete database schema with users, assessments, countries, skills, careers, job market trends, and recommendations tables
- Implemented Replit Auth with guest session support
- Built all frontend components using sticky notes design system
- Created intelligent matching algorithm that scores careers based on:
  - Subject alignment (30%)
  - Interest alignment (30%)
  - Country vision alignment (20%)
  - Future market demand (20%)
- Seeded database with 4 countries (UAE, USA, UK, India) and 10 career paths
- Generated job market trends data for each career-country combination

## User Preferences
- Design: Playful, student-friendly sticky notes aesthetic with vibrant colors
- Target audience: School students aged 13-18
- Key features: Guest access for exploration, easy registration to save progress

## Project Architecture

### Frontend (/client)
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with custom sticky notes design tokens
- **State Management**: TanStack Query for server state
- **Routing**: Wouter for lightweight client-side routing
- **Key Components**:
  - `Landing.tsx`: Hero page with value proposition and CTAs
  - `Assessment.tsx`: Multi-step questionnaire flow
  - `Results.tsx`: Career recommendations display
  - `StickyNote.tsx`: Reusable sticky note component
  - Assessment steps: Demographics, Subjects, Interests, Personality, Country, Aspirations

### Backend (/server)
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL (Neon)
- **ORM**: Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect)
- **Session Storage**: PostgreSQL-backed sessions

### Database Schema
- `users`: User profiles from Replit Auth
- `sessions`: Auth session storage
- `countries`: Country data with mission/vision
- `skills`: Future skills taxonomy
- `careers`: Career descriptions and requirements
- `job_market_trends`: Country-specific job market data
- `assessments`: Student assessment responses
- `recommendations`: Generated career recommendations with match scores

### Key Algorithms
1. **Career Matching Engine** (`server/routes.ts`):
   - Calculates subject match score based on overlap
   - Analyzes interest alignment with career categories
   - Scores country vision alignment using job market trends
   - Evaluates future market demand scores
   - Generates personalized reasoning for each recommendation

2. **Smart Recommendations**:
   - Only recommends careers with >40% overall match
   - Returns top 5 matches sorted by overall score
   - Provides actionable next steps for each career

## API Endpoints

### Authentication
- `GET /api/login`: Initiate OAuth login flow
- `GET /api/logout`: Logout and clear session
- `GET /api/callback`: OAuth callback handler
- `GET /api/auth/user`: Get current authenticated user

### Countries
- `GET /api/countries`: Get all countries
- `GET /api/countries/:id`: Get country details with mission/vision

### Assessments
- `POST /api/assessments`: Create new assessment (guest or authenticated)
- `GET /api/assessments/my`: Get user's assessments (authenticated only)
- `PATCH /api/assessments/:id`: Update assessment

### Recommendations
- `POST /api/recommendations/generate/:assessmentId`: Generate career recommendations
- `GET /api/recommendations?assessmentId=xxx`: Get recommendations with career details
- `GET /api/recommendations/pdf/:assessmentId`: Download PDF report (requires ownership)

### Careers
- `GET /api/careers`: Get all available careers

### Migration
- `POST /api/assessments/migrate`: Migrate guest assessments to authenticated user (requires guestSessionId)

## Design System

### Colors
- Sticky Yellow: `hsl(48 100% 88%)`
- Sticky Pink: `hsl(340 100% 95%)`
- Sticky Blue: `hsl(207 100% 94%)`
- Sticky Green: `hsl(120 60% 95%)`
- Sticky Purple: `hsl(280 60% 96%)`
- Primary: Purple gradient (`hsl(260 65% 55%)`)
- Accent: Warm yellow (`hsl(35 85% 88%)`)

### Typography
- Headings: Poppins (friendly, rounded)
- Body text: Inter (clean, readable)

### Components
- Sticky notes with subtle rotations (-2° to 2°)
- Drop shadows for depth
- Tape effect at top of sticky notes
- Hover and active state elevations
- Smooth transitions and animations

## User Journey

### Guest Flow
1. Land on homepage → See value proposition
2. Click "Explore as Guest"
3. Complete 6-step assessment
4. View personalized career recommendations
5. Prompted to sign up to save results

### Registered User Flow
1. Land on homepage → Click "Get Started"
2. OAuth login via Replit
3. Complete assessment (saves automatically)
4. View recommendations
5. Download PDF report
6. Access saved assessments anytime

## Future Enhancements
- Mentor matching system
- Educational pathway mapper with universities/courses
- Teacher collaboration features
- Real-time job market API integration
- Scholarship finder
- School analytics dashboard

## Technical Notes
- Database migrations: Use `npm run db:push` (never manual SQL)
- Session storage: PostgreSQL-backed for reliability
- Guest sessions: Tracked via sessionID, can be migrated to user account
- Seeding: Runs automatically in development on startup
