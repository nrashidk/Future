/**
 * Boot-time seed status, so an aborted seed is observable instead of inferred
 * from missing content months later.
 *
 * WHY THIS EXISTS: seedDatabase() applies nine .ts content migrations at the end
 * of its run (server/seed.ts). It used to be invoked as
 * `seedDatabase().catch(console.error)`, so any throw left the server booting and
 * serving traffic with that content silently missing — which is exactly what
 * happened to careers.title_ar/description_ar/education_level_ar in production.
 * A single console.error line in a startup log nobody reads is not observability.
 *
 * Deliberately a plain module-level value, not a DB row: it describes THIS
 * process's boot, and writing it to the database would need the database that
 * may well be the thing that failed.
 */

export type SeedState = "pending" | "ok" | "failed";

interface SeedStatus {
  state: SeedState;
  /** ISO timestamp of the terminal state. Null while pending. */
  at: string | null;
  /** Failure message. Held for operator-facing logs only — never returned by the public health route. */
  error: string | null;
}

const status: SeedStatus = { state: "pending", at: null, error: null };

export function markSeedOk(): void {
  status.state = "ok";
  status.at = new Date().toISOString();
  status.error = null;
}

export function markSeedFailed(error: unknown): void {
  status.state = "failed";
  status.at = new Date().toISOString();
  status.error = error instanceof Error ? error.message : String(error);
}

export function getSeedStatus(): Readonly<SeedStatus> {
  return status;
}
