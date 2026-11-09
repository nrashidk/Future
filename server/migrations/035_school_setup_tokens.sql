-- THE FIRST WAY INTO AN ACCOUNT NOBODY CHOSE A PASSWORD FOR.
--
-- A group purchase mints the buyer's account server-side. The generated
-- password was returned in the HTTP response and rendered once on the checkout
-- success screen, and sent nowhere: no email is issued on purchase by any code
-- path. Close the tab -- or have the Stripe webhook complete the purchase
-- while the browser never comes back, which is the case 034 and the group
-- backstop exist for -- and the only remaining route in is "Forgot password".
--
-- That is a recovery flow standing in for an onboarding one, and a real buyer
-- reached it on 2026-11-09: UAE Skool, 100 licences, AED 3,600, an account its
-- owner could not sign into and a school with no curriculum, therefore blocked
-- from enrolling anybody by schoolSetupGate.
--
-- DELIBERATELY NOT password_reset_tokens, though the shape is copied from it.
-- Three differences that matter:
--   * 7 days, not 1 hour. A reset is requested by someone already watching
--     their inbox; this arrives unannounced after a purchase.
--   * It may be RE-SENT by a superadmin. A reset token never is.
--   * sent_at / sent_count are the only evidence the system holds that the
--     mail went out, and they are what the superadmin setup column reads.
-- Overloading the reset table would have meant a password reset silently
-- invalidating a pending setup link, or the reverse.
--
-- WHAT THIS CANNOT RECORD: delivery. used_at proves the link was CLICKED. A
-- null used_at means unused, which covers a bounce, a spam folder and an
-- unopened inbox alike -- telling those apart needs Resend's delivery
-- webhooks, which are not wired. Every surface reading this says "not used",
-- never "not delivered".
--
-- PERSONAL DATA: user_id references a person, so it is classified in
-- server/services/subjectAccess.ts as that person's own data, section
-- schoolSetupRequests, alongside the password-reset entry it mirrors. The
-- TOKEN VALUE is a credential and is never returned there -- only the
-- timestamps, which is exactly how passwordResetRequests already treats it.
--
-- ADDITIVE AND REVERSIBLE. One new table. No existing column is altered and
-- nothing is backfilled: accounts created before this migration have no setup
-- token, which is correct -- they are either already in use or recoverable
-- through password reset, and inventing tokens for them would mail live
-- sign-in links to people who did not ask for one.

CREATE TABLE IF NOT EXISTS school_setup_tokens (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable: a token is minted inside the Stripe purchase transaction, where
  -- the organization does not yet exist on every path. Same reason
  -- organizations.country_id is nullable -- a NOT NULL here would roll back a
  -- payment already taken.
  organization_id  VARCHAR REFERENCES organizations(id) ON DELETE CASCADE,
  token            VARCHAR NOT NULL UNIQUE,
  expires_at       TIMESTAMP NOT NULL,
  used_at          TIMESTAMP,
  sent_at          TIMESTAMP,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- Finding a user's live token without scanning: the issue path checks for an
-- existing unused one rather than minting a second, so a raced purchase sends
-- one mail and not two.
CREATE INDEX IF NOT EXISTS school_setup_tokens_user_idx
  ON school_setup_tokens (user_id);

-- The superadmin setup column joins from the school.
CREATE INDEX IF NOT EXISTS school_setup_tokens_org_idx
  ON school_setup_tokens (organization_id);

-- DOWN (manual, not run by the runner):
--   DROP INDEX IF EXISTS school_setup_tokens_org_idx;
--   DROP INDEX IF EXISTS school_setup_tokens_user_idx;
--   DROP TABLE IF EXISTS school_setup_tokens;
--   -- Nothing else to undo: no existing table references this one, no column
--   -- was altered, and no data was moved. Dropping it returns the product to
--   -- "the success screen is the only place credentials appear", which is the
--   -- state this migration exists to end -- so reverting is safe but
--   -- reintroduces the defect.
