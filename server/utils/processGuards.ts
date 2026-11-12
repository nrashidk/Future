/**
 * AN UNHANDLED REJECTION IS LOGGED, NOT FATAL.
 *
 * Express 4 does not await handlers or middleware. Any `async` one whose
 * awaited call rejects outside a try/catch produces a promise nobody is
 * listening to, and Node's default for that is to EXIT THE PROCESS -- so one
 * dropped database connection during one request stops the site for everyone
 * until Render restarts it. That was seen for real on 2026-11-12 (the two
 * local guards in contribution.routes.ts), and those two were fixed where
 * they stood; but nobody has counted how many route handlers have the same
 * shape, and a fix that depends on finding every one is a fix that misses
 * the next one written.
 *
 * So the process-level default is replaced. The request that caused it is
 * still lost -- it will hang until the client gives up -- but it is ONE
 * request rather than every request, and it is logged loudly enough to be
 * found and given its own catch.
 *
 * `uncaughtException` is deliberately LEFT ALONE. A synchronous throw that
 * escaped everything means the process may be in a state nobody reasoned
 * about, and restarting is the right answer to that. A rejected promise from
 * a failed query is not that.
 */
let installed = false;

export function describeRejection(reason: unknown): string {
  if (reason instanceof Error) return reason.stack ?? `${reason.name}: ${reason.message}`;
  if (typeof reason === "string") return reason;
  // JSON.stringify(undefined) is undefined, not a string, and throws on a cycle.
  try { return JSON.stringify(reason) ?? String(reason); } catch { return String(reason); }
}

export function onUnhandledRejection(reason: unknown): void {
  console.error(
    "[unhandledRejection] a promise rejected with nothing awaiting it. The request that " +
      "caused this was never answered; the process is still serving. Give the awaiting code " +
      "its own try/catch.\n" + describeRejection(reason),
  );
}

/** Idempotent: a second call adds no second listener. */
export function installProcessGuards(target: NodeJS.Process = process): void {
  if (installed) return;
  installed = true;
  target.on("unhandledRejection", onUnhandledRejection);
}

/** For tests only. */
export function __resetProcessGuardsForTest(): void { installed = false; }
