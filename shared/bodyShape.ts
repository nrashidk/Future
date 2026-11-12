/**
 * HOW BIG A REQUEST BODY MAY BE IN SHAPE, not in bytes.
 *
 * The byte cap (512 KB) is not a shape cap. 391 KB of `[1,1,1,...]` is a
 * 200,000-element array, and on 2026-11-12 that was measured doing two
 * different kinds of damage depending on the validator underneath it:
 *
 *   - on zod 3 (what `main` runs) `POST /api/assessments` ACCEPTED it and
 *     STORED it. That route needs no account, has no rate limit, and its
 *     `interests` and `strengths` columns are text[] whose schema is derived
 *     by drizzle-zod with no upper bound. So a stranger could write 200,000
 *     elements into a row per request, as often as they liked.
 *   - on zod 4 the same request was refused -- after 0.9 s of blocked event
 *     loop, ~250 MB of memory, and a 25 MB error reply listing an issue per
 *     element. Three of those took the process from 550 MB to 1.1 GB.
 *
 * Neither is a validator bug to be fixed field by field. Every array a route
 * accepts would need its own bound, and the ones that matter here were never
 * written by hand: `createInsertSchema` produces them from the table. A bound
 * that has to be remembered per field is the "control on one verb and not its
 * siblings" family again.
 *
 * So the shape is checked ONCE, at the door, before any handler or schema
 * sees the body. Nothing this product legitimately sends comes close: the
 * largest real arrays are 500 students in a bulk enrolment and one id per
 * selected student in a bulk delete. The one route that does carry a large array -- the superadmin
 * bulk question import -- is exempted where this is mounted, by path, exactly
 * as it is already exempted from the byte cap.
 *
 * ITERATIVE, never recursive: the input is hostile by assumption, and a
 * recursive walk of `[[[[...` nested to the byte cap is a stack overflow,
 * which would trade one way of stopping the server for another.
 */

export const BODY_SHAPE_LIMITS = {
  /**
   * Elements in any one array. Set by the largest LEGITIMATE one, with room:
   * a school selecting every student for a bulk delete or export sends one id
   * each, and that route has no cap of its own. 5,000 is forty times smaller
   * than the request this exists to stop and still far above any real roster
   * action.
   */
  maxArrayLength: 5000,
  /** Keys in any one object. `z.record` schemas are the object-shaped twin. */
  maxObjectKeys: 1000,
  /** Nesting depth. Real bodies here are four or five deep. */
  maxDepth: 32,
  /** Values visited in total, so many medium arrays cannot add up to one large one. */
  maxNodes: 50000,
} as const;

export type BodyShapeLimits = { [K in keyof typeof BODY_SHAPE_LIMITS]: number };

export type BodyShapeViolation =
  | { ok: true }
  | { ok: false; reason: "array_too_long" | "too_many_keys" | "too_deep" | "too_many_values" };

/**
 * Returns the FIRST limit a parsed body exceeds, or `{ ok: true }`.
 *
 * Stops at the first violation rather than collecting them: collecting a
 * finding per offending element is the exact behaviour this exists to prevent.
 * Buffers and other non-plain values are leaves -- the Stripe webhook's raw
 * body is a Buffer and must pass through untouched.
 */
export function checkBodyShape(
  body: unknown,
  limits: BodyShapeLimits = BODY_SHAPE_LIMITS,
): BodyShapeViolation {
  if (body === null || typeof body !== "object") return { ok: true };

  const stack: Array<{ value: object; depth: number }> = [{ value: body as object, depth: 1 }];
  let nodes = 0;

  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (depth > limits.maxDepth) return { ok: false, reason: "too_deep" };

    let children: unknown[];
    if (Array.isArray(value)) {
      if (value.length > limits.maxArrayLength) return { ok: false, reason: "array_too_long" };
      children = value;
    } else if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
      const keys = Object.keys(value);
      if (keys.length > limits.maxObjectKeys) return { ok: false, reason: "too_many_keys" };
      children = keys.map((k) => (value as Record<string, unknown>)[k]);
    } else {
      continue; // a Buffer, a Date: a leaf
    }

    nodes += children.length;
    if (nodes > limits.maxNodes) return { ok: false, reason: "too_many_values" };

    for (const child of children) {
      if (child !== null && typeof child === "object") {
        stack.push({ value: child as object, depth: depth + 1 });
      }
    }
  }
  return { ok: true };
}
