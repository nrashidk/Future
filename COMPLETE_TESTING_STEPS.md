# Complete Testing Steps - Future Pathways Career Guidance System

## How to Access the App

**Full URL:** `https://46781757-2995-4279-9668-5cbf554ead29-00-220qzw862p5vg.riker.replit.dev`

**Login Page:** Add `/login/student` to the end of your URL

---

## Test Accounts

All accounts use password: `test123`

1. **Basic Student** - Username: `teststudent` (Free tier)
2. **Premium User** - Username: `premiumuser` (Premium features unlocked)
3. **Admin User** - Username: `adminuser` (School admin panel)

---

# 🎓 PERSONA 1: BASIC STUDENT (Free Tier)

**Goal:** Test the free basic assessment flow without payment

## Step-by-Step Instructions

### 1. Login
- Go to: `YOUR-URL/login/student`
- Username: `teststudent`
- Password: `test123`
- Click "Login"

### 2. You Should Land On
- **Expected Page:** `/assessment` (Assessment page)
- **What You See:** Start assessment button

### 3. Start Assessment
- Click "Start Assessment" or "Begin Assessment"
- You'll be asked to choose Individual or Group

### 4. Choose Assessment Type
- Click **"Individual Assessment"**
- **Expected:** Should go directly to assessment questions (NO payment page for basic users)
- **What to Fill:**
  - Demographics (name, age, grade, country)
  - Subjects you like
  - Interests
  - Personality questions (RIASEC)
  - Country vision questions
  - Your aspirations

### 5. Complete Assessment
- Answer all questions honestly
- Click "Submit" at the end

### 6. View Results
- **Expected Page:** `/results`
- **What You See:**
  - Top 5 career recommendations
  - Match percentages
  - Basic insights (NO premium features like learning styles, detailed WEF skills)
  
### 7. What You CANNOT See (Premium Only)
- ❌ Learning style analysis (Kolb)
- ❌ Detailed WEF 16 skills breakdown
- ❌ PDF report download
- ❌ Subject competency quiz

---

# 💎 PERSONA 2: PREMIUM USER (Paid Individual Assessment)

**Goal:** Test the full premium assessment with all features

## Step-by-Step Instructions

### 1. Login
- Go to: `YOUR-URL/login/student`
- Username: `premiumuser`
- Password: `test123`
- Click "Login"

### 2. You Should Land On
- **Expected Page:** `/assessment` (Assessment page)
- **What You See:** Start assessment button

### 3. Start Assessment
- Click "Start Assessment"
- Choose **"Individual Assessment"**

### 4. Payment Page (Already Paid)
- **Expected:** Should see checkout page
- **What Happens:** Since `premiumuser` has already paid (premium tier is set in database), you should be able to proceed
- **If asked for payment:** This is a test account, so it should already have premium access

### 5. Complete Full Assessment
Fill out all sections:

**a) Demographics**
- Full name
- Age
- Grade (8-12)
- Country (choose UAE for quiz questions)

**b) Subject Preferences**
- Rate subjects 1-5 stars
- Select your favorite subjects

**c) Interests**
- Describe what you enjoy doing
- Your hobbies and passions

**d) RIASEC Personality Test**
- 30 questions about work preferences
- Rate from "Strongly Disagree" to "Strongly Agree"

**e) Learning Style Assessment (PREMIUM)**
- 24 questions about how you learn
- Determines: Diverging, Assimilating, Converging, or Accommodating

**f) Personal Values (CVQ) (PREMIUM)**
- 21 questions about what matters to you
- Helps align careers with your values

**g) Subject Competency Quiz (PREMIUM - UAE Only)**
- 20 questions across 6 subjects
- Tests your actual knowledge
- **Note:** Only available for UAE, others see "Coming soon"

**h) Country Vision Alignment**
- Questions about national development goals
- Links your aspirations to country priorities

**i) Career Aspirations**
- Write about your dream job
- Your goals for the future

### 6. View Premium Results
- **Expected Page:** `/results`
- **What You See:**
  - ✅ Top 5 career recommendations with detailed match breakdown
  - ✅ **Learning Style Analysis** (your Kolb style with study tips)
  - ✅ **WEF 16 Skills Profile** (detailed breakdown of future-ready skills)
  - ✅ **Subject Competency Scores** (if you took the quiz)
  - ✅ **Vision Alignment Details**
  - ✅ **Download PDF Report** button

### 7. Download PDF Report
- Click "Download Report" button
- **Expected:** PDF downloads showing:
  - Personal profile
  - All assessment results
  - Career recommendations with explanations
  - Learning style analysis
  - WEF skills breakdown
  - Research methodology

### 8. Check Your Profile
- Look for your learning style insights
- View your WEF skills radar chart
- See which careers align with your skills

---

# 👨‍💼 PERSONA 3: ADMIN USER (School Administrator)

**Goal:** Test organization management and bulk student creation

## Step-by-Step Instructions

### 1. Login
- Go to: `YOUR-URL/login/student`
- Username: `adminuser`
- Password: `test123`
- Click "Login"

### 2. You Should Land On
- **Expected Page:** `/admin/organizations` (Admin dashboard)
- **What You See:**
  - Organization management panel
  - Student roster
  - Create organization button

### 3. Create a New Organization
- Click "Create Organization" or "New School"
- **Fill in:**
  - Organization Name: "Test High School"
  - Total Licenses: 50 (number of students you can add)
- Click "Create"

### 4. Select Your Organization
- From dropdown, select "Test High School"
- **You'll see:**
  - Student roster (empty at first)
  - Used licenses: 0/50
  - Add student buttons

### 5. Add Individual Student
- Click "Add Student"
- **Fill in:**
  - Full Name: "John Smith"
  - Grade: 10
  - Student ID: "12345" (optional)
  - Password Complexity: Choose "Easy" for testing
- Click "Create Student"
- **Expected:** Username auto-generated (e.g., `johnsmith` or `johnsmith2` if duplicate)

### 6. View Student Credentials
- After creation, you'll see:
  - Username (auto-generated)
  - Password (visible once, for you to give to student)
- **Important:** Copy these credentials to give to the student

### 7. Bulk Upload Students
- Click "Bulk Upload" or "Upload CSV"
- **Upload a CSV file with format:**
  ```
  fullName,grade,studentId
  Jane Doe,11,67890
  Mike Johnson,9,11111
  Sarah Williams,12,22222
  ```
- Click "Upload"
- **Expected:** All students created at once with auto-generated usernames

### 8. Download Credentials
- Click "Download Credentials" button
- **Expected:** CSV file downloads with:
  - Student names
  - Auto-generated usernames
  - Passwords
  - Grades
- **Use this file to distribute login info to students**

### 9. Monitor Student Progress
- View roster table showing:
  - Student names
  - Usernames
  - Grades
  - Assessment completion status
  - Lock status (locked after completing assessment)

### 10. Reset Student Password (if needed)
- Find student in roster
- Click "Reset Password"
- Enter new password
- Give new credentials to student

### 11. Check Quota Usage
- Monitor "Used Licenses" counter
- **Example:** If you added 5 students, it shows "5/50"
- **Limit:** Cannot add more students than your total licenses

### 12. Delete Student (Before Assessment)
- Students can only be deleted if they haven't completed assessment
- Click "Delete" next to student name
- Confirm deletion
- **Note:** Locked students (who completed assessment) cannot be deleted

---

## Common Issues & Solutions

### Issue 1: "Stuck on Individual vs Group page"
**Solution:** This is now fixed! Basic users should proceed directly to assessment, premium users go to checkout.

### Issue 2: "Payment errors when clicking Individual"
**Solution:** Fixed! The system now correctly handles both Replit Auth and username/password users.

### Issue 3: "Cannot see premium features"
**Solution:** Make sure you're logged in as `premiumuser` (not `teststudent`). Only premium accounts see learning styles, WEF skills, and PDF download.

### Issue 4: "Admin redirects to assessment instead of admin panel"
**Solution:** Fixed! Admin users now land on `/admin/organizations` after login.

### Issue 5: "Quiz not available"
**Solution:** Subject competency quiz is only available for UAE curriculum. Other countries show "Coming soon" with a skip option.

---

## What Each Persona Should Experience

| Feature | Basic Student | Premium User | Admin |
|---------|--------------|--------------|-------|
| Login with username/password | ✅ | ✅ | ✅ |
| Basic demographics | ✅ | ✅ | N/A |
| Subject preferences | ✅ | ✅ | N/A |
| RIASEC personality test | ✅ | ✅ | N/A |
| Learning style assessment | ❌ | ✅ | N/A |
| Personal values (CVQ) | ❌ | ✅ | N/A |
| Subject competency quiz | ❌ | ✅ (UAE only) | N/A |
| Career recommendations | ✅ (basic) | ✅ (detailed) | N/A |
| WEF 16 skills profile | ❌ | ✅ | N/A |
| PDF report download | ❌ | ✅ | N/A |
| Manage organizations | ❌ | ❌ | ✅ |
| Create students | ❌ | ❌ | ✅ |
| Bulk upload | ❌ | ❌ | ✅ |
| Download credentials | ❌ | ❌ | ✅ |

---

## Key Points to Test

### For Basic Student:
1. ✅ Can login successfully
2. ✅ Lands on `/assessment` page
3. ✅ Can complete basic assessment without payment
4. ✅ Gets career recommendations
5. ❌ Does NOT see premium features

### For Premium User:
1. ✅ Can login successfully
2. ✅ Lands on `/assessment` page
3. ✅ Can access ALL assessment components
4. ✅ Sees learning style analysis in results
5. ✅ Sees WEF skills breakdown
6. ✅ Can download PDF report

### For Admin:
1. ✅ Can login successfully
2. ✅ Lands on `/admin/organizations` page
3. ✅ Can create organizations
4. ✅ Can add individual students
5. ✅ Can bulk upload students
6. ✅ Can download credentials
7. ✅ Can monitor student progress
8. ✅ Quota tracking works correctly

---

## Need Help?

If you encounter any issues:
1. Check the browser console (F12 → Console tab)
2. Check if you're using the correct test account
3. Make sure you're logged in (check top-right corner)
4. Try refreshing the page
5. If payment errors occur, check server logs for details

---

**Happy Testing!** 🚀
