/**
 * The assessment routes store a student's grade in ONE format, 'gradeN'.
 * Seen live 2026-11-15: one account held '12' and 'grade12' rows side by side,
 * because the route kept whatever string the client sent.
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("../storage", () => ({ storage: {} }));
import { normalizeAssessmentPayload } from "./assessment.routes";

describe("normalizeAssessmentPayload: grade", () => {
  it("stores a bare number as its canonical grade", () => {
    expect(normalizeAssessmentPayload({ grade: "12" }).normalized.grade).toBe("grade12");
    expect(normalizeAssessmentPayload({ grade: 10 }).normalized.grade).toBe("grade10");
  });

  it("leaves a canonical grade unchanged (idempotent)", () => {
    expect(normalizeAssessmentPayload({ grade: "grade9" }).normalized.grade).toBe("grade9");
  });

  it("canonicalises a grade promoted from educationLevel", () => {
    expect(normalizeAssessmentPayload({ educationLevel: "11" }).normalized.grade).toBe("grade11");
  });

  it("CONTROL: leaves an unrecognised value as sent, for validation to judge", () => {
    expect(normalizeAssessmentPayload({ grade: "13" }).normalized.grade).toBe("13");
    expect(normalizeAssessmentPayload({}).normalized.grade).toBeUndefined();
  });
});
