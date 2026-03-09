'use client';

import { create } from 'zustand';

interface VoiceBotState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useVoiceBotStore = create<VoiceBotState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
