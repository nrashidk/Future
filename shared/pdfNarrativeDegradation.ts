/**
 * The single console-warning marker that means "this PDF render did not get
 * real LLM narrative content for at least one career" — whatever the cause: a
 * slow render that hit the 28s client safety net, or a fast failure (a
 * 401/403/429/503 on the career-reasoning endpoint) that resolved well before
 * that timeout. Both PDF-generating server routes (admin.routes.ts bulk
 * export, recommendations.routes.ts single-report) listen for this exact
 * marker via page.on('console', ...) to flag a degraded render.
 *
 * ONE CONSTANT, IMPORTED EVERYWHERE, NEVER RETYPED. The mechanism this
 * replaces failed silently for exactly the reason a duplicated literal always
 * eventually fails: the server checked for the console text
 * "Safety-net timeout fired" while the client actually logged
 * "Safety-net fired at 28s" — two independently-typed strings that were
 * supposed to be the same one and quietly weren't, so the check never once
 * matched. See FOLLOWUP.md, "REMAINING PDF DEFECTS", item 1's trace.
 */
export const NARRATIVE_DEGRADED_MARKER = "[ResultsPrint] Narrative degraded";

/** ResultsPrint.tsx: the 28s client safety net fired before every narrative settled. */
export function narrativeDegradedSafetyNetMessage(nsApplied: boolean): string {
  return `${NARRATIVE_DEGRADED_MARKER} — 28s safety net fired before all narratives settled (nsApplied=${nsApplied}).`;
}

/**
 * ResultsPrint.tsx: every narrative query settled (no timeout), but at least
 * one career never got real content — a fast failure (401/403/429/503/500),
 * not a slow one. This is the case the previous, broken detector could never
 * have caught even if its string had matched: it only ever listened for the
 * safety-net path.
 */
export function narrativeDegradedFetchFailureMessage(missingCount: number, totalCount: number): string {
  return `${NARRATIVE_DEGRADED_MARKER} — ${missingCount} of ${totalCount} career narrative(s) unavailable (rate-limited, errored, or otherwise missing).`;
}

/** Server-side console listeners: does this console message report a degraded render? */
export function isNarrativeDegradedMessage(text: string): boolean {
  return text.includes(NARRATIVE_DEGRADED_MARKER);
}
