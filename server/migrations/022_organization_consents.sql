-- The school's recorded consent act.
--
-- WHY: the end users are 13-18. Schools create and manage their accounts on
-- their behalf, so the school is the consenting party — but nothing recorded
-- that. Before this table, `consentGiven` existed ONLY as React state on the
-- assessment form (client/src/pages/Assessment.tsx): no column, no server-side
-- reference, absent from the auto-save payload. For an organization student it
-- was force-set true in two places and rendered as a disabled, pre-ticked
-- checkbox. So the product asserted institutional consent on screen and stored
-- no record of it anywhere. This is the first consent record in the system.
--
-- APPEND-ONLY. One row per attestation act; re-attestation INSERTs. The current
-- attestation is the most recent row for the organization. There is no "current"
-- flag to keep in sync and no UPDATE path, because which attestation covered a
-- given student depends on that student's enrolment date and an overwrite
-- destroys exactly that.
--
-- NO WITHDRAWAL COLUMN, DELIBERATELY. Withdrawal is per-student and must not
-- route through the school: the school is the party whose consent is relied
-- upon, so it cannot also gatekeep withdrawal. A withdrawal flag here would
-- model the thing that design rules out.
--
-- BOTH FOREIGN KEYS ARE ON DELETE SET NULL, and that is the point rather than
-- laziness. This row outlives both the organization and the admin who made it:
-- what it evidences is that processing had a lawful basis, and that question is
-- asked most sharply after the data is gone. organization_name,
-- performed_by_name and performed_by_email are denormalised so the row still
-- says who attested for which school once the FKs have nulled. Note the cost:
-- a row for a deleted school still carries an ex-admin's name and email.
-- Accepted — naming the attester IS the accountability — but revisit it if a
-- retention schedule is ever written.
CREATE TABLE IF NOT EXISTS organization_consents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id varchar REFERENCES organizations(id) ON DELETE SET NULL,
  organization_name text NOT NULL,

  -- Two separable claims. Never collapse: the second carries the legal weight,
  -- and an auditor asks which was asserted, not whether "consent" was given.
  consents_to_processing boolean NOT NULL,
  attests_guardian_consent boolean NOT NULL,

  performed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  performed_by_role text NOT NULL,
  performed_by_name text NOT NULL,
  performed_by_email text NOT NULL,

  -- Which documents. The hash identifies them; the string is what the admin
  -- actually saw; the locale matters because en/ar drift independently.
  policy_version text NOT NULL,
  policy_last_updated text NOT NULL,
  policy_locale text NOT NULL,

  -- Channel evidence, and it is thin. Not a signature; do not present it as one.
  ip_address text,
  user_agent text,
  attestation_text_hash text NOT NULL,

  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_consents_organization ON organization_consents (organization_id);
CREATE INDEX IF NOT EXISTS idx_org_consents_created_at ON organization_consents (created_at);

COMMENT ON TABLE organization_consents IS
  'Append-only record of a school attesting consent for the students it enrols. Most recent row per organization_id is the current attestation; re-attestation inserts. Both FKs are ON DELETE SET NULL so the record outlives the org and the admin - the denormalised name/email columns carry the identity.';

COMMENT ON COLUMN organization_consents.attests_guardian_consent IS
  'The school asserts it holds guardian consent for the students it enrols. Stored separately from consents_to_processing because the two are separable claims and this is the one carrying the legal weight.';

COMMENT ON COLUMN organization_consents.policy_version IS
  'Boot-time content hash of the legal documents as served (server/utils/policyVersion.ts). Identifies the documents; does NOT assert they were correct or that a change was substantive.';
