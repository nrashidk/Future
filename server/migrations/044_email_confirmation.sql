-- 044: A PARENT CONFIRMS THE EMAIL ADDRESS, OR THE ACCOUNT IS NOT KEPT.
--
-- From 2026-11-13 a parent may register a student account and stay free
-- (before that, registration led straight to payment, and a card payment was
-- the evidence that a real person was behind the address). A free account has
-- no such evidence: it holds a minor's name, date of birth and grade against
-- an address nobody has proved they own, and a mistyped address is a child's
-- record that nobody can recover or erase by themselves.
--
-- users.email_confirmation_due_at  set at registration, NULL everywhere else.
--                                  NULL means confirmation was never asked of
--                                  this account -- every existing account --
--                                  and NOT "unconfirmed".
-- users.email_confirmed_at         when the link was used.
--
-- An account past its due date, unconfirmed and unpaid is erased by the same
-- sweep that removes expired guest assessments. No backfill: no existing
-- account is asked to confirm anything.
--
-- email_confirmation_tokens is its own table, not password_reset_tokens with
-- a purpose column, so a confirmation link can never be spent as a password
-- reset. Only the token's SHA-256 is stored.

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmation_due_at timestamp;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamp;

CREATE TABLE IF NOT EXISTS email_confirmation_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar NOT NULL UNIQUE,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_confirmation_tokens_user_idx
  ON email_confirmation_tokens (user_id);

-- DOWN (paste by hand):
--
-- DROP TABLE IF EXISTS email_confirmation_tokens;
-- ALTER TABLE users DROP COLUMN IF EXISTS email_confirmed_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS email_confirmation_due_at;
