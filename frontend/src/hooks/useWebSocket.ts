import { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { usePlaybackStore } from '../stores/playbackStore';
import { useQueueStore } from '../stores/queueStore';
import { useSkipVoteStore } from '../stores/skipVoteStore';
import { useListenerStore } from '../stores/listenerStore';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { api } from '../lib/api';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}/ws`;

// Module-level singleton — only one connection ever exists
let ws: WebSocket | null = null;

type MessageCallback = (data: unknown) => void;
const messageCallbacks: Map<string, MessageCallback> = new Map();

/** Register a callback for a specific message type. Used by useWebRTC for signaling. */
export function onWsMessage(type: string, callback: MessageCallback) {
  messageCallbacks.set(type, callback);
}

/** Unregister a callback for a specific message type. */
export function offWsMessage(type: string) {
  messageCallbacks.delete(type);
}

function connectWs(userId: string, username: string, avatarUrl: string) {
  // Prevent duplicate connections
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  const params = new URLSearchParams({
    user_id: userId,
    username,
    avatar_url: avatarUrl,
  });
  const socket = new WebSocket(`${WS_URL}?${params.toString()}`);
  ws = socket;

  socket.onopen = () => {
    console.log('[WS] connected');
    api.getQueue().then((tracks) => useQueueStore.getState().setTracks(tracks)).catch(() => {});
    api.getPlayback().then((state) => {
      if (state && state.video_id) {
        usePlaybackStore.getState().setTrack({
          queueId: state.queue_id,
          videoId: state.video_id,
          title: state.title,
          artist: state.artist,
          thumbnail: state.thumbnail_url,
          requestedBy: state.requested_by,
          startedAt: state.started_at,
          durationSec: state.duration_sec,
        });
      }
    }).catch(() => {});
    api.getSettings().then((settings) => {
      if (settings.skip_votes_required) {
        useSkipVoteStore.getState().setFixedRequired(Number(settings.skip_votes_required));
      }
      if (settings.skip_mode) {
        useSkipVoteStore.getState().setSkipMode(settings.skip_mode);
      }
      if (settings.skip_percent) {
        useSkipVoteStore.getState().setSkipPercent(Number(settings.skip_percent));
      }
      if (settings.max_tracks_per_user) {
        useSettingsStore.getState().setMaxTracksPerUser(Number(settings.max_tracks_per_user));
      }
    }).catch(() => {});
    api.getListeners().then((data) => {
      useListenerStore.getState().setListeners(data.count, data.listeners);
    }).catch(() => {});
  };

  socket.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch {}
  };

  socket.onclose = () => {
    console.log('[WS] disconnected, reconnecting...');
    ws = null;
    setTimeout(() => connectWs(userId, username, avatarUrl), 2000);
  };

  socket.onerror = () => socket.close();
}

/** Send a message over the WebSocket. Can be called from anywhere. */
export function wsSend(type: string, data: unknown) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }));
  }
}

/**
 * Call this ONCE at the app root to establish the WebSocket connection.
 * Do NOT call from child components — use wsSend() directly instead.
 */
export function useWebSocket() {
  const { userId } = useAuth();
  const { user } = useUser();

  const firstName = user?.firstName || '';
  const lastName = user?.lastName || '';
  const username = firstName && lastName
    ? `${firstName.charAt(0)}. ${lastName}`
    : firstName || user?.username || userId?.slice(0, 8) || 'anon';
  const avatarUrl = user?.imageUrl || '';

  useEffect(() => {
    if (!userId) return;
    connectWs(userId, username, avatarUrl);
    // Do NOT close on unmount — singleton persists across StrictMode remounts
  }, [userId, username, avatarUrl]);
}

function handleMessage(msg: { type: string; data: unknown }) {
  const { type, data } = msg;

  // Dispatch to registered callbacks first
  const cb = messageCallbacks.get(type);
  if (cb) {
    cb(data);
    return;
  }

  switch (type) {
    case 'TRACK_CHANGE': {
      const d = data as {
        queue_id: string; video_id: string; title: string; artist: string;
        started_at: string; duration_sec: number; requested_by: string;
      };
      if (!d.video_id) {
        usePlaybackStore.getState().clear();
      } else {
        usePlaybackStore.getState().setTrack({
          queueId: d.queue_id,
          videoId: d.video_id,
          title: d.title,
          artist: d.artist,
          thumbnail: `https://img.youtube.com/vi/${d.video_id}/hqdefault.jpg`,
          requestedBy: d.requested_by,
          startedAt: d.started_at,
          durationSec: d.duration_sec,
        });
      }
      useSkipVoteStore.getState().reset();
      api.getQueue().then((tracks) => useQueueStore.getState().setTracks(tracks)).catch(() => {});
      break;
    }
    case 'SYNC':
      break;
    case 'QUEUE_UPDATE':
      api.getQueue().then((tracks) => useQueueStore.getState().setTracks(tracks)).catch(() => {});
      break;
    case 'SKIP_VOTE_UPDATE': {
      const d = data as { queue_id: string; votes: number; votes_required: number };
      useSkipVoteStore.getState().setVotes(d.votes);
      break;
    }
    case 'TRACK_SKIPPED':
      break;
    case 'LISTENER_UPDATE': {
      const d = data as { count: number; listeners: Array<{ id: string; username: string; avatar_url: string }> };
      useListenerStore.getState().setListeners(d.count, d.listeners);
      break;
    }
    case 'SETTINGS_UPDATE': {
      const d = data as { skip_votes_required: number; skip_mode: string; skip_percent: number; max_tracks_per_user: number };
      useSkipVoteStore.getState().setFixedRequired(d.skip_votes_required);
      if (d.skip_mode) useSkipVoteStore.getState().setSkipMode(d.skip_mode);
      if (d.skip_percent) useSkipVoteStore.getState().setSkipPercent(d.skip_percent);
      if (d.max_tracks_per_user) useSettingsStore.getState().setMaxTracksPerUser(d.max_tracks_per_user);
      break;
    }
    case 'CHAT_MESSAGE': {
      const d = data as { user: { id: string; username: string; avatar_url: string }; text: string; timestamp: string };
      useChatStore.getState().addMessage(d);
      break;
    }
  }
}
