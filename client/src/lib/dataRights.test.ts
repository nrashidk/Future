import { describe, it, expect } from "vitest";
import { maskEmail } from "./dataRights";

describe("maskEmail", () => {
  it.each([
    ["layla.ahmed@example-school.ae", "l•••@example-school.ae"],
    ["sam@gmail.com", "s•••@gmail.com"],
    ["jo@outlook.com", "•••@outlook.com"],
    ["j@outlook.com", "•••@outlook.com"],
  ])("masks %s as %s", (email, hint) => {
    expect(maskEmail(email)).toBe(hint);
  });

  // A hint whose length follows the address narrows the guess.
  it("does not reveal the length of the local part", () => {
    expect(maskEmail("sam@gmail.com")).toBe(maskEmail("samantha.long.name@gmail.com"));
  });

  it("keeps the domain whole, which tells the owner which account this is", () => {
    expect(maskEmail("a.b@students.school.ae").endsWith("@students.school.ae")).toBe(true);
  });

  it("splits on the last @ and ignores surrounding spaces", () => {
    expect(maskEmail("  \"odd@local\"@example.com ")).toBe("\"•••@example.com");
  });

  it("shows nothing it cannot place for a value that is not an address", () => {
    expect(maskEmail("not-an-address")).toBe("•••");
    expect(maskEmail("@example.com")).toBe("•••");
  });

  it("does not split a first character outside the basic plane", () => {
    expect(maskEmail("😀ab@example.com")).toBe("😀•••@example.com");
  });
});
