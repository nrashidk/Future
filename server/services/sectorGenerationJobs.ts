/**
 * SECTOR MAP GENERATION RUNS IN THE BACKGROUND.
 *
 * It is one Anthropic exchange with up to twelve web searches against
 * government sites, and on production (2026-11-12) it never finished inside
 * the four minutes an HTTP request gave it: "Anthropic API request timed out
 * after 240 seconds", three times out of three. So a new country could not get
 * a sector map from the product at all -- and without one every career scores
 * the same on national alignment.
 *
 * The request now starts the work and answers at once; this module holds what
 * became of it, and GET /api/admin/countries/:id/sector-generation reads it.
 *
 * IN MEMORY, deliberately. Nothing in this app runs on a schedule and there is
 * one process. A deploy restarts it and the record is lost -- which reads as
 * "none", the checklist still says the map is missing, and pressing Generate
 * again is the remedy. A table would add a person-free but permanent record
 * for something whose only durable result is already in
 * country_sector_categories.
 *
 * ONE AT A TIME PER COUNTRY: a second start while one is running returns the
 * running job rather than paying for the research twice.
 */
export interface SectorGenerationOutcome {
  attempted: boolean;
  persisted?: boolean;
  sectorsWritten?: number;
  skillRowsWritten?: number;
  categoryRowsWritten?: number;
  error?: string;
  errors?: string[];
  [key: string]: unknown;
}

export type SectorJobStatus = "running" | "done" | "failed";

export interface SectorJob {
  status: SectorJobStatus;
  startedAt: string;
  finishedAt?: string;
  outcome?: SectorGenerationOutcome;
}

const jobs = new Map<string, SectorJob>();
const settled = new Map<string, Promise<void>>();

/** A map was written. Anything else is a failure, whatever the HTTP status was. */
export function sectorOutcomeSucceeded(outcome: SectorGenerationOutcome | undefined): boolean {
  return !!outcome && outcome.persisted === true && Number(outcome.sectorsWritten) > 0;
}

export function startSectorGeneration(
  countryId: string,
  run: () => Promise<SectorGenerationOutcome>,
): { job: SectorJob; alreadyRunning: boolean } {
  const existing = jobs.get(countryId);
  if (existing?.status === "running") return { job: existing, alreadyRunning: true };

  const job: SectorJob = { status: "running", startedAt: new Date().toISOString() };
  jobs.set(countryId, job);

  // Every path ends in a recorded outcome. A rejection that escaped here would
  // be an unhandled one, and the checklist would say "running" for ever.
  const promise = (async () => {
    let outcome: SectorGenerationOutcome;
    try {
      outcome = await run();
    } catch (error) {
      outcome = {
        attempted: true,
        persisted: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    job.outcome = outcome;
    job.status = sectorOutcomeSucceeded(outcome) ? "done" : "failed";
    job.finishedAt = new Date().toISOString();
  })();
  settled.set(countryId, promise);

  return { job, alreadyRunning: false };
}

export function getSectorGenerationJob(countryId: string): SectorJob | undefined {
  return jobs.get(countryId);
}

/** For tests: resolves when the country's current job has recorded its outcome. */
export function whenSectorGenerationSettles(countryId: string): Promise<void> {
  return settled.get(countryId) ?? Promise.resolve();
}

export function resetSectorGenerationJobs(): void {
  jobs.clear();
  settled.clear();
}
