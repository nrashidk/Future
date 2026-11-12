/**
 * Did a repopulate actually write a sector map?
 *
 * POST /api/admin/countries/:id/repopulate answers 200 with
 * `sectorGeneration` describing a second step that can fail on its own. Both
 * screens that call it used to announce success on the 200, so a country with
 * no sector map -- where every career scores the same on national alignment --
 * was reported as generated.
 *
 * Returns null when a map was written (or the step was not attempted, which
 * is the route's way of saying there were no sectors to map), and otherwise
 * the reason to show, which may be an empty string when the server gave none.
 */
export interface SectorGenerationOutcome {
  attempted?: boolean;
  persisted?: boolean;
  sectorsWritten?: number;
  error?: string;
  errors?: string[];
}

export function sectorGenerationFailure(outcome: SectorGenerationOutcome | null | undefined): string | null {
  if (!outcome || outcome.attempted !== true) return null;
  if (outcome.persisted === true && Number(outcome.sectorsWritten) > 0) return null;
  if (typeof outcome.error === "string" && outcome.error.trim()) return outcome.error.trim();
  const first = Array.isArray(outcome.errors) ? outcome.errors.find((e) => typeof e === "string" && e.trim()) : undefined;
  return first ? first.trim() : "";
}
