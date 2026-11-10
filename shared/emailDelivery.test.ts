/**
 * The ordering rule is the whole point of this module, so most of these cases
 * are about events arriving in the wrong order — the failure that would
 * otherwise be invisible, intermittent, and read as a UI bug.
 */
import { describe, it, expect } from "vitest";
import {
  statusFromProviderEvent, shouldAdvance, blockingStatuses, isUndeliverable, isDelivered,
  providerMessageIdOrNull, LOG_ONLY_MESSAGE_ID,
} from "./emailDelivery";

describe("statusFromProviderEvent", () => {
  it("maps the five events we act on", () => {
    expect(statusFromProviderEvent("email.sent")).toBe("sent");
    expect(statusFromProviderEvent("email.delivery_delayed")).toBe("delayed");
    expect(statusFromProviderEvent("email.delivered")).toBe("delivered");
    expect(statusFromProviderEvent("email.complained")).toBe("complained");
    expect(statusFromProviderEvent("email.bounced")).toBe("bounced");
  });

  it("IGNORES opens and clicks rather than trusting a tracking pixel", () => {
    // Apple Mail Privacy Protection and Gmail's image proxy fire these on the
    // recipient's behalf or suppress them entirely. A status built on them
    // would be wrong in both directions.
    expect(statusFromProviderEvent("email.opened")).toBeNull();
    expect(statusFromProviderEvent("email.clicked")).toBeNull();
  });

  it("returns null for an event type we do not know, rather than throwing", () => {
    // The handler answers 200 on null. A throw would be a non-2xx, and Svix
    // retries a non-2xx for ever.
    expect(statusFromProviderEvent("email.something_new")).toBeNull();
    expect(statusFromProviderEvent("")).toBeNull();
  });
});

describe("shouldAdvance", () => {
  it("accepts the first event of any kind", () => {
    expect(shouldAdvance(null, "sent")).toBe(true);
    expect(shouldAdvance(undefined, "delivered")).toBe(true);
    expect(shouldAdvance(null, "bounced")).toBe(true);
  });

  it("moves forward: sent → delivered", () => {
    expect(shouldAdvance("sent", "delivered")).toBe(true);
  });

  it("REFUSES to go backwards: delivered is not downgraded by a late 'sent'", () => {
    // The case this module exists for. Resend emits sent and delivered
    // milliseconds apart and they travel separately, so this ordering is
    // normal, not exotic.
    expect(shouldAdvance("delivered", "sent")).toBe(false);
  });

  it("refuses a redelivery of the same event", () => {
    // Svix retries on any non-2xx, and a retry of an event we already applied
    // must change nothing.
    expect(shouldAdvance("delivered", "delivered")).toBe(false);
    expect(shouldAdvance("bounced", "bounced")).toBe(false);
  });

  it("lets a bounce overwrite a delivery, and never the reverse", () => {
    expect(shouldAdvance("delivered", "bounced")).toBe(true);
    expect(shouldAdvance("bounced", "delivered")).toBe(false);
  });

  it("ranks a complaint above delivery and below a bounce", () => {
    expect(shouldAdvance("delivered", "complained")).toBe(true);
    expect(shouldAdvance("complained", "bounced")).toBe(true);
    expect(shouldAdvance("bounced", "complained")).toBe(false);
  });

  it("treats a delay as a step on the way, not a terminal state", () => {
    expect(shouldAdvance("sent", "delayed")).toBe(true);
    expect(shouldAdvance("delayed", "delivered")).toBe(true);
    expect(shouldAdvance("delivered", "delayed")).toBe(false);
  });

  it("overwrites an unrecognised stored value rather than preserving it", () => {
    // A value written by an older build, or edited by hand. The live provider
    // event is the better of the two.
    expect(shouldAdvance("queued", "sent")).toBe(true);
  });
});

describe("blockingStatuses", () => {
  // The WHERE clause of the writer. It must agree with shouldAdvance exactly,
  // or the atomic statement and the pure rule drift apart -- which is how the
  // volume tiers ended up written twice in this repo.
  const ALL = ["sent", "delayed", "delivered", "complained", "bounced"] as const;

  it("agrees with shouldAdvance for every (stored, incoming) pair", () => {
    for (const next of ALL) {
      const blocked = blockingStatuses(next);
      for (const current of ALL) {
        expect(blocked.includes(current)).toBe(!shouldAdvance(current, next));
      }
    }
  });

  it("is never empty, so it is safe to hand to a NOT IN", () => {
    for (const next of ALL) expect(blockingStatuses(next).length).toBeGreaterThan(0);
  });

  it("does not list an unrecognised value, so one is overwritten", () => {
    expect(blockingStatuses("sent")).not.toContain("queued" as any);
  });
});

describe("isUndeliverable / isDelivered", () => {
  it("calls a bounce and a complaint undeliverable", () => {
    expect(isUndeliverable("bounced")).toBe(true);
    expect(isUndeliverable("complained")).toBe(true);
  });

  it("does NOT call a null undeliverable — unknown is not failed", () => {
    // The distinction the whole feature is for: before this existed, a null
    // covered a bounce, a spam folder and an unopened inbox alike. It must
    // not now swing the other way and report silence as failure.
    expect(isUndeliverable(null)).toBe(false);
    expect(isUndeliverable("sent")).toBe(false);
    expect(isUndeliverable("delayed")).toBe(false);
  });

  it("calls only 'delivered' delivered", () => {
    expect(isDelivered("delivered")).toBe(true);
    expect(isDelivered("sent")).toBe(false);
    expect(isDelivered(null)).toBe(false);
  });
});

/**
 * THE LOG-ONLY SENTINEL. These exist because storing it is a 23505 waiting for
 * the second mail of a run, and the failure surfaces as "could not send" for a
 * mail that was sent — found on 2026-11-10 while adding the invoices' copy of
 * the unique index.
 */
describe("providerMessageIdOrNull", () => {
  it("keeps a real Resend id", () => {
    expect(providerMessageIdOrNull("4ef9a417-02e9-4d39-ad75-9611e0e73a05"))
      .toBe("4ef9a417-02e9-4d39-ad75-9611e0e73a05");
  });

  it("DISCARDS the log-only sentinel", () => {
    expect(providerMessageIdOrNull(LOG_ONLY_MESSAGE_ID)).toBeNull();
  });

  it("treats the sentinel's own spelling as the only sentinel", () => {
    // A near-miss is a real id as far as this is concerned. The point is not
    // to guess at fakes, only to refuse the one value we ourselves produce.
    expect(providerMessageIdOrNull("dev-mode-no-email-2")).toBe("dev-mode-no-email-2");
  });

  it("is null for absent, empty and whitespace", () => {
    expect(providerMessageIdOrNull(null)).toBeNull();
    expect(providerMessageIdOrNull(undefined)).toBeNull();
    expect(providerMessageIdOrNull("")).toBeNull();
    expect(providerMessageIdOrNull("   ")).toBeNull();
  });

  it("trims, because a stored id with whitespace joins nothing", () => {
    expect(providerMessageIdOrNull("  abc-123  ")).toBe("abc-123");
  });
});
