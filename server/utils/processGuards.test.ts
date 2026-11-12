import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import {
  describeRejection, onUnhandledRejection, installProcessGuards, __resetProcessGuardsForTest,
} from "./processGuards";

beforeEach(() => __resetProcessGuardsForTest());

describe("process guards", () => {
  it("logs the rejection with its stack, and does not throw", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => onUnhandledRejection(new Error("Connection terminated unexpectedly"))).not.toThrow();
    expect(spy.mock.calls[0][0]).toContain("Connection terminated unexpectedly");
    expect(spy.mock.calls[0][0]).toContain("still serving");
    spy.mockRestore();
  });

  it("describes a reason that is not an Error, including one that cannot be serialised", () => {
    expect(describeRejection("plain text")).toBe("plain text");
    expect(describeRejection({ code: 57 })).toBe('{"code":57}');
    const loop: any = {}; loop.self = loop;
    expect(() => describeRejection(loop)).not.toThrow();
    expect(describeRejection(undefined)).toBe("undefined");
  });

  it("installs exactly one listener however often it is called", () => {
    const fake = new EventEmitter() as unknown as NodeJS.Process;
    installProcessGuards(fake); installProcessGuards(fake); installProcessGuards(fake);
    expect((fake as any).listenerCount("unhandledRejection")).toBe(1);
  });

  it("leaves uncaughtException alone: a synchronous escape should still restart", () => {
    const fake = new EventEmitter() as unknown as NodeJS.Process;
    installProcessGuards(fake);
    expect((fake as any).listenerCount("uncaughtException")).toBe(0);
  });

  it("the installed listener is what turns a rejection from fatal into a log line", () => {
    const fake = new EventEmitter() as unknown as NodeJS.Process;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    installProcessGuards(fake);
    (fake as any).emit("unhandledRejection", new Error("boom"), Promise.resolve());
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
