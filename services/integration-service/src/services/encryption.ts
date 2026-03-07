/**
 * AES-256-GCM encryption for sensitive data at rest (e.g., OAuth tokens).
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { config } from '../config';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(): Buffer {
  const raw = config.encryption.key;
  // If the key is a 64-char hex string, use it directly as 32 bytes
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // Otherwise, derive a 32-byte key via SHA-256
  return createHash('sha256').update(raw).digest();
}

let _cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!_cachedKey) {
    _cachedKey = deriveKey();
  }
  return _cachedKey;
}

/**
 * Encrypt a plaintext string. Returns a base64-encoded string containing
 * [IV (12 bytes) | ciphertext | authTag (16 bytes)].
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: IV + ciphertext + authTag
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString('base64');
}

/**
 * Decrypt a base64-encoded string produced by encrypt().
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const packed = Buffer.from(encoded, 'base64');

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted data: too short');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
