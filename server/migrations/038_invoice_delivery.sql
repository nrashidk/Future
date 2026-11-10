-- EMAILING THE INVOICE, AND KNOWING WHETHER IT ARRIVED.
--
-- 037 gave the invoice a number, figures and a lifecycle. It had no way to
-- record that the thing had actually been SENT to anyone, which leaves the
-- chase conversation unanswerable: a school that has not paid and a school
-- that never received the bill look identical, and only one of them is
-- ignoring you.
--
-- email_sent_at IS NOT issued_at, and folding them together was the first
-- design. They are different facts: an invoice can be issued and handed over
-- on paper, or issued now and emailed a week later when the finance contact
-- comes back from leave. One column cannot express "issued but never
-- emailed", which is exactly the state worth seeing.
--
-- THE DELIVERY COLUMNS ARE THE SAME FOUR AS school_setup_tokens, deliberately
-- identical in name and meaning, joined on the provider's own message id and
-- written by the same Resend webhook under the same forward-only rule
-- (shared/emailDelivery.ts). Resend emits email.sent and email.delivered
-- milliseconds apart and they travel separately, so an event may only move a
-- row FORWARD or the status flickers with nothing in the product changing.
--
-- A BOUNCED INVOICE MATTERS MORE THAN A BOUNCED SIGN-IN LINK. A school
-- waiting for a bill that never arrived reads, from this end, exactly like a
-- school declining to pay — and the remedy is opposite in each case.
--
-- NULL STILL MEANS UNKNOWN, NOT FAILED. An unregistered webhook, an unset
-- RESEND_WEBHOOK_SECRET and Resend being down all produce nulls, as does every
-- invoice emailed before this migration. No surface may render one as "did
-- not arrive".
--
-- provider_message_id IS UNIQUE, which is what makes a Svix redelivery a no-op
-- rather than a second write, and what stops one event attaching itself to two
-- invoices. Partial, because every invoice that has not been emailed has a
-- null here and a plain UNIQUE would be satisfied by those nulls in Postgres
-- but the partial index states the intent and stays small.
--
-- ADDITIVE AND REVERSIBLE. Six nullable columns (one with a default of 0) and
-- one index. No existing column is altered and nothing is backfilled:
-- invoices raised before this migration were never emailed by the system, and
-- email_sent_count defaults to 0, which is true of them.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS email_sent_at       TIMESTAMP,
  ADD COLUMN IF NOT EXISTS email_sent_count    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR,
  ADD COLUMN IF NOT EXISTS delivery_status     VARCHAR,
  ADD COLUMN IF NOT EXISTS delivery_status_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivery_detail     VARCHAR;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_provider_msg_idx
  ON invoices (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- A count that cannot go negative. Not merely tidy: the superadmin surface
-- reads "emailed N times" straight off it, and a negative would print.
ALTER TABLE invoices
  DROP CONSTRAINT IF EXISTS invoices_email_sent_count_non_negative;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_email_sent_count_non_negative
  CHECK (email_sent_count >= 0);

-- DOWN (manual, not run by the runner):
--   ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_email_sent_count_non_negative;
--   DROP INDEX IF EXISTS invoices_provider_msg_idx;
--   ALTER TABLE invoices
--     DROP COLUMN IF EXISTS delivery_detail,
--     DROP COLUMN IF EXISTS delivery_status_at,
--     DROP COLUMN IF EXISTS delivery_status,
--     DROP COLUMN IF EXISTS provider_message_id,
--     DROP COLUMN IF EXISTS email_sent_count,
--     DROP COLUMN IF EXISTS email_sent_at;
--   -- Safe: nothing references these columns from another table, and the
--   -- invoice itself is unaffected. What is lost is the record of which
--   -- invoices were emailed and what became of those mails, which cannot be
--   -- reconstructed — Resend replays events only for a limited window.
