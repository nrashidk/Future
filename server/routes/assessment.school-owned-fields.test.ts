/**
 * Five assessment fields belong to the school, not the student.
 *
 * A school enrols its students and records their name, gender and grade on
 * their behalf, and picks the country and curriculum the whole school sits
 * under. Before this, PATCH /api/assessments/:id let a student rewrite all five:
 * only `curriculum` had an override, and even that returned the student's own
 * value whenever the school lookup came up short.
 *
 * resolveSchoolOwnedFields is the whole rule — the handler owns the lookups and
 * the response, this owns the decision — so it is what these pin. Storage is
 * mocked so importing assessment.routes.ts does not pull in db.ts, which throws
 * at import when DATABASE_URL is unset (same pattern as
 * superadmin.reconciliation.test.ts).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("../storage", () => ({ storage: {} }));

const { resolveSchoolOwnedFields, SCHOOL_OWNED_ASSESSMENT_FIELDS } = await import("./assessment.routes");

const MEMBER = { studentName: "Ahmed Ali", studentGender: "male", grade: "grade10" };
const ORG = { countryId: "ae", curriculum: "MOE National" };

describe("SCHOOL_OWNED_ASSESSMENT_FIELDS", () => {
  it("is exactly the five with a school-side source", () => {
    expect([...SCHOOL_OWNED_ASSESSMENT_FIELDS]).toEqual(["name", "grade", "gender", "countryId", "curriculum"]);
  });

  // organization_members.student_age is nullable, excluded from the demographics
  // CHECK and NULL on every row (migration 014:29-38). There is nothing to lock
  // `age` to, and inventing a value would put a fabricated age in a minor's record.
  it("does not include age, which has no school-side source", () => {
    expect(SCHOOL_OWNED_ASSESSMENT_FIELDS).not.toContain("age");
  });
});

describe("resolveSchoolOwnedFields", () => {
  it("overrides a student's own values with the school's", () => {
    const { overrides, missing } = resolveSchoolOwnedFields(
      { name: "Not My Name", grade: "grade12", gender: "female", countryId: "uk", curriculum: "British" },
      MEMBER,
      ORG,
    );
    expect(overrides).toEqual({
      name: "Ahmed Ali",
      grade: "grade10",
      gender: "male",
      countryId: "ae",
      curriculum: "MOE National",
    });
    expect(missing).toEqual([]);
  });

  it("leaves fields the payload does not name alone", () => {
    const { overrides, missing } = resolveSchoolOwnedFields({ grade: "grade12" }, MEMBER, ORG);
    expect(overrides).toEqual({ grade: "grade10" });
    expect(missing).toEqual([]);
  });

  // age rides along in the same payload as the demographics fields and must
  // survive untouched — it is the one demographic the student still owns.
  it("never touches age", () => {
    const { overrides } = resolveSchoolOwnedFields({ name: "X", age: 15 }, MEMBER, ORG);
    expect(overrides).not.toHaveProperty("age");
    expect(Object.keys(overrides)).toEqual(["name"]);
  });

  // The old block returned the student's own value whenever the school's was
  // unavailable — the input silently won exactly when the guard was needed.
  it("reports a null school value as missing rather than keeping the student's", () => {
    const { overrides, missing } = resolveSchoolOwnedFields(
      { name: "Whoever I Like", grade: "grade12" },
      { ...MEMBER, studentName: null },
      ORG,
    );
    expect(missing).toEqual(["name"]);
    expect(overrides).not.toHaveProperty("name");
    // The fields the school CAN supply are still resolved.
    expect(overrides).toEqual({ grade: "grade10" });
  });

  // "" satisfies a NOT NULL while still failing every downstream
  // `!assessment.grade` check — the same hole a18343b closed on organizations.
  it("treats an empty or whitespace school value as missing", () => {
    expect(resolveSchoolOwnedFields({ name: "X" }, { ...MEMBER, studentName: "" }, ORG).missing).toEqual(["name"]);
    expect(resolveSchoolOwnedFields({ grade: "g" }, { ...MEMBER, grade: "   " }, ORG).missing).toEqual(["grade"]);
  });

  it("reports every missing field, not just the first", () => {
    const { missing } = resolveSchoolOwnedFields(
      { countryId: "uk", curriculum: "British" },
      MEMBER,
      { countryId: null, curriculum: null },
    );
    expect(missing).toEqual(["countryId", "curriculum"]);
  });

  // The handler skips the organization query when the payload touches neither
  // field it owns. That saving must not turn into a spurious failure.
  it("passing a null organization is safe when the payload names neither of its fields", () => {
    const { overrides, missing } = resolveSchoolOwnedFields({ name: "X", grade: "g", gender: "female" }, MEMBER, null);
    expect(missing).toEqual([]);
    expect(overrides).toEqual({ name: "Ahmed Ali", grade: "grade10", gender: "male" });
  });

  it("reports the organization's fields as missing when it is absent but they are named", () => {
    const { missing } = resolveSchoolOwnedFields({ curriculum: "British" }, MEMBER, undefined);
    expect(missing).toEqual(["curriculum"]);
  });
});
