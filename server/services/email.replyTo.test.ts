/**
 * Regression guard: every outbound mail must carry a Reply-To.
 *
 * Before this, no send call set one, so a reply went to the From address — a
 * noreply mailbox. Those replies reached a human only because futurepath.ae
 * happened to carry a catch-all forwarding rule, which is a property of the
 * DNS configuration and not of this code: deleting that rule (a reasonable
 * tidy-up, since a public catch-all collects spam) would silently start
 * discarding replies, with nothing here to notice.
 *
 * The replies in question are not hypothetical. The two senders covered by
 * this file are a password reset and a guest report-recovery link; the people
 * answering them are a student locked out of an account and, once the consent
 * notices ship on the same service, a guardian asking about a named child's
 * data. Both are someone trying to reach a human about a minor's record.
 *
 * The assertion that matters is that EVERY send sets replyTo, not that one
 * does. A test pinning a single call site would pass against a third sender
 * added later without one — which is exactly how this defect arrived, since
 * both existing call sites were written the same way and neither had it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const send = vi.fn().mockResolvedValue({ data: { id: "msg_test" }, error: null });

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

// email.ts reads both of these at module scope, so they must be set before the
// import below. EMAIL_REPLY_TO is deliberately left unset: the fallback is what
// production runs on today, so the fallback is what needs pinning.
process.env.RESEND_API_KEY = "re_test_key";
delete process.env.EMAIL_REPLY_TO;

const { sendPasswordResetEmail, sendGuestReportRecoveryEmail } = await import("./email");

afterEach(() => {
  send.mockClear();
});

describe("outbound mail Reply-To", () => {
  it("is set on the password reset email", async () => {
    await sendPasswordResetEmail("student@example.com", "tok_123", "Layla", "en");

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].replyTo).toBe("support@futurepath.ae");
  });

  it("is set on the guest report recovery email", async () => {
    await sendGuestReportRecoveryEmail(
      "guest@example.com",
      "https://futurepath.ae/results?x=1",
      new Date("2026-11-01T00:00:00Z"),
      "ar",
    );

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].replyTo).toBe("support@futurepath.ae");
  });

  it("never sends with the reply address equal to the noreply sender", async () => {
    // The specific regression this guards: someone "simplifying" by pointing
    // replyTo at FROM_EMAIL would satisfy a naive presence check while putting
    // the behaviour back exactly where it started.
    await sendPasswordResetEmail("student@example.com", "tok_123", undefined, "en");

    const payload = send.mock.calls[0][0];
    expect(payload.replyTo).toBeTruthy();
    expect(payload.replyTo).not.toBe(payload.from);
    expect(String(payload.replyTo)).not.toContain("noreply");
  });
});
