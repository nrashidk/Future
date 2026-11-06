# Local test environment

Runs the real application against a real PostgreSQL, entirely offline, with no
change to any file under `server/` or `client/`.

## Why it exists

The sandbox this was built in has no outbound network beyond npm and GitHub, so
Neon, Stripe, Resend and DigitalOcean Spaces are all unreachable. Supplying
staging credentials would not have helped — the host is unreachable, not the
secret missing.

## How it works

```
PGlite (PostgreSQL 18 compiled to WASM, in-process)
  -> PGLiteSocketServer, speaking the real wire protocol over TCP
    -> a WebSocket-to-TCP bridge (db-bridge.mjs)
      -> @neondatabase/serverless, aimed at it with neonConfig.wsProxy
```

The app's own driver connects without knowing the difference. The alternative
was an env-gated second driver inside `server/db.ts`, which would have meant
`export let db` with a union type across two drizzle adapters — loosening the
type every storage query depends on, inside the one file whose job is refusing
to connect to the wrong database. This keeps production code untouched.

## Running it

```bash
# 1. create the schema (once, or after a schema change)
PGLITE_DIR=./.pgdata node testing/local/schema-push.mjs

# 2. boot the app against it
PGLITE_DIR=./.pgdata npx tsx testing/local/up.ts
# -> http://127.0.0.1:5050
```

Omit `PGLITE_DIR` for an in-memory database that vanishes on exit.

## Things worth knowing

- **Development mode, deliberately.** `server/auth.ts` sets
  `secure: NODE_ENV === 'production'` on the session cookie, so a production
  boot over plain http would refuse to set `fp_session` and every login would
  fail for a reason unrelated to the code under test.
- **`maxConnections` must be above 1.** pglite-socket defaults to a single
  connection; the app's pool opens several, and the surplus are dropped with
  "Connection terminated unexpectedly" — which drizzle surfaces as a failed
  query, so it reads like a schema fault rather than a transport one.
- **`schema-push.mjs` marks all SQL migrations as applied.** `drizzle-kit push`
  builds the database from `shared/schema.ts`, which is already the end state,
  so the app's runner would otherwise replay all 28 from scratch and die on 013
  (it re-adds a CHECK constraint that push already created). `index.ts` awaits
  `runMigrations()` with no catch, so that failure is fatal.
- **Object storage is not emulated.** The `SPACES_*` values satisfy the boot
  guard and nothing more; anything that actually calls Spaces will fail, and
  file tests should be recorded as blocked rather than passed.

## What this cannot test

OAuth (needs a public callback URL), real payment, real email delivery, real
object storage, and anything about Render, Neon, TLS or CDN behaviour. A pass
here is a pass for the code, not for the deployment.
