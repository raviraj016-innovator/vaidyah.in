'use client';

import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// AES-256-GCM encrypted localStorage wrapper.
// The encryption key is generated once per browser session and stored in
// sessionStorage. When the session ends (tab/browser close), the key is
// lost and persisted offline data becomes undecryptable — this is the
// desired behavior for PHI: data is effectively destroyed on session end.
// ---------------------------------------------------------------------------
const ENC_KEY_SESSION_KEY = 'vaidyah-offline-enc-key';

async function getOrCreateSessionKey(): Promise<CryptoKey> {
  const stored = sessionStorage.getItem(ENC_KEY_SESSION_KEY);
  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', true, [
      'encrypt',
      'decrypt',
    ]);
  }
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const exported = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const b64 = btoa(String.fromCharCode(...exported));
  sessionStorage.setItem(ENC_KEY_SESSION_KEY, b64);
  return key;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
  }
  return btoa(parts.join(''));
}

function base64ToUint8(b64: string): Uint8Array {
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

const encryptedLocalStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;
    const encrypted = localStorage.getItem(name);
    if (!encrypted) return null;
    try {
      const key = await getOrCreateSessionKey();
      const combined = base64ToUint8(encrypted);
      const iv = combined.slice(0, 12);
      const ciphertext = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        ciphertext,
      );
      return new TextDecoder().decode(decrypted);
    } catch {
      // Key changed (new session) or corrupt data — clear stale entry
      localStorage.removeItem(name);
      return null;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    const key = await getOrCreateSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        new TextEncoder().encode(value),
      ),
    );
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv);
    combined.set(ciphertext, iv.length);
    localStorage.setItem(name, uint8ToBase64(combined));
  },
  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
  },
};

interface PendingSyncItem {
  id: string;
  type: 'session' | 'vitals' | 'consultation' | 'emergency';
  payload: Record<string, unknown>;
  priority: number;
  retryCount: number;
  createdAt: string;
}

type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

interface OfflineState {
  pendingItems: PendingSyncItem[];
  syncStatus: SyncStatus;
  lastSyncAt: string | null;
  isOnline: boolean;

  addPendingItem: (
    item: Omit<PendingSyncItem, 'id' | 'retryCount' | 'createdAt'>,
  ) => void;
  removePendingItem: (id: string) => void;
  incrementRetry: (id: string) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setOnline: (online: boolean) => void;
  setLastSync: (date: string) => void;
  clearSynced: () => void;
  getPendingCount: () => number;
}

export type { PendingSyncItem, SyncStatus, OfflineState };

export const useOfflineStore = create<OfflineState>()(
  persist(
    (set, get) => ({
      pendingItems: [],
      syncStatus: 'idle',
      lastSyncAt: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

      addPendingItem: (item) =>
        set((state) => ({
          pendingItems: [
            ...state.pendingItems,
            {
              ...item,
              id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              retryCount: 0,
              createdAt: new Date().toISOString(),
            },
          ],
        })),

      removePendingItem: (id) =>
        set((state) => ({
          pendingItems: state.pendingItems.filter((i) => i.id !== id),
        })),

      incrementRetry: (id) =>
        set((state) => ({
          pendingItems: state.pendingItems.map((item) =>
            item.id === id
              ? { ...item, retryCount: item.retryCount + 1 }
              : item,
          ),
        })),

      setSyncStatus: (syncStatus) => set({ syncStatus }),
      setOnline: (isOnline) => set({ isOnline }),
      setLastSync: (lastSyncAt) => set({ lastSyncAt }),
      clearSynced: () => set({ pendingItems: [] }),
      getPendingCount: () => get().pendingItems.length,
    }),
    {
      name: 'vaidyah-offline',
      storage: createJSONStorage(() => encryptedLocalStorage),
      partialize: (state) => ({
        pendingItems: state.pendingItems,
        lastSyncAt: state.lastSyncAt,
        // Exclude syncStatus and isOnline — they are transient runtime state
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Reset transient state after rehydration
          state.syncStatus = 'idle';
          state.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
        }
      },
    },
  ),
);

// Wire up browser online/offline events to keep isOnline reactive
if (typeof window !== 'undefined') {
  const LISTENER_KEY = '__vaidyah_offline_listeners';
  if (!(window as any)[LISTENER_KEY]) {
    (window as any)[LISTENER_KEY] = true;
    window.addEventListener('online', () => useOfflineStore.getState().setOnline(true));
    window.addEventListener('offline', () => useOfflineStore.getState().setOnline(false));
  }
}
