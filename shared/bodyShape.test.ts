import { describe, it, expect } from "vitest";
import { checkBodyShape, BODY_SHAPE_LIMITS } from "./bodyShape";

const L = BODY_SHAPE_LIMITS;

describe("checkBodyShape", () => {
  it("passes the bodies this product really sends", () => {
    expect(checkBodyShape({
      grade: "10", countryId: "uae", curriculum: "MOE National",
      favoriteSubjects: ["Mathematics", "Science", "English"], interests: ["technology"],
      riasecResponses: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`r${i}`, 3])),
    })).toEqual({ ok: true });
    // 50 contributed questions, each with four options: the largest real body.
    expect(checkBodyShape({
      questions: Array.from({ length: 50 }, (_, i) => ({ question: `q${i}`, options: ["a", "b", "c", "d"] })),
    })).toEqual({ ok: true });
  });

  it("passes non-objects and leaves untouched", () => {
    for (const v of [undefined, null, "text", 7, true]) expect(checkBodyShape(v)).toEqual({ ok: true });
    // The Stripe webhook's raw body is a Buffer far longer than any array limit.
    expect(checkBodyShape(Buffer.alloc(200_000))).toEqual({ ok: true });
    expect(checkBodyShape({ raw: Buffer.alloc(200_000), at: new Date() })).toEqual({ ok: true });
  });

  it("the array boundary: exactly the limit passes, one more does not", () => {
    expect(checkBodyShape({ a: Array(L.maxArrayLength).fill(1) })).toEqual({ ok: true });
    expect(checkBodyShape({ a: Array(L.maxArrayLength + 1).fill(1) }))
      .toEqual({ ok: false, reason: "array_too_long" });
  });

  it("refuses the measured request: 200,000 numbers in one field", () => {
    expect(checkBodyShape({ interests: Array(200_000).fill(1) }))
      .toEqual({ ok: false, reason: "array_too_long" });
  });

  it("refuses a body that is itself an oversized array", () => {
    expect(checkBodyShape(Array(L.maxArrayLength + 1).fill("x")))
      .toEqual({ ok: false, reason: "array_too_long" });
  });

  it("the key boundary, for record-shaped fields", () => {
    const keys = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 1]));
    expect(checkBodyShape({ r: keys(L.maxObjectKeys) })).toEqual({ ok: true });
    expect(checkBodyShape({ r: keys(L.maxObjectKeys + 1) })).toEqual({ ok: false, reason: "too_many_keys" });
  });

  it("many arrays under the limit cannot add up to one over it", () => {
    const body = { a: Array.from({ length: 100 }, () => Array(900).fill(1)) };
    expect(checkBodyShape(body)).toEqual({ ok: false, reason: "too_many_values" });
  });

  it("refuses deep nesting WITHOUT overflowing the stack", () => {
    // 100,000 levels: a recursive walk dies here with RangeError.
    let deep: unknown = 1;
    for (let i = 0; i < 100_000; i++) deep = [deep];
    expect(() => checkBodyShape(deep)).not.toThrow();
    expect(checkBodyShape(deep)).toEqual({ ok: false, reason: "too_deep" });
  });

  it("the depth boundary", () => {
    const nest = (n: number) => { let v: unknown = {}; for (let i = 1; i < n; i++) v = { v }; return v; };
    expect(checkBodyShape(nest(L.maxDepth))).toEqual({ ok: true });
    expect(checkBodyShape(nest(L.maxDepth + 1))).toEqual({ ok: false, reason: "too_deep" });
  });

  it("an object with a null prototype is still walked", () => {
    const o = Object.create(null); o.a = Array(L.maxArrayLength + 1).fill(1);
    expect(checkBodyShape(o)).toEqual({ ok: false, reason: "array_too_long" });
  });
});
