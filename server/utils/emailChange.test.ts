/**
 * The assertions that carry weight here are the two 403s.
 *
 * A suite that only proved "a valid new address is accepted" would pass
 * against an implementation with no guards whatsoever — which is the
 * implementation this endpoint would naturally have had, since from the
 * outside it looks like profile editing. It is not: superadmin is recomputed
 * per request from the account's email against SUPERADMIN_EMAILS, so this
 * endpoint hands out and takes away platform administration.
 *
 * Case sensitivity is tested on both sides of every comparison. An attacker
 * does not type the reserved address in the casing the env var happens to use,
 * and a guard that only matched an exact string would be bypassed by shifting
 * one letter.
 */

import { describe, it, expect } from "vitest";
import { evaluateEmailChange, normalizeEmail } from "./emailChange";

const SUPERADMINS = ["owner@futurepath.ae", "root@futurepath.ae"];

const base = {
  targetId: "u-1",
  targetEmail: "parent@example.com",
  superadminEmails: SUPERADMINS,
  conflictingUserId: null as string | null,
};

describe("normalizeEmail", () => {
  it("trims and lowercases, matching how login and SUPERADMIN_EMAILS are read", () => {
    expect(normalizeEmail("  Parent@Example.COM ")).toBe("parent@example.com");
  });
});

describe("escalation guard", () => {
  it("refuses a reserved address", () => {
    const v = evaluateEmailChange({ ...base, rawEmail: "owner@futurepath.ae" });
    expect(v).toMatchObject({ ok: false, status: 403, code: "RESERVED_EMAIL" });
  });

  it("refuses it however it is cased or padded", () => {
    for (const raw of ["OWNER@futurepath.ae", "Owner@FuturePath.ae", "  owner@futurepath.ae  "]) {
      expect(evaluateEmailChange({ ...base, rawEmail: raw }), raw).toMatchObject({
        ok: false,
        code: "RESERVED_EMAIL",
      });
    }
  });

  it("refuses every reserved address, not just the first configured one", () => {
    expect(evaluateEmailChange({ ...base, rawEmail: "root@futurepath.ae" })).toMatchObject({
      ok: false,
      code: "RESERVED_EMAIL",
    });
  });
});

describe("superadmin-immutability guard", () => {
  it("refuses to move a superadmin's own address, which would silently revoke their access", () => {
    const v = evaluateEmailChange({
      ...base,
      targetEmail: "owner@futurepath.ae",
      rawEmail: "someone-else@example.com",
    });
    expect(v).toMatchObject({ ok: false, status: 403, code: "SUPERADMIN_EMAIL_IMMUTABLE" });
  });

  it("applies regardless of how the stored address is cased", () => {
    const v = evaluateEmailChange({
      ...base,
      targetEmail: "Owner@FuturePath.AE",
      rawEmail: "someone-else@example.com",
    });
    expect(v).toMatchObject({ ok: false, code: "SUPERADMIN_EMAIL_IMMUTABLE" });
  });
});

describe("uniqueness guard", () => {
  it("refuses an address another account holds", () => {
    const v = evaluateEmailChange({ ...base, rawEmail: "taken@example.com", conflictingUserId: "u-2" });
    expect(v).toMatchObject({ ok: false, status: 409, code: "EMAIL_TAKEN" });
  });

  it("does not report the account as colliding with itself", () => {
    // The row holding this address IS the target. Without the unchanged check
    // running first, re-submitting an identical address would 409 against
    // itself — the shape an operator hits by saving a form they did not edit.
    const v = evaluateEmailChange({
      ...base,
      rawEmail: "Parent@Example.com",
      conflictingUserId: "u-1",
    });
    expect(v).toEqual({ ok: true, email: "parent@example.com", unchanged: true });
  });
});

describe("accepted changes", () => {
  it("accepts a free, non-reserved address and returns it normalized", () => {
    const v = evaluateEmailChange({ ...base, rawEmail: "  New.Parent@Example.COM " });
    expect(v).toEqual({ ok: true, email: "new.parent@example.com", unchanged: false });
  });

  it("accepts when the account currently has no address at all", () => {
    // Org students are created without one (email is null), so this is the
    // normal case for giving a student an address for the first time.
    const v = evaluateEmailChange({ ...base, targetEmail: null, rawEmail: "student@example.com" });
    expect(v).toEqual({ ok: true, email: "student@example.com", unchanged: false });
  });

  it("still refuses a reserved address for an account that has none", () => {
    const v = evaluateEmailChange({ ...base, targetEmail: null, rawEmail: "root@futurepath.ae" });
    expect(v).toMatchObject({ ok: false, code: "RESERVED_EMAIL" });
  });
});
