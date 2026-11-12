-- THE SCHOOL'S OWN REFERENCE NUMBER.
--
-- A school's finance department raises a purchase order before it will settle
-- anything, and its accounting system matches an incoming invoice to that PO
-- number. Without it on the document, the invoice has to be matched by hand or
-- queried back to us — which is exactly the friction that turns a settled bill
-- into a chased one.
--
-- IT IS THEIRS, NOT OURS, and that is why it is a separate column rather than
-- a reuse of `payment_reference`. `payment_reference` is OUR record of THEIR
-- bank transfer: it is written when the invoice is marked paid, by us, and it
-- does not exist while the invoice is outstanding. The document was labelling
-- that column "Your reference", so the one field a school needs in order to
-- pay was absent from every unpaid invoice and present only after the money
-- had already arrived.
--
-- NULLABLE AND OPTIONAL. Plenty of schools pay without raising a PO at all,
-- and an invoice with no PO is an ordinary invoice, not an incomplete one.
-- A blank is never rendered as an empty row on the document.
--
-- FREE TEXT, BOUNDED. A PO reference has no format anyone agrees on — digits,
-- "PO-2026-114", a cost-centre code, an Arabic string — so this validates
-- length and nothing else. 100 characters is well past any real one and short
-- enough that it cannot be used to smuggle a paragraph onto the invoice.
--
-- NOT UNIQUE. Two schools may use the same numbering, and one school may put
-- the same PO against several invoices when it orders in instalments.
--
-- ADDITIVE AND REVERSIBLE. One nullable column, no backfill: invoices raised
-- before this migration genuinely had no PO recorded, and NULL says exactly
-- that.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS purchase_order_ref VARCHAR(100);

-- Length enforced at the database as well as in zod, because the superadmin
-- route is not the only thing that will ever write this row.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_po_ref_length;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_po_ref_length
  CHECK (purchase_order_ref IS NULL OR char_length(purchase_order_ref) <= 100);

-- DOWN (manual, not run by the runner):
--   ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_po_ref_length;
--   ALTER TABLE invoices DROP COLUMN IF EXISTS purchase_order_ref;
--   -- Safe: nothing references this column from another table and no figure
--   -- is derived from it. What is lost is each school's own reference, which
--   -- cannot be reconstructed from anything we hold — only from asking them.
