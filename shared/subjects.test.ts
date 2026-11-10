import { describe, it, expect } from "vitest";
import { curriculumNameFor, subjectNameFor, gradeLabelFor } from "./subjects";

describe("curriculumNameFor", () => {
  it("translates the one curriculum that actually has an Arabic name", () => {
    // An Arabic-speaking administrator must pick this correctly before the
    // school can enrol anybody, and it was rendered in English.
    expect(curriculumNameFor("MOE National", "ar")).toBe("المنهاج الوطني (وزارة التربية والتعليم)");
  });

  it("leaves a proper noun alone — 'IB' is 'IB' inside Arabic text", () => {
    // The original `nameAr: null` was right about these, and the fallback is
    // what keeps it right: translating them would be worse than not.
    expect(curriculumNameFor("IB", "ar")).toBe("IB");
    expect(curriculumNameFor("British", "ar")).toBe("British");
  });

  it("returns the name unchanged in English, whatever it is", () => {
    expect(curriculumNameFor("MOE National", "en")).toBe("MOE National");
  });

  it("does not hide an unknown curriculum behind a placeholder", () => {
    // Same rule as subjectNameFor: curricula are free text per country, so a
    // curriculum seeded outside this list can reach a screen, and printing
    // what it is called is more honest than a dash.
    expect(curriculumNameFor("Something Seeded Later", "ar")).toBe("Something Seeded Later");
  });
});

describe("the neighbours this was modelled on, so the three stay consistent", () => {
  it("subjectNameFor falls through to the id for anything outside the six", () => {
    expect(subjectNameFor("Mathematics", "ar")).toBe("الرياضيات");
    expect(subjectNameFor("Islamic Studies", "ar")).toBe("Islamic Studies");
  });

  it("gradeLabelFor localises the LABEL and never the value", () => {
    // Latin digits on both sides: the value is matched against
    // quiz_questions.grade, and Arabic-Indic digits would stop matching.
    expect(gradeLabelFor("9", "ar")).toBe("الصف 9");
    expect(gradeLabelFor("9", "en")).toBe("Grade 9");
  });
});
