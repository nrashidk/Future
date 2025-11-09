# Career Guidance System Design Guidelines

## Design Approach
Reference-Based: Drawing inspiration from engaging education platforms (Duolingo, Quizlet, Khan Academy) combined with sticky notes/bulletin board aesthetics. The design prioritizes playful engagement, visual clarity, and motivation for school students aged 13-18.

## Core Design Principles
1. **Playful Professionalism**: Fun and approachable while maintaining credibility for career guidance
2. **Progressive Disclosure**: Break complex career information into digestible, visual chunks
3. **Gamification**: Use progress indicators, badges, and achievement unlocks to maintain engagement
4. **Inclusivity**: Accessible design that works across diverse student populations and devices

## Typography
- **Primary Font**: Poppins (Google Fonts) - rounded, friendly, modern
- **Secondary Font**: Inter (Google Fonts) - clean readability for body text
- **Hierarchy**: 
  - Hero headlines: 3rem (Poppins Bold)
  - Section titles: 2rem (Poppins SemiBold)
  - Card headers: 1.25rem (Poppins Medium)
  - Body text: 1rem (Inter Regular)
  - Small labels: 0.875rem (Inter Medium)

## Layout System
Use Tailwind spacing primitives: 2, 4, 6, 8, 12, 16 for consistent rhythm
- Card padding: p-6 or p-8
- Section spacing: py-12 or py-16
- Element gaps: gap-4 or gap-6
- Max content width: max-w-6xl for main container

## Component Library

### Landing Page (Pre-Authentication)
**Hero Section** (h-screen with sticky note background):
- Large hero image: Collage-style background featuring diverse students in various career settings (lab coats, tech workspace, art studio, construction site) with semi-transparent overlay
- Centered content with animated sticky notes floating effect
- Primary headline: "Discover Your Future Path" with subtitle explaining the platform
- Two prominent CTAs: "Get Started" (registration) and "Explore as Guest"
- Floating badge: "Trusted by 10,000+ students"

**How It Works Section** (3-column grid on desktop):
- Three sticky note cards with icons, each explaining a step
- Sticky note aesthetic: tilted cards (-2deg, 2deg rotation), drop shadows, handwritten-style icon illustrations
- Step 1: Profile & Interests | Step 2: Country Vision Alignment | Step 3: Career Matches

**Features Showcase** (Masonry grid layout):
- 6-8 feature cards with icons
- Features: "Country Mission Alignment", "Future Skills Mapping", "Job Market Insights", "Personalized Recommendations", "Progress Tracking", "PDF Reports"
- Each card has icon, title, brief description

**CTA Section**:
- Split design: Left side shows student testimonial card, right side has registration form preview
- Final call-to-action encouraging sign-up

### Authentication System
**Registration Modal/Page**:
- Clean, centered form on sticky note card background
- Fields: Name, Email, Password, Country selection
- Social auth buttons: "Continue with Google/GitHub" (using Replit Auth)
- Guest access link at bottom: "Just browsing? Start as guest →"

**Guest Access Banner**:
- Persistent top banner for guest users: "You're in guest mode. Create an account to save your progress!" with quick sign-up button

### Main Application Interface

**Navigation**:
- Top navbar with logo, progress indicator, and profile/settings
- For guests: Prominent "Save Progress - Sign Up" button in navbar

**Progress Dashboard**:
- Visual progress tracker with 7 stages as connected sticky notes on a bulletin board
- Completed stages: Green checkmark stickers
- Current stage: Animated pulse effect
- Locked stages: Grayscale with padlock sticker

**Multi-Step Questionnaire Sections**:

1. **Demographics Card** (Sticky note aesthetic):
   - Form fields on individual sticky note backgrounds
   - Playful icons for each field (birthday cake for age, graduation cap for grade)
   - Character illustration that updates based on inputs

2. **Subject Selection Grid**:
   - 4-column grid (2 on tablet, 1 on mobile)
   - Subject cards as sticky notes with subject-specific colors
   - Checkbox selection with peel-off sticker animation
   - Subjects include icons: Math (calculator), Science (atom), Arts (palette), etc.

3. **Interests & Hobbies**:
   - Similar grid to subjects
   - Categories: Technology, Creative, Helping Others, Problem Solving, Physical Activities, Research, Leadership
   - Interactive selection with flip animation

4. **Personality Quiz**:
   - Question cards that slide in
   - Multiple choice options as sticky note buttons
   - Progress dots at bottom
   - Illustrations for each question scenario

5. **Country Vision Alignment**:
   - Country selector dropdown with flag icons
   - Upon selection, display country mission/vision in decorative panel with national colors accent
   - Visual connection: "Your selected interests align with these national priorities" with connecting lines graphic

6. **Future Skills Mapping**:
   - Display student's profile summary on left
   - Right side shows emerging skills as sticky note clusters
   - Color-coded by category: AI/Tech (blue), Sustainability (green), Creative (purple), Leadership (orange)
   - Connecting dotted lines showing alignment

**Results/Recommendations Page**:

**Career Pathway Cards** (Masonry layout):
- Each career recommendation as an expanded sticky note card
- Card contents:
  - Career title with relevant icon
  - Match score badge (percentage in circular progress)
  - "Country Vision Alignment" indicator with star rating
  - Required skills as small pill tags
  - Future market demand graph (simple bar chart)
  - "Learn More" expandable section
  - Action buttons: "Add to Favorites", "Download Details"

**Alignment Visualization**:
- Circular diagram showing: Student Interests → Required Skills → Country Vision → Future Jobs
- Animated SVG connections highlighting the pathways

**Download Report Section**:
- Preview of PDF report design
- "Download Your Career Roadmap" button with PDF icon
- For guests: "Sign up to download your personalized report"

### Interactive Elements

**Sticky Note Cards**:
- Base: Rounded corners (rounded-lg), drop shadow (shadow-lg)
- Random subtle rotations: rotate-[-2deg], rotate-[1deg]
- Hover: Slight lift (hover:-translate-y-1), increased shadow
- Colors: Yellow (#FFF9C4), Pink (#FCE4EC), Blue (#E3F2FD), Green (#E8F5E9), Purple (#F3E5F5)
- Top-left corner "tape" effect using pseudo-element

**Buttons**:
- Primary: Rounded (rounded-full), gradient background, bold text
- Secondary: Outlined with sticky note color
- Icon buttons with tooltips
- State: No custom hover for buttons on images (use default)

**Form Inputs**:
- Styled as fields on sticky notes
- Focus state: Border highlights, subtle grow animation
- Error state: Red sticky note with shake animation

**Badges & Achievements**:
- Completion badges: Star stickers, trophy icons
- Display in top-right corner with count
- Unlock animation when earned

## Responsive Behavior

**Desktop (lg)**: 
- Multi-column layouts (3-4 columns for grids)
- Sidebar navigation option
- Expanded card details

**Tablet (md)**:
- 2-column grids
- Stacked navigation
- Condensed card details

**Mobile (base)**:
- Single column
- Bottom navigation bar
- Swipeable cards
- Simplified visualizations

## Images

**Hero Section**: 
Large background image (1920x1080) showing diverse students engaged in various activities - studying, using technology, collaborating. Apply 50% opacity overlay to ensure text readability. Buttons on hero use backdrop-blur effect.

**Section Illustrations**:
- Character illustrations throughout questionnaire (cute, diverse student avatars)
- Career icons for each recommended path (doctor, engineer, artist, etc.)
- Country flag icons in selector

**Background Patterns**:
- Subtle grid pattern mimicking bulletin board cork texture
- Scattered pushpin graphics in corners
- Doodle-style decorative elements (arrows, stars, checkmarks)

## Accessibility
- WCAG AA contrast ratios maintained
- Keyboard navigation support
- Screen reader labels for all interactive elements
- Focus indicators on all form fields and buttons
- Alt text for all images and icons