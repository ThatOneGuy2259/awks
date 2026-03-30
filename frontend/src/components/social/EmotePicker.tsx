import { useState, useEffect, useRef } from 'react';
import { EmoteFetcher, EmoteParser } from '@mkody/twitch-emoticons';
import './emotes.css';

interface Emote {
  id: string;
  code: string;
  link: string;
  animated: boolean;
  provider: 'twitch' | 'bttv' | 'ffz' | '7tv';
}

interface EmotePickerProps {
  onEmoteSelect: (emoteCode: string) => void;
  onClose: () => void;
}

export function EmotePicker({ onEmoteSelect, onClose }: EmotePickerProps) {
  const [emotes, setEmotes] = useState<Emote[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef<EmoteFetcher | null>(null);
  const parserRef = useRef<EmoteParser | null>(null);

  useEffect(() => {
    const initializeEmotes = async () => {
      try {
        // Initialize fetcher without Twitch credentials (using only third-party emotes)
        const fetcher = new EmoteFetcher({
          forceStatic: false,
          twitchThemeMode: 'dark'
        });
        fetcherRef.current = fetcher;

        // Popular Twitch channel IDs for more emotes
        // These are well-known channels with lots of emotes
        const popularChannelIds = [
          44317909,  // xQc
          129955881, // Kai Cenat
          51257523,  // Pokimane
          4664781,   // Myth
          138864227, // Adin Ross
          19614509,  // NICKMERCS
          18991531,  // TimTheTatman
          15188617,  // Lirik
          36029255,  // Summit1g
          22484632   // Shroud
        ];

        // Fetch global emotes from each platform (undefined for global emotes)
        await Promise.all([
          fetcher.fetchBTTVEmotes(undefined),
          fetcher.fetchFFZEmotes(undefined),
          fetcher.fetchSevenTVEmotes(undefined, { format: 'webp' })
        ]);

        // Fetch emotes from popular channels for more variety
        const channelPromises = popularChannelIds.map(channelId =>
          Promise.all([
            fetcher.fetchBTTVEmotes(channelId).catch(() => {}),
            fetcher.fetchFFZEmotes(channelId).catch(() => {}),
            fetcher.fetchSevenTVEmotes(channelId, { format: 'webp' }).catch(() => {})
          ])
        );
        
        await Promise.all(channelPromises);

        // Convert to our Emote format
        const allEmotes: Emote[] = [];
        fetcher.emotes.forEach((emote) => {
          allEmotes.push({
            id: emote.id,
            code: emote.code,
            link: emote.toLink(),
            animated: (emote as unknown as { animated?: boolean }).animated || false,
            provider: emote.type as 'twitch' | 'bttv' | 'ffz' | '7tv'
          });
        });

        setEmotes(allEmotes);

        // Initialize parser for later use
        parserRef.current = new EmoteParser(fetcher, {
          type: 'html',
          template: `<img alt="{name}" title="{name}" class="inline-emote" src="{link}" />`
        });
      } catch (error) {
        console.error('Failed to load emotes:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeEmotes();
  }, []);

  const filteredEmotes = emotes.filter(emote => {
    const matchesSearch = emote.code.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const handleEmoteClick = (emote: Emote) => {
    onEmoteSelect(emote.code);
    onClose();
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 bg-surface-container-high rounded-lg shadow-2xl border border-outline-variant/20 w-80 max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-on-surface">
            Emotes 
            {!loading && <span className="text-xs text-on-surface-variant ml-2">({emotes.length})</span>}
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-highest transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-outline-variant/10 shrink-0">
        <input
          type="text"
          placeholder="Search emotes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-surface-container rounded-md border border-outline-variant/20 focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant"
        />
      </div>

      {/* Emotes Grid */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
            <p className="text-sm text-on-surface-variant">Loading emotes from popular streams...</p>
          </div>
        ) : filteredEmotes.length === 0 ? (
          <p className="text-center text-on-surface-variant text-sm py-4">
            {search ? 'No emotes found' : 'No emotes available'}
          </p>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {filteredEmotes.map((emote) => (
              <button
                key={`${emote.provider}-${emote.id}`}
                onClick={() => handleEmoteClick(emote)}
                className="aspect-square bg-surface-container rounded hover:bg-surface-container-highest transition-colors p-1 flex items-center justify-center group relative"
                title={emote.code}
              >
                <img
                  src={emote.link}
                  alt={emote.code}
                  className={`max-w-full max-h-full object-contain ${emote.animated ? 'animate-pulse' : ''}`}
                />
                <div className="absolute inset-x-0 -bottom-6 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-container-high rounded px-1 py-0.5 pointer-events-none">
                  <p className="text-xs text-on-surface truncate">{emote.code}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
