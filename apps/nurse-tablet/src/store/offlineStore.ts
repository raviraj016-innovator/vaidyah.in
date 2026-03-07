import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import apiClient, { ENDPOINTS } from '../config/api';
import type { ConsultationSession, PatientInfo, Vitals, DetectedSymptom, SOAPNote } from './sessionStore';

// ---------------------------------------------------------------------------
// Encrypted AsyncStorage wrapper for PHI data.
// Uses a per-install random key stored in SecureStore (hardware-backed
// keychain). The key is derived via SHA-256 digest before use. Data is
// obfuscated with XOR-based encryption using the derived key and a random
// nonce, then Base64-encoded before writing to AsyncStorage, which handles
// arbitrarily large values (unlike SecureStore's 2KB limit).
//
// NOTE: This provides obfuscation for local device storage, not
// cryptographic-grade encryption. expo-crypto does not expose AES-GCM
// directly, so we use XOR with a SHA-256 derived key stream. This is
// acceptable because the data is stored on-device only and the key material
// is protected by the OS keychain via SecureStore.
// ---------------------------------------------------------------------------
const ENC_KEY_ALIAS = 'vaidyah_offline_enc_key';

async function getOrCreateEncKey(): Promise<string> {
  let key = await SecureStore.getItemAsync(ENC_KEY_ALIAS);
  if (!key) {
    key = Crypto.randomUUID() + Crypto.randomUUID(); // 64-char random key material
    await SecureStore.setItemAsync(ENC_KEY_ALIAS, key);
  }
  return key;
}

/** Derive a 32-byte key from the key string + salt using iterated SHA-256. */
async function deriveKeyBytes(keyStr: string, salt: string): Promise<Uint8Array> {
  let hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    keyStr + ':' + salt,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  // Iterate to add cost (lightweight key stretching)
  for (let i = 0; i < 1000; i++) {
    hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      hash + ':' + i,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  }
  // Convert hex string to Uint8Array (32 bytes)
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Simple UTF-8 string to bytes (React Native compatible, no TextEncoder). */
function stringToBytes(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // Surrogate pair
      const next = str.charCodeAt(++i);
      const cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

/** Simple bytes to UTF-8 string (React Native compatible, no TextDecoder). */
function bytesToString(bytes: Uint8Array): string {
  const chars: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      chars.push(String.fromCharCode(b));
      i++;
    } else if ((b & 0xe0) === 0xc0) {
      chars.push(String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f)));
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      chars.push(
        String.fromCharCode(((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f)),
      );
      i += 3;
    } else {
      const cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      // Convert to surrogate pair
      const offset = cp - 0x10000;
      chars.push(String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)));
      i += 4;
    }
  }
  return chars.join('');
}

/** Base64 encode bytes (React Native compatible, no btoa). */
function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[(a >> 2) & 0x3f];
    result += chars[((a << 4) | (b >> 4)) & 0x3f];
    result += i + 1 < bytes.length ? chars[((b << 2) | (c >> 6)) & 0x3f] : '=';
    result += i + 2 < bytes.length ? chars[c & 0x3f] : '=';
  }
  return result;
}

/** Base64 decode to bytes (React Native compatible, no atob). */
function base64ToUint8(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = b64.replace(/=+$/, '');
  const bytes: number[] = [];
  for (let i = 0; i < stripped.length; i += 4) {
    const a = chars.indexOf(stripped[i]);
    const b = chars.indexOf(stripped[i + 1] ?? 'A');
    const c = chars.indexOf(stripped[i + 2] ?? 'A');
    const d = chars.indexOf(stripped[i + 3] ?? 'A');
    bytes.push((a << 2) | (b >> 4));
    if (i + 2 < stripped.length) bytes.push(((b << 4) | (c >> 2)) & 0xff);
    if (i + 3 < stripped.length) bytes.push(((c << 6) | d) & 0xff);
  }
  return new Uint8Array(bytes);
}

/**
 * Generate an XOR key stream from the derived key + nonce using iterated
 * SHA-256 in counter mode. Produces `length` bytes.
 */
async function generateKeyStream(keyBytes: Uint8Array, nonce: Uint8Array, length: number): Promise<Uint8Array> {
  const stream = new Uint8Array(length);
  let offset = 0;
  let counter = 0;
  const nonceHex = Array.from(nonce).map((b) => b.toString(16).padStart(2, '0')).join('');
  const keyHex = Array.from(keyBytes).map((b) => b.toString(16).padStart(2, '0')).join('');

  while (offset < length) {
    const block = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      keyHex + ':' + nonceHex + ':' + counter,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
    for (let i = 0; i < 64 && offset < length; i += 2, offset++) {
      stream[offset] = parseInt(block.substring(i, i + 2), 16);
    }
    counter++;
  }
  return stream;
}

async function xorEncrypt(data: string, keyStr: string): Promise<string> {
  const keyBytes = await deriveKeyBytes(keyStr, 'vaidyah-offline-phi-v1');
  const nonce = Crypto.getRandomBytes(12);
  const plaintext = stringToBytes(data);
  const keyStream = await generateKeyStream(keyBytes, nonce, plaintext.length);

  const ciphertext = new Uint8Array(plaintext.length);
  for (let i = 0; i < plaintext.length; i++) {
    ciphertext[i] = plaintext[i] ^ keyStream[i];
  }

  // Prepend nonce to ciphertext
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce);
  combined.set(ciphertext, nonce.length);
  return uint8ToBase64(combined);
}

async function xorDecrypt(encoded: string, keyStr: string): Promise<string> {
  const keyBytes = await deriveKeyBytes(keyStr, 'vaidyah-offline-phi-v1');
  const combined = base64ToUint8(encoded);
  const nonce = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const keyStream = await generateKeyStream(keyBytes, nonce, ciphertext.length);

  const plaintext = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    plaintext[i] = ciphertext[i] ^ keyStream[i];
  }
  return bytesToString(plaintext);
}

const encryptedStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const encrypted = await AsyncStorage.getItem(name);
    if (!encrypted) return null;
    try {
      const key = await getOrCreateEncKey();
      return await xorDecrypt(encrypted, key);
    } catch {
      // If decryption fails (key changed, format migration from XOR), clear stale data
      await AsyncStorage.removeItem(name);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const key = await getOrCreateEncKey();
    const encrypted = await xorEncrypt(value, key);
    await AsyncStorage.setItem(name, encrypted);
  },
  removeItem: async (name: string): Promise<void> => {
    await AsyncStorage.removeItem(name);
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SyncAction =
  | 'create_session'
  | 'update_session'
  | 'complete_session'
  | 'submit_vitals'
  | 'create_patient'
  | 'upload_audio'
  | 'submit_triage'
  | 'submit_soap';

export interface PendingSync {
  id: string;
  action: SyncAction;
  endpoint: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  priority: number; // lower = higher priority
}

export interface OfflineSession {
  id: string;
  session: ConsultationSession;
  patient: PatientInfo;
  vitals?: Vitals;
  symptoms: DetectedSymptom[];
  soapNote?: SOAPNote;
  audioChunks: string[]; // file URIs
  createdAt: string;
  syncedAt?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface OfflineState {
  // State
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingSyncs: PendingSync[];
  offlineSessions: OfflineSession[];
  lastSyncAt: string | null;
  lastSyncAttemptAt: number; // timestamp for debounce
  syncErrors: string[];

  // Actions
  setOnlineStatus: (online: boolean) => void;
  addPendingSync: (sync: Omit<PendingSync, 'id' | 'createdAt' | 'retryCount'>) => void;
  removePendingSync: (id: string) => void;
  clearPendingSyncs: () => void;

  saveOfflineSession: (session: OfflineSession) => void;
  removeOfflineSession: (id: string) => void;
  getOfflineSession: (id: string) => OfflineSession | undefined;

  syncAll: () => Promise<void>;
  syncSingle: (id: string) => Promise<boolean>;
  setSyncStatus: (status: SyncStatus) => void;
  clearSyncErrors: () => void;

  getPendingCount: () => number;
}

// Minimum interval between auto-sync attempts (in milliseconds)
const SYNC_DEBOUNCE_MS = 5000;

// ---------------------------------------------------------------------------
// Store with persistence
// ---------------------------------------------------------------------------
export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      // Initial state
      isOnline: true,
      syncStatus: 'idle',
      pendingSyncs: [],
      offlineSessions: [],
      lastSyncAt: null,
      lastSyncAttemptAt: 0,
      syncErrors: [],

      // ------------------------------------------------------------------
      // Online status
      // ------------------------------------------------------------------
      setOnlineStatus: (online) => {
        set({ isOnline: online });
        if (online && get().pendingSyncs.length > 0) {
          // Auto-sync when back online, but debounce to avoid race conditions
          const now = Date.now();
          const lastAttempt = get().lastSyncAttemptAt;
          if (now - lastAttempt >= SYNC_DEBOUNCE_MS) {
            get().syncAll();
          }
        }
      },

      // ------------------------------------------------------------------
      // Pending sync queue
      // ------------------------------------------------------------------
      addPendingSync: (sync) => {
        const item: PendingSync = {
          ...sync,
          id: `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          createdAt: new Date().toISOString(),
          retryCount: 0,
        };
        set((s) => ({
          pendingSyncs: [...s.pendingSyncs, item].sort((a, b) => a.priority - b.priority),
        }));
      },

      removePendingSync: (id) =>
        set((s) => ({
          pendingSyncs: s.pendingSyncs.filter((p) => p.id !== id),
        })),

      clearPendingSyncs: () => set({ pendingSyncs: [] }),

      // ------------------------------------------------------------------
      // Offline sessions
      // ------------------------------------------------------------------
      saveOfflineSession: (session) =>
        set((s) => {
          const existing = s.offlineSessions.findIndex((os) => os.id === session.id);
          const updated = [...s.offlineSessions];
          if (existing >= 0) {
            updated[existing] = session;
          } else {
            updated.push(session);
          }
          return { offlineSessions: updated };
        }),

      removeOfflineSession: (id) =>
        set((s) => ({
          offlineSessions: s.offlineSessions.filter((os) => os.id !== id),
        })),

      getOfflineSession: (id) => get().offlineSessions.find((os) => os.id === id),

      // ------------------------------------------------------------------
      // Sync operations
      // ------------------------------------------------------------------
      syncAll: async () => {
        const { pendingSyncs, isOnline, syncStatus, lastSyncAttemptAt } = get();
        if (!isOnline || pendingSyncs.length === 0 || syncStatus === 'syncing') return;

        // Debounce: skip if last sync attempt was less than SYNC_DEBOUNCE_MS ago
        const now = Date.now();
        if (now - lastSyncAttemptAt < SYNC_DEBOUNCE_MS) return;

        set({ syncStatus: 'syncing', syncErrors: [], lastSyncAttemptAt: now });

        const errors: string[] = [];
        const completed: string[] = [];

        // Process in priority order
        for (const sync of [...pendingSyncs]) {
          try {
            const response = await apiClient({
              method: sync.method,
              url: sync.endpoint,
              data: sync.payload,
            });

            if (response.status >= 200 && response.status < 300) {
              completed.push(sync.id);
            }
          } catch (err: any) {
            const status = err.response?.status;
            const message =
              status === 401 ? 'Authentication required' :
              status === 403 ? 'Permission denied' :
              status === 409 ? 'Conflict with existing data' :
              status === 429 ? 'Rate limited' :
              'Sync failed';

            if (sync.retryCount < sync.maxRetries) {
              // Increment retry count
              set((s) => ({
                pendingSyncs: s.pendingSyncs.map((p) =>
                  p.id === sync.id
                    ? { ...p, retryCount: p.retryCount + 1, lastError: message }
                    : p,
                ),
              }));
            } else {
              errors.push(`${sync.action}: ${message}`);
              completed.push(sync.id); // Remove after max retries
            }
          }
        }

        // Remove completed syncs
        set((s) => ({
          pendingSyncs: s.pendingSyncs.filter((p) => !completed.includes(p.id)),
          syncStatus: errors.length > 0 ? 'error' : 'idle',
          syncErrors: errors,
          lastSyncAt: new Date().toISOString(),
        }));
      },

      syncSingle: async (id) => {
        const sync = get().pendingSyncs.find((p) => p.id === id);
        if (!sync || !get().isOnline) return false;

        try {
          const response = await apiClient({
            method: sync.method,
            url: sync.endpoint,
            data: sync.payload,
          });

          if (response.status >= 200 && response.status < 300) {
            get().removePendingSync(id);
            return true;
          }
          return false;
        } catch (err: any) {
          const status = err.response?.status;
          const message =
            status === 401 ? 'Authentication required' :
            status === 403 ? 'Permission denied' :
            'Sync failed';
          set((s) => ({
            pendingSyncs: s.pendingSyncs.map((p) =>
              p.id === id
                ? { ...p, retryCount: p.retryCount + 1, lastError: message }
                : p,
            ),
          }));
          return false;
        }
      },

      setSyncStatus: (status) => set({ syncStatus: status }),
      clearSyncErrors: () => set({ syncErrors: [] }),
      getPendingCount: () => get().pendingSyncs.length,
    }),
    {
      name: 'vaidyah-offline-store',
      storage: createJSONStorage(() => encryptedStorage),
      partialize: (state) => ({
        pendingSyncs: state.pendingSyncs,
        offlineSessions: state.offlineSessions,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);
