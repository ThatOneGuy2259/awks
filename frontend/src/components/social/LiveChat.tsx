import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';

interface LiveChatProps {
  onSend: (text: string) => void;
}

export function LiveChat({ onSend }: LiveChatProps) {
  const messages = useChatStore((s) => s.messages);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <section className="bg-surface-container-low rounded-lg overflow-hidden flex flex-col h-[400px]">
      <div className="p-6 border-b border-outline-variant/10">
        <h3 className="font-bold text-lg font-headline">Live Chat</h3>
      </div>

      <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4">
        {messages.length === 0 && (
          <p className="text-on-surface-variant text-sm text-center py-8">No messages yet. Say something!</p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-container/20 flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-primary">
              {msg.user.avatar_url ? (
                <img className="w-full h-full object-cover" src={msg.user.avatar_url} alt={msg.user.username} />
              ) : (
                msg.user.username.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-[10px] text-primary font-bold mb-1">@{msg.user.username}</p>
              <p className="text-sm text-on-surface-variant bg-surface-container-high p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl">
                {msg.text}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-surface-container">
        <div className="relative">
          <input
            className="w-full bg-surface-container-low border-none rounded-full py-3 pl-4 pr-12 text-sm focus:ring-1 focus:ring-primary/50 outline-none text-on-surface placeholder:text-on-surface-variant"
            placeholder="Say something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-primary p-1.5 hover:bg-primary/10 rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">send</span>
          </button>
        </div>
      </div>
    </section>
  );
}
