import { useRef, useCallback, useState, useEffect } from 'react';

const STREAM_URL = (import.meta.env.VITE_API_URL || '') + '/api/stream';

export function useAudioStream() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    return saved ? parseInt(saved) : 70;
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume / 100;
  }, [volume]);

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  const reconnect = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = '';
    audio.src = STREAM_URL;
    audio.load();
    audio.play().catch(() => {});
  }, []);

  return { audioRef, volume, setVolume, reconnect, streamUrl: STREAM_URL };
}
