/**
 * LOSING THE CREATE RACE IS A SUCCESS, NOT A 500.
 *
 * Both callers of grantIndividualPremium act on the same payment: the
 * interactive /api/checkout/complete and the Stripe webhook. Stripe calls the
 * webhook the instant the card clears while the browser still has to
 * round-trip, so the webhook usually wins. Both read "no such user", both
 * insert, and the loser used to throw on `users_email_unique`.
 *
 * That throw reached a real buyer in production on 2026-11-09. The card was
 * charged, the webhook granted the premium, and /api/checkout/complete answered
 * HTTP 500 "Checkout failed, please try again" — for a purchase that had
 * entirely succeeded. A retry would have charged them a second time.
 *
 * The race cannot be closed by checking harder before the insert; every
 * check-then-act leaves the same window, and this repo's own bug list names
 * that family. The unique index is the real arbiter, so the fix accepts its
 * verdict and re-reads.
 *
 * These are unit tests with storage mocked, because the live failure needs two
 * writers hitting Postgres microseconds apart — the offline harness runs PGlite
 * on a single connection and serialises them, so it cannot produce this race at
 * all (see CLAUDE.md). Mocking the thrown 23505 is the only way to exercise the
 * recovery deterministically.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserByEmail = vi.fn();
const createStandaloneUser = vi.fn();
const updateUserFields = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    get getUserByEmail() { return getUserByEmail; },
    get createStandaloneUser() { return createStandaloneUser; },
    get updateUserFields() { return updateUserFields; },
  },
}));

const { grantIndividualPremium } = await import("./premiumGrant");

const uniqueViolation = () => Object.assign(new Error("duplicate key value violates unique constraint"), {
  code: "23505",
  constraint: "users_email_unique",
});

const input = {
  email: "buyer@example.test",
  firstName: "Test",
  lastName: "Buyer",
  studentCount: 100,
  stripeCustomerId: null,
};

const racedUser = { id: "u-race", email: "buyer@example.test", username: "test.buyer.ab12", isPremium: true, purchasedLicenses: 100 };

beforeEach(() => {
  getUserByEmail.mockReset();
  createStandaloneUser.mockReset();
  updateUserFields.mockReset();
});

describe("grantIndividualPremium — losing the create race", () => {
  it("adopts the winner's account instead of throwing", async () => {
    // First read: nobody. Then the other writer inserts. Our insert loses.
    getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(racedUser);
    createStandaloneUser.mockRejectedValueOnce(uniqueViolation());

    const result = await grantIndividualPremium(input);

    expect(result.status).toBe("already_premium");
    expect(result).toHaveProperty("user", racedUser);
  });

  it("GRANTS NOTHING on recovery — the winner already granted the full amount", async () => {
    // The assertion that stops a double-grant. The winner set purchasedLicenses
    // to studentCount; writing it again, or routing through the increment path,
    // would hand out twice what was paid for.
    getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(racedUser);
    createStandaloneUser.mockRejectedValueOnce(uniqueViolation());

    await grantIndividualPremium(input);

    expect(updateUserFields).not.toHaveBeenCalled();
  });

  it("recognises the violation when it arrives wrapped as `cause`", async () => {
    // Drizzle surfaces the driver error as DrizzleQueryError with the real
    // Postgres error on `.cause` — which is exactly the shape production threw.
    getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(racedUser);
    createStandaloneUser.mockRejectedValueOnce(
      Object.assign(new Error("Failed query: insert into \"users\""), { cause: uniqueViolation() }),
    );

    const result = await grantIndividualPremium(input);
    expect(result.status).toBe("already_premium");
  });

  it("RETHROWS when the re-read finds nothing — recovery must not invent success", async () => {
    // Narrowed by outcome, not by constraint name. A unique violation on
    // something else (a username collision) finds no account by email, and
    // swallowing it would report a grant that never happened.
    getUserByEmail.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    createStandaloneUser.mockRejectedValueOnce(uniqueViolation());

    await expect(grantIndividualPremium(input)).rejects.toThrow(/unique constraint/);
  });

  it("RETHROWS a non-unique error untouched", async () => {
    // A connection failure is not a race and must not be recovered from.
    getUserByEmail.mockResolvedValueOnce(undefined);
    createStandaloneUser.mockRejectedValueOnce(Object.assign(new Error("connection terminated"), { code: "08006" }));

    await expect(grantIndividualPremium(input)).rejects.toThrow(/connection terminated/);
    expect(getUserByEmail).toHaveBeenCalledTimes(1); // never even tried to recover
  });

  it("still grants normally when there is no race — the control", async () => {
    // Without this, a function that returned already_premium unconditionally
    // would pass every case above while the product was broken for everyone.
    getUserByEmail.mockResolvedValueOnce(undefined);
    createStandaloneUser.mockResolvedValueOnce({
      user: { id: "u-new", email: input.email }, username: "test.buyer.cd34", password: "generated",
    });

    const result = await grantIndividualPremium(input);

    expect(result.status).toBe("granted");
    expect(result).toHaveProperty("credentials.password", "generated");
  });
});
