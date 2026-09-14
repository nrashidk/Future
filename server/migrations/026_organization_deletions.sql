-- The record that a school was deleted, by whom, and what went with it.
--
-- WHY: deleting a school removes its organization_events rows along with it,
-- and an event row cannot record the deletion itself — organization_events
-- .organization_id is NOT NULL REFERENCES organizations(id), so a row pointing at
-- the school cannot outlive the school. The bulk delete tried anyway, inserting
-- an organization_deleted event after the delete committed; the insert 23503'd
-- and a deleted school was reported as failed. Until this table, both delete
-- paths wrote a console line, which is no record at all.
--
-- WRITTEN INSIDE THE DELETE'S TRANSACTION (services/organizationDeletion.ts), so a
-- row exists if and only if the deletion committed.
--
-- organization_id HAS NO FOREIGN KEY, deliberately: the organization is gone by
-- definition. organization_name is denormalised for the same reason.
--
-- performed_by IS ON DELETE SET NULL, and performed_by_name / performed_by_email
-- are denormalised, the organization_consents pattern. The row outlives the
-- person who performed the deletion, including their own erasure. That is an
-- accepted retention cost, recorded as a decision in FOLLOWUP.md ("ORGANIZATION
-- DELETION RECORD — DECIDED 2026-09-14"), not an oversight to be tidied away.
-- performed_by_email is nullable because a superadmin can be identified by role
-- alone and may have no email.
CREATE TABLE IF NOT EXISTS organization_deletions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id varchar NOT NULL,
  organization_name text NOT NULL,

  performed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  performed_by_role text NOT NULL,
  performed_by_name text NOT NULL,
  performed_by_email text,

  -- What the deletion took with it. Students are never among these: the
  -- sequence refuses while any are enrolled.
  admin_members_removed integer NOT NULL,
  events_removed integer NOT NULL,
  files_removed integer NOT NULL,
  questions_detached integer NOT NULL,

  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_deletions_organization ON organization_deletions (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_deletions_created_at ON organization_deletions (created_at);

COMMENT ON TABLE organization_deletions IS
  'Append-only record of a school deletion, written in the same transaction as the delete. No FK on organization_id (the org is gone); performed_by is ON DELETE SET NULL with the performer name/email denormalised, so the record outlives both - an accepted retention decision recorded in FOLLOWUP.md.';
