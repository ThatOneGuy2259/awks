import { useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { usePlaybackStore } from '../stores/playbackStore';
import { useQueueStore } from '../stores/queueStore';
import { useSkipVoteStore } from '../stores/skipVoteStore';
import { useListenerStore } from '../stores/listenerStore';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useUserStore } from '../stores/userStore';
import { toast } from '../stores/toastStore';
import { api } from '../lib/api';

const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_URL = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}/ws`;

// Module-level singleton — only one connection ever exists
let ws: WebSocket | null = null;
let getTokenFn: (() => Promise<string | null>) | null = null;
let pendingMessages: string[] = [];
let reconnectDelay = 2000; // exponential backoff starting point
// Paired /listen screen: connects to /ws/listen with its device key instead
// of a sign-in, and the server pushes the current track and queue.
let listenOnly = false;
let listenToken: string | null = null;
let onListenRejected: (() => void) | null = null;

const openCallbacks: Set<() => void> = new Set();

/** Run a callback every time the socket (re)opens. Returns an unsubscribe. */
export function onWsOpen(callback: () => void): () => void {
  openCallbacks.add(callback);
  return () => openCallbacks.delete(callback);
}

export function isWsOpen(): boolean {
  return ws?.readyState === WebSocket.OPEN;
}

/** Load the vote count and my vote for the playing track from the server. */
function syncSkipVote(queueId: string) {
  api.getSkipVote(queueId).then((v) => {
    // Ignore a response that lands after the track changed.
    if (usePlaybackStore.getState().currentTrack?.queueId !== queueId) return;
    useSkipVoteStore.getState().setVotes(v.votes);
    useSkipVoteStore.getState().setVotedByMe(v.voted_by_me);
  }).catch(() => {});
}

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

function connectWs(token: string | null) {
  // Prevent duplicate connections
  if (ws && ws.readyState <= WebSocket.OPEN) return;

  useConnectionStore.getState().setStatus('connecting');
  const socket = new WebSocket(listenOnly ? `${WS_URL}/listen` : WS_URL);
  ws = socket;

  socket.onopen = () => {
    if (listenOnly) {
      console.log('[WS] connected (listen-only)');
      socket.send(JSON.stringify({ type: 'LISTEN_AUTH', data: { token: listenToken } }));
      reconnectDelay = 2000;
      useConnectionStore.getState().setStatus('connected');
      openCallbacks.forEach((cb) => cb());
      return;
    }
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
    openCallbacks.forEach((cb) => cb());
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
          bpm: state.bpm,
        });
        syncSkipVote(state.queue_id);
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

  socket.onclose = (event) => {
    ws = null;
    // 1008 on /ws/listen: the device key was removed or never valid.
    // Reconnecting can't help, so hand back to the pairing screen.
    if (listenOnly && event.code === 1008) {
      console.log('[WS] listen key rejected');
      onListenRejected?.();
      return;
    }
    console.log(`[WS] disconnected, reconnecting in ${reconnectDelay / 1000}s...`);
    useConnectionStore.getState().setStatus('disconnected');
    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, 60000); // cap at 60s
    setTimeout(() => {
      if (listenOnly) {
        if (listenToken) connectWs(null);
      } else if (getTokenFn) {
        getTokenFn().then((freshToken) => {
          if (freshToken) connectWs(freshToken);
        });
      }
    }, delay);
  };

  socket.onerror = () => socket.close();
}

/**
 * Send a message over the WebSocket. Queues if not yet connected, except
 * WebRTC signaling: it belongs to one live peer connection, so a queued offer
 * would reach the server stale. useWebRTC reconnects on open instead.
 */
export function wsSend(type: string, data: unknown) {
  const msg = JSON.stringify({ type, data });
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(msg);
  } else if (!type.startsWith('WEBRTC_')) {
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

/**
 * The /listen page's connection: authenticates with the screen's device key
 * and receives playback messages only. onRejected runs if the key is refused.
 */
export function useListenWebSocket(token: string, onRejected: () => void) {
  useEffect(() => {
    listenOnly = true;
    listenToken = token;
    onListenRejected = onRejected;
    connectWs(null);
    return () => {
      listenToken = null;
      onListenRejected = null;
    };
  }, [token, onRejected]);
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
        requester_name?: string; requester_avatar?: string; bpm?: number;
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
          bpm: d.bpm,
        });
      }
      useSkipVoteStore.getState().reset();
      if (d.video_id && !listenOnly) syncSkipVote(d.queue_id);
      // The server follows every TRACK_CHANGE with a QUEUE_UPDATE carrying the queue.
      break;
    }
    case 'SYNC':
      break;
    case 'QUEUE_UPDATE':
      // The server sends the queue inline; refetch only if it couldn't load it.
      if (Array.isArray(data)) {
        useQueueStore.getState().setTracks(data);
      } else {
        api.getQueue().then((tracks) => useQueueStore.getState().setTracks(tracks)).catch(() => {});
      }
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
    case 'EXTRACTION_FAILED': {
      const d = data as { title: string; requested_by: string };
      if (d.requested_by && d.requested_by === useUserStore.getState().id) {
        toast(`Couldn't load "${d.title}", so it was removed from the queue.`);
      }
      break;
    }
    case 'CHAT_RATE_LIMITED':
      toast("You're sending messages too fast. Wait a moment.");
      break;
    case 'CHAT_MESSAGE': {
      const d = data as { user: { id: string; username: string; avatar_url: string }; text: string; timestamp: string };
      useChatStore.getState().addMessage(d);
      break;
    }
  }
}
