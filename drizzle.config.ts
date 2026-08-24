import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Mirrors the guard in server/db.ts. drizzle-kit loads this config in its OWN
// process and never imports server/db.ts, so the check has to be duplicated
// rather than shared - keep the variable names and condition shape identical to
// server/db.ts so the two cannot drift apart unnoticed.
//
// This matters more here than there: `db:push` reconciles the live schema against
// shared/schema.ts and will DROP columns (and the data in them) to do it. Running
// it against production from a dev shell is the most destructive command in this
// repo. As in db.ts, production announces itself with the POSITIVE signal
// APP_ENV=production; NODE_ENV is not used.
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
    `Refusing to run drizzle-kit: DATABASE_URL points at the PRODUCTION database ` +
      `(endpoint ${PRODUCTION_DB_ENDPOINT_ID}) but APP_ENV is ` +
      `"${process.env.APP_ENV ?? "unset"}", not "production".\n` +
      `\`db:push\` alters the live schema and WILL DROP COLUMNS - and the data in ` +
      `them - to match shared/schema.ts.\n` +
      `This is almost always a stale DATABASE_URL inherited from your shell - ` +
      `check with: printenv DATABASE_URL\n` +
      `Point DATABASE_URL at the staging branch, or set ALLOW_PRODUCTION_DB=true ` +
      `if you genuinely intend to migrate production.`,
  );
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
