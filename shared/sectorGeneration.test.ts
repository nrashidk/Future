import { describe, it, expect } from "vitest";
import { sectorGenerationFailure } from "./sectorGeneration";

describe("sectorGenerationFailure", () => {
  it("is not a failure when a map was written", () => {
    expect(sectorGenerationFailure({ attempted: true, persisted: true, sectorsWritten: 6 })).toBeNull();
  });
  it("is not a failure when the step was not attempted or not reported", () => {
    expect(sectorGenerationFailure({ attempted: false })).toBeNull();
    expect(sectorGenerationFailure(undefined)).toBeNull();
    expect(sectorGenerationFailure(null)).toBeNull();
  });
  it("reports the server's reason when nothing was persisted", () => {
    expect(sectorGenerationFailure({ attempted: true, persisted: false, error: " No pages opened " })).toBe("No pages opened");
  });
  it("is a failure when it persisted zero sectors, with the first row error as the reason", () => {
    expect(sectorGenerationFailure({ attempted: true, persisted: true, sectorsWritten: 0, errors: ["", "Energy: sector row failed"] })).toBe("Energy: sector row failed");
  });
  it("is a failure with no reason when the server gave none", () => {
    expect(sectorGenerationFailure({ attempted: true, persisted: false })).toBe("");
    expect(sectorGenerationFailure({ attempted: true, persisted: true })).toBe("");
  });
});
