/**
 * The school-setup gate.
 *
 * DB-free by design, like consentGate's tests: server/db.ts throws at import
 * without DATABASE_URL, so the decision is pure and tested directly, and the
 * async wrapper is exercised against a stub.
 */
import { describe, it, expect, vi } from "vitest";
import {
  schoolSetupDecision,
  requireSchoolSetup,
  SCHOOL_SETUP_REQUIRED_CODE,
} from "./schoolSetupGate";

describe("schoolSetupDecision", () => {
  it("allows a school with both a country and a curriculum", () => {
    expect(schoolSetupDecision({ countryId: "uae", curriculum: "MOE National" }))
      .toEqual({ allowed: true, missing: [] });
  });

  it("blocks a school with neither, naming both", () => {
    // The state the Stripe group-purchase path creates: an organization made
    // inside the payment transaction, where neither value is available.
    expect(schoolSetupDecision({ countryId: null, curriculum: null }))
      .toEqual({ allowed: false, missing: ["country", "curriculum"] });
  });

  it("blocks a school with a country but no curriculum", () => {
    expect(schoolSetupDecision({ countryId: "uae", curriculum: null }))
      .toEqual({ allowed: false, missing: ["curriculum"] });
  });

  it("blocks a school with a curriculum but no country", () => {
    expect(schoolSetupDecision({ countryId: null, curriculum: "MOE National" }))
      .toEqual({ allowed: false, missing: ["country"] });
  });

  /**
   * EMPTY STRING IS MISSING, NOT PRESENT.
   *
   * A cleared field can write "" rather than NULL, which satisfies a NOT NULL
   * constraint while failing every downstream `!org.countryId` check --
   * admin.routes.ts guards a school update against exactly that. A gate that
   * only tested for null would wave through the one state most likely to look
   * fine in the database and behave as missing everywhere else.
   */
  it("treats empty and whitespace-only values as missing", () => {
    expect(schoolSetupDecision({ countryId: "", curriculum: "MOE National" }).allowed).toBe(false);
    expect(schoolSetupDecision({ countryId: "uae", curriculum: "   " }).allowed).toBe(false);
  });

  it("blocks when the organization does not exist", () => {
    expect(schoolSetupDecision(null).allowed).toBe(false);
    expect(schoolSetupDecision(undefined).allowed).toBe(false);
  });
});

describe("requireSchoolSetup", () => {
  it("passes a set-up school through", async () => {
    const storage = {
      getOrganizationById: vi.fn().mockResolvedValue({ countryId: "uae", curriculum: "MOE National" }),
    } as any;
    const r = await requireSchoolSetup(storage, "org-1");
    expect(r.allowed).toBe(true);
    expect(r.body).toBeNull();
  });

  it("answers 409 with the shared code and what is missing", async () => {
    const storage = {
      getOrganizationById: vi.fn().mockResolvedValue({ countryId: null, curriculum: null }),
    } as any;
    const r = await requireSchoolSetup(storage, "org-1");
    // 409 rather than 403: the admin is entitled to do this, it is the state of
    // the school that prevents it. A 403 would read as a permissions problem.
    expect(r.status).toBe(409);
    expect(r.body?.code).toBe(SCHOOL_SETUP_REQUIRED_CODE);
    expect(r.body?.missing).toEqual(["country", "curriculum"]);
  });

  it("fails closed when the school cannot be read", async () => {
    // An unreadable organization is not a licence to enrol or contribute. The
    // failure mode has to be a school that cannot act until someone looks.
    const storage = {
      getOrganizationById: vi.fn().mockRejectedValue(new Error("db down")),
    } as any;
    const r = await requireSchoolSetup(storage, "org-1");
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(409);
  });
});
