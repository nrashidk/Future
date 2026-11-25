import { describe, it, expect } from "vitest";
import { homePathFor } from "./signInDestination";

describe("homePathFor", () => {
  it("sends a superadmin to the dashboard", () => expect(homePathFor("superadmin")).toBe("/superadmin"));
  it("sends a school admin to their school", () => expect(homePathFor("org_admin")).toBe("/admin/organizations"));
  it("sends a student, school or individual, to the assessment page", () => {
    expect(homePathFor("org_student")).toBe("/assessment");
    expect(homePathFor("individual")).toBe("/assessment");
  });
  it("sends nobody signed in to the public home page", () => {
    expect(homePathFor(undefined)).toBe("/");
    expect(homePathFor(null)).toBe("/");
    expect(homePathFor("")).toBe("/");
  });
});
