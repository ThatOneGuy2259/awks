import { create } from 'zustand';

interface SkipVoteState {
  votes: number;
  votesRequired: number;
  votedByMe: boolean;
  setVotes: (votes: number) => void;
  setVotesRequired: (n: number) => void;
  setVotedByMe: (v: boolean) => void;
  reset: () => void;
}

export const useSkipVoteStore = create<SkipVoteState>((set) => ({
  votes: 0,
  votesRequired: 5,
  votedByMe: false,
  setVotes: (votes) => set({ votes }),
  setVotesRequired: (n) => set({ votesRequired: n }),
  setVotedByMe: (v) => set({ votedByMe: v }),
  reset: () => set({ votes: 0, votedByMe: false }),
}));
