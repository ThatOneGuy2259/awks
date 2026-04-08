import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { wsSend } from '../../hooks/useWebSocket';
import { useDraggablePanel } from './hooks/useDraggablePanel';

interface EnhancementsPanelProps {
  open: boolean;
  onClose: () => void;
}

export function EnhancementsPanel({ open, onClose }: EnhancementsPanelProps) {
  const messages = useChatStore((s) => s.messages);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { position, handleMouseDown } = useDraggablePanel({
    x: Math.max(window.innerWidth - 360, 24),
    y: Math.max(window.innerHeight - 400, 80),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  if (!open) return null;

  const handleSend = () => {
    if (!input.trim()) return;
    wsSend('CHAT_SEND', { text: input.trim() });
    setInput('');
  };

  return (
    <div className="wmp-enhancements" style={{ left: position.x, top: position.y }}>
      <div className="wmp-enhancements__title-bar" onMouseDown={handleMouseDown}>
        <span className="wmp-enhancements__title">Enhancements: Live Chat</span>
        <button type="button" className="wmp-enhancements__close" onClick={onClose} onMouseDown={(e) => e.stopPropagation()}>×</button>
      </div>
      <div className="wmp-enhancements__body">
        <div ref={scrollRef} className="wmp-enhancements__messages">
          {messages.length === 0 ? (
            <div className="wmp-enhancements__empty">No messages yet.</div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className="wmp-enhancements__message">
                <span className="wmp-enhancements__user">{msg.user.username}:</span>
                <span className="wmp-enhancements__text">{msg.text}</span>
              </div>
            ))
          )}
        </div>
        <div className="wmp-enhancements__input-row">
          <input
            className="wmp-enhancements__input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type a message..."
            maxLength={500}
          />
          <button type="button" className="wmp-enhancements__send" onClick={handleSend}>Send</button>
        </div>
      </div>
    </div>
  );
}
