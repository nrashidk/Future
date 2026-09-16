-- The parent's own, first-person consent act — for their own named child.
--
-- WHY THIS IS NOT organization_consents. That table exists because a SCHOOL
-- attests, second-hand, that it holds guardian consent for a cohort it did
-- not name. A parent registering their own child is the opposite shape on
-- both axes that table was built around: exactly one named subject, never a
-- cohort, and a FIRST-PERSON claim ("I am this child's guardian and I
-- consent"), not an institution vouching for consent it says it separately
-- obtained. One table cannot honestly serve both
-- (docs/parent-registers-scoping.md section 2) — this reuses the PATTERN
-- (channel evidence, denormalised identity, policy versioning), not the
-- table.
--
-- NO CHILD REFERENCE COLUMN. organization_consents needs organization_id
-- because one school's attestation covers many students. This table never
-- does: child_profiles.guardian_user_id is UNIQUE, so performed_by (the
-- parent) already identifies the one account and the one subject it can ever
-- hold.
--
-- attests_guardian_relationship, NOT attests_guardian_consent. The org
-- table's boolean names an institution's claim about consent it says it
-- holds for someone else; this one is the parent's own claim about who they
-- are to this child. Stored separately from consents_to_processing for the
-- same reason as the org table: two separable claims, and an auditor asks
-- which was asserted.
--
-- performed_by IS ON DELETE SET NULL, with performed_by_name/
-- performed_by_email denormalised — same reasoning and same accepted cost as
-- organization_consents: an attestation that dissolves when its author's
-- account is erased is not a record, so this row deliberately outlives the
-- parent's own erasure even though child_profiles does not. Recorded as a
-- decision in FOLLOWUP.md.
CREATE TABLE IF NOT EXISTS child_guardian_consents (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Two separable claims. Never collapse: an auditor asks which was asserted.
  consents_to_processing boolean NOT NULL,
  attests_guardian_relationship boolean NOT NULL,

  performed_by varchar REFERENCES users(id) ON DELETE SET NULL,
  performed_by_name text NOT NULL,
  performed_by_email text NOT NULL,

  -- Which documents. The hash identifies them; the string is what the parent
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

CREATE INDEX IF NOT EXISTS idx_child_guardian_consents_performed_by ON child_guardian_consents (performed_by);

COMMENT ON TABLE child_guardian_consents IS
  'The parent''s own first-person consent act for their one named child (see child_profiles). Not organization_consents: no cohort, no child reference column needed because guardian_user_id already identifies the one subject. performed_by is ON DELETE SET NULL so the record outlives the parent''s own erasure - the denormalised name/email columns carry the identity.';

COMMENT ON COLUMN child_guardian_consents.attests_guardian_relationship IS
  'The parent''s own claim to be this child''s parent or legal guardian. Stored separately from consents_to_processing because the two are separable claims and this is the one carrying the legal weight.';

COMMENT ON COLUMN child_guardian_consents.policy_version IS
  'Boot-time content hash of the legal documents as served (server/utils/policyVersion.ts). Identifies the documents; does NOT assert they were correct or that a change was substantive.';
