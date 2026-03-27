import { useState, useEffect, useCallback } from 'react';
import { onWsMessage, offWsMessage } from '../../hooks/useWebSocket';

interface FloatingEmoji {
  id: number;
  emoji: string;
  x: number;
}

let nextId = 0;

export function ReactionOverlay() {
  const [emojis, setEmojis] = useState<FloatingEmoji[]>([]);

  const handleReaction = useCallback((data: unknown) => {
    const { emoji } = data as { emoji: string };
    const id = nextId++;
    const x = 10 + Math.random() * 80;
    setEmojis((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => {
      setEmojis((prev) => prev.filter((e) => e.id !== id));
    }, 2000);
  }, []);

  useEffect(() => {
    onWsMessage('REACTION', handleReaction);
    return () => offWsMessage('REACTION', handleReaction);
  }, [handleReaction]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {emojis.map((e) => (
        <span
          key={e.id}
          className="absolute text-3xl animate-float-up"
          style={{ left: `${e.x}%`, bottom: '0%' }}
        >
          {e.emoji}
        </span>
      ))}
    </div>
  );
}
