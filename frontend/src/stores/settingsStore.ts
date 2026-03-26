import { create } from 'zustand';

interface SettingsState {
  maxTracksPerUser: number;
  setMaxTracksPerUser: (n: number) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  maxTracksPerUser: 3,
  setMaxTracksPerUser: (n) => set({ maxTracksPerUser: n }),
}));
