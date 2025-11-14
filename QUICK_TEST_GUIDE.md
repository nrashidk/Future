# 🚀 Quick Testing Guide - No OAuth Required!

Since the Replit Auth redirect has issues, use these **test accounts** I just created in the database:

---

## ✅ Test Accounts Created

### 1️⃣ Basic Student Account
- **Login Page**: `/login/student`
- **Username**: `teststudent`
- **Password**: `test123`
- **Type**: Organization student (free tier)

### 2️⃣ Premium User Account
- **Login Page**: `/login/student`
- **Username**: `premiumuser`
- **Password**: `test123`
- **Type**: Individual with premium access (paid tier)

### 3️⃣ Admin Account
- **Login Page**: `/login/student`
- **Username**: `adminuser`  
- **Password**: `test123`
- **Type**: Organization admin

---

## 📝 How to Test

### Test the Basic Free Assessment
1. Go to `/login/student`
2. Login with: `teststudent` / `test123`
3. Start the assessment
4. Complete all steps
5. View basic results (free tier)

### Test Premium Features  
1. Go to `/login/student`
2. Login with: `premiumuser` / `test123`
3. Complete the assessment
4. Generate recommendations
5. View detailed report with:
   - Learning style analysis
   - RIASEC personality scores
   - WEF skills profile
   - PDF download

### Test Admin Dashboard
1. Go to `/login/student`
2. Login with: `adminuser` / `test123`
3. Click "Admin" in navigation
4. View Organizations panel
5. Create a new organization
6. Add student accounts
7. Download credentials

---

## 🐛 Testing Guest Mode (No Login)

1. Open app in incognito/private window
2. Click "Explore as Guest"
3. Complete basic assessment
4. View results
5. Click "Create Free Account"
   - ⚠️ This will trigger OAuth (which has redirect issues)
   - Alternative: Just create an account via `/login/student` instead

---

## 💳 Testing Stripe Payment (Premium)

If you want to test the payment flow:

1. Use test card: `4242 4242 4242 4242`
2. Expiry: Any future date
3. CVC: Any 3 digits
4. ZIP: Any 5 digits

---

## 🔧 Publishing Issue Fix

The "Failed to validate database migrations" error happens because:
- Deployment tries to run migrations on production database
- Schema might be out of sync

**Solution**:
1. The app uses `npm run db:push` in development (no migrations)
2. For production, Replit auto-generates migrations
3. If stuck, try: "Cancel" the publish → "Retry"

**Alternative**: 
- Disable migrations validation in deployment settings
- Or manually run migrations in production database

---

## 🎯 What to Test

### Core Features
- ✅ Student login (username/password)
- ✅ Guest assessment flow
- ✅ Basic vs Premium results
- ✅ PDF report download
- ✅ Admin organization management
- ✅ Stripe payment flow
- ❌ OAuth redirect (known issue - use username login instead)

### Known Issues
1. **OAuth Redirect**: After clicking "Allow", redirects to homepage instead of intended page
   - **Workaround**: Use username/password login instead (`/login/student`)
   
2. **Publishing**: Migration validation error
   - **Workaround**: Retry or check deployment logs

---

## 🆘 Quick Commands

### Create More Test Users
```sql
-- Run in Database tab
INSERT INTO users (username, password_hash, first_name, last_name, email, role, is_premium)
VALUES ('newuser', '$2b$10$6QrhbZITzmATy5x8hdw6MODkVlp3hEE95CqrCURYPUqZ.5yNWW5La', 
        'New', 'User', 'new@test.local', 'user', false);
-- Password will be: test123
```

### Make User Admin
```sql
UPDATE users SET role = 'admin', account_type = 'org_admin' WHERE username = 'yourusername';
```

### Make User Premium
```sql
UPDATE users SET is_premium = true, payment_date = NOW() WHERE username = 'yourusername';
```

---

**You're all set!** 🎉  
Go to `/login/student` and use any of the test accounts above.
