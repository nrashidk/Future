/**
 * WHICH LEGAL DOCUMENTS A CONSENT RECORD IS CITING.
 *
 * A consent record has to name the documents it was given against. This product
 * has no document versioning to name: all four legal documents (privacy, terms,
 * disclaimer, notFound) live in ONE translation bundle per locale —
 * client/public/locales/{en,ar}/legal.json — under a single human `lastUpdated`
 * string, which is per-locale, unenforced, never read by the server, and
 * currently reads "6 April 2026" in both (set in 3a01357, and five months stale
 * as of 2026-09-10).
 *
 * THIS IS THE MINIMUM THAT WORKS WITHOUT WAITING ON THE LEGAL REWRITE: a content
 * hash of the documents as actually served. It does not require the documents to
 * be CORRECT, only to be IDENTIFIED, which is exactly what a consent record
 * needs and exactly what the rewrite is not required for.
 *
 * WHAT IT DOES NOT DO, so nobody mistakes it for versioning:
 *   - It pins BYTES, not MEANING. It cannot tell you whether a change was
 *     substantive; a comma and a rewritten data-retention clause move it
 *     equally.
 *   - It provides no re-consent trigger, and NOTHING MAY GATE ON DRIFT. A gate
 *     that blocked enrolment whenever the current hash differed from the
 *     attested one would lock every school out of enrolment on the first typo
 *     committed to legal.json. Drift is recorded and surfaced; it is never
 *     enforced. That call is in the build brief and is deliberate.
 *
 * TWO SCOPING DECISIONS:
 *
 *   1. Only the `terms` and `privacy` SUBTREES are hashed, not the whole file.
 *      The file also carries appName, backHome and notFound — UI chrome. A typo
 *      fix in backHome must not invalidate every school's recorded consent.
 *      `disclaimer` is deliberately excluded too: it is shown on the free
 *      self-consent path, not on the school attestation, so it is not part of
 *      what a school is agreeing to. Add it here only alongside a free-flow
 *      consent record that actually cites it.
 *
 *   2. ONE id spanning BOTH locales, plus the locale served recorded separately
 *      on the row. en and ar are separate files that drift independently. A
 *      single id means "the pair as served on that date"; recording which locale
 *      the admin actually read means that when they later diverge you can still
 *      say which text that school saw.
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

/** Locales whose legal bundle is part of the hashed set. Order is significant. */
export const POLICY_LOCALES = ["en", "ar"] as const;
export type PolicyLocale = (typeof POLICY_LOCALES)[number];

/** The legal.json subtrees a SCHOOL attestation is given against. See note (1). */
const HASHED_SECTIONS = ["terms", "privacy"] as const;

export interface PolicyVersion {
  /** Short hex id over the hashed sections of every locale, in POLICY_LOCALES order. */
  version: string;
  /** The human string as displayed, per locale — what the admin actually saw. */
  lastUpdated: Record<PolicyLocale, string>;
}

/**
 * WHERE THE DOCUMENTS ARE AT RUNTIME. Two locations, because there are two ways
 * this process starts:
 *   prod  `node dist/index.js`     -> the bundle sits in dist/, assets in dist/public/
 *   dev   `tsx server/index.ts`    -> nothing is built; the source tree is served
 * Built path first: in production that is the copy actually being served to the
 * admin, and hashing anything else would identify documents nobody read.
 */
function candidateDirs(): string[] {
  return [
    path.resolve(import.meta.dirname, "..", "public", "locales"),
    path.resolve(process.cwd(), "dist", "public", "locales"),
    path.resolve(process.cwd(), "client", "public", "locales"),
  ];
}

function readLegalBundle(dir: string, locale: PolicyLocale): any | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, locale, "legal.json"), "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Canonical JSON: keys sorted at every level, no incidental whitespace. Without
 * this the id would move whenever a translator's editor reordered keys, which is
 * not a change to the documents and must not read as one.
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

/** Exported for the test; not part of the runtime surface. */
export function computePolicyVersionFrom(
  bundles: Record<PolicyLocale, any>,
): PolicyVersion {
  const hash = createHash("sha256");
  const lastUpdated = {} as Record<PolicyLocale, string>;

  for (const locale of POLICY_LOCALES) {
    const bundle = bundles[locale] ?? {};
    lastUpdated[locale] = typeof bundle.lastUpdated === "string" ? bundle.lastUpdated : "";
    for (const section of HASHED_SECTIONS) {
      hash.update(`${locale}:${section}:`);
      hash.update(canonicalize(bundle[section] ?? null));
      hash.update("\n");
    }
  }

  return { version: hash.digest("hex").slice(0, 16), lastUpdated };
}

let cached: PolicyVersion | null | undefined;

/**
 * FAILS CLOSED, WITHOUT TAKING THE SERVER DOWN.
 *
 * Returns null when the documents cannot be read from any candidate location.
 * The attestation endpoint refuses on null rather than substituting a
 * placeholder: a consent row citing a version that was never served is worse
 * than no consent row, because the next reader trusts it — the same failure this
 * whole design exists to remove. But it must not be fatal at boot; every other
 * route is fine without it, and killing the process over a missing asset would
 * be a worse outage than a blocked attestation screen.
 *
 * Cached after the first successful read. The documents are static assets that
 * cannot change without a redeploy, and a redeploy restarts the process.
 */
export function getPolicyVersion(): PolicyVersion | null {
  if (cached !== undefined) return cached;

  for (const dir of candidateDirs()) {
    const bundles = {} as Record<PolicyLocale, any>;
    let complete = true;
    for (const locale of POLICY_LOCALES) {
      const bundle = readLegalBundle(dir, locale);
      if (!bundle) { complete = false; break; }
      bundles[locale] = bundle;
    }
    if (complete) {
      cached = computePolicyVersionFrom(bundles);
      return cached;
    }
  }

  console.error(
    "[policyVersion] Could not read legal.json for every locale from any of:\n  " +
      candidateDirs().join("\n  ") +
      "\n  Consent attestation will be refused until this is fixed.",
  );
  cached = null;
  return cached;
}

/** Test seam — drops the memo so a test can vary the on-disk documents. */
export function resetPolicyVersionCache(): void {
  cached = undefined;
}

/**
 * Hash of the exact attestation wording rendered to the admin, stored on the
 * record so a later reword cannot be mistaken for what this admin agreed to.
 * Separate from the policy version because the attestation sentence lives in the
 * app's own translation bundle, not in the legal documents.
 */
export function hashAttestationText(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);
}
