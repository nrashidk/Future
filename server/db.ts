import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// A stale or ambient DATABASE_URL must never route a non-production process at
// the production database. Production announces itself with a POSITIVE signal,
// APP_ENV=production, which Render sets explicitly. NODE_ENV is deliberately not
// used here: Render's start command is `node dist/index.js`, so NODE_ENV's value
// is not guaranteed and its absence would prove nothing about the environment.
const PRODUCTION_DB_ENDPOINT_ID =
  process.env.PRODUCTION_DB_ENDPOINT_ID ?? "ep-floral-rice-astfwiew";

const targetsProductionDb = process.env.DATABASE_URL.includes(
  PRODUCTION_DB_ENDPOINT_ID,
);
const isProductionApp = process.env.APP_ENV === "production";

if (
  targetsProductionDb &&
  !isProductionApp &&
  process.env.ALLOW_PRODUCTION_DB !== "true"
) {
  throw new Error(
    `Refusing to start: DATABASE_URL points at the PRODUCTION database ` +
      `(endpoint ${PRODUCTION_DB_ENDPOINT_ID}) but APP_ENV is ` +
      `"${process.env.APP_ENV ?? "unset"}", not "production".\n` +
      `This is almost always a stale DATABASE_URL inherited from your shell - ` +
      `check with: printenv DATABASE_URL\n` +
      `Point DATABASE_URL at the staging branch, or set ALLOW_PRODUCTION_DB=true ` +
      `if you genuinely intend to touch production.`,
  );
}

// Non-secret boot line: the endpoint id and APP_ENV only, never credentials.
// This is how a deploy proves from its own logs which database it resolved and
// that APP_ENV is actually live - there is no shell on Render to check from.
const dbEndpointId = (() => {
  try {
    return new URL(process.env.DATABASE_URL!).hostname.split(".")[0];
  } catch {
    return "unparseable";
  }
})();
console.log(
  `🗄️  DB endpoint: ${dbEndpointId}  |  APP_ENV: ${process.env.APP_ENV ?? "unset"}`,
);

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });
