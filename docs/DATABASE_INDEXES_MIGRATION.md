> Archived reference from Nov 2025 (prior builder). Database-index recommendations — NOT yet reviewed or applied. Predates this codebase's current state; verify each suggested index against the live schema before acting. Reference only.

# Database Indexes Migration

## Purpose
Add performance indexes to frequently queried fields to improve query performance and prevent potential DoS attacks from slow queries.

## Instructions

### Option 1: Add indexes via Drizzle Schema (Recommended)

Update the following tables in `shared/schema.ts` to include indexes:

#### 1. Users Table
```typescript
export const users = pgTable("users", {
  // ... existing fields
}, (table) => ({
  emailIdx: index("users_email_idx").on(table.email),
  usernameIdx: index("users_username_idx").on(table.username),
  accountTypeIdx: index("users_account_type_idx").on(table.accountType),
  roleIdx: index("users_role_idx").on(table.role),
  isPremiumIdx: index("users_is_premium_idx").on(table.isPremium),
}));
```

#### 2. Password Reset Tokens Table
```typescript
export const passwordResetTokens = pgTable("password_reset_tokens", {
  // ... existing fields
}, (table) => ({
  tokenIdx: uniqueIndex("password_reset_tokens_token_idx").on(table.token),
  userIdIdx: index("password_reset_tokens_user_id_idx").on(table.userId),
  expiresAtIdx: index("password_reset_tokens_expires_at_idx").on(table.expiresAt),
}));
```

#### 3. Assessments Table
```typescript
export const assessments = pgTable("assessments", {
  // ... existing fields
}, (table) => ({
  userIdIdx: index("assessments_user_id_idx").on(table.userId),
  guestTokenIdx: index("assessments_guest_token_idx").on(table.guestToken),
  createdAtIdx: index("assessments_created_at_idx").on(table.createdAt),
  countryIdIdx: index("assessments_country_id_idx").on(table.countryId),
}));
```

#### 4. Recommendations Table
```typescript
export const recommendations = pgTable("recommendations", {
  // ... existing fields
}, (table) => ({
  assessmentIdIdx: index("recommendations_assessment_id_idx").on(table.assessmentId),
  careerIdIdx: index("recommendations_career_id_idx").on(table.careerId),
}));
```

#### 5. Organization Members Table
```typescript
export const organizationMembers = pgTable("organization_members", {
  // ... existing fields
}, (table) => ({
  orgIdIdx: index("organization_members_org_id_idx").on(table.organizationId),
  userIdUniqueIdx: uniqueIndex("organization_members_user_id_unique_idx").on(table.userId),
  gradeIdx: index("organization_members_grade_idx").on(table.grade),
}));
```

#### 6. Quiz Questions Table
```typescript
export const quizQuestions = pgTable("quiz_questions", {
  // ... existing fields
}, (table) => ({
  gradeBandIdx: index("quiz_questions_grade_band_idx").on(table.gradeBand),
  subjectIdx: index("quiz_questions_subject_idx").on(table.subject),
  countryIdIdx: index("quiz_questions_country_id_idx").on(table.countryId),
  // Composite index for common query pattern
  gradeBandCountryIdx: index("quiz_questions_grade_band_country_idx").on(
    table.gradeBand,
    table.countryId
  ),
}));
```

#### 7. Assessment Quizzes Table
```typescript
export const assessmentQuizzes = pgTable("assessment_quizzes", {
  // ... existing fields
}, (table) => ({
  assessmentIdIdx: uniqueIndex("assessment_quizzes_assessment_id_idx").on(table.assessmentId),
}));
```

#### 8. Quiz Responses Table
```typescript
export const quizResponses = pgTable("quiz_responses", {
  // ... existing fields
}, (table) => ({
  quizIdIdx: index("quiz_responses_quiz_id_idx").on(table.quizId),
  questionIdIdx: index("quiz_responses_question_id_idx").on(table.questionId),
}));
```

#### 9. Files Table
```typescript
export const files = pgTable("files", {
  // ... existing fields
}, (table) => ({
  orgIdIdx: index("files_organization_id_idx").on(table.organizationId),
  uploadedByIdx: index("files_uploaded_by_idx").on(table.uploadedBy),
  shareTokenIdx: index("files_share_token_idx").on(table.shareToken),
}));
```

#### 10. CVQ Results Table
```typescript
export const cvqResults = pgTable("cvq_results", {
  // ... existing fields
}, (table) => ({
  userIdIdx: index("cvq_results_user_id_idx").on(table.userId),
  assessmentIdIdx: uniqueIndex("cvq_results_assessment_id_idx").on(table.assessmentId),
}));
```

### Option 2: Add indexes via SQL Migration (Alternative)

If you prefer to add indexes directly via SQL:

```sql
-- Users table indexes
CREATE INDEX IF NOT EXISTS users_email_idx ON users(email);
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);
CREATE INDEX IF NOT EXISTS users_account_type_idx ON users(account_type);
CREATE INDEX IF NOT EXISTS users_role_idx ON users(role);
CREATE INDEX IF NOT EXISTS users_is_premium_idx ON users(is_premium);

-- Password reset tokens indexes
CREATE UNIQUE INDEX IF NOT EXISTS password_reset_tokens_token_idx ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens(expires_at);

-- Assessments table indexes
CREATE INDEX IF NOT EXISTS assessments_user_id_idx ON assessments(user_id);
CREATE INDEX IF NOT EXISTS assessments_guest_token_idx ON assessments(guest_token);
CREATE INDEX IF NOT EXISTS assessments_created_at_idx ON assessments(created_at);
CREATE INDEX IF NOT EXISTS assessments_country_id_idx ON assessments(country_id);

-- Recommendations table indexes
CREATE INDEX IF NOT EXISTS recommendations_assessment_id_idx ON recommendations(assessment_id);
CREATE INDEX IF NOT EXISTS recommendations_career_id_idx ON recommendations(career_id);

-- Organization members table indexes
CREATE INDEX IF NOT EXISTS organization_members_org_id_idx ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS organization_members_grade_idx ON organization_members(grade);

-- Quiz questions table indexes
CREATE INDEX IF NOT EXISTS quiz_questions_grade_band_idx ON quiz_questions(grade_band);
CREATE INDEX IF NOT EXISTS quiz_questions_subject_idx ON quiz_questions(subject);
CREATE INDEX IF NOT EXISTS quiz_questions_country_id_idx ON quiz_questions(country_id);
CREATE INDEX IF NOT EXISTS quiz_questions_grade_band_country_idx ON quiz_questions(grade_band, country_id);

-- Assessment quizzes table indexes
CREATE UNIQUE INDEX IF NOT EXISTS assessment_quizzes_assessment_id_idx ON assessment_quizzes(assessment_id);

-- Quiz responses table indexes
CREATE INDEX IF NOT EXISTS quiz_responses_quiz_id_idx ON quiz_responses(quiz_id);
CREATE INDEX IF NOT EXISTS quiz_responses_question_id_idx ON quiz_responses(question_id);

-- Files table indexes
CREATE INDEX IF NOT EXISTS files_organization_id_idx ON files(organization_id);
CREATE INDEX IF NOT EXISTS files_uploaded_by_idx ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS files_share_token_idx ON files(share_token);

-- CVQ results table indexes
CREATE INDEX IF NOT EXISTS cvq_results_user_id_idx ON cvq_results(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS cvq_results_assessment_id_idx ON cvq_results(assessment_id);
```

## Deployment Steps

### Using Drizzle (Recommended)

1. Update `shared/schema.ts` with index definitions above
2. Generate migration:
   ```bash
   npm run db:push
   ```
3. Verify indexes were created:
   ```sql
   SELECT
     tablename,
     indexname,
     indexdef
   FROM pg_indexes
   WHERE schemaname = 'public'
   ORDER BY tablename, indexname;
   ```

### Using SQL Migration

1. Create a new SQL migration file in `migrations/` directory
2. Copy the SQL statements above
3. Run migration:
   ```bash
   psql $DATABASE_URL -f migrations/add_indexes.sql
   ```

## Performance Impact

**Expected Improvements:**
- User lookup by email/username: **10-100x faster**
- Assessment queries by user: **5-50x faster**
- Password reset token validation: **10-50x faster**
- Organization member queries: **5-20x faster**
- Quiz question filtering: **10-100x faster**
- Recommendation lookups: **5-20x faster**

**Trade-offs:**
- Slightly slower INSERT/UPDATE operations (typically <5% overhead)
- Increased storage (approximately 10-20% increase)
- Index maintenance overhead (automatic, minimal impact)

## Monitoring

After deployment, monitor query performance:

```sql
-- Check slow queries
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

## Rollback

If indexes cause issues, they can be dropped safely:

```sql
-- Drop all created indexes (does not affect data)
DROP INDEX IF EXISTS users_email_idx;
DROP INDEX IF EXISTS users_username_idx;
-- ... (repeat for all indexes)
```

## Notes

- Indexes are created `IF NOT EXISTS` to prevent errors on re-run
- UNIQUE indexes enforce data integrity (e.g., one assessment per quiz)
- Composite indexes optimize multi-column WHERE clauses
- Indexes are automatically maintained by PostgreSQL

## Priority

**HIGH PRIORITY:**
- Users (email, username) - authentication queries
- Password reset tokens (token) - security-critical
- Assessments (userId, guestToken) - core functionality

**MEDIUM PRIORITY:**
- Organization members (organizationId, grade)
- Quiz questions (gradeBand, countryId)
- Recommendations (assessmentId)

**LOW PRIORITY:**
- Files (organizationId, uploadedBy)
- CVQ results (userId, assessmentId)
