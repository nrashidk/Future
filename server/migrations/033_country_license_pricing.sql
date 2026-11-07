-- WHAT A LICENCE COSTS, PER COUNTRY, IN THAT COUNTRY'S MONEY.
--
-- Every school on the platform was charged in US dollars, from a hardcoded
-- $10 constant in server/routes/payment.routes.ts. No UAE business expects a
-- dollar invoice, and the buyer's bank adds a foreign-transaction fee on top
-- of the price for the privilege.
--
-- MINOR UNITS as an integer — fils, halalas, cents. Money in a float does not
-- add up, and Stripe is charged in minor units anyway. How many make one unit
-- depends on the currency, which is why the currency sits beside the number
-- and is never assumed: 1000 is ten dirhams but ONE dinar, and a Gulf
-- three-decimal currency read as two-decimal mischarges by a factor of ten.
--
-- NOT A CONVERTER. Each price is decided once and stored. A live rate in the
-- payment path would buy nothing here — the dirham and the riyal are both
-- pegged to the dollar — while adding a way for checkout to fail when a rate
-- service is down.
--
-- NULLABLE ON PURPOSE. A country added before anyone prices it must still
-- transact: shared/pricing.ts falls back to the dollar default and reports
-- that it did, so an unpriced country is a visible state rather than a failed
-- sale. A NOT NULL here would also refuse the country rows the LLM
-- onboarding creates before a human has set a price.
--
-- ADDITIVE AND REVERSIBLE: two new nullable columns, nothing read, nothing
-- rewritten, so the down migration drops them and the old dollar behaviour
-- returns by itself.

ALTER TABLE countries ADD COLUMN IF NOT EXISTS license_price_minor INTEGER;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS license_currency VARCHAR(3);

-- Both or neither, enforced here and not only in code. A price without a
-- currency cannot be charged and a currency without a price has nothing to
-- charge; letting half a configuration exist is how a country ends up billing
-- 3700 CENTS — thirty-seven dollars — for a thirty-seven dirham licence.
ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_license_price_pair_check;
ALTER TABLE countries ADD CONSTRAINT countries_license_price_pair_check CHECK (
  (license_price_minor IS NULL AND license_currency IS NULL)
  OR
  (license_price_minor IS NOT NULL AND license_currency IS NOT NULL AND license_price_minor > 0)
);

-- ------------------------------------------------------- OPENING PRICES --
--
-- Set at the EXACT peg conversion of the existing $10, rounded to the nearest
-- minor unit, and nothing else:
--
--   AED 36.73  = 10 x 3.6725   (dirham peg)
--   SAR 37.50  = 10 x 3.75     (riyal peg)
--
-- Rounded to the true conversion rather than up to a presentable 37.00 or
-- 40.00, because rounding up is a price RISE nobody asked for — 0.75% on the
-- dirham — and this migration's job is to change the currency, not the price.
-- Replace these with decided round numbers whenever the commercial call is
-- made; that is a one-row UPDATE, not a migration.
--
-- Matched on the id AND the ISO code, because the UAE row's id has been
-- spelled both 'uae' and 'ae' in this database's history and a migration that
-- silently matched neither would leave the country unpriced with no error.
UPDATE countries
   SET license_price_minor = 3673, license_currency = 'AED'
 WHERE license_price_minor IS NULL
   AND (LOWER(id) IN ('uae', 'ae') OR UPPER(code) IN ('ARE', 'AE'));

UPDATE countries
   SET license_price_minor = 3750, license_currency = 'SAR'
 WHERE license_price_minor IS NULL
   AND (LOWER(id) IN ('ksa', 'sa', 'saudi', 'saudi-arabia') OR UPPER(code) IN ('SAU', 'SA'));

-- Every other country is left NULL and transacts in dollars until priced.
-- Deliberately not guessed from the country's own currency: picking a number
-- nobody decided is how a platform ends up selling at a price it never agreed.

-- DOWN (manual, not run by the runner):
--   ALTER TABLE countries DROP CONSTRAINT IF EXISTS countries_license_price_pair_check;
--   ALTER TABLE countries DROP COLUMN IF EXISTS license_price_minor;
--   ALTER TABLE countries DROP COLUMN IF EXISTS license_currency;
--   -- Pricing falls back to the USD default on its own; nothing else to undo.
