import { describe, it, expect } from "vitest";
import { normalizeGender } from "./gender";

describe("normalizeGender", () => {
  it("lowercases what a person types", () => {
    expect(normalizeGender("Male")).toBe("male");
    expect(normalizeGender(" FEMALE ")).toBe("female");
    expect(normalizeGender("male")).toBe("male");
  });
  it("accepts Arabic", () => {
    expect(normalizeGender("ذكر")).toBe("male");
    expect(normalizeGender("أنثى")).toBe("female");
    expect(normalizeGender("انثى")).toBe("female");
  });
  it("refuses anything else rather than storing it", () => {
    for (const v of ["", "  ", "x", "unknown", "malee", null, undefined, 1]) {
      expect(normalizeGender(v)).toBeNull();
    }
  });
});
