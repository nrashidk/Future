/**
 * One-off script to reset the seeded admin account passwords.
 *
 * The "schooladmin" and "superadmin" accounts were originally seeded with
 * hardcoded passwords and there is no in-app UI to change them. This script
 * sets a fresh password hash for each, using the SAME hashPassword util the
 * app uses at login time so the hash format matches verification.
 *
 * It ONLY updates the passwordHash column — no other field is touched, and it
 * never creates accounts. If a username does not exist, it is skipped with a
 * warning.
 *
 * Passwords are read from env vars and never logged. Run with:
 *   SEED_SCHOOLADMIN_PASSWORD=... SEED_SUPERADMIN_PASSWORD=... \
 *     npx tsx scripts/reset-admin-passwords.ts
 *
 * To target a single account, pass --only=superadmin or --only=schooladmin.
 * Only that account's env var is then required:
 *   SEED_SUPERADMIN_PASSWORD=... \
 *     npx tsx scripts/reset-admin-passwords.ts --only=superadmin
 *
 * NOTE: this targets the live database — review before running.
 */

import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { users } from "../shared/schema";
import { hashPassword } from "../server/utils/passwordHash";

// Each seeded admin account and the env var that supplies its new password.
const ACCOUNTS: Array<{ username: string; envVar: string }> = [
  { username: "schooladmin", envVar: "SEED_SCHOOLADMIN_PASSWORD" },
  { username: "superadmin", envVar: "SEED_SUPERADMIN_PASSWORD" },
];

function parseOnlyFlag(): string | null {
  const onlyArg = process.argv.slice(2).find((arg) => arg.startsWith("--only="));
  if (!onlyArg) return null;

  const value = onlyArg.slice("--only=".length);
  const valid = ACCOUNTS.map((a) => a.username);
  if (!valid.includes(value)) {
    console.error(
      `ERROR: invalid --only value "${value}". Expected one of: ${valid.join(", ")}.`,
    );
    process.exit(1);
  }
  return value;
}

async function resetAdminPasswords() {
  console.log("Starting admin password reset...");

  // Restrict to a single account when --only is passed; otherwise both.
  const only = parseOnlyFlag();
  const selected = only
    ? ACCOUNTS.filter((a) => a.username === only)
    : ACCOUNTS;

  // Require env vars only for the account(s) actually being targeted —
  // never fall back to a default password.
  const missing = selected
    .filter((a) => !process.env[a.envVar])
    .map((a) => a.envVar);
  if (missing.length > 0) {
    console.error(
      `ERROR: the following required env var(s) are not set: ${missing.join(", ")}. Aborting without changes.`,
    );
    process.exit(1);
  }

  const targets: Array<{ username: string; password: string }> = selected.map(
    (a) => ({ username: a.username, password: process.env[a.envVar]! }),
  );

  const updated: string[] = [];
  const skipped: string[] = [];

  for (const target of targets) {
    // Hash with the app's util so the format matches login verification.
    const passwordHash = await hashPassword(target.password);

    // Update ONLY passwordHash; scope strictly by username so no other
    // account or field is affected.
    const result = await db
      .update(users)
      .set({ passwordHash })
      .where(eq(users.username, target.username))
      .returning({ id: users.id });

    if (result.length === 0) {
      console.warn(`  ⚠️  No account found for username "${target.username}" — skipping (accounts are not created by this script).`);
      skipped.push(target.username);
    } else {
      console.log(`  ✓ Updated password for username "${target.username}"`);
      updated.push(target.username);
    }
  }

  console.log("\nReset complete:");
  console.log(`  - Updated: ${updated.length ? updated.join(", ") : "(none)"}`);
  console.log(`  - Skipped: ${skipped.length ? skipped.join(", ") : "(none)"}`);
}

resetAdminPasswords()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Password reset failed:", error);
    process.exit(1);
  });
