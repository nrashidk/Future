import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { signPaymentState, verifyPaymentState } from "./oauthState";

const SECRET = "test-session-secret-at-least-32-chars-long";
const PI = "pi_3U7qOERs8AbnfrMU0zecyZyR";

// The helper reads SESSION_SECRET at call time (not import time), so setting it
// here is enough - no module mocking required.
beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
  process.env.SESSION_SECRET = SECRET;
});

describe("signPaymentState / verifyPaymentState", () => {
  // 1. Happy path
  it("round-trips a paymentIntentId", () => {
    const state = signPaymentState(PI);
    expect(verifyPaymentState(state)).toEqual({ paymentIntentId: PI });
  });

  it("produces a URL-safe token (nothing needing escaping in a query param)", () => {
    const state = signPaymentState(PI);
    expect(state).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(state)).toBe(state);
  });

  it("mints distinct tokens for distinct payment intents", () => {
    expect(verifyPaymentState(signPaymentState("pi_AAA"))).toEqual({ paymentIntentId: "pi_AAA" });
    expect(verifyPaymentState(signPaymentState("pi_BBB"))).toEqual({ paymentIntentId: "pi_BBB" });
  });

  // 2. Tampered payload - the attack that matters: swap in another PI
  it("returns null when the payload is swapped for another PI", () => {
    const [, mac] = signPaymentState(PI).split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ pi: "pi_ATTACKER", exp: Date.now() + 60_000 }),
      "utf8",
    ).toString("base64url");
    expect(verifyPaymentState(`${forgedBody}.${mac}`)).toBeNull();
  });

  it("returns null when the expiry is extended in the payload", () => {
    const [, mac] = signPaymentState(PI).split(".");
    const extended = Buffer.from(
      JSON.stringify({ pi: PI, exp: Date.now() + 10 * 365 * 24 * 60 * 60 * 1000 }),
      "utf8",
    ).toString("base64url");
    expect(verifyPaymentState(`${extended}.${mac}`)).toBeNull();
  });

  // 3. Tampered signature
  it("returns null when the signature is altered", () => {
    const [body, mac] = signPaymentState(PI).split(".");
    const flipped = (mac[0] === "A" ? "B" : "A") + mac.slice(1);
    expect(verifyPaymentState(`${body}.${flipped}`)).toBeNull();
  });

  it("returns null when the signature is truncated", () => {
    const [body, mac] = signPaymentState(PI).split(".");
    expect(verifyPaymentState(`${body}.${mac.slice(0, -4)}`)).toBeNull();
  });

  // 4. Expiry
  it("returns null once the TTL has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T00:00:00.000Z"));
    const state = signPaymentState(PI);
    expect(verifyPaymentState(state)).toEqual({ paymentIntentId: PI });

    vi.advanceTimersByTime(15 * 60 * 1000 + 1); // just past the 15 min TTL
    expect(verifyPaymentState(state)).toBeNull();
  });

  it("still accepts the token just before the TTL elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T00:00:00.000Z"));
    const state = signPaymentState(PI);
    vi.advanceTimersByTime(15 * 60 * 1000 - 1000);
    expect(verifyPaymentState(state)).toEqual({ paymentIntentId: PI });
  });

  // 5. Malformed / empty - the common case is an ordinary login carrying no state
  it.each([
    ["empty string", ""],
    ["no separator", "notarealstate"],
    ["body only", "abc."],
    ["mac only", ".abc"],
    ["undefined", undefined],
    ["null", null],
    ["number", 12345],
    ["object", { pi: "pi_X" }],
    ["non-base64url body", "!!!!.!!!!"],
  ])("returns null for %s", (_label, input) => {
    expect(verifyPaymentState(input as unknown)).toBeNull();
  });

  it("never throws on hostile input", () => {
    for (const bad of ["", "a.b", "....", " . ", "x".repeat(10000)]) {
      expect(() => verifyPaymentState(bad)).not.toThrow();
    }
  });

  // 6. Wrong secret - a token signed under a different SESSION_SECRET must fail
  it("returns null when verified under a different SESSION_SECRET", () => {
    const state = signPaymentState(PI);
    process.env.SESSION_SECRET = "a-completely-different-secret-32-chars";
    expect(verifyPaymentState(state)).toBeNull();
  });

  it("throws when SESSION_SECRET is absent rather than signing with an empty key", () => {
    delete process.env.SESSION_SECRET;
    expect(() => signPaymentState(PI)).toThrow(/SESSION_SECRET/);
  });
});
