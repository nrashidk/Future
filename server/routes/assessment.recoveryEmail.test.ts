/**
 * POST /api/assessments/:id/send-recovery-email — the guest report-recovery
 * magic link. See the route's own doc comment in assessment.routes.ts for
 * the full design; this pins the behavior that comment promises:
 *
 *  - guest-only (an authenticated user's assessment is refused, same 403
 *    shape as an unowned/missing id — anti-enumeration)
 *  - ownership is the SAME guest_token cookie check as every other guest
 *    route, not the token this route itself mints
 *  - refuses an unfinished assessment and an already-expired recovery window
 *  - a REAL send failure is surfaced to the caller (502), unlike
 *    password-reset's always-200 shape — that is the one constraint this
 *    endpoint exists to satisfy, so it is the one most worth pinning
 *  - the email address is never handed to storage — only to the mocked
 *    email service
 *
 * cookie-parser is mounted for real (server/index.ts uses the same
 * middleware) rather than stubbing req.cookies, so the test exercises the
 * same Cookie-header parsing production traffic goes through.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import type { AddressInfo } from "net";

process.env.SESSION_SECRET = "test-session-secret-at-least-32-chars-long";

const getAssessmentById = vi.fn();
vi.mock("../storage", () => ({
  storage: { getAssessmentById: (...a: any[]) => getAssessmentById(...a) },
}));

const sendGuestReportRecoveryEmail = vi.fn();
vi.mock("../services/email", () => ({
  sendGuestReportRecoveryEmail: (...a: any[]) => sendGuestReportRecoveryEmail(...a),
}));

// The real limiter is IP-keyed-by-default and would throttle across tests
// sharing 127.0.0.1; the guard under test is the route body, not the limiter.
vi.mock("../middleware/rateLimiter.middleware", () => ({
  recoveryEmailLimiter: (_req: any, _res: any, next: any) => next(),
}));

const { registerAssessmentRoutes } = await import("./assessment.routes");

const COMPLETED_GUEST_ASSESSMENT = {
  id: "a-1",
  userId: null,
  guestSessionId: "guest-token-abc",
  completedAt: new Date().toISOString(),
};

async function post(
  id: string,
  body: unknown,
  cookie?: string,
): Promise<{ status: number; body: any }> {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  registerAssessmentRoutes(app);
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/assessments/${id}/send-recovery-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

beforeEach(() => {
  getAssessmentById.mockReset();
  sendGuestReportRecoveryEmail.mockReset();
});

describe("POST /api/assessments/:id/send-recovery-email", () => {
  it("404/unowned id: refuses with the same 403 shape as an owned id (anti-enumeration)", async () => {
    getAssessmentById.mockResolvedValueOnce(undefined);
    const { status } = await post("missing", { email: "a@example.com" });
    expect(status).toBe(403);
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("refuses an authenticated user's assessment (guest-only)", async () => {
    getAssessmentById.mockResolvedValueOnce({ ...COMPLETED_GUEST_ASSESSMENT, userId: "u-1" });
    const { status } = await post("a-1", { email: "a@example.com" });
    expect(status).toBe(403);
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("refuses without a guest_token cookie", async () => {
    getAssessmentById.mockResolvedValueOnce(COMPLETED_GUEST_ASSESSMENT);
    const { status } = await post("a-1", { email: "a@example.com" });
    expect(status).toBe(403);
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("refuses when the cookie doesn't match this assessment's guestSessionId", async () => {
    getAssessmentById.mockResolvedValueOnce(COMPLETED_GUEST_ASSESSMENT);
    const { status } = await post("a-1", { email: "a@example.com" }, "guest_token=wrong-token");
    expect(status).toBe(403);
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("refuses an unfinished assessment", async () => {
    getAssessmentById.mockResolvedValueOnce({ ...COMPLETED_GUEST_ASSESSMENT, completedAt: null });
    const { status, body } = await post("a-1", { email: "a@example.com" }, "guest_token=guest-token-abc");
    expect(status).toBe(400);
    expect(body.code).toBe("ASSESSMENT_NOT_COMPLETED");
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("refuses an already-expired recovery window", async () => {
    const longAgo = new Date(Date.now() - 200 * 60 * 60 * 1000).toISOString(); // 200h ago, past the 72h TTL
    getAssessmentById.mockResolvedValueOnce({ ...COMPLETED_GUEST_ASSESSMENT, completedAt: longAgo });
    const { status, body } = await post("a-1", { email: "a@example.com" }, "guest_token=guest-token-abc");
    expect(status).toBe(410);
    expect(body.code).toBe("RECOVERY_WINDOW_EXPIRED");
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("rejects an invalid email with a 400, before minting anything", async () => {
    getAssessmentById.mockResolvedValueOnce(COMPLETED_GUEST_ASSESSMENT);
    const { status } = await post("a-1", { email: "not-an-email" }, "guest_token=guest-token-abc");
    expect(status).toBe(400);
    expect(sendGuestReportRecoveryEmail).not.toHaveBeenCalled();
  });

  it("sends and reports real success on the happy path, without persisting the email anywhere", async () => {
    getAssessmentById.mockResolvedValueOnce(COMPLETED_GUEST_ASSESSMENT);
    sendGuestReportRecoveryEmail.mockResolvedValueOnce({ success: true, messageId: "msg-1" });

    const { status, body } = await post(
      "a-1",
      { email: "student@example.com", language: "en" },
      "guest_token=guest-token-abc",
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(sendGuestReportRecoveryEmail).toHaveBeenCalledTimes(1);
    const [to, resultsUrl, expiresAt, language] = sendGuestReportRecoveryEmail.mock.calls[0];
    expect(to).toBe("student@example.com");
    expect(resultsUrl).toContain("/results?assessmentId=a-1&recoveryToken=");
    expect(expiresAt).toBeInstanceOf(Date);
    expect(language).toBe("en");
  });

  it("THE CORE CONTRACT: surfaces a real send failure as a 502, not a blanket 200", async () => {
    getAssessmentById.mockResolvedValueOnce(COMPLETED_GUEST_ASSESSMENT);
    sendGuestReportRecoveryEmail.mockResolvedValueOnce({ success: false, error: "Resend rejected the address" });

    const { status, body } = await post(
      "a-1",
      { email: "student@example.com" },
      "guest_token=guest-token-abc",
    );

    expect(status).toBe(502);
    expect(body.code).toBe("SEND_FAILED");
    expect(body.success).toBeUndefined();
  });
});
