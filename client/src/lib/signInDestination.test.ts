import { describe, it, expect } from "vitest";
import { signInDestination } from "./signInDestination";

describe("signInDestination", () => {
  it("sends a superadmin to the dashboard", () => expect(signInDestination("superadmin")).toBe("/superadmin"));
  it("sends a school admin to their school", () => expect(signInDestination("org_admin")).toBe("/admin/organizations"));
  it("keeps students and individuals on the home page", () => {
    expect(signInDestination("org_student")).toBe("/");
    expect(signInDestination("individual")).toBe("/");
  });
  it("falls back to the home page when the role is unknown", () => {
    expect(signInDestination(undefined)).toBe("/");
    expect(signInDestination(null)).toBe("/");
  });
});
