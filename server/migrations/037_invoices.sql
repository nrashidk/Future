-- THE SALE A SCHOOL ACTUALLY MAKES.
--
-- Schools buy licences by bank transfer against a purchase order, not by card
-- on a web form. Stripe was never going to be their channel, and the trade
-- licence that would activate it is still pending -- but the sale can happen
-- today, and until now it lived nowhere. A superadmin typed a licence count
-- and an amount into the grant route and the only trace was a ledger row with
-- a free-text note. There was nothing to send the school, nothing to chase,
-- and no way to answer "what is outstanding".
--
-- NOT A SECOND SOURCE OF ENTITLEMENT, and this is the constraint the whole
-- design hangs on. Marking an invoice paid calls `recordLicenseGrant` inside
-- the SAME transaction, so `license_grants` stays the one ledger that
-- `GET /api/superadmin/licenses/reconciliation` reads. An invoice is the
-- paper; the grant is the fact. A second path that changed entitlement
-- without recording a grant row is precisely what that reconciliation exists
-- to catch, and building one here would be writing the bug it was built for.
--
-- THE BILL-TO COLUMNS ARE A SNAPSHOT, NOT A JOIN. An invoice is a historical
-- document: a school that renames itself, or is deleted, must not retroactively
-- change a document it was already sent. organization_id is therefore nullable
-- and ON DELETE SET NULL -- the invoice outlives the school, which is the
-- point of an accounting record. Every figure and every name needed to
-- reprint it is on the row.
--
-- VAT IS BUILT AND DORMANT. vat_rate_bp defaults to 0 and supplier_trn is
-- null, which makes every invoice issued today a PROFORMA. There is no trade
-- licence, so there is no TRN, and a document headed "Tax Invoice" without one
-- is a compliance problem rather than a cosmetic one. The arithmetic that will
-- be needed is already written and already tested (shared/invoice.test.ts).
-- The TRN is stored ON THE INVOICE rather than read from a global setting at
-- display time, so recording one later does not retitle every historical
-- proforma as a tax invoice.
--
-- BASIS POINTS for the rate, not a percentage or a fraction. 500 = 5%. The
-- alternative is a float, and 0.05 is not exactly representable -- a rate
-- stored that way and multiplied by a subtotal is how a receipt ends up one
-- fil out with no explanation anyone can give the customer.
--
-- MONEY IN MINOR UNITS with the currency beside it, like every other price in
-- this schema. 1000 minor units is ten dirhams but ONE dinar, and the Gulf
-- three-decimal currencies mis-record by a factor of ten if read as
-- hundredths.
--
-- PERSONAL DATA: created_by references a person, so it is classified in
-- server/services/subjectAccess.ts as an ACTOR -- a fact about the SCHOOL's
-- purchase, not about the superadmin who raised it -- and it is a blocking
-- audit source in accountErasure.ts, exactly like license_grants.performed_by
-- and for the same reason: these rows are what revenue reconciles against, so
-- losing one leaves a figure unexplainable. bill_to_email is a business
-- contact snapshotted onto a financial record, the same way
-- organization_consents keeps its attester's address after erasure.
--
-- ADDITIVE AND REVERSIBLE. One new table. No existing column is altered and
-- nothing is backfilled: sales made before this migration have a ledger row
-- and no invoice, which is honest -- inventing invoice numbers for them would
-- put documents into a numbered sequence that was never sent to anybody.

CREATE TABLE IF NOT EXISTS invoices (
  id                  VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FP-2026-0001. Unique across all years; the year/sequence pair below is
  -- what makes next January's numbering a MAX() rather than a string parse.
  number              VARCHAR NOT NULL UNIQUE,
  year                INTEGER NOT NULL,
  sequence            INTEGER NOT NULL,

  organization_id     VARCHAR REFERENCES organizations(id) ON DELETE SET NULL,

  bill_to_name        VARCHAR NOT NULL,
  bill_to_email       VARCHAR,
  bill_to_address     TEXT,

  student_count       INTEGER NOT NULL,
  unit_price_minor    INTEGER NOT NULL,
  per_student_minor   INTEGER NOT NULL,
  discount_percent    INTEGER NOT NULL DEFAULT 0,
  subtotal_minor      INTEGER NOT NULL,
  vat_rate_bp         INTEGER NOT NULL DEFAULT 0,
  vat_minor           INTEGER NOT NULL DEFAULT 0,
  total_minor         INTEGER NOT NULL,
  currency            VARCHAR(3) NOT NULL,
  supplier_trn        VARCHAR,

  status              VARCHAR NOT NULL DEFAULT 'draft',
  issued_at           TIMESTAMP,
  due_at              TIMESTAMP,
  paid_at             TIMESTAMP,
  payment_reference   VARCHAR,
  license_grant_id    VARCHAR REFERENCES license_grants(id) ON DELETE SET NULL,

  notes               TEXT,
  created_by          VARCHAR REFERENCES users(id),
  created_at          TIMESTAMP DEFAULT NOW(),
  updated_at          TIMESTAMP DEFAULT NOW(),

  -- ONE SEQUENCE PER YEAR, enforced rather than hoped for. A repeated invoice
  -- number is the single defect a finance department cannot work around, and
  -- a uniqueness rule that lives only in application code is one concurrent
  -- request away from being broken.
  CONSTRAINT invoices_year_sequence_unique UNIQUE (year, sequence),

  -- A status outside the four would make canTransition refuse every move and
  -- strand the row with no way to explain why.
  CONSTRAINT invoices_status_valid
    CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),

  -- Nobody is billed for zero students, and a negative count would invert
  -- every figure below it.
  CONSTRAINT invoices_student_count_positive CHECK (student_count > 0),

  CONSTRAINT invoices_amounts_non_negative
    CHECK (unit_price_minor >= 0 AND per_student_minor >= 0
           AND subtotal_minor >= 0 AND vat_minor >= 0 AND vat_rate_bp >= 0),

  -- THE ARITHMETIC IS GUARANTEED HERE, not merely computed correctly in one
  -- TypeScript function. shared/invoice.ts is the only thing that should ever
  -- write these columns, but a hand-run UPDATE, a future second caller or a
  -- refactor that reorders two lines would all pass review and produce a
  -- document whose total does not equal its own line items. The database is
  -- the only place that can refuse that.
  CONSTRAINT invoices_total_is_sum CHECK (total_minor = subtotal_minor + vat_minor),

  -- A paid invoice without a payment date cannot be aged, reconciled or
  -- explained. Same both-or-neither shape as the country price/currency pair.
  CONSTRAINT invoices_paid_has_date CHECK (status <> 'paid' OR paid_at IS NOT NULL),

  -- An issued invoice has been SENT. Without the date there is nothing to
  -- count payment terms from.
  CONSTRAINT invoices_issued_has_date
    CHECK (status NOT IN ('issued', 'paid') OR issued_at IS NOT NULL)
);

-- The superadmin listing filters by school and by status.
CREATE INDEX IF NOT EXISTS invoices_organization_idx ON invoices (organization_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices (status);

-- DOWN (manual, not run by the runner):
--   DROP INDEX IF EXISTS invoices_status_idx;
--   DROP INDEX IF EXISTS invoices_organization_idx;
--   DROP TABLE IF EXISTS invoices;
--   -- Safe in the sense that nothing references this table: license_grants
--   -- does not know about invoices, so entitlement and revenue reconciliation
--   -- are unaffected by dropping it. What is lost is the billing record
--   -- itself -- which invoices were sent, to whom, and what is outstanding --
--   -- and that cannot be reconstructed from the ledger, because a grant row
--   -- records money received and never money ASKED for.
