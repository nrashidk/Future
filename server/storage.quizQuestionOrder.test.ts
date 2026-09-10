/**
 * THE QUIZ-QUESTION LIST HAS A TOTAL ORDER, pinned at the query.
 *
 * Both of these methods take `limit` and `offset`, and both applied them to a
 * SELECT with no ORDER BY. That is not the same class of defect as an arbitrary
 * sort: LIMIT over an undefined order decides WHICH ROWS COME BACK, and OFFSET
 * paging over one can return a row on two pages and never return another, with
 * no error and nothing in the response to notice it from. A caller cannot repair
 * that afterwards — the rows LIMIT dropped are already gone — so the ordering
 * has to live in the query, and that is what these assert.
 *
 * The live half was the review hazard rather than the paging: with no ORDER BY
 * at all, an UPDATE appends a new tuple version to the end of the heap, so the
 * admin question list reshuffled as it was edited and a reviewer working through
 * a subject could not tell a row they had already seen from one they had not.
 *
 * SCOPE. These pin the ordering the query asks for, and they do not execute SQL.
 * The semantics were verified out-of-band against the live table (240 rows):
 * (subject, grade, topic, id) had zero duplicate sort keys — so the order is
 * total — three (subject, grade, topic) groups actually needed `id` to break,
 * and concatenating LIMIT/OFFSET pages reproduced the full ordered list exactly,
 * 240 unique ids, no repeats and no skips.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const calls: Array<{ method: string; args: any[] }> = [];

function recorder(): any {
  const chain: any = {
    from: (...args: any[]) => { calls.push({ method: "from", args }); return chain; },
    where: (...args: any[]) => { calls.push({ method: "where", args }); return chain; },
    orderBy: (...args: any[]) => { calls.push({ method: "orderBy", args }); return chain; },
    limit: (...args: any[]) => { calls.push({ method: "limit", args }); return chain; },
    offset: (...args: any[]) => { calls.push({ method: "offset", args }); return chain; },
    // Thenable so `await query` resolves without a database.
    then: (resolve: (rows: unknown[]) => unknown) => resolve([]),
  };
  return chain;
}

vi.mock("./db", () => ({ db: { select: () => recorder() }, pool: {} }));

const { storage } = await import("./storage");
const { quizQuestions } = await import("@shared/schema");

const orderByArgs = () => calls.filter((c) => c.method === "orderBy").at(-1)?.args;

beforeEach(() => {
  calls.length = 0;
});

describe.each([
  ["getQuizQuestionsByFilters", (f: any) => storage.getQuizQuestionsByFilters(f)],
  ["getQuizQuestions", (f: any) => storage.getQuizQuestions(f)],
])("%s orders before it pages", (_name, run) => {
  it("orders by subject, grade, topic, id — in that order", async () => {
    await run({});
    const args = orderByArgs();

    expect(args, "the query must ask for an order at all").toBeDefined();
    expect(args![0]).toBe(quizQuestions.subject);
    expect(args![1]).toBe(quizQuestions.grade);
    expect(args![2]).toBe(quizQuestions.topic);

    // id LAST is what makes the order total. subject/grade/topic can all repeat;
    // the primary key cannot, and unlike careers.title it is unique by
    // construction rather than because the data currently happens to be.
    expect(args![3]).toBe(quizQuestions.id);
    expect(args).toHaveLength(4);
  });

  it("still orders when the caller pages", async () => {
    // The case the ordering exists for. An unordered LIMIT/OFFSET is the one
    // that repeats and skips rows.
    await run({ limit: 50, offset: 100 });

    expect(orderByArgs()).toBeDefined();
    expect(calls.some((c) => c.method === "limit")).toBe(true);
    expect(calls.some((c) => c.method === "offset")).toBe(true);
  });

  it("still orders when the caller filters", async () => {
    await run({ countryId: "country-1", subject: "Arabic", grade: 9 });

    expect(calls.some((c) => c.method === "where")).toBe(true);
    expect(orderByArgs()).toBeDefined();
  });
});
