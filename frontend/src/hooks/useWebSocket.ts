import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { usePlaybackStore } from '../stores/playbackStore';
import { useQueueStore } from '../stores/queueStore';
import { useSkipVoteStore } from '../stores/skipVoteStore';
import { useListenerStore } from '../stores/listenerStore';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useConnectionStore } from '../stores/connectionStore';
import { api } from '../lib/api';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}/ws`;

// Module-level singleton — only one connection ever exists
let ws: WebSocket | null = null;
let getTokenFn: (() => Promise<string | null>) | null = null;
let pendingMessages: string[] = [];
let reconnectDelay = 2000; // exponential backoff starting point

type MessageCallback = (data: unknown) => void;
const messageCallbacks: Map<string, Set<MessageCallback>> = new Map();

/** Register a callback for a specific message type. Multiple listeners supported. */
export function onWsMessage(type: string, callback: MessageCallback) {
  if (!messageCallbacks.has(type)) {
    messageCallbacks.set(type, new Set());
  }
  messageCallbacks.get(type)!.add(callback);
}

/** Unregister a specific callback for a message type. */
export function offWsMessage(type: string, callback?: MessageCallback) {
  if (!callback) {
    messageCallbacks.delete(type);
  } else {
    const set = messageCallbacks.get(type);
    if (set) {
      set.delete(callback);
      if (set.size === 0) messageCallbacks.delete(type);
    }
  }
}

function connectWs(token: string) {
  // Prevent duplicate connections
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  useConnectionStore.getState().setStatus('connecting');
  const socket = new WebSocket(WS_URL);
  ws = socket;

  socket.onopen = () => {
    console.log('[WS] connected, authenticating...');
    // Send auth token as first message instead of in query string
    socket.send(JSON.stringify({ type: 'AUTH', data: { token } }));
    reconnectDelay = 2000; // reset backoff on successful connection
    useConnectionStore.getState().setStatus('connected');
    // Flush any messages queued before the socket was ready
    for (const msg of pendingMessages) {
      socket.send(msg);
    }
    pendingMessages = [];
    Promise.all([
      api.getQueue().catch(() => null),
      api.getPlayback().catch(() => null),
      api.getSettings().catch(() => null),
      api.getListeners().catch(() => null),
    ]).then(([tracks, state, settings, listeners]) => {
      if (tracks) useQueueStore.getState().setTracks(tracks);
      if (state && state.video_id) {
        usePlaybackStore.getState().setTrack({
          queueId: state.queue_id,
          videoId: state.video_id,
          title: state.title,
          artist: state.artist,
          thumbnail: state.thumbnail_url,
          requestedBy: state.requested_by,
          requesterName: state.requester_name || '',
          requesterAvatar: state.requester_avatar || '',
          startedAt: state.started_at,
          durationSec: state.duration_sec,
        });
      }
      if (settings) {
        if (settings.skip_votes_required) useSkipVoteStore.getState().setFixedRequired(Number(settings.skip_votes_required));
        if (settings.skip_mode) useSkipVoteStore.getState().setSkipMode(settings.skip_mode);
        if (settings.skip_percent) useSkipVoteStore.getState().setSkipPercent(Number(settings.skip_percent));
        if (settings.max_tracks_per_user) useSettingsStore.getState().setMaxTracksPerUser(Number(settings.max_tracks_per_user));
      }
      if (listeners) useListenerStore.getState().setListeners(listeners.count, listeners.listeners);
    });
  };

  socket.onmessage = (event) => {
    try {
      handleMessage(JSON.parse(event.data));
    } catch {}
  };

  socket.onclose = () => {
    console.log(`[WS] disconnected, reconnecting in ${reconnectDelay / 1000}s...`);
    ws = null;
    useConnectionStore.getState().setStatus('disconnected');
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000); // cap at 60s
    setTimeout(() => {
      if (getTokenFn) {
        getTokenFn().then((freshToken) => {
          if (freshToken) connectWs(freshToken);
        });
      }
    }, delay);
  };

  socket.onerror = () => socket.close();
}

/** Send a message over the WebSocket. Queues if not yet connected. */
export function wsSend(type: string, data: unknown) {
  const msg = JSON.stringify({ type, data });
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(msg);
  } else {
    pendingMessages.push(msg);
  }
}

/**
 * Call this ONCE at the app root to establish the WebSocket connection.
 * Do NOT call from child components — use wsSend() directly instead.
 */
export function useWebSocket() {
  const { userId, getToken } = useAuth();

  useEffect(() => {
    if (!userId) return;
    getTokenFn = getToken;
    getToken().then((token) => {
      if (token) connectWs(token);
    });
  }, [userId, getToken]);
}

function handleMessage(msg: { type: string; data: unknown }) {
  const { type, data } = msg;

  // Dispatch to registered callbacks (in addition to the switch handler below)
  const cbs = messageCallbacks.get(type);
  if (cbs && cbs.size > 0) {
    cbs.forEach((cb) => cb(data));
  }

  switch (type) {
    case 'TRACK_CHANGE': {
      const d = data as {
        queue_id: string; video_id: string; title: string; artist: string;
        started_at: string; duration_sec: number; requested_by: string;
        requester_name?: string; requester_avatar?: string;
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
          requesterName: d.requester_name || '',
          requesterAvatar: d.requester_avatar || '',
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
