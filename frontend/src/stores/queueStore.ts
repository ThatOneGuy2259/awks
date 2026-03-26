import { create } from 'zustand';
import type { QueueTrack } from '../lib/api';

interface QueueState {
  tracks: QueueTrack[];
  setTracks: (tracks: QueueTrack[]) => void;
}

export const useQueueStore = create<QueueState>((set) => ({
  tracks: [],
  setTracks: (tracks) => set({ tracks }),
}));
