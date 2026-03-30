import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/chatStore';
import EmojiPicker, { Theme, type EmojiClickData } from 'emoji-picker-react';

interface LiveChatProps {
  onSend: (text: string) => void;
}

export function LiveChat({ onSend }: LiveChatProps) {
  const messages = useChatStore((s) => s.messages);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!showEmoji) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmoji]);

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
                <img className="w-full h-full object-cover" src={msg.user.avatar_url} alt={msg.user.username} loading="lazy" />
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

      <div className="p-4 bg-surface-container relative">
        {showEmoji && (
          <div ref={emojiRef} className="absolute bottom-full right-4 mb-2 z-50">
            <EmojiPicker
              theme={Theme.DARK}
              onEmojiClick={(emojiData: EmojiClickData) => { setInput((prev) => prev + emojiData.emoji); setShowEmoji(false); }}
              height={300}
              width={280}
              previewConfig={{ showPreview: false }}
              style={{ '--epr-emoji-size': '20px', '--epr-emoji-padding': '4px', '--epr-category-navigation-button-size': '18px' } as React.CSSProperties}
            />
          </div>
        )}
        <div className="relative">
          <input
            className="w-full bg-surface-container-low border-none rounded-full py-3 pl-4 pr-24 text-sm focus:ring-1 focus:ring-primary/50 outline-none text-on-surface placeholder:text-on-surface-variant"
            placeholder="Say something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className="text-on-surface-variant p-1.5 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-xl">mood</span>
            </button>
            <button
              onClick={handleSend}
              className="text-primary p-1.5 hover:bg-primary/10 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
