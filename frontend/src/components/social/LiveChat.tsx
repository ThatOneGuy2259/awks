import { useState, useRef, useEffect, Suspense } from 'react';
import { useChatStore } from '../../stores/chatStore';
import { lazyWithRetry } from '../../lib/lazyWithRetry';
import { useEmoteParser } from './useEmoteParser';

// Both pickers are click-triggered and pull in heavy libraries
// (emoji-picker-react, and EmotePicker's emote data), so they load on demand.
const EmojiPickerPanel = lazyWithRetry(() => import('./EmojiPickerPanel'));
const EmotePicker = lazyWithRetry(() => import('./EmotePicker').then(m => ({ default: m.EmotePicker })));

interface LiveChatProps {
  onSend: (text: string) => void;
}

export function LiveChat({ onSend }: LiveChatProps) {
  const messages = useChatStore((s) => s.messages);
  const [input, setInput] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showEmotes, setShowEmotes] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const emoteRef = useRef<HTMLDivElement>(null);
  const { parseMessage } = useEmoteParser();

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

  useEffect(() => {
    if (!showEmotes) return;
    const handleClick = (e: MouseEvent) => {
      if (emoteRef.current && !emoteRef.current.contains(e.target as Node)) {
        setShowEmotes(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showEmotes]);

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
            <div className="w-8 h-8 rounded-full bg-primary-container/20 shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold text-primary">
              {msg.user.avatar_url ? (
                <img className="w-full h-full object-cover" src={msg.user.avatar_url} alt={msg.user.username} loading="lazy" />
              ) : (
                msg.user.username.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <p className="text-[10px] text-primary font-bold mb-1">@{msg.user.username}</p>
              <p 
                className="text-sm text-on-surface-variant bg-surface-container-high p-3 rounded-tr-xl rounded-bl-xl rounded-br-xl"
                dangerouslySetInnerHTML={{ __html: parseMessage(msg.text) }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-surface-container relative">
        {showEmoji && (
          <div ref={emojiRef} className="fixed bottom-20 right-4 z-50">
            <Suspense fallback={<div className="w-[320px] h-[350px] flex items-center justify-center bg-surface-container-high rounded-lg"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
              <EmojiPickerPanel
                onSelect={(emoji) => { setInput((prev) => prev + emoji); setShowEmoji(false); }}
              />
            </Suspense>
          </div>
        )}
        {showEmotes && (
          <div ref={emoteRef}>
            <Suspense fallback={<div className="py-4 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div>}>
              <EmotePicker
                onEmoteSelect={(emoteCode) => setInput((prev) => prev + ' ' + emoteCode + ' ')}
                onClose={() => setShowEmotes(false)}
              />
            </Suspense>
          </div>
        )}
        <div className="relative">
          <input
            className="w-full bg-surface-container-low border-none rounded-full py-3 pl-4 pr-32 text-sm focus:ring-1 focus:ring-primary/50 outline-none text-on-surface placeholder:text-on-surface-variant"
            placeholder="Say something..."
            value={input}
            maxLength={500}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <button
              onClick={() => {
                setShowEmoji(false);
                setShowEmotes(!showEmotes);
              }}
              className="text-on-surface-variant p-1 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
              title="Twitch Emotes"
            >
              <span className="material-symbols-outlined text-lg">face</span>
            </button>
            <button
              onClick={() => {
                setShowEmotes(false);
                setShowEmoji(!showEmoji);
              }}
              className="text-on-surface-variant p-1 hover:text-primary hover:bg-primary/10 rounded-full transition-colors"
              title="Emoji"
            >
              <span className="material-symbols-outlined text-lg">mood</span>
            </button>
            <button
              onClick={handleSend}
              className="text-primary p-1 hover:bg-primary/10 rounded-full transition-colors"
            >
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
