import { useState, useEffect } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';

export function usePlaybackSync() {
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!currentTrack) {
      setElapsed(0);
      return;
    }

    const updateElapsed = () => {
      const startMs = new Date(currentTrack.startedAt).getTime();
      const now = Date.now();
      setElapsed(Math.min((now - startMs) / 1000, currentTrack.durationSec));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [currentTrack]);

  return { elapsed, duration: currentTrack?.durationSec ?? 0 };
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
