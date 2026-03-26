import { useEffect } from 'react';

interface AudioStreamProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  streamUrl: string;
  onReconnect: () => void;
}

export function AudioStream({ audioRef, streamUrl, onReconnect }: AudioStreamProps) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleError = () => {
      console.log('[audio] stream error, reconnecting in 2s...');
      setTimeout(onReconnect, 2000);
    };

    audio.addEventListener('error', handleError);
    return () => audio.removeEventListener('error', handleError);
  }, [audioRef, onReconnect]);

  return (
    <audio
      ref={audioRef}
      src={streamUrl}
      autoPlay
      style={{ display: 'none' }}
    />
  );
}
