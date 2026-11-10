/**
 * WHAT A PROVIDER EVENT MEANS, AND WHETHER IT MAY REPLACE WHAT WE ALREADY HOLD.
 *
 * Pure, because the webhook that uses it runs on a request we do not control
 * the order of. Resend does not guarantee that `email.sent` arrives before
 * `email.delivered`, and in practice it often does not: the two are emitted
 * milliseconds apart and travel separately. A handler that simply wrote the
 * latest event would therefore degrade `delivered` back to `sent` at random,
 * and the superadmin column would flicker between "arrived" and "handed over"
 * with nothing in the product changing.
 *
 * So every status carries a RANK and an event may only move a row FORWARD.
 * That one rule makes the handler order-independent without a timestamp
 * comparison, which would have its own problem: two events in the same
 * millisecond are common and `>` would drop one of them.
 *
 * `email.opened` and `email.clicked` are DELIBERATELY NOT HANDLED. Open
 * tracking is a pixel, and Apple Mail Privacy Protection, Gmail's image proxy
 * and most corporate gateways either suppress it or fire it on the server's
 * behalf. A status built on it would be confidently wrong in both directions,
 * which is worse than the null we have today. Whether the buyer actually used
 * the link is already known exactly, from `used_at`.
 */

/** The statuses we store. `null` in the column means no event has arrived. */
export type EmailDeliveryStatus =
  | "sent"
  | "delayed"
  | "delivered"
  | "complained"
  | "bounced";

/**
 * Higher wins. An event whose rank is not strictly greater than the stored
 * one is dropped, which is what makes the handler safe against reordering and
 * against Resend's retries of an event it already delivered.
 *
 * `bounced` and `complained` outrank `delivered` because both describe what
 * happened AFTER a delivery attempt and both mean the buyer did not get a
 * usable mail. `bounced` is highest: a complaint still reached a human.
 */
const RANK: Record<EmailDeliveryStatus, number> = {
  sent: 10,
  delayed: 20,
  delivered: 30,
  complained: 40,
  bounced: 50,
};

/**
 * Resend's event names, mapped to our statuses. An unknown name returns null
 * and the handler answers 200 having done nothing — a non-2xx would have Svix
 * retry it for ever, and a new event type Resend adds later is not an error.
 */
export function statusFromProviderEvent(eventType: string): EmailDeliveryStatus | null {
  switch (eventType) {
    case "email.sent":             return "sent";
    case "email.delivery_delayed": return "delayed";
    case "email.delivered":        return "delivered";
    case "email.complained":       return "complained";
    case "email.bounced":          return "bounced";
    // email.opened / email.clicked: see the header. Everything else is a type
    // we do not know about yet.
    default:                       return null;
  }
}

/**
 * May `next` replace `current`? `current` is null when no event has arrived.
 */
export function shouldAdvance(
  current: string | null | undefined,
  next: EmailDeliveryStatus,
): boolean {
  if (!current) return true;
  const currentRank = RANK[current as EmailDeliveryStatus];
  // An unrecognised stored value (hand-edited, or written by an older build)
  // is treated as no value rather than as something to preserve: the live
  // provider event is the better of the two.
  if (currentRank === undefined) return true;
  return RANK[next] > currentRank;
}

/**
 * The stored values that must BLOCK an incoming `next` — every status whose
 * rank is greater than or equal to it.
 *
 * This exists so the writer can be ONE atomic statement instead of a read
 * followed by a write. `shouldAdvance` is the same rule for a value already in
 * hand; expressing it as a WHERE clause keeps the decision and the write in a
 * single round trip, which is the family of bug this repo has already produced
 * twice (storage.consumeLicense, the checkout create race): deciding from a
 * snapshot taken outside the statement that acts on it.
 *
 * A stored value NOT in this list -- including an unrecognised one -- lets the
 * update through, exactly as `shouldAdvance` does. Never empty, so it is safe
 * to hand to a NOT IN.
 */
export function blockingStatuses(next: EmailDeliveryStatus): EmailDeliveryStatus[] {
  const floor = RANK[next];
  return (Object.keys(RANK) as EmailDeliveryStatus[]).filter((s) => RANK[s] >= floor);
}

/**
 * Did this mail fail to reach a usable inbox? The superadmin surface turns
 * this into "check the address" rather than "send it again", which is the
 * whole reason delivery data was worth collecting: resending to an address
 * that hard-bounced does nothing and looks like the product is broken.
 */
export function isUndeliverable(status: string | null | undefined): boolean {
  return status === "bounced" || status === "complained";
}

/**
 * Did it demonstrably arrive? Note that this is NOT "they read it" — only
 * `used_at` proves a human acted on it.
 */
export function isDelivered(status: string | null | undefined): boolean {
  return status === "delivered";
}
