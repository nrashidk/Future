/**
 * Object storage service — DigitalOcean Spaces (S3-compatible).
 *
 * This module is the ONLY place that talks to object storage. Routes call
 * put/getStream/delete/publicUrl instead of touching a filesystem, so the
 * disk -> Spaces migration is a change of call sites, not of logic.
 *
 * TWO PHYSICALLY SEPARATE BUCKETS
 * ------------------------------------------------------------------
 * SPACES_BUCKET        private. Student CSVs, imports, reports. NEVER public-read.
 * SPACES_PUBLIC_BUCKET public. Organization logos only, served straight to
 *                      anonymous visitors on the landing page.
 *
 * The end users of this platform are minors, and the private bucket holds their
 * names, schools, grades and assessment data. The single worst failure mode of
 * this migration is a private object landing in the public bucket, so the
 * public/private split is enforced here in code — on the bucket, on the object
 * ACL, and on the key prefix — and not left to a console setting.
 *
 * NOTE: nothing imports this module yet. Routes are cut over in later steps.
 */

import { randomUUID } from "crypto";
import path from "path";
import type { Readable } from "stream";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presignS3Url } from "@aws-sdk/s3-request-presigner";

/**
 * Key prefixes, paired with the visibility they are allowed to have.
 *
 * A key's prefix and its bucket must agree — see assertKeyMatchesVisibility.
 * To add a prefix later (e.g. a private 'exports'), add it to the matching
 * array; that is the whole change.
 */
export const PRIVATE_PREFIXES = ["private"] as const;
export const PUBLIC_PREFIXES = ["logos"] as const;

export type PrivatePrefix = (typeof PRIVATE_PREFIXES)[number];
export type PublicPrefix = (typeof PUBLIC_PREFIXES)[number];
export type StoragePrefix = PrivatePrefix | PublicPrefix;

/** Longest presigned-URL lifetime we will issue. See getSignedUrl. */
export const MAX_SIGNED_URL_TTL_SECONDS = 3600;

/** S3 hard limit on key length, in UTF-8 bytes. */
const MAX_KEY_LENGTH = 1024;

export interface PutOptions {
  contentType: string;
  /** Byte length. Optional for buffers; REQUIRED for streams (see put). */
  size?: number;
  /** true routes the object to the PUBLIC bucket with a public-read ACL. */
  public?: boolean;
}

export interface StoredObject {
  stream: Readable;
  contentType: string | undefined;
  contentLength: number | undefined;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let cachedClient: S3Client | null = null;

/**
 * Build the client on first use and reuse it thereafter.
 *
 * A *failed* lookup is deliberately not cached: this module has no control over
 * whether it is imported before the environment is populated, and permanently
 * remembering "not configured" would turn an import-order accident into a
 * silent outage for the whole process.
 */
function initClient(): S3Client | null {
  if (cachedClient) return cachedClient;

  const accessKeyId = process.env.SPACES_KEY;
  const secretAccessKey = process.env.SPACES_SECRET;
  const endpoint = process.env.SPACES_ENDPOINT;
  const region = process.env.SPACES_REGION;

  if (!accessKeyId || !secretAccessKey || !endpoint || !region) {
    return null;
  }

  cachedClient = new S3Client({
    // DigitalOcean ignores the region, but SigV4 signing requires a value and
    // it must match the one baked into SPACES_ENDPOINT (e.g. "fra1").
    region,
    // The REGIONAL endpoint (https://fra1.digitaloceanspaces.com). The SDK
    // prepends the bucket itself — do not use the bucket-prefixed host here.
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // Virtual-hosted-style addressing: <bucket>.<region>.digitaloceanspaces.com
    forcePathStyle: false,
  });

  return cachedClient;
}

/**
 * Whether Spaces credentials are present. Lets a caller (or a boot-time log)
 * distinguish "not configured yet" from "configured but failing".
 */
export function isSpacesConfigured(): boolean {
  return initClient() !== null;
}

function requireClient(): S3Client {
  const client = initClient();
  if (!client) {
    throw new Error(
      "Spaces not configured: SPACES_KEY, SPACES_SECRET, SPACES_ENDPOINT and " +
        "SPACES_REGION must all be set. Refusing to fall back to local disk.",
    );
  }
  return client;
}

// ---------------------------------------------------------------------------
// Bucket + key invariants
// ---------------------------------------------------------------------------

/**
 * Resolve the bucket for a visibility, refusing anything that would let a
 * private object become publicly readable.
 *
 * Both bucket names are required even for a private operation: without both we
 * cannot prove the two are distinct, and an unprovable separation is exactly
 * the misconfiguration this check exists to catch.
 */
function resolveBucket(isPublic: boolean): string {
  const privateBucket = process.env.SPACES_BUCKET;
  const publicBucket = process.env.SPACES_PUBLIC_BUCKET;

  if (!privateBucket) {
    throw new Error("Spaces not configured: SPACES_BUCKET is not set.");
  }
  if (!publicBucket) {
    throw new Error("Spaces not configured: SPACES_PUBLIC_BUCKET is not set.");
  }
  if (privateBucket === publicBucket) {
    throw new Error(
      `Refusing to use Spaces: SPACES_BUCKET and SPACES_PUBLIC_BUCKET both ` +
        `point at "${privateBucket}". The public bucket is world-readable, so ` +
        `this would expose every private object. Use two separate buckets.`,
    );
  }

  const bucket = isPublic ? publicBucket : privateBucket;

  // Belt and braces: the resolved bucket must be the one we intended, and must
  // not be the other one. Cheap, and it survives future edits to this function.
  if (isPublic && bucket !== publicBucket) {
    throw new Error("Invariant violated: public object not routed to the public bucket.");
  }
  if (!isPublic && bucket !== privateBucket) {
    throw new Error("Invariant violated: private object not routed to the private bucket.");
  }

  return bucket;
}

function prefixOf(key: string): string {
  const slash = key.indexOf("/");
  return slash === -1 ? "" : key.slice(0, slash);
}

function isPublicPrefix(prefix: string): boolean {
  return (PUBLIC_PREFIXES as readonly string[]).includes(prefix);
}

function isPrivatePrefix(prefix: string): boolean {
  return (PRIVATE_PREFIXES as readonly string[]).includes(prefix);
}

/**
 * Reject keys that are empty, absolute, traversing, or otherwise not the shape
 * generateKey produces. Keys reaching here may be read from the database, so
 * they are treated as untrusted input.
 */
function assertValidKey(key: string): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new Error("Invalid storage key: key is empty.");
  }
  if (Buffer.byteLength(key, "utf8") > MAX_KEY_LENGTH) {
    throw new Error(`Invalid storage key: exceeds ${MAX_KEY_LENGTH} bytes.`);
  }
  if (key.startsWith("/")) {
    throw new Error(`Invalid storage key "${key}": keys must not start with "/".`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(key)) {
    throw new Error("Invalid storage key: contains control characters.");
  }
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    throw new Error(
      `Invalid storage key "${key}": empty or relative path segments are not allowed.`,
    );
  }
}

/**
 * The key prefix and the target bucket must agree. This is the same invariant
 * as resolveBucket, expressed on the key — so a private key can never be
 * written to, read from, or deleted out of the public bucket by a caller that
 * simply passed the wrong flag.
 */
function assertKeyMatchesVisibility(key: string, isPublic: boolean): void {
  const prefix = prefixOf(key);

  if (isPublic && !isPublicPrefix(prefix)) {
    throw new Error(
      `Refusing to treat "${key}" as public: only ${PUBLIC_PREFIXES.join(", ")}/ ` +
        `keys may live in the public bucket.`,
    );
  }
  if (!isPublic && !isPrivatePrefix(prefix)) {
    throw new Error(
      `Refusing to treat "${key}" as private: expected one of ` +
        `${PRIVATE_PREFIXES.join(", ")}/ but got "${prefix || key}".`,
    );
  }
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/** Conservative extension shape: a dot plus 1-10 alphanumerics. */
const SAFE_EXTENSION = /^\.[a-z0-9]{1,10}$/;

/**
 * Build an object key: `${prefix}/${uuid}${ext}`.
 *
 * ONLY the extension is taken from originalName, and only if it matches
 * SAFE_EXTENSION. The user-supplied basename is never part of the key — it is
 * an injection surface, and the human-readable name is already preserved in
 * files.original_filename, which is what downloads are named after.
 */
export function generateKey(prefix: StoragePrefix, originalName: string): string {
  const rawExt = path.extname(originalName || "").toLowerCase();
  const ext = SAFE_EXTENSION.test(rawExt) ? rawExt : "";
  const key = `${prefix}/${randomUUID()}${ext}`;
  assertValidKey(key);
  return key;
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Upload an object.
 *
 * public:false (default) -> private bucket, no ACL (bucket default: private).
 * public:true            -> public bucket, ACL "public-read".
 *
 * The ACL is set per object and only on this path. Never apply a bucket-wide
 * public policy to the private bucket.
 */
export async function put(
  key: string,
  body: Buffer | Uint8Array | string | Readable,
  options: PutOptions,
): Promise<{ key: string }> {
  const isPublic = options.public === true;

  assertValidKey(key);
  assertKeyMatchesVisibility(key, isPublic);
  const client = requireClient();
  const bucket = resolveBucket(isPublic);

  // Spaces does not accept chunked uploads without a length, so a stream body
  // must carry an explicit size. Buffers can be measured here.
  let contentLength = options.size;
  if (contentLength === undefined) {
    if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
      contentLength = body.byteLength;
    } else if (typeof body === "string") {
      contentLength = Buffer.byteLength(body, "utf8");
    } else {
      throw new Error(
        `Cannot upload "${key}": a stream body requires an explicit size.`,
      );
    }
  }

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: options.contentType,
      ContentLength: contentLength,
      ...(isPublic ? { ACL: "public-read" as const } : {}),
    }),
  );

  return { key };
}

/**
 * Fetch an object for streaming to a response. The caller owns the stream and
 * must consume or destroy it.
 */
export async function getStream(
  key: string,
  options: { public?: boolean } = {},
): Promise<StoredObject> {
  const isPublic = options.public === true;

  assertValidKey(key);
  assertKeyMatchesVisibility(key, isPublic);
  const client = requireClient();
  const bucket = resolveBucket(isPublic);

  const response = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  );

  if (!response.Body) {
    throw new Error(`Object "${key}" returned an empty body.`);
  }

  return {
    // On Node the SDK always yields a Readable here.
    stream: response.Body as Readable,
    contentType: response.ContentType,
    contentLength: response.ContentLength,
  };
}

/**
 * Delete an object. S3 DeleteObject is idempotent — deleting a key that is
 * already gone succeeds, so callers do not need to pre-check existence.
 */
export async function remove(
  key: string,
  options: { public?: boolean } = {},
): Promise<void> {
  const isPublic = options.public === true;

  assertValidKey(key);
  assertKeyMatchesVisibility(key, isPublic);
  const client = requireClient();
  const bucket = resolveBucket(isPublic);

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export { remove as delete };

/**
 * Absolute URL for a PUBLIC object, e.g.
 * https://futurepath-public.fra1.digitaloceanspaces.com/logos/<uuid>.png
 *
 * Private objects have no public URL and this throws for them — that refusal is
 * the point. To serve public assets from the CDN edge instead of the origin,
 * insert ".cdn" before the region host here.
 */
export function publicUrl(key: string): string {
  assertValidKey(key);

  if (!isPublicPrefix(prefixOf(key))) {
    throw new Error(
      `Refusing to build a public URL for "${key}": it is not a public object. ` +
        `Private objects are served only through an authenticated route.`,
    );
  }

  // resolveBucket(true) also re-asserts that the two buckets are distinct.
  const bucket = resolveBucket(true);

  const endpoint = process.env.SPACES_ENDPOINT;
  if (!endpoint) {
    throw new Error("Spaces not configured: SPACES_ENDPOINT is not set.");
  }

  const host = endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  return `https://${bucket}.${host}/${encodedKey}`;
}

/**
 * ESCAPE HATCH — not used by any route.
 *
 * A presigned URL is a detached bearer credential: it cannot be revoked before
 * it expires, and it survives in browser history and access logs. For minors'
 * data the streaming path (getStream) is strictly safer, because authorization
 * and the bytes stay on the same authenticated request. Reach for this only if
 * proxy bandwidth becomes a real problem, and keep the TTL short.
 */
export async function getSignedUrl(
  key: string,
  ttlSeconds: number,
  options: { public?: boolean } = {},
): Promise<string> {
  const isPublic = options.public === true;

  assertValidKey(key);
  assertKeyMatchesVisibility(key, isPublic);

  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("Presigned URL TTL must be a positive whole number of seconds.");
  }
  if (ttlSeconds > MAX_SIGNED_URL_TTL_SECONDS) {
    throw new Error(
      `Presigned URL TTL of ${ttlSeconds}s exceeds the ${MAX_SIGNED_URL_TTL_SECONDS}s ` +
        `maximum. Long-lived signed URLs to student data are not revocable.`,
    );
  }

  const client = requireClient();
  const bucket = resolveBucket(isPublic);

  return presignS3Url(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: ttlSeconds },
  );
}
