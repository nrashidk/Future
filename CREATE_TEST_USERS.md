# Quick Test Account Setup

Since OAuth redirect isn't working reliably, here's how to test the system using **username/password login**:

## Option 1: Create Test Student Account via Database

Run this SQL in your Database tab:

```sql
-- 1. Create a test organization admin (Replit Auth user)
-- First, login with Replit Auth once, then run:
UPDATE users 
SET role = 'admin', account_type = 'org_admin'
WHERE email = 'your@email.com';

-- 2. Create a test organization
INSERT INTO organizations (name, admin_user_id, total_licenses, used_licenses, password_complexity)
SELECT 'Test School', u.id, 50, 0, 'easy'
FROM users u
WHERE u.email = 'your@email.com'
ON CONFLICT DO NOTHING
RETURNING id, name;

-- 3. Get the organization ID from above, then create a test student
-- (This will be done via the admin panel, but manual creation:)
-- The app has a /login/student page for username/password login
```

## Option 2: Use the Admin Panel (Recommended)

1. **Login with Replit Auth** (just to create your account)
2. **Make yourself admin** via database:
   ```sql
   UPDATE users SET role = 'admin', account_type = 'org_admin' WHERE email = 'your@email.com';
   ```
3. **Refresh the page** - you'll see "Admin" in the navigation
4. **Click Admin → Organizations**
5. **Create a new organization** (e.g., "Test School", 50 licenses)
6. **Add test students** with simple passwords
7. **Download credentials** and use them to login at `/login/student`

## Option 3: Direct Database Insert (Fastest)

```sql
-- Create a test student user with username/password
-- Password: "test123" (bcrypt hash for testing)
INSERT INTO users (
  id,
  email,
  first_name,
  last_name,
  username,
  password_hash,
  account_type,
  is_org_generated,
  role
) VALUES (
  gen_random_uuid(),
  null,
  'Test',
  'Student',
  'teststudent',
  '$2b$10$rKzE3qkPjKqPq5kPq5kPqujKqPq5kPq5kPq5kPq5kPq5kPq5kP',
  'org_student',
  true,
  'user'
);

-- Login at: /login/student
-- Username: teststudent
-- Password: test123
```

## Testing the Student Login Flow

1. Go to `/login/student`
2. Enter username: `teststudent`
3. Enter password: `test123`
4. Click "Sign In"
5. You'll be logged in and can start the assessment!

## Publishing Issue

The "Failed to validate database migrations" error in your screenshot happens because:
- Replit's deployment tries to run migrations
- The migrations might be out of sync with your schema

**Fix:**
1. Make sure your schema changes are pushed to the database
2. Run `npm run db:push` in development first
3. Then try publishing again

The database migrations are generated automatically by Drizzle, so you don't need to worry about them in development mode.
