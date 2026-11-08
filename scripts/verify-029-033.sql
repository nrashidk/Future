-- READ-ONLY VERIFICATION FOR MIGRATIONS 029–033.
--
-- Run this BEFORE deploying and AGAIN after, against the same database, and
-- compare. It writes nothing — every statement is a SELECT, so it is safe to
-- run against production at any time.
--
-- WHY IT EXISTS. 029 is the only pending migration that changes existing
-- accounting: it backfills license_consumptions from completed assessments and
-- then REWRITES every school's used_licenses by counting those rows. If the
-- backfill undercounts, schools get licences they did not pay for; if it
-- overcounts, students are blocked from a report they are entitled to. Neither
-- raises an error. The before/after comparison is the only thing that catches
-- it, which is why the working rules demand it.
--
-- WHAT TO LOOK FOR, section by section:
--   1  used_licenses must not MOVE for any school. 029 recomputes it from the
--      ledger, so a changed number means the old counter and the new ledger
--      disagree about that school — investigate before going to production.
--   2  every completed assessment should have exactly one ledger row after.
--      Zero means a student consumed a licence nobody is charged for.
--   3  must be EMPTY after. A non-empty result is a school whose entitlement
--      does not match its grant history.
--   4  the UAE should read 3673 AED and nothing else should be priced.
--   5  curricula arrays must keep their ORDER. The first entry is the default
--      a school gets, so a reordered array silently changes it.
--   6  the five migrations must all be listed as applied.

\echo '=============== 1. LICENCE USAGE PER SCHOOL (must not move) ==============='
SELECT
  o.name,
  o.total_licenses,
  o.used_licenses                                   AS used_counter,
  o.is_unlimited_licenses                           AS unlimited,
  (SELECT count(*) FROM license_consumptions c
     WHERE c.organization_id = o.id)                AS ledger_rows,
  o.used_licenses - (SELECT count(*) FROM license_consumptions c
     WHERE c.organization_id = o.id)                AS counter_minus_ledger
FROM organizations o
ORDER BY o.name;

\echo ''
\echo '=============== 2. COMPLETED ASSESSMENTS vs LEDGER ROWS ==============='
-- Before the migration the ledger is empty, so expect 0 covered.
-- After it, uncovered should be 0: a completed assessment with no ledger row is
-- a report generated against nobody's balance.
SELECT
  count(*)                                                      AS completed_assessments,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM license_consumptions c WHERE c.assessment_id = a.id))  AS covered,
  count(*) FILTER (WHERE NOT EXISTS (
    SELECT 1 FROM license_consumptions c WHERE c.assessment_id = a.id))  AS uncovered
FROM assessments a
WHERE a.completed_at IS NOT NULL;

\echo ''
\echo '=============== 3. GRANTS RECONCILIATION (must be empty after) ==============='
-- Unlimited schools excluded: their total is a number with no meaning.
SELECT
  o.name,
  o.total_licenses,
  COALESCE(SUM(g.licenses_delta), 0)::int AS from_grants_ledger,
  COALESCE(SUM(g.licenses_delta), 0)::int - o.total_licenses AS difference
FROM organizations o
LEFT JOIN license_grants g ON g.organization_id = o.id
WHERE o.is_unlimited_licenses = false
GROUP BY o.id, o.name, o.total_licenses
HAVING COALESCE(SUM(g.licenses_delta), 0) <> o.total_licenses;

\echo ''
\echo '=============== 4. COUNTRY PRICING (UAE should be 3673 AED) ==============='
SELECT
  id, code, name,
  license_price_minor,
  license_currency,
  CASE
    WHEN license_price_minor IS NULL THEN 'falls back to USD 10.00'
    ELSE (license_price_minor / 100.0)::text || ' ' || license_currency
  END AS effective_price
FROM countries
ORDER BY (license_price_minor IS NULL), id;

\echo ''
\echo '=============== 5. CURRICULA ARRAYS (order must be preserved) ==============='
-- 030 removes empty curricula. The FIRST entry is the default a new school
-- gets, so a reordered array silently changes which curriculum that is.
SELECT id, name, curricula, curricula[1] AS default_curriculum,
       array_length(curricula, 1) AS how_many
FROM countries
ORDER BY id;

\echo ''
\echo '=============== 6. MIGRATIONS APPLIED ==============='
SELECT name, applied_at
FROM schema_migrations
WHERE name >= '029'
ORDER BY name;

\echo ''
\echo '=============== 7. TABLES THAT SHOULD NOW EXIST ==============='
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('license_consumptions', 'license_grants', 'contribution_reviews')
ORDER BY table_name;
