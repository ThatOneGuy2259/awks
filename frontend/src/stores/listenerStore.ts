import { create } from 'zustand';
import type { Listener } from '../lib/api';

interface ListenerState {
  count: number;
  listeners: Listener[];
  setListeners: (count: number, listeners: Listener[]) => void;
}

export const useListenerStore = create<ListenerState>((set) => ({
  count: 0,
  listeners: [],
  setListeners: (count, listeners) => set({ count, listeners }),
}));
