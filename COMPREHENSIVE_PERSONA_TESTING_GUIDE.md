# Comprehensive Persona Testing Guide
## Future Pathways Career Guidance System

This guide provides complete testing flows for **all user personas** and ensures each persona is redirected to the correct page after login, checkout, or other key actions.

---

## 📋 Table of Contents
1. [Prerequisites & Test Setup](#prerequisites--test-setup)
2. [Persona Overview](#persona-overview)
3. [Persona 1: Guest User (Not Logged In)](#persona-1-guest-user-not-logged-in)
4. [Persona 2: OAuth Student (Replit Auth - Free Tier)](#persona-2-oauth-student-replit-auth---free-tier)
5. [Persona 3: OAuth Student (Replit Auth - Premium Upgrade)](#persona-3-oauth-student-replit-auth---premium-upgrade)
6. [Persona 4: Local Student (Username Login - Individual Purchase)](#persona-4-local-student-username-login---individual-purchase)
7. [Persona 5: Organization Admin (Group Purchase)](#persona-5-organization-admin-group-purchase)
8. [Persona 6: Organization Student (Created by Admin)](#persona-6-organization-student-created-by-admin)
9. [Persona 7: Super Admin (Replit Auth)](#persona-7-super-admin-replit-auth)
10. [Edge Cases & Error Scenarios](#edge-cases--error-scenarios)
11. [Page Redirect Matrix](#page-redirect-matrix)
12. [Post-Testing Checklist](#post-testing-checklist)

---

## Prerequisites & Test Setup

### Before Testing
- ✅ Application running (`npm run dev`)
- ✅ Database seeded and accessible
- ✅ Stripe configured with test keys
- ✅ Browser with clean session (or incognito mode)

### Stripe Test Cards
| Scenario | Card Number | Expiry | CVC |
|----------|-------------|--------|-----|
| **Success** | `4242 4242 4242 4242` | `12/34` | `123` |
| **Declined** | `4000 0000 0000 0002` | Any future | Any |
| **Insufficient Funds** | `4000 0000 0000 9995` | Any future | Any |

### Test Data Tracking
Keep a spreadsheet or note of all created accounts:
```
Email | Username | Password | Type | Organization | Expected Redirect
```

---

## Persona Overview

| Persona | Auth Type | Tier | Created By | Login Page | Post-Login Redirect |
|---------|-----------|------|------------|------------|---------------------|
| **Guest** | None | Free | Self | N/A | N/A (Prompted to save) |
| **OAuth Student (Free)** | Replit Auth | Free | Self | `/api/login` | `/` (or returnTo) |
| **OAuth Student (Premium)** | Replit Auth | Premium | Self (upgrade) | `/api/login` | `/` (or returnTo) |
| **Local Student (Individual)** | Username/Password | Premium | Self (checkout) | `/login/student` | `/assessment` |
| **Org Admin** | Username/Password | Premium | Self (group checkout) | `/login/student` | `/admin/organizations` |
| **Org Student** | Username/Password | Premium | Admin created | `/login/student` | `/assessment` |
| **Super Admin** | Replit Auth | N/A | System | `/api/login` | `/admin` |

---

## Persona 1: Guest User (Not Logged In)

**Goal:** Test free tier assessment without login

### Flow A: Complete Free Assessment
1. **Navigate to homepage** (`/`)
2. Click **"Start Free Assessment"** or **"Get Started"**
3. ✅ **Expected:** Redirected to `/tier-selection`

4. **Select Free Tier**
   - Click **"Start Assessment"** under Free tier
   - ✅ **Expected:** Redirected to `/assessment`

5. **Complete Assessment Steps**
   - Demographics ✅
   - Subject Preferences ✅
   - Interests (lexicon-based) ✅
   - RIASEC Personality ✅
   - Country Vision ✅
   - Aspirations ✅

6. **View Results**
   - ✅ **Expected:** Redirected to `/results`
   - ✅ **Expected:** See career recommendations (Basic matching: Subjects 35%, Interests 35%, Vision 30%)
   - ✅ **Expected:** See banner: "Create an account to save your results"

7. **Attempt to Save Results**
   - Click "Save Results" or similar
   - ✅ **Expected:** Modal appears prompting login/register
   - ✅ **Expected:** Data stored in `localStorage` under `guestAssessments` and `guestSessionId`

### Flow B: Guest Attempts Premium Features
1. Try to access premium-only content (e.g., detailed PDF report)
2. ✅ **Expected:** Modal: "Upgrade to Premium to access this feature"
3. Click **"Upgrade Now"**
4. ✅ **Expected:** Redirected to `/tier-selection`

---

## Persona 2: OAuth Student (Replit Auth - Free Tier)

**Goal:** Login via Replit Auth, migrate guest data, complete free assessment

### Test Flow
1. **Start as Guest** (complete Persona 1 Flow A first)
2. **Click "Login with Replit"** (or navigate to `/api/login`)
3. ✅ **Expected:** Redirected to Replit Auth page

4. **Complete Replit Auth**
   - Login with Replit credentials
   - ✅ **Expected:** Redirected to `/auth/callback`

5. **Auth Callback Processing**
   - System detects `guestAssessments` in `localStorage`
   - System migrates guest data to user account
   - ✅ **Expected:** Toast: "Welcome! Your assessment has been saved to your account."
   - ✅ **Expected:** Redirected to `/results` (if guest data exists) OR `/` (if no guest data)
   - ✅ **Expected:** `localStorage.guestAssessments` cleared

6. **Verify User State**
   - Check header: User email/name displayed ✅
   - Navigate to `/results`: See saved assessment ✅
   - Database: User record created, `isGuest: false`, `isPremium: false` ✅

### Post-Login Navigation Tests
| Action | Expected Redirect |
|--------|-------------------|
| Navigate to `/assessment` | ✅ `/assessment` (can take new assessment) |
| Navigate to `/results` | ✅ `/results` (shows previous assessments) |
| Navigate to `/admin` | ❌ 403 Forbidden (not superadmin) |

---

## Persona 3: OAuth Student (Replit Auth - Premium Upgrade)

**Goal:** Logged-in OAuth user purchases premium while logged in

### Test Flow
1. **Login via Replit Auth** (Persona 2 complete)
2. **Navigate to `/tier-selection`**
3. Click **"Get Started"** under Individual tier ($10)
4. ✅ **Expected:** Redirected to `/checkout?students=1`

5. **Fill Checkout Form** (system detects you're logged in)
   - **First Name:** John
   - **Last Name:** OAuth
   - **Email:** `johnoauth@test.com` (any email, even different from logged-in user)
   - **Phone:** 0501234567

6. **Complete Payment**
   - Card: `4242 4242 4242 4242`
   - Click **"Pay $10.00"**
   - ✅ **Expected:** Payment processes successfully

7. **Post-Payment Redirect**
   - ✅ **Expected:** Toast: "Payment Successful! Purchase completed successfully."
   - ✅ **Expected:** Account upgraded in-place (no credentials modal shown)
   - ✅ **Expected:** Redirected to `/assessment`

8. **Verify Account Upgrade**
   - Database: User `isPremium: true`, `purchasedLicenses: 1` ✅
   - Navigate to `/assessment`: Premium features unlocked ✅
   - Take new assessment: Kolb, CVQ, WEF components available ✅

### Important Notes
- ❌ **OAuth users CANNOT see credentials modal** (they already have Replit Auth)
- ✅ **Account upgraded in-place** without creating duplicate
- ✅ **Email in checkout form can be ANY email** (system uses logged-in user ID)

---

## Persona 4: Local Student (Username Login - Individual Purchase)

**Goal:** Guest completes checkout, gets auto-generated credentials, auto-login

### Test Flow: New User Purchase
1. **Logout** (if logged in)
2. **Navigate to `/tier-selection`**
3. Click **"Get Started"** under Individual tier ($10)
4. ✅ **Expected:** Redirected to `/checkout?students=1`

5. **Fill Registration Form**
   - **First Name:** Sarah
   - **Last Name:** Johnson
   - **Email:** `sarah.johnson@test.com` ← **Must be unique!**
   - **Phone:** 0509876543

6. **Complete Payment**
   - Card: `4242 4242 4242 4242`
   - Click **"Pay $10.00"**
   - ✅ **Expected:** Payment succeeds

7. **Credentials Modal Appears**
   - ✅ **Title:** "🎉 Account Created Successfully!"
   - ✅ **Message:** "Premium account created! Your login credentials are below."
   - ✅ **Username:** `sarah.johnson` (auto-generated)
   - ✅ **Password:** 12-character medium-complexity password
   - ✅ **Email:** `sarah.johnson@test.com`
   - ✅ **Copy buttons** for each field work
   - ✅ **"Copy All"** button works
   - ⚠️ **IMPORTANT:** Save these credentials!

8. **Close Modal → Auto-Login**
   - Click **"Continue"**
   - ✅ **Expected:** Modal closes
   - ✅ **Expected:** Auto-logged in (user info in header)
   - ✅ **Expected:** Redirected to `/assessment`

9. **Test Premium Assessment**
   - Complete full assessment with:
     - Kolb Learning Styles ✅
     - RIASEC Personality ✅
     - CVQ Values ✅
     - Subject Quiz ✅
   - View Results: Enhanced matching (Subject 35%, RIASEC 30%, CVQ 20%, Vision 30%, Kolb 10%) ✅
   - Download PDF Report ✅

10. **Test Credential Login**
    - Logout
    - Navigate to `/login/student`
    - Enter saved username and password
    - Click **"Login"**
    - ✅ **Expected:** Redirected to `/assessment`

### Database Verification
```sql
SELECT id, email, username, "isPremium", "purchasedLicenses", "accountType", "passwordHash"
FROM users 
WHERE email = 'sarah.johnson@test.com';
```
- ✅ `isPremium: true`
- ✅ `purchasedLicenses: 1`
- ✅ `accountType: 'individual'`
- ✅ `passwordHash: '$2b$...'` (bcrypt)
- ✅ `username: 'sarah.johnson'`

---

## Persona 5: Organization Admin (Group Purchase)

**Goal:** Create organization via group checkout, manage students

### Test Flow: Group Purchase
1. **Logout** (start fresh)
2. **Navigate to `/tier-selection`**
3. Click **"Get Started"** under Group tier
4. ✅ **Expected:** Redirected to `/group-pricing`

5. **Select Student Count**
   - Drag slider to **10 students**
   - ✅ **Expected:** Price shows: `$80.00` (10 × $8 = $80)
   - ✅ **Expected:** Savings: "$20.00 compared to individual"
   - Click **"Continue to Checkout"**
   - ✅ **Expected:** Redirected to `/checkout?students=10`

6. **Fill Organization Form**
   - **First Name:** Dr. Ahmed
   - **Last Name:** Al-Mansoori
   - **Email:** `ahmed.almansoori@test.com` ← **Must be unique!**
   - **Phone:** 0502345678
   - **School/Organization Name:** Dubai International School ✅ (field visible for groups)

7. **Complete Payment**
   - Card: `4242 4242 4242 4242`
   - Click **"Pay $80.00"**
   - ✅ **Expected:** Payment succeeds

8. **Credentials Modal (Organization)**
   - ✅ **Title:** "🎉 Account Created Successfully!"
   - ✅ **Message:** "Your organization 'Dubai International School' has been created"
   - ✅ **Admin Credentials:** Username, Password, Email
   - ✅ Save credentials immediately!

9. **Close Modal → Admin Dashboard**
   - Click **"Continue"**
   - ✅ **Expected:** Auto-logged in as admin
   - ✅ **Expected:** Redirected to `/admin/organizations`
   - ✅ **Expected:** Organization dropdown shows "Dubai International School"
   - ✅ **Expected:** License quota: **0 / 10** (0 used, 10 total)

10. **Create Student Accounts**
    - Click **"Add Student"**
    - **Full Name:** Ali Hassan
    - **Grade:** 10
    - **Student ID:** (optional) DIS-2024-001
    - **Password Complexity:** Medium
    - Click **"Create Account"**
    - ✅ **Expected:** Student credentials displayed in modal
    - ✅ **Expected:** Quota updates to **1 / 10**
    - ✅ **Expected:** Student appears in roster table

11. **Test Bulk Upload**
    - Click **"Bulk Upload"**
    - Upload CSV with 5 students:
      ```csv
      fullName,grade,studentId
      Fatima Ahmed,9,DIS-2024-002
      Mohammed Rashid,10,DIS-2024-003
      Amira Khalid,11,DIS-2024-004
      Omar Saeed,9,DIS-2024-005
      Noor Abdullah,12,DIS-2024-006
      ```
    - ✅ **Expected:** 5 students created
    - ✅ **Expected:** Quota: **6 / 10**
    - ✅ **Expected:** Download credentials CSV

12. **Test Admin Login**
    - Logout
    - Navigate to `/login/student`
    - Login with admin credentials
    - ✅ **Expected:** Redirected to `/admin/organizations` (NOT `/assessment`)

### Database Verification
```sql
-- Check user record
SELECT id, email, username, role, "accountType", "isPremium", "purchasedLicenses"
FROM users 
WHERE email = 'ahmed.almansoori@test.com';
-- Expected: role='admin', accountType='org_admin', isPremium=true, purchasedLicenses=10

-- Check organization
SELECT id, name, "adminUserId", "totalLicenses", "usedLicenses"
FROM organizations 
WHERE name = 'Dubai International School';
-- Expected: totalLicenses=10, usedLicenses=6

-- Check organization members
SELECT om.id, u.username, om.grade, om.role, om."hasCompletedAssessment"
FROM "organizationMembers" om
JOIN users u ON om."userId" = u.id
WHERE om."organizationId" = '...';
-- Expected: 7 members (1 admin + 6 students)
```

---

## Persona 6: Organization Student (Created by Admin)

**Goal:** Login with provided credentials, complete assessment

### Test Flow
1. **Obtain Student Credentials** (from Persona 5, step 10)
   - Example: `ali.hassan` / `randomPass123`

2. **Navigate to `/login/student`**
3. **Login**
   - **Username:** `ali.hassan`
   - **Password:** (from credentials)
   - Click **"Login"**
   - ✅ **Expected:** Redirected to `/assessment` (NOT `/admin/organizations`)

4. **Complete Premium Assessment**
   - Student has full premium access ✅
   - Complete all assessment components ✅
   - View results ✅
   - Download PDF report ✅

5. **Verify Database**
   ```sql
   SELECT om."hasCompletedAssessment", om."isLocked"
   FROM "organizationMembers" om
   JOIN users u ON om."userId" = u.id
   WHERE u.username = 'ali.hassan';
   -- After completing assessment: hasCompletedAssessment=true, isLocked=true
   ```

6. **Test Account Lock**
   - Try to login as admin
   - Navigate to `/admin/organizations`
   - Try to delete Ali Hassan's account
   - ✅ **Expected:** Error: "Cannot delete: Student has completed assessment"

---

## Persona 7: Super Admin (Replit Auth)

**Goal:** Access admin dashboard, manage system

### Test Flow
1. **Login via Replit Auth** with superadmin account
2. **Auth Callback**
   - ✅ **Expected:** System detects `role: 'superadmin'`
   - ✅ **Expected:** Redirected to `/admin` (NOT `/`)

3. **Admin Dashboard Access**
   - Navigate to `/admin`: ✅ Allowed
   - Navigate to `/admin/organizations`: ✅ Allowed
   - View analytics: ✅ Allowed
   - Create quiz questions: ✅ Allowed

4. **Test Restrictions**
   - Superadmins **CANNOT** use username/password login
   - Superadmins **MUST** be Replit Auth users
   - Navigate to `/login/student` → Login attempt fails ✅

---

## Edge Cases & Error Scenarios

### Test 1: Duplicate Email (Logged-In Upgrade)
**Scenario:** User logs in, then tries to checkout with same/different email

1. Login as OAuth student
2. Go to `/checkout?students=1`
3. Fill form with **any email** (even different from logged-in email)
4. Complete payment
5. ✅ **Expected:** Account upgraded in-place
6. ✅ **Expected:** No credentials modal
7. ✅ **Expected:** Redirect to `/assessment`

### Test 2: Duplicate Email (Not Logged In - Existing OAuth User)
**Scenario:** Guest tries to checkout with email that has OAuth account

1. Logout completely
2. Go to `/checkout?students=1`
3. Fill form with email of existing Replit Auth user
4. Complete payment
5. ✅ **Expected:** Error 400: "This email is already registered. Please login first, then purchase from your account dashboard."
6. ✅ **Expected:** Payment NOT processed

### Test 3: Duplicate Email (Not Logged In - Existing Local User)
**Scenario:** Guest tries to checkout with email of existing local user

1. Logout
2. Go to `/checkout?students=1`
3. Fill form with `sarah.johnson@test.com` (from Persona 4)
4. Complete payment
5. ✅ **Expected:** Success! Licenses incremented
6. ✅ **Expected:** Toast: "Premium licenses added to your account! Please login to access them."
7. ✅ **Expected:** Redirect to `/login/student`
8. Login with existing credentials
9. ✅ **Expected:** `purchasedLicenses: 2` (was 1, now 2)

### Test 4: Duplicate Organization (Same Admin)
**Scenario:** Admin tries to create second organization

1. Login as `ahmed.almansoori@test.com` (Persona 5)
2. Try to complete another group purchase
3. ✅ **Expected:** Error 409: "User already has an organization: Dubai International School. Cannot create multiple organizations."

### Test 5: Payment Declined
1. Start any checkout
2. Use declined card: `4000 0000 0000 0002`
3. ✅ **Expected:** Stripe error: "Your card was declined"
4. ✅ **Expected:** No database records created
5. ✅ **Expected:** User can retry with valid card

### Test 6: Network Failure During Payment
1. Start checkout
2. Open DevTools → Network → Throttle to "Offline"
3. Click "Pay"
4. ✅ **Expected:** Error message about network failure
5. Enable network
6. Retry → ✅ Payment succeeds

### Test 7: Idempotency Test
**Scenario:** Prevent double-processing of same payment

1. Complete payment successfully
2. Before closing modal, extract `paymentIntentId` from console
3. Manually call `/api/checkout/complete` with same `paymentIntentId`
4. ✅ **Expected:** Response: `{ alreadyProcessed: true }`
5. ✅ **Expected:** No duplicate database records
6. ✅ **Expected:** Licenses NOT incremented twice

### Test 8: Quota Exceeded (Organization)
1. Login as admin with organization of 10 licenses
2. Create 10 students (quota full)
3. Try to create 11th student
4. ✅ **Expected:** Error: "Quota exceeded: You have 0 available licenses"
5. ✅ **Expected:** No student created

---

## Page Redirect Matrix

| Persona | Action | Expected Redirect |
|---------|--------|-------------------|
| **Guest** | Complete free assessment | `/results` |
| **Guest** | Click "Save Results" | Modal → Login prompt |
| **OAuth Student (Free)** | Login via `/api/login` | `/` OR returnTo param |
| **OAuth Student (Free)** | Auth callback with guest data | `/results` (migration) |
| **OAuth Student (Free)** | Auth callback without guest data | `/` |
| **OAuth Student (Premium)** | Checkout while logged in | `/assessment` |
| **Local Student (New)** | Complete checkout | Modal → `/assessment` |
| **Local Student (Existing)** | Complete checkout (not logged in) | `/login/student` |
| **Local Student** | Login via `/login/student` | `/assessment` |
| **Org Admin (New)** | Complete group checkout | Modal → `/admin/organizations` |
| **Org Admin** | Login via `/login/student` | `/admin/organizations` |
| **Org Student** | Login via `/login/student` | `/assessment` |
| **Super Admin** | Auth callback | `/admin` |
| **Super Admin** | Navigate to `/admin` | ✅ Allowed |
| **Regular User** | Navigate to `/admin` | ❌ 403 Forbidden |

---

## Post-Testing Checklist

After completing all persona tests, verify:

### Database Integrity
- [  ] All user records have correct `isPremium`, `purchasedLicenses`, `accountType`, `role`
- [  ] All passwords stored as bcrypt hashes (never plaintext)
- [  ] Organization licenses match total/used counts
- [  ] Organization members have correct roles
- [  ] Locked students cannot be deleted

### Authentication & Authorization
- [  ] OAuth login redirects correctly
- [  ] Local login redirects based on role
- [  ] Superadmins can access `/admin`
- [  ] Regular users blocked from `/admin`
- [  ] Organization admins can only manage their own org

### Payment & Checkout
- [  ] Individual purchase creates user with 1 license
- [  ] Group purchase creates org + admin + licenses
- [  ] Logged-in users get in-place upgrades
- [  ] Duplicate emails handled correctly
- [  ] Payment idempotency prevents double-processing
- [  ] Stripe metadata matches database records

### User Experience
- [  ] Credentials modal shows for new users only
- [  ] Copy buttons work in modal
- [  ] Auto-login works for new users
- [  ] Page redirects match persona expectations
- [  ] Error messages are clear and helpful
- [  ] Toast notifications appear at correct times

### Premium Features
- [  ] Free tier has Subject/Interest/Vision matching only
- [  ] Premium tier has Kolb/RIASEC/CVQ/WEF components
- [  ] PDF reports only available to premium users
- [  ] Organization students have full premium access

---

## Test Data Summary

After completing all tests, you should have these accounts:

| Email | Username | Type | Organization | Licenses | Password Saved? |
|-------|----------|------|--------------|----------|-----------------|
| `johnoauth@test.com` | (Replit) | OAuth Premium | None | 1 | N/A (OAuth) |
| `sarah.johnson@test.com` | `sarah.johnson` | Local Premium | None | 2 | ✅ |
| `ahmed.almansoori@test.com` | `ahmed.almansoori` | Org Admin | Dubai International | 10 | ✅ |
| `ali.hassan` (no email) | `ali.hassan` | Org Student | Dubai International | N/A | ✅ |
| Superadmin | (Replit) | Super Admin | System | N/A | N/A (OAuth) |

---

## Success Criteria

All tests **PASS** if:
1. ✅ Every persona redirects to correct page after login/checkout
2. ✅ Credentials modal appears only for new local users
3. ✅ Auto-login works only for new users
4. ✅ Database records match expected state
5. ✅ Payment idempotency prevents duplicates
6. ✅ Error scenarios handled gracefully
7. ✅ No console errors during flows
8. ✅ Premium features accessible to correct users only

---

## Quick Reference: Current Issue Fix

**Issue:** Logged-in users getting "email already registered" error during checkout

**Fix Applied:** System now prioritizes logged-in user detection:
1. **IF logged in**: Upgrade existing account (no duplicate check)
2. **IF NOT logged in**: Check email → Create new OR increment existing

**Test:** 
1. Login as any user
2. Go to `/checkout?students=1`
3. Fill form with **any email** (doesn't matter)
4. Complete payment
5. ✅ **Expected:** Account upgraded, redirect to `/assessment`

---

**Last Updated:** November 18, 2025  
**Version:** 2.0 - Comprehensive Persona Coverage
