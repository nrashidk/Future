-- TELLING "IT BOUNCED" FROM "THEY HAVE NOT OPENED IT YET".
--
-- 035 closed with a paragraph saying exactly what it could not record, and
-- this is that paragraph. `sent_at` records that RESEND ACCEPTED the message.
-- Everything after that -- a hard bounce off a misspelled domain, a spam
-- folder, a corporate gateway that silently dropped it, or an inbox the buyer
-- simply has not looked at -- was one indistinguishable null in `used_at`.
--
-- Those need OPPOSITE actions from a superadmin. A bounce means the address is
-- wrong and the remedy is to correct it; an unopened inbox means the mail is
-- sitting there and the remedy is to resend or telephone. Offering "Resend"
-- for both sends a bounced link to the same dead address a second time, and
-- the product looks broken to the only person able to fix it.
--
-- FOUR COLUMNS ON THE EXISTING TABLE, NOT A NEW ONE. A general
-- email_deliveries table keyed by provider message id was the first design and
-- was dropped: it would have introduced a second column referencing a person
-- (requiring its own subject-access classification and its own erasure
-- ordering) to serve one surface, and this repo's own history is of
-- speculative structure drifting out of step with the code. Password-reset
-- delivery is a DELIBERATE non-goal here -- a reset is requested by someone
-- already watching their inbox, who retries by themselves when nothing
-- arrives, so the information has no action attached to it.
--
-- provider_message_id is the join key: Resend's own id for the message,
-- captured at send time from the send call's response. A webhook event
-- carrying an id this table does not hold is another mail entirely -- a
-- password reset, a guest report recovery -- and the handler ignores it and
-- answers 200. It is UNIQUE, which is what makes a Svix redelivery a no-op
-- rather than a second row.
--
-- delivery_status is NULL until a webhook event arrives, and null means
-- UNKNOWN, not failed. Every surface must keep that distinction: an
-- unconfigured webhook, a webhook secret that has not been set, or Resend
-- being down all produce nulls, and reporting those as "did not arrive" would
-- be the same confident-but-wrong claim this migration exists to remove.
-- shared/emailDelivery.ts holds the permitted values and, more importantly,
-- the rule about which may replace which: Resend does not guarantee event
-- order, and `email.sent` arriving after `email.delivered` is ordinary.
--
-- NO PERSONAL DATA IS ADDED. The recipient address is NOT stored here -- it is
-- already reachable through user_id, which subjectAccess.ts classifies as this
-- person's own data (section schoolSetupRequests). The three new facts are
-- about a message, not about a person, so the registry needs no new entry;
-- the export gains the status alongside the dates it already returns, and
-- erasure is unchanged because these columns live on a row that already
-- cascades from users.
--
-- ADDITIVE AND REVERSIBLE. Four nullable columns and one index. No existing
-- column is altered, nothing is backfilled, and no default is applied: tokens
-- issued before this migration keep a null status, which is honest -- nobody
-- recorded what happened to those mails and nobody can now.

ALTER TABLE school_setup_tokens
  ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR,
  ADD COLUMN IF NOT EXISTS delivery_status     VARCHAR,
  ADD COLUMN IF NOT EXISTS delivery_status_at  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS delivery_detail     VARCHAR;

-- The webhook's only lookup, and the reason a redelivered event cannot create
-- a duplicate. UNIQUE rather than a plain index: two token rows claiming the
-- same provider message would make "which school did this bounce belong to?"
-- unanswerable. Partial, because every row issued before this migration -- and
-- every token minted but not yet sent -- has a null here, and a plain UNIQUE
-- would be satisfied by those nulls in Postgres but the partial index states
-- the intent and stays small.
CREATE UNIQUE INDEX IF NOT EXISTS school_setup_tokens_provider_msg_idx
  ON school_setup_tokens (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- DOWN (manual, not run by the runner):
--   DROP INDEX IF EXISTS school_setup_tokens_provider_msg_idx;
--   ALTER TABLE school_setup_tokens
--     DROP COLUMN IF EXISTS delivery_detail,
--     DROP COLUMN IF EXISTS delivery_status_at,
--     DROP COLUMN IF EXISTS delivery_status,
--     DROP COLUMN IF EXISTS provider_message_id;
--   -- Safe: nothing references these columns from another table, and no data
--   -- outside them was changed. What is lost is the delivery history itself,
--   -- which cannot be reconstructed -- Resend replays events only for a
--   -- limited window. Reverting returns every surface to "not used", which is
--   -- the state 035 shipped with.
