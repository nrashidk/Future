import { describe, it, expect, vi } from "vitest";
import {
  consentGateDecision,
  requireOrganizationConsent,
  CONSENT_REQUIRED_CODE,
} from "./consentGate";

const ok = { consentsToProcessing: true, attestsGuardianConsent: true };

describe("consentGateDecision", () => {
  it("allows when both claims are affirmed", () => {
    expect(consentGateDecision(ok).allowed).toBe(true);
  });

  it("blocks when there is no consent at all", () => {
    expect(consentGateDecision(null).allowed).toBe(false);
    expect(consentGateDecision(undefined).allowed).toBe(false);
  });

  // The guardian attestation is the claim standing in for parental consent that
  // is never otherwise collected. A row without it is not a consent record for
  // the purpose of enrolling a 13-year-old.
  it("blocks on a partial assertion, in either direction", () => {
    expect(consentGateDecision({ consentsToProcessing: true, attestsGuardianConsent: false }).allowed).toBe(false);
    expect(consentGateDecision({ consentsToProcessing: false, attestsGuardianConsent: true }).allowed).toBe(false);
  });

  it("requires true, not merely truthy", () => {
    expect(consentGateDecision({ consentsToProcessing: 1, attestsGuardianConsent: "yes" } as any).allowed).toBe(false);
  });
});

describe("requireOrganizationConsent", () => {
  it("passes a consented school through", async () => {
    const storage = { getCurrentOrganizationConsent: vi.fn().mockResolvedValue(ok) };
    const result = await requireOrganizationConsent(storage as any, "org-1");
    expect(result.allowed).toBe(true);
    expect(result.body).toBeNull();
  });

  it("blocks with 409 and a machine-readable code, not 403", async () => {
    const storage = { getCurrentOrganizationConsent: vi.fn().mockResolvedValue(undefined) };
    const result = await requireOrganizationConsent(storage as any, "org-1");
    expect(result.allowed).toBe(false);
    // 403 would read as a permissions problem and send the admin to the wrong
    // place; the admin IS entitled to enrol, the school's state is what blocks.
    expect(result.status).toBe(409);
    expect(result.body?.code).toBe(CONSENT_REQUIRED_CODE);
  });

  // The failure mode has to be a school that cannot enrol until someone looks,
  // never a student enrolled without a record.
  it("fails CLOSED when the consent state cannot be read", async () => {
    const storage = {
      getCurrentOrganizationConsent: vi.fn().mockRejectedValue(new Error("db down")),
    };
    const result = await requireOrganizationConsent(storage as any, "org-1");
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(409);
  });

  it("asks about the organization it was given", async () => {
    const spy = vi.fn().mockResolvedValue(ok);
    await requireOrganizationConsent({ getCurrentOrganizationConsent: spy } as any, "org-42");
    expect(spy).toHaveBeenCalledWith("org-42");
  });
});
