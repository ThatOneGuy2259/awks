import { useState, useCallback } from 'react';
import { api } from '../lib/api';
import { toast } from '../stores/toastStore';

export function useRequestTrack() {
  const [requesting, setRequesting] = useState(false);
  const [lastRequestedId, setLastRequestedId] = useState<string | null>(null);

  const request = useCallback(async (videoId: string) => {
    setRequesting(true);
    try {
      await api.addToQueue(`https://www.youtube.com/watch?v=${videoId}`);
      setLastRequestedId(videoId);
      return { ok: true as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to request';
      toast(message);
      return { ok: false as const, error: message };
    } finally {
      setRequesting(false);
    }
  }, []);

  return { request, requesting, lastRequestedId };
}
