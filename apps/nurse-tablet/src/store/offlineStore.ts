import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiClient, { ENDPOINTS } from '../config/api';
import type { ConsultationSession, PatientInfo, Vitals, DetectedSymptom, SOAPNote } from './sessionStore';

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
      syncErrors: [],

      // ------------------------------------------------------------------
      // Online status
      // ------------------------------------------------------------------
      setOnlineStatus: (online) => {
        set({ isOnline: online });
        if (online && get().pendingSyncs.length > 0) {
          // Auto-sync when back online
          get().syncAll();
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
        const { pendingSyncs, isOnline } = get();
        if (!isOnline || pendingSyncs.length === 0) return;

        set({ syncStatus: 'syncing', syncErrors: [] });

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
            const message = err.response?.data?.message ?? err.message ?? 'Unknown sync error';

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
          const message = err.response?.data?.message ?? err.message;
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
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        pendingSyncs: state.pendingSyncs,
        offlineSessions: state.offlineSessions,
        lastSyncAt: state.lastSyncAt,
      }),
    },
  ),
);
