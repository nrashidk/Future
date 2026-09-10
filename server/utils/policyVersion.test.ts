import { describe, it, expect } from "vitest";
import {
  computePolicyVersionFrom,
  getPolicyVersion,
  hashAttestationText,
  POLICY_LOCALES,
} from "./policyVersion";

const bundle = (over: Record<string, unknown> = {}) => ({
  appName: "Future Pathways",
  backHome: "Back to home",
  lastUpdated: "Last updated: 6 April 2026",
  terms: { t1: "You may use this." },
  privacy: { p1: "We store your data." },
  disclaimer: { d1: "Educational tool." },
  notFound: { n1: "Not found." },
  ...over,
});

const both = (over: Record<string, unknown> = {}) =>
  Object.fromEntries(POLICY_LOCALES.map((l) => [l, bundle(over)])) as any;

describe("computePolicyVersionFrom", () => {
  it("is stable for identical documents", () => {
    expect(computePolicyVersionFrom(both()).version).toBe(
      computePolicyVersionFrom(both()).version,
    );
  });

  it("moves when a hashed section changes", () => {
    const before = computePolicyVersionFrom(both()).version;
    const after = computePolicyVersionFrom(both({ privacy: { p1: "We store more." } })).version;
    expect(after).not.toBe(before);
  });

  // The reason only two subtrees are hashed: a typo fix in UI chrome must not
  // invalidate every school's recorded consent.
  it("does NOT move when UI chrome changes", () => {
    const before = computePolicyVersionFrom(both()).version;
    const after = computePolicyVersionFrom(both({ backHome: "Home" })).version;
    expect(after).toBe(before);
  });

  it("does NOT move when the disclaimer changes — it is not part of a school attestation", () => {
    const before = computePolicyVersionFrom(both()).version;
    const after = computePolicyVersionFrom(both({ disclaimer: { d1: "Reworded." } })).version;
    expect(after).toBe(before);
  });

  // lastUpdated is recorded, not hashed: it is a human label that can be edited
  // without the documents changing, and vice versa. The hash is the identifier.
  it("does NOT move when only lastUpdated changes", () => {
    const before = computePolicyVersionFrom(both()).version;
    const after = computePolicyVersionFrom(both({ lastUpdated: "Last updated: 1 May 2026" })).version;
    expect(after).toBe(before);
  });

  it("moves when ONE locale changes — the id spans the pair as served", () => {
    const base = both();
    const drifted = { ...base, ar: bundle({ privacy: { p1: "نص مختلف" } }) };
    expect(computePolicyVersionFrom(drifted).version).not.toBe(
      computePolicyVersionFrom(base).version,
    );
  });

  // Key order is an editor artifact, not a change to the documents.
  it("is insensitive to key order", () => {
    const a = both({ privacy: { p1: "one", p2: "two" } });
    const b = both({ privacy: { p2: "two", p1: "one" } });
    expect(computePolicyVersionFrom(b).version).toBe(computePolicyVersionFrom(a).version);
  });

  it("records lastUpdated per locale", () => {
    const v = computePolicyVersionFrom({ ...both(), ar: bundle({ lastUpdated: "آخر تحديث" }) } as any);
    expect(v.lastUpdated.en).toBe("Last updated: 6 April 2026");
    expect(v.lastUpdated.ar).toBe("آخر تحديث");
  });

  it("tolerates a missing section rather than throwing", () => {
    expect(() => computePolicyVersionFrom(both({ terms: undefined }))).not.toThrow();
  });
});

describe("getPolicyVersion", () => {
  // Reads the real bundles in the repo. If this fails, the attestation endpoint
  // would refuse in production — which is the intended failure, but it means the
  // documents moved or the build layout changed.
  it("resolves the real legal bundles", () => {
    const v = getPolicyVersion();
    expect(v).not.toBeNull();
    expect(v!.version).toMatch(/^[0-9a-f]{16}$/);
    expect(v!.lastUpdated.en).toContain("2026");
    expect(v!.lastUpdated.ar.length).toBeGreaterThan(0);
  });
});

describe("hashAttestationText", () => {
  it("is stable and whitespace-insensitive at the edges", () => {
    expect(hashAttestationText("  We hold guardian consent.  ")).toBe(
      hashAttestationText("We hold guardian consent."),
    );
  });

  it("moves on a reword", () => {
    expect(hashAttestationText("We hold guardian consent.")).not.toBe(
      hashAttestationText("We hold guardian consent for all students."),
    );
  });
});
