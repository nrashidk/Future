import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.DB_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('DB_ENCRYPTION_KEY environment variable is not set');
  }
  if (key.length !== 64) {
    throw new Error('DB_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

export function encryptApiKey(plaintext: string): EncryptedData {
  const keyBuffer = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

export function decryptApiKey(encryptedData: EncryptedData): string {
  const keyBuffer = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    keyBuffer,
    Buffer.from(encryptedData.iv, 'hex')
  );
  decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function serializeEncrypted(data: EncryptedData): string {
  return `${data.encrypted}:${data.iv}:${data.tag}`;
}

export function deserializeEncrypted(serialized: string): EncryptedData {
  const parts = serialized.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  return {
    encrypted: parts[0],
    iv: parts[1],
    tag: parts[2],
  };
}

export function isEncryptedFormat(value: string): boolean {
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => /^[a-f0-9]+$/i.test(p));
}

export function encryptAndSerialize(plaintext: string): string {
  const encrypted = encryptApiKey(plaintext);
  return serializeEncrypted(encrypted);
}

export function deserializeAndDecrypt(serialized: string): string {
  const encryptedData = deserializeEncrypted(serialized);
  return decryptApiKey(encryptedData);
}
