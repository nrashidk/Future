/**
 * LICENCE PRICING — one source for the server, the client and the tests.
 *
 * The volume tiers were written out TWICE, by hand: once in
 * server/routes/payment.routes.ts and once in client/src/pages/GroupPricing.tsx.
 * They agreed when this was written, which is the dangerous state: the page
 * quotes a price, the server charges a different one, and nothing fails. A
 * buyer who is shown 10% off and charged full price has no way to tell whose
 * fault it is.
 *
 * MINOR UNITS THROUGHOUT. Money is integer fils, halalas or cents here, never
 * a float. `0.1 + 0.2` is not `0.3`, and Stripe is charged in minor units
 * anyway, so converting once at the boundary is the only safe arrangement.
 *
 * NOT A CURRENCY CONVERTER, deliberately. Each country stores its own price in
 * its own currency, decided once. A live FX call in the payment path would buy
 * nothing — the dirham and the riyal are both pegged to the dollar — while
 * adding a way for checkout to fail when an exchange-rate service is down.
 */

/**
 * The discount a school earns for buying in bulk, and the only place these
 * thresholds exist. Ordered highest-first: `find` then returns the best tier a
 * count qualifies for, so the order IS the logic and a mis-sorted list would
 * silently sell at the wrong discount.
 */
export const VOLUME_TIERS: ReadonlyArray<{ minStudents: number; discount: number }> = [
  { minStudents: 1000, discount: 0.20 },
  { minStudents: 500, discount: 0.15 },
  { minStudents: 100, discount: 0.10 },
  { minStudents: 1, discount: 0 },
];

/**
 * The fallback price, in US cents, for a country with no price of its own.
 *
 * USD rather than nothing: a country added before anyone sets its price must
 * still be able to transact. Selling at the wrong CURRENCY is recoverable;
 * refusing a sale, or charging zero, is not. `countryPricing` records when this
 * fallback was used so the gap is reportable rather than invisible — the
 * accepted-at-creation, broken-for-ever family.
 */
export const DEFAULT_PRICE_MINOR = 1000;
export const DEFAULT_CURRENCY = "USD";

/**
 * HOW MANY DECIMAL PLACES EACH CURRENCY HAS.
 *
 * Not cosmetic — it decides what an integer amount MEANS. 1000 is ten dollars
 * and ten dirhams, but one dinar, and treating a Kuwaiti price as two-decimal
 * would charge a hundredth of the intended amount.
 *
 * The Gulf three-decimal currencies are here because they are the plausible
 * next markets after the UAE and Saudi Arabia, and getting one wrong is a
 * silent mischarge rather than an error. Anything absent defaults to 2, which
 * is right for the overwhelming majority.
 */
const CURRENCY_EXPONENTS: Record<string, number> = {
  // Three decimals — Gulf and Jordan.
  BHD: 3, JOD: 3, KWD: 3, OMR: 3, TND: 3,
  // Zero decimals.
  JPY: 0, KRW: 0, VND: 0, CLP: 0, ISK: 0,
  // Everything else is two: AED, SAR, USD, QAR, EGP, EUR, GBP, …
};

export function currencyExponent(currency: string): number {
  return CURRENCY_EXPONENTS[currency.toUpperCase()] ?? 2;
}

/**
 * STRIPE REFUSES A THREE-DECIMAL AMOUNT THAT IS NOT A MULTIPLE OF TEN.
 *
 * Its API takes those currencies in minor units but settles to two decimals,
 * so 1234 fils is rejected outright. A price typed as 1.234 KWD would fail at
 * checkout, for that country only, with a Stripe error nobody reading the code
 * would expect. Rounding here, at the one boundary that talks to Stripe, keeps
 * that out of every call site.
 */
export function stripeChargeableMinor(amountMinor: number, currency: string): number {
  if (currencyExponent(currency) !== 3) return amountMinor;
  return Math.round(amountMinor / 10) * 10;
}

/**
 * The smallest charge Stripe will accept, in minor units, per currency —
 * roughly fifty US cents everywhere.
 *
 * The old check was `amountInCents < 50` with the message "Minimum is $0.50
 * USD". Against a dirham price that is 0.50 AED, so it would have let through
 * an amount Stripe then rejects, turning a clear validation message into a
 * payment-provider error at the worst moment.
 */
const MINIMUM_CHARGE_MINOR: Record<string, number> = {
  USD: 50, EUR: 50, GBP: 30,
  AED: 200, SAR: 200, QAR: 200,
  EGP: 3000,
  // Three-decimal: ~0.50 USD, and a multiple of ten so Stripe accepts it.
  KWD: 150, BHD: 200, OMR: 200, JOD: 350,
};

export function minimumChargeMinor(currency: string): number {
  // Defaults high rather than low. An unknown currency refused here gives a
  // clear message; one let through fails inside Stripe after the buyer has
  // filled in a card.
  return MINIMUM_CHARGE_MINOR[currency.toUpperCase()] ?? 200;
}

export interface PriceQuote {
  currency: string;
  /** Per licence before any discount. */
  unitPriceMinor: number;
  /** Per licence after the volume discount, rounded to a whole minor unit. */
  perStudentMinor: number;
  /** What will actually be charged, already safe to hand to Stripe. */
  totalMinor: number;
  /** 0, 0.10, 0.15 or 0.20 — a fraction, not a percentage. */
  discount: number;
  /** 0, 10, 15 or 20, for display. */
  discountPercent: number;
  studentCount: number;
}

/**
 * THE ONE PRICE CALCULATION. Both the quote on the pricing page and the amount
 * sent to Stripe come from here, so they cannot disagree.
 *
 * The total is computed from the UNROUNDED per-student figure and rounded
 * once, at the end. Rounding per student and then multiplying drifts: at 20%
 * off a 36.73 AED price, the per-student figure is 29.384, and a thousand
 * students rounded first is 29,380 against 29,384 — four fils that make the
 * page and the receipt disagree for no reason anyone could explain.
 */
export function quotePrice(params: {
  studentCount: number;
  unitPriceMinor?: number;
  currency?: string;
}): PriceQuote {
  /**
   * FINITENESS, not just nullishness. `?? DEFAULT` passes NaN and Infinity
   * straight through, and `Math.max(0, NaN)` is NaN, not 0 — so a bad price
   * reached Stripe as an amount of NaN and failed there instead of here. Found
   * by the test below, not by reading this.
   */
  const finite = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  /**
   * COUNTS FLOOR, MONEY ROUNDS, and the difference is not pedantic: rounding a
   * count of 2.7 up to 3 charges a school for a student it does not have.
   * Downward is the only safe direction for something a buyer is billed per.
   */
  const rawCount = finite(params.studentCount);
  const studentCount = rawCount === null ? 0 : Math.max(0, Math.floor(rawCount));

  const currency = (params.currency ?? DEFAULT_CURRENCY).toUpperCase();

  const rawPrice = finite(params.unitPriceMinor);
  const unitPriceMinor = rawPrice === null ? DEFAULT_PRICE_MINOR : Math.max(0, Math.round(rawPrice));

  const tier = VOLUME_TIERS.find((t) => studentCount >= t.minStudents) ?? { discount: 0 };
  const discount = tier.discount;

  const exactPerStudent = unitPriceMinor * (1 - discount);
  const totalMinor = stripeChargeableMinor(
    Math.round(exactPerStudent * studentCount),
    currency,
  );

  return {
    currency,
    unitPriceMinor,
    perStudentMinor: Math.round(exactPerStudent),
    totalMinor,
    discount,
    discountPercent: Math.round(discount * 100),
    studentCount,
  };
}

/** Minor units to a major-unit number, for display and for the ledger. */
export function toMajor(amountMinor: number, currency: string): number {
  const e = currencyExponent(currency);
  return amountMinor / Math.pow(10, e);
}

/**
 * Formatted for a human, in their own locale, with the currency named.
 *
 * `Intl` is given the exponent explicitly rather than trusting it to know: a
 * three-decimal currency rendered with two decimals is a wrong number on an
 * invoice, not a formatting preference.
 */
export function formatMoney(amountMinor: number, currency: string, locale = "en"): string {
  const e = currencyExponent(currency);
  const major = toMajor(amountMinor, currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: e,
      maximumFractionDigits: e,
    }).format(major);
  } catch {
    // An unrecognised currency code must still render something true rather
    // than throwing inside a price component.
    return `${major.toFixed(e)} ${currency}`;
  }
}

/**
 * The price for a country, and WHETHER IT HAS ONE.
 *
 * `usedFallback` is the point of returning an object instead of a number. A
 * country with no price still transacts, in dollars, and that state is
 * otherwise invisible until someone notices the wrong currency on a receipt —
 * so it is returned as a fact the caller can report, the same pattern as
 * getCountryReadiness.
 */
export function countryPricing(country?: {
  licensePriceMinor?: number | null;
  licenseCurrency?: string | null;
} | null): { unitPriceMinor: number; currency: string; usedFallback: boolean } {
  const price = country?.licensePriceMinor;
  const currency = country?.licenseCurrency?.trim();

  // BOTH or NEITHER. A price without a currency is meaningless and a currency
  // without a price has nothing to charge, so a half-configured country falls
  // back whole rather than mixing one country's number with the dollar.
  if (typeof price === "number" && Number.isFinite(price) && price > 0 && currency) {
    return { unitPriceMinor: Math.round(price), currency: currency.toUpperCase(), usedFallback: false };
  }
  return { unitPriceMinor: DEFAULT_PRICE_MINOR, currency: DEFAULT_CURRENCY, usedFallback: true };
}
