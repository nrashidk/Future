/**
 * HOW AN AMOUNT DECIDES A GRANT'S KIND.
 *
 * Pure and exported so it can be pinned by tests without a database, the same
 * reason schoolSetupDecision is.
 *
 * WHY THIS IS NOT INLINE at its call sites. license_grants carries a check
 * constraint: a purchase must name both an amount and a currency, and nothing
 * else may name either. One of those call sites is INSIDE the Stripe group
 * purchase transaction, where a refused insert would roll back a payment
 * already taken — the same hazard that keeps a school's country and curriculum
 * nullable on that path. A try/catch does not help, because in Postgres a
 * failed statement aborts the surrounding transaction regardless. So the
 * decision has to be made before the insert, correctly, every time, and it is
 * worth one function and one test rather than three hand-written copies.
 *
 * WHAT A MISSING AMOUNT MEANS, deliberately: granted, not sold. Recording an
 * unknown amount as a purchase of zero would put a school into revenue at no
 * price and understate the average; recording it as a grant says only what is
 * known. An unexplained licence count is recoverable from Stripe. A lost sale
 * is not.
 */

export type LicenseGrantKind = "purchase" | "comp" | "adjustment" | "backfill";

export interface GrantMoneyDecision {
  kind: Exclude<LicenseGrantKind, "backfill">;
  amountPaid: number | null;
  currency: string | null;
}

/**
 * @param amount    whatever the caller has — a number, a string from a request
 *                  body, null, undefined, or NaN from `undefined / 100`
 * @param currency  the currency to record WITH an amount; ignored without one
 * @param whenUnpaid the kind to use when there is no usable amount: "comp" for
 *                  a grant of licences, "adjustment" for a correction. A
 *                  reduction is never a purchase, so a negative delta should
 *                  pass "adjustment".
 */
export function decideGrantMoney(
  amount: unknown,
  currency: unknown = "USD",
  whenUnpaid: "comp" | "adjustment" = "comp",
): GrantMoneyDecision {
  // A string is accepted because request bodies carry numbers as text, but
  // empty string is absence rather than zero — "" coerces to 0, which would
  // silently record a free grant as a sale at no price.
  const raw = typeof amount === "string" ? (amount.trim() === "" ? null : Number(amount)) : amount;
  const usable = typeof raw === "number" && Number.isFinite(raw);

  if (!usable) return { kind: whenUnpaid, amountPaid: null, currency: null };

  // Normalised here rather than at each call site: the column is three
  // characters, and 'usd' and 'USD' summing separately in a revenue report is
  // exactly the drift this codebase keeps producing.
  const code = String(currency ?? "USD").trim().toUpperCase().slice(0, 3) || "USD";
  return { kind: "purchase", amountPaid: raw as number, currency: code };
}
