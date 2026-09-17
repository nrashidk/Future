/**
 * Pins the one thing that matters about this file: the client's emitted
 * messages and the server's detector agree, because they're built from the
 * same marker instead of two independently-typed literals. That mismatch is
 * exactly how the previous version of this check went permanently silent —
 * see FOLLOWUP.md.
 */
import { describe, it, expect } from "vitest";
import {
  NARRATIVE_DEGRADED_MARKER,
  narrativeDegradedSafetyNetMessage,
  narrativeDegradedFetchFailureMessage,
  isNarrativeDegradedMessage,
} from "./pdfNarrativeDegradation";

describe("pdfNarrativeDegradation", () => {
  it("the safety-net message is recognized by the detector", () => {
    expect(isNarrativeDegradedMessage(narrativeDegradedSafetyNetMessage(true))).toBe(true);
    expect(isNarrativeDegradedMessage(narrativeDegradedSafetyNetMessage(false))).toBe(true);
  });

  it("the fast-failure message is recognized by the detector", () => {
    expect(isNarrativeDegradedMessage(narrativeDegradedFetchFailureMessage(2, 5))).toBe(true);
  });

  it("an unrelated console message is not mistaken for degradation", () => {
    expect(isNarrativeDegradedMessage("[ResultsPrint] some unrelated log line")).toBe(false);
    expect(isNarrativeDegradedMessage("Safety-net fired at 28s")).toBe(false); // no marker prefix
  });

  it("both message builders actually contain the shared marker verbatim", () => {
    expect(narrativeDegradedSafetyNetMessage(true)).toContain(NARRATIVE_DEGRADED_MARKER);
    expect(narrativeDegradedFetchFailureMessage(1, 3)).toContain(NARRATIVE_DEGRADED_MARKER);
  });
});
