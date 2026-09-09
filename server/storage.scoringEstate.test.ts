/**
 * THE ESTATE QUERY, pinned at the level the decisions actually live: the SQL it
 * generates.
 *
 * getScoringEstateCounts is one grouped statement, so there is no intermediate
 * JavaScript to assert against — the correctness is in four choices inside the
 * query text, each of which is individually plausible to "simplify" and
 * individually wrong to. Rendering the statement through Drizzle's own dialect
 * lets them be asserted without a database, together with the surrounding
 * behaviour that IS JavaScript: the zero-fill, the row mapping, and the
 * empty-regime branch that exists because a zero-row VALUES list is a syntax
 * error rather than an empty set.
 *
 * SCOPE, stated because a shape assertion is easy to over-read: these pin the
 * statement and the JavaScript around it, and they do not execute SQL. The
 * semantics WERE verified out-of-band against Postgres 16 on a throwaway
 * container, with 26 rows across 6 reports covering all five states — every row
 * landed in the right bucket, count(DISTINCT) collapsed the 26 to 6, and both
 * branches ran. Two results from that run are worth carrying here because they
 * are not visible in the assertions below:
 *
 *   - A row whose algorithm is non-numeric ({"algorithm":"three"}) classifies as
 *     algorithmDrifted and does NOT error. The ::int cast this query avoids was
 *     run against the same row and failed with `invalid input syntax for type
 *     integer: "three"`, so that choice defends against a real failure, not a
 *     hypothetical one. Our own writer always stores a number; a hand-edited or
 *     future-schema row need not.
 *   - The algorithm branch wins over the config branch when both differ, which
 *     is what the ladder order is for.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const executed: SQL[] = [];
let nextRows: Array<{ state: string; reports: number }> = [];

vi.mock("./db", () => ({
  db: {
    execute: (query: SQL) => {
      executed.push(query);
      return Promise.resolve({ rows: nextRows });
    },
  },
  pool: {},
}));

const { storage } = await import("./storage");
const { SCORING_ESTATE_STATES } = await import("@shared/schema");

const REGIMES = [
  { tier: "basic", algorithm: 3, configHash: "aW50ZXJlc3RzOjM1" },
  { tier: "premium", algorithm: 3, configHash: "Y3ZxOjI1fHJpYXNl" },
  { tier: "group", algorithm: 3, configHash: "Z3JvdXBoYXNoMDA=" },
];

const render = () => new PgDialect().sqlToQuery(executed.at(-1)!);

beforeEach(() => {
  executed.length = 0;
  nextRows = [];
});

describe("getScoringEstateCounts — the four load-bearing SQL decisions", () => {
  it("counts DISTINCT assessment_id, never rows", async () => {
    // recommendations holds ~5 rows per report. count(*) would report a number
    // roughly 5x larger that silently means "recommendation rows", not
    // "reports" — the card's headline would be wrong by a factor nobody notices.
    await storage.getScoringEstateCounts(REGIMES);
    const { sql } = render();
    expect(sql).toContain("count(DISTINCT r.assessment_id)");
    expect(sql, "count(*) would count recommendation rows, not reports").not.toMatch(/count\(\*\)/);
  });

  it("LEFT JOINs the regime list, so an unmatched tier is structurally its own state", async () => {
    // An INNER JOIN would DROP rows whose tier has no current config instead of
    // reporting them. In application code the same case falls through into
    // "drifted" by default; here it cannot reach the drift branches at all.
    await storage.getScoringEstateCounts(REGIMES);
    const { sql } = render();
    expect(sql).toMatch(/left join current_regime cr on cr\.tier = r\.scoring_provenance->>'tier'/i);
    expect(sql).toContain("WHEN cr.tier IS NULL THEN 'noCurrentRegime'");
  });

  it("compares algorithm as jsonb, never through a ::int cast", async () => {
    // (->>'algorithm')::int throws on any row whose algorithm is non-numeric.
    // Comparing -> 'algorithm' against to_jsonb() cannot: same answer on every
    // well-formed row, no failure mode on a malformed one.
    await storage.getScoringEstateCounts(REGIMES);
    const { sql } = render();
    expect(sql).toContain("r.scoring_provenance->'algorithm' IS DISTINCT FROM to_jsonb(cr.algorithm)");
    expect(sql, "a ::int cast on algorithm is the failure mode this avoids").not.toMatch(
      /->>'algorithm'\)::int/,
    );
  });

  it("orders the CASE ladder NULL, unmatched tier, algorithm, config", async () => {
    // Order is load-bearing. Config before algorithm would report a row as
    // config-drifted when the calculator itself changed — the more serious
    // finding, and the one that needs the version history to explain.
    await storage.getScoringEstateCounts(REGIMES);
    const { sql } = render();
    const at = (needle: string) => {
      const i = sql.indexOf(needle);
      expect(i, `missing branch: ${needle}`).toBeGreaterThan(-1);
      return i;
    };
    expect(at("IS NULL THEN 'unknown'")).toBeLessThan(at("'noCurrentRegime'"));
    expect(at("'noCurrentRegime'")).toBeLessThan(at("'algorithmDrifted'"));
    expect(at("'algorithmDrifted'")).toBeLessThan(at("'configDrifted'"));
  });
});

describe("getScoringEstateCounts — the regime list", () => {
  it("passes every tier, algorithm and hash as a bound parameter", async () => {
    // The values come from our own server, but interpolating them into the
    // statement is how a VALUES list built from data becomes an injection site
    // the next time its source changes.
    await storage.getScoringEstateCounts(REGIMES);
    const { sql, params } = render();
    expect(params).toEqual(["basic", 3, "aW50ZXJlc3RzOjM1", "premium", 3, "Y3ZxOjI1fHJpYXNl", "group", 3, "Z3JvdXBoYXNoMDA="]);
    for (const r of REGIMES) {
      expect(sql, "hash interpolated rather than bound").not.toContain(r.configHash);
    }
  });

  it("casts each VALUES column, so Postgres never has to infer a parameter's type", async () => {
    await storage.getScoringEstateCounts(REGIMES);
    expect(render().sql).toMatch(/\(\$1::text, \$2::int, \$3::text\)/);
  });

  it("takes a separate path when no tier is configured", async () => {
    // A zero-row VALUES list is a syntax error, not an empty set. Every scored
    // row is noCurrentRegime in that case — there is nothing to compare against.
    await storage.getScoringEstateCounts([]);
    const { sql, params } = render();
    expect(params).toEqual([]);
    expect(sql).not.toContain("VALUES");
    expect(sql).toContain("ELSE 'noCurrentRegime'");
    expect(sql, "the distinct count still has to be a report count").toContain(
      "count(DISTINCT r.assessment_id)",
    );
  });
});

describe("getScoringEstateCounts — result mapping", () => {
  it("returns every state, zero-filled, however few the query reports", async () => {
    // GROUP BY only returns states that occur. A card that renders
    // counts[state] must not get undefined for the states nothing landed in.
    nextRows = [{ state: "current", reports: 4 }];
    const counts = await storage.getScoringEstateCounts(REGIMES);
    expect(Object.keys(counts).sort()).toEqual([...SCORING_ESTATE_STATES].sort());
    expect(counts.current).toBe(4);
    for (const state of SCORING_ESTATE_STATES) {
      if (state !== "current") expect(counts[state], state).toBe(0);
    }
  });

  it("coerces counts to numbers", async () => {
    // ::int in the query already does this, but the pg driver's typing for a
    // raw execute is loose enough that a string would flow into the UI and
    // concatenate instead of summing in the total.
    nextRows = [{ state: "unknown", reports: "7" as unknown as number }];
    const counts = await storage.getScoringEstateCounts(REGIMES);
    expect(counts.unknown).toBe(7);
  });

  it("ignores a state the query did not promise", async () => {
    nextRows = [
      { state: "current", reports: 2 },
      { state: "somethingElse", reports: 99 },
    ];
    const counts = await storage.getScoringEstateCounts(REGIMES);
    expect(counts.current).toBe(2);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2);
  });
});
