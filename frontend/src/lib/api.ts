const API_URL = import.meta.env.VITE_API_URL || '';

let getTokenFn: (() => Promise<string | null>) | null = null;

export function setGetTokenFn(fn: () => Promise<string | null>) {
  getTokenFn = fn;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getTokenFn ? await getTokenFn() : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  syncMe: () => request<UserProfile>('/api/me', { method: 'POST' }),
  getQueue: () => request<QueueTrack[]>('/api/queue'),
  addToQueue: (youtube_url: string) =>
    request<QueueTrack>('/api/queue', { method: 'POST', body: JSON.stringify({ youtube_url }) }),
  deleteFromQueue: (id: string) => request<void>(`/api/queue/${id}`, { method: 'DELETE' }),
  castSkipVote: (id: string) => request<void>(`/api/queue/${id}/skip-vote`, { method: 'POST' }),
  retractSkipVote: (id: string) => request<void>(`/api/queue/${id}/skip-vote`, { method: 'DELETE' }),
  getPlayback: () => request<PlaybackState>('/api/playback'),
  getHistory: (limit = 20, offset = 0) =>
    request<HistoryEntry[]>(`/api/history?limit=${limit}&offset=${offset}`),
  getListeners: () => request<ListenersResponse>('/api/listeners'),
  search: (q: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  suggest: (q: string, signal?: AbortSignal) =>
    request<string[]>(`/api/suggest?q=${encodeURIComponent(q)}`, { signal }),
  trendingTags: () => request<{ tags: string[] }>('/api/trending-tags'),

  // Admin
  getSettings: () => request<Record<string, string>>('/api/settings'),
  updateSettings: (settings: Record<string, string>) =>
    request<void>('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  moveToTop: (id: string) => request<void>(`/api/admin/queue/${id}/move-to-top`, { method: 'POST' }),
  timeoutUser: (userId: string, minutes: number, reason?: string) =>
    request<void>(`/api/admin/users/${userId}/timeout`, {
      method: 'POST',
      body: JSON.stringify({ minutes, reason }),
    }),
  removeTimeout: (userId: string) =>
    request<void>(`/api/admin/users/${userId}/timeout`, { method: 'DELETE' }),
  getTimeout: (userId: string) =>
    request<{ timed_out: boolean; expires_at?: string; reason?: string }>(
      `/api/admin/users/${userId}/timeout`
    ),
  deleteHistoryEntry: (id: string) =>
    request<void>(`/api/admin/history/${id}`, { method: 'DELETE' }),
  clearHistory: () =>
    request<void>('/api/admin/history', { method: 'DELETE' }),
};

// Types
export interface UserProfile {
  id: string;
  username: string;
  avatar_url: string;
  role: string;
}

export interface QueueTrack {
  id: string;
  youtube_url: string;
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
  requested_by: string;
  requester_name: string;
  requester_avatar: string;
  position: number;
  status: string;
  created_at: string;
}

export interface PlaybackState {
  queue_id: string;
  video_id: string;
  title: string;
  artist: string;
  thumbnail_url: string;
  started_at: string;
  duration_sec: number;
  requested_by: string;
  playing?: boolean;
}

export interface HistoryEntry {
  id: string;
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  requested_by: string;
  requester_name: string;
  played_at: string;
  skipped: boolean;
}

export interface SearchResult {
  video_id: string;
  title: string;
  artist: string;
  duration_sec: number;
  thumbnail_url: string;
}

export interface Listener {
  id: string;
  username: string;
  avatar_url: string;
}

export interface ListenersResponse {
  count: number;
  listeners: Listener[];
}
