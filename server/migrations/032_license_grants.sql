-- WHERE A SCHOOL'S LICENCES CAME FROM.
--
-- license_consumptions (029) records every licence SPENT and nothing recorded
-- where any of them came from. A school's payment lived in three columns on the
-- organization -- purchase_date, stripe_payment_id, amount_paid -- holding a
-- single purchase for ever, and the purchase path creates the organization and
-- refuses a second one, so a school could only ever buy once through Stripe.
-- Every top-up after that was a superadmin edit to total_licenses recording a
-- COUNT and no money at all.
--
-- So "paid versus consumed" was unanswerable: the consumed side exact, the paid
-- side whatever the school first bought. Per-country revenue did not exist in
-- any form, and Stripe cannot supply it -- Stripe knows amounts and customers,
-- not licences, schools, countries or curricula, and reward credits never touch
-- Stripe because they are earned rather than bought.
--
-- See the block comment on the table in shared/schema.ts for the model. This
-- file is only concerned with creating it and getting existing entitlement into
-- it without inventing revenue.
--
-- ADDITIVE AND REVERSIBLE. No existing column is changed or dropped;
-- organizations.total_licenses stays the authoritative value licence
-- enforcement reads, and purchase_date / stripe_payment_id / amount_paid keep
-- their values, so the down migration is a plain DROP TABLE.

CREATE TABLE IF NOT EXISTS license_grants (
  id                 VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL,
  licenses_delta     INTEGER NOT NULL,
  amount_paid        REAL,
  currency           VARCHAR(3),
  stripe_payment_id  VARCHAR,
  performed_by       VARCHAR REFERENCES users(id),
  note               TEXT,
  created_at         TIMESTAMP NOT NULL DEFAULT NOW(),

  CONSTRAINT license_grants_kind_check
    CHECK (kind IN ('purchase', 'comp', 'adjustment', 'backfill')),

  -- A purchase names its money; nothing else may claim any. A comp carrying an
  -- amount would show up in revenue having been given away.
  CONSTRAINT license_grants_purchase_money_check
    CHECK (
      (kind = 'purchase' AND amount_paid IS NOT NULL AND currency IS NOT NULL)
      OR
      (kind <> 'purchase' AND amount_paid IS NULL AND currency IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS license_grants_org_idx ON license_grants (organization_id);
CREATE INDEX IF NOT EXISTS license_grants_created_idx ON license_grants (created_at);

-- PARTIAL, and that is the point: most rows legitimately have no Stripe id, and
-- a plain unique index would permit only one of them. Unique where present is
-- what makes a webhook redelivery safe -- Stripe retries, and without this a
-- retry would grant the licences a second time. Same reason the assessment id
-- is unique on license_consumptions.
CREATE UNIQUE INDEX IF NOT EXISTS license_grants_stripe_payment_idx
  ON license_grants (stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL;

-- ---------------------------------------------------------------- BACKFILL --
--
-- One row per existing school, so that the sum of deltas equals its
-- total_licenses from the moment this table exists. Without it every school
-- looks like it was granted nothing, and the reconciliation report that is the
-- whole point of the table would flag all of them.
--
-- KIND IS 'backfill', NOT 'purchase', even for a school that has a Stripe id.
-- The money for most of these is unknown: amount_paid holds one payment and
-- total_licenses may have been edited upwards many times since, so recording
-- the pair as a purchase would assert that this amount bought this many
-- licences, which is not known to be true. Reporting invented revenue is worse
-- than reporting none. The known Stripe id and amount are preserved in the note
-- instead of in the money columns, where they cannot be summed by accident.
--
-- SKIPS SCHOOLS WITH NO LICENCES. A zero-delta row for a school that was never
-- granted anything says nothing and would have to be filtered out of every
-- report. Its ledger sum is zero either way, so reconciliation still agrees.
--
-- UNLIMITED SCHOOLS get a row for whatever total_licenses holds, which for them
-- is a meaningless number. The reconciliation report excludes unlimited schools
-- rather than this migration trying to decide what their entitlement "is".
--
-- IDEMPOTENT: the NOT EXISTS makes a second run a no-op rather than doubling
-- every school's entitlement.
INSERT INTO license_grants (organization_id, kind, licenses_delta, note, created_at)
SELECT
  o.id,
  'backfill',
  o.total_licenses,
  CONCAT(
    'Backfilled by migration 032 from organizations.total_licenses.',
    CASE WHEN o.stripe_payment_id IS NOT NULL
      THEN CONCAT(' Stripe payment on record: ', o.stripe_payment_id) ELSE '' END,
    CASE WHEN o.amount_paid IS NOT NULL
      THEN CONCAT(' Amount on record: ', o.amount_paid::text,
                  ' (one payment only; not attributed to this licence count).') ELSE '' END,
    CASE WHEN o.is_unlimited_licenses
      THEN ' School is on an unlimited plan, so this count is not its entitlement.' ELSE '' END
  ),
  -- The purchase date where there is one, so revenue-by-period reporting is not
  -- told that every historic school was granted its licences today.
  COALESCE(o.purchase_date, o.created_at, NOW())
FROM organizations o
WHERE o.total_licenses <> 0
  AND NOT EXISTS (SELECT 1 FROM license_grants g WHERE g.organization_id = o.id);

-- DOWN (manual, not run by the runner):
--   DROP TABLE license_grants;
--   -- Nothing else to undo: no existing column was read, written or dropped,
--   -- and total_licenses was never derived from this table.
