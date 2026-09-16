-- The one child a parent-registers account holds.
--
-- WHY: the self-pay route's individual buyer becomes a parent registering FOR
-- a child, not for themselves (docs/parent-registers-scoping.md). The child
-- has no login of their own — the account is the parent's, the child is its
-- subject — so their name, date of birth, grade and gender need a home that
-- is not "whatever the most recent assessment row happens to say," the same
-- reason organization_members.date_of_birth replaced a re-typed
-- student_age column (server/migrations/017_drop_student_age.sql).
--
-- ONE ROW PER ACCOUNT, ENFORCED. guardian_user_id is UNIQUE: "a parent
-- registers twice for two children" is a schema-level invariant here, not a
-- convention that happens to hold — the same role organization_members.user_id
-- being UNIQUE plays for "one school per student."
--
-- NO ON DELETE CASCADE, DELIBERATELY. This codebase's established pattern for
-- a user's dependent rows is explicit, ordered deletes inside the erasure
-- transaction (server/services/accountErasure.ts) rather than a database
-- cascade — server/services/organizationDeletion.ts names this trade-off
-- explicitly and picks ordering over cascades, and introducing a cascade here
-- would be a second pattern for the same problem living next to an
-- established one. A bare FK means DELETE /api/users/me must delete this row
-- before deleting users, which accountErasure.ts now does.
--
-- date_of_birth IS NEVER SENT TO THE CHILD'S OWN BROWSER. Same rule as
-- organization_members.date_of_birth: age is derived fresh per assessment via
-- ageOnDate (shared/dateOfBirth.ts), this column is not part of that response.
--
-- country_id / curriculum LIVE HERE rather than being derived from an
-- organization: there is no school for this population, so what
-- resolveSchoolOwnedFields reads from organizations for a school student, the
-- equivalent resolver for this population reads from this row instead.
CREATE TABLE IF NOT EXISTS child_profiles (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),

  guardian_user_id varchar NOT NULL UNIQUE REFERENCES users(id),

  name text NOT NULL,
  date_of_birth date NOT NULL,
  gender text NOT NULL,
  grade text NOT NULL,
  country_id varchar REFERENCES countries(id),
  curriculum text,

  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

COMMENT ON TABLE child_profiles IS
  'The one child a parent-registers account holds. guardian_user_id is UNIQUE - one child per account is a schema-level invariant, not a convention. No ON DELETE CASCADE: accountErasure.ts deletes this row explicitly, matching this codebase''s ordered-delete pattern for a user''s other dependent rows rather than a database cascade.';

COMMENT ON COLUMN child_profiles.date_of_birth IS
  'Never sent to the child''s own browser. Age is derived fresh per assessment via ageOnDate and anchored to that assessment row, never recomputed - the same reason student_age was dropped from organization_members in favour of a birth date.';
