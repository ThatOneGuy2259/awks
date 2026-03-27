import { create } from 'zustand';

export type VisualizerOrientation = 'normal' | 'flipped';

export const EQ_BANDS = [
  { label: 'Sub', range: '0-60Hz' },
  { label: 'Bass', range: '60-250Hz' },
  { label: 'Low', range: '250-500Hz' },
  { label: 'Mid', range: '500Hz-2k' },
  { label: 'Upper', range: '2-4kHz' },
  { label: 'Pres', range: '4-6kHz' },
  { label: 'Brill', range: '6-10kHz' },
  { label: 'Air', range: '10kHz+' },
] as const;

export const BAND_COUNT = EQ_BANDS.length;

interface VisualizerState {
  bandGains: number[];            // per-band gain, 0.0 to 2.0, default 1.0
  mirrored: boolean;
  orientation: VisualizerOrientation;
  setBandGain: (band: number, gain: number) => void;
  resetBandGains: () => void;
  setMirrored: (v: boolean) => void;
  setOrientation: (v: VisualizerOrientation) => void;
  exportEQ: () => string;
  importEQ: (encoded: string) => boolean;
}

const STORAGE_KEY = 'awks-visualizer';
const DEFAULT_GAINS = Array(BAND_COUNT).fill(1.0) as number[];

function loadState(): Partial<{ bandGains: number[]; mirrored: boolean; orientation: VisualizerOrientation }> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persist(state: { bandGains: number[]; mirrored: boolean; orientation: VisualizerOrientation }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full
  }
}

const saved = loadState();

export const useVisualizerStore = create<VisualizerState>((set, get) => ({
  bandGains: (saved.bandGains && saved.bandGains.length === BAND_COUNT) ? saved.bandGains : [...DEFAULT_GAINS],
  mirrored: saved.mirrored ?? true,
  orientation: saved.orientation ?? 'normal',

  setBandGain: (band, gain) => {
    const bandGains = [...get().bandGains];
    bandGains[band] = gain;
    set({ bandGains });
    persist({ ...get(), bandGains });
  },

  resetBandGains: () => {
    const bandGains = [...DEFAULT_GAINS];
    set({ bandGains });
    persist({ ...get(), bandGains });
  },

  setMirrored: (v) => { set({ mirrored: v }); persist({ ...get(), mirrored: v }); },
  setOrientation: (v) => { set({ orientation: v }); persist({ ...get(), orientation: v }); },

  exportEQ: () => {
    const { bandGains, mirrored, orientation } = get();
    return btoa(JSON.stringify({ bandGains, mirrored, orientation }));
  },

  importEQ: (encoded) => {
    try {
      const json = atob(encoded.trim());
      const data = JSON.parse(json);
      if (!data.bandGains || !Array.isArray(data.bandGains) || data.bandGains.length !== BAND_COUNT) return false;
      if (!data.bandGains.every((g: unknown) => typeof g === 'number' && g >= 0 && g <= 2)) return false;
      const bandGains = data.bandGains as number[];
      const mirrored = typeof data.mirrored === 'boolean' ? data.mirrored : get().mirrored;
      const orientation = (data.orientation === 'normal' || data.orientation === 'flipped') ? data.orientation : get().orientation;
      set({ bandGains, mirrored, orientation });
      persist({ bandGains, mirrored, orientation });
      return true;
    } catch {
      return false;
    }
  },
}));
