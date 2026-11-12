/**
 * WHICH BUILD IS ANSWERING.
 *
 * "Is my push live yet?" had no answer from outside. Render keeps serving the
 * previous build until the new one is up, and KEEPS serving it if the new
 * build fails -- so after a push the site looks identical whether the deploy
 * is still building, succeeded, or failed. Every change in this repo was
 * being confirmed live by probing for its behaviour, which works only when
 * the change has behaviour a stranger can probe.
 *
 * Render sets RENDER_GIT_COMMIT on every deploy. Seven characters are
 * reported: enough to match `git log --oneline`, and nothing a private
 * repository's short hash gives away. Absent (local, the harness) is reported
 * as null rather than invented.
 */
const BOOTED_AT = new Date().toISOString();

export function shortCommit(raw: string | undefined | null): string | null {
  const v = (raw ?? "").trim();
  return /^[0-9a-f]{7,40}$/i.test(v) ? v.slice(0, 7).toLowerCase() : null;
}

export function buildInfo(env: NodeJS.ProcessEnv = process.env) {
  return { commit: shortCommit(env.RENDER_GIT_COMMIT), startedAt: BOOTED_AT };
}
