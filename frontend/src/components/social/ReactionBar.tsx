import { useRef } from 'react';
import { wsSend } from '../../hooks/useWebSocket';

const EMOJIS = ['🔥', '❤️', '😂', '💀', '🗑️'];

export function ReactionBar() {
  const lastSent = useRef(0);

  const handleReaction = (emoji: string) => {
    const now = Date.now();
    if (now - lastSent.current < 500) return;
    lastSent.current = now;
    wsSend('REACTION', { emoji });
  };

  return (
    <div className="flex items-center gap-2">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => handleReaction(emoji)}
          className="w-10 h-10 rounded-full bg-surface-container-high hover:bg-white/10 flex items-center justify-center text-lg transition-all hover:scale-110 active:scale-95"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
