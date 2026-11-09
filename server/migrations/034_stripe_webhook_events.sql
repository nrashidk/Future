-- DELIVERY-LEVEL IDEMPOTENCY FOR THE STRIPE WEBHOOK.
--
-- The webhook's only duplicate guard was
-- `paymentIntent.metadata.processed === "true"`, read off the EVENT PAYLOAD.
-- An event payload carries the snapshot taken when the event was CREATED, so
-- on a genuine Stripe retry that flag is absent even though the first delivery
-- stamped the PaymentIntent -- the guard reads "not processed" every time.
-- What actually stopped a second grant was grantIndividualPremium's
-- already_premium no-op, which relies on isPremium having been flipped. That
-- is account state standing in for delivery state, and it does nothing for a
-- path that grants without setting isPremium first.
--
-- event.id is the only durable delivery identity Stripe gives, and it was
-- logged and discarded. This table stores it and lets the PRIMARY KEY decide:
-- the handler inserts before doing any work, and a delivery that loses the
-- insert does nothing. Two concurrent retries cannot both win, which
-- check-then-act in application code cannot promise.
--
-- A real retry loop of this shape was observed in production: a grant
-- succeeded, the paymentIntents.update that stamps `processed` failed, so the
-- flag was never written and Stripe retried indefinitely.
--
-- NO PERSONAL DATA. An event id, a type, two timestamps. The payload holds a
-- buyer's email and a student's details and is deliberately not stored -- this
-- deduplicates deliveries, it does not archive them. Nothing here references a
-- person, so there is no data-subject classification to add.
--
-- ADDITIVE AND REVERSIBLE. Creates one table, changes no existing column, and
-- backfills nothing: there is no history to recover, because event ids were
-- never recorded. Deliveries already handled before this migration are
-- therefore unknown to it, which is correct and harmless -- their
-- PaymentIntents are already stamped and the existing guards still apply.

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  -- Stripe's own id (evt_...), not a surrogate uuid: the identity comes from
  -- Stripe, so there is nothing to generate and nothing to get out of step.
  event_id      VARCHAR PRIMARY KEY,
  event_type    TEXT NOT NULL,
  received_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  -- NULL means claimed but unfinished: in flight, or a handler that died. The
  -- handler deletes its own claim on failure so Stripe's retry can proceed, so
  -- a lasting NULL means a process died mid-handler. Not solved with a lease or
  -- a timeout -- both add a way to double-grant -- but made VISIBLE: this
  -- column is the query that finds it, and
  -- GET /api/superadmin/payments/unreconciled already lists succeeded
  -- PaymentIntents that were never granted.
  processed_at  TIMESTAMP
);

-- Finding abandoned claims, and reading the delivery log in order.
CREATE INDEX IF NOT EXISTS stripe_webhook_events_received_idx
  ON stripe_webhook_events (received_at);

-- DOWN (manual, not run by the runner):
--   DROP INDEX IF EXISTS stripe_webhook_events_received_idx;
--   DROP TABLE IF EXISTS stripe_webhook_events;
--   -- Nothing else to undo: no other table references this one, and the
--   -- metadata.processed guard it supplements is untouched and still in place.
