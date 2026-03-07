import { create } from 'zustand';
import apiClient, { API_CONFIG } from '../config/api';
import { setTrialCleanupCallback } from './authStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrialLocation {
  facility: string;
  city: string;
  state: string;
  country: string;
  distance?: number; // km from patient
}

export interface TrialEligibility {
  ageMin?: number;
  ageMax?: number;
  gender?: 'male' | 'female' | 'all';
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  /** Plain-language summary in Hindi */
  summaryHi?: string;
  /** Plain-language summary in English */
  summaryEn?: string;
}

export interface ClinicalTrial {
  id: string;
  nctId: string;
  title: string;
  /** Plain-language summary in English */
  summaryEn: string;
  /** Plain-language summary in Hindi */
  summaryHi: string;
  conditions: string[];
  phase: string;
  status: 'recruiting' | 'active' | 'completed' | 'enrolling_by_invitation' | 'not_yet_recruiting';
  sponsor: string;
  startDate: string;
  endDate?: string;
  locations: TrialLocation[];
  eligibility: TrialEligibility;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  lastUpdated: string;
}

export interface TrialMatch {
  id: string;
  trialId: string;
  trial: ClinicalTrial;
  matchScore: number; // 0.00 to 1.00
  eligible: boolean;
  matchReasons: string[];
  /** Plain-language match explanation in Hindi */
  matchExplanationHi?: string;
  /** Plain-language match explanation in English */
  matchExplanationEn?: string;
  saved: boolean;
  dismissed: boolean;
  notifiedAt?: string;
  createdAt: string;
}

export interface TrialSearchFilters {
  query: string;
  condition: string;
  location: string;
  phase: string;
  status: string;
  maxDistance: number; // km
  page: number;
  pageSize: number;
}

export interface Notification {
  id: string;
  type: 'new_match' | 'trial_update' | 'enrollment_reminder' | 'general';
  title: string;
  titleHi: string;
  body: string;
  bodyHi: string;
  trialId?: string;
  read: boolean;
  createdAt: string;
}

export interface TrialState {
  // Search
  searchResults: ClinicalTrial[];
  searchFilters: TrialSearchFilters;
  searchTotal: number;
  isSearching: boolean;

  // Detail
  selectedTrial: ClinicalTrial | null;
  isLoadingDetail: boolean;
  isLoadingMore: boolean;

  // Matches
  matches: TrialMatch[];
  isLoadingMatches: boolean;
  matchesTotal: number;

  // Notifications
  notifications: Notification[];
  unreadCount: number;
  isLoadingNotifications: boolean;

  // Error
  error: string | null;

  // Actions
  searchTrials: (filters?: Partial<TrialSearchFilters>) => Promise<void>;
  loadMoreResults: () => Promise<void>;
  getTrialDetail: (trialId: string) => Promise<void>;
  checkEligibility: (trialId: string) => Promise<TrialEligibility | null>;
  fetchMatches: () => Promise<void>;
  saveMatch: (matchId: string) => Promise<void>;
  dismissMatch: (matchId: string) => Promise<void>;
  fetchNotifications: () => Promise<void>;
  markNotificationRead: (notificationId: string) => Promise<void>;
  updateSearchFilters: (filters: Partial<TrialSearchFilters>) => void;
  clearSearch: () => void;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Default filters
// ---------------------------------------------------------------------------

const DEFAULT_FILTERS: TrialSearchFilters = {
  query: '',
  condition: '',
  location: '',
  phase: '',
  status: 'recruiting',
  maxDistance: 100,
  page: 1,
  pageSize: 20,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTrialStore = create<TrialState>((set, get) => ({
  // Initial state
  searchResults: [],
  searchFilters: { ...DEFAULT_FILTERS },
  searchTotal: 0,
  isSearching: false,

  selectedTrial: null,
  isLoadingDetail: false,
  isLoadingMore: false,

  matches: [],
  isLoadingMatches: false,
  matchesTotal: 0,

  notifications: [],
  unreadCount: 0,
  isLoadingNotifications: false,

  error: null,

  // ------------------------------------------------------------------
  // Search trials
  // ------------------------------------------------------------------
  searchTrials: async (filters?: Partial<TrialSearchFilters>) => {
    const currentFilters = get().searchFilters;
    const mergedFilters = {
      ...currentFilters,
      ...filters,
      page: filters?.page ?? 1,
    };

    set({
      isSearching: true,
      error: null,
      searchFilters: mergedFilters,
    });

    try {
      const { data } = await apiClient.get(API_CONFIG.ENDPOINTS.TRIALS_SEARCH, {
        params: {
          q: mergedFilters.query || undefined,
          condition: mergedFilters.condition || undefined,
          location: mergedFilters.location || undefined,
          phase: mergedFilters.phase || undefined,
          status: mergedFilters.status || undefined,
          max_distance: mergedFilters.maxDistance,
          page: mergedFilters.page,
          page_size: mergedFilters.pageSize,
        },
      });

      const trials = Array.isArray(data.trials) ? data.trials : [];
      const total = typeof data.total === 'number' ? data.total : 0;

      set({
        searchResults: mergedFilters.page === 1 ? trials : [...get().searchResults, ...trials],
        searchTotal: total,
        isSearching: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'खोज विफल। कृपया पुनः प्रयास करें। / Search failed. Please try again.';
      set({ error: message, isSearching: false });
    }
  },

  // ------------------------------------------------------------------
  // Load more search results (pagination)
  // ------------------------------------------------------------------
  loadMoreResults: async () => {
    const { searchFilters, searchResults, searchTotal, isSearching, isLoadingMore } = get();
    if (isSearching || isLoadingMore || searchResults.length >= searchTotal) return;

    set({ isLoadingMore: true });
    try {
      await get().searchTrials({ page: searchFilters.page + 1 });
    } finally {
      set({ isLoadingMore: false });
    }
  },

  // ------------------------------------------------------------------
  // Get trial detail
  // ------------------------------------------------------------------
  getTrialDetail: async (trialId: string) => {
    set({ isLoadingDetail: true, error: null, selectedTrial: null });

    try {
      const { data } = await apiClient.get(API_CONFIG.ENDPOINTS.TRIALS_DETAIL(trialId));
      set({ selectedTrial: data.trial ?? data, isLoadingDetail: false });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'विवरण लोड करने में विफल। / Failed to load trial details.';
      set({ error: message, isLoadingDetail: false });
    }
  },

  // ------------------------------------------------------------------
  // Check eligibility for a trial
  // ------------------------------------------------------------------
  checkEligibility: async (trialId: string): Promise<TrialEligibility | null> => {
    try {
      const { data } = await apiClient.get(API_CONFIG.ENDPOINTS.TRIALS_ELIGIBILITY(trialId));
      return data.eligibility ?? data;
    } catch {
      return null;
    }
  },

  // ------------------------------------------------------------------
  // Fetch patient's matches
  // ------------------------------------------------------------------
  fetchMatches: async () => {
    set({ isLoadingMatches: true, error: null });

    try {
      const { data } = await apiClient.get(API_CONFIG.ENDPOINTS.MATCHES);
      const matches: TrialMatch[] = Array.isArray(data.matches) ? data.matches : [];
      set({
        matches,
        matchesTotal: typeof data.total === 'number' ? data.total : matches.length,
        isLoadingMatches: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ??
        err.message ??
        'मैच लोड करने में विफल। / Failed to load matches.';
      set({ error: message, isLoadingMatches: false });
    }
  },

  // ------------------------------------------------------------------
  // Save a match
  // ------------------------------------------------------------------
  saveMatch: async (matchId: string) => {
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.MATCHES_SAVE(matchId));
      set({
        matches: get().matches.map((m) =>
          m.id === matchId ? { ...m, saved: true } : m,
        ),
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ?? err.message ?? 'Save failed.';
      set({ error: message });
    }
  },

  // ------------------------------------------------------------------
  // Dismiss a match
  // ------------------------------------------------------------------
  dismissMatch: async (matchId: string) => {
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.MATCHES_DISMISS(matchId));
      set({
        matches: get().matches.map((m) =>
          m.id === matchId ? { ...m, dismissed: true } : m,
        ),
      });
    } catch (err: any) {
      const message =
        err.response?.data?.message ?? err.message ?? 'Dismiss failed.';
      set({ error: message });
    }
  },

  // ------------------------------------------------------------------
  // Fetch notifications
  // ------------------------------------------------------------------
  fetchNotifications: async () => {
    set({ isLoadingNotifications: true, error: null });

    try {
      const { data } = await apiClient.get(API_CONFIG.ENDPOINTS.NOTIFICATIONS);
      const notifications: Notification[] = data.notifications ?? [];
      const unreadCount = notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount, isLoadingNotifications: false, error: null });
    } catch (err: any) {
      set({
        isLoadingNotifications: false,
        error: err.response?.data?.message ?? err.message ?? 'Failed to load notifications.',
      });
    }
  },

  // ------------------------------------------------------------------
  // Mark notification as read
  // ------------------------------------------------------------------
  markNotificationRead: async (notificationId: string) => {
    try {
      await apiClient.post(API_CONFIG.ENDPOINTS.NOTIFICATIONS_READ(notificationId));
      const updated = get().notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      );
      set({
        notifications: updated,
        unreadCount: updated.filter((n) => !n.read).length,
      });
    } catch {
      // Non-critical -- silently ignore
    }
  },

  // ------------------------------------------------------------------
  // Setters / helpers
  // ------------------------------------------------------------------
  updateSearchFilters: (filters: Partial<TrialSearchFilters>) => {
    set({ searchFilters: { ...get().searchFilters, ...filters } });
  },

  clearSearch: () => {
    set({
      searchResults: [],
      searchFilters: { ...DEFAULT_FILTERS },
      searchTotal: 0,
      error: null,
    });
  },

  clearError: () => set({ error: null }),
}));

// Register cleanup callback with authStore to break circular dependency
setTrialCleanupCallback(() => {
  const state = useTrialStore.getState();
  state.clearSearch();
  useTrialStore.setState({
    matches: [],
    matchesTotal: 0,
    notifications: [],
    unreadCount: 0,
    selectedTrial: null,
    error: null,
  });
});
