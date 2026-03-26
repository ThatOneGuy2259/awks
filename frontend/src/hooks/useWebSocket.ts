import { useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { usePlaybackStore } from '../stores/playbackStore';
import { useQueueStore } from '../stores/queueStore';
import { useSkipVoteStore } from '../stores/skipVoteStore';
import { useListenerStore } from '../stores/listenerStore';
import { useChatStore } from '../stores/chatStore';
import { api } from '../lib/api';

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.host}/ws`;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const { userId } = useAuth();
  const { user } = useUser();

  const username = user?.username || user?.firstName || userId?.slice(0, 8) || 'anon';
  const avatarUrl = user?.imageUrl || '';

  const connect = useCallback(() => {
    const params = new URLSearchParams({
      user_id: userId || '',
      username,
      avatar_url: avatarUrl,
    });
    const ws = new WebSocket(`${WS_URL}?${params.toString()}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] connected');
      // Fetch initial state
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
          useSkipVoteStore.getState().setVotesRequired(Number(settings.skip_votes_required));
        }
      }).catch(() => {});
      api.getListeners().then((data) => {
        useListenerStore.getState().setListeners(data.count, data.listeners);
      }).catch(() => {});
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch {}
    };

    ws.onclose = () => {
      console.log('[WS] disconnected, reconnecting...');
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => ws.close();
  }, [userId, username, avatarUrl]);

  useEffect(() => {
    if (!userId) return;
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, userId]);

  const sendMessage = useCallback((type: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  return { sendMessage };
}

function handleMessage(msg: { type: string; data: unknown }) {
  const { type, data } = msg;

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
      // Refetch queue
      api.getQueue().then((tracks) => useQueueStore.getState().setTracks(tracks)).catch(() => {});
      break;
    }
    case 'SYNC': {
      // SYNC messages are still received for future use but audio
      // playback is now server-driven via the stream endpoint.
      break;
    }
    case 'QUEUE_UPDATE': {
      api.getQueue().then((tracks) => useQueueStore.getState().setTracks(tracks)).catch(() => {});
      break;
    }
    case 'SKIP_VOTE_UPDATE': {
      const d = data as { queue_id: string; votes: number; votes_required: number };
      useSkipVoteStore.getState().setVotes(d.votes);
      useSkipVoteStore.getState().setVotesRequired(d.votes_required);
      break;
    }
    case 'TRACK_SKIPPED': {
      break;
    }
    case 'LISTENER_UPDATE': {
      const d = data as { count: number; listeners: Array<{ id: string; username: string; avatar_url: string }> };
      useListenerStore.getState().setListeners(d.count, d.listeners);
      break;
    }
    case 'SETTINGS_UPDATE': {
      const d = data as { skip_votes_required: number };
      useSkipVoteStore.getState().setVotesRequired(d.skip_votes_required);
      break;
    }
    case 'CHAT_MESSAGE': {
      const d = data as { user: { id: string; username: string; avatar_url: string }; text: string; timestamp: string };
      useChatStore.getState().addMessage(d);
      break;
    }
  }
}
