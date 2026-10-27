/**
 * Carrying "where the visitor came from" through the upgrade funnel.
 *
 * /tier-selection is reached from six different places — the report page
 * (Results.tsx, twice), Checkout, Profile, GroupPricing and the free-cap
 * notice on Assessment. A hardcoded back destination is therefore wrong by
 * construction, which is what the funnel had: TierSelection offered no back
 * control at all, and RegisterParent's went to the home page. A guest who
 * reached the paid form from their own report and changed their mind had no
 * route back to it except the recovery email.
 *
 * That matters more here than on an ordinary page. This is the path someone
 * walks immediately after deciding they want the full report, so stranding
 * them is stranding them at the exact moment they were ready to pay.
 *
 * SECURITY: the value travels in a query string, so it is attacker-supplied
 * on a page that is part of a payment flow — a prime spot for an open
 * redirect, since "go back to where you were" is a control people click
 * without reading. safeReturnTo therefore admits only same-origin absolute
 * paths, and every rejected shape is pinned by a test rather than argued for
 * here.
 */

export const RETURN_TO_PARAM = "from";

/**
 * Return `raw` only if it is a same-origin absolute path; otherwise null.
 *
 * Rejected, with the reason each one matters:
 *   - "https://evil.com"  — absolute URL, does not start with "/"
 *   - "javascript:…"      — same reason; never becomes a navigable path
 *   - "//evil.com"        — protocol-relative; browsers treat this as EXTERNAL
 *                           despite the leading slash, which is exactly the
 *                           case a naive startsWith("/") check lets through
 *   - "/\\evil.com"       — some browsers normalise the backslash to "/",
 *                           turning this into the protocol-relative case above
 *   - anything with control characters — can truncate or smuggle past a later
 *     parser
 */
export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("/\\")) return null;
  if (/[\u0000-\u001F\u007F]/.test(value)) return null;
  return value;
}

/** Append the origin to a funnel URL, leaving it untouched if there isn't a safe one. */
export function withReturnTo(target: string, from: string | null | undefined): string {
  const safe = safeReturnTo(from);
  if (!safe) return target;
  const separator = target.includes("?") ? "&" : "?";
  return `${target}${separator}${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`;
}

/** Read the origin back out of a query string (`window.location.search`). */
export function readReturnTo(search: string): string | null {
  return safeReturnTo(new URLSearchParams(search).get(RETURN_TO_PARAM));
}

/**
 * The current path INCLUDING its query string. wouter's useLocation() returns
 * the pathname only, which would drop ?assessmentId= — i.e. drop the one piece
 * of information that makes going "back to the report" mean anything.
 */
export function currentPathWithQuery(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}
