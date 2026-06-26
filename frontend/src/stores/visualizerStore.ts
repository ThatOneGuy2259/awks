import { create } from 'zustand';

export type VisualizerOrientation = 'normal' | 'flipped';
export type VisualizerMode = 'bars' | 'oscilloscope';
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

/** A saved snapshot of the whole visual look — shareable via export string. */
export interface VizPreset {
  id: string;
  name: string;
  mode: VisualizerMode;
  vizGains: number[];
  mirrored: boolean;
  orientation: VisualizerOrientation;
  backgroundEffect: BackgroundEffect;
  backgroundIntensity: number;
  beatReactivity: number;
  trails: boolean;
  hueDrift: boolean;
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

  // Visualizer mode (what the spectrum canvas draws)
  visualizerMode: VisualizerMode;
  setVisualizerMode: (v: VisualizerMode) => void;

  // Reactivity / motion
  beatReactivity: number; // 0..1 — scales the beat-pulse effect
  trails: boolean;        // motion-blur ghost trails
  hueDrift: boolean;      // slow color rotation even on steady audio
  setBeatReactivity: (v: number) => void;
  setTrails: (v: boolean) => void;
  setHueDrift: (v: boolean) => void;

  // Background effect
  backgroundEffect: BackgroundEffect;
  backgroundIntensity: number; // 0.0 to 2.0, default 1.0
  setBackgroundEffect: (v: BackgroundEffect) => void;
  setBackgroundIntensity: (v: number) => void;

  // Mini visualizer in the player bar
  miniViz: boolean;
  setMiniViz: (v: boolean) => void;

  // Accessibility / performance
  reduceVisuals: boolean; // honor low-power / reduced-motion: calmer, cheaper
  setReduceVisuals: (v: boolean) => void;

  // Performance HUD overlay (FPS / particle stats)
  perfHud: boolean;
  setPerfHud: (v: boolean) => void;

  // Visualizer Studio panel open state (persisted so it stays put across refresh)
  studioOpen: boolean;
  setStudioOpen: (v: boolean) => void;

  // Presets
  presets: VizPreset[];
  savePreset: (name: string) => void;
  applyPreset: (id: string) => void;
  deletePreset: (id: string) => void;
  exportPreset: (id: string) => string;
  importPreset: (encoded: string) => boolean;
}

const STORAGE_KEY = 'awks-visualizer';
const PRESETS_KEY = 'awks-viz-presets';
const DEFAULT_GAINS = Array(BAND_COUNT).fill(1.0) as number[];

interface PersistedState {
  audioGains?: number[];
  vizGains?: number[];
  mirrored?: boolean;
  orientation?: VisualizerOrientation;
  visualizerMode?: VisualizerMode;
  beatReactivity?: number;
  trails?: boolean;
  hueDrift?: boolean;
  backgroundEffect?: BackgroundEffect;
  backgroundIntensity?: number;
  miniViz?: boolean;
  reduceVisuals?: boolean;
  perfHud?: boolean;
  studioOpen?: boolean;
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

function loadPresets(): VizPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function savePresets(presets: VizPreset[]) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {}
}

type Persisted = Omit<PersistedState, 'bandGains'>;

function persistAll(state: Persisted) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

function getPersistedSnapshot(get: () => VisualizerState): Persisted {
  const s = get();
  return {
    audioGains: s.audioGains,
    vizGains: s.vizGains,
    mirrored: s.mirrored,
    orientation: s.orientation,
    visualizerMode: s.visualizerMode,
    beatReactivity: s.beatReactivity,
    trails: s.trails,
    hueDrift: s.hueDrift,
    backgroundEffect: s.backgroundEffect,
    backgroundIntensity: s.backgroundIntensity,
    miniViz: s.miniViz,
    reduceVisuals: s.reduceVisuals,
    perfHud: s.perfHud,
    studioOpen: s.studioOpen,
  };
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
  visualizerMode: saved.visualizerMode ?? 'bars',
  beatReactivity: typeof saved.beatReactivity === 'number' ? saved.beatReactivity : 1.0,
  trails: saved.trails ?? false,
  hueDrift: saved.hueDrift ?? false,
  backgroundEffect: saved.backgroundEffect ?? 'none',
  backgroundIntensity: saved.backgroundIntensity ?? 1.0,
  miniViz: saved.miniViz ?? true,
  reduceVisuals: saved.reduceVisuals ?? false,
  perfHud: saved.perfHud ?? false,
  studioOpen: saved.studioOpen ?? false,
  presets: loadPresets(),

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
  setVisualizerMode: (v) => { set({ visualizerMode: v }); persistAll({ ...getPersistedSnapshot(get), visualizerMode: v }); },
  setBeatReactivity: (v) => { set({ beatReactivity: v }); persistAll({ ...getPersistedSnapshot(get), beatReactivity: v }); },
  setTrails: (v) => { set({ trails: v }); persistAll({ ...getPersistedSnapshot(get), trails: v }); },
  setHueDrift: (v) => { set({ hueDrift: v }); persistAll({ ...getPersistedSnapshot(get), hueDrift: v }); },
  setBackgroundEffect: (v) => { set({ backgroundEffect: v }); persistAll({ ...getPersistedSnapshot(get), backgroundEffect: v }); },
  setBackgroundIntensity: (v) => { set({ backgroundIntensity: v }); persistAll({ ...getPersistedSnapshot(get), backgroundIntensity: v }); },
  setMiniViz: (v) => { set({ miniViz: v }); persistAll({ ...getPersistedSnapshot(get), miniViz: v }); },
  setReduceVisuals: (v) => { set({ reduceVisuals: v }); persistAll({ ...getPersistedSnapshot(get), reduceVisuals: v }); },
  setPerfHud: (v) => { set({ perfHud: v }); persistAll({ ...getPersistedSnapshot(get), perfHud: v }); },
  setStudioOpen: (v) => { set({ studioOpen: v }); persistAll({ ...getPersistedSnapshot(get), studioOpen: v }); },

  savePreset: (name) => {
    const s = get();
    const preset: VizPreset = {
      id: `preset_${Date.now()}`,
      name: name.trim() || 'Preset',
      mode: s.visualizerMode,
      vizGains: [...s.vizGains],
      mirrored: s.mirrored,
      orientation: s.orientation,
      backgroundEffect: s.backgroundEffect,
      backgroundIntensity: s.backgroundIntensity,
      beatReactivity: s.beatReactivity,
      trails: s.trails,
      hueDrift: s.hueDrift,
    };
    const presets = [...get().presets, preset];
    set({ presets });
    savePresets(presets);
  },

  applyPreset: (id) => {
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return;
    const patch = {
      visualizerMode: preset.mode,
      vizGains: validateGains(preset.vizGains) ? [...preset.vizGains] : get().vizGains,
      mirrored: preset.mirrored,
      orientation: preset.orientation,
      backgroundEffect: preset.backgroundEffect,
      backgroundIntensity: preset.backgroundIntensity,
      beatReactivity: preset.beatReactivity,
      trails: preset.trails,
      hueDrift: preset.hueDrift,
    };
    set(patch);
    persistAll({ ...getPersistedSnapshot(get), ...patch });
  },

  deletePreset: (id) => {
    const presets = get().presets.filter((p) => p.id !== id);
    set({ presets });
    savePresets(presets);
  },

  exportPreset: (id) => {
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return '';
    // Strip the local id — importer mints a fresh one.
    const { id: _omit, ...shareable } = preset;
    void _omit;
    return btoa(JSON.stringify({ type: 'viz-preset', preset: shareable }));
  },

  importPreset: (encoded) => {
    try {
      const data = JSON.parse(atob(encoded.trim()));
      const p = data?.preset;
      if (!p || typeof p.name !== 'string' || !validateGains(p.vizGains)) return false;
      const preset: VizPreset = {
        id: `preset_${Date.now()}`,
        name: p.name,
        mode: p.mode === 'oscilloscope' ? 'oscilloscope' : 'bars',
        vizGains: [...p.vizGains],
        mirrored: !!p.mirrored,
        orientation: p.orientation === 'flipped' ? 'flipped' : 'normal',
        backgroundEffect: p.backgroundEffect ?? 'none',
        backgroundIntensity: typeof p.backgroundIntensity === 'number' ? p.backgroundIntensity : 1.0,
        beatReactivity: typeof p.beatReactivity === 'number' ? p.beatReactivity : 1.0,
        trails: !!p.trails,
        hueDrift: !!p.hueDrift,
      };
      const presets = [...get().presets, preset];
      set({ presets });
      savePresets(presets);
      return true;
    } catch { return false; }
  },
}));
