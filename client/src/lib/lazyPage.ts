import { lazy, type ComponentType } from "react";

/**
 * A PAGE WHOSE FILE HAS GONE reloads the app ONCE instead of crashing it.
 *
 * Every page is a separate file with a hash in its name. A deploy replaces
 * them all, so a browser that loaded the app BEFORE the deploy asks, on its
 * next navigation, for a file that no longer exists. Seen on production
 * 2026-11-12: a student answered every step of an assessment, pressed "Get My
 * Report", and got "Something went wrong" — `Failed to fetch dynamically
 * imported module: /assets/Results-….js` — because a deploy had landed while
 * they were answering. The report had been generated; only the page that
 * shows it could not load. Render deploys on every push, so this was every
 * deploy, for whoever was mid-session.
 *
 * A reload fetches the new index and with it the new file names; the URL
 * already names where the user was going, so they arrive there.
 *
 * ONCE, by a timestamp in sessionStorage: if the file is missing for some
 * other reason (offline, a broken build) a second failure inside the window
 * is rethrown to the error boundary rather than reloading for ever.
 */
export const CHUNK_RELOAD_KEY = "fp_chunk_reload_at";
export const CHUNK_RELOAD_WINDOW_MS = 30_000;

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|Loading chunk .* failed|error loading dynamically imported module/i.test(message);
}

/** Pure: should this failure be answered with a reload? */
export function shouldReloadForChunkError(error: unknown, lastReloadAt: number | null, now: number): boolean {
  if (!isChunkLoadError(error)) return false;
  if (lastReloadAt !== null && now - lastReloadAt < CHUNK_RELOAD_WINDOW_MS) return false;
  return true;
}

function readLastReload(): number | null {
  try {
    const raw = window.sessionStorage.getItem(CHUNK_RELOAD_KEY);
    const n = raw === null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    // No storage means no memory of having reloaded, and a reload with no
    // memory is a loop. Pretend one just happened: fail to the boundary.
    return Date.now();
  }
}

export function lazyPage<T extends ComponentType<any>>(importer: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const now = Date.now();
      if (shouldReloadForChunkError(error, readLastReload(), now)) {
        try { window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now)); } catch { throw error; }
        window.location.reload();
        // Never settles: the page is about to be replaced, and resolving or
        // rejecting would paint the error boundary for a moment first.
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
