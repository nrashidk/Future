# User Flows & Profile Features Documentation

## Profile Page Summary

### Location
- **URL**: `/profile`
- **Accessible from**: All major pages (Landing, Analytics, Admin, AdminOrganizations, Profile)
- **Navigation**: "Profile" button appears in header when user is logged in

## User Type 1: Organization Admin (org_admin)

### Profile Features
**Account Information Card:**
- Name: First name + Last name
- Email: Organization admin email
- Username: Admin username
- Organization: Organization name (highlighted in primary color)
- Account Type: Badge showing "Organization Admin" with Users icon

**Premium Status Card:**
- Status: Shows "Premium" badge (org admins are premium by default)
- Total Licenses (Organization): Total licenses purchased
- Used Licenses (Organization): Number of licenses currently assigned to students
- Remaining Licenses (Organization): Available licenses for new students
- Total Students: Number of students in the organization
- Completed Assessments: Number of students who finished assessments
- Pending Assessments: Number of students who haven't completed yet

**Organization Management Card:**
- "Go to Admin Dashboard" button → Links to `/admin/organizations`

**No Assessment History**: Org admins don't see their own assessments on profile

### Complete Workflow: Organization Admin Purchase & Setup

#### Step 1: Purchase Group Licenses
1. Go to Landing page (/)
2. Click "Get Started" → Redirects to Replit Auth login
3. After login, redirected to `/assessment`
4. Select "Group Assessment (Schools/Organizations)" tier
5. Redirected to `/group-pricing`
6. Enter number of licenses (e.g., 100)
7. Fill organization details
8. Complete Stripe checkout
9. Organization and admin account created automatically

#### Step 2: Login to Admin Dashboard
1. Admin logs in via Replit Auth
2. Access profile at `/profile`
3. Click "Go to Admin Dashboard" button
4. Arrives at `/admin/organizations`

#### Step 3: Create Student Accounts
**Option A: Manual Creation (1 at a time)**
1. Select organization from list
2. Click "+" button to add member
3. Fill in:
   - First Name
   - Last Name
   - Grade (8, 9, 10, 11, 12)
   - Student ID (optional)
   - Password Complexity (easy/medium/strong)
4. System auto-generates username (e.g., `student001`)
5. System auto-generates password based on complexity
6. Click "Create Member"
7. Download credentials (username + password) for the student

**Option B: Bulk Upload (CSV)**
1. Click "Bulk Upload" button
2. Download CSV template
3. Fill in student details (firstName, lastName, grade, studentId)
4. Upload CSV file
5. System creates all students at once with auto-generated credentials
6. Download credentials CSV file for all students

#### Step 4: Distribute Credentials
1. Download credentials file (individual or bulk)
2. Give each student their username and password
3. Direct students to `/login/student` page

#### Step 5: Monitor Progress
1. Return to `/profile`
2. View organization statistics:
   - Total licenses: 100
   - Used licenses: Number of students created
   - Remaining licenses: Licenses available
   - Completed assessments: Students who finished
   - Pending assessments: Students who started but didn't finish

### Available Actions from Profile
- **View organization stats**: See license usage and assessment completion
- **Go to Admin Dashboard**: Manage students and view detailed organization data
- **Navigate to Home**: Return to landing page
- **Navigate to Analytics**: View system-wide analytics

---

## User Type 2: Paid Individual User (isPremium: true, accountType: 'individual')

### Profile Features
**Account Information Card:**
- Name: First name + Last name
- Email: User email
- Account Type: Badge showing "Individual Account" with User icon

**Premium Status Card:**
- Status: "Premium" badge with crown icon
- Purchased Licenses: Number of licenses bought (e.g., 1, 5, 10)
- Used Licenses: Number of assessments completed
- Remaining Licenses: Licenses available for new assessments
- **Action Buttons**:
  - If remaining > 0: "Start Premium Assessment" → `/assessment`
  - If remaining === 0: "Purchase More Licenses" → `/tier-selection`

**My Assessment History Card:**
- Shows all completed assessments
- Each assessment displays:
  - Name/title
  - Date created
  - Tier (Premium vs Free)
  - Status badge (Completed)

### Complete Workflow: Paid Individual User

#### Step 1: Purchase License
1. Visit Landing page (/)
2. Click "Get Started" → Replit Auth login
3. Redirected to `/assessment` after login
4. Select "Individual Assessment" tier
5. Redirected to `/tier-selection`
6. Choose number of licenses (1, 5, or 10)
7. Click "Continue to Checkout"
8. Redirected to `/checkout`
9. Complete Stripe payment
10. After payment: `isPremium` set to `true`, licenses added to account

#### Step 2: Take Premium Assessment
1. From profile or landing, click "Start Premium Assessment"
2. Redirected to `/assessment`
3. Complete 8-step Premium assessment flow:
   - Demographics (name, age, grade, gender)
   - Subjects (select favorite subjects)
   - Country (select country)
   - Quiz (20 subject competency questions) — **SAVED HERE**
   - Learning Style (24 Kolb questions)
   - Career Personality (30 RIASEC questions)
   - Personal Values (21 CVQ items)
   - Aspirations (career goals, strengths) — **SAVED + GENERATES RECOMMENDATIONS**

#### Step 3: View Results
1. After completing all 8 steps, automatically redirected to `/results`
2. View personalized career recommendations based on:
   - Subject competencies
   - Learning style (Kolb)
   - Career personality (RIASEC)
   - Personal values (CVQ)
   - Country vision alignment
   - WEF 16 Skills profile
3. Download PDF report with full analysis

#### Step 4: Track Progress
1. Go to `/profile`
2. View license usage:
   - Purchased: 5 licenses
   - Used: 2 assessments completed
   - Remaining: 3 licenses available
3. View assessment history with all completed assessments

#### Step 5: Purchase Additional Licenses
1. If all licenses used, click "Purchase More Licenses"
2. Redirected to `/tier-selection`
3. Select new license pack
4. Complete checkout
5. New licenses added to existing count

### Available Actions from Profile
- **Start Premium Assessment**: Begin new assessment if licenses available
- **Purchase More Licenses**: Buy additional licenses when needed
- **View Assessment History**: See all completed assessments
- **Navigate to Home**: Return to landing page
- **Navigate to Analytics**: View system-wide analytics

---

## Navigation Consistency

### Pages with Profile Button
All major pages now include a "Profile" button in the header when user is logged in:

1. **Landing (/)**: Analytics + Profile buttons
2. **Analytics (/analytics)**: Home + Profile buttons
3. **Profile (/profile)**: Home button only (already on profile)
4. **Admin (/admin)**: Home + Profile buttons
5. **AdminOrganizations (/admin/organizations)**: Quiz Questions + Home + Profile buttons

### Common Navigation Elements
- **Logo/Brand**: Clickable "Future Pathways" logo → Returns to `/`
- **Analytics**: Available from most pages
- **Profile**: Visible when logged in, accessible from all pages
- **Home**: Quick return to landing page

---

## Key Differences Between User Types

| Feature | Organization Admin | Paid Individual |
|---------|-------------------|-----------------|
| Profile Location | `/profile` | `/profile` |
| Premium Status | Auto-premium | Purchased |
| License Tracking | Organization-wide | Personal |
| Assessment History | Not shown | Shown |
| Management Access | Admin Dashboard | None |
| Student Creation | Yes | No |
| Assessment Taking | No (creates for others) | Yes |
| License Purchase | Group (bulk) | Individual (1/5/10) |

---

## Test Credentials

### Organization Admin
- **Username**: `schooladmin`
- **Password**: `Admin123!`
- **Organization**: Test High School
- **Total Licenses**: 50
- **Access**: Full admin dashboard at `/admin/organizations`

### Test Individual User
- **Username**: `teststudent`
- **Password**: `Welcome123`
- **Account Type**: Individual
- **Premium Status**: Yes (purchased)
- **Access**: Personal profile and assessments

---

## Navigation Flow Diagram

```
Landing (/)
├─ Analytics Button → /analytics
├─ Profile Button (if logged in) → /profile
└─ Get Started → Replit Auth Login
   ├─ New User → /tier-selection
   │  ├─ Individual → /checkout → /assessment
   │  └─ Group → /group-pricing → /checkout → /admin/organizations
   └─ Existing User → /assessment

Profile (/profile)
├─ Home Button → /
├─ Org Admin Actions
│  └─ Admin Dashboard → /admin/organizations
│     ├─ Create Students (manual/bulk)
│     ├─ View Organization Stats
│     └─ Navigate: Quiz Questions (/admin) | Home (/) | Profile (/profile)
└─ Individual Actions
   ├─ Start Assessment → /assessment
   ├─ Purchase More → /tier-selection
   └─ View History (on profile)

Assessment (/assessment)
├─ Free Flow (7 steps) → Quiz → Results
└─ Premium Flow (8 steps) → Quiz → Kolb → RIASEC → CVQ → Results

Admin Dashboard (/admin/organizations)
├─ Quiz Questions Button → /admin
├─ Home Button → /
└─ Profile Button → /profile
```

---

## Summary

Both user types now have:
✅ Dedicated profile page at `/profile`
✅ Profile button accessible from all major pages (Landing, Analytics, Admin, AdminOrganizations)
✅ Clear indication of premium status and license availability
✅ Appropriate action buttons for their user type
✅ Consistent navigation across the application
✅ Complete workflows documented for purchase → usage → monitoring
