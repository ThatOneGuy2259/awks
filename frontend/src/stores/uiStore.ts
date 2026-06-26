import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
}

const STORAGE_KEY = 'awks-ui';

function loadCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw).sidebarCollapsed === true : false;
  } catch {
    return false;
  }
}

function persistCollapsed(sidebarCollapsed: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sidebarCollapsed }));
  } catch {}
}

export const useUIStore = create<UIState>((set) => ({
  // Restore the collapsed state so a closed sidebar stays closed across refresh.
  sidebarCollapsed: loadCollapsed(),
  toggleSidebar: () =>
    set((s) => {
      const sidebarCollapsed = !s.sidebarCollapsed;
      persistCollapsed(sidebarCollapsed);
      return { sidebarCollapsed };
    }),
  setSidebarCollapsed: (v) => {
    persistCollapsed(v);
    set({ sidebarCollapsed: v });
  },
}));
