import { describe, it, expect } from "vitest";
import { formatLocalizedDate, localeForLanguage } from "./formatDate";

describe("localeForLanguage", () => {
  it("maps ar to ar-AE and everything else to en-AE", () => {
    expect(localeForLanguage("ar")).toBe("ar-AE");
    expect(localeForLanguage("en")).toBe("en-AE");
  });
});

describe("formatLocalizedDate", () => {
  const date = new Date("2026-09-18T12:00:00Z");

  it("renders day-before-month for English — the bug this exists to prevent", () => {
    // The regression: `.toLocaleDateString()` with no locale, or with
    // 'en-US', renders "9/18/2026" for this date — month-first. A UAE
    // reader expects day-first, and 9/18 read day-first is not even a
    // valid date, which is exactly how the misreading happens.
    const formatted = formatLocalizedDate(date, "en");
    expect(formatted).toBe("18/09/2026");
  });

  it("renders day-before-month for Arabic too, not the reverse", () => {
    // "18‏/09‏/2026" — day, then month, then year (the U+200F characters are
    // RTL marks Intl inserts around each numeric field; day-before-month is
    // the claim this test pins, not their presence).
    const formatted = formatLocalizedDate(date, "ar");
    const dayIndex = formatted.indexOf("18");
    const monthIndex = formatted.indexOf("09");
    expect(dayIndex).toBeGreaterThanOrEqual(0);
    expect(monthIndex).toBeGreaterThan(dayIndex);
  });

  it("accepts a string date, same as a Date object", () => {
    expect(formatLocalizedDate("2026-09-18T12:00:00Z", "en")).toBe(
      formatLocalizedDate(date, "en"),
    );
  });
});
