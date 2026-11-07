/**
 * The amount-to-kind decision for licence grants.
 *
 * The case that matters is NaN. `paymentIntent.amount / 100` produces it when
 * Stripe's payload has no amount, and this decision runs inside the group
 * purchase transaction — so getting it wrong does not mean a wrong report, it
 * means a refused insert rolling back a payment Stripe has already taken.
 */
import { describe, it, expect } from "vitest";
import { decideGrantMoney } from "./licenseGrants";

describe("decideGrantMoney", () => {
  it("records a real amount as a purchase, with the currency normalised", () => {
    expect(decideGrantMoney(1200, "usd")).toEqual({
      kind: "purchase", amountPaid: 1200, currency: "USD",
    });
  });

  it("accepts a numeric string, because request bodies carry numbers as text", () => {
    expect(decideGrantMoney("450.5", "AED")).toEqual({
      kind: "purchase", amountPaid: 450.5, currency: "AED",
    });
  });

  it("treats zero as a real price, not as absence", () => {
    // A genuine zero-price sale is a decision someone made and is reportable.
    // Only an ABSENT amount is unknown.
    expect(decideGrantMoney(0)).toEqual({ kind: "purchase", amountPaid: 0, currency: "USD" });
  });

  /**
   * THE LOST-SALE CASE. NaN must not become a purchase, because a purchase
   * without an amount is refused by the check constraint, inside the
   * transaction that holds the payment.
   */
  it("never calls NaN a purchase", () => {
    const d = decideGrantMoney(undefined as any as number / 100);
    expect(d.kind).toBe("comp");
    expect(d.amountPaid).toBeNull();
    expect(d.currency).toBeNull();
  });

  it("treats null, undefined and empty string as unpaid rather than zero", () => {
    for (const absent of [null, undefined, "", "   "]) {
      const d = decideGrantMoney(absent);
      expect(d, `for ${JSON.stringify(absent)}`).toEqual({
        kind: "comp", amountPaid: null, currency: null,
      });
    }
  });

  it("treats unparseable text as unpaid, not as zero", () => {
    expect(decideGrantMoney("free")).toEqual({ kind: "comp", amountPaid: null, currency: null });
  });

  it("uses adjustment for an unpaid correction, since a reduction is never a sale", () => {
    expect(decideGrantMoney(null, "USD", "adjustment")).toEqual({
      kind: "adjustment", amountPaid: null, currency: null,
    });
  });

  it("drops the currency whenever it drops the amount", () => {
    // The check constraint refuses either one alone, so these must move
    // together or the insert fails where it is least affordable.
    const d = decideGrantMoney(null, "AED");
    expect(d.amountPaid).toBeNull();
    expect(d.currency).toBeNull();
  });

  it("falls back to USD rather than writing an empty currency", () => {
    expect(decideGrantMoney(10, "").currency).toBe("USD");
    expect(decideGrantMoney(10, null).currency).toBe("USD");
  });

  it("truncates a currency to the three characters the column holds", () => {
    expect(decideGrantMoney(10, "dollars").currency).toBe("DOL");
  });
});
