import { create } from 'zustand';

// Status of the WebRTC audio stream (separate from the WebSocket control plane).
//   connecting — establishing the peer connection / waiting for the track
//   playing    — audio is flowing
//   blocked    — stream is ready but the browser blocked autoplay; needs a user gesture
//   error      — repeated ICE failures; reconnecting in the background
export type AudioStatus = 'connecting' | 'playing' | 'blocked' | 'error';

interface AudioState {
  status: AudioStatus;
  setStatus: (status: AudioStatus) => void;
}

export const useAudioStore = create<AudioState>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
}));
