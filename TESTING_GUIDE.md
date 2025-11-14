# Future Pathways Testing Guide

This guide explains how to test different user roles and assessment tiers in the Future Pathways career guidance system.

## Testing User Roles

### 1. Testing as a Guest User (Free Tier)

**Steps:**
1. Open the application in an **incognito/private browser window**
2. Click "Start Your Journey" or "Get Started" on the landing page
3. Complete the assessment without logging in
4. You will receive:
   - ✅ Basic career recommendations (5 careers)
   - ✅ Subject competency quiz results
   - ✅ PDF report download
   - ❌ No learning style assessment (Kolb)
   - ❌ No personality assessment (RIASEC)
   - ❌ No values questionnaire (CVQ)

**What to Test:**
- Assessment flow works without authentication
- Quiz questions appear and can be submitted
- Results page displays correctly
- PDF download works
- "Upgrade" prompts appear for premium features

---

### 2. Testing as a Regular User (Paid Individual Assessment)

**Steps:**
1. **Sign up with Replit Auth:**
   - Click "Sign In" button in header
   - Authenticate with your Replit account
   - You'll be redirected back to the app

2. **Start Individual Assessment ($10):**
   - Click "Start Your Journey"
   - Select "Individual Assessment"
   - Complete payment via Stripe test card:
     ```
     Card Number: 4242 4242 4242 4242
     Expiry: Any future date (e.g., 12/25)
     CVC: Any 3 digits (e.g., 123)
     ZIP: Any 5 digits (e.g., 12345)
     ```
   - Complete the full assessment including:
     - Demographics
     - Subjects & Interests
     - Learning Style (24 questions - Kolb)
     - Personality (30 questions - RIASEC)
     - Values Questionnaire (21 questions - CVQ)
     - Country Vision alignment
     - Subject Competency Quiz

3. **View Premium Results:**
   - See all career recommendations with detailed insights
   - View WEF Skills Framework analysis (16 future-ready skills)
   - Download comprehensive PDF report with:
     - Learning style analysis
     - Personality insights (RIASEC)
     - Values alignment
     - Subject competency breakdown
     - Research citations

**What to Test:**
- Stripe payment flow works
- All assessment components appear
- WEF skills calculation happens automatically
- Premium insights are visible on results page
- PDF includes all premium content

---

### 3. Testing as a School Admin (Group Assessment)

**Prerequisites:**
- You need **super admin** access first (see section 4)

**Steps:**
1. **Log in as Super Admin** (Replit Auth)

2. **Navigate to Admin Dashboard:**
   - Click "Admin" in the navigation menu
   - Go to `/admin/organizations`

3. **Create an Organization:**
   - Click "Create Organization"
   - Fill in:
     - Organization Name: "Test School"
     - Total Licenses: 10 (number of student accounts)
   - Pay via Stripe test card (Group Assessment pricing)
   - Click "Create Organization"

4. **Add Students to Organization:**

   **Option A: Manual Creation**
   - Click "Add Student"
   - Fill in: Full Name, Grade, Student ID (optional)
   - Click "Create Account"
   - Download credentials (username + password)

   **Option B: Bulk Upload**
   - Click "Bulk Upload Students"
   - Upload CSV file with format:
     ```csv
     fullName,grade,studentId
     John Smith,grade10,STU001
     Jane Doe,grade11,STU002
     ```
   - Click "Upload"
   - Download all credentials

5. **Test Student Login:**
   - **Open incognito window**
   - Go to `/login/student`
   - Enter username and password from downloaded credentials
   - Complete assessment as a student
   - Student assessment is automatically marked as "Individual" tier

**What to Test:**
- Organization creation and payment
- Student account creation (manual and bulk)
- Credentials download
- Student login at `/login/student`
- Assessment quota tracking (used licenses vs total)
- Account locking after assessment completion
- Admin can view student roster

---

### 4. Testing as a Super Admin

**How to Become Super Admin:**

**Option 1: Database Update (Recommended for Development)**
```sql
-- Run this in the database pane after creating a user via Replit Auth
UPDATE users 
SET is_super_admin = true 
WHERE replit_user_id = 'your-replit-user-id';
```

To find your Replit User ID:
1. Sign in with Replit Auth
2. Check the server logs for your user ID, or
3. Query the database:
   ```sql
   SELECT id, replit_user_id, username, is_super_admin 
   FROM users 
   WHERE username = 'your-replit-username';
   ```

**Option 2: Environment Variable (Initial Setup)**
- Add your Replit username to a list of super admins in the code
- This is handled automatically on first login

**Super Admin Capabilities:**
- Access `/admin/organizations` dashboard
- Create and manage organizations
- View all organizations and their students
- Create student accounts (manual and bulk)
- Download student credentials
- View analytics and statistics
- Cannot be a local (username-based) user

**What to Test:**
- Admin navigation menu appears
- Organization CRUD operations
- Student management
- Bulk upload functionality
- Quota enforcement
- Analytics dashboard

---

## Assessment Tier Comparison

| Feature | Free (Guest) | Individual ($10) | Group (School) |
|---------|-------------|------------------|----------------|
| Basic Recommendations | ✅ | ✅ | ✅ |
| Subject Quiz | ✅ | ✅ | ✅ |
| Kolb Learning Styles | ❌ | ✅ | ✅ |
| RIASEC Personality | ❌ | ✅ | ✅ |
| CVQ Values | ❌ | ✅ | ✅ |
| WEF Skills Analysis | ❌ | ✅ | ✅ |
| PDF Report | ✅ (Basic) | ✅ (Full) | ✅ (Full) |
| Save Progress | ❌ | ✅ | ✅ |

---

## Stripe Test Cards

Use these test cards for payment testing:

```
✅ Success:
Card: 4242 4242 4242 4242
Expiry: Any future date
CVC: Any 3 digits

❌ Declined:
Card: 4000 0000 0000 0002

⏳ Authentication Required (3D Secure):
Card: 4000 0027 6000 3184
```

---

## Common Testing Workflows

### Workflow 1: Guest to Paid User
1. Complete assessment as guest
2. See "Upgrade" prompts
3. Click "Create Free Account"
4. Sign in with Replit Auth
5. Guest data automatically migrates
6. Purchase individual assessment
7. Complete premium components

### Workflow 2: School Bulk Assessment
1. Admin creates organization with 20 licenses
2. Admin bulk uploads 20 students
3. Admin downloads credentials sheet
4. Students log in at `/login/student`
5. Each student completes assessment
6. Admin tracks completion progress
7. Quota updates automatically (20/20 used)

### Workflow 3: Student Password Reset
1. Admin navigates to organization roster
2. Finds student account
3. Clicks "Reset Password"
4. Downloads new credentials
5. Provides new password to student

---

## Important URLs

- **Landing Page:** `/`
- **Assessment Start:** `/assessment`
- **Student Login:** `/login/student`
- **Results:** `/results`
- **Admin Dashboard:** `/admin/organizations` (Super Admin only)
- **Analytics:** `/analytics` (Super Admin only)

---

## Troubleshooting

### Issue: "Unauthorized" error
- **Solution:** Clear cookies and localStorage, then log in again

### Issue: PDF won't download
- **Solution:** Check browser popup blocker settings

### Issue: Can't access admin dashboard
- **Solution:** Verify you're logged in with Replit Auth AND have `is_super_admin = true` in database

### Issue: Student can't log in
- **Solution:** Verify username/password match downloaded credentials exactly (case-sensitive)

### Issue: Guest assessment not migrating
- **Solution:** Complete assessment before signing up, keep same browser session

---

## Database Queries for Testing

```sql
-- View all users
SELECT id, username, is_super_admin, created_at FROM users;

-- View all organizations
SELECT * FROM organizations;

-- View organization students
SELECT * FROM organization_members WHERE organization_id = 'org-id';

-- Check assessment tier
SELECT id, name, assessment_type FROM assessments;

-- View WEF competency results
SELECT * FROM wef_competency_results WHERE assessment_id = 'assessment-id';

-- Reset user to super admin
UPDATE users SET is_super_admin = true WHERE id = 'user-id';
```
