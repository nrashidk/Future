/**
 * A parent-registers account's child owns the same six fields a school
 * student's school owns — resolved from child_profiles instead of
 * organizationMembers/organizations. See docs/parent-registers-scoping.md.
 *
 * Two separate rules pinned here:
 *   resolveChildOwnedFields  — the same fail-closed override as
 *                              resolveSchoolOwnedFields, one row instead of two.
 *   assessmentIsChildOwned   — the timestamp gate: an assessment created
 *                              before the child profile existed on this
 *                              account is the account holder's own, and must
 *                              never be relabelled as the child's.
 *
 * Storage is mocked so importing assessment.routes.ts does not pull in
 * db.ts, which throws at import when DATABASE_URL is unset — same pattern
 * as assessment.school-owned-fields.test.ts.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

const { resolveChildOwnedFields, assessmentIsChildOwned } = await import("./assessment.routes");

const CHILD = {
  name: "Khaled Rashid",
  gender: "male",
  grade: "grade9",
  dateOfBirth: "2012-05-04",
  countryId: "ae",
  curriculum: "MOE National",
};

/** Fixed for the same reason as assessment.school-owned-fields.test.ts's ASOF. */
const ASOF = "2026-09-16";

describe("resolveChildOwnedFields", () => {
  it("overrides a submitted value with the child profile's", () => {
    const { overrides, missing } = resolveChildOwnedFields(
      { name: "Someone Else", grade: "grade12", gender: "female", age: 99, countryId: "uk", curriculum: "British" },
      CHILD,
      ASOF,
    );
    expect(overrides).toEqual({
      name: "Khaled Rashid",
      grade: "grade9",
      gender: "male",
      age: 14,
      countryId: "ae",
      curriculum: "MOE National",
    });
    expect(missing).toEqual([]);
  });

  it("leaves fields the payload does not name alone", () => {
    const { overrides, missing } = resolveChildOwnedFields({ grade: "grade12" }, CHILD, ASOF);
    expect(overrides).toEqual({ grade: "grade9" });
    expect(missing).toEqual([]);
  });

  it("derives age from the child's date of birth rather than copying a submitted value", () => {
    // Born 2012-05-04, as of 2026-09-16: birthday passed this year, so 14.
    const { overrides } = resolveChildOwnedFields({ age: 99 }, CHILD, ASOF);
    expect(overrides.age).toBe(14);
  });

  it("reports a null child-profile value as missing rather than keeping the caller's", () => {
    const { overrides, missing } = resolveChildOwnedFields(
      { name: "Whoever" },
      { ...CHILD, name: null },
      ASOF,
    );
    expect(missing).toEqual(["name"]);
    expect(overrides).not.toHaveProperty("name");
  });

  it("treats an empty or whitespace value as missing, same as the school resolver", () => {
    expect(resolveChildOwnedFields({ name: "X" }, { ...CHILD, name: "" }, ASOF).missing).toEqual(["name"]);
    expect(resolveChildOwnedFields({ grade: "g" }, { ...CHILD, grade: "   " }, ASOF).missing).toEqual(["grade"]);
  });

  it("reports a missing date of birth as a missing age, not a derived one", () => {
    const { overrides, missing } = resolveChildOwnedFields({ age: 10 }, { ...CHILD, dateOfBirth: null }, ASOF);
    expect(missing).toEqual(["age"]);
    expect(overrides).not.toHaveProperty("age");
  });

  it("derives the same age for the same row whatever the caller sends — the PATCH lock", () => {
    const first = resolveChildOwnedFields({ age: 3 }, CHILD, ASOF).overrides.age;
    const second = resolveChildOwnedFields({ age: 40 }, CHILD, ASOF).overrides.age;
    expect(first).toBe(14);
    expect(second).toBe(14);
  });

  it("reports every missing field, not just the first", () => {
    const { missing } = resolveChildOwnedFields(
      { countryId: "uk", curriculum: "British" },
      { ...CHILD, countryId: null, curriculum: null },
      ASOF,
    );
    expect(missing).toEqual(["countryId", "curriculum"]);
  });
});

describe("assessmentIsChildOwned", () => {
  const PROFILE_CREATED = "2026-09-10T12:00:00.000Z";

  it("is true for an assessment created after the child profile existed", () => {
    expect(assessmentIsChildOwned("2026-09-11T00:00:00.000Z", PROFILE_CREATED)).toBe(true);
  });

  it("is false for an assessment that predates the child profile — the account holder's own", () => {
    // The case this exists for: a free user's assessment, taken before they
    // ever registered a child, must not be silently relabelled as the
    // child's on the next PATCH.
    expect(assessmentIsChildOwned("2026-01-01T00:00:00.000Z", PROFILE_CREATED)).toBe(false);
  });

  // INCLUSIVE. Not reachable in practice — registration and assessment
  // creation are always separate, sequential requests — but the predicate is
  // defined to be the same one CREATE relies on unconditionally, where the
  // child profile has necessarily already committed by the time a brand-new
  // assessment's timestamp is minted.
  it("is true at an exact tie", () => {
    expect(assessmentIsChildOwned(PROFILE_CREATED, PROFILE_CREATED)).toBe(true);
  });

  it("is false when the account has no child profile at all", () => {
    expect(assessmentIsChildOwned("2026-09-11T00:00:00.000Z", null)).toBe(false);
    expect(assessmentIsChildOwned("2026-09-11T00:00:00.000Z", undefined)).toBe(false);
  });

  it("is false when the assessment's own createdAt is unknown", () => {
    expect(assessmentIsChildOwned(null, PROFILE_CREATED)).toBe(false);
  });

  it("accepts Date objects and ISO strings interchangeably", () => {
    expect(assessmentIsChildOwned(new Date("2026-09-11T00:00:00.000Z"), new Date(PROFILE_CREATED))).toBe(true);
    expect(assessmentIsChildOwned(new Date("2026-09-11T00:00:00.000Z"), PROFILE_CREATED)).toBe(true);
  });
});
