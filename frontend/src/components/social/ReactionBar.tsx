import { useRef, useState, useEffect, useCallback } from 'react';
import { wsSend, onWsMessage, offWsMessage } from '../../hooks/useWebSocket';
import { usePlaybackStore } from '../../stores/playbackStore';

const EMOJIS = ['🔥', '❤️', '😂', '💀', '🗑️'];

export function ReactionBar() {
  const lastSent = useRef(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const trackId = usePlaybackStore((s) => s.currentTrack?.queueId);

  // Reset counts when track changes
  useEffect(() => {
    setCounts({});
  }, [trackId]);

  // Listen for incoming reactions from all users
  const handleIncoming = useCallback((data: unknown) => {
    const { emoji } = data as { emoji: string };
    setCounts((prev) => ({ ...prev, [emoji]: (prev[emoji] || 0) + 1 }));
  }, []);

  useEffect(() => {
    onWsMessage('REACTION', handleIncoming);
    return () => offWsMessage('REACTION', handleIncoming);
  }, [handleIncoming]);

  const handleReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastSent.current < 500) return;
    lastSent.current = now;
    wsSend('REACTION', { emoji });
  };

  return (
    <div className="flex items-center gap-2">
      {EMOJIS.map((emoji) => {
        const count = counts[emoji] || 0;
        return (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            className={`h-10 rounded-full flex items-center justify-center text-lg transition-all hover:scale-110 active:scale-95 ${
              count > 0
                ? 'bg-surface-container-high px-3 gap-1.5'
                : 'bg-surface-container-high w-10'
            }`}
          >
            <span>{emoji}</span>
            {count > 0 && (
              <span className="text-xs font-bold text-on-surface-variant">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
