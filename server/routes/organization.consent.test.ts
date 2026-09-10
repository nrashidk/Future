/**
 * The three decisions in the consent route worth pinning.
 *
 * Storage is mocked so importing the route module does not pull in db.ts, which
 * throws at import when DATABASE_URL is unset — same pattern as
 * organization.curriculum-lock.test.ts and superadmin.reconciliation.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

const { derivePerformedByName, resolvePolicyLocale, isPolicyDrifted } =
  await import("./organization.routes");

describe("derivePerformedByName", () => {
  it("prefers the full name", () => {
    expect(derivePerformedByName({ firstName: "Aisha", lastName: "Khan", email: "a@s.ae" }))
      .toBe("Aisha Khan");
  });

  it("uses whichever name part exists", () => {
    expect(derivePerformedByName({ firstName: "Aisha", lastName: null, email: "a@s.ae" })).toBe("Aisha");
    expect(derivePerformedByName({ firstName: null, lastName: "Khan", email: "a@s.ae" })).toBe("Khan");
  });

  // This string, not the FK, is what names the attester after the user row is
  // deleted. An empty one would leave a consent record nobody signed.
  it("falls back to the email when no name is set", () => {
    expect(derivePerformedByName({ firstName: null, lastName: null, email: "a@s.ae" })).toBe("a@s.ae");
    expect(derivePerformedByName({ firstName: "", lastName: "", email: "a@s.ae" })).toBe("a@s.ae");
  });

  it("never returns empty, even with nothing to go on", () => {
    expect(derivePerformedByName({ firstName: null, lastName: null, email: null })).toBe("Unknown");
    expect(derivePerformedByName({})).toBe("Unknown");
  });

  it("does not leave stray whitespace when one part is blank", () => {
    expect(derivePerformedByName({ firstName: "Aisha", lastName: "  ", email: "a@s.ae" }))
      .toBe("Aisha");
  });
});

describe("resolvePolicyLocale", () => {
  it("accepts the served locales", () => {
    expect(resolvePolicyLocale("en")).toBe("en");
    expect(resolvePolicyLocale("ar")).toBe("ar");
  });

  // A bad locale must not block an attestation; en is the authoring locale.
  it("defaults to en for anything else", () => {
    expect(resolvePolicyLocale("fr")).toBe("en");
    expect(resolvePolicyLocale(undefined)).toBe("en");
    expect(resolvePolicyLocale(null)).toBe("en");
    expect(resolvePolicyLocale(42)).toBe("en");
    expect(resolvePolicyLocale({})).toBe("en");
  });
});

describe("isPolicyDrifted", () => {
  it("reports drift when the documents moved", () => {
    expect(isPolicyDrifted("aaaa", "bbbb")).toBe(true);
  });

  it("reports none when they match", () => {
    expect(isPolicyDrifted("aaaa", "aaaa")).toBe(false);
  });

  // Not-yet-attested and documents-unreadable are both "nothing to compare",
  // never drift. Reporting drift for a school that has never consented would
  // put a stale-policy warning on a screen asking them to consent for the first
  // time.
  it("reports none when either side is absent", () => {
    expect(isPolicyDrifted(null, "bbbb")).toBe(false);
    expect(isPolicyDrifted("aaaa", null)).toBe(false);
    expect(isPolicyDrifted(undefined, undefined)).toBe(false);
    expect(isPolicyDrifted("", "bbbb")).toBe(false);
  });
});
