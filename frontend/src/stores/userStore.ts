import { create } from 'zustand';

interface UserState {
  id: string;
  username: string;
  avatarUrl: string;
  role: string;
  setUser: (user: { id: string; username: string; avatar_url: string; role: string }) => void;
  isAdmin: () => boolean;
}

export const useUserStore = create<UserState>((set, get) => ({
  id: '',
  username: '',
  avatarUrl: '',
  role: 'listener',
  setUser: (user) =>
    set({ id: user.id, username: user.username, avatarUrl: user.avatar_url, role: user.role }),
  isAdmin: () => get().role === 'admin',
}));
