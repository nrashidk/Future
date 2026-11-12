import { describe, it, expect } from "vitest";
import { shortCommit, buildInfo } from "./buildInfo";

describe("buildInfo", () => {
  it("shortens a full commit hash to seven characters", () => {
    expect(shortCommit("51BCCDE0a1b2c3d4e5f60718293a4b5c6d7e8f90")).toBe("51bccde");
  });
  it("reports null rather than inventing a build when the variable is absent", () => {
    expect(shortCommit(undefined)).toBeNull();
    expect(shortCommit("")).toBeNull();
    expect(buildInfo({} as any).commit).toBeNull();
  });
  it("refuses anything that is not a hash, so the field cannot echo arbitrary env text", () => {
    expect(shortCommit("main")).toBeNull();
    expect(shortCommit("abc")).toBeNull();
    expect(shortCommit("postgres://user:secret@host/db")).toBeNull();
  });
  it("carries a start time that parses as a date", () => {
    expect(Number.isNaN(Date.parse(buildInfo({ RENDER_GIT_COMMIT: "abcdef1" } as any).startedAt))).toBe(false);
  });
});
