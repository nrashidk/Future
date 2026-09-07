/**
 * Country and curriculum are immutable once a school has students.
 *
 * a18343b closed MOE National -> null on PATCH /api/admin/organizations/:id.
 * It left MOE National -> British open, which does the same damage by another
 * route: the quiz bank is curriculum-scoped and each assessment records the
 * curriculum it was drawn under, so switching the school's setting leaves every
 * enrolled student's results describing a curriculum the school no longer has.
 *
 * changedOrgCurriculumFields is the whole decision — the handler only counts
 * students when it returns something — so it is what this pins. Storage is
 * mocked so importing admin.routes.ts does not pull in db.ts, which throws at
 * import when DATABASE_URL is unset (same pattern as
 * superadmin.reconciliation.test.ts).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

const { changedOrgCurriculumFields, isClearedOrgField } = await import("./admin.routes");

const CONFIGURED = { countryId: "ae", curriculum: "MOE National" };
const BLANK = { countryId: null, curriculum: null };

describe("changedOrgCurriculumFields", () => {
  it("reports a real switch of both fields", () => {
    expect(changedOrgCurriculumFields(CONFIGURED, { countryId: "uk", curriculum: "British" }))
      .toEqual(["country", "curriculum"]);
  });

  it("reports curriculum alone when the country is unchanged", () => {
    expect(changedOrgCurriculumFields(CONFIGURED, { countryId: "ae", curriculum: "British" }))
      .toEqual(["curriculum"]);
  });

  // The edit form PATCHes every field it holds, so a rename resubmits the
  // country and curriculum it merely echoed back. Comparing against the row
  // rather than against presence in the payload is what keeps that a no-op.
  it("treats a resubmitted identical value as no change", () => {
    expect(changedOrgCurriculumFields(CONFIGURED, { countryId: "ae", curriculum: "MOE National" }))
      .toEqual([]);
  });

  it("treats an omitted field as no change", () => {
    expect(changedOrgCurriculumFields(CONFIGURED, {})).toEqual([]);
    expect(changedOrgCurriculumFields(CONFIGURED, { countryId: "ae" })).toEqual([]);
  });

  // Filling in a blank is how a school created before 81ea920, or by the Stripe
  // group-purchase path, becomes usable at all. It stays open at any student
  // count — 549cd43 means such a school should have none, but the rule does not
  // depend on that.
  it("does not lock a field that is currently unset", () => {
    expect(changedOrgCurriculumFields(BLANK, { countryId: "ae", curriculum: "MOE National" }))
      .toEqual([]);
    expect(changedOrgCurriculumFields({ countryId: "ae", curriculum: null }, { countryId: "ae", curriculum: "British" }))
      .toEqual([]);
  });

  // Clearing is a18343b's guard, which runs first and refuses it outright. This
  // one must not also claim it, or a clear against a student-bearing school
  // would surface as the wrong message.
  it("leaves clears to the a18343b guard", () => {
    expect(changedOrgCurriculumFields(CONFIGURED, { countryId: null, curriculum: "" })).toEqual([]);
    expect(changedOrgCurriculumFields(CONFIGURED, { countryId: "   " })).toEqual([]);
  });
});

describe("isClearedOrgField", () => {
  it('counts null, "" and whitespace as cleared — "" would satisfy a NOT NULL while still failing !org.countryId', () => {
    expect(isClearedOrgField(null)).toBe(true);
    expect(isClearedOrgField("")).toBe(true);
    expect(isClearedOrgField("  ")).toBe(true);
  });

  it("counts a real value as present", () => {
    expect(isClearedOrgField("ae")).toBe(false);
  });
});
