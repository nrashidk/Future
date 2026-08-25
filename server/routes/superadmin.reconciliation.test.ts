import { describe, it, expect, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

// Mock the storage module so importing superadmin.routes.ts does NOT pull in
// db.ts (which throws at import when DATABASE_URL is unset). Same pattern as
// assessmentValidation.test.ts. The classifier's ONLY external dependencies are
// storage.getUser and storage.getUserByEmail, so the mock is exactly two fns —
// every other storage method is used inside route handlers that never run here.
// server/auth.ts (imported for isAuthenticated) also resolves to this same
// mocked "./storage", and its passport/session wiring is all inside
// setupAuth(), so nothing DB-shaped executes at import time.
const getUser = vi.fn();
const getUserByEmail = vi.fn();
vi.mock("../storage", () => ({
  storage: {
    getUser: (...a: unknown[]) => getUser(...a),
    getUserByEmail: (...a: unknown[]) => getUserByEmail(...a),
  },
}));

const { classifyUnreconciledIntent } = await import("./superadmin.routes");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CREATED = 1_700_000_000; // 2023-11-14T22:13:20.000Z

/**
 * A succeeded PaymentIntent. amount/expectedAmount default to the SAME integer
 * cents so the amount_mismatch guard (rule 1) passes and later rules are
 * reachable; tests that want a mismatch override one of them explicitly.
 */
function pi(metadata: Record<string, string>, overrides: Partial<{ amount: number; id: string; currency: string }> = {}) {
  const amount = overrides.amount ?? 5000;
  return {
    id: overrides.id ?? "pi_test_1",
    created: CREATED,
    amount,
    currency: overrides.currency ?? "aed",
    metadata: { expectedAmount: String(amount), ...metadata },
  } as unknown as Stripe.PaymentIntent;
}

/** Minimal account shape — the classifier reads id, email, isPremium, passwordHash. */
function account(over: Partial<{ id: string; email: string; isPremium: boolean; passwordHash: string | null }> = {}) {
  return {
    id: over.id ?? "u_1",
    email: over.email ?? "buyer@example.com",
    isPremium: over.isPremium ?? false,
    passwordHash: "passwordHash" in over ? over.passwordHash : "$2b$10$hash",
  };
}

beforeEach(() => {
  getUser.mockReset();
  getUserByEmail.mockReset();
  getUser.mockResolvedValue(undefined);
  getUserByEmail.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// 1. amount_mismatch — outranks EVERY other class, including grantable ones
// ---------------------------------------------------------------------------

describe("rule 1: amount_mismatch", () => {
  it("wins over a PI that would otherwise be grantable (valid buyerEmail, single seat)", async () => {
    getUserByEmail.mockResolvedValue(account({ isPremium: false }));
    const row = await classifyUnreconciledIntent(
      pi({ userId: "guest", buyerEmail: "buyer@example.com", expectedAmount: "5000", studentCount: "1" }, { amount: 9900 }),
    );
    expect(row.class).toBe("amount_mismatch");
    // Short-circuits before resolution: no DB lookups, nothing resolved.
    expect(getUser).not.toHaveBeenCalled();
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(row.resolvedUserId).toBeNull();
    expect(row.resolvedEmail).toBeNull();
    expect(row.resolvedVia).toBeNull();
  });

  it("wins over a premium userId that would otherwise be already_granted", async () => {
    getUser.mockResolvedValue(account({ isPremium: true }));
    const row = await classifyUnreconciledIntent(
      pi({ userId: "u_1", expectedAmount: "5000", studentCount: "1" }, { amount: 100 }),
    );
    expect(row.class).toBe("amount_mismatch");
  });

  it("wins over unidentifiable and group_incomplete when all three conditions hold", async () => {
    const row = await classifyUnreconciledIntent(
      pi({ userId: "guest", expectedAmount: "5000", studentCount: "50" }, { amount: 1 }),
    );
    expect(row.class).toBe("amount_mismatch");
  });

  it("treats a missing expectedAmount as a mismatch", async () => {
    const p = pi({ userId: "u_1", studentCount: "1" });
    delete (p.metadata as Record<string, string>).expectedAmount;
    expect((await classifyUnreconciledIntent(p)).class).toBe("amount_mismatch");
  });

  it("treats a non-numeric expectedAmount as a mismatch", async () => {
    expect((await classifyUnreconciledIntent(pi({ userId: "u_1", expectedAmount: "abc" }))).class).toBe("amount_mismatch");
  });

  it("compares integer cents exactly — one cent off is a mismatch", async () => {
    getUser.mockResolvedValue(account());
    expect(
      (await classifyUnreconciledIntent(pi({ userId: "u_1", expectedAmount: "12301", studentCount: "1" }, { amount: 12300 })))
        .class,
    ).toBe("amount_mismatch");
    expect(
      (await classifyUnreconciledIntent(pi({ userId: "u_1", expectedAmount: "12300", studentCount: "1" }, { amount: 12300 })))
        .class,
    ).toBe("grantable_user");
  });
});

// ---------------------------------------------------------------------------
// 2. unidentifiable — no identity to resolve against
// ---------------------------------------------------------------------------

describe("rule 2: unidentifiable", () => {
  it("classifies guest with no buyerEmail", async () => {
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", studentCount: "1" }));
    expect(row.class).toBe("unidentifiable");
    expect(row.metadataUserId).toBe("guest");
    expect(row.buyerEmail).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("classifies a PI with no userId metadata at all", async () => {
    expect((await classifyUnreconciledIntent(pi({}))).class).toBe("unidentifiable");
  });

  it("treats a whitespace-only buyerEmail as absent", async () => {
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "   " }));
    expect(row.class).toBe("unidentifiable");
    expect(row.buyerEmail).toBeNull();
  });

  it("outranks group_incomplete: guest + no email + studentCount 50", async () => {
    expect((await classifyUnreconciledIntent(pi({ userId: "guest", studentCount: "50" }))).class).toBe("unidentifiable");
  });
});

// ---------------------------------------------------------------------------
// 3. group_incomplete — deliberately ABOVE already_granted
// ---------------------------------------------------------------------------

describe("rule 3: group_incomplete (precedence over already_granted)", () => {
  it("beats already_granted when studentCount > 1 and the buyer resolves as premium", async () => {
    // The deliberate precedence: a buyer who paid for 50 seats and happens to
    // hold a personal premium licence is NOT reconciled. Do not flip this back.
    getUser.mockResolvedValue(account({ id: "u_buyer", email: "buyer@example.com", isPremium: true }));
    const row = await classifyUnreconciledIntent(pi({ userId: "u_buyer", studentCount: "50" }));
    expect(row.class).toBe("group_incomplete");
    expect(row.studentCount).toBe(50);
    // Resolution still happened and is reported for the operator.
    expect(row.resolvedUserId).toBe("u_buyer");
    expect(row.resolvedEmail).toBe("buyer@example.com");
    expect(row.resolvedVia).toBe("userId");
  });

  it("beats oauth_blocked (resolves, not premium, no passwordHash) when studentCount > 1", async () => {
    getUser.mockResolvedValue(account({ isPremium: false, passwordHash: null }));
    expect((await classifyUnreconciledIntent(pi({ userId: "u_1", studentCount: "3" }))).class).toBe("group_incomplete");
  });

  it("beats grantable_guest when studentCount > 1", async () => {
    getUserByEmail.mockResolvedValue(undefined);
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "buyer@example.com", studentCount: "2" }));
    expect(row.class).toBe("group_incomplete");
    expect(row.resolvedVia).toBeNull();
  });

  it("does not trigger at studentCount 1, or on unparseable/zero counts", async () => {
    getUser.mockResolvedValue(account());
    for (const studentCount of ["1", "0", "abc", "-4"]) {
      const row = await classifyUnreconciledIntent(pi({ userId: "u_1", studentCount }));
      expect(row.studentCount).toBe(1);
      expect(row.class).toBe("grantable_user");
    }
    // Absent studentCount also defaults to 1.
    expect((await classifyUnreconciledIntent(pi({ userId: "u_1" }))).studentCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. already_granted
// ---------------------------------------------------------------------------

describe("rule 4: already_granted", () => {
  it("classifies a single-seat PI whose userId resolves to a premium account", async () => {
    getUser.mockResolvedValue(account({ id: "u_7", email: "prem@example.com", isPremium: true }));
    const row = await classifyUnreconciledIntent(pi({ userId: "u_7", studentCount: "1" }));
    expect(row.class).toBe("already_granted");
    expect(row.resolvedVia).toBe("userId");
    expect(getUser).toHaveBeenCalledWith("u_7");
  });

  it("beats oauth_blocked: premium is checked before passwordHash", async () => {
    getUser.mockResolvedValue(account({ isPremium: true, passwordHash: null }));
    expect((await classifyUnreconciledIntent(pi({ userId: "u_1", studentCount: "1" }))).class).toBe("already_granted");
  });

  it("applies to a guest PI whose buyerEmail resolves to a premium account", async () => {
    getUserByEmail.mockResolvedValue(account({ id: "u_9", email: "buyer@example.com", isPremium: true }));
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "buyer@example.com", studentCount: "1" }));
    expect(row.class).toBe("already_granted");
    expect(row.resolvedVia).toBe("buyerEmail");
  });
});

// ---------------------------------------------------------------------------
// 5. oauth_blocked
// ---------------------------------------------------------------------------

describe("rule 5: oauth_blocked", () => {
  it("classifies a resolving, non-premium account with no passwordHash", async () => {
    getUser.mockResolvedValue(account({ id: "u_oauth", email: "g@example.com", isPremium: false, passwordHash: null }));
    const row = await classifyUnreconciledIntent(pi({ userId: "u_oauth", studentCount: "1" }));
    expect(row.class).toBe("oauth_blocked");
    expect(row.resolvedUserId).toBe("u_oauth");
    expect(row.resolvedVia).toBe("userId");
  });

  it("applies on the buyerEmail path too (guest PI resolving to an OAuth account)", async () => {
    getUserByEmail.mockResolvedValue(account({ isPremium: false, passwordHash: null }));
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "buyer@example.com", studentCount: "1" }));
    expect(row.class).toBe("oauth_blocked");
    expect(row.resolvedVia).toBe("buyerEmail");
  });

  it("treats an empty-string passwordHash as no password", async () => {
    getUser.mockResolvedValue(account({ passwordHash: "" }));
    expect((await classifyUnreconciledIntent(pi({ userId: "u_1", studentCount: "1" }))).class).toBe("oauth_blocked");
  });
});

// ---------------------------------------------------------------------------
// 6. grantable_user
// ---------------------------------------------------------------------------

describe("rule 6: grantable_user", () => {
  it("classifies a real userId resolving to an existing non-premium local account", async () => {
    getUser.mockResolvedValue(account({ id: "u_3", email: "free@example.com", isPremium: false }));
    const row = await classifyUnreconciledIntent(pi({ userId: "u_3", studentCount: "1" }));
    expect(row.class).toBe("grantable_user");
    expect(row.resolvedUserId).toBe("u_3");
    expect(row.resolvedEmail).toBe("free@example.com");
    expect(row.resolvedVia).toBe("userId");
    expect(getUserByEmail).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. grantable_guest
// ---------------------------------------------------------------------------

describe("rule 7: grantable_guest", () => {
  it("classifies a guest whose buyerEmail has no account yet (would create)", async () => {
    getUserByEmail.mockResolvedValue(undefined);
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "new@example.com", studentCount: "1" }));
    expect(row.class).toBe("grantable_guest");
    expect(row.buyerEmail).toBe("new@example.com");
    expect(row.resolvedUserId).toBeNull();
    expect(row.resolvedVia).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
    expect(getUserByEmail).toHaveBeenCalledWith("new@example.com");
  });

  it("classifies a guest whose buyerEmail resolves to a non-premium local account (would upgrade)", async () => {
    getUserByEmail.mockResolvedValue(account({ id: "u_4", isPremium: false, passwordHash: "$2b$10$x" }));
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "buyer@example.com", studentCount: "1" }));
    expect(row.class).toBe("grantable_guest");
    expect(row.resolvedUserId).toBe("u_4");
    expect(row.resolvedVia).toBe("buyerEmail");
  });

  it("trims the buyerEmail before lookup and reporting", async () => {
    getUserByEmail.mockResolvedValue(undefined);
    const row = await classifyUnreconciledIntent(pi({ userId: "guest", buyerEmail: "  spaced@example.com  ", studentCount: "1" }));
    expect(row.buyerEmail).toBe("spaced@example.com");
    expect(getUserByEmail).toHaveBeenCalledWith("spaced@example.com");
  });
});

// ---------------------------------------------------------------------------
// Resolution fallback: userId no longer resolves (account deleted)
// ---------------------------------------------------------------------------

describe("userId → buyerEmail fallback", () => {
  it("falls back to buyerEmail when the server-derived userId no longer resolves", async () => {
    getUser.mockResolvedValue(undefined); // account deleted
    getUserByEmail.mockResolvedValue(account({ id: "u_new", email: "buyer@example.com", isPremium: true }));
    const row = await classifyUnreconciledIntent(pi({ userId: "u_deleted", buyerEmail: "buyer@example.com", studentCount: "1" }));
    expect(getUser).toHaveBeenCalledWith("u_deleted");
    expect(getUserByEmail).toHaveBeenCalledWith("buyer@example.com");
    expect(row.class).toBe("already_granted");
    expect(row.resolvedUserId).toBe("u_new");
    expect(row.resolvedVia).toBe("buyerEmail");
    expect(row.metadataUserId).toBe("u_deleted"); // original metadata still reported
  });

  it("stays on rule 6 (grantable_user) when the fallback email resolves to a grantable account", async () => {
    getUser.mockResolvedValue(undefined);
    getUserByEmail.mockResolvedValue(account({ id: "u_new", isPremium: false, passwordHash: "$2b$10$x" }));
    // isRealUserId is still true, so rule 6 (not 7) claims it.
    const row = await classifyUnreconciledIntent(pi({ userId: "u_deleted", buyerEmail: "buyer@example.com", studentCount: "1" }));
    expect(row.class).toBe("grantable_user");
    expect(row.resolvedVia).toBe("buyerEmail");
  });

  it("is unidentifiable when a deleted userId has no email fallback", async () => {
    getUser.mockResolvedValue(undefined);
    const row = await classifyUnreconciledIntent(pi({ userId: "u_deleted", studentCount: "1" }));
    expect(row.class).toBe("unidentifiable");
    expect(row.resolvedUserId).toBeNull();
    expect(row.resolvedVia).toBeNull();
  });

  it("is unidentifiable when neither the deleted userId nor the buyerEmail resolves", async () => {
    getUser.mockResolvedValue(undefined);
    getUserByEmail.mockResolvedValue(undefined);
    const row = await classifyUnreconciledIntent(pi({ userId: "u_deleted", buyerEmail: "ghost@example.com", studentCount: "1" }));
    expect(row.class).toBe("unidentifiable");
  });
});

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

describe("row shape", () => {
  it("reports amount in major units from integer cents, plus id/currency/created", async () => {
    getUser.mockResolvedValue(account());
    const row = await classifyUnreconciledIntent(
      pi({ userId: "u_1", studentCount: "1" }, { amount: 12345, id: "pi_abc", currency: "usd" }),
    );
    expect(row.amount).toBe(123.45);
    expect(row.id).toBe("pi_abc");
    expect(row.currency).toBe("usd");
    expect(row.created).toBe(new Date(CREATED * 1000).toISOString());
  });

  it("tolerates a PaymentIntent with no metadata object", async () => {
    const bare = { id: "pi_bare", created: CREATED, amount: 5000, currency: "aed" } as unknown as Stripe.PaymentIntent;
    const row = await classifyUnreconciledIntent(bare);
    expect(row.class).toBe("amount_mismatch"); // no expectedAmount to compare
    expect(row.studentCount).toBe(1);
    expect(row.metadataUserId).toBeNull();
  });
});
