import { create } from 'zustand';
import { useListenerStore } from './listenerStore';

interface SkipVoteState {
  votes: number;
  fixedRequired: number;
  skipMode: string;
  skipPercent: number;
  votedByMe: boolean;
  setVotes: (votes: number) => void;
  setFixedRequired: (n: number) => void;
  setSkipMode: (mode: string) => void;
  setSkipPercent: (pct: number) => void;
  setVotedByMe: (v: boolean) => void;
  reset: () => void;
  getVotesRequired: () => number;
}

export const useSkipVoteStore = create<SkipVoteState>((set, get) => ({
  votes: 0,
  fixedRequired: 5,
  skipMode: 'fixed',
  skipPercent: 50,
  votedByMe: false,
  setVotes: (votes) => set({ votes }),
  setFixedRequired: (n) => set({ fixedRequired: n }),
  setSkipMode: (mode) => set({ skipMode: mode }),
  setSkipPercent: (pct) => set({ skipPercent: pct }),
  setVotedByMe: (v) => set({ votedByMe: v }),
  reset: () => set({ votes: 0, votedByMe: false }),
  getVotesRequired: () => {
    const { skipMode, fixedRequired, skipPercent } = get();
    if (skipMode === 'percent') {
      const listeners = useListenerStore.getState().count;
      if (listeners <= 0) return 1;
      return Math.max(1, Math.ceil(listeners * skipPercent / 100));
    }
    return fixedRequired;
  },
}));
