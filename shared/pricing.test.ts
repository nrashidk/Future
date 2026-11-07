/**
 * Licence pricing.
 *
 * Two things here decide whether a buyer is charged correctly, and both fail
 * silently rather than loudly:
 *
 *   - the currency EXPONENT, because 1000 is ten dirhams but one dinar, and
 *     getting it wrong mischarges by a factor of ten rather than erroring
 *   - the quoted total matching the charged total, because the page and the
 *     card are two different code paths and nothing compares them at runtime
 *
 * The behaviour-preserving cases are pinned first: this module replaced two
 * hand-copied copies of the tier logic, and the prices it produces in USD must
 * be exactly what the old code produced or every existing customer's price
 * moves.
 */
import { describe, it, expect } from "vitest";
import {
  quotePrice, countryPricing, currencyExponent, formatMoney, toMajor,
  stripeChargeableMinor, minimumChargeMinor,
  VOLUME_TIERS, DEFAULT_PRICE_MINOR, DEFAULT_CURRENCY,
} from "./pricing";

describe("volume tiers (behaviour preserved from the old hand-copied logic)", () => {
  /**
   * The exact figures the previous code produced, at $10 base. If any of these
   * moves, existing customers are being repriced by a refactor.
   */
  it.each([
    [1, 0, 1000],
    [99, 0, 99_000],
    [100, 10, 900 * 100],
    [499, 10, 900 * 499],
    [500, 15, 850 * 500],
    [999, 15, 850 * 999],
    [1000, 20, 800 * 1000],
    [5000, 20, 800 * 5000],
  ])("%i students -> %i%% off, %i cents", (count, pct, total) => {
    const q = quotePrice({ studentCount: count });
    expect(q.discountPercent).toBe(pct);
    expect(q.totalMinor).toBe(total);
    expect(q.currency).toBe("USD");
  });

  it("puts the tiers highest-first, because the order IS the logic", () => {
    // `find` returns the first match, so an ascending list would sell every
    // bulk order at the smallest discount.
    const mins = VOLUME_TIERS.map((t) => t.minStudents);
    expect(mins).toEqual([...mins].sort((a, b) => b - a));
  });

  it("gives the boundary count the better tier, not the one below", () => {
    expect(quotePrice({ studentCount: 100 }).discountPercent).toBe(10);
    expect(quotePrice({ studentCount: 99 }).discountPercent).toBe(0);
  });
});

describe("currency exponents", () => {
  it("knows the Gulf three-decimal currencies", () => {
    // The mischarge case: 1000 minor units is 10 AED but 1 KWD.
    for (const c of ["KWD", "BHD", "OMR", "JOD"]) expect(currencyExponent(c)).toBe(3);
    expect(toMajor(1000, "AED")).toBe(10);
    expect(toMajor(1000, "KWD")).toBe(1);
  });

  it("treats the two-decimal currencies as two", () => {
    for (const c of ["AED", "SAR", "USD", "QAR", "EGP"]) expect(currencyExponent(c)).toBe(2);
  });

  it("defaults an unknown currency to two rather than throwing", () => {
    expect(currencyExponent("XYZ")).toBe(2);
  });

  it("is case-insensitive, since a stored code may be lower case", () => {
    expect(currencyExponent("kwd")).toBe(3);
  });
});

describe("Stripe's three-decimal rule", () => {
  it("rounds a three-decimal amount to a multiple of ten", () => {
    // Stripe rejects 1234 KWD minor units outright. Unrounded, a Kuwaiti price
    // fails at checkout for that country alone.
    expect(stripeChargeableMinor(1234, "KWD")).toBe(1230);
    expect(stripeChargeableMinor(1236, "KWD")).toBe(1240);
  });

  it("leaves two-decimal amounts exactly alone", () => {
    expect(stripeChargeableMinor(1234, "AED")).toBe(1234);
    expect(stripeChargeableMinor(3673, "AED")).toBe(3673);
  });

  it("produces a chargeable total for a three-decimal country", () => {
    const q = quotePrice({ studentCount: 7, unitPriceMinor: 3075, currency: "KWD" });
    expect(q.totalMinor % 10).toBe(0);
  });
});

describe("minimum charge", () => {
  it("is in the charged currency, not always fifty cents", () => {
    // The old check was `< 50` with a "$0.50 USD" message. Against a dirham
    // price that is 0.50 AED: an amount this would pass and Stripe refuse.
    expect(minimumChargeMinor("AED")).toBeGreaterThan(50);
    expect(minimumChargeMinor("USD")).toBe(50);
  });

  it("defaults an unknown currency HIGH, so it is refused here not by Stripe", () => {
    expect(minimumChargeMinor("XYZ")).toBeGreaterThanOrEqual(200);
  });
});

describe("rounding", () => {
  /**
   * The total is computed from the unrounded per-student price and rounded
   * once. Rounding per student first and multiplying drifts, and the drift
   * shows up as the page and the receipt disagreeing by a few fils.
   */
  it("rounds once at the end, not per student", () => {
    const unit = 3673; // 36.73 AED
    const q = quotePrice({ studentCount: 1000, unitPriceMinor: unit, currency: "AED" });
    expect(q.totalMinor).toBe(Math.round(unit * 0.8 * 1000)); // 2,938,400
    const roundedFirst = Math.round(unit * 0.8) * 1000;       // 2,938,000
    expect(q.totalMinor).not.toBe(roundedFirst);
  });

  it("still reports a sensible per-student figure for display", () => {
    const q = quotePrice({ studentCount: 1000, unitPriceMinor: 3673, currency: "AED" });
    expect(q.perStudentMinor).toBe(2938);
  });
});

describe("countryPricing", () => {
  it("uses a country's own price and currency when both are set", () => {
    expect(countryPricing({ licensePriceMinor: 3700, licenseCurrency: "aed" }))
      .toEqual({ unitPriceMinor: 3700, currency: "AED", usedFallback: false });
  });

  /**
   * BOTH OR NEITHER. A price with no currency is meaningless and a currency
   * with no price has nothing to charge, so a half-configured country must
   * fall back whole — mixing its number with the dollar would charge 3700
   * CENTS, thirty-seven dollars, for a thirty-seven dirham licence.
   */
  it("falls back whole when only one half is set", () => {
    for (const half of [
      { licensePriceMinor: 3700, licenseCurrency: null },
      { licensePriceMinor: null, licenseCurrency: "AED" },
      { licensePriceMinor: 3700, licenseCurrency: "   " },
      { licensePriceMinor: 0, licenseCurrency: "AED" },
    ]) {
      const r = countryPricing(half as any);
      expect(r, JSON.stringify(half)).toEqual({
        unitPriceMinor: DEFAULT_PRICE_MINOR, currency: DEFAULT_CURRENCY, usedFallback: true,
      });
    }
  });

  it("falls back for a missing country rather than throwing", () => {
    for (const c of [null, undefined, {}]) {
      expect(countryPricing(c as any).usedFallback).toBe(true);
    }
  });

  it("reports that it fell back, so the gap is visible", () => {
    // A country transacting in the wrong currency is otherwise invisible until
    // someone reads a receipt.
    expect(countryPricing({}).usedFallback).toBe(true);
    expect(countryPricing({ licensePriceMinor: 3700, licenseCurrency: "AED" }).usedFallback).toBe(false);
  });
});

describe("formatMoney", () => {
  it("shows a three-decimal currency with three decimals", () => {
    // Two decimals on a dinar invoice is a wrong number, not a style choice.
    expect(formatMoney(3075, "KWD", "en")).toMatch(/3\.075/);
  });

  it("shows two decimals for dirhams and riyals", () => {
    expect(formatMoney(3700, "AED", "en")).toMatch(/37\.00/);
    expect(formatMoney(3750, "SAR", "en")).toMatch(/37\.50/);
  });

  it("names the currency rather than relying on a bare symbol", () => {
    // A lone "$" beside a dirham figure is actively misleading.
    expect(formatMoney(3700, "AED", "en")).toMatch(/AED|د\.إ/);
  });

  it("renders an unrecognised but well-formed code rather than throwing", () => {
    // Intl accepts any three-letter code, so this does not hit the fallback —
    // it formats, which is the right outcome: a true number and a named code.
    expect(formatMoney(1234, "XYZ", "en")).toContain("12.34");
    expect(formatMoney(1234, "XYZ", "en")).toContain("XYZ");
  });

  it("falls back instead of throwing on a MALFORMED code", () => {
    // This is what the catch is for: Intl rejects a code that is not three
    // letters, and a price component must not throw inside a render.
    for (const bad of ["X", "TOOLONG", ""]) {
      expect(() => formatMoney(1234, bad, "en"), bad).not.toThrow();
      expect(formatMoney(1234, bad, "en"), bad).toContain("12.34");
    }
  });
});

describe("degenerate input", () => {
  it("floors a fractional student count, never rounds it up", () => {
    // Rounding 2.7 up to 3 bills a school for a student it does not have.
    // Counts floor; only money rounds.
    expect(quotePrice({ studentCount: 2.7 }).studentCount).toBe(2);
    expect(quotePrice({ studentCount: 2.7 }).totalMinor).toBe(2000);
    expect(quotePrice({ studentCount: 99.9 }).discountPercent).toBe(0);
  });

  it("treats a negative count as nothing to charge", () => {
    expect(quotePrice({ studentCount: -5 }).totalMinor).toBe(0);
    expect(quotePrice({ studentCount: -5 }).studentCount).toBe(0);
  });

  it("falls back on a non-finite unit price rather than producing NaN", () => {
    // NaN would reach Stripe as an amount and fail obscurely.
    for (const bad of [NaN, Infinity, undefined]) {
      const q = quotePrice({ studentCount: 10, unitPriceMinor: bad as any });
      expect(Number.isFinite(q.totalMinor), String(bad)).toBe(true);
    }
  });
});
