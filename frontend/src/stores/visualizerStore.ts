import { create } from 'zustand';

export type VisualizerOrientation = 'normal' | 'flipped';
export type BackgroundEffect = 'none' | 'color-pulse' | 'gradient-wave' | 'ambient-blobs' | 'particles';

export const EQ_BANDS = [
  { label: 'Sub', range: '0-60Hz', frequency: 32, type: 'lowshelf' as BiquadFilterType },
  { label: 'Bass', range: '60-250Hz', frequency: 125, type: 'peaking' as BiquadFilterType },
  { label: 'Low', range: '250-500Hz', frequency: 375, type: 'peaking' as BiquadFilterType },
  { label: 'Mid', range: '500Hz-2k', frequency: 1000, type: 'peaking' as BiquadFilterType },
  { label: 'Upper', range: '2-4kHz', frequency: 3000, type: 'peaking' as BiquadFilterType },
  { label: 'Pres', range: '4-6kHz', frequency: 5000, type: 'peaking' as BiquadFilterType },
  { label: 'Brill', range: '6-10kHz', frequency: 8000, type: 'peaking' as BiquadFilterType },
  { label: 'Air', range: '10kHz+', frequency: 14000, type: 'highshelf' as BiquadFilterType },
] as const;

export const BAND_COUNT = EQ_BANDS.length;

/** Convert slider value (0-2) to dB gain (-12 to +12). 1.0 = 0dB (flat). */
export function sliderToDb(value: number): number {
  return (value - 1.0) * 12;
}

interface VisualizerState {
  // Audio EQ — affects actual sound output
  audioGains: number[];
  setAudioGain: (band: number, gain: number) => void;
  resetAudioGains: () => void;
  exportAudioEQ: () => string;
  importAudioEQ: (encoded: string) => boolean;

  // Visualizer sensitivity — affects visual display only
  vizGains: number[];
  setVizGain: (band: number, gain: number) => void;
  resetVizGains: () => void;
  exportVizEQ: () => string;
  importVizEQ: (encoded: string) => boolean;

  // Visualizer layout
  mirrored: boolean;
  orientation: VisualizerOrientation;
  setMirrored: (v: boolean) => void;
  setOrientation: (v: VisualizerOrientation) => void;

  // Background effect
  backgroundEffect: BackgroundEffect;
  backgroundIntensity: number; // 0.0 to 1.0, default 0.7
  setBackgroundEffect: (v: BackgroundEffect) => void;
  setBackgroundIntensity: (v: number) => void;

  // Performance HUD overlay (FPS / particle stats)
  perfHud: boolean;
  setPerfHud: (v: boolean) => void;
}

const STORAGE_KEY = 'awks-visualizer';
const DEFAULT_GAINS = Array(BAND_COUNT).fill(1.0) as number[];

interface PersistedState {
  audioGains?: number[];
  vizGains?: number[];
  mirrored?: boolean;
  orientation?: VisualizerOrientation;
  backgroundEffect?: BackgroundEffect;
  backgroundIntensity?: number;
  perfHud?: boolean;
  // legacy field
  bandGains?: number[];
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function persistAll(state: { audioGains: number[]; vizGains: number[]; mirrored: boolean; orientation: VisualizerOrientation; backgroundEffect: BackgroundEffect; backgroundIntensity: number; perfHud: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function getPersistedSnapshot(get: () => VisualizerState) {
  const { audioGains, vizGains, mirrored, orientation, backgroundEffect, backgroundIntensity, perfHud } = get();
  return { audioGains, vizGains, mirrored, orientation, backgroundEffect, backgroundIntensity, perfHud };
}

const saved = loadState();

function validateGains(arr: unknown): arr is number[] {
  return Array.isArray(arr) && arr.length === BAND_COUNT && arr.every((g) => typeof g === 'number' && g >= 0 && g <= 2);
}

// Migrate legacy: if bandGains exists but audioGains doesn't, use bandGains for both
const initialAudio = validateGains(saved.audioGains) ? saved.audioGains : validateGains(saved.bandGains) ? saved.bandGains : [...DEFAULT_GAINS];
const initialViz = validateGains(saved.vizGains) ? saved.vizGains : [...DEFAULT_GAINS];

export const useVisualizerStore = create<VisualizerState>((set, get) => ({
  audioGains: initialAudio,
  vizGains: initialViz,
  mirrored: saved.mirrored ?? true,
  orientation: saved.orientation ?? 'normal',
  backgroundEffect: saved.backgroundEffect ?? 'none',
  backgroundIntensity: saved.backgroundIntensity ?? 1.0,
  perfHud: saved.perfHud ?? false,

  setAudioGain: (band, gain) => {
    const audioGains = [...get().audioGains];
    audioGains[band] = gain;
    set({ audioGains });
    persistAll({ ...getPersistedSnapshot(get), audioGains });
  },

  resetAudioGains: () => {
    const audioGains = [...DEFAULT_GAINS];
    set({ audioGains });
    persistAll({ ...getPersistedSnapshot(get), audioGains });
  },

  exportAudioEQ: () => btoa(JSON.stringify({ type: 'audio-eq', gains: get().audioGains })),

  importAudioEQ: (encoded) => {
    try {
      const data = JSON.parse(atob(encoded.trim()));
      if (!validateGains(data.gains)) return false;
      const audioGains = data.gains;
      set({ audioGains });
      persistAll({ ...getPersistedSnapshot(get), audioGains });
      return true;
    } catch { return false; }
  },

  setVizGain: (band, gain) => {
    const vizGains = [...get().vizGains];
    vizGains[band] = gain;
    set({ vizGains });
    persistAll({ ...getPersistedSnapshot(get), vizGains });
  },

  resetVizGains: () => {
    const vizGains = [...DEFAULT_GAINS];
    set({ vizGains });
    persistAll({ ...getPersistedSnapshot(get), vizGains });
  },

  exportVizEQ: () => btoa(JSON.stringify({ type: 'viz-eq', gains: get().vizGains, mirrored: get().mirrored, orientation: get().orientation })),

  importVizEQ: (encoded) => {
    try {
      const data = JSON.parse(atob(encoded.trim()));
      if (!validateGains(data.gains)) return false;
      const vizGains = data.gains;
      const mirrored = typeof data.mirrored === 'boolean' ? data.mirrored : get().mirrored;
      const orientation = (data.orientation === 'normal' || data.orientation === 'flipped') ? data.orientation : get().orientation;
      set({ vizGains, mirrored, orientation });
      persistAll({ ...getPersistedSnapshot(get), vizGains, mirrored, orientation });
      return true;
    } catch { return false; }
  },

  setMirrored: (v) => { set({ mirrored: v }); persistAll({ ...getPersistedSnapshot(get), mirrored: v }); },
  setOrientation: (v) => { set({ orientation: v }); persistAll({ ...getPersistedSnapshot(get), orientation: v }); },
  setBackgroundEffect: (v) => { set({ backgroundEffect: v }); persistAll({ ...getPersistedSnapshot(get), backgroundEffect: v }); },
  setBackgroundIntensity: (v) => { set({ backgroundIntensity: v }); persistAll({ ...getPersistedSnapshot(get), backgroundIntensity: v }); },
  setPerfHud: (v) => { set({ perfHud: v }); persistAll({ ...getPersistedSnapshot(get), perfHud: v }); },
}));
