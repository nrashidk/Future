import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { pool } from "../db";

// Use process.cwd() (project root) so the path is correct in both environments:
// - dev: `tsx server/index.ts`  → cwd is project root, files at server/migrations/*.sql
// - prod: `node dist/index.js`  → import.meta.url resolves to dist/, which has no .sql files;
//   cwd is still the project root where server/migrations/*.sql are deployed alongside the bundle.
const MIGRATIONS_DIR = join(process.cwd(), "server", "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY name"
  );
  return new Set(result.rows.map((r) => r.name));
}

async function applyMigration(name: string, sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (name) VALUES ($1)",
      [name]
    );
    await client.query("COMMIT");
    console.log(`  ✓ Applied migration: ${name}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const applied = await getAppliedMigrations();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let pending = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    pending++;
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf-8");
    await applyMigration(file, sql);
  }

  if (pending === 0) {
    console.log("  All migrations already applied");
  }
}
