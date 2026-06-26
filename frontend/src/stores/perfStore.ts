import { create } from 'zustand';

// Live performance metrics reported by the particle worker. Kept separate from
// the settings store so frequent updates don't re-render settings consumers.
interface PerfState {
  workerActive: boolean; // true while the WebGL particle worker is the renderer
  workerFps: number;
  workerFrameMs: number; // average render time per frame in the last window
  particleCount: number;
  setWorkerStats: (s: { fps: number; frameMs: number; count: number }) => void;
  clearWorker: () => void;
}

export const usePerfStore = create<PerfState>((set) => ({
  workerActive: false,
  workerFps: 0,
  workerFrameMs: 0,
  particleCount: 0,
  setWorkerStats: ({ fps, frameMs, count }) =>
    set({ workerActive: true, workerFps: fps, workerFrameMs: frameMs, particleCount: count }),
  clearWorker: () => set({ workerActive: false, workerFps: 0, workerFrameMs: 0, particleCount: 0 }),
}));
