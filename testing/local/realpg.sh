#!/bin/bash
# Run harness suites against a REAL PostgreSQL (races need real connections).
#   testing/local/realpg.sh races [suite ...]
# Starts a throwaway Postgres 16 cluster on :56432 (as user postgres), wipes the
# schema, pushes it, boots up.ts bridged to it, runs the suites. See races.mjs.
set -u
cd "$(dirname "$0")/../.."
PGB=/usr/lib/postgresql/16/bin
DATA=${REALPG_DIR:-/tmp/fp-realpg}
if ! "$PGB/pg_isready" -h 127.0.0.1 -p 56432 -q; then
  mkdir -p "$DATA" && chown postgres "$DATA"
  [ -f "$DATA/data/PG_VERSION" ] || su postgres -s /bin/bash -c "$PGB/initdb -D $DATA/data -U postgres --auth=trust >/dev/null"
  su postgres -s /bin/bash -c "$PGB/pg_ctl -D $DATA/data -o '-p 56432 -c max_connections=200 -k $DATA' -l $DATA/pg.log start" >/dev/null
  sleep 2
fi
export REAL_PG=1 REAL_PG_PORT=56432 PGLITE_TCP_PORT=56432
export STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY:-sk_test_dummy} STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET:-whsec_localtestsecret}
export RESEND_WEBHOOK_SECRET=${RESEND_WEBHOOK_SECRET:-whsec_bG9jYWx0ZXN0c2VjcmV0}
pkill -f "testing/local/up.ts"; sleep 2
psql -q -h 127.0.0.1 -p 56432 -U postgres -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>/dev/null
node testing/local/schema-push.mjs > "$DATA/push.log" 2>&1 || { echo "schema push failed: $DATA/push.log"; exit 1; }
npx tsx testing/local/up.ts > "$DATA/server.log" 2>&1 &
for i in $(seq 1 60); do curl -sf http://127.0.0.1:5050/health >/dev/null && break; sleep 2; done; sleep 2
rc=0
for s in "$@"; do echo "== $s"; node "testing/local/$s.mjs" || rc=1; sleep 2; done
pkill -f "testing/local/up.ts"
exit $rc
