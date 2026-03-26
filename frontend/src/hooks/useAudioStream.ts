import { useRef, useCallback, useState, useEffect } from 'react';

const STREAM_URL = import.meta.env.VITE_ICECAST_URL || `http://${window.location.hostname}:8001/stream`;

export function useAudioStream() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem('awks-volume');
    return saved ? parseInt(saved) : 70;
  });
  const [listening, setListening] = useState(false);

  // Auto-start the stream on mount
  useEffect(() => {
    const audio = new Audio(STREAM_URL + '?t=' + Date.now());
    audio.volume = volume / 100;
    audioRef.current = audio;

    audio.play().then(() => {
      setListening(true);
    }).catch(() => {
      // Autoplay blocked — wait for any user interaction then retry
      const tryPlay = () => {
        audio.src = STREAM_URL + '?t=' + Date.now();
        audio.play().then(() => {
          setListening(true);
          document.removeEventListener('click', tryPlay);
          document.removeEventListener('keydown', tryPlay);
        }).catch(() => {});
      };
      document.addEventListener('click', tryPlay);
      document.addEventListener('keydown', tryPlay);
    });

    audio.onerror = () => {
      console.log('[audio] stream error, reconnecting in 3s...');
      setTimeout(() => {
        audio.src = STREAM_URL + '?t=' + Date.now();
        audio.play().catch(() => {});
      }, 3000);
    };

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setVolume = useCallback((vol: number) => {
    setVolumeState(vol);
    localStorage.setItem('awks-volume', String(vol));
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
  }, []);

  return { volume, setVolume, listening };
}
