'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface ClinicalTrial {
  id: string;
  nctId?: string;
  title: string;
  titleHi?: string;
  summary: string;
  summaryHi?: string;
  plainSummary?: string;
  phase: string;
  status: string;
  conditions: string[];
  categories?: string[];
  sponsor: string;
  eligibility?: {
    ageRange?: string;
    ageMin?: number;
    ageMax?: number;
    gender?: string;
    ageGroup?: string;
    raceEthnicity?: string;
    inclusion?: string[];
    exclusion?: string[];
  };
  locations?: Array<{
    facility: string;
    city: string;
    state: string;
    distance?: number;
  }>;
  contact?: { name?: string; phone?: string; email?: string };
  url?: string;
}

interface TrialMatch {
  trial: ClinicalTrial;
  matchScore: number;
  eligible: boolean;
  matchReasons: string[];
  matchReasonsHi?: string[];
  saved?: boolean;
}

interface Notification {
  id: string;
  type: 'new_match' | 'trial_update' | 'enrollment_reminder' | 'general';
  title: string;
  titleHi?: string;
  body: string;
  bodyHi?: string;
  read: boolean;
  createdAt: string;
  trialId?: string;
}

interface TrialState {
  matches: TrialMatch[];
  searchResults: ClinicalTrial[];
  notifications: Notification[];
  searchQuery: string;
  isSearching: boolean;
  dismissedMatchIds: string[];

  setMatches: (matches: TrialMatch[]) => void;
  setSearchResults: (results: ClinicalTrial[]) => void;
  setSearchQuery: (query: string) => void;
  setSearching: (searching: boolean) => void;
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  getUnreadCount: () => number;
  saveMatch: (trialId: string) => void;
  dismissMatch: (trialId: string) => void;
  undoDismiss: (trialId: string) => void;
}

export type { ClinicalTrial, TrialMatch, Notification, TrialState };

export const useTrialStore = create<TrialState>()(
  persist(
    (set, get) => ({
      matches: [],
      searchResults: [],
      notifications: [],
      searchQuery: '',
      isSearching: false,
      dismissedMatchIds: [],

      setMatches: (matches) => set({ matches }),
      setSearchResults: (searchResults) => set({ searchResults }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setSearching: (isSearching) => set({ isSearching }),

      setNotifications: (notifications) => set({ notifications }),

      addNotification: (notification) =>
        set((s) => ({
          notifications: [notification, ...s.notifications],
        })),

      markNotificationRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n,
          ),
        })),

      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),

      getUnreadCount: () => get().notifications.filter((n) => !n.read).length,

      saveMatch: (trialId) =>
        set((s) => ({
          matches: s.matches.map((m) =>
            m.trial.id === trialId ? { ...m, saved: true } : m,
          ),
        })),

      dismissMatch: (trialId) =>
        set((s) => ({
          dismissedMatchIds: [...s.dismissedMatchIds, trialId],
        })),

      undoDismiss: (trialId) =>
        set((s) => ({
          dismissedMatchIds: s.dismissedMatchIds.filter((id) => id !== trialId),
        })),
    }),
    {
      name: 'vaidyah-trial',
      storage: createJSONStorage(() =>
        typeof window !== 'undefined'
          ? sessionStorage
          : { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      ),
      partialize: (state) => ({
        notifications: state.notifications,
        dismissedMatchIds: state.dismissedMatchIds,
      }),
    },
  ),
);
