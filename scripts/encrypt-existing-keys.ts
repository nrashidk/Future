/**
 * Migration script to encrypt existing plaintext API keys in the database.
 * Run with: npx tsx scripts/encrypt-existing-keys.ts
 */

import { db } from "../server/db";
import { apiCredentials } from "../shared/schema";
import { encryptAndSerialize, isEncryptedFormat } from "../server/utils/encryption";

async function migrateApiKeys() {
  console.log("Starting API key encryption migration...");
  
  // Check if encryption key is set
  if (!process.env.DB_ENCRYPTION_KEY) {
    console.error("ERROR: DB_ENCRYPTION_KEY environment variable is not set");
    process.exit(1);
  }
  
  // Get all API credentials
  const credentials = await db.select().from(apiCredentials);
  console.log(`Found ${credentials.length} API credential(s) to check`);
  
  let migrated = 0;
  let skipped = 0;
  
  for (const credential of credentials) {
    // Skip if already encrypted
    if (isEncryptedFormat(credential.apiKey)) {
      console.log(`  ✓ ${credential.provider}: Already encrypted, skipping`);
      skipped++;
      continue;
    }
    
    // Encrypt the plaintext key
    try {
      const encryptedKey = encryptAndSerialize(credential.apiKey);
      
      await db
        .update(apiCredentials)
        .set({ apiKey: encryptedKey, updatedAt: new Date() })
        .where(eq(apiCredentials.provider, credential.provider));
      
      console.log(`  ✓ ${credential.provider}: Encrypted successfully`);
      migrated++;
    } catch (error) {
      console.error(`  ✗ ${credential.provider}: Failed to encrypt -`, error);
    }
  }
  
  console.log("\nMigration complete:");
  console.log(`  - Migrated: ${migrated}`);
  console.log(`  - Skipped (already encrypted): ${skipped}`);
  console.log(`  - Total: ${credentials.length}`);
}

// Import eq for the where clause
import { eq } from "drizzle-orm";

migrateApiKeys()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
