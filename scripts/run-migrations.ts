/**
 * CLI entry point for the SQL migration runner.
 *
 * Run with:  npx tsx scripts/run-migrations.ts
 *
 * WHY THIS EXISTS: server/migrations/runner.ts exports runMigrations() but has
 * no CLI entry — no import.meta.url guard, no main(). Running that file directly
 * loads the module, defines the function and exits having done nothing. The only
 * other caller is server/index.ts:210-211, which runs migrations as a side
 * effect of booting the whole server. This script is the third option: run the
 * migrations, print what happened, exit.
 *
 * WHY IT ENDS WITH pool.end(): the Neon pool holds an open WebSocket, which
 * keeps the event loop alive indefinitely. A caller that finishes the migrations
 * but never closes the pool does not exit — it hangs, having already done the
 * work. Closing explicitly, in a finally, is what makes this terminate.
 *
 * EXIT CODES: 0 = migrations applied (or none pending). 1 = failure. The runner
 * wraps each .sql file in its own transaction and rolls that file back on error,
 * so a non-zero exit means the failing migration left no partial state.
 *
 * SAFETY: importing ../server/db runs the guards in server/db.ts:8-41 before
 * anything here executes — the DATABASE_URL presence check and the
 * production-endpoint refusal. This script deliberately adds no guard of its
 * own and no override: if it refuses, that refusal came from db.ts and is
 * waived the same way it always is (APP_ENV=production, or
 * ALLOW_PRODUCTION_DB=true), never from here.
 *
 * NOTE: the runner applies ALL pending migrations in filename order. There is no
 * way to select a single file. The pending list is printed before anything is
 * applied so that is visible rather than assumed.
 */

import { readdir } from "fs/promises";
import { join } from "path";

async function main(): Promise<number> {
  // runner.ts resolves its migrations directory from process.cwd()
  // (server/migrations/runner.ts:9). Invoked from anywhere else it finds zero
  // files and reports "All migrations already applied" — a silent no-op that
  // reads exactly like success. Fail loudly instead.
  const dir = join(process.cwd(), "server", "migrations");
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    console.error(
      `✖ No .sql migrations found at ${dir}\n` +
        `  Run this from the repository root: npx tsx scripts/run-migrations.ts`,
    );
    return 1;
  }

  // Imported dynamically, and db first, so the boot line and the endpoint guard
  // in server/db.ts land before any migration output.
  const { pool } = await import("../server/db");
  const { runMigrations } = await import("../server/migrations/runner");

  try {
    // Ledger snapshot BEFORE, so the "applied" list below is what THIS run did
    // rather than what the runner happened to log.
    const before = await pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    const applied = new Set(before.rows.map((r) => r.name));
    const pending = files.filter((f) => !applied.has(f));

    console.log(`\n  Ledger: ${applied.size} applied, ${files.length} on disk.`);
    if (pending.length === 0) {
      console.log("  Nothing pending.");
    } else {
      console.log(`  Pending (${pending.length}), will be applied IN THIS ORDER:`);
      for (const f of pending) console.log(`    - ${f}`);
    }

    console.log("\n🗄️  Running database migrations...");
    await runMigrations();

    const after = await pool.query<{ name: string; applied_at: Date }>(
      "SELECT name, applied_at FROM schema_migrations ORDER BY name",
    );
    const fresh = after.rows.filter((r) => !applied.has(r.name));

    console.log("");
    if (fresh.length === 0) {
      console.log("✓ No migrations were pending; nothing applied.");
    } else {
      console.log(`✓ Applied ${fresh.length} migration(s):`);
      for (const r of fresh) {
        console.log(`    ${r.name}  @ ${new Date(r.applied_at).toISOString()}`);
      }
    }

    // Anything on disk still unledgered after a successful run is a real
    // problem — a file the runner skipped without erroring.
    const stillPending = files.filter(
      (f) => !after.rows.some((r) => r.name === f),
    );
    if (stillPending.length > 0) {
      console.error(`✖ Still unapplied after the run: ${stillPending.join(", ")}`);
      return 1;
    }

    return 0;
  } catch (err) {
    console.error("\n✖ Migration failed — the failing file was rolled back.");
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    return 1;
  } finally {
    // The point of this script. Without it the process hangs here, having
    // already committed the migrations.
    await pool.end().catch(() => {});
  }
}

// process.exit rather than falling off the end: if any handle survives
// pool.end(), a bare return would hang again and hide the exit code.
main().then(
  (code) => process.exit(code),
  (err) => {
    console.error("\n✖ Unhandled failure before the runner started.");
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exit(1);
  },
);
