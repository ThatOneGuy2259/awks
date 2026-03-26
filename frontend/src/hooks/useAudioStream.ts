import { useRef, useCallback, useState, useEffect } from 'react';
import { usePlaybackStore } from '../stores/playbackStore';

const STREAM_URL = (import.meta.env.VITE_API_URL || '') + '/stream';

export function useAudioStream() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    return saved ? parseInt(saved) : 70;
  });
  const [listening, setListening] = useState(false);
  const hasTrack = usePlaybackStore((s) => !!s.currentTrack);

  // Connect to the Icecast stream only when there's a track playing
  useEffect(() => {
    if (!hasTrack) {
      // No track — stop any existing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      setListening(false);
      return;
    }

    // Track is playing — connect to Icecast stream
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.src = STREAM_URL;
    audio.volume = volume / 100;

    audio.play().then(() => {
      setListening(true);
    }).catch(() => {
      // Autoplay blocked — wait for user interaction
      const tryPlay = () => {
        audio.play().then(() => {
          setListening(true);
          document.removeEventListener('click', tryPlay);
          document.removeEventListener('keydown', tryPlay);
        }).catch(() => {});
      };
      document.addEventListener('click', tryPlay);
      document.addEventListener('keydown', tryPlay);
    });

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    audio.onerror = () => {
      // Only reconnect if there's still a track playing
      if (usePlaybackStore.getState().currentTrack) {
        reconnectTimeout = setTimeout(() => {
          audio.src = STREAM_URL;
          audio.play().catch(() => {});
        }, 3000);
      }
    };

    return () => {
      clearTimeout(reconnectTimeout);
      audio.onerror = null;
    };
  }, [hasTrack]); // eslint-disable-line react-hooks/exhaustive-deps

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  return { volume, setVolume, listening };
}
