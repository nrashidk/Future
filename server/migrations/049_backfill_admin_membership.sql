-- 049: every school's registered administrator holds an admin membership row.
--
-- Since 2026-11-24 a school admin's school is resolved from an ADMIN
-- MEMBERSHIP row only (storage.getOrganizationByAdminUserId). Before, the
-- organizations.admin_user_id column alone was enough, which is how an admin
-- the superadmin had REMOVED kept the whole school. Every creation path writes
-- both, but a school whose registered administrator somehow has the column and
-- no row would lose its admin on deploy. This gives such an account its row --
-- unless the superadmin removed them from that school (an admin_removed event
-- names them), which is exactly the person the change exists to keep out.
--
-- organization_members.user_id is UNIQUE (one school per account), so an
-- account with a row anywhere is skipped, and ON CONFLICT makes a race a no-op.
-- IDEMPOTENT: a second run finds every such row present.

INSERT INTO organization_members (id, organization_id, user_id, role, is_primary_admin, has_completed_assessment, is_locked)
SELECT gen_random_uuid(), o.id, o.admin_user_id, 'admin',
       NOT EXISTS (SELECT 1 FROM organization_members p WHERE p.organization_id = o.id AND p.is_primary_admin = true),
       false, false
  FROM organizations o
  JOIN users u ON u.id = o.admin_user_id
 WHERE u.account_type = 'org_admin'
   AND NOT EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = o.admin_user_id)
   AND NOT EXISTS (SELECT 1 FROM organization_events e
                    WHERE e.organization_id = o.id
                      AND e.affected_user_id = o.admin_user_id
                      AND e.event_type = 'admin_removed')
ON CONFLICT DO NOTHING;

-- DOWN (manual, not run by the runner):
-- -- The inserted rows are ordinary admin memberships and cannot be told apart
-- -- afterwards; compare the before/after counts and delete by id if needed.
-- SELECT 1;
