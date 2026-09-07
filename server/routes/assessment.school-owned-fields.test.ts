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

const MEMBER = {
  studentName: "Ahmed Ali",
  studentGender: "male",
  grade: "grade10",
  dateOfBirth: "2010-03-14",
};
const ORG = { countryId: "ae", curriculum: "MOE National" };

/**
 * The reference date every case resolves against, fixed so the derived age is a
 * constant rather than a function of when the suite runs.
 *
 * This is the whole reason resolveSchoolOwnedFields takes `asOf` instead of
 * reading the clock: assessments.age is a snapshot, and a test that could not
 * pin the reference date could not tell a correct derivation from one that
 * happens to agree today.
 */
const ASOF = "2026-09-07";

describe("SCHOOL_OWNED_ASSESSMENT_FIELDS", () => {
  it("is exactly the six with a school-side source", () => {
    expect([...SCHOOL_OWNED_ASSESSMENT_FIELDS]).toEqual([
      "name",
      "grade",
      "gender",
      "age",
      "countryId",
      "curriculum",
    ]);
  });

  // INVERTED, not deleted. This used to assert that age was absent, and the
  // reason it gave was true at the time: student_age was nullable, excluded from
  // the demographics CHECK and NULL on every row (migration 014:29-38), so there
  // was nothing to lock age to and inventing a value would have put a fabricated
  // age in a minor's record. Migration 015 added date_of_birth, which is the
  // school-side source that was missing.
  it("includes age, which now has a school-side source in date_of_birth", () => {
    expect(SCHOOL_OWNED_ASSESSMENT_FIELDS).toContain("age");
  });
});

describe("resolveSchoolOwnedFields", () => {
  it("overrides a student's own values with the school's", () => {
    const { overrides, missing } = resolveSchoolOwnedFields(
      { name: "Not My Name", grade: "grade12", gender: "female", age: 99, countryId: "uk", curriculum: "British" },
      MEMBER,
      ORG,
      ASOF,
    );
    expect(overrides).toEqual({
      name: "Ahmed Ali",
      grade: "grade10",
      gender: "male",
      age: 16,
      countryId: "ae",
      curriculum: "MOE National",
    });
    expect(missing).toEqual([]);
  });

  it("leaves fields the payload does not name alone", () => {
    const { overrides, missing } = resolveSchoolOwnedFields({ grade: "grade12" }, MEMBER, ORG, ASOF);
    expect(overrides).toEqual({ grade: "grade10" });
    expect(missing).toEqual([]);
  });

  // INVERTED, not deleted. This used to assert that age survived untouched,
  // "the one demographic the student still owns". It is now derived from the
  // school's date of birth like the other five are copied from the school's
  // columns, and a student's own number is overwritten rather than kept.
  it("overrides a student's own age with one derived from the school's date of birth", () => {
    const { overrides } = resolveSchoolOwnedFields({ name: "X", age: 99 }, MEMBER, ORG, ASOF);
    // Born 2010-03-14, as of 2026-09-07: birthday passed, so 16.
    expect(overrides.age).toBe(16);
  });

  // The old block returned the student's own value whenever the school's was
  // unavailable — the input silently won exactly when the guard was needed.
  it("reports a null school value as missing rather than keeping the student's", () => {
    const { overrides, missing } = resolveSchoolOwnedFields(
      { name: "Whoever I Like", grade: "grade12" },
      { ...MEMBER, studentName: null },
      ORG,
      ASOF,
    );
    expect(missing).toEqual(["name"]);
    expect(overrides).not.toHaveProperty("name");
    // The fields the school CAN supply are still resolved.
    expect(overrides).toEqual({ grade: "grade10" });
  });

  // "" satisfies a NOT NULL while still failing every downstream
  // `!assessment.grade` check — the same hole a18343b closed on organizations.
  it("treats an empty or whitespace school value as missing", () => {
    expect(resolveSchoolOwnedFields({ name: "X" }, { ...MEMBER, studentName: "" }, ORG, ASOF).missing).toEqual(["name"]);
    expect(resolveSchoolOwnedFields({ grade: "g" }, { ...MEMBER, grade: "   " }, ORG, ASOF).missing).toEqual(["grade"]);
  });

  it("reports every missing field, not just the first", () => {
    const { missing } = resolveSchoolOwnedFields(
      { countryId: "uk", curriculum: "British" },
      MEMBER,
      { countryId: null, curriculum: null },
      ASOF,
    );
    expect(missing).toEqual(["countryId", "curriculum"]);
  });

  describe("the derived age", () => {
    it("reports a member with no date of birth as missing, rather than deriving nothing", () => {
      // THE CASE THE ENTRY-POINT BLOCK EXISTS FOR. A student whose school has
      // not recorded a DOB cannot have an age derived, and the student's own
      // number must not be kept — that is the self-reported age the derivation
      // replaces. They are stopped before the assessment starts; if they somehow
      // reach create, this is what fails them closed.
      const { overrides, missing } = resolveSchoolOwnedFields(
        { age: 15 },
        { ...MEMBER, dateOfBirth: null },
        ORG,
        ASOF,
      );
      expect(missing).toEqual(["age"]);
      expect(overrides).not.toHaveProperty("age");
    });

    it("treats an undefined date of birth the same as null", () => {
      const { missing } = resolveSchoolOwnedFields({ age: 15 }, { ...MEMBER, dateOfBirth: undefined }, ORG, ASOF);
      expect(missing).toEqual(["age"]);
    });

    it("treats an unparseable date of birth as missing", () => {
      // ageOnDate returns null rather than guessing, so junk in the column fails
      // closed instead of deriving a wrong age into a minor's record.
      const { missing } = resolveSchoolOwnedFields({ age: 15 }, { ...MEMBER, dateOfBirth: "14/03/2010" }, ORG, ASOF);
      expect(missing).toEqual(["age"]);
    });

    it("does not derive an age before the birthday has come round", () => {
      // Born 2010-12-25, as of 2026-09-07: still 15, not 16. The off-by-one an
      // ageOnDate that subtracted years alone would produce.
      const { overrides } = resolveSchoolOwnedFields(
        { age: null },
        { ...MEMBER, dateOfBirth: "2010-12-25" },
        ORG,
        ASOF,
      );
      expect(overrides.age).toBe(15);
    });

    it("derives the same age for the same row whatever the student sends", () => {
      // The lock: PATCH re-derives against the assessment's createdAt, so a
      // student's own value can never survive and the recomputation is
      // idempotent.
      const first = resolveSchoolOwnedFields({ age: 11 }, MEMBER, ORG, ASOF).overrides.age;
      const second = resolveSchoolOwnedFields({ age: 40 }, MEMBER, ORG, ASOF).overrides.age;
      expect(first).toBe(16);
      expect(second).toBe(16);
    });

    it("derives against the reference date it is given, not today", () => {
      // Same row, two reference dates, two answers — which is what makes
      // assessments.age a snapshot rather than a live value.
      expect(resolveSchoolOwnedFields({ age: null }, MEMBER, ORG, "2026-09-07").overrides.age).toBe(16);
      expect(resolveSchoolOwnedFields({ age: null }, MEMBER, ORG, "2027-09-07").overrides.age).toBe(17);
      expect(resolveSchoolOwnedFields({ age: null }, MEMBER, ORG, "2024-01-01").overrides.age).toBe(13);
    });

    it("leaves age alone on a PATCH that does not name it", () => {
      // PATCH only considers what the payload names, so an autosave from a later
      // step cannot rewrite the age stored at create.
      const { overrides } = resolveSchoolOwnedFields({ grade: "grade12" }, MEMBER, ORG, ASOF);
      expect(overrides).not.toHaveProperty("age");
    });
  });

  // The handler skips the organization query when the payload touches neither
  // field it owns. That saving must not turn into a spurious failure.
  it("passing a null organization is safe when the payload names neither of its fields", () => {
    const { overrides, missing } = resolveSchoolOwnedFields({ name: "X", grade: "g", gender: "female" }, MEMBER, null, ASOF);
    expect(missing).toEqual([]);
    expect(overrides).toEqual({ name: "Ahmed Ali", grade: "grade10", gender: "male" });
  });

  // POST builds its request with every field present (`?? null`) because a
  // create writes the whole row — a field the client omitted must still come
  // from the school rather than being left null for a later PATCH to fill in.
  // `missing` is about the SCHOOL's value being absent, never the client's.
  it("resolves a field the client did not supply, in the create-shaped call", () => {
    const requested = { name: null, grade: null, gender: null, age: null, countryId: null, curriculum: null };
    const { overrides, missing } = resolveSchoolOwnedFields(requested, MEMBER, ORG, ASOF);
    expect(missing).toEqual([]);
    expect(overrides).toEqual({
      name: "Ahmed Ali",
      grade: "grade10",
      gender: "male",
      age: 16,
      countryId: "ae",
      curriculum: "MOE National",
    });
  });

  it("derives age in the create-shaped call, where the client sent none", () => {
    const requested = { name: null, grade: null, gender: null, age: null, countryId: null, curriculum: null };
    const { overrides, missing } = resolveSchoolOwnedFields(requested, MEMBER, ORG, ASOF);
    expect(missing).toEqual([]);
    expect(overrides.age).toBe(16);
  });

  it("reports the organization's fields as missing when it is absent but they are named", () => {
    const { missing } = resolveSchoolOwnedFields({ curriculum: "British" }, MEMBER, undefined, ASOF);
    expect(missing).toEqual(["curriculum"]);
  });
});
