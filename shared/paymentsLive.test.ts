import { describe, it, expect } from "vitest";
import { paymentsAreLive } from "./paymentsLive";

describe("paymentsAreLive", () => {
  it("is true only for a live publishable key", () => {
    expect(paymentsAreLive("pk_live_51abcdef")).toBe(true);
  });

  /**
   * The state production is in today, and the reason this exists: the card
   * form works, takes a test card, and charges nothing.
   */
  it("is false for a test key", () => {
    expect(paymentsAreLive("pk_test_51abcdef")).toBe(false);
  });

  it("FAILS CLOSED on anything it does not recognise", () => {
    // The dangerous direction is offering a card form that cannot take money,
    // so an unknown state must look like the one that offers an invoice.
    for (const k of [undefined, null, "", "   ", "sk_live_51abc", "PK_LIVE_51abc", "live", "pk_live"]) {
      expect(paymentsAreLive(k as any)).toBe(false);
    }
  });

  it("is not fooled by a live prefix appearing later in the string", () => {
    expect(paymentsAreLive("pk_test_pk_live_51abc")).toBe(false);
  });
});
