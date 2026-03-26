import { create } from 'zustand';

interface PlaybackState {
  currentTrack: {
    queueId: string;
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
    requestedBy: string;
    startedAt: string;
    durationSec: number;
  } | null;
  isPlaying: boolean;
  setTrack: (track: PlaybackState['currentTrack']) => void;
  setPlaying: (playing: boolean) => void;
  clear: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTrack: null,
  isPlaying: false,
  setTrack: (track) => set({ currentTrack: track, isPlaying: !!track }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  clear: () => set({ currentTrack: null, isPlaying: false }),
}));
