-- VERIFICATION, TO RUN **AFTER** MIGRATIONS 029-033.
--
-- Run scripts/verify-before.sql FIRST, against the same database, and keep
-- its output. This file needs the new tables and columns to exist, so it only
-- works once the migrations have run.
--
-- Paste this whole file into any SQL console (the Neon editor, psql, a GUI).
-- It writes NOTHING — every statement is a SELECT — so it is safe to run
-- against production at any time, as often as you like.
--
-- PLAIN SQL ONLY. An earlier version used psql's \echo for section headings,
-- which is not SQL: it fails in a web console and, worse, the Node pg driver
-- rejects it with a syntax error. Section labels are now SELECTed as data.
--
-- RUN IT TWICE: once before applying the migrations, once after, and compare.
-- Query 1 is the whole verdict in one table — that is the one to read, and the
-- one to send back if anything says PROBLEM. The rest is detail behind it.
--
-- WHY IT EXISTS: 029 is the only pending migration that changes existing
-- accounting. It backfills license_consumptions from completed assessments and
-- then REWRITES every school's used_licenses by counting those rows. If the
-- backfill undercounts, schools get licences they never paid for; if it
-- overcounts, students are blocked from a report they are entitled to. Neither
-- raises an error, so this comparison is the only thing that catches it.


-- ============================================================
-- QUERY 1 — THE VERDICT. Read this one. Every row should say OK.
-- ============================================================
SELECT * FROM (

  -- Are the five migrations in?
  SELECT 1 AS n,
         'migrations 029-033 applied' AS check_name,
         count(*)::text || ' of 5' AS value,
         CASE WHEN count(*) = 5 THEN 'OK — all five applied'
              WHEN count(*) = 0 THEN 'NOT YET — this is the "before" run'
              ELSE 'PROBLEM — partially applied, send this to Claude' END AS verdict
  FROM schema_migrations
  WHERE name LIKE '029%' OR name LIKE '030%' OR name LIKE '031%'
     OR name LIKE '032%' OR name LIKE '033%'

  UNION ALL

  -- Nothing but migrations should ever be recorded as one.
  SELECT 2,
         'no stray non-migration files applied',
         count(*)::text || ' stray',
         CASE WHEN count(*) = 0 THEN 'OK — nothing stray'
              ELSE 'PROBLEM — a non-migration file was applied as one' END
  FROM schema_migrations
  WHERE name NOT SIMILAR TO '[0-9][0-9][0-9]_%'

  UNION ALL

  -- A CONSISTENCY CHECK, NOT A DRIFT CHECK — and the difference matters.
  --
  -- 029 SETS used_licenses from a count of ledger rows, so immediately after
  -- it runs this cannot fail: it would be asserting that the migration did
  -- its own last statement. It earns its place later, catching code that
  -- changes one side without the other.
  --
  -- THE REAL CHECK ON 029 CANNOT BE DONE IN SQL ALONE: compare query 2 here
  -- against query 1 of verify-before.sql, school by school. used_licenses
  -- WILL move — that is the migration's job — but every move needs a reason.
  -- A school whose figure jumps means its old counter had drifted from what
  -- its students actually consumed, and a large jump on a real school is
  -- worth asking about before production.
  SELECT 3,
         'used_licenses consistent with the ledger',
         count(*)::text || ' school(s) disagree',
         CASE WHEN count(*) = 0 THEN 'OK — consistent (compare query 2 to the before run for the real check)'
              ELSE 'PROBLEM — see query 2, send it to Claude' END
  FROM organizations o
  WHERE o.used_licenses <> (
          SELECT count(*) FROM license_consumptions c WHERE c.organization_id = o.id)

  UNION ALL

  -- A completed assessment with no ledger row is a report generated against
  -- nobody's balance.
  --
  -- is_completed, NOT completed_at. The migration's backfill joins on
  -- `a.is_completed = TRUE`, and the two markers can disagree — a row with a
  -- timestamp but the flag unset is skipped by the migration on purpose.
  -- Counting by completed_at here would report those as uncovered and raise a
  -- false alarm on a deploy that was fine. Check 10 reports the disagreement
  -- itself.
  SELECT 4,
         'completed assessments covered by the ledger',
         count(*) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM license_consumptions c WHERE c.assessment_id = a.id))::text
           || ' uncovered of ' || count(*)::text,
         CASE WHEN count(*) = 0 THEN 'OK — no completed assessments yet'
              WHEN count(*) FILTER (WHERE NOT EXISTS (
                SELECT 1 FROM license_consumptions c WHERE c.assessment_id = a.id)) = 0
                THEN 'OK — every one has a ledger row'
              ELSE 'PROBLEM — see query 3, send it to Claude' END
  FROM assessments a
  WHERE a.is_completed = TRUE

  UNION ALL

  -- Does each school's entitlement match its grant history? Unlimited schools
  -- are excluded: their total is a number with no meaning.
  SELECT 5,
         'licence totals match the grants ledger',
         count(*)::text || ' school(s) disagree',
         CASE WHEN count(*) = 0 THEN 'OK — every total is explained'
              ELSE 'PROBLEM after the migration — see query 4' END
  FROM (
    SELECT o.id
    FROM organizations o
    LEFT JOIN license_grants g ON g.organization_id = o.id
    WHERE o.is_unlimited_licenses = false
    GROUP BY o.id, o.total_licenses
    HAVING COALESCE(SUM(g.licenses_delta), 0) <> o.total_licenses
  ) mismatched

  UNION ALL

  -- The UAE should be priced in dirhams at the exact peg conversion.
  SELECT 6,
         'UAE priced in dirhams (3673 = AED 36.73)',
         COALESCE(
           (SELECT license_price_minor::text || ' ' || license_currency
              FROM countries
             WHERE (LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE'))
               AND license_price_minor IS NOT NULL
             LIMIT 1),
           'not priced'),
         CASE WHEN EXISTS (
                SELECT 1 FROM countries
                 WHERE (LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE'))
                   AND license_price_minor = 3673 AND license_currency = 'AED')
              THEN 'OK — dirhams at the peg'
              WHEN NOT EXISTS (
                SELECT 1 FROM countries
                 WHERE (LOWER(id) IN ('uae','ae') OR UPPER(code) IN ('ARE','AE'))
                   AND license_price_minor IS NOT NULL)
              THEN 'NOT YET — before the migration, or you cleared it on purpose'
              ELSE 'CHECK — priced, but not the figure the migration sets' END

  UNION ALL

  -- A price with no currency, or a currency with no price, cannot be charged.
  SELECT 7,
         'no half-configured country prices',
         count(*)::text || ' half-configured',
         CASE WHEN count(*) = 0 THEN 'OK'
              ELSE 'PROBLEM — a price without a currency, or the reverse' END
  FROM countries
  WHERE (license_price_minor IS NULL) <> (license_currency IS NULL)

  UNION ALL

  -- 030 rewrites the curricula array. Its FIRST entry is the default a new
  -- school gets, so an emptied or reordered array changes that silently.
  SELECT 8,
         'every country still offers at least one curriculum',
         count(*)::text || ' with none',
         CASE WHEN count(*) = 0 THEN 'OK — none left empty'
              ELSE 'PROBLEM — a country with no curriculum cannot run a quiz' END
  FROM countries
  WHERE curricula IS NULL OR array_length(curricula, 1) IS NULL

  UNION ALL

  -- The three new tables.
  SELECT 9,
         'new tables exist',
         count(*)::text || ' of 3',
         CASE WHEN count(*) = 3 THEN 'OK'
              WHEN count(*) = 0 THEN 'NOT YET — this is the "before" run'
              ELSE 'PROBLEM — partially created' END
  FROM information_schema.tables
  WHERE table_name IN ('license_consumptions', 'license_grants', 'contribution_reviews')

  UNION ALL

  -- THE TWO COMPLETION MARKERS, and whether they agree.
  --
  -- Not a pass/fail — a number to know. The backfill charges a licence for
  -- every assessment with is_completed TRUE. A row carrying completed_at
  -- WITHOUT that flag is skipped, so a student who appears finished is not
  -- billed; the reverse is billed without a timestamp. Either way the count
  -- here explains any surprise in how many ledger rows appeared.
  SELECT 10,
         'is_completed vs completed_at agreement',
         count(*) FILTER (WHERE is_completed AND completed_at IS NULL)::text
           || ' flagged with no timestamp, '
           || count(*) FILTER (WHERE NOT is_completed AND completed_at IS NOT NULL)::text
           || ' timestamped but not flagged',
         CASE WHEN count(*) FILTER (WHERE is_completed <> (completed_at IS NOT NULL)) = 0
              THEN 'OK — the two agree everywhere'
              ELSE 'FOR INFORMATION — the backfill follows is_completed' END
  FROM assessments

) verdict
ORDER BY n;


-- ============================================================
-- QUERY 2 — detail for check 3: usage per school.
-- counter_minus_ledger must be 0 for every school after the migration.
-- ============================================================
SELECT
  o.name,
  o.total_licenses,
  o.used_licenses AS used_counter,
  o.is_unlimited_licenses AS unlimited,
  (SELECT count(*) FROM license_consumptions c WHERE c.organization_id = o.id) AS ledger_rows,
  o.used_licenses - (SELECT count(*) FROM license_consumptions c
                       WHERE c.organization_id = o.id) AS counter_minus_ledger
FROM organizations o
ORDER BY abs(o.used_licenses - (SELECT count(*) FROM license_consumptions c
                                  WHERE c.organization_id = o.id)) DESC,
         o.name;


-- ============================================================
-- QUERY 3 — detail for check 4: completed assessments with no ledger row.
-- Empty after the migration. Capped at 50 rows.
-- ============================================================
SELECT a.id AS assessment_id, a.user_id, a.grade, a.is_completed, a.completed_at
FROM assessments a
WHERE a.is_completed = TRUE
  AND NOT EXISTS (SELECT 1 FROM license_consumptions c WHERE c.assessment_id = a.id)
ORDER BY a.completed_at DESC NULLS LAST
LIMIT 50;


-- ============================================================
-- QUERY 4 — detail for check 5: entitlement vs grant history.
-- Empty after the migration.
-- ============================================================
SELECT
  o.name,
  o.total_licenses,
  COALESCE(SUM(g.licenses_delta), 0)::int AS from_grants_ledger,
  COALESCE(SUM(g.licenses_delta), 0)::int - o.total_licenses AS difference
FROM organizations o
LEFT JOIN license_grants g ON g.organization_id = o.id
WHERE o.is_unlimited_licenses = false
GROUP BY o.id, o.name, o.total_licenses
HAVING COALESCE(SUM(g.licenses_delta), 0) <> o.total_licenses
ORDER BY o.name;


-- ============================================================
-- QUERY 5 — country pricing and curricula, for the eye.
-- The first curriculum listed is the default a new school gets.
-- ============================================================
SELECT
  id, code, name,
  CASE WHEN license_price_minor IS NULL THEN 'falls back to USD 10.00'
       ELSE (license_price_minor / 100.0)::text || ' ' || license_currency END AS effective_price,
  curricula,
  curricula[1] AS default_curriculum
FROM countries
ORDER BY (license_price_minor IS NULL), id;
