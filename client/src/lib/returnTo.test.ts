/**
 * The assertions that matter here are the REJECTIONS.
 *
 * A test that only checked "/results?assessmentId=x" round-trips would pass
 * against a one-line `startsWith("/")` implementation, which is precisely the
 * implementation that lets "//evil.com" through — a value that keeps the
 * leading slash and still navigates off-site. This control sits inside a
 * payment funnel and says "back to your report", so it is clicked without
 * being read.
 */

import { describe, it, expect } from "vitest";
import { safeReturnTo, withReturnTo, readReturnTo, RETURN_TO_PARAM } from "./returnTo";

describe("safeReturnTo", () => {
  it("accepts same-origin absolute paths, query string intact", () => {
    expect(safeReturnTo("/results?assessmentId=abc-123")).toBe("/results?assessmentId=abc-123");
    expect(safeReturnTo("/profile")).toBe("/profile");
  });

  it("rejects anything that can navigate off-site", () => {
    for (const hostile of [
      "https://evil.com",
      "http://evil.com",
      "//evil.com", // protocol-relative: leading slash, still external
      "/\\evil.com", // backslash some browsers normalise into the case above
      "javascript:alert(1)",
      "data:text/html,<script>",
      "evil.com",
      "../admin",
    ]) {
      expect(safeReturnTo(hostile), `should reject ${hostile}`).toBeNull();
    }
  });

  it("rejects control characters and empty input", () => {
    expect(safeReturnTo("/results\n/evil")).toBeNull();
    expect(safeReturnTo("/results\u0000")).toBeNull();
    expect(safeReturnTo("")).toBeNull();
    expect(safeReturnTo(null)).toBeNull();
    expect(safeReturnTo(undefined)).toBeNull();
  });
});

describe("withReturnTo", () => {
  it("appends with the right separator", () => {
    expect(withReturnTo("/tier-selection", "/results?assessmentId=x")).toBe(
      `/tier-selection?${RETURN_TO_PARAM}=${encodeURIComponent("/results?assessmentId=x")}`,
    );
    expect(withReturnTo("/checkout?students=1", "/profile")).toBe(
      `/checkout?students=1&${RETURN_TO_PARAM}=${encodeURIComponent("/profile")}`,
    );
  });

  it("leaves the target untouched when the origin is absent or hostile", () => {
    expect(withReturnTo("/tier-selection", null)).toBe("/tier-selection");
    expect(withReturnTo("/tier-selection", "//evil.com")).toBe("/tier-selection");
  });

  it("round-trips through readReturnTo, including the nested query string", () => {
    const href = withReturnTo("/tier-selection", "/results?assessmentId=abc&lang=ar");
    const search = href.slice(href.indexOf("?"));
    expect(readReturnTo(search)).toBe("/results?assessmentId=abc&lang=ar");
  });
});

describe("readReturnTo", () => {
  it("returns null when the parameter is absent, and filters a hostile one", () => {
    expect(readReturnTo("?other=1")).toBeNull();
    expect(readReturnTo("")).toBeNull();
    expect(readReturnTo(`?${RETURN_TO_PARAM}=${encodeURIComponent("//evil.com")}`)).toBeNull();
  });
});
