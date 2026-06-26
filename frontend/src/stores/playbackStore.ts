import { create } from 'zustand';
import { setServerBpm } from '../lib/audioMetrics';

interface PlaybackState {
  currentTrack: {
    queueId: string;
    videoId: string;
    title: string;
    artist: string;
    thumbnail: string;
    requestedBy: string;
    requesterName: string;
    requesterAvatar: string;
    startedAt: string;
    durationSec: number;
    bpm?: number; // authoritative tempo from the server (0/undefined = unknown)
  } | null;
  isPlaying: boolean;
  setTrack: (track: PlaybackState['currentTrack']) => void;
  setPlaying: (playing: boolean) => void;
  clear: () => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  currentTrack: null,
  isPlaying: false,
  setTrack: (track) => {
    // Hand the server's tempo to the visualizer (0 falls back to the client estimate).
    setServerBpm(track?.bpm ?? 0);
    set({ currentTrack: track, isPlaying: !!track });
  },
  setPlaying: (playing) => set({ isPlaying: playing }),
  clear: () => {
    setServerBpm(0);
    set({ currentTrack: null, isPlaying: false });
  },
}));
