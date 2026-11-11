import { describe, it, expect, vi } from "vitest";
import {
  transliterateName, usernameBase, usernameCandidate, resolveUsername,
  USERNAME_FALLBACK, USERNAME_MAX_ATTEMPTS, USERNAME_MAX_PART,
} from "./username";

describe("transliterateName", () => {
  it("leaves a plain Latin name alone, lowercased", () => {
    expect(transliterateName("Nasser")).toBe("nasser");
  });

  it("drops spaces, hyphens and apostrophes rather than mapping them", () => {
    expect(transliterateName("Al Ali")).toBe("alali");
    expect(transliterateName("Al-Mansoori")).toBe("almansoori");
    expect(transliterateName("O'Brien")).toBe("obrien");
  });

  /**
   * The old generator's `[^a-z0-9]` strip DELETED the accented letter outright,
   * turning "José" into "jos" and "Pérez" into "prez". NFD separates the mark
   * from the letter so only the mark goes.
   */
  it("keeps the LETTER under a Latin diacritic", () => {
    expect(transliterateName("José")).toBe("jose");
    expect(transliterateName("Pérez")).toBe("perez");
    expect(transliterateName("Müller")).toBe("muller");
    expect(transliterateName("Łukasz")).toBe("ukasz"); // Ł has no decomposition
  });

  /**
   * THE CASE THAT MATTERED. "ناصر" produced "" under the old generator, so the
   * username was "..36ad" — and would have been "." once the random suffix was
   * removed.
   */
  it("transliterates Arabic instead of erasing it", () => {
    expect(transliterateName("ناصر")).toBe("nasr");
    expect(transliterateName("العلي")).toBe("alaly");
    expect(transliterateName("محمد")).toBe("mhmd");
    expect(transliterateName("فاطمة")).toBe("fatma");
  });

  it("ignores Arabic vowel marks, so the same name spells the same way", () => {
    // Harakat are optional in writing; a name typed with them must not produce
    // a different sign-in name from the same name typed without.
    expect(transliterateName("نَاصِر")).toBe(transliterateName("ناصر"));
  });

  it("maps Arabic-Indic digits to Latin ones", () => {
    expect(transliterateName("٢٠٢٦")).toBe("2026");
  });

  it("is empty when there is nothing to transliterate", () => {
    expect(transliterateName("")).toBe("");
    expect(transliterateName("   ")).toBe("");
    expect(transliterateName("!!!")).toBe("");
    expect(transliterateName("日本語")).toBe("");
  });

  it("is defensive about non-strings", () => {
    expect(transliterateName(undefined as any)).toBe("");
    expect(transliterateName(null as any)).toBe("");
  });

  it("caps a very long name", () => {
    const out = transliterateName("A".repeat(100));
    expect(out.length).toBe(USERNAME_MAX_PART);
  });
});

describe("usernameBase", () => {
  it("joins the two halves with a dot and nothing else", () => {
    // No random suffix. This is the whole point of the change.
    expect(usernameBase("Nasser", "Al Ali")).toBe("nasser.alali");
    expect(usernameBase("ناصر", "العلي")).toBe("nasr.alaly");
  });

  /**
   * A HALF THAT VANISHES MUST NOT LEAVE A DOT. The old generator's output for
   * an Arabic name, minus the suffix, was the single character "." — and a
   * username that is punctuation alone is not a username.
   */
  it("never produces a leading or trailing dot", () => {
    expect(usernameBase("", "Ali")).toBe("ali");
    expect(usernameBase("Nasser", "")).toBe("nasser");
    expect(usernameBase("日本", "語")).toBe(USERNAME_FALLBACK);
    expect(usernameBase("", "")).toBe(USERNAME_FALLBACK);
    for (const pair of [["", "Ali"], ["Nasser", ""], ["", ""], ["日本", "語"]]) {
      const out = usernameBase(pair[0], pair[1]);
      expect(out.startsWith(".")).toBe(false);
      expect(out.endsWith(".")).toBe(false);
      expect(out.replace(/\./g, "").length).toBeGreaterThan(0);
    }
  });
});

describe("usernameCandidate", () => {
  it("numbers from the second, and the first is bare", () => {
    expect(usernameCandidate("nasser.alali", 0)).toBe("nasser.alali");
    expect(usernameCandidate("nasser.alali", 1)).toBe("nasser.alali2");
    expect(usernameCandidate("nasser.alali", 2)).toBe("nasser.alali3");
  });

  it("refuses a nonsense attempt rather than inventing a name", () => {
    expect(() => usernameCandidate("x", -1)).toThrow();
    expect(() => usernameCandidate("x", 1.5)).toThrow();
  });
});

describe("resolveUsername", () => {
  it("returns the bare name when it is free", async () => {
    const taken = vi.fn().mockResolvedValue(false);
    expect(await resolveUsername("Nasser", "Al Ali", taken)).toBe("nasser.alali");
    expect(taken).toHaveBeenCalledTimes(1);
  });

  it("walks up until it finds a free one", async () => {
    const used = new Set(["nasser.alali", "nasser.alali2"]);
    const taken = async (c: string) => used.has(c);
    expect(await resolveUsername("Nasser", "Al Ali", taken)).toBe("nasser.alali3");
  });

  /**
   * Bounded on purpose: an unbounded loop against the database is a request
   * that never returns, and fifty identical names is a data-entry fault worth
   * surfacing rather than numbering past.
   */
  it("gives up rather than looping for ever", async () => {
    const taken = vi.fn().mockResolvedValue(true);
    await expect(resolveUsername("Nasser", "Al Ali", taken)).rejects.toThrow(/nasser\.alali/);
    expect(taken).toHaveBeenCalledTimes(USERNAME_MAX_ATTEMPTS);
  });

  it("resolves an Arabic name to something typeable", async () => {
    const taken = vi.fn().mockResolvedValue(false);
    const out = await resolveUsername("ناصر", "العلي", taken);
    expect(out).toBe("nasr.alaly");
    // Typeable on a Latin keyboard, which is what a login box needs.
    expect(out).toMatch(/^[a-z0-9.]+$/);
  });
});
