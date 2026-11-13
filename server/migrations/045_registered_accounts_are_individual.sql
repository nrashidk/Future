-- 045: A PARENT-REGISTERED ACCOUNT IS AN 'individual' ACCOUNT.
--
-- createParentRegistration wrote account_type = 'public'. Nothing reads that
-- value: the superadmin Users directory lists org_student, org_admin and
-- individual, so every account a parent registered was invisible to it, to
-- its Free / Premium filter and to "give licences", which requires
-- 'individual'. Accepted at creation, visible nowhere.
--
-- The code now writes 'individual'. This moves the rows already written.
-- Nothing else distinguishes the two values, so no behaviour changes for the
-- account itself.

UPDATE users SET account_type = 'individual' WHERE account_type = 'public';

-- DOWN (paste by hand): none that is safe. 'public' and 'individual' cannot be
-- told apart afterwards; the accounts that were 'public' are exactly those
-- with a child_profiles row and no school:
--
-- UPDATE users SET account_type = 'public'
--  WHERE account_type = 'individual'
--    AND id IN (SELECT guardian_user_id FROM child_profiles);
