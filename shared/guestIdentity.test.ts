/**
 * The rule that decides whether a thirteen-year-old's name and age are stored
 * by a public form. Each case is a decision, not a shape check.
 */
import { describe, it, expect } from "vitest";
import {
  GUEST_WITHHELD_FIELDS, withholdGuestIdentity, basicInfoComplete,
} from "./guestIdentity";

const full = { name: "Sara", age: 15, grade: "10", gender: "female" };

describe("withholdGuestIdentity", () => {
  it("clears name, age and gender for a guest and keeps grade", () => {
    // Grade selects the question pool; without it the quiz cannot be built.
    // It also names nobody on its own.
    const out = withholdGuestIdentity(full, true);
    expect(out).toEqual({ name: null, age: null, grade: "10", gender: null });
  });

  it("leaves an authenticated caller's payload completely alone", () => {
    // A school student's details come from the record the school already holds
    // with consent attached. Stripping them would break the product for the
    // population that is allowed to have them.
    expect(withholdGuestIdentity(full, false)).toEqual(full);
  });

  it("writes NULL rather than deleting the key", () => {
    // A deleted key on a PATCH means "leave the column alone", so a guest
    // could set a name on the first request and keep it for ever by omitting
    // it on the second. An explicit null overwrites on every write.
    const out = withholdGuestIdentity(full, true) as Record<string, unknown>;
    for (const f of GUEST_WITHHELD_FIELDS) {
      expect(f in out).toBe(true);
      expect(out[f]).toBeNull();
    }
  });

  it("does not mutate the input", () => {
    // Both call sites pass a validated payload that other code reads after.
    const input = { ...full };
    withholdGuestIdentity(input, true);
    expect(input).toEqual(full);
  });

  it("adds nothing for a field the payload never carried", () => {
    // A PATCH that only touches subjects must not gain three null columns.
    const partial = { favoriteSubjects: ["Mathematics"] };
    expect(withholdGuestIdentity(partial, true)).toEqual(partial);
  });
});

describe("basicInfoComplete", () => {
  it("a guest is complete on GRADE alone", () => {
    expect(basicInfoComplete({ grade: "10" }, true)).toBe(true);
  });

  it("a guest with no grade is NOT complete — the quiz needs it", () => {
    // The one field that is genuinely required, and the reason this is not
    // simply "guests skip step 1".
    expect(basicInfoComplete({ grade: null }, true)).toBe(false);
    expect(basicInfoComplete({}, true)).toBe(false);
  });

  it("an ACCOUNT still needs all four", () => {
    expect(basicInfoComplete(full, false)).toBe(true);
    expect(basicInfoComplete({ ...full, name: null }, false)).toBe(false);
    expect(basicInfoComplete({ ...full, gender: null }, false)).toBe(false);
    expect(basicInfoComplete({ ...full, grade: null }, false)).toBe(false);
  });

  it("treats age 0 as present, not as missing", () => {
    // The falsy-zero trap. An age of 0 is nonsense data, but reading it as
    // "not answered" would pin that student at step 1 on every resume, which
    // is a worse failure than storing a strange number.
    expect(basicInfoComplete({ ...full, age: 0 }, false)).toBe(true);
    expect(basicInfoComplete({ ...full, age: null }, false)).toBe(false);
    expect(basicInfoComplete({ ...full, age: undefined }, false)).toBe(false);
  });

  it("IGNORES leftover identity values on a guest rather than demanding them", () => {
    // A guest row written before this change may still hold a name. The gate
    // must not start requiring the other two because one survived.
    expect(basicInfoComplete({ name: "Old", grade: "10" }, true)).toBe(true);
  });
});
