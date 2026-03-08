/**
 * AWS KMS Integration
 *
 * Provides envelope encryption for PHI/PII data at rest.
 * Falls back to local AES-256 encryption in development when KMS is not configured.
 */

import {
  KMSClient,
  EncryptCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  DescribeKeyCommand,
} from '@aws-sdk/client-kms';
import crypto from 'crypto';
import { getAwsConfig, isServiceAvailable } from './config';

// ─── KMS Client ──────────────────────────────────────────────────────────────

let kmsClient: KMSClient | null = null;

function getClient(): KMSClient {
  if (!kmsClient) {
    const config = getAwsConfig();
    kmsClient = new KMSClient({ region: config.region });
  }
  return kmsClient;
}

const KMS_KEY_ID = process.env.KMS_KEY_ID || '';
const DEV_ENCRYPTION_KEY = process.env.DEV_ENCRYPTION_KEY || 'vaidyah-dev-key-32bytes-padding!'; // 32 bytes for AES-256

// ─── Envelope Encryption (Production — uses KMS data keys) ───────────────────

/**
 * Encrypt sensitive data using KMS envelope encryption.
 * Returns base64-encoded ciphertext with encrypted data key prepended.
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (!isServiceAvailable('kms')) {
    return encryptLocal(plaintext);
  }

  const client = getClient();

  // Generate a data key from KMS
  const { Plaintext: dataKey, CiphertextBlob: encryptedDataKey } = await client.send(
    new GenerateDataKeyCommand({
      KeyId: KMS_KEY_ID,
      KeySpec: 'AES_256',
    }),
  );

  if (!dataKey || !encryptedDataKey) {
    throw new Error('KMS GenerateDataKey returned empty result');
  }

  // Encrypt data locally with the plaintext data key
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(dataKey), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Wipe plaintext data key from memory
  Buffer.from(dataKey).fill(0);

  // Package: [encryptedDataKeyLen(2)] [encryptedDataKey] [iv(16)] [authTag(16)] [ciphertext]
  const edkLen = Buffer.alloc(2);
  edkLen.writeUInt16BE(encryptedDataKey.length);

  const result = Buffer.concat([
    edkLen,
    Buffer.from(encryptedDataKey),
    iv,
    authTag,
    encrypted,
  ]);

  return result.toString('base64');
}

/**
 * Decrypt data that was encrypted with envelope encryption.
 */
export async function decrypt(ciphertext: string): Promise<string> {
  if (!isServiceAvailable('kms')) {
    return decryptLocal(ciphertext);
  }

  const client = getClient();
  const data = Buffer.from(ciphertext, 'base64');

  // Parse the envelope
  const edkLen = data.readUInt16BE(0);
  const encryptedDataKey = data.subarray(2, 2 + edkLen);
  const iv = data.subarray(2 + edkLen, 2 + edkLen + 16);
  const authTag = data.subarray(2 + edkLen + 16, 2 + edkLen + 32);
  const encrypted = data.subarray(2 + edkLen + 32);

  // Decrypt the data key with KMS
  const { Plaintext: dataKey } = await client.send(
    new DecryptCommand({
      CiphertextBlob: encryptedDataKey,
    }),
  );

  if (!dataKey) {
    throw new Error('KMS Decrypt returned empty plaintext');
  }

  // Decrypt data with the plaintext data key
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(dataKey), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  // Wipe plaintext data key from memory
  Buffer.from(dataKey).fill(0);

  return decrypted.toString('utf8');
}

/**
 * Directly encrypt a small value (< 4KB) using KMS.
 * Use for encryption keys, tokens, etc. — not large data.
 */
export async function kmsEncrypt(plaintext: string): Promise<string> {
  if (!isServiceAvailable('kms')) {
    return encryptLocal(plaintext);
  }
  const client = getClient();
  const { CiphertextBlob } = await client.send(
    new EncryptCommand({
      KeyId: KMS_KEY_ID,
      Plaintext: Buffer.from(plaintext, 'utf8'),
    }),
  );
  if (!CiphertextBlob) throw new Error('KMS Encrypt returned empty result');
  return Buffer.from(CiphertextBlob).toString('base64');
}

/**
 * Directly decrypt a KMS-encrypted value.
 */
export async function kmsDecrypt(ciphertext: string): Promise<string> {
  if (!isServiceAvailable('kms')) {
    return decryptLocal(ciphertext);
  }
  const client = getClient();
  const { Plaintext } = await client.send(
    new DecryptCommand({
      CiphertextBlob: Buffer.from(ciphertext, 'base64'),
    }),
  );
  if (!Plaintext) throw new Error('KMS Decrypt returned empty result');
  return Buffer.from(Plaintext).toString('utf8');
}

/**
 * Verify KMS key is accessible (health check).
 */
export async function verifyKmsKey(): Promise<boolean> {
  if (!isServiceAvailable('kms')) {
    console.warn('[KMS] Not configured — using local encryption fallback');
    return true;
  }
  try {
    const client = getClient();
    await client.send(new DescribeKeyCommand({ KeyId: KMS_KEY_ID }));
    return true;
  } catch (err) {
    console.error('[KMS] Key verification failed:', err);
    return false;
  }
}

// ─── Local Fallback (Development) ────────────────────────────────────────────

function encryptLocal(plaintext: string): string {
  const key = crypto.scryptSync(DEV_ENCRYPTION_KEY, 'vaidyah-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptLocal(ciphertext: string): string {
  const key = crypto.scryptSync(DEV_ENCRYPTION_KEY, 'vaidyah-salt', 32);
  const data = Buffer.from(ciphertext, 'base64');
  const iv = data.subarray(0, 16);
  const authTag = data.subarray(16, 32);
  const encrypted = data.subarray(32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
