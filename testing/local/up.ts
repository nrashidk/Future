/**
 * Boots the real application against the local PGlite database.
 *
 * Nothing in server/ is modified or shimmed. The only trick is ordering:
 * process.env is populated and neonConfig is pointed at the local WebSocket
 * bridge BEFORE server/index.ts is imported, so when server/db.ts builds its
 * Pool it builds one that reaches PGlite.
 *
 * Runs in development mode on purpose. server/auth.ts sets
 * `secure: NODE_ENV === 'production'` on the session cookie, so a production
 * boot over plain http would refuse to set fp_session and every login would
 * fail for a reason that has nothing to do with the code under test. Production
 * mode is worth booting separately, over TLS, to check cookie flags and static
 * asset serving -- that is a different test, not this one.
 */
import { startDatabase } from "./db-bridge.mjs";

const PORT = process.env.TEST_PORT ?? "5050";

const dbh = await startDatabase();

process.env.DATABASE_URL = dbh.url;
process.env.APP_ENV = "local";
process.env.NODE_ENV = "development";
process.env.PORT = PORT;
process.env.SESSION_SECRET = "local-testing-session-secret-not-a-real-secret";
// 64 hex characters, as the encryption util requires. Local only; it encrypts
// nothing that leaves this machine.
process.env.DB_ENCRYPTION_KEY = "0".repeat(64);
process.env.SUPERADMIN_EMAILS = "super@futurepath.test";
// The seed deliberately refuses to create these accounts without an explicit
// password -- there is no hardcoded fallback, which is the right call. Supply
// them here so the roles exist to test with.
process.env.SEED_SUPERADMIN_PASSWORD = "LocalTest!Super1";
process.env.SEED_SCHOOLADMIN_PASSWORD = "LocalTest!School1";
process.env.BASE_URL = `http://127.0.0.1:${PORT}`;
process.env.APP_URL = `http://127.0.0.1:${PORT}`;
// Object storage is required at boot (an unset value is treated as an outage,
// by design). These satisfy the guard; anything that actually calls Spaces will
// fail, and the file tests are reported as blocked rather than passed.
process.env.SPACES_KEY = "local";
process.env.SPACES_SECRET = "local";
process.env.SPACES_ENDPOINT = "http://127.0.0.1:59000";
process.env.SPACES_BUCKET = "fp-private";
process.env.SPACES_PUBLIC_BUCKET = "fp-public";
process.env.SPACES_REGION = "local";
/**
 * PDF generation launches Puppeteer, and puppeteer's own Chrome download never
 * ran here (it fetches from storage.googleapis.com, which this sandbox cannot
 * reach). A Chrome for Testing binary is already present for Playwright, and
 * puppeteer honours this variable, so the real PDF path can be exercised
 * instead of being reported blocked.
 */
process.env.PUPPETEER_EXECUTABLE_PATH =
  process.env.PUPPETEER_EXECUTABLE_PATH ?? "/opt/pw-browsers/chromium";

const { neonConfig } = await import("@neondatabase/serverless");
const ws = (await import("ws")).default;
neonConfig.webSocketConstructor = ws as never;
neonConfig.useSecureWebSocket = false;
neonConfig.pipelineTLS = false;
neonConfig.pipelineConnect = false;
neonConfig.wsProxy = () => `127.0.0.1:${dbh.wsPort}/v2`;

console.log(`[local] database ready, booting app on ${PORT}`);

await import("../../server/index.js");

const shutdown = async () => {
  await dbh.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
