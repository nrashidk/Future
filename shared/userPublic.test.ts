import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { users } from "./schema";
import { toPublicUser, PUBLIC_USER_FIELDS } from "./userPublic";

/**
 * Deep-scan guard: recurses an arbitrary response body and throws if any key,
 * at any depth, is one of `excludedFields`.
 *
 * Exported so future endpoint tests can assert the same contract against a real
 * response body without re-implementing the walk.
 */
export function assertNoSecret(
  value: unknown,
  excludedFields: Iterable<string>,
  label = "$"
): void {
  const excluded = new Set(excludedFields);
  const leaks: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== "object") return;
    if (node instanceof Date) return;
    if (seen.has(node)) return; // tolerate cycles
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }

    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (excluded.has(key)) leaks.push(childPath);
      walk(child, childPath);
    }
  };

  walk(value, label);

  if (leaks.length > 0) {
    throw new Error(
      `Secret field(s) leaked to client at: ${leaks.join(", ")}`
    );
  }
}

// Derived from the schema, NOT hardcoded: every `users` column that is not on
// the public allowlist. A column added to `users` later lands here automatically.
const ALL_USER_COLUMNS = Object.keys(getTableColumns(users));
const EXCLUDED_USER_FIELDS = ALL_USER_COLUMNS.filter(
  (column) => !(PUBLIC_USER_FIELDS as readonly string[]).includes(column)
);

// The 7 exclusions as of this commit. Asserted against the derived set below so
// that adding a column to `users` fails this test until someone decides whether
// it is public or private.
const EXPECTED_EXCLUDED = [
  "passwordHash",
  "stripeCustomerId",
  "paymentDate",
  "failedLoginAttempts",
  "lockedUntil",
  "oauthProvider",
  "oauthProviderId",
];

const DECORATIONS = {
  predefinedGrade: "10",
  organizationName: "Test School",
  organizationLogoUrl: null,
};

/** A full 23-column row, every column populated, plus route decorations. */
const fullRow = () => ({
  id: "user-1",
  email: "student@example.test",
  firstName: "Test",
  lastName: "Student",
  phone: "+971500000000",
  profileImageUrl: "https://example.test/a.png",
  role: "user",
  oauthProvider: "google",
  oauthProviderId: "sub_1234567890",
  username: "test.student",
  passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
  accountType: "org_student",
  isOrgGenerated: true,
  isPremium: false,
  purchasedLicenses: 0,
  stripeCustomerId: "cus_ABC123",
  paymentDate: new Date("2026-01-01T00:00:00.000Z"),
  lastLoginAt: new Date("2026-08-01T00:00:00.000Z"),
  failedLoginAttempts: 3,
  lockedUntil: new Date("2026-08-02T00:00:00.000Z"),
  preferredLanguage: "en",
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  ...DECORATIONS,
});

describe("assertNoSecret", () => {
  // 0. The guard must actually fire, otherwise every test below is vacuous.
  it("throws when a secret key appears at the top level", () => {
    expect(() => assertNoSecret({ passwordHash: "x" }, EXCLUDED_USER_FIELDS)).toThrow(
      /passwordHash/
    );
  });

  it("throws when a secret key is nested inside objects and arrays", () => {
    const body = { data: { students: [{ user: { passwordHash: "x" } }] } };
    expect(() => assertNoSecret(body, EXCLUDED_USER_FIELDS)).toThrow(
      /\$\.data\.students\[0\]\.user\.passwordHash/
    );
  });

  it("reports every leak path, not just the first", () => {
    const body = [{ passwordHash: "x" }, { stripeCustomerId: "y" }];
    expect(() => assertNoSecret(body, EXCLUDED_USER_FIELDS)).toThrow(
      /\$\[0\]\.passwordHash.*\$\[1\]\.stripeCustomerId/
    );
  });

  it("passes on a clean body and tolerates cycles", () => {
    const body: Record<string, unknown> = { id: "u1", nested: { ok: true } };
    body.self = body;
    expect(() => assertNoSecret(body, EXCLUDED_USER_FIELDS)).not.toThrow();
  });
});

describe("toPublicUser", () => {
  // 1. The security contract: no excluded field survives, at any depth.
  it("drops every excluded field from a fully populated row", () => {
    const output = toPublicUser(fullRow());
    expect(() => assertNoSecret(output, EXCLUDED_USER_FIELDS)).not.toThrow();
    expect(JSON.stringify(output)).not.toContain("passwordHash");
    for (const field of EXPECTED_EXCLUDED) {
      expect(output).not.toHaveProperty(field);
    }
  });

  // 2. It must not over-strip: allowlisted values pass through unchanged.
  it("keeps every allowlisted field with its original value", () => {
    const row = fullRow();
    const output = toPublicUser(row) as Record<string, unknown>;
    for (const field of PUBLIC_USER_FIELDS) {
      expect(output).toHaveProperty(field);
      expect(output[field]).toEqual((row as Record<string, unknown>)[field]);
    }
  });

  // 3. Route decorations are not `users` columns and must survive.
  it("preserves caller decorations", () => {
    const output = toPublicUser(fullRow()) as Record<string, unknown>;
    expect(output.predefinedGrade).toBe("10");
    expect(output.organizationName).toBe("Test School");
    expect(output).toHaveProperty("organizationLogoUrl", null);
  });

  // 4. Self-defending: the exclusion set is derived from the schema, so a new
  //    column added to `users` is private by default. If this fails, someone
  //    added a column and must decide whether it belongs on the allowlist.
  it("derives its exclusion set from the users table, not a hardcoded list", () => {
    expect(new Set(EXCLUDED_USER_FIELDS)).toEqual(new Set(EXPECTED_EXCLUDED));
    expect(ALL_USER_COLUMNS).toHaveLength(
      PUBLIC_USER_FIELDS.length + EXPECTED_EXCLUDED.length
    );
  });

  it("drops every non-allowlisted users column, whichever they are", () => {
    const output = toPublicUser(fullRow()) as Record<string, unknown>;
    for (const column of EXCLUDED_USER_FIELDS) {
      expect(output).not.toHaveProperty(column);
    }
  });

  // 5. Edge cases.
  it("returns an empty object for an empty input without throwing", () => {
    expect(toPublicUser({})).toEqual({});
  });

  it("preserves null and undefined values for allowlisted fields", () => {
    const output = toPublicUser({
      id: "u1",
      email: null,
      phone: undefined,
    } as never) as Record<string, unknown>;
    expect(output.id).toBe("u1");
    expect(output.email).toBeNull();
    expect("phone" in output).toBe(true);
    expect(output.phone).toBeUndefined();
  });
});
