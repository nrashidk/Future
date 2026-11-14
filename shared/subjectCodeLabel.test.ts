import { describe, it, expect } from "vitest";
import { subjectCodeLabel } from "./subjects";

describe("subjectCodeLabel", () => {
  it("names a canonical subject from its code, in both languages", () => {
    expect(subjectCodeLabel("mathematics", "en")).toBe("Mathematics");
    expect(subjectCodeLabel("social_studies", "en")).toBe("Social Studies");
    expect(subjectCodeLabel("computer_science", "ar")).toBe("علوم الحاسب");
    expect(subjectCodeLabel("Social Studies", "ar")).toBe("الدراسات الاجتماعية");
  });

  it("opens up an unknown code rather than hiding it", () => {
    expect(subjectCodeLabel("islamic_studies", "en")).toBe("Islamic Studies");
    expect(subjectCodeLabel("islamic_studies", "ar")).toBe("Islamic Studies");
  });
});
