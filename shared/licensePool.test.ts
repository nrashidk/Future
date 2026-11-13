import { describe, it, expect } from "vitest";
import { isOnPersonalPool, isSuperadminAccount } from "./licensePool";

const base = { hasChildProfile: false, hasSchoolRow: false, isPremium: false, isSuperadmin: false };

describe("isOnPersonalPool", () => {
  it("a premium individual with no child profile IS on a pool (the hole this closes)", () => {
    expect(isOnPersonalPool({ ...base, isPremium: true })).toBe(true);
  });
  it("a free account is on no pool", () => {
    expect(isOnPersonalPool(base)).toBe(false);
  });
  it("an UNPAID child profile is on no pool: its free report must not be charged", () => {
    expect(isOnPersonalPool({ ...base, hasChildProfile: true })).toBe(false);
  });
  it("a PAID child profile is on its pool", () => {
    expect(isOnPersonalPool({ ...base, hasChildProfile: true, isPremium: true })).toBe(true);
  });
  it("a school admin's premium flag is not a personal pool", () => {
    expect(isOnPersonalPool({ ...base, hasSchoolRow: true, isPremium: true })).toBe(false);
  });
  it("a premium superadmin is on no pool", () => {
    expect(isOnPersonalPool({ ...base, isPremium: true, isSuperadmin: true })).toBe(false);
  });
});

describe("isSuperadminAccount", () => {
  it("by role", () => expect(isSuperadminAccount({ role: "superadmin" }, [])).toBe(true));
  it("by configured email, case-insensitively", () =>
    expect(isSuperadminAccount({ role: "user", email: "Boss@X.ae" }, ["boss@x.ae"])).toBe(true));
  it("neither", () => expect(isSuperadminAccount({ role: "user", email: "a@x.ae" }, ["boss@x.ae"])).toBe(false));
  it("no user", () => expect(isSuperadminAccount(null, ["boss@x.ae"])).toBe(false));
});
