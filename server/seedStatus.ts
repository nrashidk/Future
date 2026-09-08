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

/**
 * "failed"     — seedDatabase() threw; an unknown amount did not run.
 * "incomplete" — it ran to completion, but the content coverage gate found
 *                student-facing content missing or stale. Distinct from
 *                "failed" because the remedy differs: a throw points at the
 *                seed, a gate failure points at the data or the match keys.
 */
export type SeedState = "pending" | "ok" | "failed" | "incomplete";

interface SeedStatus {
  state: SeedState;
  /** ISO timestamp of the terminal state. Null while pending. */
  at: string | null;
  /** Failure message. Held for operator-facing logs only — never returned by the public health route. */
  error: string | null;
}

const status: SeedStatus = { state: "pending", at: null, error: null };

/**
 * Marks the boot seed complete.
 *
 * Deliberately will NOT overwrite "incomplete". The coverage gate runs INSIDE
 * seedDatabase() and records that state on its way through; index.ts then calls
 * this when the function returns without throwing. Without the guard, the ok
 * would erase the very finding the gate exists to surface.
 */
export function markSeedOk(): void {
  if (status.state === "incomplete") return;
  status.state = "ok";
  status.at = new Date().toISOString();
  status.error = null;
}

/** The seed ran, but the content coverage gate found problems. */
export function markSeedIncomplete(problems: string[]): void {
  status.state = "incomplete";
  status.at = new Date().toISOString();
  status.error = problems.join(" | ");
}

export function markSeedFailed(error: unknown): void {
  status.state = "failed";
  status.at = new Date().toISOString();
  status.error = error instanceof Error ? error.message : String(error);
}

export function getSeedStatus(): Readonly<SeedStatus> {
  return status;
}
