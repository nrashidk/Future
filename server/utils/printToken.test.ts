/**
 * mintPrintToken / mintGuestRecoveryToken / verifyPrintToken /
 * printTokenAuthorizes — one signed-token type serving two callers (the
 * server-side PDF render and the guest report-recovery email), verified
 * through the SAME function. The thing worth testing directly is exactly
 * the boundary between them: a recovery-lived token must still be scoped to
 * one assessment, must still expire, and must be indistinguishable in kind
 * from a print token to printTokenAuthorizes — the whole point of reusing
 * the verifier rather than building a second one.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mintPrintToken,
  mintGuestRecoveryToken,
  verifyPrintToken,
  printTokenAuthorizes,
  PDF_GOTO_TIMEOUT_MS,
  PDF_WAIT_FOR_READY_TIMEOUT_MS,
  PRINT_TOKEN_MARGIN_MS,
} from "./printToken";

// Derived, not hardcoded, so this test tracks printToken.ts's own derivation
// instead of asserting a magic number that could silently drift from it.
const TOKEN_TTL_MS = PDF_GOTO_TIMEOUT_MS + PDF_WAIT_FOR_READY_TIMEOUT_MS + PRINT_TOKEN_MARGIN_MS;

const SECRET = "test-session-secret-at-least-32-chars-long";

beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
});

afterEach(() => {
  vi.useRealTimers();
  process.env.SESSION_SECRET = SECRET;
});

describe("mintPrintToken / verifyPrintToken", () => {
  it("round-trips the assessmentId", () => {
    const token = mintPrintToken("a-1");
    expect(verifyPrintToken(token)).toEqual({ aid: "a-1" });
  });

  it("is still valid just under its render-budget-derived window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = mintPrintToken("a-1");
    vi.setSystemTime(new Date(Date.now() + TOKEN_TTL_MS - 1000));
    expect(verifyPrintToken(token)).toEqual({ aid: "a-1" });
  });

  it("expires after its render-budget-derived window (goto + waitForFunction + margin)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const token = mintPrintToken("a-1");
    vi.setSystemTime(new Date(Date.now() + TOKEN_TTL_MS + 1000));
    expect(verifyPrintToken(token)).toBeNull();
  });
});

describe("mintGuestRecoveryToken", () => {
  it("round-trips the assessmentId, same as a print token", () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const token = mintGuestRecoveryToken("a-2", expiresAt);
    expect(verifyPrintToken(token)).toEqual({ aid: "a-2" });
  });

  it("honors the CALLER-SUPPLIED expiry, not the render-budget-derived print window", () => {
    const farFuture = new Date(Date.now() + 71 * 60 * 60 * 1000); // ~71h, inside the 72h TTL
    const token = mintGuestRecoveryToken("a-2", farFuture);
    // Still valid well past when a print token would have expired.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + TOKEN_TTL_MS + 1000));
    expect(verifyPrintToken(token)).toEqual({ aid: "a-2" });
  });

  it("is dead on arrival if minted with an already-past expiry", () => {
    const alreadyExpired = new Date(Date.now() - 1000);
    const token = mintGuestRecoveryToken("a-2", alreadyExpired);
    expect(verifyPrintToken(token)).toBeNull();
  });

  it("is scoped to exactly the assessmentId it was minted for", () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const token = mintGuestRecoveryToken("a-2", expiresAt);
    expect(printTokenAuthorizes(token, "a-2")).toBe(true);
    expect(printTokenAuthorizes(token, "a-3")).toBe(false);
  });

  it("cannot be forged by tampering with the assessmentId in the payload", () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const token = mintGuestRecoveryToken("a-2", expiresAt);
    const [body, mac] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const forgedBody = Buffer.from(
      JSON.stringify({ ...payload, aid: "a-9999" }),
      "utf8",
    ).toString("base64url");
    expect(verifyPrintToken(`${forgedBody}.${mac}`)).toBeNull();
  });
});

describe("printTokenAuthorizes — the shared verifier both token kinds go through", () => {
  it("returns false for an undefined/missing token", () => {
    expect(printTokenAuthorizes(undefined, "a-1")).toBe(false);
  });

  it("returns false when assessmentId is undefined, regardless of the token", () => {
    const token = mintPrintToken("a-1");
    expect(printTokenAuthorizes(token, undefined)).toBe(false);
  });

  it("accepts a print token and a recovery token identically when each is scoped correctly", () => {
    const printToken = mintPrintToken("a-1");
    const recoveryToken = mintGuestRecoveryToken("a-1", new Date(Date.now() + 1000));
    expect(printTokenAuthorizes(printToken, "a-1")).toBe(true);
    expect(printTokenAuthorizes(recoveryToken, "a-1")).toBe(true);
  });
});
