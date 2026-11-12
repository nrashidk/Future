import { describe, it, expect } from "vitest";
import { isArabicText } from "./arabicText";

describe("isArabicText", () => {
  it("accepts Arabic, including Arabic mixed with Latin terms", () => {
    expect(isArabicText("مهندس طيران وفضاء")).toBe(true);
    expect(isArabicText("مطوّر تطبيقات AI")).toBe(true);
  });
  it("refuses an English placeholder, an empty value and a missing one", () => {
    expect(isArabicText("Study planets, stars and the physics of everything beyond Earth.")).toBe(false);
    expect(isArabicText("")).toBe(false);
    expect(isArabicText(null)).toBe(false);
    expect(isArabicText(undefined)).toBe(false);
  });
});
