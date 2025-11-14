# Self-Service Checkout Testing Guide

## Overview
This guide will walk you through testing both **individual** and **group** purchase flows for the Future Pathways career guidance system.

---

## Prerequisites
Before testing, ensure:
1. ✅ Application is running (`npm run dev`)
2. ✅ Stripe is configured with test keys
3. ✅ Database is seeded and accessible
4. ✅ You have Stripe test card numbers ready

### Stripe Test Cards
Use these test card numbers for different scenarios:

| Scenario | Card Number | CVC | Expiry |
|----------|-------------|-----|--------|
| **Successful Payment** | `4242 4242 4242 4242` | Any 3 digits | Any future date |
| **Declined Payment** | `4000 0000 0000 0002` | Any 3 digits | Any future date |
| **Insufficient Funds** | `4000 0000 0000 9995` | Any 3 digits | Any future date |

---

## Test Flow 1: Individual Purchase ($10)

### Step 1: Start from Landing Page
1. Open your application in a browser
2. Navigate to the home page
3. Click **"Get Started"** or **"Pricing"**

### Step 2: Select Individual Tier
1. On the Tier Selection page, click **"Get Started"** under the **Individual** tier ($10)
2. ✅ **Expected**: You should be redirected to `/checkout?students=1`

### Step 3: Fill Registration Form
Fill in the following information:
- **First Name**: John
- **Last Name**: Doe
- **Email**: john.doe.test@example.com (use unique email each time)
- **Phone**: +1234567890

✅ **Expected**: All fields should be required and validate properly

### Step 4: Enter Payment Information
1. Fill in Stripe payment form:
   - **Card Number**: `4242 4242 4242 4242`
   - **Expiry**: `12/34` (any future date)
   - **CVC**: `123`
   - **ZIP**: `12345`

✅ **Expected**: Payment form should validate card format

### Step 5: Complete Payment
1. Click **"Pay $10.00"** button
2. ⏳ Wait for processing (should take 2-5 seconds)

✅ **Expected**: 
- Button shows "Processing..." with spinner
- No errors appear

### Step 6: View Credentials Modal
After successful payment, a modal should appear with:
- ✅ Title: "🎉 Account Created Successfully!"
- ✅ Username displayed (e.g., `john.doe` or `john.doe2`)
- ✅ Password displayed (medium complexity, 12 characters)
- ✅ Email displayed
- ✅ Copy buttons for each field
- ✅ Warning message about saving credentials
- ✅ "Copy All" button
- ✅ "Continue" button

**Test the modal features:**
1. Click copy button next to **Username** → ✅ Should copy to clipboard
2. Click copy button next to **Password** → ✅ Should copy to clipboard
3. Click **"Copy All"** → ✅ Should copy all credentials
4. **Save these credentials somewhere** (you'll need them later)

### Step 7: Continue to Assessment
1. Click **"Continue"** button in modal
2. ✅ **Expected**: You should be redirected to `/assessment`
3. ✅ **Expected**: You should be auto-logged in (check if you see user info in header)

### Step 8: Verify Database Records
Open your database and verify:
1. **Users table**:
   - ✅ New user created with `john.doe.test@example.com`
   - ✅ `isPremium: true`
   - ✅ `purchasedLicenses: 1`
   - ✅ `accountType: 'individual'`
   - ✅ `passwordHash` exists (bcrypt hash)

2. **No organization created** (individual purchase doesn't create org)

### Step 9: Test Credential Login
1. Logout from the application
2. Go to `/login/student`
3. Enter the credentials from the modal:
   - **Username**: (from modal)
   - **Password**: (from modal)
4. Click **"Login"**

✅ **Expected**: Successfully logged in, redirected to dashboard or assessment

---

## Test Flow 2: Group Purchase (5 Students - $45)

### Step 1: Start from Landing Page
1. Open application in browser (or use incognito/private mode)
2. Navigate to home page
3. Click **"Get Started"** or **"Pricing"**

### Step 2: Select Group Tier
1. On Tier Selection page, click **"Get Started"** under **Group** tier
2. ✅ **Expected**: Redirected to `/group-pricing`

### Step 3: Select Number of Students
1. Use the slider to select **5 students**
2. ✅ **Expected**: 
   - Price shows: $45.00 (5 × $9 = $45)
   - Discount shown: "$5.00 savings"
3. Click **"Continue to Checkout"**
4. ✅ **Expected**: Redirected to `/checkout?students=5`

### Step 4: Fill Registration Form
Fill in the following information:
- **First Name**: Jane
- **Last Name**: Smith
- **Email**: jane.smith.org@example.com (use unique email)
- **Phone**: +1987654321
- **School/Organization Name**: Springfield High School

✅ **Expected**: Organization name field should be visible and required

### Step 5: Enter Payment Information
1. Fill in Stripe payment form:
   - **Card Number**: `4242 4242 4242 4242`
   - **Expiry**: `12/34`
   - **CVC**: `123`
   - **ZIP**: `12345`

### Step 6: Complete Payment
1. Click **"Pay $45.00"** button
2. ⏳ Wait for processing

✅ **Expected**:
- Processing indicator appears
- No errors

### Step 7: View Credentials Modal with Organization Info
After successful payment, modal appears with:
- ✅ Title: "🎉 Account Created Successfully!"
- ✅ Message mentions: "Your organization 'Springfield High School' has been created"
- ✅ Admin credentials displayed (username, password, email)
- ✅ All copy buttons work
- ✅ Warning about saving credentials

**Test the modal:**
1. **Save these admin credentials** (very important!)
2. Test copy buttons
3. Click **"Copy All"**

### Step 8: Continue to Organization Dashboard
1. Click **"Continue"** button
2. ✅ **Expected**: Redirected to `/admin/organizations`
3. ✅ **Expected**: Auto-logged in as admin
4. ✅ **Expected**: See "Springfield High School" in organization dropdown
5. ✅ **Expected**: See license quota: **0 / 5** (0 used, 5 total)

### Step 9: Verify Database Records
Check your database:

1. **Users table**:
   - ✅ New user created: `jane.smith.org@example.com`
   - ✅ `isPremium: true`
   - ✅ `purchasedLicenses: 5`
   - ✅ `accountType: 'org_admin'`
   - ✅ `role: 'admin'`

2. **Organizations table**:
   - ✅ New organization: "Springfield High School"
   - ✅ `adminUserId`: matches Jane Smith's user ID
   - ✅ `totalLicenses: 5`
   - ✅ `usedLicenses: 0`
   - ✅ `stripePaymentId`: exists
   - ✅ `amountPaid: 45`

3. **OrganizationMembers table**:
   - ✅ Admin enrolled as member
   - ✅ `userId`: matches Jane Smith's ID
   - ✅ `organizationId`: matches Springfield High School
   - ✅ `role: 'admin'`
   - ✅ `hasCompletedAssessment: false`

### Step 10: Test Admin Login
1. Logout
2. Go to `/login/student`
3. Login with admin credentials from modal
4. ✅ **Expected**: Successfully logged in, redirected to `/admin/organizations`

### Step 11: Create Student Accounts
1. In organization dashboard, click **"Add Student"**
2. Create a student:
   - **Full Name**: Michael Johnson
   - **Grade**: 10
   - **Student ID**: (optional)
3. Click **"Create Account"**

✅ **Expected**:
- Student credentials displayed
- License quota updates to **1 / 5**
- Student appears in roster

---

## Test Flow 3: Edge Cases & Error Scenarios

### Test 3.1: Duplicate Email (Existing OAuth User)
**Scenario**: User already has Replit Auth account

1. Start individual or group checkout
2. Use email of existing **Replit Auth user**
3. Complete payment with valid card
4. ✅ **Expected**: Error message appears:
   - "This email is already registered via Replit Auth. Please login first, then purchase from your account dashboard."

### Test 3.2: Duplicate Email (Existing Local User)
**Scenario**: User already has local account, buying more licenses

1. Start group checkout
2. Use email from Test Flow 1 (`john.doe.test@example.com`)
3. Complete payment
4. ✅ **Expected**: 
   - **No credentials modal** (user already exists)
   - Toast message: "Premium licenses added to your account! Please login to access them."
   - Redirected to `/login/student`
5. Login with original credentials
6. Check database:
   - ✅ `purchasedLicenses` should be incremented (was 1, now 6)

### Test 3.3: Payment Declined
1. Start any checkout flow
2. Use declined test card: `4000 0000 0000 0002`
3. Click "Pay"
4. ✅ **Expected**: Error message from Stripe about declined card

### Test 3.4: Payment Retry (Idempotency Test)
**Scenario**: User refreshes page or clicks pay multiple times

1. Start checkout flow
2. Complete payment successfully
3. **BEFORE closing credentials modal**, open browser console
4. Look for payment intent ID in console logs
5. Try to submit the same payment intent again (this requires dev tools)
6. ✅ **Expected**: 
   - Should return success but NOT create duplicate records
   - Should NOT double-allocate licenses

### Test 3.5: Duplicate Organization (Same User)
**Scenario**: Admin tries to create second organization

1. Use admin credentials from Test Flow 2 (jane.smith.org@example.com)
2. Start new group checkout with **same email**
3. Complete payment
4. ✅ **Expected**: Error response (409):
   - "User already has an organization: Springfield High School. Cannot create multiple organizations."

### Test 3.6: Missing Required Fields
1. Start any checkout
2. Leave one field blank (e.g., First Name)
3. Try to submit
4. ✅ **Expected**: Form validation prevents submission
5. Fill in missing field
6. Try again - should work

### Test 3.7: Network Error During Payment
1. Start checkout
2. Open browser DevTools → Network tab
3. Enable "Offline" mode
4. Click "Pay"
5. ✅ **Expected**: Error message about network failure
6. Disable offline mode
7. Try again - should work

---

## Test Flow 4: Cross-Flow Verification

### Verify Credentials Modal vs Toast
1. **New user purchase** → ✅ Shows credentials modal
2. **Existing user purchase** → ✅ Shows toast, no modal
3. **OAuth user conflict** → ✅ Shows error message

### Verify Routing
1. **New individual user** → ✅ Modal → `/assessment`
2. **New group admin** → ✅ Modal → `/admin/organizations`
3. **Existing user** → ✅ Toast → `/login/student`

### Verify Auto-Login
1. **New users** → ✅ Auto-logged in after modal close
2. **Existing users** → ✅ NOT auto-logged in (security)

---

## Post-Testing Checklist

After completing all tests, verify:

- [  ] Individual purchase creates correct database records
- [  ] Group purchase creates organization + admin membership
- [  ] Credentials modal displays and copies correctly
- [  ] Routing works for all user types
- [  ] Auto-login works for new users only
- [  ] Existing users can't create duplicate orgs
- [  ] License allocation is correct and incremental
- [  ] Payment idempotency prevents double-processing
- [  ] Error messages are user-friendly
- [  ] All test credentials saved for reference

---

## Troubleshooting

### Modal doesn't appear
- Check browser console for errors
- Verify `data.isNewUser` and `data.credentials` in network response
- Check if payment was successful

### Auto-login doesn't work
- Check browser console for authentication errors
- Verify session storage
- Try manual login with credentials

### Database records incorrect
- Check transaction rollback logs
- Verify payment completed successfully
- Inspect API response in network tab

### Payment fails repeatedly
- Verify Stripe test keys are correct
- Check Stripe dashboard for payment intents
- Try different test card

---

## Test Data Summary

For easy reference, here's what you should have after all tests:

| Test | Email | Type | Organization | Licenses |
|------|-------|------|--------------|----------|
| Flow 1 | john.doe.test@example.com | Individual | None | 1 |
| Flow 2 | jane.smith.org@example.com | Group Admin | Springfield High School | 5 |
| Flow 3.2 | john.doe.test@example.com | Individual | None | 7 (1+6) |

---

## Success Criteria

All tests PASS if:
1. ✅ No errors in browser console
2. ✅ All database records created correctly
3. ✅ Credentials modal displays properly
4. ✅ Routing works as expected
5. ✅ Auto-login works for new users
6. ✅ Existing users handled correctly
7. ✅ Payment idempotency works
8. ✅ Error scenarios handled gracefully

---

## Next Steps

After successful testing:
1. Document any issues found
2. Test with production Stripe keys (carefully!)
3. Monitor logs during real purchases
4. Set up alerts for transaction failures
5. Create user documentation for checkout process

---

**Need Help?**
- Check browser console for errors
- Review server logs for backend issues
- Inspect network tab for API responses
- Verify database records match expectations
