import { describe, it, expect } from "vitest";
import { isAllowedStudentAge } from "./studentAge";

describe("isAllowedStudentAge", () => {
  it("accepts 13 to 18, both ends included", () => {
    for (const a of [13, 14, 15, 16, 17, 18]) expect(isAllowedStudentAge(a)).toBe(true);
  });
  it("refuses the values seen live and their neighbours", () => {
    for (const a of [12, 19, 45, 0, -1, 15.5, NaN]) expect(isAllowedStudentAge(a)).toBe(false);
  });
  it("refuses a non-number", () => {
    expect(isAllowedStudentAge("15")).toBe(false);
    expect(isAllowedStudentAge(null)).toBe(false);
  });
});
