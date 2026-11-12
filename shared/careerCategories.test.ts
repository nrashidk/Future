import { describe, it, expect } from "vitest";
import { careerCategoryFor } from "./careerCategories";

describe("a career category in the reader's language", () => {
  it("is Arabic in an Arabic report", () => {
    expect(careerCategoryFor("Engineering", "ar")).toBe("الهندسة");
  });
  it("is left alone in English", () => {
    expect(careerCategoryFor("Engineering", "en")).toBe("Engineering");
  });
  it("falls back to the stored name rather than a blank", () => {
    expect(careerCategoryFor("Marine Biology", "ar")).toBe("Marine Biology");
  });
  it("is empty for a career with no category", () => {
    expect(careerCategoryFor(null, "ar")).toBe("");
  });
});
