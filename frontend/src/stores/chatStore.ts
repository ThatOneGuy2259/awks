import { create } from 'zustand';

export interface ChatMessage {
  user: { id: string; username: string; avatar_url: string };
  text: string;
  timestamp: string;
}

interface ChatState {
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages.slice(-200), msg],
    })),
}));
