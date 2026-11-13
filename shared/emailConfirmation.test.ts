import { describe, it, expect } from "vitest";
import {
  confirmationDueAt, confirmationState, hoursLeftToConfirm, isErasableUnconfirmed, needsConfirmation,
} from "./emailConfirmation";

const now = new Date("2026-11-13T12:00:00Z");
const past = "2026-11-10T11:00:00Z";
const future = "2026-11-15T12:00:00Z";

describe("email confirmation rule", () => {
  it("an account that was never asked is not_required, and is NEVER erasable", () => {
    for (const u of [null, undefined, {}, { emailConfirmationDueAt: null, isPremium: false }]) {
      expect(confirmationState(u, now)).toBe("not_required");
      expect(isErasableUnconfirmed(u, now)).toBe(false);
      expect(needsConfirmation(u, now)).toBe(false);
    }
  });
  it("an unreadable due date is treated as never asked, not as overdue", () => {
    expect(isErasableUnconfirmed({ emailConfirmationDueAt: "not a date" }, now)).toBe(false);
  });
  it("pending inside the window: banner, not erasable", () => {
    const u = { emailConfirmationDueAt: future };
    expect(confirmationState(u, now)).toBe("pending");
    expect(needsConfirmation(u, now)).toBe(true);
    expect(isErasableUnconfirmed(u, now)).toBe(false);
    expect(hoursLeftToConfirm(u, now)).toBe(48);
  });
  it("overdue and unpaid is erasable", () => {
    const u = { emailConfirmationDueAt: past, isPremium: false };
    expect(confirmationState(u, now)).toBe("overdue");
    expect(isErasableUnconfirmed(u, now)).toBe(true);
    expect(hoursLeftToConfirm(u, now)).toBe(0);
  });
  it("overdue but PAID is never erasable, and still sees the banner", () => {
    const u = { emailConfirmationDueAt: past, isPremium: true };
    expect(isErasableUnconfirmed(u, now)).toBe(false);
    expect(needsConfirmation(u, now)).toBe(true);
  });
  it("confirmed is final, however old the due date", () => {
    const u = { emailConfirmationDueAt: past, emailConfirmedAt: "2026-11-09T00:00:00Z" };
    expect(confirmationState(u, now)).toBe("confirmed");
    expect(isErasableUnconfirmed(u, now)).toBe(false);
    expect(needsConfirmation(u, now)).toBe(false);
    expect(hoursLeftToConfirm(u, now)).toBeNull();
  });
  it("the due date is 72 hours after registration", () => {
    expect(confirmationDueAt(now).toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
  it("accepts Date objects as well as strings", () => {
    expect(confirmationState({ emailConfirmationDueAt: new Date(past) }, now)).toBe("overdue");
  });
});
