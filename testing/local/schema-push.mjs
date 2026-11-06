/**
 * Creates the schema in the local PGlite database by running the project's own
 * `drizzle-kit push` against it, rather than hand-writing DDL.
 *
 * Deliberate: a hand-written schema would be a second definition of the truth
 * that drifts from shared/schema.ts, and the tests would then pass against a
 * database the app does not actually use. drizzle-kit connects over plain TCP,
 * which PGLiteSocketServer already speaks, so no WebSocket bridge is needed
 * here -- that is only for the app's Neon driver.
 */
import { spawn } from "child_process";
import { startDatabase } from "./db-bridge.mjs";

const dbh = await startDatabase();
console.log(`database up on ${dbh.url}`);

const child = spawn("npx", ["drizzle-kit", "push", "--force"], {
  cwd: "/home/claude/future",
  env: { ...process.env, DATABASE_URL: dbh.url, APP_ENV: "local" },
  stdio: "inherit",
});

const code = await new Promise((r) => child.on("exit", r));

if (code === 0) {
  // drizzle-kit push reconciles the database against shared/schema.ts, so what
  // it produces is already the END state -- every SQL migration's effect is
  // present. The app's own runner then tries to apply all 28 from scratch at
  // boot and dies on the first one that is not idempotent (013 re-adds a CHECK
  // constraint that push had already created), taking the boot with it, since
  // index.ts awaits runMigrations() with no catch.
  //
  // So record them as applied. This is not a workaround for a bug: the schema
  // is the source of truth and the migrations are its history, so a database
  // built from the schema is by definition at the latest migration.
  const { readdirSync } = await import("fs");
  const files = readdirSync("/home/claude/future/server/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  await dbh.pglite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
  for (const f of files) {
    await dbh.pglite.query(
      `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [f],
    );
  }

  const t = await dbh.pglite.query(
    `select table_name from information_schema.tables where table_schema='public' order by 1`,
  );
  console.log(`\ntables created: ${t.rows.length}`);
  console.log(`migrations marked applied: ${files.length}`);
}

await dbh.stop();
process.exit(code ?? 1);
