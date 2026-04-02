import { useEffect, useRef } from 'react';
import { EmoteFetcher, EmoteParser } from '@mkody/twitch-emoticons';

// Hook to parse emotes in messages
export function useEmoteParser() {
  const parserRef = useRef<EmoteParser | null>(null);
  const fallbackEmotes = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const initializeParser = async () => {
      try {
        const fetcher = new EmoteFetcher({
          forceStatic: false,
          twitchThemeMode: 'dark'
        });

        // Popular Twitch channel IDs for more emotes
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

        // Channels that have BTTV/FFZ emotes (others 404)
        const bttvFfzChannelIds = [
          44317909,  // xQc
          51257523,  // Pokimane
          36029255,  // Summit1g
          22484632   // Shroud
        ];

        // Fetch global emotes from each platform
        await Promise.all([
          fetcher.fetchBTTVEmotes(undefined).catch(() => {}),
          fetcher.fetchFFZEmotes(undefined).catch(() => {}),
          fetcher.fetchSevenTVEmotes(undefined, { format: 'webp' }).catch(() => {})
        ]);

        // Fetch per-channel emotes: 7TV for all, BTTV/FFZ only for channels that have them
        const channelPromises = [
          ...popularChannelIds.map(channelId =>
            fetcher.fetchSevenTVEmotes(channelId, { format: 'webp' }).catch(() => {})
          ),
          ...bttvFfzChannelIds.map(channelId =>
            Promise.all([
              fetcher.fetchBTTVEmotes(channelId).catch(() => {}),
              fetcher.fetchFFZEmotes(channelId).catch(() => {}),
            ])
          ),
        ];

        await Promise.all(channelPromises);

        parserRef.current = new EmoteParser(fetcher, {
          type: 'html',
          template: `<img alt="{name}" title="{name}" class="inline-emote" src="{link}" style="display: inline-block; vertical-align: middle; height: 1.6em; margin: 0 2px;" />`
        });
      } catch (error) {
        console.error('Failed to initialize emote parser:', error);
        
        // Set up fallback emotes for parsing
        fallbackEmotes.current.set('Pepega', 'https://cdn.betterttv.net/emote/5849c9a4f52fbdd5ac2e4c2c/3x');
        fallbackEmotes.current.set('Pog', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef2d/3x');
        fallbackEmotes.current.set('KEKW', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef36/3x');
        fallbackEmotes.current.set('Sadge', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef31/3x');
        fallbackEmotes.current.set('MonkaS', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef32/3x');
        fallbackEmotes.current.set('LULW', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef37/3x');
        fallbackEmotes.current.set('OMEGALUL', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef38/3x');
        fallbackEmotes.current.set('PepeLaugh', 'https://cdn.betterttv.net/emote/566ca92365dbbdab32ec053a/3x');
        fallbackEmotes.current.set('PepeHands', 'https://cdn.betterttv.net/emote/5e76233d1344a4562ec642de/3x');
        fallbackEmotes.current.set('Kappa', 'https://static-cdn.jtvnw.net/emoticons/v1/25/3.0');
      }
    };

    initializeParser();
  }, []);

  const parseMessage = (text: string): string => {
    // Try parser first if available
    if (parserRef.current) {
      try {
        return parserRef.current.parse(text);
      } catch (error) {
        console.warn('Library parser failed, using fallback:', error);
      }
    }
    
    // Fallback to manual parsing
    if (fallbackEmotes.current.size === 0) return text;
    
    try {
      const words = text.split(' ');
      const parsedWords = words.map(word => {
        const emoteUrl = fallbackEmotes.current.get(word);
        if (emoteUrl) {
          return `<img alt="${word}" title="${word}" class="inline-emote" src="${emoteUrl}" style="display: inline-block; vertical-align: middle; height: 1.6em; margin: 0 2px;" />`;
        }
        return word;
      });
      
      return parsedWords.join(' ');
    } catch (error) {
      console.error('Failed to parse emotes:', error);
      return text;
    }
  };

  return { parseMessage };
}
