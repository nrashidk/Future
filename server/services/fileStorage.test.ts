import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { S3Client } from "@aws-sdk/client-s3";
import * as fileStorage from "./fileStorage";

// Unit tests for the object-storage invariants. NOTHING here touches the
// network and nothing needs real Spaces credentials — the whole point of the
// module's guard ordering is that every one of these cases throws before the
// SDK is ever asked to send a request.
//
// That "no network" claim is enforced, not assumed: beforeEach replaces
// S3Client.prototype.send with a spy that throws a distinctive error, so a test
// that accidentally reaches the wire fails loudly on the wrong error message
// rather than silently making an outbound call. The two presigner tests that
// legitimately exercise the client restore the real send first (presigning is
// local SigV4 signing — the SDK short-circuits before any HTTP handler runs).

const SPACES_ENV_KEYS = [
  "SPACES_KEY",
  "SPACES_SECRET",
  "SPACES_ENDPOINT",
  "SPACES_REGION",
  "SPACES_BUCKET",
  "SPACES_PUBLIC_BUCKET",
] as const;

// Deliberately fake. SigV4 signing is arithmetic over these bytes — it neither
// validates them nor calls out to verify them.
const TEST_ENV: Record<(typeof SPACES_ENV_KEYS)[number], string> = {
  SPACES_KEY: "test-access-key",
  SPACES_SECRET: "test-secret-key",
  SPACES_ENDPOINT: "https://fra1.digitaloceanspaces.com",
  SPACES_REGION: "fra1",
  SPACES_BUCKET: "futurepath",
  SPACES_PUBLIC_BUCKET: "futurepath-public",
};

const PRIVATE_HOST = "futurepath.fra1.digitaloceanspaces.com";
const PUBLIC_HOST = "futurepath-public.fra1.digitaloceanspaces.com";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const savedEnv: Record<string, string | undefined> = {};
let sendSpy: ReturnType<typeof vi.spyOn>;

/** Populate the Spaces environment, optionally breaking one value. */
function configure(overrides: Partial<Record<string, string>> = {}) {
  Object.assign(process.env, TEST_ENV, overrides);
}

const body = () => Buffer.from("student,grade\n");
const CSV = { contentType: "text/csv" };
const PNG = { contentType: "image/png" };

beforeEach(() => {
  for (const key of SPACES_ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  sendSpy = vi.spyOn(S3Client.prototype, "send").mockImplementation(() => {
    throw new Error("TEST FAILURE: an S3 network call was attempted");
  });
});

afterEach(() => {
  for (const key of SPACES_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// 1. Unconfigured — fails loudly, never silently falls back to disk
// ---------------------------------------------------------------------------

describe("unconfigured environment", () => {
  // These need a module instance with no client cached from an earlier test, so
  // they import a pristine copy. Safe without the network spy: requireClient()
  // runs before any send(), so there is no reachable path to the wire.
  const loadPristine = async () => {
    vi.resetModules();
    return import("./fileStorage");
  };

  it("reports isSpacesConfigured() false when nothing is set", async () => {
    const mod = await loadPristine();
    expect(mod.isSpacesConfigured()).toBe(false);
  });

  it("reports false when credentials are only partially set", async () => {
    process.env.SPACES_KEY = TEST_ENV.SPACES_KEY;
    process.env.SPACES_ENDPOINT = TEST_ENV.SPACES_ENDPOINT;
    process.env.SPACES_REGION = TEST_ENV.SPACES_REGION;
    // SPACES_SECRET deliberately absent.
    const mod = await loadPristine();
    expect(mod.isSpacesConfigured()).toBe(false);
  });

  it("put() throws 'Spaces not configured'", async () => {
    const mod = await loadPristine();
    await expect(mod.put("private/a.csv", body(), CSV)).rejects.toThrow(
      /Spaces not configured/,
    );
  });

  it("getStream() throws 'Spaces not configured'", async () => {
    const mod = await loadPristine();
    await expect(mod.getStream("private/a.csv")).rejects.toThrow(
      /Spaces not configured/,
    );
  });

  it("remove() throws 'Spaces not configured'", async () => {
    const mod = await loadPristine();
    await expect(mod.remove("private/a.csv")).rejects.toThrow(
      /Spaces not configured/,
    );
  });

  it("refuses to fall back to local disk rather than degrading quietly", async () => {
    const mod = await loadPristine();
    await expect(mod.put("private/a.csv", body(), CSV)).rejects.toThrow(
      /Refusing to fall back to local disk/,
    );
  });

  it("becomes configured once the environment arrives (a failed lookup is not cached)", async () => {
    const mod = await loadPristine();
    expect(mod.isSpacesConfigured()).toBe(false);
    configure();
    expect(mod.isSpacesConfigured()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. generateKey — the user-supplied basename never reaches the key
// ---------------------------------------------------------------------------

describe("generateKey", () => {
  it("keeps the real extension and nothing else of the filename", () => {
    const key = fileStorage.generateKey("private", "students.csv");
    expect(key).toMatch(new RegExp(`^private/${UUID}\\.csv$`));
    expect(key).not.toContain("students");
  });

  it("strips a path-traversal filename to prefix + uuid", () => {
    const key = fileStorage.generateKey("private", "../../etc/passwd");
    expect(key).toMatch(new RegExp(`^private/${UUID}$`));
    expect(key).not.toContain("passwd");
    expect(key).not.toContain("..");
    // Exactly one separator: the one between prefix and uuid.
    expect(key.split("/")).toHaveLength(2);
  });

  it("does not let a traversal survive alongside a valid extension", () => {
    const key = fileStorage.generateKey("private", "../../../secrets/dump.csv");
    expect(key).toMatch(new RegExp(`^private/${UUID}\\.csv$`));
    expect(key).not.toContain("secrets");
    expect(key.split("/")).toHaveLength(2);
  });

  it("drops CRLF and control characters from the filename", () => {
    const key = fileStorage.generateKey("logos", "evil\r\nname\u0000.png");
    expect(key).toMatch(new RegExp(`^logos/${UUID}\\.png$`));
    expect(key).not.toMatch(/[\r\n\u0000]/);
  });

  it("produces no extension when the filename has none", () => {
    expect(fileStorage.generateKey("private", "README")).toMatch(
      new RegExp(`^private/${UUID}$`),
    );
  });

  it("treats a dotfile as having no extension", () => {
    expect(fileStorage.generateKey("private", ".env")).toMatch(
      new RegExp(`^private/${UUID}$`),
    );
  });

  it("keeps only the final extension of a double-barrelled name", () => {
    expect(fileStorage.generateKey("private", "payload.csv.exe")).toMatch(
      new RegExp(`^private/${UUID}\\.exe$`),
    );
  });

  it("rejects an implausibly long extension rather than embedding it", () => {
    expect(fileStorage.generateKey("private", "x.thisisnotanextension")).toMatch(
      new RegExp(`^private/${UUID}$`),
    );
  });

  it("rejects an extension containing anything but alphanumerics", () => {
    expect(fileStorage.generateKey("private", "x.cs v")).toMatch(
      new RegExp(`^private/${UUID}$`),
    );
  });

  it("tolerates an empty filename", () => {
    expect(fileStorage.generateKey("private", "")).toMatch(
      new RegExp(`^private/${UUID}$`),
    );
  });

  it("honours the logos prefix", () => {
    const key = fileStorage.generateKey("logos", "school-crest.png");
    expect(key.startsWith("logos/")).toBe(true);
    expect(key).toMatch(new RegExp(`^logos/${UUID}\\.png$`));
  });

  it("returns a distinct key on every call", () => {
    const keys = new Set(
      Array.from({ length: 200 }, () =>
        fileStorage.generateKey("private", "students.csv"),
      ),
    );
    expect(keys.size).toBe(200);
  });

  it("produces keys its own validator accepts", async () => {
    configure();
    const key = fileStorage.generateKey("private", "../../etc/passwd");
    // Would throw on an invalid key; reaching the network spy proves the key
    // itself passed every guard.
    await expect(fileStorage.getStream(key)).rejects.toThrow(
      /an S3 network call was attempted/,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Bucket / visibility invariant — the security core
// ---------------------------------------------------------------------------

describe("bucket and visibility invariant", () => {
  beforeEach(() => configure());

  it("refuses to put a private/ key into the public bucket", async () => {
    await expect(
      fileStorage.put("private/students.csv", body(), { ...CSV, public: true }),
    ).rejects.toThrow(/Refusing to treat "private\/students\.csv" as public/);
  });

  it("refuses to put a logos/ key into the private bucket", async () => {
    await expect(
      fileStorage.put("logos/crest.png", body(), { ...PNG, public: false }),
    ).rejects.toThrow(/Refusing to treat "logos\/crest\.png" as private/);
  });

  it("defaults to private, so a logos/ key with no flag is refused", async () => {
    await expect(
      fileStorage.put("logos/crest.png", body(), PNG),
    ).rejects.toThrow(/as private/);
  });

  it("refuses an unknown prefix as private", async () => {
    await expect(fileStorage.getStream("etc/passwd")).rejects.toThrow(
      /expected one of private\//,
    );
  });

  it("refuses an unknown prefix as public", async () => {
    await expect(
      fileStorage.put("exports/all.csv", body(), { ...CSV, public: true }),
    ).rejects.toThrow(/only logos\/ keys may live in the public bucket/);
  });

  it("refuses a bare key with no prefix at all", async () => {
    await expect(fileStorage.getStream("students.csv")).rejects.toThrow(
      /expected one of private\//,
    );
  });

  it("refuses an absolute key", async () => {
    await expect(fileStorage.getStream("/private/a.csv")).rejects.toThrow(
      /must not start with "\/"/,
    );
  });

  it("refuses a legacy absolute disk path from the files table", async () => {
    // files.file_path holds paths of this shape today; at cutover they must be
    // rejected outright rather than silently interpreted as object keys.
    await expect(
      fileStorage.getStream("/workspaces/Future/uploads/private/students-1.csv"),
    ).rejects.toThrow(/must not start with "\/"/);
  });

  it("refuses a traversing key", async () => {
    await expect(
      fileStorage.getStream("private/../logos/a.csv"),
    ).rejects.toThrow(/empty or relative path segments/);
  });

  it("refuses a single-dot segment", async () => {
    await expect(fileStorage.getStream("private/./a.csv")).rejects.toThrow(
      /empty or relative path segments/,
    );
  });

  it("refuses a doubled separator", async () => {
    await expect(fileStorage.getStream("private//a.csv")).rejects.toThrow(
      /empty or relative path segments/,
    );
  });

  it("refuses an empty key", async () => {
    await expect(fileStorage.getStream("")).rejects.toThrow(
      /Invalid storage key: key is empty/,
    );
  });

  it("refuses a key containing control characters", async () => {
    await expect(
      fileStorage.getStream("private/a\u0000.csv"),
    ).rejects.toThrow(/control characters/);
  });

  it("refuses a key over the 1024-byte S3 limit", async () => {
    await expect(
      fileStorage.getStream(`private/${"a".repeat(1100)}.csv`),
    ).rejects.toThrow(/exceeds 1024 bytes/);
  });

  it("applies the same guard to remove()", async () => {
    await expect(
      fileStorage.remove("private/students.csv", { public: true }),
    ).rejects.toThrow(/as public/);
  });

  it("exposes remove() under the delete alias with the same guard", async () => {
    await expect(
      fileStorage.delete("logos/crest.png", { public: false }),
    ).rejects.toThrow(/as private/);
  });

  it("rejects a stream body with no explicit size", async () => {
    const { Readable } = await import("stream");
    await expect(
      fileStorage.put("private/a.csv", Readable.from(["a"]), CSV),
    ).rejects.toThrow(/a stream body requires an explicit size/);
  });

  it("lets a well-formed private put through every guard", async () => {
    // Reaching the network spy means bucket, key and visibility all validated.
    await expect(
      fileStorage.put("private/a.csv", body(), CSV),
    ).rejects.toThrow(/an S3 network call was attempted/);
  });

  it("lets a well-formed public put through every guard", async () => {
    await expect(
      fileStorage.put("logos/crest.png", body(), { ...PNG, public: true }),
    ).rejects.toThrow(/an S3 network call was attempted/);
  });
});

// ---------------------------------------------------------------------------
// 4. publicUrl
// ---------------------------------------------------------------------------

describe("publicUrl", () => {
  beforeEach(() => configure());

  it("builds the public-bucket URL for a logos/ key", () => {
    expect(fileStorage.publicUrl("logos/abc-123.png")).toBe(
      `https://${PUBLIC_HOST}/logos/abc-123.png`,
    );
  });

  it("never points at the private bucket", () => {
    const url = new URL(fileStorage.publicUrl("logos/abc-123.png"));
    expect(url.hostname).toBe(PUBLIC_HOST);
    expect(url.hostname).not.toBe(PRIVATE_HOST);
  });

  it("refuses a private object", () => {
    expect(() => fileStorage.publicUrl("private/students.csv")).toThrow(
      /Refusing to build a public URL/,
    );
  });

  it("refuses an unknown prefix", () => {
    expect(() => fileStorage.publicUrl("exports/all.csv")).toThrow(
      /Refusing to build a public URL/,
    );
  });

  it("refuses an absolute key", () => {
    expect(() => fileStorage.publicUrl("/logos/a.png")).toThrow(
      /must not start with "\/"/,
    );
  });

  it("tolerates a trailing slash on SPACES_ENDPOINT", () => {
    configure({ SPACES_ENDPOINT: "https://fra1.digitaloceanspaces.com/" });
    expect(fileStorage.publicUrl("logos/a.png")).toBe(
      `https://${PUBLIC_HOST}/logos/a.png`,
    );
  });

  it("percent-encodes key segments without escaping the separator", () => {
    expect(fileStorage.publicUrl("logos/a b.png")).toBe(
      `https://${PUBLIC_HOST}/logos/a%20b.png`,
    );
  });

  it("throws when SPACES_ENDPOINT is missing", () => {
    delete process.env.SPACES_ENDPOINT;
    expect(() => fileStorage.publicUrl("logos/a.png")).toThrow(
      /SPACES_ENDPOINT is not set/,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. getSignedUrl — escape hatch, with its TTL rails
// ---------------------------------------------------------------------------

describe("getSignedUrl", () => {
  beforeEach(() => configure());

  it("refuses a TTL beyond the one-hour cap", async () => {
    await expect(
      fileStorage.getSignedUrl("private/a.csv", 7 * 86400),
    ).rejects.toThrow(/exceeds the 3600s maximum/);
  });

  it("refuses a zero TTL", async () => {
    await expect(fileStorage.getSignedUrl("private/a.csv", 0)).rejects.toThrow(
      /positive whole number of seconds/,
    );
  });

  it("refuses a negative TTL", async () => {
    await expect(fileStorage.getSignedUrl("private/a.csv", -60)).rejects.toThrow(
      /positive whole number of seconds/,
    );
  });

  it("refuses a fractional TTL", async () => {
    await expect(fileStorage.getSignedUrl("private/a.csv", 1.5)).rejects.toThrow(
      /positive whole number of seconds/,
    );
  });

  it("applies the key guard before the TTL check", async () => {
    await expect(fileStorage.getSignedUrl("etc/passwd", 60)).rejects.toThrow(
      /expected one of private\//,
    );
  });

  it("signs a URL against the private bucket for a valid TTL", async () => {
    // Presigning is local SigV4 signing — the SDK intercepts before any HTTP
    // handler — so the real send() is restored for this one case.
    sendSpy.mockRestore();
    const url = await fileStorage.getSignedUrl("private/a.csv", 60);
    const parsed = new URL(url);
    expect(parsed.hostname).toBe(PRIVATE_HOST);
    expect(parsed.pathname).toBe("/private/a.csv");
    expect(parsed.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(parsed.searchParams.get("X-Amz-Expires")).toBe("60");
  });

  it("accepts a TTL exactly at the cap", async () => {
    sendSpy.mockRestore();
    const url = await fileStorage.getSignedUrl("private/a.csv", 3600);
    expect(new URL(url).searchParams.get("X-Amz-Expires")).toBe("3600");
  });
});

// ---------------------------------------------------------------------------
// 6. The same-bucket guard — the check with teeth
// ---------------------------------------------------------------------------

describe("bucket separation guard", () => {
  it("refuses when both bucket variables name the same bucket", () => {
    configure({ SPACES_PUBLIC_BUCKET: TEST_ENV.SPACES_BUCKET });
    expect(() => fileStorage.publicUrl("logos/a.png")).toThrow(
      /both point at "futurepath"/,
    );
  });

  it("refuses on the private read path too", async () => {
    configure({ SPACES_PUBLIC_BUCKET: TEST_ENV.SPACES_BUCKET });
    await expect(fileStorage.getStream("private/a.csv")).rejects.toThrow(
      /Use two separate buckets/,
    );
  });

  it("refuses on the public write path too", async () => {
    configure({ SPACES_BUCKET: TEST_ENV.SPACES_PUBLIC_BUCKET });
    await expect(
      fileStorage.put("logos/a.png", body(), { ...PNG, public: true }),
    ).rejects.toThrow(/Use two separate buckets/);
  });

  it("explains why rather than failing generically", () => {
    configure({ SPACES_PUBLIC_BUCKET: TEST_ENV.SPACES_BUCKET });
    expect(() => fileStorage.publicUrl("logos/a.png")).toThrow(
      /would expose every private object/,
    );
  });

  it("requires SPACES_BUCKET even for a public operation", async () => {
    configure();
    delete process.env.SPACES_BUCKET;
    await expect(
      fileStorage.put("logos/a.png", body(), { ...PNG, public: true }),
    ).rejects.toThrow(/SPACES_BUCKET is not set/);
  });

  it("requires SPACES_PUBLIC_BUCKET even for a private operation", async () => {
    // Separation cannot be proven with only one name, and an unprovable
    // separation is exactly the misconfiguration this guard exists to catch.
    configure();
    delete process.env.SPACES_PUBLIC_BUCKET;
    await expect(fileStorage.getStream("private/a.csv")).rejects.toThrow(
      /SPACES_PUBLIC_BUCKET is not set/,
    );
  });
});
